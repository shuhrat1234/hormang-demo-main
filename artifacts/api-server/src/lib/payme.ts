import { and, eq, sql } from "drizzle-orm";
import {
  db,
  paymentOrdersTable,
  pricingTiersTable,
  walletsTable,
  tangaTransactionsTable,
  type PaymentOrder,
} from "@workspace/db";
import { getPaymeConfig, isPaymeConfigured, env } from "./env.js";

/**
 * Payme reserves -31050..-31099 for merchant-defined "account" errors (order
 * lookup / state problems). The rest are Payme's own documented codes.
 */
const PaymeErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InsufficientPrivilege: -32504,
  InvalidAmount: -31001,
  TransactionNotFound: -31003,
  UnableToPerform: -31008,
  OrderNotFound: -31050,
  OrderNotPending: -31051,
} as const;

class PaymeError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function rpcError(id: unknown, error: PaymeError) {
  return { jsonrpc: "2.0", id, error: { code: error.code, message: error.message } };
}

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

/** Builds the redirect URL for Payme's hosted checkout page (chek yaratish / GET redirect). */
export function buildPaymeCheckoutUrl(order: Pick<PaymentOrder, "id" | "amountSom">): string {
  const { merchantId, testEnv } = getPaymeConfig();
  const amountTiyin = order.amountSom * 100;
  const params = `m=${merchantId};ac.order_id=${order.id};a=${amountTiyin};c=${env.appBaseUrl}/wallet/return`;
  const encoded = Buffer.from(params, "utf-8").toString("base64");
  const host = testEnv ? "checkout.test.paycom.uz" : "checkout.paycom.uz";
  return `https://${host}/${encoded}`;
}

