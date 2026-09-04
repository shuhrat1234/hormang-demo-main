import { apiFetch, ApiError } from "./api-client";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface SafeUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  emailVerified?: boolean;
  hasPassword?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorHint?: string | null;
  pendingEmail?: string | null;
  pendingDeleteRequest?: boolean;
  role: "buyer" | "provider";
  createdAt: string;
  deletedAt?: string | null;
  suspended?: boolean;
}

export interface ProviderServiceAreaData {
  toshkent_city: { all: boolean; districts: string[] };
  toshkent_region: { all: boolean; cities: string[] };
}

export interface PortfolioAlbumData {
  id: string;
  title: string;
  photos: { url: string; caption?: string }[];
  coverIdx?: number;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  categories: string[];
  bio?: string | null;
  preferredLocation?: string | null;
  isVerified: boolean;
  rating?: number;
  photoUrl?: string | null;
  experience?: number | null;
  region?: string | null;
  district?: string | null;
  serviceAreaV2?: ProviderServiceAreaData | null;
  albums?: PortfolioAlbumData[] | null;
}

export interface AuthResponse {
  user: SafeUser;
  accessToken: string;
  providerProfile?: ProviderProfile | null;
}

export interface LoginChallenge {
  needs2FA: true;
  challengeId: string;
  hint?: string;
}

/* ─── Storage Keys ──────────────────────────────────────────────────────── */

const TOKEN_KEY = "hormang_access_token";
const USERS_KEY = "hormang_auth_users";
const PROFILES_KEY = "hormang_auth_provider_profiles";
const OTP_KEY = "hormang_auth_otp_store";
const CHALLENGE_KEY = "hormang_auth_2fa_challenges";
const TWOFA_CODE_KEY = "hormang_2fa_codes";

/* ─── Token helpers (centralized, exported) ─────────────────────────────── */

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/* ─── Generic localStorage helpers ─────────────────────────────────────── */

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, val: T): void {
  localStorage.setItem(key, JSON.stringify(val));
}

function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ─── Phone / email normalisation ──────────────────────────────────────── */

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isStrongPassword(pw: string): boolean {
  return typeof pw === "string" && pw.length >= 8;
}

/* ─── User store ────────────────────────────────────────────────────────── */

function readUsers(): SafeUser[] {
  return readLS<SafeUser[]>(USERS_KEY, []);
}

function writeUsers(users: SafeUser[]): void {
  writeLS(USERS_KEY, users);
}

function findByPhone(phone: string): SafeUser | undefined {
  const n = normalizePhone(phone);
  return readUsers().find((u) => !u.deletedAt && normalizePhone(u.phone ?? "") === n);
}

function findByEmail(email: string): SafeUser | undefined {
  const n = normalizeEmail(email);
  return readUsers().find((u) => !u.deletedAt && normalizeEmail(u.email ?? "") === n);
}

function findById(id: string): SafeUser | undefined {
  return readUsers().find((u) => u.id === id && !u.deletedAt);
}

function upsertUser(user: SafeUser): void {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  writeUsers(users);
}

/* ─── Real backend bridge (register/login only — see auth-client module note) ─
 * Every other flow in this file (2FA, email verification, account deletion, …)
 * is still a local mock because the real Express backend doesn't implement
 * them yet. Register/login now hit the real backend so a genuine JWT backs
 * the wallet/payment API, which must not trust a client-asserted user id. */

interface BackendUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  role: "buyer" | "provider";
  createdAt: string;
  emailVerified?: boolean;
  hasPassword?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorHint?: string | null;
  suspended?: boolean;
}

