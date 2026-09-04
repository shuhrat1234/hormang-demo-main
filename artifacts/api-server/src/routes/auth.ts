import { Router } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, usersTable, providerProfilesTable, userModerationTable } from "@workspace/db";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  COOKIE_OPTS,
} from "../lib/auth.js";
import type { AuthRequest } from "../middlewares/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { isEskizConfigured, isResendConfigured, env } from "../lib/env.js";
import { sendOtpSms } from "../lib/eskiz.js";
import { sendOtpEmail } from "../lib/resend.js";
import crypto from "crypto";

const router = Router();

// ─── OTP Store ────────────────────────────────────────────────────────────────
type OtpChannel = "sms" | "email";
interface OtpEntry { code: string; expiresAt: number; purpose: string; channel: OtpChannel }
const otpStore = new Map<string, OtpEntry>();

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"*".repeat(Math.max(user.length - visible.length, 1))}@${domain}`;
}

// ─── Login-time 2FA challenge store ────────────────────────────────────────
interface TwoFAChallenge { userId: string; expiresAt: number }
const twoFAChallengeStore = new Map<string, TwoFAChallenge>();

function storeTwoFAChallenge(userId: string): string {
  const id = crypto.randomUUID();
  twoFAChallengeStore.set(id, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });
  return id;
}

function consumeTwoFAChallenge(id: string): TwoFAChallenge | null {
  const entry = twoFAChallengeStore.get(id);
  if (!entry) return null;
  twoFAChallengeStore.delete(id);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

/** Phone/OTP-registered accounts never have a known password (see users.hasPassword
 *  doc comment) — only verify one if the account actually has one set. */
async function verifyCurrentPasswordIfSet(user: { hasPassword: boolean; passwordHash: string }, currentPassword?: string): Promise<boolean> {
  if (!user.hasPassword) return true;
  if (!currentPassword) return false;
  return comparePassword(currentPassword, user.passwordHash);
}

async function isUserSuspended(userId: string): Promise<boolean> {
  const [mod] = await db
    .select({ suspended: userModerationTable.suspended })
    .from(userModerationTable)
    .where(eq(userModerationTable.userId, userId))
    .limit(1);
  return mod?.suspended ?? false;
}

function otpKey(channel: OtpChannel, destination: string): string {
  return `${channel}:${channel === "sms" ? normalizePhone(destination) : normalizeEmail(destination)}`;
}

function storeOtp(channel: OtpChannel, destination: string, purpose: string): string {
  const code = (!env.isProduction && channel === "sms")
    ? "000000"
    : Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(otpKey(channel, destination), { code, expiresAt: Date.now() + 5 * 60 * 1000, purpose, channel });
  return code;
}

function verifyOtp(channel: OtpChannel, destination: string, code: string, purpose: string): boolean {
  if (!env.isProduction && channel === "sms" && code === "000000") {
    const key = otpKey(channel, destination);
    otpStore.delete(key);
    return true;
  }
  const key = otpKey(channel, destination);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { otpStore.delete(key); return false; }
  if (entry.purpose !== purpose) return false;
  if (entry.code !== code) return false;
  otpStore.delete(key);
  return true;
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const loginAttempts = new Map<string, { count: number; lockedUntil?: number }>();

function checkRateLimit(key: string): { blocked: boolean; remaining: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key) ?? { count: 0 };
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { blocked: true, remaining: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (entry.lockedUntil && now >= entry.lockedUntil) loginAttempts.delete(key);
  return { blocked: false, remaining: 5 - entry.count };
}

function recordFailedAttempt(key: string) {
  const entry = loginAttempts.get(key) ?? { count: 0 };
  entry.count += 1;
  if (entry.count >= 5) entry.lockedUntil = Date.now() + 5 * 60 * 1000;
  loginAttempts.set(key, entry);
}

function clearAttempts(key: string) { loginAttempts.delete(key); }

async function getProviderProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(providerProfilesTable)
    .where(eq(providerProfilesTable.userId, userId))
    .limit(1);
  return profile ?? null;
}

// ─── POST /sms/send ─────────────────────────────────────────────────────────
router.post("/sms/send", async (req, res) => {
  try {
    const { phone, purpose, forceSms } = req.body as { phone?: string; purpose?: string; forceSms?: boolean };

    if (!phone || !purpose) {
      res.status(400).json({ error: "Telefon raqami va maqsad talab qilinadi" });
      return;
    }

    const normalized = normalizePhone(phone);
    const digitsOnly = normalized.replace(/\D/g, "");
    if (digitsOnly.length < 9) {
      res.status(400).json({ error: "Noto'g'ri telefon raqami" });
      return;
    }

    if (!["register", "login", "migrate", "add-phone"].includes(purpose)) {
      res.status(400).json({ error: "Noto'g'ri maqsad" });
      return;
    }

    if (purpose === "login") {
      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, normalized))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "Bu raqam ro'yxatdan o'tmagan" });
        return;
      }
    }

    if (purpose === "register") {
      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, normalized))
        .limit(1);
      if (user) {
        res.status(409).json({ error: "Bu raqam allaqachon ro'yxatdan o'tgan" });
        return;
      }
    }

    // SMS delivery has been unreliable for some carriers — if this account already
    // has a verified email on file, prefer that channel for login codes instead,
    // unless the client explicitly asks to fall back to SMS (e.g. no inbox access).
    if (purpose === "login" && !forceSms && isResendConfigured()) {
      const [loginUser] = await db
        .select({ email: usersTable.email, emailVerified: usersTable.emailVerified })
        .from(usersTable)
        .where(eq(usersTable.phone, normalized))
        .limit(1);

      if (loginUser?.emailVerified && loginUser.email) {
        const code = storeOtp("email", loginUser.email, purpose);
        try {
          await sendOtpEmail(loginUser.email, code);
          res.json({
            ok: true,
            channel: "email",
            maskedDestination: maskEmail(loginUser.email),
            ...(env.isProduction ? {} : { devCode: code }),
          });
          return;
        } catch (emailErr) {
          console.error("Resend email send error, falling back to SMS:", emailErr);
          // Fall through to SMS below.
        }
      }
    }

    const code = storeOtp("sms", normalized, purpose);

    if (isEskizConfigured()) {
      try {
        await sendOtpSms(normalized, code);
      } catch (smsErr) {
        console.error("Eskiz SMS send error:", smsErr);
        if (env.isProduction) {
          res.status(502).json({ error: "SMS yuborishda xatolik yuz berdi. Qayta urinib ko'ring." });
          return;
        }
      }
    } else if (env.isProduction) {
      console.error("Eskiz SMS is not configured — cannot send OTP in production.");
      res.status(502).json({ error: "SMS xizmati sozlanmagan" });
      return;
    }

    // devCode is only ever returned outside production, so a real code can never
    // leak in the API response once Eskiz is live.
    res.json({ ok: true, channel: "sms", ...(env.isProduction ? {} : { devCode: code }) });
  } catch (err) {
    console.error("SMS send error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /register (phone + OTP) ──────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, phone, otp, role } = req.body as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      otp?: string;
      role?: "buyer" | "provider";
    };

    if (!firstName || !lastName || !phone || !otp) {
      res.status(400).json({ error: "Ism, familiya, telefon va tasdiqlash kodi talab qilinadi" });
      return;
    }
    if (!role || !["buyer", "provider"].includes(role)) {
      res.status(400).json({ error: "Noto'g'ri rol" });
      return;
    }

    const normalized = normalizePhone(phone);

    if (!verifyOtp("sms", normalized, otp, "register")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Bu raqam allaqachon ro'yxatdan o'tgan" });
      return;
    }

    const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));

    const [user] = await db
      .insert(usersTable)
      .values({ firstName, lastName, phone: normalized, passwordHash, role })
      .returning();

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined };
    const accessToken = generateAccessToken({ ...user });
    const refreshToken = generateRefreshToken(user.id);

    res.cookie("refreshToken", refreshToken, COOKIE_OPTS);
    res.status(201).json({ user: safeUser, accessToken, providerProfile: null });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi. Qayta urinib ko'ring." });
  }
});

// ─── POST /register/provider-profile ────────────────────────────────────────
router.post("/register/provider-profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { categories, bio, workingHours, preferredLocation } = req.body as {
      categories: string[];
      bio?: string;
      workingHours?: string;
      preferredLocation?: string;
    };

    if (!categories?.length) {
      res.status(400).json({ error: "Kamida bitta kategoriya tanlang" });
      return;
    }

    const existing = await db
      .select({ id: providerProfilesTable.id })
      .from(providerProfilesTable)
      .where(eq(providerProfilesTable.userId, req.user!.id))
      .limit(1);

    if (existing.length > 0) {
      const [profile] = await db
        .update(providerProfilesTable)
        .set({ categories, bio, workingHours, preferredLocation, updatedAt: new Date() })
        .where(eq(providerProfilesTable.userId, req.user!.id))
        .returning();
      await db
        .update(usersTable)
        .set({ role: "provider", updatedAt: new Date() })
        .where(eq(usersTable.id, req.user!.id));
      res.json({ profile });
      return;
    }

    const [profile] = await db
      .insert(providerProfilesTable)
      .values({ userId: req.user!.id, categories, bio, workingHours, preferredLocation })
      .returning();

    await db
      .update(usersTable)
      .set({ role: "provider", updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id));

    res.status(201).json({ profile });
  } catch (err) {
    console.error("Provider profile error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi. Qayta urinib ko'ring." });
  }
});

// ─── POST /login (phone + OTP) ──────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  const normalized = normalizePhone(phone ?? "");
  const { blocked, remaining } = checkRateLimit(normalized);

  if (blocked) {
    res.status(429).json({ error: `Juda ko'p urinish. ${remaining} soniyadan so'ng qayta urinib ko'ring.` });
    return;
  }

  try {
    if (!phone || !otp) {
      res.status(400).json({ error: "Telefon va tasdiqlash kodi talab qilinadi" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    if (!user) {
      recordFailedAttempt(normalized);
      res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }

    // The code may have gone out over email or SMS (see /sms/send — email is
    // preferred when verified, but the client can force SMS via the "no inbox
    // access" fallback), and this endpoint isn't told which one was actually
    // used, so check whichever channel's stored code matches.
    const otpOk =
      (user.emailVerified && !!user.email && verifyOtp("email", user.email, otp, "login")) ||
      verifyOtp("sms", normalized, otp, "login");

    if (!otpOk) {
      recordFailedAttempt(normalized);
      res.status(401).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    clearAttempts(normalized);

    if (await isUserSuspended(user.id)) {
      res.status(403).json({ error: "Hisobingiz vaqtincha to'xtatilgan. Iltimos, qo'llab-quvvatlash bilan bog'laning." });
      return;
    }

    if (user.twoFactorEnabled) {
      const challengeId = storeTwoFAChallenge(user.id);
      res.json({ needs2FA: true, challengeId, hint: user.twoFactorHint ?? undefined });
      return;
    }

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const providerProfile = user.role === "provider" ? await getProviderProfile(user.id) : null;

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined, suspended: false };
    const accessToken = generateAccessToken({ ...user });
    const refreshToken = generateRefreshToken(user.id);

    res.cookie("refreshToken", refreshToken, COOKIE_OPTS);
    res.json({ user: safeUser, accessToken, providerProfile });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi. Qayta urinib ko'ring." });
  }
});

// ─── POST /login-email/send (send a login code to a verified email, no phone) ─
router.post("/login-email/send", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: "To'g'ri email talab qilinadi" });
      return;
    }
    const normalized = normalizeEmail(email);

    const [user] = await db
      .select({ id: usersTable.id, emailVerified: usersTable.emailVerified })
      .from(usersTable)
      .where(eq(usersTable.email, normalized))
      .limit(1);

    if (!user || !user.emailVerified) {
      res.status(404).json({ error: "Bu email ro'yxatdan o'tmagan" });
      return;
    }

    if (!isResendConfigured()) {
      res.status(502).json({ error: "Email xizmati sozlanmagan" });
      return;
    }

    const code = storeOtp("email", normalized, "login");
    await sendOtpEmail(normalized, code);
    res.json({ ok: true, maskedDestination: maskEmail(normalized), ...(env.isProduction ? {} : { devCode: code }) });
  } catch (err) {
    console.error("Login-email send error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /login-email (verify the code, log in by email — no phone needed) ─
router.post("/login-email", async (req, res) => {
  const { email, otp } = req.body as { email?: string; otp?: string };
  if (!email || !otp) {
    res.status(400).json({ error: "Email va tasdiqlash kodi talab qilinadi" });
    return;
  }
  const normalized = normalizeEmail(email);
  const { blocked, remaining } = checkRateLimit(`email:${normalized}`);
  if (blocked) {
    res.status(429).json({ error: `Juda ko'p urinish. ${remaining} soniyadan so'ng qayta urinib ko'ring.` });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalized))
      .limit(1);

    if (!user) {
      recordFailedAttempt(`email:${normalized}`);
      res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }

    if (!verifyOtp("email", normalized, otp, "login")) {
      recordFailedAttempt(`email:${normalized}`);
      res.status(401).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    clearAttempts(`email:${normalized}`);

    if (await isUserSuspended(user.id)) {
      res.status(403).json({ error: "Hisobingiz vaqtincha to'xtatilgan. Iltimos, qo'llab-quvvatlash bilan bog'laning." });
      return;
    }

    if (user.twoFactorEnabled) {
      const challengeId = storeTwoFAChallenge(user.id);
      res.json({ needs2FA: true, challengeId, hint: user.twoFactorHint ?? undefined });
      return;
    }

    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const providerProfile = user.role === "provider" ? await getProviderProfile(user.id) : null;

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined, suspended: false };
    const accessToken = generateAccessToken({ ...user });
    const refreshToken = generateRefreshToken(user.id);

    res.cookie("refreshToken", refreshToken, COOKIE_OPTS);
    res.json({ user: safeUser, accessToken, providerProfile });
  } catch (err) {
    console.error("Login-email error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi. Qayta urinib ko'ring." });
  }
});