function verifyAuth(authHeader: string | undefined): boolean {
  if (!isPaymeConfigured()) return false;
  const { key, testKey, testEnv } = getPaymeConfig();
  if (!authHeader?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
  const [, providedKey] = decoded.split(":");
  return providedKey === key || (Boolean(testKey && testEnv) && providedKey === testKey);
}

async function findOrderByAccount(orderId: string): Promise<
  (PaymentOrder & { tierCredits: number; tierBonus: number }) | null
> {
  const [row] = await db
    .select({
      order: paymentOrdersTable,
      tierCredits: pricingTiersTable.credits,
      tierBonus: pricingTiersTable.bonusTokens,
    })
    .from(paymentOrdersTable)
    .innerJoin(pricingTiersTable, eq(paymentOrdersTable.tierId, pricingTiersTable.id))
    .where(and(eq(paymentOrdersTable.id, orderId), eq(paymentOrdersTable.provider, "payme")))
    .limit(1);
  if (!row) return null;
  return { ...row.order, tierCredits: row.tierCredits, tierBonus: row.tierBonus };
}

async function findOrderByTransactionId(transactionId: string): Promise<PaymentOrder | null> {
  const [order] = await db
    .select()
    .from(paymentOrdersTable)
    .where(eq(paymentOrdersTable.providerTransactionId, transactionId))
    .limit(1);
  return order ?? null;
}

/** Payme's transaction `state`: 1 = created, 2 = performed, -1 = cancelled (never performed), -2 = cancelled after performed. */
function stateOf(order: PaymentOrder): 1 | 2 | -1 | -2 {
  if (order.status === "paid") return 2;
  if (order.status === "cancelled" || order.status === "failed") {
    return order.performedAt ? -2 : -1;
  }
  return 1;
}

/**
 * Fiscal receipt line item for Payme's CheckPerformTransaction "detail" response field.
 * code/packageCode are Uzbekistan's official ИКПУ / unit-of-measure classifiers
 * (tasnif.soliq.uz) for Hormang's intermediary-service category.
 * TODO: confirm vatPercent against Hormang's actual VAT-payer registration status.
 */
const RECEIPT_CODE = "10716001001000000";
const RECEIPT_PACKAGE_CODE = "1495343";
// No turnover yet → not a registered VAT payer (below Uzbekistan's VAT threshold).
const RECEIPT_VAT_PERCENT = 0;

function buildReceiptDetail(title: string, amountTiyin: number) {
  return {
    receipt_type: 0,
    items: [
      {
        title,
        price: amountTiyin,
        count: 1,
        code: RECEIPT_CODE,
        package_code: RECEIPT_PACKAGE_CODE,
        vat_percent: RECEIPT_VAT_PERCENT,
      },
    ],
  };
}

async function checkPerformTransaction(params: { amount: number; account?: { order_id?: string } }) {
  const orderId = params.account?.order_id;
  if (!orderId) throw new PaymeError(PaymeErrorCode.OrderNotFound, "order_id talab qilinadi");

  const order = await findOrderByAccount(orderId);
  if (!order) throw new PaymeError(PaymeErrorCode.OrderNotFound, "Buyurtma topilmadi");
  if (order.status !== "pending") {
    throw new PaymeError(PaymeErrorCode.OrderNotPending, "Buyurtma allaqachon qayta ishlangan");
  }
  if (order.providerTransactionId) {
    // A transaction already exists against this order (CreateTransaction ran
    // for it, but it hasn't been performed/cancelled yet) — CheckPerformTransaction
    // takes no transaction id, so it can't tell "this is the same one re-checking"
    // from "a different one," and must refuse either way.
    throw new PaymeError(PaymeErrorCode.OrderNotPending, "Buyurtma boshqa tranzaksiya tomonidan band qilingan");
  }
  if (order.amountSom * 100 !== params.amount) {
    throw new PaymeError(PaymeErrorCode.InvalidAmount, "Noto'g'ri summa");
  }

  const [tier] = await db
    .select()
    .from(pricingTiersTable)
    .where(eq(pricingTiersTable.id, order.tierId))
    .limit(1);
  if (!tier) throw new PaymeError(PaymeErrorCode.OrderNotFound, "Tarif topilmadi");

  return { allow: true, detail: buildReceiptDetail(tier.nameUz, params.amount) };
}

async function createTransaction(params: {
  id: string;
  time: number;
  amount: number;
  account?: { order_id?: string };
}) {
  const orderId = params.account?.order_id;
  if (!orderId) throw new PaymeError(PaymeErrorCode.OrderNotFound, "order_id talab qilinadi");

  const order = await findOrderByAccount(orderId);
  if (!order) throw new PaymeError(PaymeErrorCode.OrderNotFound, "Buyurtma topilmadi");

  if (order.providerTransactionId === params.id) {
    // Idempotent retry of an already-created transaction.
    return { create_time: order.createdAt.getTime(), transaction: order.id, state: stateOf(order) };
  }

  if (order.providerTransactionId && order.providerTransactionId !== params.id) {
    // Payme's spec requires an error in the -31050..-31099 range here;
    // -31008 (UnableToPerform) is outside it, so reuse OrderNotPending.
    throw new PaymeError(PaymeErrorCode.OrderNotPending, "Buyurtma uchun boshqa tranzaksiya mavjud");
  }

  if (order.status !== "pending") {
    throw new PaymeError(PaymeErrorCode.OrderNotPending, "Buyurtma allaqachon qayta ishlangan");
  }
  if (order.amountSom * 100 !== params.amount) {
    throw new PaymeError(PaymeErrorCode.InvalidAmount, "Noto'g'ri summa");
  }

  const [updated] = await db
    .update(paymentOrdersTable)
    .set({ providerTransactionId: params.id, updatedAt: new Date() })
    .where(eq(paymentOrdersTable.id, order.id))
    .returning();

  return { create_time: updated.createdAt.getTime(), transaction: updated.id, state: 1 };
}

async function performTransaction(params: { id: string }) {
  const order = await findOrderByTransactionId(params.id);
  if (!order) throw new PaymeError(PaymeErrorCode.TransactionNotFound, "Tranzaksiya topilmadi");

  if (order.status === "paid") {
    // Idempotent retry — already performed.
    return { transaction: order.id, perform_time: order.performedAt!.getTime(), state: 2 };
  }
  if (order.status !== "pending") {
    throw new PaymeError(PaymeErrorCode.UnableToPerform, "Tranzaksiyani bajarib bo'lmaydi");
  }

  const performedAt = new Date();
  const updated = await db.transaction(async (tx) => {
    // S15: Atomically transition from pending to paid to prevent race conditions
    const [claimedOrder] = await tx
      .update(paymentOrdersTable)
      .set({ status: "paid", performedAt, updatedAt: new Date() })
      .where(and(eq(paymentOrdersTable.id, order.id), eq(paymentOrdersTable.status, "pending")))
      .returning();

    if (!claimedOrder) {
      throw new PaymeError(PaymeErrorCode.UnableToPerform, "Tranzaksiyani bajarib bo'lmaydi");
    }

    const [tier] = await tx
      .select()
      .from(pricingTiersTable)
      .where(eq(pricingTiersTable.id, order.tierId))
      .limit(1);
    if (!tier) throw new PaymeError(PaymeErrorCode.OrderNotFound, "Tarif topilmadi");

    const credited = tier.credits + tier.bonusTokens;

    const [existingWallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, order.userId))
      .limit(1);

    if (existingWallet) {
      await tx
        .update(walletsTable)
        .set({ balance: sql`${walletsTable.balance} + ${credited}`, updatedAt: new Date() })
        .where(eq(walletsTable.userId, order.userId));
    } else {
      await tx.insert(walletsTable).values({ userId: order.userId, balance: credited });
    }

    await tx.insert(tangaTransactionsTable).values({
      userId: order.userId,
      orderId: order.id,
      type: "purchase",
      direction: "in",
      amount: credited,
      priceSom: order.amountSom,
      description: `${tier.nameUz} — Payme orqali sotib olindi`,
    });

    return claimedOrder;
  });

  return { transaction: updated.id, perform_time: performedAt.getTime(), state: 2 };
}

