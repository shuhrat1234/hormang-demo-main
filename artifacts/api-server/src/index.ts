import path from "path";

if (!process.env["PORT"] || !process.env["DATABASE_URL"]) {
  try { process.loadEnvFile?.(path.resolve(process.cwd(), ".env")); } catch {}
  try { process.loadEnvFile?.(path.resolve(import.meta.dirname, "../../.env")); } catch {}
}

import app from "./app";
import { startTelegramBot, startLowBalanceScheduler } from "./lib/telegram.js";
import { isTelegramConfigured } from "./lib/env.js";
import { attachChatWebSocket } from "./lib/chat-ws.js";
import { pool } from "@workspace/db";

// Ensure schema migrations exist without breaking existing deployments
(async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_source text;`);
    await pool.query(`ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'free';`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cookie_consents (
        id text PRIMARY KEY,
        user_id text REFERENCES users(id) ON DELETE SET NULL,
        consent_status text NOT NULL,
        analytics boolean NOT NULL DEFAULT true,
        marketing boolean NOT NULL DEFAULT true,
        ip_address text,
        user_agent text,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      UPDATE categories SET active = false WHERE id NOT IN ('tamirlash', 'tozalash', 'avto', 'kochirish');
      UPDATE categories SET active = true WHERE id IN ('tamirlash', 'tozalash', 'avto', 'kochirish');
    `);
  } catch (err) {
    console.error("Migration error ensureDbSchema:", err);
  }
})();

const rawPort = process.env["PORT"] || "8080";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
attachChatWebSocket(server);

if (isTelegramConfigured()) {
  startTelegramBot();
  startLowBalanceScheduler();
} else {
  console.log("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.");
}
