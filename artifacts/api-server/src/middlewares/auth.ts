import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, userModerationTable } from "@workspace/db";
import { verifyAccessToken } from "../lib/auth.js";

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email?: string; phone?: string };
  token?: string;
}

// In-memory token blacklist for logged-out / revoked tokens
const revokedTokens = new Set<string>();

export function revokeToken(token: string): void {
  if (token) revokedTokens.add(token);
}

export function isTokenRevoked(token: string): boolean {
  return revokedTokens.has(token);
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Avtorizatsiya talab qilinadi" });
    return;
  }

  const token = header.slice(7);

  if (isTokenRevoked(token)) {
    res.status(401).json({ error: "Token bekor qilingan" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const userId = payload.sub as string;

    // S6: Validate against DB — verify account is not deleted or suspended
    const [user] = await db
      .select({
        id: usersTable.id,
        role: usersTable.role,
        email: usersTable.email,
        phone: usersTable.phone,
        deletedAt: usersTable.deletedAt,
        suspended: userModerationTable.suspended,
      })
      .from(usersTable)
      .leftJoin(userModerationTable, eq(userModerationTable.userId, usersTable.id))
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user || user.deletedAt) {
      res.status(401).json({ error: "Hisob o'chirilgan yoki topilmadi" });
      return;
    }

    if (user.suspended) {
      res.status(403).json({ error: "Hisob ma'muriyat tomonidan to'xtatilgan" });
      return;
    }

    req.user = { id: user.id, role: user.role, email: user.email ?? undefined, phone: user.phone ?? undefined };
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token yaroqsiz yoki muddati o'tgan" });
  }
}

export function requireRole(role: "buyer" | "provider") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }
    next();
  };
}
