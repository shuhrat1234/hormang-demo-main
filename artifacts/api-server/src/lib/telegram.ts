import { eq } from "drizzle-orm";
import { db, usersTable, walletsTable, telegramLinksTable } from "@workspace/db";
import { getTelegramToken, isTelegramConfigured, env } from "./env.js";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

function apiUrl(method: string): string {
  return `${TELEGRAM_API_BASE}${getTelegramToken()}/${method}`;
}

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: { replyMarkup?: unknown } = {}
): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: options.replyMarkup,
  });
}

function getAppUrl(): string {
  return env.appBaseUrl || "https://hormang.co.uz";
}

/* ─── Keyboards ──────────────────────────────────────────────────────────── */

const CONTACT_REQUEST_KEYBOARD = {
  keyboard: [[{ text: "📱 Raqamni ulashish", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

function getQuickMenuKeyboard() {
  return {
    keyboard: [
      [{ text: "🚀 Hormang Mini App", web_app: { url: getAppUrl() } }],
      [{ text: "💰 Balans" }, { text: "❓ FAQ" }],
      [{ text: "💬 Taklif va shikoyatlar" }],
    ],
    resize_keyboard: true,
  };
}

function getStartInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 Hormang Mini Appni ochish",
          web_app: { url: getAppUrl() },
        },
      ],
      [
        {
          text: "🌐 Sayt orqali kirish",
          url: getAppUrl(),
        },
      ],
    ],
  };
}

/* ─── Phone normalization ───────────────────────────────────────────────── */

/** Telegram contacts come as "998901112233" or "+998901112233"; app phones are stored as "+998901112233". */
function normalizeTelegramPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  return `+${digits}`;
}

/* ─── Update handling ────────────────────────────────────────────────────── */

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
}

async function findLinkByChatId(chatId: string) {
  const [link] = await db.select().from(telegramLinksTable).where(eq(telegramLinksTable.chatId, chatId)).limit(1);
  return link ?? null;
}

async function handleContactShare(chatId: string, rawPhone: string): Promise<void> {
  const phone = normalizeTelegramPhone(rawPhone);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);

  if (!user) {
    await sendTelegramMessage(
      chatId,
      `Bu raqam Hormang'da topilmadi. Avval ilovada ro'yxatdan o'ting: ${getAppUrl()}`,
      { replyMarkup: getStartInlineKeyboard() }
    );
    return;
  }

  await db
    .insert(telegramLinksTable)
    .values({ userId: user.id, chatId, phone })
    .onConflictDoUpdate({
      target: telegramLinksTable.userId,
      set: { chatId, phone, linkedAt: new Date() },
    });

  await sendTelegramMessage(chatId, `✅ Hisobingiz ulandi! Xush kelibsiz, ${user.firstName}.`, {
    replyMarkup: getQuickMenuKeyboard(),
  });
}

async function handleBalanceRequest(chatId: string, userId: string): Promise<void> {
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId)).limit(1);
  await sendTelegramMessage(chatId, `💰 Balansingiz: <b>${wallet?.balance ?? 0} Tanga</b>`, {
    replyMarkup: getQuickMenuKeyboard(),
  });
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) return;
  const chatId = String(message.chat.id);

  if (message.contact) {
    // S12: Verify contact user_id matches sender's Telegram ID to reject forwarded contact cards
    if (!message.from || message.contact.user_id !== message.from.id) {
      await sendTelegramMessage(
        chatId,
        "⚠️ Iltimos, faqat o'z kontakt kartangizni pastdagi '📱 Raqamni ulashish' tugmasi orqali yuboring."
      );
      return;
    }
    await handleContactShare(chatId, message.contact.phone_number);
    return;
  }

  const text = message.text?.trim();
  if (!text) return;

  const link = await findLinkByChatId(chatId);

  if (text === "/start" || text === "/app") {
    await sendTelegramMessage(
      chatId,
      "👋 <b>Hormang</b> ga xush kelibsiz!\n\nO'zbekistonda ishonchli usta va mutaxassislarni topish uchun quyidagi tugmani bosib <b>Mini App</b>ni ochishingiz mumkin:\n\n📱 Hisobingizni ulash va bildirishnomalarni olish uchun telefon raqamingizni ham yuborishingiz mumkin.",
      { replyMarkup: getStartInlineKeyboard() }
    );

    if (!link) {
      await sendTelegramMessage(
        chatId,
        "Hisobingizni bot bilan bog'lash va bildirishnomalarni olish uchun raqamingizni ulashing:",
        { replyMarkup: CONTACT_REQUEST_KEYBOARD }
      );
    } else {
      await sendTelegramMessage(chatId, "Bosh menyu:", {
        replyMarkup: getQuickMenuKeyboard(),
      });
    }
    return;
  }

  if (text === "🚀 Hormang Mini App" || text === "🔗 Ilovani ochish" || text === "🚀 Ilovani ochish") {
    await sendTelegramMessage(chatId, "Hormang Mini Appni ochish:", {
      replyMarkup: getStartInlineKeyboard(),
    });
    return;
  }

  if (!link) {
    await sendTelegramMessage(
      chatId,
      "Hisobingiz hali ulanmagan. Mini ilovadan foydalanishingiz yoki /start buyrug'i orqali raqamingizni yuborishingiz mumkin.",
      { replyMarkup: getStartInlineKeyboard() }
    );
    return;
  }

  switch (text) {
    case "/balance":
    case "💰 Balans":
      await handleBalanceRequest(chatId, link.userId);
      break;
    case "/help":
    case "❓ FAQ":
      await sendTelegramMessage(chatId, `❓ Ko'p so'raladigan savollar: ${getAppUrl()}/settings/help`, {
        replyMarkup: getQuickMenuKeyboard(),
      });
      break;
    case "💬 Taklif va shikoyatlar":
      await sendTelegramMessage(chatId, `💬 Taklif va shikoyatlaringizni shu yerda qoldiring: ${getAppUrl()}/feedback`, {
        replyMarkup: getQuickMenuKeyboard(),
      });
      break;
    default:
      await sendTelegramMessage(chatId, "Quyidagi menyudan tanlang:", { replyMarkup: getQuickMenuKeyboard() });
  }
}

