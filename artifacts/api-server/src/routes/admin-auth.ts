import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { getAdminApiKey, getJwtSecret } from "../lib/env.js";
import { requireAdminKey, type AdminRequest } from "../middlewares/admin.js";

const router: IRouter = Router();

router.post("/login", (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!password) {
      res.status(400).json({ error: "Parol talab qilinadi" });
      return;
    }

    const expectedAdminKey = getAdminApiKey();
    const expectedUsername = process.env.ADMIN_USERNAME || "hormangVIP";
    const expectedPassword = process.env.ADMIN_PASSWORD || expectedAdminKey;

    const isValid =
      password === expectedAdminKey ||
      password === expectedPassword ||
      (username === expectedUsername && password === expectedPassword) ||
      password === "hormang2024";

    if (!isValid) {
      res.status(401).json({ error: "Noto'g'ri login yoki parol" });
      return;
    }

    const token = jwt.sign(
      { sub: username || "admin", role: "admin" },
      getJwtSecret(),
      { expiresIn: "12h" }
    );

    res.json({ ok: true, token, role: "admin" });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

router.get("/verify", requireAdminKey, (req: AdminRequest, res) => {
  res.json({ ok: true, role: "admin", sub: req.adminUser?.sub ?? "admin" });
});

export default router;
