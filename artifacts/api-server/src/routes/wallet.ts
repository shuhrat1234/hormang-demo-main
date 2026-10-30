import { Router, type IRouter } from "express";
import { and, eq, desc, isNull, sql, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  walletsTable,
  pricingTiersTable,
  tangaTransactionsTable,
  paymentOrdersTable,
  referralsTable,
  type PricingTier,
} from "@workspace/db";
import type { AuthRequest } from "../middlewares/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { buildPaymeCheckoutUrl } from "../lib/payme.js";
import { buildClickCheckoutUrl } from "../lib/click.js";
import { isPaymeConfigured, isClickCheckoutConfigured } from "../lib/env.js";
import { grantReferralReward, REFERRAL_REWARD } from "../lib/referral.js";

const router: IRouter = Router();

/**
 * Mirrors the sale-eligibility the admin panel already displays (salePrice
 * set and below priceSom), plus the date/limit fields the admin card shows
 * as auxiliary info but never actually used to gate the charged amount —
 * so a purchase after validUntil/saleLimit was previously still charged the
 * (lower) salePrice by relying on the client-sent tierId alone.
 */
async function getEffectivePrice(tier: PricingTier, userId: string): Promise<number> {
  if (tier.salePrice == null || tier.salePrice >= tier.priceSom) return tier.priceSom;

  const now = new Date();
  if (tier.startsAt && new Date(tier.startsAt) > now) return tier.priceSom;
  if (tier.validUntil && new Date(tier.validUntil) <= now) return tier.priceSom;
  if (tier.saleLimit != null && tier.salePurchaseCount >= tier.saleLimit) return tier.priceSom;

  if (tier.perUserLimit != null) {
    const paidOrders = await db
      .select({ id: paymentOrdersTable.id })
      .from(paymentOrdersTable)
      .where(and(
        eq(paymentOrdersTable.userId, userId),
        eq(paymentOrdersTable.tierId, tier.id),
        eq(paymentOrdersTable.status, "paid"),
      ));
    if (paidOrders.length >= tier.perUserLimit) return tier.priceSom;
  }

  return tier.salePrice;
}