/** Backend error text -> the error codes the UI's i18n dictionaries already know how to render. */
const BACKEND_ERROR_CODES: Record<string, string> = {
  "Bu raqam ro'yxatdan o'tmagan": "PHONE_NOT_REGISTERED",
  "Bu raqam allaqachon ro'yxatdan o'tgan": "PHONE_ALREADY_REGISTERED",
  "Tasdiqlash kodi noto'g'ri yoki muddati o'tgan": "OTP_INVALID",
  "Foydalanuvchi topilmadi": "USER_NOT_FOUND",
  "Parol noto'g'ri": "WRONG_PASSWORD",
  "Email tasdiqlanmagan — avval tasdiqlangan email qo'shing": "EMAIL_REQUIRED_FOR_PHONE_CHANGE",
  "Avval tasdiqlangan email qo'shing": "EMAIL_NOT_VERIFIED",
  "Noto'g'ri telefon raqami": "INVALID_PHONE",
  "Yangi raqam joriy raqam bilan bir xil": "NEW_PHONE_SAME_AS_OLD",
  "Bu raqam boshqa hisob bilan bog'liq": "PHONE_TAKEN",
  "Yangi email joriy email bilan bir xil": "NEW_EMAIL_SAME_AS_OLD",
  "Bu email allaqachon ro'yxatdan o'tgan": "EMAIL_ALREADY_REGISTERED",
  "Email o'zgartirish so'rovi topilmadi": "EMAIL_CHANGE_NOT_FOUND",
  "Tasdiqlash kodi talab qilinadi": "OTP_INVALID",
  "Hisobni o'chirish so'rovi topilmadi": "DELETE_REQUEST_NOT_FOUND",
  "Telefon raqami talab qilinadi": "PHONE_REQUIRED",
  "Sessiya muddati o'tgan. Qaytadan urinib ko'ring.": "SESSION_EXPIRED",
  "Kod noto'g'ri": "TWO_FA_INVALID",
};

function throwBackendError(err: unknown): never {
  if (err instanceof ApiError) {
    throw new Error(BACKEND_ERROR_CODES[err.message] ?? err.message);
  }
  throw err instanceof Error ? err : new Error("SERVER_ERROR");
}

/** Maps the backend's user row onto the frontend SafeUser shape. The backend is now
 * authoritative for every field it returns (2FA, email verification, hasPassword, …);
 * only the same-device draft/pending UI state some flows keep is preserved locally. */
function mergeBackendUser(backendUser: BackendUser): SafeUser {
  const existing = findById(backendUser.id);
  const merged: SafeUser = {
    id: backendUser.id,
    firstName: backendUser.firstName,
    lastName: backendUser.lastName,
    email: backendUser.email ?? null,
    phone: backendUser.phone ?? null,
    role: backendUser.role,
    createdAt: backendUser.createdAt,
    emailVerified: backendUser.emailVerified ?? false,
    hasPassword: backendUser.hasPassword ?? false,
    twoFactorEnabled: backendUser.twoFactorEnabled ?? false,
    twoFactorHint: backendUser.twoFactorHint ?? null,
    pendingEmail: existing?.pendingEmail ?? null,
    pendingDeleteRequest: existing?.pendingDeleteRequest ?? false,
  };
  upsertUser(merged);
  return merged;
}

/* ─── Provider-profile store ────────────────────────────────────────────── */

function readProfiles(): ProviderProfile[] {
  return readLS<ProviderProfile[]>(PROFILES_KEY, []);
}

function writeProfiles(profiles: ProviderProfile[]): void {
  writeLS(PROFILES_KEY, profiles);
}

function findProfile(userId: string): ProviderProfile | null {
  return readProfiles().find((p) => p.userId === userId) ?? null;
}

/** Public read-only accessor for the stored provider profile (no auth required). */
export function getStoredProviderProfile(userId: string): ProviderProfile | null {
  return findProfile(userId);
}

/* ─── OTP store (shared for SMS + email) ───────────────────────────────── */

interface OtpEntry {
  code: string;
  expiresAt: number;
  purpose: string;
  channel: "sms" | "email";
}

function readOtpStore(): Record<string, OtpEntry> {
  return readLS<Record<string, OtpEntry>>(OTP_KEY, {});
}

function makeOtpKey(channel: "sms" | "email", destination: string): string {
  return `${channel}:${channel === "sms" ? normalizePhone(destination) : normalizeEmail(destination)}`;
}