// ─── POST /2fa/verify-login (consume a login challenge with the user's 2FA code) ─
router.post("/2fa/verify-login", async (req, res) => {
  try {
    const { challengeId, otp } = req.body as { challengeId?: string; otp?: string };
    if (!challengeId || !otp) {
      res.status(400).json({ error: "Kod talab qilinadi" });
      return;
    }

    const challenge = consumeTwoFAChallenge(challengeId);
    if (!challenge) {
      res.status(401).json({ error: "Sessiya muddati o'tgan. Qaytadan urinib ko'ring." });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, challenge.userId)).limit(1);
    if (!user || !user.twoFactorEnabled || !user.twoFactorCodeHash) {
      res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }

    if (!(await comparePassword(otp, user.twoFactorCodeHash))) {
      res.status(401).json({ error: "Kod noto'g'ri" });
      return;
    }

    if (await isUserSuspended(user.id)) {
      res.status(403).json({ error: "Hisobingiz vaqtincha to'xtatilgan. Iltimos, qo'llab-quvvatlash bilan bog'laning." });
      return;
    }

    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

    const providerProfile = user.role === "provider" ? await getProviderProfile(user.id) : null;
    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined, suspended: false };
    const accessToken = generateAccessToken({ ...user });
    const refreshToken = generateRefreshToken(user.id);

    res.cookie("refreshToken", refreshToken, COOKIE_OPTS);
    res.json({ user: safeUser, accessToken, providerProfile });
  } catch (err) {
    console.error("2FA verify-login error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /migrate-account (email+password → add phone → migrate to OTP) ───
router.post("/migrate-account", async (req, res) => {
  try {
    const { email, password, phone, otp } = req.body as {
      email?: string;
      password?: string;
      phone?: string;
      otp?: string;
    };

    if (!email || !password || !phone || !otp) {
      res.status(400).json({ error: "Barcha maydonlar talab qilinadi" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Email yoki parol noto'g'ri" });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Email yoki parol noto'g'ri" });
      return;
    }

    const normalized = normalizePhone(phone);

    if (!verifyOtp("sms", normalized, otp, "migrate")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    const [phoneConflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    if (phoneConflict && phoneConflict.id !== user.id) {
      res.status(409).json({ error: "Bu raqam boshqa hisob bilan bog'liq" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ phone: normalized, hasPassword: true, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();

    const providerProfile = updated.role === "provider" ? await getProviderProfile(updated.id) : null;

    const safeUser = { ...updated, passwordHash: undefined, twoFactorCodeHash: undefined };
    const accessToken = generateAccessToken({ ...updated });
    const refreshToken = generateRefreshToken(updated.id);

    res.cookie("refreshToken", refreshToken, COOKIE_OPTS);
    res.json({ user: safeUser, accessToken, providerProfile });
  } catch (err) {
    console.error("Migrate account error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /refresh ─────────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ error: "Refresh token topilmadi" });
    return;
  }
  try {
    const payload = verifyRefreshToken(token);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.sub as string))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }

    const accessToken = generateAccessToken({ ...user });
    const newRefreshToken = generateRefreshToken(user.id);

    res.cookie("refreshToken", newRefreshToken, COOKIE_OPTS);
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: "Token yaroqsiz" });
  }
});

// ─── POST /logout ───────────────────────────────────────────────────────────
router.post("/logout", (_req, res) => {
  res.clearCookie("refreshToken", { path: "/" });
  res.json({ ok: true });
});

// ─── PUT /profile ──────────────────────────────────────────────────────────
router.put("/profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (email !== undefined) updates.email = email || null;

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PUT /add-phone (add phone to existing logged-in account) ──────────────
router.put("/add-phone", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { phone, otp } = req.body as { phone?: string; otp?: string };

    if (!phone || !otp) {
      res.status(400).json({ error: "Telefon va tasdiqlash kodi talab qilinadi" });
      return;
    }

    const normalized = normalizePhone(phone);

    if (!verifyOtp("sms", normalized, otp, "add-phone")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    const [phoneConflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    if (phoneConflict && phoneConflict.id !== req.user!.id) {
      res.status(409).json({ error: "Bu raqam boshqa hisob bilan bog'liq" });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set({ phone: normalized, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Add phone error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /email/send (send OTP to attach/verify an email on the logged-in account) ─
router.post("/email/send", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ error: "Email talab qilinadi" });
      return;
    }

    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      res.status(400).json({ error: "Noto'g'ri email manzili" });
      return;
    }

    const [conflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalized))
      .limit(1);

    if (conflict && conflict.id !== req.user!.id) {
      res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
      return;
    }

    if (!isResendConfigured()) {
      console.error("Resend is not configured — cannot send email OTP.");
      res.status(502).json({ error: "Email xizmati sozlanmagan" });
      return;
    }

    const code = storeOtp("email", normalized, "register-email");
    try {
      await sendOtpEmail(normalized, code);
    } catch (emailErr) {
      console.error("Resend email send error:", emailErr);
      res.status(502).json({ error: "Email yuborishda xatolik yuz berdi. Qayta urinib ko'ring." });
      return;
    }

    res.json({ ok: true, ...(env.isProduction ? {} : { devCode: code }) });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PUT /email/verify (confirm the OTP and attach the email to the account) ─
router.put("/email/verify", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };

    if (!email || !otp) {
      res.status(400).json({ error: "Email va tasdiqlash kodi talab qilinadi" });
      return;
    }

    const normalized = normalizeEmail(email);

    if (!verifyOtp("email", normalized, otp, "register-email")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    const [conflict] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalized))
      .limit(1);

    if (conflict && conflict.id !== req.user!.id) {
      res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set({ email: normalized, emailVerified: true, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Email verify error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── Change phone number — password, then an email code (proves account
// ownership), then an SMS code to the new number itself (proves control of
// that number) — three factors before the phone on file ever changes. ──────

// POST /change-phone/start — verify password, email the account's own
// (already-verified) address a code.
router.post("/change-phone/start", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPhone } = req.body as { currentPassword?: string; newPhone?: string };
    if (!currentPassword || !newPhone) {
      res.status(400).json({ error: "Joriy parol va yangi raqam talab qilinadi" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    if (!(await verifyCurrentPasswordIfSet(user, currentPassword))) {
      res.status(401).json({ error: "Parol noto'g'ri" });
      return;
    }
    if (!user.email || !user.emailVerified) {
      res.status(400).json({ error: "Email tasdiqlanmagan — avval tasdiqlangan email qo'shing" });
      return;
    }

    const normalized = normalizePhone(newPhone);
    if (normalized.replace(/\D/g, "").length < 9) {
      res.status(400).json({ error: "Noto'g'ri telefon raqami" });
      return;
    }
    if (normalized === normalizePhone(user.phone ?? "")) {
      res.status(400).json({ error: "Yangi raqam joriy raqam bilan bir xil" });
      return;
    }
    const [phoneConflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, normalized)).limit(1);
    if (phoneConflict && phoneConflict.id !== user.id) {
      res.status(409).json({ error: "Bu raqam boshqa hisob bilan bog'liq" });
      return;
    }

    if (!isResendConfigured()) {
      console.error("Resend is not configured — cannot send change-phone email OTP.");
      res.status(502).json({ error: "Email xizmati sozlanmagan" });
      return;
    }
    const code = storeOtp("email", user.email, "change-phone-email");
    try {
      await sendOtpEmail(user.email, code);
    } catch (emailErr) {
      console.error("Resend email send error:", emailErr);
      res.status(502).json({ error: "Email yuborishda xatolik yuz berdi. Qayta urinib ko'ring." });
      return;
    }

    res.json({ ok: true, maskedEmail: maskEmail(user.email), ...(env.isProduction ? {} : { devCode: code }) });
  } catch (err) {
    console.error("Change phone start error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// POST /change-phone/verify-email — confirms the email code, then sends an
// SMS code to the NEW number to prove the requester actually controls it.
router.post("/change-phone/verify-email", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { newPhone, otp } = req.body as { newPhone?: string; otp?: string };
    if (!newPhone || !otp) {
      res.status(400).json({ error: "Yangi raqam va tasdiqlash kodi talab qilinadi" });
      return;
    }

    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user?.email || !verifyOtp("email", user.email, otp, "change-phone-email")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    const normalized = normalizePhone(newPhone);
    const [phoneConflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, normalized)).limit(1);
    if (phoneConflict && phoneConflict.id !== req.user!.id) {
      res.status(409).json({ error: "Bu raqam boshqa hisob bilan bog'liq" });
      return;
    }

    const code = storeOtp("sms", normalized, "change-phone-sms");
    if (isEskizConfigured()) {
      try {
        await sendOtpSms(normalized, code);
      } catch (smsErr) {
        console.error("Eskiz SMS send error:", smsErr);
        if (env.isProduction) {
          res.status(502).json({ error: "SMS yuborishda xatolik yuz berdi. Qayta urinib ko'ring." });
          return;
        }
      }
    } else if (env.isProduction) {
      console.error("Eskiz SMS is not configured — cannot send change-phone SMS OTP.");
      res.status(502).json({ error: "SMS xizmati sozlanmagan" });
      return;
    }

    res.json({ ok: true, ...(env.isProduction ? {} : { devCode: code }) });
  } catch (err) {
    console.error("Change phone verify-email error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// POST /change-phone/verify-sms — final step: confirms the SMS code and
// applies the new phone number.
router.post("/change-phone/verify-sms", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { newPhone, otp } = req.body as { newPhone?: string; otp?: string };
    if (!newPhone || !otp) {
      res.status(400).json({ error: "Yangi raqam va tasdiqlash kodi talab qilinadi" });
      return;
    }

    const normalized = normalizePhone(newPhone);
    if (!verifyOtp("sms", normalized, otp, "change-phone-sms")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    const [phoneConflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, normalized)).limit(1);
    if (phoneConflict && phoneConflict.id !== req.user!.id) {
      res.status(409).json({ error: "Bu raqam boshqa hisob bilan bog'liq" });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set({ phone: normalized, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id))
      .returning();

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Change phone verify-sms error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── Change email (password-if-set, then OTP to the new address) ──────────

// POST /change-email/start — verify password (if the account has one), send
// an OTP to the NEW address to prove control of it.
router.post("/change-email/start", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newEmail } = req.body as { currentPassword?: string; newEmail?: string };
    if (!newEmail) {
      res.status(400).json({ error: "Yangi email talab qilinadi" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    if (!user.email || !user.emailVerified) {
      res.status(400).json({ error: "Avval tasdiqlangan email qo'shing" });
      return;
    }
    if (!(await verifyCurrentPasswordIfSet(user, currentPassword))) {
      res.status(401).json({ error: "Parol noto'g'ri" });
      return;
    }

    const normalized = normalizeEmail(newEmail);
    if (!isValidEmail(normalized)) {
      res.status(400).json({ error: "Noto'g'ri email manzili" });
      return;
    }
    if (normalized === normalizeEmail(user.email)) {
      res.status(400).json({ error: "Yangi email joriy email bilan bir xil" });
      return;
    }
    const [conflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
    if (conflict && conflict.id !== user.id) {
      res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
      return;
    }

    if (!isResendConfigured()) {
      console.error("Resend is not configured — cannot send change-email OTP.");
      res.status(502).json({ error: "Email xizmati sozlanmagan" });
      return;
    }
    const code = storeOtp("email", normalized, "change-email");
    try {
      await sendOtpEmail(normalized, code);
    } catch (emailErr) {
      console.error("Resend email send error:", emailErr);
      res.status(502).json({ error: "Email yuborishda xatolik yuz berdi. Qayta urinib ko'ring." });
      return;
    }

    await db.update(usersTable).set({ pendingEmail: normalized, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    res.json({ ok: true, ...(env.isProduction ? {} : { devCode: code }) });
  } catch (err) {
    console.error("Change email start error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// PUT /change-email/verify — confirms the OTP sent to the new address and applies it.
router.put("/change-email/verify", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { otp } = req.body as { otp?: string };
    if (!otp) {
      res.status(400).json({ error: "Tasdiqlash kodi talab qilinadi" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user?.pendingEmail) {
      res.status(400).json({ error: "Email o'zgartirish so'rovi topilmadi" });
      return;
    }

    if (!verifyOtp("email", user.pendingEmail, otp, "change-email")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    const [conflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, user.pendingEmail)).limit(1);
    if (conflict && conflict.id !== user.id) {
      res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ email: user.pendingEmail, emailVerified: true, pendingEmail: null, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();

    const safeUser = { ...updated, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Change email verify error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// POST /change-email/cancel — drop a pending change without applying it.
router.post("/change-email/cancel", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(usersTable).set({ pendingEmail: null, updatedAt: new Date() }).where(eq(usersTable.id, req.user!.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Change email cancel error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── 2FA: user-chosen login PIN + hint, gated at login by /2fa/verify-login ─

// POST /2fa/setup — set (or replace) the account's 2FA code + hint.
router.post("/2fa/setup", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, code, hint } = req.body as { currentPassword?: string; code?: string; hint?: string };
    if (!code || code.length < 4) {
      res.status(400).json({ error: "Kod kamida 4 belgidan iborat bo'lishi kerak" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    if (!(await verifyCurrentPasswordIfSet(user, currentPassword))) {
      res.status(401).json({ error: "Parol noto'g'ri" });
      return;
    }

    const codeHash = await hashPassword(code);
    const [updated] = await db
      .update(usersTable)
      .set({ twoFactorEnabled: true, twoFactorCodeHash: codeHash, twoFactorHint: hint || null, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();

    const safeUser = { ...updated, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("2FA setup error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// POST /2fa/disable
router.post("/2fa/disable", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword } = req.body as { currentPassword?: string };

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    if (!(await verifyCurrentPasswordIfSet(user, currentPassword))) {
      res.status(401).json({ error: "Parol noto'g'ri" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ twoFactorEnabled: false, twoFactorCodeHash: null, twoFactorHint: null, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id))
      .returning();

    const safeUser = { ...updated, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("2FA disable error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── Delete account: password-if-set, then an SMS code to the phone on file,
// then a soft-delete (row kept, identifying fields cleared). ───────────────

// POST /delete-account/start
router.post("/delete-account/start", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword } = req.body as { currentPassword?: string };

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    if (!(await verifyCurrentPasswordIfSet(user, currentPassword))) {
      res.status(401).json({ error: "Parol noto'g'ri" });
      return;
    }
    if (!user.phone) {
      res.status(400).json({ error: "Telefon raqami talab qilinadi" });
      return;
    }

    const code = storeOtp("sms", user.phone, "delete-account");
    if (isEskizConfigured()) {
      try {
        await sendOtpSms(user.phone, code);
      } catch (smsErr) {
        console.error("Eskiz SMS send error:", smsErr);
        if (env.isProduction) {
          res.status(502).json({ error: "SMS yuborishda xatolik yuz berdi. Qayta urinib ko'ring." });
          return;
        }
      }
    } else if (env.isProduction) {
      console.error("Eskiz SMS is not configured — cannot send delete-account SMS OTP.");
      res.status(502).json({ error: "SMS xizmati sozlanmagan" });
      return;
    }

    await db.update(usersTable).set({ deleteRequestedAt: new Date(), updatedAt: new Date() }).where(eq(usersTable.id, user.id));

    res.json({ ok: true, destination: user.phone, ...(env.isProduction ? {} : { devCode: code }) });
  } catch (err) {
    console.error("Delete account start error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// POST /delete-account/confirm — verifies the SMS code and soft-deletes the account.
router.post("/delete-account/confirm", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { otp } = req.body as { otp?: string };
    if (!otp) {
      res.status(400).json({ error: "Tasdiqlash kodi talab qilinadi" });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
    if (!user?.deleteRequestedAt || !user.phone) {
      res.status(400).json({ error: "Hisobni o'chirish so'rovi topilmadi" });
      return;
    }

    if (!verifyOtp("sms", user.phone, otp, "delete-account")) {
      res.status(400).json({ error: "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan" });
      return;
    }

    await db
      .update(usersTable)
      .set({
        deletedAt: new Date(),
        deleteRequestedAt: null,
        email: null,
        phone: null,
        pendingEmail: null,
        emailVerified: false,
        hasPassword: false,
        twoFactorEnabled: false,
        twoFactorCodeHash: null,
        twoFactorHint: null,
        passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    res.json({ ok: true });
  } catch (err) {
    console.error("Delete account confirm error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// POST /delete-account/cancel
router.post("/delete-account/cancel", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [updated] = await db
      .update(usersTable)
      .set({ deleteRequestedAt: null, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const safeUser = { ...updated, passwordHash: undefined, twoFactorCodeHash: undefined };
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Delete account cancel error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PUT /provider-profile ─────────────────────────────────────────────────
router.put("/provider-profile", requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      categories, bio, workingHours, preferredLocation,
      photoUrl, experience, region, district, serviceAreaV2, albums,
    } = req.body as {
      categories?: string[];
      bio?: string;
      workingHours?: string;
      preferredLocation?: string;
      photoUrl?: string | null;
      experience?: number | null;
      region?: string | null;
      district?: string | null;
      serviceAreaV2?: unknown;
      albums?: unknown;
    };

    const existing = await db
      .select({ id: providerProfilesTable.id })
      .from(providerProfilesTable)
      .where(eq(providerProfilesTable.userId, req.user!.id))
      .limit(1);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (categories !== undefined) updates.categories = categories;
    if (bio !== undefined) updates.bio = bio;
    if (workingHours !== undefined) updates.workingHours = workingHours;
    if (preferredLocation !== undefined) updates.preferredLocation = preferredLocation;
    if (photoUrl !== undefined) updates.photoUrl = photoUrl;
    if (experience !== undefined) updates.experience = experience;
    if (region !== undefined) updates.region = region;
    if (district !== undefined) updates.district = district;
    if (serviceAreaV2 !== undefined) updates.serviceAreaV2 = serviceAreaV2;
    if (albums !== undefined) updates.albums = albums;

    let profile;
    if (existing.length > 0) {
      [profile] = await db
        .update(providerProfilesTable)
        .set(updates)
        .where(eq(providerProfilesTable.userId, req.user!.id))
        .returning();
    } else {
      [profile] = await db
        .insert(providerProfilesTable)
        .values({
          userId: req.user!.id, categories: categories ?? [], bio, workingHours, preferredLocation,
          photoUrl, experience, region, district,
          serviceAreaV2: serviceAreaV2 as never, albums: albums as never,
        })
        .returning();
    }

    // Ensure user role is updated to provider
    await db
      .update(usersTable)
      .set({ role: "provider", updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.id));

    res.json({ profile });
  } catch (err) {
    console.error("Update provider profile error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /providers/:id ────────────────────────────────────────────────────
router.get("/providers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Ijrochi topilmadi" });
      return;
    }

    const [profile] = await db
      .select()
      .from(providerProfilesTable)
      .where(eq(providerProfilesTable.userId, id))
      .limit(1);

    if (user.role !== "provider" && !profile) {
      res.status(404).json({ error: "Ijrochi topilmadi" });
      return;
    }

    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined, phone: undefined };
    res.json({ user: safeUser, providerProfile: profile ?? null });
  } catch (err) {
    console.error("Get provider error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /me ───────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, req.user!.id), isNull(usersTable.deletedAt)))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }

    const suspended = await isUserSuspended(user.id);
    const safeUser = { ...user, passwordHash: undefined, twoFactorCodeHash: undefined, suspended };
    const providerProfile = user.role === "provider" ? await getProviderProfile(user.id) : null;

    res.json({ user: safeUser, providerProfile });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

export default router;
