import { Router, type IRouter } from "express";
import { eq, desc, and, gt } from "drizzle-orm";
import { db, userReportsTable, type UserReportRow } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();

const REASONS = ["spam", "fake_profile", "abuse", "fraud", "inappropriate_content", "outside_contact", "other"];

function toJson(row: UserReportRow) {
  return { ...row, attachments: row.attachments ?? [], createdAt: row.createdAt.toISOString() };
}

// ─── POST / — submit a report as the authenticated user ────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const reporterUserId = req.user!.id;
    const { reportedUserId, reason, description, attachments, source, chatId, lastMessageId } = req.body as {
      reportedUserId?: string; reason?: string; description?: string; attachments?: string[];
      source?: "profile" | "chat"; chatId?: string; lastMessageId?: string;
    };
    if (!reportedUserId || !reason || !REASONS.includes(reason)) {
      res.status(400).json({ error: "reportedUserId va reason talab qilinadi" });
      return;
    }
    if (reportedUserId === reporterUserId) {
      res.status(400).json({ error: "O'zingizga shikoyat qilib bo'lmaydi" });
      return;
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [duplicate] = await db
      .select()
      .from(userReportsTable)
      .where(and(
        eq(userReportsTable.reporterUserId, reporterUserId),
        eq(userReportsTable.reportedUserId, reportedUserId),
        gt(userReportsTable.createdAt, dayAgo),
      ))
      .limit(1);
    if (duplicate) {
      res.status(400).json({ error: "Bu foydalanuvchi haqida shikoyat qilingan" });
      return;
    }

    const [row] = await db
      .insert(userReportsTable)
      .values({
        reporterUserId, reportedUserId, reason: reason as UserReportRow["reason"],
        description: description?.trim() || null,
        attachments: attachments ?? [],
        source: source ?? "profile",
        chatId: chatId ?? null,
        lastMessageId: lastMessageId ?? null,
      })
      .returning();
    res.status(201).json({ report: toJson(row) });
  } catch (err) {
    console.error("Submit report error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /count/:userId — how many reports target this user ────────
router.get("/count/:userId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId: string = String(req.params.userId);
    if (req.user!.role !== "admin" && req.user!.id !== userId) {
      res.status(403).json({ error: "Ruxsat berilmagan" });
      return;
    }
    const rows = await db.select().from(userReportsTable).where(eq(userReportsTable.reportedUserId, userId));
    res.json({ count: rows.length });
  } catch (err) {
    console.error("Get report count error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /admin — every report, admin only ──────────────────────────────────
router.get("/admin", requireAdminKey, async (_req, res) => {
  try {
    const rows = await db.select().from(userReportsTable).orderBy(desc(userReportsTable.createdAt));
    res.json({ reports: rows.map(toJson) });
  } catch (err) {
    console.error("List reports error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /admin/:id/status — update status + admin note, admin only ─────
router.patch("/admin/:id/status", requireAdminKey, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { status, adminNote } = req.body as { status?: string; adminNote?: string };
    if (!status || !["new", "in_review", "resolved", "dismissed"].includes(status)) {
      res.status(400).json({ error: "status talab qilinadi" });
      return;
    }
    const [row] = await db
      .update(userReportsTable)
      .set({ status: status as UserReportRow["status"], ...(adminNote !== undefined ? { adminNote: adminNote || null } : {}) })
      .where(eq(userReportsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Shikoyat topilmadi" });
      return;
    }
    res.json({ report: toJson(row) });
  } catch (err) {
    console.error("Update report status error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

export default router;
