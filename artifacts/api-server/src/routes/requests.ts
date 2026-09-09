import { Router, type IRouter } from "express";
import { eq, and, ne, desc, sql, inArray } from "drizzle-orm";
import { db, requestsTable, offersTable, walletsTable, tangaTransactionsTable, type RequestRow } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();

const REQUEST_COOLDOWN_MS = 5 * 60 * 1000;
const REQUEST_EXTENDED_COOLDOWN_MS = 30 * 60 * 1000;
const REQUEST_EXTENDED_THRESHOLD = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toJson(row: RequestRow) {
  return {
    ...row,
    acceptedOfferId: row.acceptedOfferId ?? undefined,
    region: row.region ?? undefined,
    district: row.district ?? undefined,
    requestPhotos: row.requestPhotos ?? undefined,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

async function qualifyingRequests(customerId: string) {
  return db
    .select()
    .from(requestsTable)
    .where(and(eq(requestsTable.customerId, customerId), ne(requestsTable.status, "cancelled")));
}

async function computeCooldown(customerId: string) {
  const qualifying = await qualifyingRequests(customerId);
  const now = Date.now();
  const recentCount = qualifying.filter((r) => now - r.createdAt.getTime() < ONE_DAY_MS).length;
  const extended = recentCount >= REQUEST_EXTENDED_THRESHOLD;
  const durationMs = extended ? REQUEST_EXTENDED_COOLDOWN_MS : REQUEST_COOLDOWN_MS;
  const latest = qualifying.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) return { blocked: false, remainingMs: 0, until: null as number | null, durationMs, recentCount, extended };
  const elapsed = now - latest.createdAt.getTime();
  if (elapsed >= durationMs) return { blocked: false, remainingMs: 0, until: null as number | null, durationMs, recentCount, extended };
  return { blocked: true, remainingMs: durationMs - elapsed, until: latest.createdAt.getTime() + durationMs, durationMs, recentCount, extended };
}

// ─── GET /popularity — per-category request/offer/completed counts, public ─
router.get("/popularity", async (_req, res) => {
  try {
    const [byRequest, byOffer] = await Promise.all([
      db
        .select({
          categoryId: requestsTable.categoryId,
          requestCount: sql<number>`count(*)::int`,
          completedCount: sql<number>`count(*) filter (where ${requestsTable.status} = 'completed')::int`,
        })
        .from(requestsTable)
        .groupBy(requestsTable.categoryId),
      db
        .select({ categoryId: requestsTable.categoryId, offerCount: sql<number>`count(*)::int` })
        .from(offersTable)
        .innerJoin(requestsTable, eq(requestsTable.id, offersTable.requestId))
        .groupBy(requestsTable.categoryId),
    ]);
    const offerCountByCategory = new Map(byOffer.map((r) => [r.categoryId, r.offerCount]));
    res.json({
      categories: byRequest.map((r) => ({
        categoryId: r.categoryId,
        requestCount: r.requestCount,
        completedCount: r.completedCount,
        offerCount: offerCountByCategory.get(r.categoryId) ?? 0,
      })),
    });
  } catch (err) {
    console.error("Get request popularity error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /cooldown — live cooldown state for the authenticated customer ────
router.get("/cooldown", requireAuth, async (req: AuthRequest, res) => {
  try {
    res.json(await computeCooldown(req.user!.id));
  } catch (err) {
    console.error("Get request cooldown error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

async function withOfferCounts(rows: RequestRow[]) {
  if (rows.length === 0) return rows.map((r) => ({ ...toJson(r), offerCount: 0 }));
  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({ requestId: offersTable.requestId, count: sql<number>`count(*)::int` })
    .from(offersTable)
    .where(inArray(offersTable.requestId, ids))
    .groupBy(offersTable.requestId);
  const countByRequest = new Map(counts.map((c) => [c.requestId, c.count]));
  return rows.map((r) => ({ ...toJson(r), offerCount: countByRequest.get(r.id) ?? 0 }));
}

// ─── GET /mine — the authenticated customer's own requests ─────────────────
router.get("/mine", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(requestsTable)
      .where(eq(requestsTable.customerId, req.user!.id))
      .orderBy(desc(requestsTable.createdAt));
    res.json({ requests: await withOfferCounts(rows) });
  } catch (err) {
    console.error("List my requests error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /open — open requests, for the provider browse feed ───────────────
router.get("/open", requireAuth, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(requestsTable)
      .where(eq(requestsTable.status, "open"))
      .orderBy(desc(requestsTable.createdAt));
    res.json({ requests: await withOfferCounts(rows) });
  } catch (err) {
    console.error("List open requests error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /:id — single request, public (chat/offer detail views need this) ─
router.get("/:id", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [row] = await db.select().from(requestsTable).where(eq(requestsTable.id, id)).limit(1);
    if (!row) {
      res.status(404).json({ error: "So'rov topilmadi" });
      return;
    }
    const [withCount] = await withOfferCounts([row]);
    res.json({ request: withCount });
  } catch (err) {
    console.error("Get request error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /:id/offer-count — live offer count, used for delete guards ───────
router.get("/:id/offer-count", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(offersTable).where(eq(offersTable.requestId, id));
    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    console.error("Get request offer count error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST / — create a new request as the authenticated customer ───────────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const customerId = req.user!.id;
    const body = req.body as {
      categoryId?: string; categoryName?: string; emoji?: string;
      answers?: Record<string, unknown>; requestPhotos?: string[];
      customerName?: string; region?: string; district?: string;
    };
    if (!body.categoryId || !body.categoryName || !body.answers) {
      res.status(400).json({ error: "categoryId, categoryName, answers talab qilinadi" });
      return;
    }

    const cooldown = await computeCooldown(customerId);
    if (cooldown.blocked) {
      res.status(429).json({ error: "REQUEST_COOLDOWN", cooldown });
      return;
    }

    const [row] = await db
      .insert(requestsTable)
      .values({
        customerId,
        customerName: body.customerName ?? null,
        categoryId: body.categoryId,
        categoryName: body.categoryName,
        emoji: body.emoji ?? "📋",
        answers: body.answers,
        requestPhotos: body.requestPhotos?.length ? body.requestPhotos : null,
        region: body.region ?? null,
        district: body.district ?? null,
      })
      .returning();
    res.status(201).json({ request: toJson(row) });
  } catch (err) {
    console.error("Create request error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /:id/status — owner deactivates/reactivates their own request ───
router.patch("/:id/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const { status } = req.body as { status?: RequestRow["status"] };
    if (!status) {
      res.status(400).json({ error: "status talab qilinadi" });
      return;
    }
    const [existing] = await db.select().from(requestsTable).where(eq(requestsTable.id, id)).limit(1);
    if (!existing || existing.customerId !== req.user!.id) {
      res.status(404).json({ error: "So'rov topilmadi" });
      return;
    }
    const [row] = await db.update(requestsTable).set({ status }).where(eq(requestsTable.id, id)).returning();
    res.json({ request: toJson(row) });
  } catch (err) {
    console.error("Update request status error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── DELETE /:id — owner deletes their own request, only if it has no offers ─
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const [existing] = await db.select().from(requestsTable).where(eq(requestsTable.id, id)).limit(1);
    if (!existing || existing.customerId !== req.user!.id) {
      res.status(404).json({ ok: false, reason: "not_found" });
      return;
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(offersTable).where(eq(offersTable.requestId, id));
    if (count > 0) {
      res.status(400).json({ ok: false, reason: "has_offers" });
      return;
    }
    await db.delete(requestsTable).where(eq(requestsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete request error:", err);
    res.status(500).json({ ok: false });
  }
});

// ─── PATCH /admin/:id/status — admin force-sets any request's status ───────
router.patch("/admin/:id/status", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { status } = req.body as { status?: RequestRow["status"] };
    if (!status) {
      res.status(400).json({ error: "status talab qilinadi" });
      return;
    }
    const [row] = await db.update(requestsTable).set({ status }).where(eq(requestsTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: "So'rov topilmadi" });
      return;
    }
    res.json({ request: toJson(row) });
  } catch (err) {
    console.error("Admin update request status error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /admin/all — every request, any status, admin only ────────────────
router.get("/admin/all", requireAdminKey, async (_req, res) => {
  try {
    const rows = await db.select().from(requestsTable).orderBy(desc(requestsTable.createdAt));
    res.json({ requests: await withOfferCounts(rows) });
  } catch (err) {
    console.error("Admin list all requests error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── DELETE /admin/:id — admin force-delete; refunds pending offers first,
// then deletes (offers + chats cascade via FK) ──────────────────────────────
router.delete("/admin/:id", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [existing] = await db.select().from(requestsTable).where(eq(requestsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ ok: false, reason: "not_found" });
      return;
    }

    await db.transaction(async (tx) => {
      const pendingOffers = await tx
        .select()
        .from(offersTable)
        .where(and(eq(offersTable.requestId, id), eq(offersTable.status, "pending")));

      for (const offer of pendingOffers) {
        const refund = offer.tangaSpent ?? 0;
        if (refund <= 0) continue;
        const [wallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, offer.masterId)).limit(1);
        const newBalance = (wallet?.balance ?? 0) + refund;
        if (wallet) {
          await tx.update(walletsTable).set({ balance: newBalance, updatedAt: new Date() }).where(eq(walletsTable.userId, offer.masterId));
        } else {
          await tx.insert(walletsTable).values({ userId: offer.masterId, balance: newBalance });
        }
        await tx.insert(tangaTransactionsTable).values({
          userId: offer.masterId, type: "refund", direction: "in", amount: refund,
          description: "So'rov o'chirildi", offerId: offer.id, requestId: id,
        });
      }

      await tx.delete(requestsTable).where(eq(requestsTable.id, id));
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete request error:", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
