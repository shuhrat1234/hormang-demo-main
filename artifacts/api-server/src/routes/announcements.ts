import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, announcementsTable, type AnnouncementRow } from "@workspace/db";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();

function toJson(row: AnnouncementRow) {
  const titleLoc: { uz: string; ru?: string; en?: string } = { uz: row.titleUz };
  if (row.titleRu) titleLoc.ru = row.titleRu;
  if (row.titleEn) titleLoc.en = row.titleEn;

  const contentLoc: { uz: string; ru?: string; en?: string } = { uz: row.contentUz };
  if (row.contentRu) contentLoc.ru = row.contentRu;
  if (row.contentEn) contentLoc.en = row.contentEn;

  const ctaLoc: { uz?: string; ru?: string; en?: string } = {};
  if (row.ctaTextUz) ctaLoc.uz = row.ctaTextUz;
  if (row.ctaTextRu) ctaLoc.ru = row.ctaTextRu;
  if (row.ctaTextEn) ctaLoc.en = row.ctaTextEn;

  return {
    id: row.id,
    type: row.type,
    title: row.titleUz,
    titleLocalized: (titleLoc.ru || titleLoc.en) ? titleLoc : undefined,
    content: row.contentUz,
    contentLocalized: (contentLoc.ru || contentLoc.en) ? contentLoc : undefined,
    image: row.image ?? undefined,
    ctaText: row.ctaTextUz ?? undefined,
    ctaTextLocalized: Object.keys(ctaLoc).length > 0 ? ctaLoc : undefined,
    ctaLink: row.ctaLink ?? undefined,
    target: row.target,
    isPinned: row.isPinned,
    expiresAt: row.expiresAt?.toISOString(),
    status: row.status,
    publishAt: row.publishAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface AnnouncementBody {
  type?: "news" | "event";
  title?: string;
  titleLocalized?: { uz?: string; ru?: string; en?: string };
  content?: string;
  contentLocalized?: { uz?: string; ru?: string; en?: string };
  image?: string;
  ctaText?: string;
  ctaTextLocalized?: { uz?: string; ru?: string; en?: string };
  ctaLink?: string;
  target?: "all" | "providers" | "customers";
  isPinned?: boolean;
  expiresAt?: string;
  status?: "draft" | "published";
  publishAt?: string;
}

function toDate(v: string | undefined): Date | null {
  if (!v?.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── GET / — published, non-draft rows only, public ────────────────────────
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(announcementsTable)
      .where(eq(announcementsTable.status, "published"))
      .orderBy(desc(announcementsTable.createdAt));
    res.json({ announcements: rows.map(toJson) });
  } catch (err) {
    console.error("List published announcements error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /all — every row including drafts, admin only ─────────────────────
router.get("/all", requireAdminKey, async (_req, res) => {
  try {
    const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
    res.json({ announcements: rows.map(toJson) });
  } catch (err) {
    console.error("List all announcements error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.post("/", requireAdminKey, async (req, res) => {
  try {
    const body = req.body as AnnouncementBody;
    if (!body.title?.trim() || !body.content?.trim() || !body.type || !body.target || !body.status) {
      res.status(400).json({ error: "type, title, content, target, status talab qilinadi" });
      return;
    }
    const [row] = await db
      .insert(announcementsTable)
      .values({
        type: body.type,
        titleUz: body.title.trim(),
        titleRu: body.titleLocalized?.ru?.trim() || null,
        titleEn: body.titleLocalized?.en?.trim() || null,
        contentUz: body.content.trim(),
        contentRu: body.contentLocalized?.ru?.trim() || null,
        contentEn: body.contentLocalized?.en?.trim() || null,
        image: body.image?.trim() || null,
        ctaTextUz: body.ctaText?.trim() || null,
        ctaTextRu: body.ctaTextLocalized?.ru?.trim() || null,
        ctaTextEn: body.ctaTextLocalized?.en?.trim() || null,
        ctaLink: body.ctaLink?.trim() || null,
        target: body.target,
        isPinned: body.isPinned ?? false,
        expiresAt: toDate(body.expiresAt),
        status: body.status,
        publishAt: toDate(body.publishAt),
      })
      .returning();
    res.status(201).json({ announcement: toJson(row) });
  } catch (err) {
    console.error("Create announcement error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.put("/:id", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const body = req.body as AnnouncementBody;
    if (!body.title?.trim() || !body.content?.trim() || !body.type || !body.target || !body.status) {
      res.status(400).json({ error: "type, title, content, target, status talab qilinadi" });
      return;
    }
    const [row] = await db
      .update(announcementsTable)
      .set({
        type: body.type,
        titleUz: body.title.trim(),
        titleRu: body.titleLocalized?.ru?.trim() || null,
        titleEn: body.titleLocalized?.en?.trim() || null,
        contentUz: body.content.trim(),
        contentRu: body.contentLocalized?.ru?.trim() || null,
        contentEn: body.contentLocalized?.en?.trim() || null,
        image: body.image?.trim() || null,
        ctaTextUz: body.ctaText?.trim() || null,
        ctaTextRu: body.ctaTextLocalized?.ru?.trim() || null,
        ctaTextEn: body.ctaTextLocalized?.en?.trim() || null,
        ctaLink: body.ctaLink?.trim() || null,
        target: body.target,
        isPinned: body.isPinned ?? false,
        expiresAt: toDate(body.expiresAt),
        status: body.status,
        publishAt: toDate(body.publishAt),
        updatedAt: new Date(),
      })
      .where(eq(announcementsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "E'lon topilmadi" });
      return;
    }
    res.json({ announcement: toJson(row) });
  } catch (err) {
    console.error("Update announcement error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.patch("/:id/publish", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [existing] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "E'lon topilmadi" });
      return;
    }
    const [row] = await db
      .update(announcementsTable)
      .set({ status: existing.status === "published" ? "draft" : "published", updatedAt: new Date() })
      .where(eq(announcementsTable.id, id))
      .returning();
    res.json({ announcement: toJson(row) });
  } catch (err) {
    console.error("Toggle announcement publish error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.patch("/:id/pin", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [existing] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "E'lon topilmadi" });
      return;
    }
    const [row] = await db
      .update(announcementsTable)
      .set({ isPinned: !existing.isPinned, updatedAt: new Date() })
      .where(eq(announcementsTable.id, id))
      .returning();
    res.json({ announcement: toJson(row) });
  } catch (err) {
    console.error("Toggle announcement pin error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.delete("/:id", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [row] = await db.delete(announcementsTable).where(eq(announcementsTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete announcement error:", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
