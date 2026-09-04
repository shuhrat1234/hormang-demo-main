import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  db, requestsTable, offersTable, chatsTable, chatMessagesTable,
  walletsTable, tangaTransactionsTable, reviewsTable, providerProfilesTable, type OfferRow, type RequestRow, type Review,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();

const MAX_ACTIVE_OFFERS = 5;
const MAX_LIFETIME_OFFERS = 10;
const ACTIVE_STATUSES: OfferRow["status"][] = ["pending", "negotiating", "accepted"];
const MINIMUM_OFFER_COST = 2;

function toJson(row: OfferRow, masterPhotoUrl?: string | null) {
  return {
    ...row,
    masterPhotoUrl: masterPhotoUrl ?? undefined,
    priceLabel: row.priceLabel ?? undefined,
    fileUrls: row.fileUrls ?? undefined,
    tangaSpent: row.tangaSpent ?? undefined,
    completionAfterPhotos: row.completionAfterPhotos ?? undefined,
    completionNotes: row.completionNotes ?? undefined,
    completionDurationMinutes: row.completionDurationMinutes ?? undefined,
    completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
    portfolioTitle: row.portfolioTitle ?? undefined,
    portfolioDescription: row.portfolioDescription ?? undefined,
    portfolioCoverPhoto: row.portfolioCoverPhoto ?? undefined,
    portfolioAdditionalPhotos: row.portfolioAdditionalPhotos ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

type SubmitReason = "no_request" | "request_closed" | "matched" | "active_limit" | "lifetime_limit" | "already_offered" | "self_request";

async function canSubmitOffer(requestId: string, providerId: string): Promise<{ ok: boolean; reason?: SubmitReason; request?: RequestRow }> {
  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return { ok: false, reason: "no_request" };
  if (request.customerId === providerId) return { ok: false, reason: "self_request" };
  if (request.closedForOffers || request.acceptedOfferId || request.status === "matched") return { ok: false, reason: "matched" };
  if (request.status !== "open") return { ok: false, reason: "request_closed" };

  const existingOffers = await db.select().from(offersTable).where(eq(offersTable.requestId, requestId));
  if (existingOffers.length >= MAX_LIFETIME_OFFERS) return { ok: false, reason: "lifetime_limit" };
  const active = existingOffers.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  if (active >= MAX_ACTIVE_OFFERS) return { ok: false, reason: "active_limit" };
  const dup = existingOffers.some((o) => o.masterId === providerId && ACTIVE_STATUSES.includes(o.status));
  if (dup) return { ok: false, reason: "already_offered" };

  return { ok: true, request };
}

// ─── GET /mine — the authenticated provider's own offers ───────────────────
router.get("/mine", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        offer: offersTable,
        masterPhotoUrl: providerProfilesTable.photoUrl,
      })
      .from(offersTable)
      .leftJoin(providerProfilesTable, eq(providerProfilesTable.userId, offersTable.masterId))
      .where(eq(offersTable.masterId, req.user!.id))
      .orderBy(desc(offersTable.createdAt));
    res.json({ offers: rows.map((r) => toJson(r.offer, r.masterPhotoUrl)) });
  } catch (err) {
    console.error("List my offers error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /for-my-requests — every offer across the authenticated customer's
// own requests, in one call (avoids an N+1 fetch client-side) ───────────────
router.get("/for-my-requests", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        offer: offersTable,
        masterPhotoUrl: providerProfilesTable.photoUrl,
      })
      .from(offersTable)
      .innerJoin(requestsTable, eq(requestsTable.id, offersTable.requestId))
      .leftJoin(providerProfilesTable, eq(providerProfilesTable.userId, offersTable.masterId))
      .where(eq(requestsTable.customerId, req.user!.id))
      .orderBy(desc(offersTable.createdAt));
    res.json({ offers: rows.map((r) => toJson(r.offer, r.masterPhotoUrl)) });
  } catch (err) {
    console.error("List offers for my requests error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /by-request/:requestId — every offer on a request ──────────────────
router.get("/by-request/:requestId", requireAuth, async (req, res) => {
  try {
    const requestId: string = String(req.params.requestId);
    const rows = await db
      .select({
        offer: offersTable,
        masterPhotoUrl: providerProfilesTable.photoUrl,
      })
      .from(offersTable)
      .leftJoin(providerProfilesTable, eq(providerProfilesTable.userId, offersTable.masterId))
      .where(eq(offersTable.requestId, requestId))
      .orderBy(desc(offersTable.createdAt));
    res.json({ offers: rows.map((r) => toJson(r.offer, r.masterPhotoUrl)) });
  } catch (err) {
    console.error("List offers by request error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /:id ────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [row] = await db
      .select({
        offer: offersTable,
        masterPhotoUrl: providerProfilesTable.photoUrl,
      })
      .from(offersTable)
      .leftJoin(providerProfilesTable, eq(providerProfilesTable.userId, offersTable.masterId))
      .where(eq(offersTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    res.json({ offer: toJson(row.offer, row.masterPhotoUrl) });
  } catch (err) {
    console.error("Get offer error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST / — submit an offer: validate, atomically debit Tanga, create the
// offer + opening chat message, all in one transaction ──────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const masterId = req.user!.id;
    const body = req.body as {
      requestId?: string; price?: number; priceLabel?: string; message?: string;
      fileUrls?: string[]; costTanga?: number;
      masterName?: string; masterInitials?: string; masterColor?: string;
    };
    if (!body.requestId || !body.price || !body.message?.trim() || !body.costTanga) {
      res.status(400).json({ error: "requestId, price, message, costTanga talab qilinadi" });
      return;
    }
    const costTanga = Math.max(Math.floor(body.costTanga), MINIMUM_OFFER_COST);

    const check = await canSubmitOffer(body.requestId, masterId);
    if (!check.ok || !check.request) {
      res.status(400).json({ error: check.reason ?? "request_closed" });
      return;
    }

    let insufficientBalance = false;
    let createdOffer: OfferRow | undefined;

    await db.transaction(async (tx) => {
      const [wallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, masterId)).limit(1);
      const balance = wallet?.balance ?? 0;
      if (balance < costTanga) {
        insufficientBalance = true;
        return;
      }
      const newBalance = balance - costTanga;
      if (wallet) {
        await tx.update(walletsTable).set({ balance: newBalance, updatedAt: new Date() }).where(eq(walletsTable.userId, masterId));
      } else {
        await tx.insert(walletsTable).values({ userId: masterId, balance: newBalance });
      }

      const [offer] = await tx
        .insert(offersTable)
        .values({
          requestId: body.requestId!,
          masterId,
          masterName: body.masterName ?? "Ijrochi",
          masterInitials: body.masterInitials ?? "IJ",
          masterColor: body.masterColor ?? "#7C3AED",
          price: body.price!,
          priceLabel: body.priceLabel ?? null,
          message: body.message!.trim(),
          fileUrls: body.fileUrls?.length ? body.fileUrls : null,
          tangaSpent: costTanga,
        })
        .returning();
      createdOffer = offer;

      await tx.insert(tangaTransactionsTable).values({
        userId: masterId, type: "spend", direction: "out", amount: costTanga,
        description: check.request!.categoryName, offerId: offer.id, requestId: offer.requestId,
      });

      const chatId = `${offer.requestId}_${masterId}`;
      const [chat] = await tx
        .insert(chatsTable)
        .values({ id: chatId, requestId: offer.requestId, masterId })
        .onConflictDoNothing({ target: chatsTable.id })
        .returning();
      const chatRow = chat ?? (await tx.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1))[0];
      await tx.insert(chatMessagesTable).values({
        chatId: chatRow.id, sender: "master",
        text: `${body.priceLabel ?? body.price}\n\n${body.message!.trim()}`,
      });
      await tx.update(chatsTable).set({ customerUnread: sql`${chatsTable.customerUnread} + 1` }).where(eq(chatsTable.id, chatRow.id));
    });

    if (insufficientBalance) {
      res.status(400).json({ error: "insufficient_balance" });
      return;
    }
    const [profile] = await db
      .select({ photoUrl: providerProfilesTable.photoUrl })
      .from(providerProfilesTable)
      .where(eq(providerProfilesTable.userId, masterId))
      .limit(1);

    res.status(201).json({ offer: toJson(createdOffer!, profile?.photoUrl) });
  } catch (err) {
    console.error("Create offer error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /:id/status — accept/reject, by the request's owning customer ───
router.patch("/:id/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const { status } = req.body as { status?: "accepted" | "rejected" };
    if (status !== "accepted" && status !== "rejected") {
      res.status(400).json({ error: "status 'accepted' yoki 'rejected' bo'lishi kerak" });
      return;
    }
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, offer.requestId)).limit(1);
    if (!request || request.customerId !== req.user!.id) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(offersTable).set({ status }).where(eq(offersTable.id, id));

      const [chat] = await tx.select().from(chatsTable).where(and(eq(chatsTable.requestId, offer.requestId), eq(chatsTable.masterId, offer.masterId))).limit(1);
      if (chat) {
        await tx.insert(chatMessagesTable).values({
          chatId: chat.id, sender: "system",
          text: status === "accepted" ? "Taklif qabul qilindi" : "Taklif rad etildi",
        });
      }

      if (status === "accepted") {
        await tx.update(requestsTable).set({ status: "matched", acceptedOfferId: id, closedForOffers: true }).where(eq(requestsTable.id, offer.requestId));

        const siblings = await tx
          .select()
          .from(offersTable)
          .where(and(eq(offersTable.requestId, offer.requestId), inArray(offersTable.status, ACTIVE_STATUSES)));
        for (const sib of siblings) {
          if (sib.id === id) continue;
          await tx.update(offersTable).set({ status: "Yopilgan" }).where(eq(offersTable.id, sib.id));
          const [sibChat] = await tx.select().from(chatsTable).where(and(eq(chatsTable.requestId, offer.requestId), eq(chatsTable.masterId, sib.masterId))).limit(1);
          if (sibChat) {
            await tx.insert(chatMessagesTable).values({ chatId: sibChat.id, sender: "system", text: "Mijoz boshqa ijrochini tanladi" });
          }
        }
      }
    });

    const [updated] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    res.json({ offer: toJson(updated) });
  } catch (err) {
    console.error("Update offer status error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /:id/reopen — customer re-opens a rejected offer back to pending ─
router.patch("/:id/reopen", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      res.status(400).json({ error: "not_found" });
      return;
    }
    if (offer.status !== "rejected") {
      res.status(400).json({ error: "not_rejected" });
      return;
    }
    const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, offer.requestId)).limit(1);
    if (!request || request.customerId !== req.user!.id) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }
    if (request.status !== "open") {
      res.status(400).json({ error: "request_closed" });
      return;
    }
    const [alreadyAccepted] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(offersTable)
      .where(and(eq(offersTable.requestId, offer.requestId), eq(offersTable.status, "accepted")));
    if ((alreadyAccepted?.count ?? 0) > 0) {
      res.status(400).json({ error: "already_accepted" });
      return;
    }
    const [row] = await db.update(offersTable).set({ status: "pending" }).where(eq(offersTable.id, id)).returning();
    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Reopen offer error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /:id/in-progress — provider marks work started ──────────────────
router.patch("/:id/in-progress", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer || offer.masterId !== req.user!.id) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    const [row] = await db.update(offersTable).set({ status: "in_progress" }).where(eq(offersTable.id, id)).returning();
    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Mark offer in-progress error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /:id/confirm-completion — either party confirms; both flags → completed ─
router.patch("/:id/confirm-completion", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const { role, completion } = req.body as {
      role?: "provider" | "customer";
      completion?: { afterPhotos?: string[]; completionNotes?: string; durationMinutes?: number };
    };
    if (role !== "provider" && role !== "customer") {
      res.status(400).json({ error: "role 'provider' yoki 'customer' bo'lishi kerak" });
      return;
    }
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, offer.requestId)).limit(1);
    const isProvider = role === "provider" && offer.masterId === req.user!.id;
    const isCustomer = role === "customer" && request?.customerId === req.user!.id;
    if (!isProvider && !isCustomer) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }

    const providerConfirmedCompleted = role === "provider" ? true : offer.providerConfirmedCompleted;
    const customerConfirmedCompleted = role === "customer" ? true : offer.customerConfirmedCompleted;
    const bothConfirmed = providerConfirmedCompleted && customerConfirmedCompleted;

    const [row] = await db
      .update(offersTable)
      .set({
        providerConfirmedCompleted,
        customerConfirmedCompleted,
        status: bothConfirmed ? "completed" : offer.status,
        ...(bothConfirmed ? { completedAt: new Date() } : {}),
        ...(completion?.afterPhotos?.length ? { completionAfterPhotos: completion.afterPhotos } : {}),
        ...(completion?.completionNotes !== undefined ? { completionNotes: completion.completionNotes } : {}),
        ...(completion?.durationMinutes !== undefined ? { completionDurationMinutes: completion.durationMinutes } : {}),
      })
      .where(eq(offersTable.id, id))
      .returning();

    if (!bothConfirmed) {
      const [chat] = await db.select().from(chatsTable).where(and(eq(chatsTable.requestId, offer.requestId), eq(chatsTable.masterId, offer.masterId))).limit(1);
      if (chat) {
        await db.insert(chatMessagesTable).values({
          chatId: chat.id, sender: "system",
          text: role === "provider"
            ? "Ijrochi xizmat yakunlanganligini tasdiqladi. Mijoz tasdig'i kutilmoqda."
            : "Mijoz xizmat yakunlanganligini tasdiqladi. Ijrochi tasdig'i kutilmoqda.",
        });
      }
    }

    if (bothConfirmed && request) {
      await db.update(requestsTable).set({ status: "completed" }).where(eq(requestsTable.id, request.id));
      const [chat] = await db.select().from(chatsTable).where(and(eq(chatsTable.requestId, offer.requestId), eq(chatsTable.masterId, offer.masterId))).limit(1);
      if (chat) {
        await db.insert(chatMessagesTable).values({ chatId: chat.id, sender: "system", text: "Xizmat yakunlandi" });
      }
    }

    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Confirm offer completion error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── Provider service history — derived live from completed offers ─────────

const MAX_FEATURED_PROJECTS = 3;
const MAX_AFTER_PHOTOS = 10;

function descriptionFromAnswers(answers: Record<string, unknown>): string {
  const skip = new Set(["urgency", "budget", "budget_open", "region", "district", "location"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(answers ?? {})) {
    if (skip.has(k) || k.endsWith("_other")) continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "string") {
      if (v.startsWith("data:")) continue;
      parts.push(v);
    } else if (typeof v === "number") {
      parts.push(String(v));
    } else if (Array.isArray(v)) {
      const joined = (v as unknown[]).filter((x) => typeof x === "string" && !(x as string).startsWith("data:")).join(", ");
      if (joined) parts.push(joined);
    }
  }
  return parts.join(" · ");
}

type HistoryRow = { offer: OfferRow; request: RequestRow; review: Review | null };

function historyItemJson(row: HistoryRow, isRepeatCustomer: boolean) {
  const { offer, request, review } = row;
  const completedAt = (offer.completedAt ?? offer.createdAt).toISOString();
  return {
    id: offer.id,
    providerId: offer.masterId,
    customerId: request.customerId ?? undefined,
    customerName: request.customerName ?? undefined,
    requestId: offer.requestId,
    offerId: offer.id,
    categoryId: request.categoryId,
    categoryName: request.categoryName,
    emoji: request.emoji,
    serviceTitle: request.categoryName,
    serviceDescription: descriptionFromAnswers(request.answers),
    completionNotes: offer.completionNotes ?? undefined,
    finalPrice: offer.price,
    status: "completed" as const,
    rating: review?.rating,
    review: review?.comment ?? undefined,
    completedAt,
    durationMinutes: offer.completionDurationMinutes ?? undefined,
    beforePhotos: request.requestPhotos ?? undefined,
    afterPhotos: offer.completionAfterPhotos ?? undefined,
    region: request.region ?? undefined,
    district: request.district ?? undefined,
    isRepeatCustomer,
    isPortfolio: !!offer.portfolioTitle,
    portfolioData: offer.portfolioTitle ? {
      title: offer.portfolioTitle,
      description: offer.portfolioDescription ?? "",
      coverPhoto: offer.portfolioCoverPhoto ?? "",
      additionalPhotos: offer.portfolioAdditionalPhotos ?? [],
      featured: offer.portfolioFeatured,
      createdAt: completedAt,
    } : undefined,
  };
}

function computeStats(history: ReturnType<typeof historyItemJson>[]) {
  const totalCompleted = history.length;
  const totalEarnings = history.reduce((s, h) => s + (h.finalPrice || 0), 0);

  const now = new Date();
  const thisMonthEarnings = history.reduce((s, h) => {
    const d = new Date(h.completedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? s + (h.finalPrice || 0) : s;
  }, 0);

  const rated = history.filter((h) => typeof h.rating === "number");
  const averageRating = rated.length
    ? Math.round((rated.reduce((s, h) => s + (h.rating || 0), 0) / rated.length) * 100) / 100
    : 0;

  const successful = history.filter((h) => h.rating == null || (h.rating as number) >= 4).length;
  const successRate = totalCompleted ? Math.round((successful / totalCompleted) * 100) : 0;

  let mostPopularCategoryId: string | undefined;
  let mostPopularCategoryName: string | undefined;
  const counts = new Map<string, { name: string; n: number }>();
  for (const h of history) {
    const prev = counts.get(h.categoryId);
    counts.set(h.categoryId, { name: h.categoryName, n: (prev?.n ?? 0) + 1 });
  }
  let best = 0;
  for (const [id, { name, n }] of counts) {
    if (n > best) { best = n; mostPopularCategoryId = id; mostPopularCategoryName = name; }
  }

  const perCustomer = new Map<string, number>();
  for (const h of history) {
    if (!h.customerId) continue;
    perCustomer.set(h.customerId, (perCustomer.get(h.customerId) ?? 0) + 1);
  }
  let repeatCustomers = 0;
  for (const n of perCustomer.values()) if (n >= 2) repeatCustomers += 1;

  return { totalCompleted, totalEarnings, thisMonthEarnings, averageRating, successRate, mostPopularCategoryId, mostPopularCategoryName, repeatCustomers };
}

async function fetchProviderHistory(providerId: string) {
  const rows = await db
    .select({ offer: offersTable, request: requestsTable, review: reviewsTable })
    .from(offersTable)
    .innerJoin(requestsTable, eq(requestsTable.id, offersTable.requestId))
    .leftJoin(reviewsTable, and(
      eq(reviewsTable.requestId, offersTable.requestId),
      eq(reviewsTable.reviewedId, offersTable.masterId),
      eq(reviewsTable.reviewedRole, "provider"),
    ))
    .where(and(eq(offersTable.masterId, providerId), eq(offersTable.status, "completed")))
    .orderBy(desc(offersTable.completedAt), desc(offersTable.createdAt));

  const customerCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.request.customerId) customerCounts.set(r.request.customerId, (customerCounts.get(r.request.customerId) ?? 0) + 1);
  }

  return rows.map((r) => historyItemJson(r, !!r.request.customerId && (customerCounts.get(r.request.customerId) ?? 0) > 1));
}