function storeOtp(channel: "sms" | "email", destination: string, purpose: string): string {
  const isDev = import.meta.env.DEV || import.meta.env.MODE === "development";
  const code = (isDev && channel === "sms") ? "000000" : Math.floor(100_000 + Math.random() * 900_000).toString();
  const store = readOtpStore();
  store[makeOtpKey(channel, destination)] = {
    code,
    expiresAt: Date.now() + 5 * 60 * 1_000,
    purpose,
    channel,
  };
  writeLS(OTP_KEY, store);
  return code;
}

function verifyOtpEntry(channel: "sms" | "email", destination: string, code: string, purpose: string): boolean {
  const isDev = import.meta.env.DEV || import.meta.env.MODE === "development";
  if (isDev && channel === "sms" && code === "000000") {
    const store = readOtpStore();
    delete store[makeOtpKey(channel, destination)];
    writeLS(OTP_KEY, store);
    return true;
  }
  const store = readOtpStore();
  const key = makeOtpKey(channel, destination);
  const entry = store[key];
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    delete store[key];
    writeLS(OTP_KEY, store);
    return false;
  }
  if (entry.purpose !== purpose || entry.channel !== channel || entry.code !== code) return false;
  delete store[key];
  writeLS(OTP_KEY, store);
  return true;
}

/* Backwards-compatible alias (legacy SMS-only verifyOtp signature). */
function verifyOtp(phone: string, code: string, purpose: string): boolean {
  return verifyOtpEntry("sms", phone, code, purpose);
}

/* ─── Reusable senders (swap with Twilio / SendGrid in production) ─────── */

export async function sendSmsCode(
  phone: string,
  purpose:
    | "register"
    | "login"
    | "migrate"
    | "add-phone"
    | "change-phone"
    | "delete-account"
    | "enable-2fa"
    | "login-2fa",
  /** Skip the email-delivery preference for "login" (e.g. user has no inbox access). */
  forceSms?: boolean,
): Promise<{ ok: boolean; devCode?: string; channel?: "sms" | "email"; maskedDestination?: string }> {
  const normalized = normalizePhone(phone);

  if (purpose === "register" || purpose === "login" || purpose === "migrate" || purpose === "add-phone") {
    try {
      // For "login", the backend may deliver the code to a verified email
      // instead of SMS (see /auth/sms/send) — the phone stays the account
      // lookup key either way, only the delivery channel can change.
      const res = await apiFetch<{ ok: boolean; devCode?: string; channel?: "sms" | "email"; maskedDestination?: string }>(
        "/auth/sms/send",
        { method: "POST", auth: false, body: { phone: normalized, purpose, forceSms } },
      );
      const isDev = import.meta.env.DEV || import.meta.env.MODE === "development";
      if (isDev && res.channel !== "email") {
        return { ...res, devCode: res.devCode ?? "000000" };
      }
      return res;
    } catch (err) {
      throwBackendError(err);
    }
  }

  if (purpose === "change-phone") {
    const user = findByPhone(normalized);
    if (user) throw new Error("PHONE_TAKEN");
  }

  const code = storeOtp("sms", normalized, purpose);
  return { ok: true, devCode: code };
}

export async function sendEmailCode(
  email: string,
  purpose:
    | "register-email"
    | "change-email"
    | "login-email-2fa"
    | "login-email",
): Promise<{ ok: boolean; devCode?: string }> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new Error("INVALID_EMAIL");

  if (purpose === "login-email") {
    try {
      return await apiFetch<{ ok: boolean; devCode?: string }>("/auth/login-email/send", {
        method: "POST",
        auth: false,
        body: { email: normalized },
      });
    } catch (err) {
      throwBackendError(err);
    }
  }

  if (purpose === "register-email" || purpose === "change-email") {
    const owner = findByEmail(normalized);
    const myId = getToken();
    if (owner && owner.id !== myId) throw new Error("EMAIL_ALREADY_REGISTERED");
  }

  const code = storeOtp("email", normalized, purpose);
  return { ok: true, devCode: code };
}

/* ─── Registration (phone + OTP) ───────────────────────────────────────── */

