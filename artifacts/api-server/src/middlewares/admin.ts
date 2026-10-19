import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getAdminApiKey, getJwtSecret } from "../lib/env.js";

export interface AdminRequest extends Request {
  adminUser?: { sub: string; role: string };
}

export function requireAdminKey(req: AdminRequest, res: Response, next: NextFunction) {
  // Check API key header (for server scripts / integrations)
  const key = req.headers["x-admin-key"];
  if (typeof key === "string" && key === getAdminApiKey()) {
    return next();
  }

  // Check JWT Bearer token (for authenticated admin web UI sessions)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, getJwtSecret()) as { sub: string; role: string };
      if (payload && payload.role === "admin") {
        req.adminUser = payload;
        return next();
      }
    } catch {
      // invalid or expired token
    }
  }

  res.status(403).json({ error: "Ruxsat yo'q" });
}