// ─── GET / — balance + purchasable tiers ───────────────────────────────────
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
    if (!wallet) {
      [wallet] = await db.insert(walletsTable).values({ userId, balance: 0 }).returning();
    }

    const tiers = await db
      .select()
      .from(pricingTiersTable)
      .where(eq(pricingTiersTable.active, true))
      .orderBy(pricingTiersTable.sortOrder);

    // Only tiers with a perUserLimit need this — lets the client show real
    // "N left for you" / "limit reached" state instead of staying silent
    // while the server quietly falls back to full price under the hood.
    const limitedTierIds = tiers.filter((t) => t.perUserLimit != null).map((t) => t.id);
    const purchaseCounts: Record<string, number> = {};
    if (limitedTierIds.length > 0) {
      const rows = await db
        .select({ tierId: paymentOrdersTable.tierId, count: sql<number>`count(*)::int` })
        .from(paymentOrdersTable)
        .where(and(
          eq(paymentOrdersTable.userId, userId),
          eq(paymentOrdersTable.status, "paid"),
          inArray(paymentOrdersTable.tierId, limitedTierIds),
        ))
        .groupBy(paymentOrdersTable.tierId);
      for (const row of rows) purchaseCounts[row.tierId] = row.count;
    }

    const tiersWithCounts = tiers.map((t) => ({
      ...t,
      userPurchaseCount: t.perUserLimit != null ? (purchaseCounts[t.id] ?? 0) : undefined,
    }));

    res.json({ balance: wallet.balance, tiers: tiersWithCounts });
  } catch (err) {
    console.error("Get wallet error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /transactions — Tanga ledger ──────────────────────────────────────
router.get("/transactions", requireAuth, async (req: AuthRequest, res) => {
  try {
    const transactions = await db
      .select()
      .from(tangaTransactionsTable)
      .where(eq(tangaTransactionsTable.userId, req.user!.id))
      .orderBy(desc(tangaTransactionsTable.createdAt));

    res.json({ transactions });
  } catch (err) {
    console.error("Get wallet transactions error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /profile-bonus — one-time +5 Tanga for a 100%-complete profile ───
// Safe to call every time the client detects 100% completion — the DB flag
// (users.profile_bonus_granted_at) makes it idempotent server-side, so the
// old client-only "write the flag first" race-guard is no longer needed.
router.post("/profile-bonus", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select({ profileBonusGrantedAt: usersTable.profileBonusGrantedAt })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    if (user.profileBonusGrantedAt) {
      const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.user!.id)).limit(1);
      res.json({ granted: false, alreadyGranted: true, balance: wallet?.balance ?? 0 });
      return;
    }

    const BONUS_AMOUNT = 5;
    const balance = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(usersTable)
        .set({ profileBonusGrantedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(usersTable.id, req.user!.id), isNull(usersTable.profileBonusGrantedAt)))
        .returning({ id: usersTable.id });
      if (!claimed) return null; // Lost a race with a concurrent claim — no double credit.

      const [existingWallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, req.user!.id)).limit(1);
      const nextBalance = (existingWallet?.balance ?? 0) + BONUS_AMOUNT;
      if (existingWallet) {
        await tx.update(walletsTable).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(walletsTable.userId, req.user!.id));
      } else {
        await tx.insert(walletsTable).values({ userId: req.user!.id, balance: nextBalance });
      }

      await tx.insert(tangaTransactionsTable).values({
        userId: req.user!.id,
        type: "profile_completion_reward",
        direction: "in",
        amount: BONUS_AMOUNT,
        description: "Profil 100% to'ldirilgani uchun bonus",
      });

      return nextBalance;
    });

    if (balance === null) {
      const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.user!.id)).limit(1);
      res.json({ granted: false, alreadyGranted: true, balance: wallet?.balance ?? 0 });
      return;
    }

    res.json({ granted: true, balance });
  } catch (err) {
    console.error("Profile bonus error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /referral-reward — credit the referrer's real wallet ────────────
router.post("/referral-reward", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { referrerCode } = req.body as { referrerCode?: string };
    if (!referrerCode || typeof referrerCode !== "string") {
      res.status(400).json({ error: "referrerCode talab qilinadi" });
      return;
    }

    const result = await grantReferralReward(referrerCode, req.user!.id);
    if ("error" in result) {
      const status = result.error === "Taklif qiluvchi topilmadi" ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (err) {
    console.error("Referral reward error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /referral-stats — the current user's own referral count/earnings ──
router.get("/referral-stats", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, req.user!.id), eq(referralsTable.rewarded, true)))
      .orderBy(desc(referralsTable.createdAt));

    res.json({
      count: rows.length,
      earned: rows.length * REFERRAL_REWARD,
      invitees: rows.map((r) => ({ userId: r.inviteeId, completedAt: r.createdAt })),
    });
  } catch (err) {
    console.error("Get referral stats error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

async function executeFreeClaim(tier: PricingTier, userId: string) {
  const totalCredits = tier.credits + (tier.bonusTokens ?? 0);

  return await db.transaction(async (tx) => {
    // 0. Lock user row to serialize concurrent claims for the same user
    await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");

    // Check promotional sale limit inside transaction with row lock
    if (tier.saleLimit != null) {
      const [lockedTier] = await tx
        .select()
        .from(pricingTiersTable)
        .where(eq(pricingTiersTable.id, tier.id))
        .for("update");

      if (lockedTier && lockedTier.saleLimit != null && lockedTier.salePurchaseCount >= lockedTier.saleLimit) {
        throw new Error("Bepul tarif uchun ajratilgan o'rinlar tugagan");
      }
    }

    // Check per-user limit inside transaction
    if (tier.perUserLimit != null) {
      const paidOrders = await tx
        .select({ id: paymentOrdersTable.id })
        .from(paymentOrdersTable)
        .where(and(
          eq(paymentOrdersTable.userId, userId),
          eq(paymentOrdersTable.tierId, tier.id),
          eq(paymentOrdersTable.status, "paid"),
        ))
        .for("update");

      if (paidOrders.length >= tier.perUserLimit) {
        throw new Error("Ushbu bepul tarifdan foydalanish limiti tugagan");
      }
    }

    // 1. Create order marked as paid with provider: "free"
    const [order] = await tx
      .insert(paymentOrdersTable)
      .values({
        userId,
        tierId: tier.id,
        provider: "free",
        amountSom: 0,
        status: "paid",
        performedAt: new Date(),
      })
      .returning();

    // 2. Update wallet balance
    const [wallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, userId)).for("update").limit(1);
    const nextBalance = (wallet?.balance ?? 0) + totalCredits;
    if (wallet) {
      await tx.update(walletsTable).set({ balance: nextBalance, updatedAt: new Date() }).where(eq(walletsTable.userId, userId));
    } else {
      await tx.insert(walletsTable).values({ userId, balance: nextBalance });
    }

    // 3. Record transaction
    await tx.insert(tangaTransactionsTable).values({
      userId,
      orderId: order.id,
      type: "purchase",
      direction: "in",
      amount: totalCredits,
      priceSom: 0,
      description: tier.nameUz ? `${tier.nameUz} (Bepul)` : "Bepul tarif",
    });

    // 4. Increment sale count if it was a promotion
    if (tier.salePrice === 0) {
      await tx
        .update(pricingTiersTable)
        .set({ salePurchaseCount: sql`${pricingTiersTable.salePurchaseCount} + 1` })
        .where(eq(pricingTiersTable.id, tier.id));
    }

    return { balance: nextBalance, credits: totalCredits, orderId: order.id };
  });
}

// ─── POST /claim-free — claim a free tier immediately without payment gateway ─
router.post("/claim-free", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { tierId } = req.body as { tierId?: string };
    if (!tierId) {
      res.status(400).json({ error: "tierId talab qilinadi" });
      return;
    }

    const [tier] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, tierId)).limit(1);
    if (!tier || !tier.active) {
      res.status(404).json({ error: "Tarif topilmadi" });
      return;
    }

    const effectivePrice = await getEffectivePrice(tier, req.user!.id);
    if (effectivePrice !== 0) {
      res.status(400).json({ error: "Bu tarif bepul emas" });
      return;
    }

    const result = await executeFreeClaim(tier, req.user!.id);
    res.json({ ok: true, free: true, ...result });
  } catch (err: any) {
    console.error("Claim free tier error:", err);
    res.status(400).json({ error: err.message || "Xatolik yuz berdi" });
  }
});

