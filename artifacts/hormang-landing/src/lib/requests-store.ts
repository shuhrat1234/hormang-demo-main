/**
 * requests-store.ts
 * Backend-backed customer requests, offers, and chats — see
 * requests-client.ts for the raw API calls. This module owns shape
 * adaptation: composing the backend's normalized rows into the
 * denormalized Request/Offer/Chat views the rest of the app expects,
 * so existing consumers change as little as possible. Every function
 * that touches shared (cross-device) data is now async.
 */
import { getBlockedUsers } from "./report-store";
import { getLiveProviderName } from "./local-profile";
import { emitStoreChange } from "./store-events";
import * as api from "./requests-client";
import { ApiError } from "./requests-client";
import type { Dict } from "./i18n/locales/uz";
export { ApiError };

/* ─── Types (unchanged shape — see landmine notes in the Phase D backend
   commit for why these stay denormalized rather than matching the DB 1:1) ── */

export interface CustomerRequest {
  id: string;
  customerId?: string;
  customerName?: string;
  categoryId: string;
  categoryName: string;
  emoji: string;
  answers: Record<string, unknown>;
  requestPhotos?: string[];
  status: "open" | "accepted" | "matched" | "completed" | "cancelled" | "inactive";
  createdAt: string;
  offerCount: number;
  region?: string;
  district?: string;
  acceptedOfferId?: string;
  closedForOffers?: boolean;
}

export type OfferStatus =
  | "pending" | "negotiating" | "accepted" | "rejected" | "cancelled"
  | "expired" | "in_progress" | "completed" | "Yopilgan";

export interface Offer {
  id: string;
  requestId: string;
  masterId: string;
  masterName: string;
  masterInitials: string;
  masterColor: string;
  price: number;
  priceLabel?: string;
  message: string;
  fileUrls?: string[];
  avgResponseTime: number;
  createdAt: string;
  status: OfferStatus;
  tangaSpent?: number;
  refunded?: boolean;
  providerConfirmedCompleted?: boolean;
  customerConfirmedCompleted?: boolean;
  completionAfterPhotos?: string[];
  completionNotes?: string;
  completionDurationMinutes?: number;
}

export interface CompletionDetails {
  afterPhotos?: string[];
  completionNotes?: string;
  durationMinutes?: number;
}

export const MAX_ACTIVE_OFFERS = 5;
export const MAX_LIFETIME_OFFERS = 10;
export const REQUEST_COOLDOWN_MS = 5 * 60 * 1000;
export const REQUEST_EXTENDED_COOLDOWN_MS = 30 * 60 * 1000;
export const REQUEST_EXTENDED_THRESHOLD = 3;
export const REQUEST_DAILY_FLAG_THRESHOLD = 5;

export interface ChatAttachment {
  type: "image" | "file";
  url: string;
  name?: string;
}

export interface ChatMessage {
  id: string;
  sender: "customer" | "master" | "system";
  text: string;
  timestamp: string;
  attachment?: ChatAttachment;
  deliveredAt?: string | null;
  readAt?: string | null;
  deletedForEveryone?: boolean;
  deletedAt?: string | null;
  deletedForUsers?: string[];
}

export interface Chat {
  id: string;
  requestId: string;
  masterId: string;
  masterName: string;
  masterInitials: string;
  masterColor: string;
  avgResponseTime: number;
  categoryId: string;
  categoryName: string;
  categoryEmoji: string;
  customerName: string;
  customerInitials: string;
  customerColor: string;
  providerUnread: number;
  customerUnread?: number;
  /** Epoch ms after which messages are visible for that side (0 = show all). */
  customerClearedAt: number;
  providerClearedAt: number;
  messages: ChatMessage[];
  createdAt: string;
}

export type CooldownState = api.CooldownState;
export type { BackendRequest, BackendOffer } from "./requests-client";

/* ─── Customer/phone registry — local, supplementary display cache ──
 * Still populated on every login (auth-context.ts). Real requests/offers
 * now carry customerName from the backend directly; this registry is only
 * a fallback for names on legacy/older data. */

const CUSTOMER_REGISTRY_KEY = "hormang_customer_registry";
const PHONE_REGISTRY_KEY = "hormang_phone_registry";
interface CustomerEntry { name: string; initials: string }

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}
function writeLocalJSON<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

