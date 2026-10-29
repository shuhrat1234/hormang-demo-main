/**
 * tanga-history-store.ts
 * Persists every Tanga spending transaction in localStorage.
 * Key: "hormang_tanga_history"
 */
import { emitStoreChange } from "./store-events";

export const TANGA_HISTORY_KEY = "hormang_tanga_history";

export interface TangaTransaction {
  id: string;
  userId: string;
  offerId: string;
  requestId: string;
  categoryName: string;
  categoryEmoji?: string;
  description: string;
  amount: number;
  /** "spend" = offer cost (default), "referral" = reward earned, "purchase" = bought, "refund" = returned to provider, "admin_adjustment" = manual admin change, "profile_completion_reward" = one-time 100% profile bonus */
  type?: "spend" | "referral" | "purchase" | "refund" | "admin_adjustment" | "profile_completion_reward";
  /** Explicit balance effect: "in" = added to user balance, "out" = removed. Required for `admin_adjustment` (since amount is always positive); optional for other types where direction is implied by `type`. */
  direction?: "in" | "out";
  /** For "purchase" txs: the so'm price actually paid (after any sale discount). Used by admin revenue analytics. */
  priceSom?: number;
  /** Purchase source for analytics. */
  source?: "normal_purchase" | "discount_campaign" | "referral_bonus" | "admin_grant";
  createdAt: string;
  tierName?: string | null;
  orderProvider?: "payme" | "click" | "free" | null;
  orderAmountSom?: number | null;
  orderStatus?: string | null;
  requestCategory?: string | null;
  requestCustomer?: string | null;
}

function readAll(): TangaTransaction[] {
  try {
    const raw = localStorage.getItem(TANGA_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TangaTransaction[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: TangaTransaction[]): void {
  localStorage.setItem(TANGA_HISTORY_KEY, JSON.stringify(list));
}

/** Record a new spend transaction (prepended so newest is first). */
export function recordTangaTransaction(
  tx: Omit<TangaTransaction, "id" | "createdAt">,
): TangaTransaction {
  const newTx: TangaTransaction = {
    ...tx,
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  all.unshift(newTx);
  writeAll(all);
  emitStoreChange();
  return newTx;
}

/** Get all transactions for a specific user (most recent first). */
export function getTangaTransactions(userId: string): TangaTransaction[] {
  return readAll().filter((t) => t.userId === userId);
}

/** Get all transactions across all users (most recent first). */
export function getAllTangaTransactions(): TangaTransaction[] {
  return readAll();
}

/** Look up the transaction linked to a specific offer. */
export function getTransactionByOfferId(
  offerId: string,
): TangaTransaction | undefined {
  return readAll().find((t) => t.offerId === offerId);
}
