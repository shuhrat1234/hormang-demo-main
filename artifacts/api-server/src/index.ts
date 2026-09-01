import path from "path";

if (!process.env["PORT"] || !process.env["DATABASE_URL"]) {
  try { process.loadEnvFile?.(path.resolve(process.cwd(), ".env")); } catch {}
  try { process.loadEnvFile?.(path.resolve(import.meta.dirname, "../../.env")); } catch {}
}

import app from "./app";
import { startTelegramBot, startLowBalanceScheduler } from "./lib/telegram.js";
import { isTelegramConfigured } from "./lib/env.js";
import { attachChatWebSocket } from "./lib/chat-ws.js";

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
