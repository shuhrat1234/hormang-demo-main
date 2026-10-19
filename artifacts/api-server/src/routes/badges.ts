import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db, userBadgesTable, usersTable, providerProfilesTable,
  offersTable, reviewsTable, tangaTransactionsTable,
  type UserBadgeRow,
} from "@workspace/db";
import { requireAdminKey } from "../middlewares/admin.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router: IRouter = Router();

// S3: "verified" is strictly admin-managed (along with recommended_by_hormang and under_review)
const ADMIN_BADGE_TYPES = ["recommended_by_hormang", "under_review", "verified"];
const AUTO_BADGE_TYPES = [
  "top_provider", "trusted_provider",
  "experienced_provider", "premium_provider", "strong_portfolio",
];

function toJson(row: UserBadgeRow) {
  return { userId: row.userId, type: row.type, source: row.source, grantedAt: row.grantedAt.toISOString(), grantedBy: row.grantedBy };
}

async function evaluateServerEligibility(userId: string): Promise<Set<string>> {
  const eligible = new Set<string>();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return eligible;

  const [profile] = await db.select().from(providerProfilesTable).where(eq(providerProfilesTable.userId, userId)).limit(1);

  const [offers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(offersTable)
    .where(and(eq(offersTable.masterId, userId), eq(offersTable.status, "completed")));
  const completedCount = Number(offers?.count ?? 0);

  const [revs] = await db
    .select({
      avgRating: sql<number>`coalesce(avg(${reviewsTable.rating}), 0)::float`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.reviewedId, userId), eq(reviewsTable.reviewedRole, "provider")));
  const avgRating = Number(revs?.avgRating ?? 0);
  const reviewCount = Number(revs?.count ?? 0);

  const [tanga] = await db
    .select({ sum: sql<number>`coalesce(sum(${tangaTransactionsTable.amount}), 0)::int` })
    .from(tangaTransactionsTable)
    .where(and(eq(tangaTransactionsTable.userId, userId), eq(tangaTransactionsTable.direction, "in")));
  const acquiredTanga = Number(tanga?.sum ?? 0);

  const ageDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // 1. Top provider — rating >= 4.7 AND completed >= 50
  if (avgRating >= 4.7 && completedCount >= 50) {
    eligible.add("top_provider");
  }

  // 2. Trusted provider — rating >= 4.7 and at least 5 reviews
  if (avgRating >= 4.7 && reviewCount >= 5) {
    eligible.add("trusted_provider");
  }

  // 3. Experienced provider — account age >= 365 days AND completed >= 50
  if (ageDays >= 365 && completedCount >= 50) {
    eligible.add("experienced_provider");
  }

  // 4. Premium provider — cumulative acquired Tanga > 500
  if (acquiredTanga > 500) {
    eligible.add("premium_provider");
  }

  // 5. Strong portfolio — 5+ albums, each with 10+ photos
  const albums = (profile?.albums as any[]) ?? [];
  if (Array.isArray(albums) && albums.length >= 5 && albums.every((a) => Array.isArray(a.photos) && a.photos.length >= 10)) {
    eligible.add("strong_portfolio");
  }

  return eligible;
}

// ─── GET / — every badge (admin + auto), public ────────────────────────────
router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(userBadgesTable);
    res.json({ badges: rows.map(toJson) });
  } catch (err) {
    console.error("List badges error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /sync — sync caller's auto-evaluated badges with server verification (S3) ──
router.post("/sync", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { qualified } = req.body as { qualified?: string[] };
    if (!Array.isArray(qualified) || qualified.some((t) => !AUTO_BADGE_TYPES.includes(t))) {
      res.status(400).json({ error: "qualified — avtomatik nishon turlari ro'yxati bo'lishi kerak" });
      return;
    }
    const userId = req.user!.id;

    // S3: Authoritatively check qualification on the server
    const serverEligible = await evaluateServerEligibility(userId);
    const validQualified = qualified.filter((t) => serverEligible.has(t));

    const existing = await db
      .select()
      .from(userBadgesTable)
      .where(and(eq(userBadgesTable.userId, userId), eq(userBadgesTable.source, "auto")));
    const existingTypes = new Set(existing.map((r) => r.type));
    const qualifiedSet = new Set(validQualified);

    const toAdd = validQualified.filter((t) => !existingTypes.has(t as UserBadgeRow["type"]));
    const toRemove = existing.filter((r) => !qualifiedSet.has(r.type));

    if (toAdd.length) {
      await db
        .insert(userBadgesTable)
        .values(toAdd.map((type) => ({ userId, type: type as UserBadgeRow["type"], source: "auto" as const, grantedBy: "system" })))
        .onConflictDoNothing({ target: [userBadgesTable.userId, userBadgesTable.type] });
    }
    for (const row of toRemove) {
      await db.delete(userBadgesTable).where(eq(userBadgesTable.id, row.id));
    }

    const rows = await db.select().from(userBadgesTable).where(eq(userBadgesTable.userId, userId));
    res.json({ badges: rows.map(toJson) });
  } catch (err) {
    console.error("Sync auto badges error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /admin — grant an admin badge ─────────────────────────────────────
router.post("/admin", requireAdminKey, async (req, res) => {
  try {
    const { userId, type, grantedBy } = req.body as { userId?: string; type?: string; grantedBy?: string };
    if (!userId || !type || !ADMIN_BADGE_TYPES.includes(type) || !grantedBy) {
      res.status(400).json({ error: "userId, type (admin badge), grantedBy talab qilinadi" });
      return;
    }
    const [existing] = await db
      .select()
      .from(userBadgesTable)
      .where(and(eq(userBadgesTable.userId, userId), eq(userBadgesTable.type, type as UserBadgeRow["type"])))
      .limit(1);
    if (existing) {
      res.status(400).json({ error: "Bu nishon allaqachon berilgan" });
      return;
    }
    const [row] = await db
      .insert(userBadgesTable)
      .values({ userId, type: type as UserBadgeRow["type"], source: "admin", grantedBy })
      .returning();
    res.status(201).json({ badge: toJson(row) });
  } catch (err) {
    console.error("Admin grant badge error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── DELETE /admin — revoke an admin badge ──────────────────────────────────
router.delete("/admin", requireAdminKey, async (req, res) => {
  try {
    const { userId, type } = req.body as { userId?: string; type?: string };
    if (!userId || !type) {
      res.status(400).json({ error: "userId va type talab qilinadi" });
      return;
    }
    const [existing] = await db
      .select()
      .from(userBadgesTable)
      .where(and(eq(userBadgesTable.userId, userId), eq(userBadgesTable.type, type as UserBadgeRow["type"]), eq(userBadgesTable.source, "admin")))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Nishon topilmadi" });
      return;
    }
    await db.delete(userBadgesTable).where(eq(userBadgesTable.id, existing.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin revoke badge error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

export default router;
