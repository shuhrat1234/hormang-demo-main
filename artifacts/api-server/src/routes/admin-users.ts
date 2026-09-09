import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, userModerationTable, walletsTable, providerProfilesTable, offersTable, type AdminNote } from "@workspace/db";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();
router.use(requireAdminKey);

async function getOrCreateModeration(userId: string) {
  const [existing] = await db.select().from(userModerationTable).where(eq(userModerationTable.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(userModerationTable).values({ userId }).returning();
  return created;
}

// ─── GET / — every user, joined with moderation flags + wallet balance ────
router.get("/", async (_req, res) => {
  try {
    const [users, moderations, wallets, providerProfiles, offerMasters] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(userModerationTable),
      db.select().from(walletsTable),
      db.select({ userId: providerProfilesTable.userId }).from(providerProfilesTable),
      db.selectDistinct({ masterId: offersTable.masterId }).from(offersTable),
    ]);
    const providerUserIds = new Set([
      ...providerProfiles.map((p) => p.userId),
      ...offerMasters.map((o) => o.masterId),
    ]);
    const modByUser = new Map(moderations.map((m) => [m.userId, m]));
    const walletByUser = new Map(wallets.map((w) => [w.userId, w.balance]));

    res.json({
      users: users.map((u) => {
        const mod = modByUser.get(u.id);
        const isProvider = u.role === "provider" || providerUserIds.has(u.id);
        const role = isProvider ? "provider" : u.role;
        if (u.role === "buyer" && isProvider) {
          db.update(usersTable).set({ role: "provider", updatedAt: new Date() }).where(eq(usersTable.id, u.id)).catch(() => {});
        }
        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          phone: u.phone,
          email: u.email,
          role,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          balance: walletByUser.get(u.id) ?? 0,
          suspended: mod?.suspended ?? false,
          verified: mod?.verified ?? false,
          flagCount: mod?.flagCount ?? 0,
          tags: mod?.tags ?? [],
          adminNotes: mod?.adminNotes ?? [],
        };
      }),
    });
  } catch (err) {
    console.error("List admin users error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.post("/:id/suspend", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { suspended } = req.body as { suspended?: boolean };
    if (typeof suspended !== "boolean") {
      res.status(400).json({ error: "suspended (boolean) talab qilinadi" });
      return;
    }
    await getOrCreateModeration(id);
    const [row] = await db
      .update(userModerationTable)
      .set({ suspended, updatedAt: new Date() })
      .where(eq(userModerationTable.userId, id))
      .returning();
    res.json({ moderation: row });
  } catch (err) {
    console.error("Suspend user error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.post("/:id/verify", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { verified } = req.body as { verified?: boolean };
    if (typeof verified !== "boolean") {
      res.status(400).json({ error: "verified (boolean) talab qilinadi" });
      return;
    }
    await getOrCreateModeration(id);
    const [row] = await db
      .update(userModerationTable)
      .set({ verified, updatedAt: new Date() })
      .where(eq(userModerationTable.userId, id))
      .returning();
    res.json({ moderation: row });
  } catch (err) {
    console.error("Verify user error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.post("/:id/flag", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { flagCount } = req.body as { flagCount?: number };
    if (flagCount == null || flagCount < 0) {
      res.status(400).json({ error: "flagCount (0 yoki musbat son) talab qilinadi" });
      return;
    }
    await getOrCreateModeration(id);
    const [row] = await db
      .update(userModerationTable)
      .set({ flagCount, updatedAt: new Date() })
      .where(eq(userModerationTable.userId, id))
      .returning();
    res.json({ moderation: row });
  } catch (err) {
    console.error("Flag user error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.put("/:id/tags", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { tags } = req.body as { tags?: string[] };
    if (!Array.isArray(tags)) {
      res.status(400).json({ error: "tags massiv bo'lishi kerak" });
      return;
    }
    await getOrCreateModeration(id);
    const [row] = await db
      .update(userModerationTable)
      .set({ tags, updatedAt: new Date() })
      .where(eq(userModerationTable.userId, id))
      .returning();
    res.json({ moderation: row });
  } catch (err) {
    console.error("Update user tags error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.post("/:id/notes", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { text } = req.body as { text?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: "text talab qilinadi" });
      return;
    }
    const mod = await getOrCreateModeration(id);
    const notes: AdminNote[] = [...(mod.adminNotes ?? []), { text: text.trim(), at: new Date().toISOString() }];
    const [row] = await db
      .update(userModerationTable)
      .set({ adminNotes: notes, updatedAt: new Date() })
      .where(eq(userModerationTable.userId, id))
      .returning();
    res.json({ moderation: row });
  } catch (err) {
    console.error("Add user note error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.delete("/:id/notes/:index", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const index = Number(req.params.index);
    const mod = await getOrCreateModeration(id);
    const notes = (mod.adminNotes ?? []).filter((_: AdminNote, i: number) => i !== index);
    const [row] = await db
      .update(userModerationTable)
      .set({ adminNotes: notes, updatedAt: new Date() })
      .where(eq(userModerationTable.userId, id))
      .returning();
    res.json({ moderation: row });
  } catch (err) {
    console.error("Remove user note error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── DELETE /:id — hard delete; wallets/transactions/provider_profiles/
// telegram_links/payment_orders/user_moderation all cascade via FK ────────
router.delete("/:id", async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const [row] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ ok: false });
  }
});

export default router;