export async function registerUser(body: {
  firstName: string;
  lastName: string;
  phone: string;
  otp: string;
  role: "buyer" | "provider";
}): Promise<AuthResponse> {
  const normalized = normalizePhone(body.phone);

  try {
    const res = await apiFetch<{
      user: BackendUser;
      accessToken: string;
      providerProfile: ProviderProfile | null;
    }>("/auth/register", {
      method: "POST",
      auth: false,
      body: { ...body, phone: normalized },
    });

    const user = mergeBackendUser(res.user);
    setToken(res.accessToken);
    return { user, accessToken: res.accessToken, providerProfile: res.providerProfile };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Save Provider Profile ─────────────────────────────────────────────── */

export async function saveProviderProfile(body: {
  categories: string[];
  bio?: string;
  preferredLocation?: string;
}): Promise<{ profile: ProviderProfile }> {
  try {
    return await apiFetch<{ profile: ProviderProfile }>("/auth/provider-profile", {
      method: "PUT",
      body,
    });
  } catch (err) {
    throwBackendError(err);
  }
}


/* ─── Phone login (returns 2FA challenge if enabled) ───────────────────── */

type LoginResult =
  | { user: BackendUser; accessToken: string; providerProfile: ProviderProfile | null }
  | { needs2FA: true; challengeId: string; hint?: string };

export async function loginUser(body: {
  phone: string;
  otp: string;
}): Promise<AuthResponse | LoginChallenge> {
  const normalized = normalizePhone(body.phone);

  try {
    const res = await apiFetch<LoginResult>("/auth/login", {
      method: "POST",
      auth: false,
      body: { phone: normalized, otp: body.otp },
    });

    if ("needs2FA" in res) return res;

    const user = mergeBackendUser(res.user);
    setToken(res.accessToken);
    return { user, accessToken: res.accessToken, providerProfile: res.providerProfile };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Email + code login (no password — mirrors phone+OTP login) ──────── */

export async function loginWithEmailCode(body: {
  email: string;
  otp: string;
}): Promise<AuthResponse | LoginChallenge> {
  const normalized = normalizeEmail(body.email);

  try {
    const res = await apiFetch<LoginResult>("/auth/login-email", {
      method: "POST",
      auth: false,
      body: { email: normalized, otp: body.otp },
    });

    if ("needs2FA" in res) return res;

    const user = mergeBackendUser(res.user);
    setToken(res.accessToken);
    return { user, accessToken: res.accessToken, providerProfile: res.providerProfile };
  } catch (err) {
    throwBackendError(err);
  }
}

export async function verifyLogin2FA(body: {
  challengeId: string;
  otp: string;
}): Promise<AuthResponse> {
  try {
    const res = await apiFetch<{
      user: BackendUser;
      accessToken: string;
      providerProfile: ProviderProfile | null;
    }>("/auth/2fa/verify-login", {
      method: "POST",
      auth: false,
      body,
    });

    const user = mergeBackendUser(res.user);
    setToken(res.accessToken);
    return { user, accessToken: res.accessToken, providerProfile: res.providerProfile };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Account Migration ─────────────────────────────────────────────────── */

export async function migrateAccount(body: {
  email: string;
  password: string;
  phone: string;
  otp: string;
}): Promise<AuthResponse> {
  try {
    const res = await apiFetch<{
      user: BackendUser;
      accessToken: string;
      providerProfile: ProviderProfile | null;
    }>("/auth/migrate-account", {
      method: "POST",
      auth: false,
      body: { ...body, phone: normalizePhone(body.phone), email: normalizeEmail(body.email) },
    });

    const user = mergeBackendUser(res.user);
    setToken(res.accessToken);
    return { user, accessToken: res.accessToken, providerProfile: res.providerProfile };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Add phone to existing account ────────────────────────────────────── */

export async function addPhone(body: {
  phone: string;
  otp: string;
}): Promise<{ user: SafeUser }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    const res = await apiFetch<{ user: BackendUser }>("/auth/add-phone", {
      method: "PUT",
      body: { phone: normalizePhone(body.phone), otp: body.otp },
    });
    return { user: mergeBackendUser(res.user) };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Email registration (logged-in user adds a verified email) ─────────
 * Hits the real backend (/auth/email/send, /auth/email/verify) — this is
 * what actually delivers a real email via Resend, unlike the rest of the
 * 2FA/account-deletion flows further down this file, which are still local
 * mocks. No password is collected here: attaching an email exists solely
 * to give login OTP delivery a fallback channel besides SMS.
 */

/** findById only reads this browser's local cache, which can be empty even for a
 *  genuinely logged-in session (cleared storage, a session that never synced, …).
 *  Falls back to a real /auth/me fetch — which repopulates the cache — instead
 *  of incorrectly reporting the account as missing. */
function getCurrentCachedUser(): SafeUser | null {
  const users = readUsers();
  if (users.length === 0) return null;
  const token = getToken();
  if (token) {
    const direct = findById(token);
    if (direct) return direct;
  }
  return users.find((u) => !u.deletedAt) ?? null;
}

async function resolveCurrentUser(token: string): Promise<SafeUser> {
  const cached = getCurrentCachedUser();
  if (cached) return cached;
  try {
    const { user } = await getMe();
    return user;
  } catch {
    const users = readUsers();
    if (users.length > 0) return users[0];
    throw new Error("USER_NOT_FOUND");
  }
}

export async function startEmailRegistration(body: { email: string }): Promise<{ devCode?: string }> {
  const token = getToken();
  if (!token) throw new Error("AUTH_REQUIRED");
  const user = await resolveCurrentUser(token);
  if (user.emailVerified) throw new Error("EMAIL_ALREADY_ATTACHED");

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) throw new Error("INVALID_EMAIL");

  try {
    const res = await apiFetch<{ ok: boolean; devCode?: string }>("/auth/email/send", {
      method: "POST",
      body: { email },
    });
    upsertUser({ ...user, pendingEmail: email });
    return { devCode: res.devCode };
  } catch (err) {
    throwBackendError(err);
  }
}

export async function cancelPendingEmail(): Promise<void> {
  if (!getToken()) return;
  try {
    await apiFetch("/auth/change-email/cancel", { method: "POST" });
  } catch {
    // best-effort — nothing local depends on this succeeding
  }
}

/** No server-side pending-phone state exists (the change-phone wizard's progress
 *  lives entirely in the React form state) — kept as a no-op so existing callers
 *  don't need to change. */
export async function cancelPendingPhone(): Promise<void> {}

export async function verifyEmailRegistration(otp: string): Promise<{ user: SafeUser }> {
  const token = getToken();
  if (!token) throw new Error("AUTH_REQUIRED");
  const user = await resolveCurrentUser(token);
  if (!user.pendingEmail) throw new Error("EMAIL_VERIFICATION_NOT_FOUND");

  try {
    const res = await apiFetch<{ user: BackendUser & { emailVerified?: boolean } }>("/auth/email/verify", {
      method: "PUT",
      body: { email: user.pendingEmail, otp },
    });
    const updated: SafeUser = {
      ...mergeBackendUser(res.user),
      email: res.user.email ?? user.pendingEmail,
      emailVerified: true,
      pendingEmail: null,
    };
    upsertUser(updated);
    return { user: updated };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Change email (password-if-set, then OTP to the new address) ──────── */

export async function startChangeEmail(body: {
  currentPassword: string;
  newEmail: string;
}): Promise<{ devCode?: string }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    return await apiFetch<{ ok: true; devCode?: string }>("/auth/change-email/start", {
      method: "POST",
      body,
    });
  } catch (err) {
    throwBackendError(err);
  }
}

export async function verifyChangeEmail(otp: string): Promise<{ user: SafeUser }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    const res = await apiFetch<{ user: BackendUser }>("/auth/change-email/verify", {
      method: "PUT",
      body: { otp },
    });
    return { user: mergeBackendUser(res.user) };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Change phone (real backend): password → email code → SMS code ────── */

export async function startChangePhone(body: {
  currentPassword: string;
  newPhone: string;
}): Promise<{ devCode?: string; maskedEmail?: string }> {
  const token = getToken();
  if (!token) throw new Error("AUTH_REQUIRED");
  try {
    return await apiFetch<{ ok: true; maskedEmail: string; devCode?: string }>("/auth/change-phone/start", {
      method: "POST",
      body,
    });
  } catch (err) {
    throwBackendError(err);
  }
}

/** Middle step: confirms the email code and triggers the SMS code to the new number. */
export async function verifyChangePhoneEmail(newPhone: string, otp: string): Promise<{ devCode?: string }> {
  try {
    return await apiFetch<{ ok: true; devCode?: string }>("/auth/change-phone/verify-email", {
      method: "POST",
      body: { newPhone, otp },
    });
  } catch (err) {
    throwBackendError(err);
  }
}

/** Final step: confirms the SMS code and applies the new phone number. */
export async function verifyChangePhone(newPhone: string, otp: string): Promise<{ user: SafeUser }> {
  try {
    const res = await apiFetch<{ user: BackendUser }>("/auth/change-phone/verify-sms", {
      method: "POST",
      body: { newPhone, otp },
    });
    return { user: mergeBackendUser(res.user) };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── 2FA setup / disable (user-defined login PIN + hint) ──────────────── */

export async function setup2FA(body: {
  currentPassword?: string;
  code: string;
  hint: string;
}): Promise<{ user: SafeUser }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    const res = await apiFetch<{ user: BackendUser }>("/auth/2fa/setup", {
      method: "POST",
      body,
    });
    return { user: mergeBackendUser(res.user) };
  } catch (err) {
    throwBackendError(err);
  }
}

export async function disable2FA(currentPassword: string): Promise<{ user: SafeUser }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    const res = await apiFetch<{ user: BackendUser }>("/auth/2fa/disable", {
      method: "POST",
      body: { currentPassword },
    });
    return { user: mergeBackendUser(res.user) };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Delete account (password-if-set + SMS OTP, soft-delete) ──────────── */

export async function startDeleteAccount(currentPassword: string): Promise<{ devCode?: string; destination: string }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    return await apiFetch<{ ok: true; destination: string; devCode?: string }>("/auth/delete-account/start", {
      method: "POST",
      body: { currentPassword },
    });
  } catch (err) {
    throwBackendError(err);
  }
}

export async function confirmDeleteAccount(otp: string): Promise<{ ok: true }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    await apiFetch<{ ok: true }>("/auth/delete-account/confirm", {
      method: "POST",
      body: { otp },
    });
  } catch (err) {
    throwBackendError(err);
  }
  clearToken();
  return { ok: true };
}

export async function cancelDeleteAccount(): Promise<{ user: SafeUser }> {
  if (!getToken()) throw new Error("AUTH_REQUIRED");
  try {
    const res = await apiFetch<{ user: BackendUser }>("/auth/delete-account/cancel", { method: "POST" });
    return { user: mergeBackendUser(res.user) };
  } catch (err) {
    throwBackendError(err);
  }
}

/* ─── Session ───────────────────────────────────────────────────────────── */

export async function logoutUser(): Promise<void> {
  clearToken();
}

/** Real JWTs are 3 dot-separated segments; local-mock tokens (crypto.randomUUID()) never contain a dot. */
function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

export async function getMe(): Promise<{
  user: SafeUser;
  providerProfile: ProviderProfile | null;
}> {
  const token = getToken();
  if (!token) throw new Error("AUTH_REQUIRED");

  if (looksLikeJwt(token)) {
    try {
      const res = await apiFetch<{ user: BackendUser; providerProfile: ProviderProfile | null }>("/auth/me");
      const user = mergeBackendUser(res.user);
      return { user, providerProfile: res.providerProfile };
    } catch (err) {
      throwBackendError(err);
    }
  }

  const user = findById(token);
  if (!user) throw new Error("USER_NOT_FOUND");

  const providerProfile = user.role === "provider" ? findProfile(user.id) : null;
  return { user, providerProfile };
}

export async function refreshToken(): Promise<string | null> {
  const token = getToken();
  if (token && looksLikeJwt(token)) {
    try {
      const res = await apiFetch<{ accessToken: string }>("/auth/refresh", { method: "POST", auth: false });
      setToken(res.accessToken);
      return res.accessToken;
    } catch {
      return getToken();
    }
  }
  return token;
}

/* ─── Profile Updates ───────────────────────────────────────────────────── */

export async function updateProfile(body: {
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<{ user: SafeUser }> {
  const token = getToken();
  if (!token) throw new Error("AUTH_REQUIRED");

  if (looksLikeJwt(token)) {
    try {
      const res = await apiFetch<{ user: BackendUser }>("/auth/profile", {
        method: "PUT",
        body,
      });
      const user = mergeBackendUser(res.user);
      return { user };
    } catch {
      try {
        const res = await apiFetch<{ user: BackendUser }>("/auth/user", {
          method: "PUT",
          body,
        });
        const user = mergeBackendUser(res.user);
        return { user };
      } catch {
        const user = await resolveCurrentUser(token);
        const updated: SafeUser = {
          ...user,
          ...(body.firstName !== undefined && { firstName: body.firstName }),
          ...(body.lastName !== undefined && { lastName: body.lastName }),
          ...(body.email !== undefined && { email: body.email || null }),
        };
        upsertUser(updated);
        return { user: updated };
      }
    }
  }

  const user = await resolveCurrentUser(token);
  if (!user) throw new Error("USER_NOT_FOUND");

  const updated: SafeUser = {
    ...user,
    ...(body.firstName !== undefined && { firstName: body.firstName }),
    ...(body.lastName !== undefined && { lastName: body.lastName }),
    ...(body.email !== undefined && { email: body.email || null }),
  };
  upsertUser(updated);
  return { user: updated };
}

export async function updateProviderProfile(body: {
  categories?: string[];
  bio?: string;
  preferredLocation?: string;
  photoUrl?: string | null;
  experience?: number | null;
  region?: string | null;
  district?: string | null;
  serviceAreaV2?: ProviderServiceAreaData | null;
  albums?: PortfolioAlbumData[] | null;
}): Promise<{ profile: ProviderProfile }> {
  try {
    return await apiFetch<{ profile: ProviderProfile }>("/auth/provider-profile", {
      method: "PUT",
      body,
    });
  } catch (err) {
    const token = getToken();
    if (token) {
      const user = await resolveCurrentUser(token).catch(() => null);
      if (user) {
        const profiles = readProfiles();
        let prof = profiles.find((p) => p.userId === user.id);
        if (!prof) {
          prof = {
            id: genId(),
            userId: user.id,
            categories: body.categories ?? [],
            bio: body.bio ?? null,
            preferredLocation: body.preferredLocation ?? null,
            isVerified: false,
            photoUrl: body.photoUrl ?? null,
            experience: body.experience ?? null,
            region: body.region ?? null,
            district: body.district ?? null,
            serviceAreaV2: body.serviceAreaV2 ?? null,
            albums: body.albums ?? null,
          };
          profiles.push(prof);
        } else {
          if (body.categories !== undefined) prof.categories = body.categories;
          if (body.bio !== undefined) prof.bio = body.bio;
          if (body.preferredLocation !== undefined) prof.preferredLocation = body.preferredLocation;
          if (body.photoUrl !== undefined) prof.photoUrl = body.photoUrl;
          if (body.experience !== undefined) prof.experience = body.experience;
          if (body.region !== undefined) prof.region = body.region;
          if (body.district !== undefined) prof.district = body.district;
          if (body.serviceAreaV2 !== undefined) prof.serviceAreaV2 = body.serviceAreaV2;
          if (body.albums !== undefined) prof.albums = body.albums;
        }
        writeProfiles(profiles);
        return { profile: prof };
      }
    }
    throwBackendError(err);
  }
}

export async function getProviderPublicProfile(id: string): Promise<{
  user: SafeUser;
  providerProfile: ProviderProfile | null;
}> {
  try {
    return await apiFetch<{ user: SafeUser; providerProfile: ProviderProfile | null }>(
      `/auth/providers/${id}`,
      { auth: false },
    );
  } catch (err) {
    const localUser = findById(id);
    const localProfile = findProfile(id);
    if (localUser || localProfile) {
      return {
        user: localUser ?? ({ id, firstName: "Ijrochi", lastName: "", role: "provider" } as SafeUser),
        providerProfile: localProfile,
      };
    }
    throwBackendError(err);
  }
}
