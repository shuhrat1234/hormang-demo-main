import { Router, type IRouter, type Request, type Response } from "express";
import { desc, count, sql, eq } from "drizzle-orm";
import { db, cookieConsentsTable, usersTable } from "@workspace/db";
import { verifyAccessToken } from "../lib/auth.js";
import { requireAdminKey } from "../middlewares/admin.js";

const router: IRouter = Router();

// ─── POST / — Record cookie agreement ─────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      consentStatus?: string; // 'accepted' | 'essential_only' | 'rejected'
      analytics?: boolean;
      marketing?: boolean;
    };

    const consentStatus = body.consentStatus === "essential_only" || body.consentStatus === "rejected"
      ? body.consentStatus
      : "accepted";

    const analytics = body.analytics !== undefined ? Boolean(body.analytics) : consentStatus === "accepted";
    const marketing = body.marketing !== undefined ? Boolean(body.marketing) : consentStatus === "accepted";

    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = verifyAccessToken(authHeader.slice(7));
        if (payload?.sub) {
          userId = String(payload.sub);
        }
      } catch {
        // guest or expired token
      }
    }

    const forwardedFor = req.headers["x-forwarded-for"];
    const ipAddress = typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0].trim()
      : (req.socket.remoteAddress ?? null);
    const userAgent = (req.headers["user-agent"] as string) ?? null;

    const [row] = await db
      .insert(cookieConsentsTable)
      .values({
        userId,
        consentStatus,
        analytics,
        marketing,
        ipAddress,
        userAgent,
      })
      .returning();

    res.status(201).json({
      ok: true,
      consent: {
        id: row.id,
        consentStatus: row.consentStatus,
        analytics: row.analytics,
        marketing: row.marketing,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("Save cookie consent error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /admin/summary — Admin analytics on cookie consent ─────────────────
router.get("/admin/summary", requireAdminKey, async (_req: Request, res: Response) => {
  try {
    const totalCount = await db.select({ count: count() }).from(cookieConsentsTable);
    const rows = await db
      .select({
        consent: cookieConsentsTable,
        userFirstName: usersTable.firstName,
        userLastName: usersTable.lastName,
        userPhone: usersTable.phone,
      })
      .from(cookieConsentsTable)
      .leftJoin(usersTable, eq(usersTable.id, cookieConsentsTable.userId))
      .orderBy(desc(cookieConsentsTable.createdAt))
      .limit(50);

    const stats = await db
      .select({
        status: cookieConsentsTable.consentStatus,
        count: count(),
      })
      .from(cookieConsentsTable)
      .groupBy(cookieConsentsTable.consentStatus);

    res.json({
      total: totalCount[0]?.count ?? 0,
      stats,
      recent: rows.map((r) => ({
        ...r.consent,
        createdAt: r.consent.createdAt.toISOString(),
        userName: r.userFirstName ? `${r.userFirstName} ${r.userLastName ?? ""}`.trim() : null,
        userPhone: r.userPhone ?? null,
      })),
    });
  } catch (err) {
    console.error("Admin cookie consents summary error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

export default router;
