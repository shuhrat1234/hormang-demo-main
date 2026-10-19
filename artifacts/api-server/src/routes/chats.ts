import { Router, type IRouter } from "express";
import { eq, and, or, asc, inArray, sql, avg, count } from "drizzle-orm";
import { db, chatsTable, chatMessagesTable, requestsTable, responseTimeSamplesTable, type ChatRow, type ChatMessageRow } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { requireAdminKey } from "../middlewares/admin.js";
import { broadcastToChat } from "../lib/chat-ws.js";

const router: IRouter = Router();

function chatJson(row: ChatRow) {
  return {
    ...row,
    customerClearedAt: row.customerClearedAt?.toISOString(),
    providerClearedAt: row.providerClearedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
function messageJson(row: ChatMessageRow) {
  return {
    id: row.id,
    chatId: row.chatId,
    sender: row.sender,
    text: row.text ?? undefined,
    attachment: row.attachmentUrl ? { type: row.attachmentType, url: row.attachmentUrl } : undefined,
    deliveredAt: row.deliveredAt?.toISOString(),
    readAt: row.readAt?.toISOString(),
    deletedForEveryone: row.deletedForEveryone,
    deletedAt: row.deletedAt?.toISOString(),
    deletedForUsers: row.deletedForUsers ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

/** Resolve the caller's role in a chat: "customer" (owns the request), "master"
 * (is the chat's provider), or null (no access). */
async function resolveRole(chat: { requestId: string; masterId: string }, userId: string): Promise<"customer" | "master" | null> {
  if (chat.masterId === userId) return "master";
  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, chat.requestId)).limit(1);
  if (request?.customerId === userId) return "customer";
  return null;
}

/**
 * Mirrors the old client-side "unanswered burst" pairing: walk backward from
 * the new message to the oldest consecutive incoming message from the other
 * side (so 3 incoming + 1 reply = 1 sample measured from the first incoming,
 * not 3 separate samples), and record how long that took. Done once here,
 * server-side, at send time — authoritative regardless of which device the
 * reply comes from.
 */
async function recordResponseSampleIfReply(chat: ChatRow, message: ChatMessageRow): Promise<void> {
  if (message.sender === "system") return;

  const history = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.chatId, chat.id))
    .orderBy(asc(chatMessagesTable.createdAt));
  const newIdx = history.findIndex((m) => m.id === message.id);
  if (newIdx <= 0) return;

  let oldestIncoming: ChatMessageRow | null = null;
  for (let i = newIdx - 1; i >= 0; i--) {
    const m = history[i];
    if (m.deletedForEveryone) continue;
    // A system message (offer accepted, job completed, etc.) marks a
    // conversation-phase boundary — stop here rather than walking through it,
    // otherwise a reply sent long after completion gets paired with a
    // customer message from a completely different phase of the chat.
    if (m.sender === "system") break;
    if (m.sender === message.sender) break;
    oldestIncoming = m;
  }
  if (!oldestIncoming) return;

  const minutes = (message.createdAt.getTime() - oldestIncoming.createdAt.getTime()) / 60000;
  if (!Number.isFinite(minutes) || minutes < 0) return;

  let responderId: string;
  if (message.sender === "master") {
    responderId = chat.masterId;
  } else {
    const [request] = await db.select({ customerId: requestsTable.customerId }).from(requestsTable).where(eq(requestsTable.id, chat.requestId)).limit(1);
    if (!request?.customerId) return;
    responderId = request.customerId;
  }

  await db.insert(responseTimeSamplesTable).values({ userId: responderId, chatId: chat.id, minutes });
}