/* ─── Long polling ───────────────────────────────────────────────────────── */

let polling = false;
let pollingOffset = 0;

export function startTelegramBot(): void {
  if (!isTelegramConfigured() || polling) return;
  polling = true;
  void callTelegram("setMyCommands", {
    commands: [
      { command: "start", description: "Botni ishga tushirish" },
      { command: "app", description: "Hormang Mini Appni ochish" },
      { command: "balance", description: "Balansni ko'rish" },
      { command: "help", description: "Yordam va qo'llanma" },
    ],
  }).catch((err) => console.error("Telegram setMyCommands error:", err));

  void callTelegram("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Hormang",
      web_app: { url: getAppUrl() },
    },
  }).catch((err) => console.error("Telegram setChatMenuButton error:", err));

  void pollLoop();
  console.log("Telegram bot polling started.");
}

export function stopTelegramBot(): void {
  polling = false;
}

async function pollLoop(): Promise<void> {
  while (polling) {
    try {
      const updates = await callTelegram<TelegramUpdate[]>("getUpdates", { offset: pollingOffset, timeout: 25 });
      for (const update of updates) {
        pollingOffset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (err) {
          console.error("Telegram update handling error:", err);
        }
      }
    } catch (err) {
      console.error("Telegram getUpdates error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/* ─── Low-balance reminder (providers only, real wallet data) ──────────────
 * The only notification trigger in the checklist that's actually backed by a
 * real server-side event today — everything else (new offers/messages/
 * reviews/badges) needs its own backend table before it can plug in here. */

const LOW_BALANCE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
let lowBalanceTimer: ReturnType<typeof setInterval> | null = null;

export function startLowBalanceScheduler(): void {
  if (!isTelegramConfigured() || lowBalanceTimer) return;
  void checkLowBalances();
  lowBalanceTimer = setInterval(() => void checkLowBalances(), LOW_BALANCE_CHECK_INTERVAL_MS);
}

export function stopLowBalanceScheduler(): void {
  if (lowBalanceTimer) clearInterval(lowBalanceTimer);
  lowBalanceTimer = null;
}

async function checkLowBalances(): Promise<void> {
  const rows = await db
    .select({
      userId: usersTable.id,
      balance: walletsTable.balance,
      lastThreshold: walletsTable.lastLowBalanceAlertThreshold,
      chatId: telegramLinksTable.chatId,
    })
    .from(walletsTable)
    .innerJoin(usersTable, eq(walletsTable.userId, usersTable.id))
    .innerJoin(telegramLinksTable, eq(telegramLinksTable.userId, usersTable.id))
    .where(eq(usersTable.role, "provider"));

  for (const row of rows) {
    let newThreshold = row.lastThreshold;
    let alertThreshold: 5 | 10 | null = null;

    if (row.balance < 5 && (row.lastThreshold === null || row.lastThreshold > 5)) {
      alertThreshold = 5;
      newThreshold = 5;
    } else if (row.balance < 10 && (row.lastThreshold === null || row.lastThreshold > 10)) {
      alertThreshold = 10;
      newThreshold = 10;
    } else if (row.balance >= 10 && row.lastThreshold !== null) {
      newThreshold = null;
    }

    if (newThreshold !== row.lastThreshold) {
      await db
        .update(walletsTable)
        .set({ lastLowBalanceAlertThreshold: newThreshold })
        .where(eq(walletsTable.userId, row.userId));
    }

    if (alertThreshold !== null) {
      try {
        await sendTelegramMessage(
          row.chatId,
          `⚠️ Balansingiz kamaydi: <b>${row.balance} Tanga</b> qoldi.\n\n` +
            `Yangi so'rovlarga taklif yuborish uchun hisobingizni to'ldiring: ${env.appBaseUrl}/plans`
        );
      } catch (err) {
        console.error("Low balance alert send error:", err);
      }
    }
  }
}