// GET /history/:providerId — the provider's own completed-job history + stats.
router.get("/history/:providerId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const providerId: string = String(req.params.providerId);
    if (req.user!.id !== providerId) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }
    const history = await fetchProviderHistory(providerId);
    res.json({ history, stats: computeStats(history) });
  } catch (err) {
    console.error("Get provider history error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// GET /portfolio/:providerId — public, sanitized portfolio for the public profile.
router.get("/portfolio/:providerId", async (req, res) => {
  try {
    const providerId: string = String(req.params.providerId);
    const history = await fetchProviderHistory(providerId);
    const mapped = history
      .filter((h) => h.isPortfolio && h.portfolioData)
      .map((h) => {
        const p = h.portfolioData!;
        const cover = p.coverPhoto || h.afterPhotos?.[0] || h.beforePhotos?.[0];
        const photos = Array.from(new Set([cover, ...p.additionalPhotos].filter((x): x is string => !!x)));
        return {
          id: h.id,
          title: p.title,
          description: p.description,
          coverPhoto: cover,
          photos,
          categoryId: h.categoryId,
          categoryName: h.categoryName,
          emoji: h.emoji,
          completedAt: h.completedAt,
          durationMinutes: h.durationMinutes,
          rating: h.rating,
          review: h.review,
          featured: p.featured,
        };
      });
    mapped.sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
    });
    res.json({ portfolio: mapped });
  } catch (err) {
    console.error("Get public portfolio error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// PATCH /:id/after-photos — provider appends/replaces "after" photos on a completed job.
router.patch("/:id/after-photos", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const { afterPhotos } = req.body as { afterPhotos?: string[] };
    if (!Array.isArray(afterPhotos)) {
      res.status(400).json({ error: "afterPhotos massiv bo'lishi kerak" });
      return;
    }
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer || offer.masterId !== req.user!.id) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    const [row] = await db
      .update(offersTable)
      .set({ completionAfterPhotos: afterPhotos.slice(0, MAX_AFTER_PHOTOS) })
      .where(eq(offersTable.id, id))
      .returning();
    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Set after-photos error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// PATCH /:id/portfolio — publish/update a completed job as a portfolio project.
router.patch("/:id/portfolio", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const { title, description, coverPhoto, additionalPhotos, featured } = req.body as {
      title?: string; description?: string; coverPhoto?: string; additionalPhotos?: string[]; featured?: boolean;
    };
    if (!title?.trim() || !description?.trim() || !coverPhoto) {
      res.status(400).json({ error: "title, description, coverPhoto talab qilinadi" });
      return;
    }
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer || offer.masterId !== req.user!.id || offer.status !== "completed") {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }

    let resolvedFeatured = !!featured;
    if (resolvedFeatured) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(offersTable)
        .where(and(eq(offersTable.masterId, req.user!.id), eq(offersTable.portfolioFeatured, true), sql`${offersTable.id} != ${id}`));
      if (count >= MAX_FEATURED_PROJECTS) resolvedFeatured = false;
    }

    const [row] = await db
      .update(offersTable)
      .set({
        portfolioTitle: title.trim(),
        portfolioDescription: description.trim(),
        portfolioCoverPhoto: coverPhoto,
        portfolioAdditionalPhotos: additionalPhotos?.length ? additionalPhotos : null,
        portfolioFeatured: resolvedFeatured,
      })
      .where(eq(offersTable.id, id))
      .returning();
    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Save portfolio project error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// DELETE /:id/portfolio — remove a job from the portfolio.
router.delete("/:id/portfolio", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id: string = String(req.params.id);
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer || offer.masterId !== req.user!.id) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    const [row] = await db
      .update(offersTable)
      .set({ portfolioTitle: null, portfolioDescription: null, portfolioCoverPhoto: null, portfolioAdditionalPhotos: null, portfolioFeatured: false })
      .where(eq(offersTable.id, id))
      .returning();
    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Remove portfolio project error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── Admin ───────────────────────────────────────────────────────────────

// GET /admin/all — every offer, admin only.
router.get("/admin/all", requireAdminKey, async (_req, res) => {
  try {
    const rows = await db
      .select({
        offer: offersTable,
        masterPhotoUrl: providerProfilesTable.photoUrl,
      })
      .from(offersTable)
      .leftJoin(providerProfilesTable, eq(providerProfilesTable.userId, offersTable.masterId))
      .orderBy(desc(offersTable.createdAt));
    res.json({ offers: rows.map((r) => toJson(r.offer, r.masterPhotoUrl)) });
  } catch (err) {
    console.error("Admin list all offers error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── DELETE /admin/:id — admin removes a single offer (no tanga refund; the
// only refund path is the 50%-of-last-10-rejected batch below) ─────────────
router.delete("/admin/:id", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    await db.delete(offersTable).where(eq(offersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete offer error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// Force-complete (admin path) — mirrors markOfferCompleted.
router.post("/admin/:id/force-complete", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    await db.update(offersTable).set({ status: "completed", providerConfirmedCompleted: true, customerConfirmedCompleted: true, completedAt: new Date() }).where(eq(offersTable.id, id));
    await db.update(requestsTable).set({ status: "completed" }).where(eq(requestsTable.id, offer.requestId));
    const [chat] = await db.select().from(chatsTable).where(and(eq(chatsTable.requestId, offer.requestId), eq(chatsTable.masterId, offer.masterId))).limit(1);
    if (chat) {
      await db.insert(chatMessagesTable).values({ chatId: chat.id, sender: "system", text: "Admin tomonidan yakunlandi" });
    }
    const [row] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Admin force-complete offer error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// Force accept/reject (admin path).
router.patch("/admin/:id/status", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { status } = req.body as { status?: OfferRow["status"] };
    if (!status) {
      res.status(400).json({ error: "status talab qilinadi" });
      return;
    }
    const [row] = await db.update(offersTable).set({ status }).where(eq(offersTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: "Taklif topilmadi" });
      return;
    }
    res.json({ offer: toJson(row) });
  } catch (err) {
    console.error("Admin update offer status error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// 50%-refund-of-last-10 eligibility + execution — mirrors getLast10RejectedEligibility / adminRefundProvider.
router.get("/admin/refund-eligibility/:providerId", requireAdminKey, async (req, res) => {
  try {
    const providerId: string = String(req.params.providerId);
    const rows = await db.select().from(offersTable).where(eq(offersTable.masterId, providerId)).orderBy(desc(offersTable.createdAt)).limit(10);
    const eligible = rows.length === 10 && rows.every((o) => o.status === "rejected" && !o.refunded);
    const totalSpent = rows.reduce((s, o) => s + (o.tangaSpent ?? 0), 0);
    const refundAmount = Math.floor(totalSpent * 0.5);
    res.json({ eligible, refundAmount, offers: rows.map((r) => toJson(r)) });
  } catch (err) {
    console.error("Get refund eligibility error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.post("/admin/refund/:providerId", requireAdminKey, async (req, res) => {
  try {
    const providerId: string = String(req.params.providerId);
    const rows = await db.select().from(offersTable).where(eq(offersTable.masterId, providerId)).orderBy(desc(offersTable.createdAt)).limit(10);
    const eligible = rows.length === 10 && rows.every((o) => o.status === "rejected" && !o.refunded);
    if (!eligible) {
      res.status(400).json({ error: "not_eligible" });
      return;
    }
    const totalSpent = rows.reduce((s, o) => s + (o.tangaSpent ?? 0), 0);
    const refundAmount = Math.floor(totalSpent * 0.5);
    if (refundAmount <= 0) {
      res.status(400).json({ error: "zero_refund" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(offersTable).set({ refunded: true }).where(inArray(offersTable.id, rows.map((o) => o.id)));
      const [wallet] = await tx.select().from(walletsTable).where(eq(walletsTable.userId, providerId)).limit(1);
      const newBalance = (wallet?.balance ?? 0) + refundAmount;
      if (wallet) {
        await tx.update(walletsTable).set({ balance: newBalance, updatedAt: new Date() }).where(eq(walletsTable.userId, providerId));
      } else {
        await tx.insert(walletsTable).values({ userId: providerId, balance: newBalance });
      }
      await tx.insert(tangaTransactionsTable).values({
        userId: providerId, type: "refund", direction: "in", amount: refundAmount,
        description: "So'nggi 10 taklif rad etildi — 50% qaytarish",
      });
    });

    res.json({ ok: true, refundAmount });
  } catch (err) {
    console.error("Admin refund provider error:", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