export function saveCustomerToRegistry(userId: string, name: string, initials: string): void {
  if (!userId || !name) return;
  const reg = readJSON<Record<string, CustomerEntry>>(CUSTOMER_REGISTRY_KEY, {});
  reg[userId] = { name, initials };
  writeLocalJSON(CUSTOMER_REGISTRY_KEY, reg);
}
export function getCustomerFromRegistry(userId: string): CustomerEntry | null {
  if (!userId) return null;
  return readJSON<Record<string, CustomerEntry>>(CUSTOMER_REGISTRY_KEY, {})[userId] ?? null;
}
export function savePhoneToRegistry(userId: string, phone: string | null | undefined): void {
  if (!userId || !phone) return;
  const reg = readJSON<Record<string, string>>(PHONE_REGISTRY_KEY, {});
  reg[userId] = phone;
  writeLocalJSON(PHONE_REGISTRY_KEY, reg);
}
export function getPhoneRegistry(): Record<string, string> {
  return readJSON<Record<string, string>>(PHONE_REGISTRY_KEY, {});
}

/* ─── Adapters: backend row -> local shape ──────────────────────────── */

function initialsOf(name: string): string {
  return name.split(" ").map((p) => p[0] ?? "").join("").toUpperCase().slice(0, 2) || "X";
}
const PALETTE = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2"];
function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function toCustomerRequest(r: api.BackendRequest): CustomerRequest {
  return { ...r, offerCount: r.offerCount ?? 0 };
}
function toOffer(o: api.BackendOffer): Offer {
  // Prefer the provider's current name over the snapshot frozen on the offer
  // at submission time — the snapshot goes stale the moment they rename
  // themselves. Falls back to the snapshot until the live name loads.
  return { ...o, masterName: getLiveProviderName(o.masterId) ?? o.masterName };
}
export function toChatMessage(m: api.BackendChatMessage): ChatMessage {
  return {
    id: m.id,
    sender: m.sender,
    text: m.text ?? "",
    timestamp: m.createdAt,
    attachment: m.attachment,
    deliveredAt: m.deliveredAt ?? null,
    readAt: m.readAt ?? null,
    deletedForEveryone: m.deletedForEveryone,
    deletedAt: m.deletedAt ?? null,
    deletedForUsers: m.deletedForUsers,
  };
}

/** Enrich a backend chat with denormalized display fields. Fetches the
 * associated request + offer if not already supplied. */
async function enrichChat(c: api.BackendChat, request?: CustomerRequest, offer?: Offer): Promise<Chat> {
  const req = request ?? (await fetchRequestByIdSafe(c.requestId));
  const off = offer ?? (await fetchOfferForChatSafe(c.requestId, c.masterId));
  const customerName = req?.customerName || getCustomerFromRegistry(req?.customerId ?? "")?.name || "Mijoz";
  return {
    id: c.id,
    requestId: c.requestId,
    masterId: c.masterId,
    masterName: off?.masterName ?? "Ijrochi",
    masterInitials: off?.masterInitials ?? "IJ",
    masterColor: off?.masterColor ?? "#7C3AED",
    avgResponseTime: off?.avgResponseTime ?? 14,
    categoryId: req?.categoryId ?? "",
    categoryName: req?.categoryName ?? "",
    categoryEmoji: req?.emoji ?? "📋",
    customerName,
    customerInitials: initialsOf(customerName),
    customerColor: colorFromId(req?.customerId ?? c.masterId),
    providerUnread: c.providerUnread,
    customerUnread: c.customerUnread,
    customerClearedAt: c.customerClearedAt ? new Date(c.customerClearedAt).getTime() : 0,
    providerClearedAt: c.providerClearedAt ? new Date(c.providerClearedAt).getTime() : 0,
    messages: [],
    createdAt: c.createdAt,
  };
}
async function fetchRequestByIdSafe(id: string): Promise<CustomerRequest | undefined> {
  try { return toCustomerRequest((await api.fetchRequestById(id)).request); } catch { return undefined; }
}
async function fetchOfferForChatSafe(requestId: string, masterId: string): Promise<Offer | undefined> {
  try {
    const { offers } = await api.fetchOffersByRequest(requestId);
    const found = offers.find((o) => o.masterId === masterId);
    return found ? toOffer(found) : undefined;
  } catch { return undefined; }
}

/* ─── Requests ───────────────────────────────────────────────────── */

