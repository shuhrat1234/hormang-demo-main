const isProduction = process.env.NODE_ENV === "production";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:5173",
};

/**
 * JWT_SECRET falls back to an insecure dev default so local development keeps
 * working without a .env entry, but a missing secret in production is a hard error.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProduction) {
    throw new Error("JWT_SECRET must be set in production.");
  }
  console.warn(
    "[env] JWT_SECRET not set — using an insecure development default. Set JWT_SECRET before deploying."
  );
  return "hormang-dev-secret-change-in-production";
}

export interface EskizConfig {
  email: string;
  password: string;
  from: string;
}

export function isEskizConfigured(): boolean {
  return Boolean(process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD);
}

export function getEskizConfig(): EskizConfig {
  const email = process.env.ESKIZ_EMAIL;
  const password = process.env.ESKIZ_PASSWORD;
  if (!email || !password) {
    throw new Error("Eskiz SMS is not configured: set ESKIZ_EMAIL and ESKIZ_PASSWORD.");
  }
  return { email, password, from: process.env.ESKIZ_FROM ?? "4546" };
}

export interface ResendConfig {
  apiKey: string;
  from: string;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getResendConfig(): ResendConfig {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend is not configured: set RESEND_API_KEY.");
  }
  // "onboarding@resend.dev" only delivers to the Resend account owner's own
  // address until a real domain is verified in the Resend dashboard.
  return { apiKey, from: process.env.RESEND_FROM_EMAIL ?? "Hormang <onboarding@resend.dev>" };
}

export interface PaymeConfig {
  merchantId: string;
  key: string;
  /** Payme's sandbox (test.paycom.uz) authenticates against this key while hitting the
   *  same merchant endpoint URL as real checkout — both must be accepted side by side. */
  testKey?: string;
  testEnv: boolean;
}

export function isPaymeConfigured(): boolean {
  return Boolean(process.env.PAYME_MERCHANT_ID && process.env.PAYME_KEY);
}

export function getPaymeConfig(): PaymeConfig {
  const merchantId = process.env.PAYME_MERCHANT_ID;
  const key = process.env.PAYME_KEY;
  if (!merchantId || !key) {
    throw new Error("Payme is not configured: set PAYME_MERCHANT_ID and PAYME_KEY.");
  }
  return { merchantId, key, testKey: process.env.PAYME_TEST_KEY, testEnv: process.env.PAYME_ENV !== "prod" };
}

export interface ClickWebhookConfig {
  serviceId: string;
  secretKey: string;
}

/** Only what's needed to verify Prepare/Complete signatures — merchant_id and
 *  merchant_user_id (checkout-link-only fields) aren't required for this. */
export function isClickWebhookConfigured(): boolean {
  return Boolean(process.env.CLICK_SERVICE_ID && process.env.CLICK_SECRET_KEY);
}

export function getClickWebhookConfig(): ClickWebhookConfig {
  const serviceId = process.env.CLICK_SERVICE_ID;
  const secretKey = process.env.CLICK_SECRET_KEY;
  if (!serviceId || !secretKey) {
    throw new Error("Click is not configured: set CLICK_SERVICE_ID and CLICK_SECRET_KEY.");
  }
  return { serviceId, secretKey };
}

export interface ClickCheckoutConfig {
  merchantId: string;
  merchantUserId: string;
  serviceId: string;
}

export function isClickCheckoutConfigured(): boolean {
  return Boolean(process.env.CLICK_MERCHANT_ID && process.env.CLICK_MERCHANT_USER_ID && process.env.CLICK_SERVICE_ID);
}

export function getClickCheckoutConfig(): ClickCheckoutConfig {
  const merchantId = process.env.CLICK_MERCHANT_ID;
  const merchantUserId = process.env.CLICK_MERCHANT_USER_ID;
  const serviceId = process.env.CLICK_SERVICE_ID;
  if (!merchantId || !merchantUserId || !serviceId) {
    throw new Error("Click checkout is not configured: set CLICK_MERCHANT_ID, CLICK_MERCHANT_USER_ID, CLICK_SERVICE_ID.");
  }
  return { merchantId, merchantUserId, serviceId };
}

/**
 * Shared secret protecting admin write endpoints. Mirrors today's single
 * shared admin password (there's no per-admin account system) — falls back
 * to an insecure dev default the same way JWT_SECRET does.
 */
export function getAdminApiKey(): string {
  const key = process.env.ADMIN_API_KEY;
  if (key) return key;
  if (env.isProduction) {
    throw new Error("ADMIN_API_KEY must be set in production.");
  }
  console.warn("[env] ADMIN_API_KEY not set — using an insecure development default.");
  return "ourhormang123";
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function getTelegramToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot is not configured: set TELEGRAM_BOT_TOKEN.");
  return token;
}