async function cancelTransaction(params: { id: string; reason: number }) {
  const order = await findOrderByTransactionId(params.id);
  if (!order) throw new PaymeError(PaymeErrorCode.TransactionNotFound, "Tranzaksiya topilmadi");

  if (order.status === "cancelled" || order.status === "failed") {
    return { transaction: order.id, cancel_time: order.cancelledAt!.getTime(), state: stateOf(order) };
  }

  const cancelledAt = new Date();

  if (order.status === "pending") {
    const [updated] = await db
      .update(paymentOrdersTable)
      .set({ status: "cancelled", cancelledAt, cancelReason: params.reason, updatedAt: new Date() })
      .where(eq(paymentOrdersTable.id, order.id))
      .returning();
    return { transaction: updated.id, cancel_time: cancelledAt.getTime(), state: -1 };
  }

  // order.status === "paid" — reverse the wallet credit, if the balance is still available.
  const updated = await db.transaction(async (tx) => {
    const [tier] = await tx
      .select()
      .from(pricingTiersTable)
      .where(eq(pricingTiersTable.id, order.tierId))
      .limit(1);
    if (!tier) throw new PaymeError(PaymeErrorCode.OrderNotFound, "Tarif topilmadi");

    const credited = tier.credits + tier.bonusTokens;

    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, order.userId))
      .limit(1);

    if (!wallet || wallet.balance < credited) {
      throw new PaymeError(PaymeErrorCode.UnableToPerform, "Balansda mablag' yetarli emas, bekor qilib bo'lmaydi");
    }

    await tx
      .update(walletsTable)
      .set({ balance: wallet.balance - credited, updatedAt: new Date() })
      .where(eq(walletsTable.userId, order.userId));

    await tx.insert(tangaTransactionsTable).values({
      userId: order.userId,
      orderId: order.id,
      type: "refund",
      direction: "out",
      amount: credited,
      priceSom: order.amountSom,
      description: `${tier.nameUz} — Payme to'lovi bekor qilindi`,
    });

    const [row] = await tx
      .update(paymentOrdersTable)
      .set({ status: "cancelled", cancelledAt, cancelReason: params.reason, updatedAt: new Date() })
      .where(eq(paymentOrdersTable.id, order.id))
      .returning();
    return row;
  });

  return { transaction: updated.id, cancel_time: cancelledAt.getTime(), state: -2 };
}