export async function getRequestById(id: string): Promise<CustomerRequest | undefined> {
  try {
    return toCustomerRequest((await api.fetchRequestById(id)).request);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

export async function saveNewRequest(
  categoryId: string,
  categoryName: string,
  answers: Record<string, unknown>,
  location?: { region?: string; district?: string },
  _customerId?: string,
  customerName?: string,
  requestPhotos?: string[],
): Promise<CustomerRequest> {
  try {
    const { request } = await api.createRequest({
      categoryId, categoryName, answers, requestPhotos,
      customerName, region: location?.region, district: location?.district,
    });
    return toCustomerRequest(request);
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      const cooldownData = (e.data as { cooldown?: api.CooldownState } | undefined)?.cooldown;
      const err = new Error(e.message) as Error & { code?: string; cooldown?: api.CooldownState };
      err.code = "REQUEST_COOLDOWN";
      err.cooldown = cooldownData;
      throw err;
    }
    throw e;
  }
}

export async function updateRequestStatus(requestId: string, status: CustomerRequest["status"]): Promise<void> {
  await api.updateRequestStatus(requestId, status);
}

export async function canDeleteRequest(requestId: string): Promise<boolean> {
  const { count } = await api.fetchRequestOfferCount(requestId);
  return count === 0;
}
export async function hasEverReceivedOffer(requestId: string): Promise<boolean> {
  const { count } = await api.fetchRequestOfferCount(requestId);
  return count > 0;
}

export async function getRequestsByCustomer(customerId: string): Promise<CustomerRequest[]> {
  if (!customerId) return [];
  const { requests } = await api.fetchMyRequests();
  return requests.map(toCustomerRequest).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getOffersByCustomer(customerId: string): Promise<Offer[]> {
  if (!customerId) return [];
  const [{ offers }, blocked] = await Promise.all([api.fetchOffersForMyRequests(), Promise.resolve(getBlockedUsers(customerId))]);
  const blockedSet = new Set(blocked);
  return offers.filter((o) => !blockedSet.has(o.masterId)).map(toOffer);
}

export async function getChatsByCustomer(customerId: string): Promise<Chat[]> {
  if (!customerId) return [];
  const [{ chats }, { requests }, { offers }, blocked] = await Promise.all([
    api.fetchMyChats(), api.fetchMyRequests(), api.fetchOffersForMyRequests(), Promise.resolve(getBlockedUsers(customerId)),
  ]);
  const blockedSet = new Set(blocked);
  const requestById = new Map(requests.map((r) => [r.id, toCustomerRequest(r)]));
  const offerByPair = new Map(offers.map((o) => [`${o.requestId}_${o.masterId}`, toOffer(o)]));
  const mine = chats.filter((c) => requestById.has(c.requestId) && !blockedSet.has(c.masterId));
  return Promise.all(mine.map((c) => enrichChat(c, requestById.get(c.requestId), offerByPair.get(`${c.requestId}_${c.masterId}`))));
}

/** Total unread messages across every chat belonging to this customer's requests. */
export async function getTotalCustomerUnread(customerId: string): Promise<number> {
  const chats = await getChatsByCustomer(customerId);
  return chats.reduce((s, c) => s + (c.customerUnread ?? 0), 0);
}

export async function getRequestCounts(requestId: string): Promise<{ active: number; total: number }> {
  const { offers } = await api.fetchOffersByRequest(requestId);
  const ACTIVE: OfferStatus[] = ["pending", "negotiating", "accepted"];
  return { active: offers.filter((o) => ACTIVE.includes(o.status)).length, total: offers.length };
}

export type CanSubmitOfferReason =
  | "no_request" | "request_closed" | "matched" | "active_limit" | "lifetime_limit" | "already_offered" | "self_request";

/** Client-side pre-check for UI messaging only — POST /api/offers re-validates
 * server-side and is the actual source of truth. */
export async function canSubmitOffer(
  requestId: string, providerId: string,
): Promise<{ ok: boolean; reason?: CanSubmitOfferReason; active: number; total: number }> {
  const [request, { offers }] = await Promise.all([getRequestById(requestId), api.fetchOffersByRequest(requestId)]);
  const ACTIVE: OfferStatus[] = ["pending", "negotiating", "accepted"];
  const active = offers.filter((o) => ACTIVE.includes(o.status)).length;
  const total = offers.length;
  if (!request) return { ok: false, reason: "no_request", active, total };
  if (providerId && request.customerId === providerId) return { ok: false, reason: "self_request", active, total };
  if (request.closedForOffers || request.acceptedOfferId || request.status === "matched") return { ok: false, reason: "matched", active, total };
  if (request.status !== "open") return { ok: false, reason: "request_closed", active, total };
  if (total >= MAX_LIFETIME_OFFERS) return { ok: false, reason: "lifetime_limit", active, total };
  if (active >= MAX_ACTIVE_OFFERS) return { ok: false, reason: "active_limit", active, total };
  if (providerId && offers.some((o) => o.masterId === providerId && ACTIVE.includes(o.status))) {
    return { ok: false, reason: "already_offered", active, total };
  }
  return { ok: true, active, total };
}

export function offerBlockLabel(reason: CanSubmitOfferReason | undefined, t: Dict): string {
  switch (reason) {
    case "matched":         return t.offerBlock.matched;
    case "active_limit":    return t.offerBlock.activeLimit;
    case "lifetime_limit":  return t.offerBlock.lifetimeLimit;
    case "request_closed":  return t.offerBlock.requestClosed;
    case "already_offered": return t.offerBlock.alreadyOffered;
    case "no_request":      return t.offerBlock.noRequest;
    case "self_request":    return t.offerBlock.selfRequest;
    default:                return t.offerBlock.default;
  }
}

/* ─── Offers ─────────────────────────────────────────────────────── */

export async function getMyOffers(): Promise<Offer[]> {
  const { offers } = await api.fetchMyOffers();
  return offers.map(toOffer);
}
export async function getOffersByRequestId(requestId: string): Promise<Offer[]> {
  const { offers } = await api.fetchOffersByRequest(requestId);
  return offers.map(toOffer);
}
export async function getOfferForChat(requestId: string, masterId: string): Promise<Offer | undefined> {
  return fetchOfferForChatSafe(requestId, masterId);
}
export async function getOfferById(offerId: string): Promise<Offer | undefined> {
  try { return toOffer((await api.fetchOfferById(offerId)).offer); } catch { return undefined; }
}

/** Submit an offer: atomic server-side wallet debit + offer create + chat open. */
export async function submitOffer(body: {
  requestId: string; price: number; priceLabel?: string; message: string;
  fileUrls?: string[]; costTanga: number;
  masterName?: string; masterInitials?: string; masterColor?: string;
}): Promise<Offer> {
  const { offer } = await api.submitOffer(body);
  return toOffer(offer);
}

export async function updateOfferStatus(offerId: string, status: "accepted" | "rejected"): Promise<Offer> {
  const { offer } = await api.setOfferStatus(offerId, status);
  return toOffer(offer);
}

export type ReopenOfferReason = "not_found" | "not_rejected" | "no_request" | "request_closed" | "already_accepted";
export async function reopenOffer(offerId: string): Promise<{ ok: boolean; reason?: ReopenOfferReason }> {
  try {
    await api.reopenOffer(offerId);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof ApiError ? (e.message as ReopenOfferReason) : undefined };
  }
}

export async function markOfferInProgress(offerId: string): Promise<Offer> {
  const { offer } = await api.markOfferInProgress(offerId);
  return toOffer(offer);
}

/** Two-sided completion confirmation. Returns "waiting" if only one side has
 * confirmed so far, "completed" once both sides have. */
export async function confirmCompletion(
  offerId: string,
  role: "provider" | "customer",
  completion?: CompletionDetails,
): Promise<"waiting" | "completed"> {
  const { offer } = await api.confirmOfferCompletion(offerId, role, completion ? {
    afterPhotos: completion.afterPhotos, completionNotes: completion.completionNotes, durationMinutes: completion.durationMinutes,
  } : undefined);
  return offer.status === "completed" ? "completed" : "waiting";
}

export async function getLast10RejectedEligibility(providerId: string): Promise<{ eligible: boolean; refundAmount: number; offers: Offer[] }> {
  const r = await api.adminRefundEligibility(providerId);
  return { ...r, offers: r.offers.map(toOffer) };
}
export async function adminRefundProvider(providerId: string): Promise<{ ok: boolean; refundAmount?: number }> {
  return api.adminRefundProvider(providerId);
}
export async function markOfferCompleted(offerId: string): Promise<Offer> {
  const { offer } = await api.adminForceCompleteOffer(offerId);
  return toOffer(offer);
}
export async function deleteRequestCascade(requestId: string): Promise<void> {
  await api.adminDeleteRequest(requestId);
}
export async function adminSetRequestStatus(requestId: string, status: CustomerRequest["status"]): Promise<CustomerRequest> {
  const { request } = await api.adminSetRequestStatus(requestId, status);
  return toCustomerRequest(request);
}
export async function adminDeleteOffer(offerId: string): Promise<void> {
  await api.adminDeleteOffer(offerId);
}

/** All requests/offers/chats now cascade-delete server-side via FK when the
 * user row is removed (see deleteUserBackend). This only clears the
 * remaining per-user localStorage keys that have no backend model yet
 * (local profile, referral state, provider "seen" prefs, etc). */
export function deleteUserDataCascade(userId: string): void {
  if (!userId) return;
  const PER_USER_PREFIXES = [
    `user_${userId}_`,
    `provider_tokens_${userId}`,
    `hormang_referral_${userId}`,
    `hormang_ref_pending_${userId}`,
    `hormang_ref_inviter_${userId}`,
    `hormang_tanga_history_${userId}`,
    `provider_seen_${userId}`,
    `provider_offers_${userId}`,
    `provider_services_${userId}`,
    `provider_statuses_${userId}`,
  ];
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (PER_USER_PREFIXES.some((p) => k === p || k.startsWith(p))) toRemove.push(k);
    if (k.endsWith(`_${userId}`) || k.includes(`_${userId}_`)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
  emitStoreChange();
}

/* ─── Admin: full marketplace listings ──────────────────────────── */
export async function getAllRequestsAdmin(): Promise<CustomerRequest[]> {
  const { requests } = await api.adminFetchAllRequests();
  return requests.map(toCustomerRequest);
}
export async function getAllOffersAdmin(): Promise<Offer[]> {
  const { offers } = await api.adminFetchAllOffers();
  return offers.map(toOffer);
}
export async function getAllChatsAdmin(): Promise<Chat[]> {
  const [{ chats }, requests, offers] = await Promise.all([
    api.adminFetchAllChats(),
    getAllRequestsAdmin(),
    getAllOffersAdmin(),
  ]);
  const requestById = new Map(requests.map((r) => [r.id, r]));
  const offerByPair = new Map(offers.map((o) => [`${o.requestId}_${o.masterId}`, o]));
  return Promise.all(chats.map(async (c) => {
    const enriched = await enrichChat(c, requestById.get(c.requestId), offerByPair.get(`${c.requestId}_${c.masterId}`));
    enriched.messages = c.messages.map(toChatMessage);
    return enriched;
  }));
}

/** Admin-only suspicious-activity flag: how many non-cancelled requests this
 * customer created in the last `windowMs` (default 24h). */
export async function getRecentRequestCount(customerId: string, windowMs = ONE_DAY_MS): Promise<number> {
  const { requests } = await api.adminFetchAllRequests();
  const now = Date.now();
  return requests.filter((r) => r.customerId === customerId && r.status !== "cancelled" && now - new Date(r.createdAt).getTime() < windowMs).length;
}
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/* ─── Chats ──────────────────────────────────────────────────────── */

export async function getOrCreateChat(requestId: string, masterId: string): Promise<Chat> {
  const { chat, messages } = await api.fetchChatByPair(requestId, masterId);
  const enriched = await enrichChat(chat);
  enriched.messages = messages.map(toChatMessage);
  return enriched;
}

export async function getChatWithMessages(requestId: string, masterId: string): Promise<Chat> {
  return getOrCreateChat(requestId, masterId);
}

export async function sendMessage(
  chatId: string,
  _sender: "customer" | "master",
  text: string,
  attachment?: ChatAttachment,
): Promise<ChatMessage> {
  // Response-time samples are recorded server-side now (see POST
  // /chats/:chatId/messages) — authoritative regardless of device.
  const { message } = await api.sendChatMessage(chatId, text, attachment);
  return toChatMessage(message);
}

export async function markProviderChatRead(chatId: string): Promise<void> { await api.markChatRead(chatId); }
export async function markCustomerChatRead(chatId: string): Promise<void> { await api.markChatRead(chatId); }

export async function deleteMessageForEveryone(_chatId: string, messageId: string): Promise<boolean> {
  try { await api.deleteChatMessage(messageId, "everyone"); return true; } catch { return false; }
}
export async function deleteMessageForMe(_chatId: string, messageId: string): Promise<boolean> {
  try { await api.deleteChatMessage(messageId, "me"); return true; } catch { return false; }
}

/* ─── Per-side chat clear (server-backed watermark) ─────────────────────
 * Cleared-at is embedded directly on the Chat object (customerClearedAt /
 * providerClearedAt) — callers filtering message history read those fields
 * off the already-fetched chat instead of a separate lookup call. */
export async function clearChatForCustomer(chatId: string): Promise<void> { await api.clearChat(chatId); }
export async function clearChatForProvider(chatId: string): Promise<void> { await api.clearChat(chatId); }