// ─── GET /response-time/:userId — average reply time in minutes, or null ───
router.get("/response-time/:userId", async (req, res) => {
  try {
    const userId: string = String(req.params.userId);
    const [row] = await db
      .select({ avgMinutes: avg(responseTimeSamplesTable.minutes), sampleCount: count() })
      .from(responseTimeSamplesTable)
      .where(eq(responseTimeSamplesTable.userId, userId));
    const sampleCount = Number(row?.sampleCount ?? 0);
    res.json({ avgMinutes: sampleCount > 0 ? Number(row!.avgMinutes) : null });
  } catch (err) {
    console.error("Get response time error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /admin/all — every chat, with its messages, for admin moderation ──
router.get("/admin/all", requireAdminKey, async (_req, res) => {
  try {
    const rows = await db.select().from(chatsTable);
    const allMessages = await db.select().from(chatMessagesTable).orderBy(asc(chatMessagesTable.createdAt));
    const messagesByChat = new Map<string, ChatMessageRow[]>();
    for (const m of allMessages) {
      const list = messagesByChat.get(m.chatId) ?? [];
      list.push(m);
      messagesByChat.set(m.chatId, list);
    }
    res.json({
      chats: rows.map((c) => ({
        ...chatJson(c),
        messages: (messagesByChat.get(c.id) ?? []).map(messageJson),
      })),
    });
  } catch (err) {
    console.error("Admin list chats error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /mine — every chat the authenticated user can see, as either side ─
router.get("/mine", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const myRequestIds = (await db.select({ id: requestsTable.id }).from(requestsTable).where(eq(requestsTable.customerId, userId))).map((r) => r.id);
    const rows = await db
      .select()
      .from(chatsTable)
      .where(or(eq(chatsTable.masterId, userId), myRequestIds.length ? inArray(chatsTable.requestId, myRequestIds) : sql`false`));
    res.json({ chats: rows.map(chatJson) });
  } catch (err) {
    console.error("List my chats error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── GET /by-pair/:requestId/:masterId — get a chat + its messages ─────────
router.get("/by-pair/:requestId/:masterId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const requestId: string = String(req.params.requestId);
    const masterId: string = String(req.params.masterId);

    const [chat] = await db
      .select()
      .from(chatsTable)
      .where(and(eq(chatsTable.requestId, requestId), eq(chatsTable.masterId, masterId)))
      .limit(1);

    // S4: Do not auto-create chats without an offer; chats are created upon valid offer submission
    if (!chat) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }

    if (!(await resolveRole(chat, req.user!.id))) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.chatId, chat.id))
      .orderBy(asc(chatMessagesTable.createdAt));
    res.json({ chat: chatJson(chat), messages: messages.map(messageJson) });
  } catch (err) {
    console.error("Get chat error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── POST /:chatId/messages — send a message ────────────────────────────────
router.post("/:chatId/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const chatId: string = String(req.params.chatId);
    const { text, attachment } = req.body as { text?: string; attachment?: { type: "image" | "file"; url: string } };
    if (!text?.trim() && !attachment) {
      res.status(400).json({ error: "text yoki attachment talab qilinadi" });
      return;
    }

    // S16: Validate payload limits and file formats
    if (text && text.length > 5000) {
      res.status(400).json({ error: "Xabar matni juda uzun (maksimal 5000 belgi)" });
      return;
    }

    if (attachment) {
      if (attachment.type !== "image" && attachment.type !== "file") {
        res.status(400).json({ error: "Noto'g'ri biriktirma turi" });
        return;
      }
      if (!attachment.url || typeof attachment.url !== "string") {
        res.status(400).json({ error: "Noto'g'ri biriktirma manzili" });
        return;
      }
      const url = attachment.url.trim();
      const isDataImage = url.startsWith("data:image/");
      const isHttp = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/");
      if (!isDataImage && !isHttp) {
        res.status(400).json({ error: "Faqat xavfsiz rasm yoki fayl manzillari qabul qilinadi" });
        return;
      }
      if (isDataImage && url.length > 15 * 1024 * 1024) {
        res.status(400).json({ error: "Fayl hajmi 15MB dan oshmasligi kerak" });
        return;
      }
    }

    const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
    if (!chat) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }
    const role = await resolveRole(chat, req.user!.id);
    if (!role) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }
    const sender = role === "master" ? "master" : "customer";

    const [message] = await db
      .insert(chatMessagesTable)
      .values({
        chatId, sender,
        text: text?.trim() || null,
        attachmentType: attachment?.type ?? null,
        attachmentUrl: attachment?.url ?? null,
        deliveredAt: new Date(),
      })
      .returning();

    await db
      .update(chatsTable)
      .set(sender === "master" ? { customerUnread: sql`${chatsTable.customerUnread} + 1` } : { providerUnread: sql`${chatsTable.providerUnread} + 1` })
      .where(eq(chatsTable.id, chatId));

    await recordResponseSampleIfReply(chat, message);

    broadcastToChat(chatId, { type: "message", message: messageJson(message) }, req.user!.id);

    res.status(201).json({ message: messageJson(message) });
  } catch (err) {
    console.error("Send chat message error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /:chatId/read — clear the caller's unread counter ───────────────
router.patch("/:chatId/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const chatId: string = String(req.params.chatId);
    const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
    if (!chat) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }
    const role = await resolveRole(chat, req.user!.id);
    if (!role) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }
    await db.update(chatsTable).set(role === "master" ? { providerUnread: 0 } : { customerUnread: 0 }).where(eq(chatsTable.id, chatId));
    const now = new Date();
    // Only the OTHER side's messages become "read" — the reader opening the
    // chat must never mark their own just-sent messages as read.
    const otherSender = role === "master" ? "customer" : "master";
    await db
      .update(chatMessagesTable)
      .set({ readAt: now })
      .where(and(
        eq(chatMessagesTable.chatId, chatId),
        eq(chatMessagesTable.sender, otherSender),
        sql`${chatMessagesTable.readAt} is null`,
      ));
    broadcastToChat(chatId, { type: "read", chatId, readAt: now.toISOString() }, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Mark chat read error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── PATCH /:chatId/clear — set the caller's clear-chat watermark ──────────
router.patch("/:chatId/clear", requireAuth, async (req: AuthRequest, res) => {
  try {
    const chatId: string = String(req.params.chatId);
    const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
    if (!chat) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }
    const role = await resolveRole(chat, req.user!.id);
    if (!role) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }
    await db.update(chatsTable).set(role === "master" ? { providerClearedAt: new Date() } : { customerClearedAt: new Date() }).where(eq(chatsTable.id, chatId));
    res.json({ ok: true });
  } catch (err) {
    console.error("Clear chat error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

// ─── DELETE /messages/:messageId — delete for everyone (own msg) or for me ─
router.delete("/messages/:messageId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const messageId: string = String(req.params.messageId);
    const mode = (req.query.mode === "everyone" ? "everyone" : "me") as "everyone" | "me";
    const [message] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, messageId)).limit(1);
    if (!message) {
      res.status(404).json({ error: "Xabar topilmadi" });
      return;
    }
    const [chat] = await db.select().from(chatsTable).where(eq(chatsTable.id, message.chatId)).limit(1);
    if (!chat) {
      res.status(404).json({ error: "Chat topilmadi" });
      return;
    }
    const role = await resolveRole(chat, req.user!.id);
    if (!role) {
      res.status(403).json({ error: "Ruxsat yo'q" });
      return;
    }

    if (mode === "everyone") {
      const isOwnMessage = (role === "master" && message.sender === "master") || (role === "customer" && message.sender === "customer");
      if (!isOwnMessage) {
        res.status(403).json({ error: "Faqat o'z xabaringizni hammaga o'chira olasiz" });
        return;
      }
      await db.update(chatMessagesTable).set({ deletedForEveryone: true, deletedAt: new Date(), text: null, attachmentUrl: null, attachmentType: null }).where(eq(chatMessagesTable.id, messageId));
    } else {
      const nextDeletedFor = [...(message.deletedForUsers ?? [])];
      if (!nextDeletedFor.includes(req.user!.id)) nextDeletedFor.push(req.user!.id);
      await db.update(chatMessagesTable).set({ deletedForUsers: nextDeletedFor }).where(eq(chatMessagesTable.id, messageId));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete chat message error:", err);
    res.status(500).json({ error: "Xatolik yuz berdi" });
  }
});

export default router;
