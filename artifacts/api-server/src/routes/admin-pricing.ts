import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pricingTiersTable } from "@workspace/db";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();
router.use(requireAdminKey);

interface TierBody {
  key?: string;
  name?: string; // uz — primary
  nameRu?: string;
  nameEn?: string;
  desc?: string;
  descRu?: string;
  descEn?: string;
  badge?: string;
  badgeRu?: string;
  badgeEn?: string;
  credits?: number;
  bonusTokens?: number;
  priceSom?: number;
  salePrice?: number | null;
  saleLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: string | null;
  validUntil?: string | null;
  status?: string;
  visibilityTarget?: string | null;
  featured?: boolean;
  hotOffer?: boolean;
  bonusPlan?: boolean;
  color?: string | null;
  active?: boolean;
  sortOrder?: number;
}

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toValues(body: TierBody) {
  const name = body.name?.trim();
  const nameRu = body.nameRu?.trim();
  const nameEn = body.nameEn?.trim();
  const desc = body.desc?.trim();
  const descRu = body.descRu?.trim();
  const descEn = body.descEn?.trim();
  const badge = body.badge?.trim();
  const badgeRu = body.badgeRu?.trim();
  const badgeEn = body.badgeEn?.trim();
  return {
    ...(body.key ? { key: body.key.trim() } : {}),
    ...(name ? { nameUz: name, nameRu: nameRu || name } : {}),
    nameEn: nameEn || null,
    descUz: desc || null,
    descRu: descRu || desc || null,
    descEn: descEn || null,
    badgeUz: badge || null,
    badgeRu: badgeRu || badge || null,
    badgeEn: badgeEn || null,
    ...(body.credits != null ? { credits: body.credits } : {}),
    ...(body.bonusTokens != null ? { bonusTokens: body.bonusTokens } : {}),
    ...(body.priceSom != null ? { priceSom: body.priceSom } : {}),
    salePrice: body.salePrice ?? null,
    saleLimit: body.saleLimit ?? null,
    perUserLimit: body.perUserLimit ?? null,
    startsAt: toDate(body.startsAt) ?? null,
    validUntil: toDate(body.validUntil) ?? null,
    ...(body.status ? { status: body.status } : {}),
    visibilityTarget: body.visibilityTarget ?? null,
    ...(body.featured != null ? { featured: body.featured } : {}),
    ...(body.hotOffer != null ? { hotOffer: body.hotOffer } : {}),
    ...(body.bonusPlan != null ? { bonusPlan: body.bonusPlan } : {}),
    color: body.color ?? null,
    ...(body.active != null ? { active: body.active } : {}),
    ...(body.sortOrder != null ? { sortOrder: body.sortOrder } : {}),
  };
}

router.get("/", async (_req, res) => {
  try {
    const tiers = await db.select().from(pricingTiersTable).orderBy(pricingTiersTable.sortOrder);
    res.json({ tiers });
  } catch (err) {
    console.error("List admin pricing tiers error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = req.body as TierBody;
    if (!body.key || !body.name || body.credits == null || body.priceSom == null) {
      res.status(400).json({ error: "key, name, credits, priceSom talab qilinadi" });
      return;
    }
    const [row] = await db
      .insert(pricingTiersTable)
      .values(toValues(body) as typeof pricingTiersTable.$inferInsert)
      .returning();
    res.status(201).json({ tier: row });
  } catch (err) {
    console.error("Create pricing tier error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.put("/reorder", async (req, res) => {
  try {
    const { items } = req.body as { items?: Array<{ id: string; sortOrder: number }> };
    if (!Array.isArray(items)) {
      res.status(400).json({ error: "items massiv bo'lishi kerak" });
      return;
    }
    await Promise.all(
      items.map((item) =>
        db
          .update(pricingTiersTable)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(pricingTiersTable.id, item.id))
      )
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Reorder pricing tiers error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [row] = await db
      .update(pricingTiersTable)
      .set({ ...toValues(req.body as TierBody), updatedAt: new Date() })
      .where(eq(pricingTiersTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Tarif topilmadi" });
      return;
    }
    res.json({ tier: row });
  } catch (err) {
    console.error("Update pricing tier error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.patch("/:id/active", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { active } = req.body as { active?: boolean };
    if (typeof active !== "boolean") {
      res.status(400).json({ error: "active (boolean) talab qilinadi" });
      return;
    }
    const [row] = await db
      .update(pricingTiersTable)
      .set({ active, updatedAt: new Date() })
      .where(eq(pricingTiersTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Tarif topilmadi" });
      return;
    }
    res.json({ tier: row });
  } catch (err) {
    console.error("Toggle pricing tier active error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [row] = await db.delete(pricingTiersTable).where(eq(pricingTiersTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete pricing tier error:", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