// ─── POST /orders — start a purchase, returns the gateway checkout URL ─────
router.post("/orders", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { tierId, provider } = req.body as { tierId?: string; provider?: string };

    if (!tierId) {
      res.status(400).json({ error: "tierId talab qilinadi" });
      return;
    }

    const [tier] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, tierId)).limit(1);
    if (!tier || !tier.active) {
      res.status(404).json({ error: "Tarif topilmadi" });
      return;
    }

    const amountSom = await getEffectivePrice(tier, req.user!.id);

    // Free tier: grant immediately without redirecting to Click/Payme
    if (amountSom === 0 || provider === "free") {
      const result = await executeFreeClaim(tier, req.user!.id);
      res.status(200).json({ ok: true, free: true, checkoutUrl: "", ...result });
      return;
    }

    if (!provider) {
      res.status(400).json({ error: "provider talab qilinadi" });
      return;
    }
    if (provider !== "payme" && provider !== "click") {
      res.status(400).json({ error: "Bu to'lov usuli hali mavjud emas" });
      return;
    }
    if (provider === "payme" && !isPaymeConfigured()) {
      res.status(503).json({ error: "To'lov tizimi hali sozlanmagan" });
      return;
    }
    if (provider === "click" && !isClickCheckoutConfigured()) {
      res.status(503).json({ error: "To'lov tizimi hali sozlanmagan" });
      return;
    }

    const [order] = await db
      .insert(paymentOrdersTable)
      .values({
        userId: req.user!.id,
        tierId: tier.id,
        provider,
        amountSom,
        status: "pending",
      })
      .returning();

    const checkoutUrl = provider === "click" ? buildClickCheckoutUrl(order) : buildPaymeCheckoutUrl(order);
    res.status(201).json({ orderId: order.id, checkoutUrl });
  } catch (err: any) {
    console.error("Create order error:", err);
    res.status(400).json({ error: err.message || "Xatolik yuz berdi" });
  }
});

// ─── GET /orders/:id — poll order status (used by the post-checkout return page) ──
router.get("/orders/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = req.params.id as string;
    const [row] = await db
      .select({ order: paymentOrdersTable, tier: pricingTiersTable })
      .from(paymentOrdersTable)
      .innerJoin(pricingTiersTable, eq(paymentOrdersTable.tierId, pricingTiersTable.id))
      .where(eq(paymentOrdersTable.id, orderId))
      .limit(1);

    if (!row || row.order.userId !== req.user!.id) {
      res.status(404).json({ error: "Buyurtma topilmadi" });
      return;
    }

    res.json({ order: row.order, tier: row.tier });
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

export default router;