async function checkTransaction(params: { id: string }) {
  const order = await findOrderByTransactionId(params.id);
  if (!order) throw new PaymeError(PaymeErrorCode.TransactionNotFound, "Tranzaksiya topilmadi");

  return {
    create_time: order.createdAt.getTime(),
    perform_time: order.performedAt?.getTime() ?? 0,
    cancel_time: order.cancelledAt?.getTime() ?? 0,
    transaction: order.id,
    state: stateOf(order),
    reason: order.cancelReason ?? null,
  };
}

async function getStatement(params: { from: number; to: number }) {
  const orders = await db
    .select()
    .from(paymentOrdersTable)
    .where(eq(paymentOrdersTable.provider, "payme"));

  const transactions = orders
    .filter((o) => o.providerTransactionId && o.createdAt.getTime() >= params.from && o.createdAt.getTime() <= params.to)
    .map((o) => ({
      id: o.providerTransactionId,
      time: o.createdAt.getTime(),
      amount: o.amountSom * 100,
      account: { order_id: o.id },
      create_time: o.createdAt.getTime(),
      perform_time: o.performedAt?.getTime() ?? 0,
      cancel_time: o.cancelledAt?.getTime() ?? 0,
      transaction: o.id,
      state: stateOf(o),
      reason: o.cancelReason ?? null,
    }));

  return { transactions };
}

type PaymeMethod =
  | "CheckPerformTransaction"
  | "CreateTransaction"
  | "PerformTransaction"
  | "CancelTransaction"
  | "CheckTransaction"
  | "GetStatement";

/** Express handler for POST /api/payments/payme — Payme's Merchant API JSON-RPC webhook. */
/**
 * Always resolves — never throws. Payme requires HTTP 200 on every response,
 * error or not, and retries if it doesn't get one, so this must not let an
 * unexpected exception (e.g. missing config, a DB hiccup) turn into a 500.
 */
export async function handlePaymeRequest(
  authHeader: string | undefined,
  body: { method?: PaymeMethod; params?: Record<string, unknown>; id?: unknown }
) {
  const id = body?.id;
  try {
    const { method, params } = body;

    if (!verifyAuth(authHeader)) {
      return rpcError(id, new PaymeError(PaymeErrorCode.InsufficientPrivilege, "Avtorizatsiya xato"));
    }
    if (!method) {
      return rpcError(id, new PaymeError(PaymeErrorCode.MethodNotFound, "Metod ko'rsatilmagan"));
    }

    let result: unknown;
    switch (method) {
      case "CheckPerformTransaction":
        result = await checkPerformTransaction(params as never);
        break;
      case "CreateTransaction":
        result = await createTransaction(params as never);
        break;
      case "PerformTransaction":
        result = await performTransaction(params as never);
        break;
      case "CancelTransaction":
        result = await cancelTransaction(params as never);
        break;
      case "CheckTransaction":
        result = await checkTransaction(params as never);
        break;
      case "GetStatement":
        result = await getStatement(params as never);
        break;
      default:
        return rpcError(id, new PaymeError(PaymeErrorCode.MethodNotFound, "Noma'lum metod"));
    }
    return rpcResult(id, result);
  } catch (err) {
    if (err instanceof PaymeError) return rpcError(id, err);
    console.error("Payme handler error:", err);
    return rpcError(id, new PaymeError(PaymeErrorCode.UnableToPerform, "Ichki xatolik"));
  }
}
