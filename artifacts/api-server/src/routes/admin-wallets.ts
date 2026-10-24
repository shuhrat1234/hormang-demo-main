import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, walletsTable, usersTable, tangaTransactionsTable, paymentOrdersTable, pricingTiersTable, referralsTable } from "@workspace/db";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();
router.use(requireAdminKey);

// ─── GET / — every user's balance + purchased/spent totals ────────────────
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        phone: usersTable.phone,
        role: usersTable.role,
        balance: walletsTable.balance,
      })
      .from(usersTable)
      .leftJoin(walletsTable, eq(walletsTable.userId, usersTable.id));

    const allTx = await db.select().from(tangaTransactionsTable);
    const totals = new Map<string, { purchased: number; spent: number; txCount: number }>();
    for (const tx of allTx) {
      const t = totals.get(tx.userId) ?? { purchased: 0, spent: 0, txCount: 0 };
      t.txCount += 1;
      if (tx.direction === "in") t.purchased += tx.amount;
      else t.spent += tx.amount;
      totals.set(tx.userId, t);
    }

    res.json({
      wallets: rows.map((r) => ({
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        role: r.role,
        balance: r.balance ?? 0,
        totalPurchased: totals.get(r.userId)?.purchased ?? 0,
        totalSpent: totals.get(r.userId)?.spent ?? 0,
        txCount: totals.get(r.userId)?.txCount ?? 0,
      })),
    });
  } catch (err) {
    console.error("List admin wallets error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /transactions — every Tanga transaction, across all users ────────
router.get("/transactions", async (_req, res) => {
  try {
    const rows = await db
      .select({
        tx: tangaTransactionsTable,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        phone: usersTable.phone,
        tierName: pricingTiersTable.nameUz,
      })
      .from(tangaTransactionsTable)
      .leftJoin(usersTable, eq(usersTable.id, tangaTransactionsTable.userId))
      .leftJoin(paymentOrdersTable, eq(paymentOrdersTable.id, tangaTransactionsTable.orderId))
      .leftJoin(pricingTiersTable, eq(pricingTiersTable.id, paymentOrdersTable.tierId))
      .orderBy(desc(tangaTransactionsTable.createdAt));
    res.json({
      transactions: rows.map((r) => ({ ...r.tx, firstName: r.firstName, lastName: r.lastName, phone: r.phone, tierName: r.tierName })),
    });
  } catch (err) {
    console.error("List all admin wallet transactions error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /referrals — every referral relationship, for the admin Users tab ─
router.get("/referrals", async (_req, res) => {
  try {
    const rows = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt));
    res.json({ referrals: rows });
  } catch (err) {
    console.error("List admin referrals error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /:userId/transactions ─────────────────────────────────────────────
router.get("/:userId/transactions", async (req, res) => {
  try {
    const userId: string = String(req.params.userId);
    const rows = await db
      .select({
        tx: tangaTransactionsTable,
        tierName: pricingTiersTable.nameUz,
      })
      .from(tangaTransactionsTable)
      .leftJoin(paymentOrdersTable, eq(paymentOrdersTable.id, tangaTransactionsTable.orderId))
      .leftJoin(pricingTiersTable, eq(pricingTiersTable.id, paymentOrdersTable.tierId))
      .where(eq(tangaTransactionsTable.userId, userId))
      .orderBy(desc(tangaTransactionsTable.createdAt));
    res.json({ transactions: rows.map((r) => ({ ...r.tx, tierName: r.tierName })) });
  } catch (err) {
    console.error("Get admin wallet transactions error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /:userId/adjust — manual Tanga add/deduct ────────────────────────
router.post("/:userId/adjust", async (req, res) => {
  try {
    const userId: string = String(req.params.userId);
    const { amount, direction, reason } = req.body as { amount?: number; direction?: "in" | "out"; reason?: string };
    if (!amount || amount <= 0 || (direction !== "in" && direction !== "out")) {
      res.status(400).json({ error: "amount (musbat son) va direction (in/out) talab qilinadi" });
      return;
    }

    let insufficientBalance = false;
    let newBalance = 0;

    await db.transaction(async (tx) => {
      const [wallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
      const currentBalance = wallet?.balance ?? 0;

      if (direction === "out" && currentBalance < amount) {
        insufficientBalance = true;
        return;
      }

      newBalance = direction === "in" ? currentBalance + amount : currentBalance - amount;

      if (wallet) {
        await tx.update(walletsTable).set({ balance: newBalance, updatedAt: new Date() }).where(eq(walletsTable.userId, userId));
      } else {
        await tx.insert(walletsTable).values({ userId, balance: newBalance });
      }

      await tx.insert(tangaTransactionsTable).values({
        userId,
        type: "admin_adjustment",
        direction,
        amount,
        description: reason ?? null,
      });
    });

    if (insufficientBalance) {
      res.status(400).json({ error: "Balansda yetarli mablag' yo'q" });
      return;
    }

    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    console.error("Adjust wallet balance error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

export default router;
