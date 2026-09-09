/**
 * provider-store.ts
 * Provider (ijrochi) side adapters over the real backend requests/offers/chats
 * (see requests-store.ts / requests-client.ts). Provider-only preferences
 * that never need to be cross-device (seen-request dismissal, ignored-request
 * filtering, upcoming-service scheduling) stay in localStorage — a
 * deliberate, disclosed scope boundary, not an oversight.
 */

import type { CustomerRequest, Chat } from "./requests-store";
import {
  getCustomerFromRegistry,
  getRequestById, markOfferInProgress as markOfferInProgressStore,
  getOrCreateChat as getOrCreateChatStore,
  sendMessage as sendMessageStore,
  markProviderChatRead as markProviderChatReadStore,
  submitOffer as submitOfferStore,
  type Offer,
} from "./requests-store";
import * as api from "./requests-client";
import { getBlockedUsers } from "./report-store";
import { doesCategoryMatch, doesLocationMatchV2, type ProviderServiceArea } from "./matching";
import { migrateCategoryValuesSafe, migrateLegacyCategoryValue } from "./categories";
import {
  getAllQuestionsForCategory, collectActiveQuestions,
  type Question,
} from "./questionnaire-store";
import { getLocalizedText } from "./localization";
import type { Locale } from "@/lib/i18n";

/* ─── Types ──────────────────────────────────────────────────────── */

export interface ProviderRequest {
  id: string;
  categoryId: string;
  categoryName: string;
  emoji: string;
  description: string;
  budget: number | null;
  budgetLabel: string;
  urgency: "urgent" | "normal" | "flexible";
  location: string;
  customerName: string;
  customerId: string;
  createdAt: string;
  status: "open" | "responded" | "ignored";
  answers: Record<string, unknown>;
  region?: string;
  district?: string;
  requestPhotos?: string[];
  offerCount: number;
}

export interface UpcomingService {
  id: string;
  offerId?: string;
  requestId?: string;
  masterId?: string;
  customerId?: string;
  title: string;
  customerName: string;
  customerInitials: string;
  customerColor: string;
  date: string;
  time: string;
  location: string;
  categoryEmoji: string;
  status: "upcoming" | "done";
}

export interface ProviderChatMessage {
  id: string;
  sender: "provider" | "customer" | "system";
  text: string;
  timestamp: string;
  attachment?: import("./requests-store").ChatAttachment;
  deliveredAt?: string | null;
  readAt?: string | null;
  deletedForEveryone?: boolean;
  deletedAt?: string | null;
  deletedForUsers?: string[];
}

export interface ProviderChat {
  id: string;
  requestId: string;
  masterId: string;
  masterName: string;
  masterInitials: string;
  masterColor: string;
  customerId: string;
  customerName: string;
  customerInitials: string;
  customerColor: string;
  categoryId?: string;
  categoryName: string;
  categoryEmoji: string;
  avgResponseTime: number;
  messages: ProviderChatMessage[];
  unread: number;
  createdAt: string;
  customerClearedAt: number;
  providerClearedAt: number;
  region?: string;
  district?: string;
}

export type ProviderOffer = Offer;

/* ─── Storage Keys — provider-only local preferences ────────────────── */

function servicesKey(providerId: string): string { return `hormang_provider_services_${providerId}`; }
function seenKey(providerId?: string): string { return providerId ? `hormang_provider_seen_${providerId}` : "hormang_provider_seen"; }
function providerStatusesKey(providerId: string): string { return `hormang_provider_statuses_${providerId}`; }
const AVG_RESPONSE_KEY = "hormang_provider_avg_response";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}
function writeJSON<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}
function uid(): string { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

/* ─── Chat conversion helpers ─────────────────────────────────────── */

function chatToProviderChat(c: Chat, categoryId?: string): ProviderChat {
  return {
    id: c.id,
    requestId: c.requestId,
    masterId: c.masterId,
    masterName: c.masterName,
    masterInitials: c.masterInitials,
    masterColor: c.masterColor,
    customerId: "", // resolved by the caller from the request object
    customerName: c.customerName,
    customerInitials: c.customerInitials,
    customerColor: c.customerColor || "#7C3AED",
    categoryId,
    categoryName: c.categoryName,
    categoryEmoji: c.categoryEmoji || "📋",
    avgResponseTime: c.avgResponseTime ?? 14,
    messages: c.messages.map((m) => ({
      id: m.id,
      sender: m.sender === "customer" ? "customer" as const : m.sender === "system" ? "system" as const : "provider" as const,
      text: m.text,
      timestamp: m.timestamp,
      deliveredAt: m.deliveredAt ?? m.timestamp,
      readAt: m.readAt ?? null,
      ...(m.attachment ? { attachment: m.attachment } : {}),
    })),
    unread: c.providerUnread ?? 0,
    createdAt: c.createdAt,
    customerClearedAt: c.customerClearedAt,
    providerClearedAt: c.providerClearedAt,
  };
}

/* ─── Buyer-request → ProviderRequest adapter ────────────────────── */

type ProviderActionStatus = "responded" | "ignored";

function getProviderStatuses(providerId: string): Record<string, ProviderActionStatus> {
  return readJSON<Record<string, ProviderActionStatus>>(providerStatusesKey(providerId), {});
}

function urgencyFrom(answers: Record<string, unknown>): ProviderRequest["urgency"] {
  const u = answers["urgency"] as string | undefined;
  if (u === "today_tomorrow") return "urgent";
  if (u === "3_7_days" || u === "1_2_weeks") return "normal";
  return "flexible";
}

function budgetFrom(answers: Record<string, unknown>): { budget: number | null; budgetLabel: string } {
  const b = answers["budget"] as number | undefined;
  const open = answers["budget_open"] as boolean | undefined;
  if (b && b > 0) return { budget: b, budgetLabel: `${b.toLocaleString()} so'm` };
  if (open) return { budget: null, budgetLabel: "Taklifga ochiq" };
  return { budget: null, budgetLabel: "Kelishiladi" };
}

function locationFrom(answers: Record<string, unknown>): string {
  for (const k of ["district", "location", "address", "region", "move_from", "turar_joy"]) {
    const v = answers[k];
    if (v && typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "Toshkent";
}

function formatQValue(q: Question, v: unknown, answers: Record<string, unknown>): string | null {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  if (typeof v === "string" && v.startsWith("data:")) return null;
  if (typeof v === "boolean") return v ? "Ha" : "Yo'q";
  if (typeof v === "number") return String(v);
  const otherOpt = q.options?.find((o) => o.type === "other");
  if (typeof v === "string") {
    if (otherOpt && v === otherOpt.value) {
      const customText = answers[q.id + "_other"] as string | undefined;
      return customText?.trim() || otherOpt.label;
    }
    return q.options?.find((o) => o.value === v)?.label ?? v;
  }
  if (Array.isArray(v)) {
    return (v as string[])
      .map((item) => {
        if (otherOpt && item === otherOpt.value) {
          const customText = answers[q.id + "_other"] as string | undefined;
          return customText?.trim() || otherOpt.label;
        }
        return q.options?.find((o) => o.value === item)?.label ?? item;
      })
      .join(", ");
  }
  return null;
}

function descriptionFrom(answers: Record<string, unknown>, categoryId: string): string {
  const skip = new Set(["urgency", "budget", "budget_open", "region", "district", "location"]);
  const parts: string[] = [];
  try {
    const allQs = getAllQuestionsForCategory(categoryId);
    const activeQs = collectActiveQuestions(allQs, answers);
    for (const q of activeQs) {
      if (skip.has(q.id) || q.type === "file" || q.type === "section-header" || q.type === "location") continue;
      const v = answers[q.id];
      const formatted = formatQValue(q, v, answers);
      if (formatted) parts.push(formatted);
    }
  } catch {
    for (const [k, v] of Object.entries(answers)) {
      if (skip.has(k) || !v || k.endsWith("_photo") || k.endsWith("_file") || k.endsWith("_other")) continue;
      if (typeof v === "boolean") parts.push(v ? "Ha" : "Yo'q");
      else if (Array.isArray(v)) { if (v.length > 0) parts.push((v as string[]).join(", ")); }
      else if (typeof v === "number") parts.push(String(v));
      else if (typeof v === "string" && v.trim() && !v.startsWith("data:")) parts.push(v.trim());
    }
  }
  const desc = parts.join(" · ");
  return desc.length > 130 ? desc.slice(0, 127) + "..." : desc || "—";
}

/**
 * Re-computes the request description at render time using the active locale.
 * Falls back to the stored `request.description` when questions are unavailable.
 */
export function getLocalizedDescription(request: ProviderRequest, locale: string): string {
  const skip = new Set(["urgency", "budget", "budget_open", "region", "district", "location"]);
  const answers = (request.answers ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  try {
    const allQs = getAllQuestionsForCategory(request.categoryId);
    const activeQs = collectActiveQuestions(allQs, answers);
    for (const q of activeQs) {
      if (skip.has(q.id) || q.type === "file" || q.type === "section-header" || q.type === "location") continue;
      const v = answers[q.id];
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      if (typeof v === "string" && v.startsWith("data:")) continue;

      const optLabel = (value: string): string => {
        const otherOpt = q.options?.find((o) => o.type === "other");
        if (otherOpt && value === otherOpt.value) {
          const customText = answers[q.id + "_other"] as string | undefined;
          return customText?.trim() || getLocalizedText(otherOpt.labelLocalized ?? otherOpt.label, locale as Locale);
        }
        const opt = q.options?.find((o) => o.value === value);
        return opt ? getLocalizedText(opt.labelLocalized ?? opt.label, locale as Locale) : value;
      };

      let formatted: string | null = null;
      if (typeof v === "boolean") formatted = v ? (locale === "ru" ? "Да" : locale === "en" ? "Yes" : "Ha") : (locale === "ru" ? "Нет" : locale === "en" ? "No" : "Yo'q");
      else if (typeof v === "number") formatted = String(v);
      else if (typeof v === "string") formatted = optLabel(v);
      else if (Array.isArray(v)) formatted = (v as string[]).map(optLabel).join(", ");

      if (formatted) parts.push(formatted);
    }
  } catch {
    return request.description;
  }
  const desc = parts.join(" · ");
  return desc.length > 130 ? desc.slice(0, 127) + "..." : desc || request.description;
}

function adaptBuyerRequest(req: CustomerRequest, actionStatus?: ProviderActionStatus): ProviderRequest {
  const { budget, budgetLabel } = budgetFrom(req.answers);
  const status: ProviderRequest["status"] = actionStatus ?? "open";
  return {
    id: req.id,
    categoryId: req.categoryId,
    categoryName: req.categoryName,
    emoji: req.emoji,
    description: descriptionFrom(req.answers, req.categoryId),
    budget,
    budgetLabel,
    urgency: urgencyFrom(req.answers),
    location: req.region ?? locationFrom(req.answers),
    customerName: req.customerName || getCustomerFromRegistry(req.customerId ?? "")?.name || "Mijoz",
    customerId: req.customerId ?? "",
    createdAt: req.createdAt,
    status,
    answers: req.answers,
    region: req.region,
    district: req.district,
    offerCount: req.offerCount,
  };
}

/* ─── Requests API ───────────────────────────────────────────────── */

/**
 * Open requests matching this provider's categories/service area. Also
 * includes their own already-offered requests (even once matched/closed)
 * so they can still see the outcome, mirroring the previous local behavior.
 */
export async function getMatchingRequests(
  selectedCategories: string[],
  serviceAreas: string[] = [],
  providerId: string = "",
  serviceAreaV2?: ProviderServiceArea,
): Promise<ProviderRequest[]> {
  const [{ requests: openRequests }, myOffers] = await Promise.all([
    api.fetchOpenRequests(),
    providerId ? api.fetchMyOffers().then((r) => r.offers) : Promise.resolve([]),
  ]);
  const statuses = getProviderStatuses(providerId);
  const blockedByProvider = providerId ? new Set(getBlockedUsers(providerId)) : new Set<string>();
  const myOfferRequestIds = new Set(myOffers.map((o) => o.requestId));

  const matching = openRequests.filter((r) => {
    if (providerId && r.customerId === providerId) return false;
    if (blockedByProvider.size > 0 && r.customerId && blockedByProvider.has(r.customerId)) return false;
    const reqCat = migrateLegacyCategoryValue(r.categoryId || r.categoryName) ?? (r.categoryId || r.categoryName);
    const normalizedSelected = migrateCategoryValuesSafe(selectedCategories);
    if (!doesCategoryMatch(reqCat, normalizedSelected)) return false;
    if (!doesLocationMatchV2(r.region, r.district, serviceAreaV2 ?? null, serviceAreas)) return false;
    return true;
  });

  // Requests the provider already offered on, even if no longer "open" —
  // they should still see the card (e.g. to see "Yopilgan" outcome).
  const alreadySeenIds = new Set(matching.map((r) => r.id));
  const extraOffered = myOffers
    .filter((o) => !alreadySeenIds.has(o.requestId))
    .map((o) => o.requestId);
  const extraRequests = (await Promise.all(
    Array.from(new Set(extraOffered)).map((id) => getRequestById(id)),
  )).filter((r): r is CustomerRequest => !!r);

  return [...matching.map((r) => ({ ...r, offerCount: r.offerCount ?? 0 } as CustomerRequest)), ...extraRequests]
    .map((r) => adaptBuyerRequest(r, statuses[r.id] ?? (myOfferRequestIds.has(r.id) ? "responded" : undefined)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getProviderRequests(providerId: string = ""): Promise<ProviderRequest[]> {
  return getMatchingRequests([], [], providerId);
}

export async function getProviderRequestById(id: string, providerId: string = ""): Promise<ProviderRequest | undefined> {
  return (await getMatchingRequests([], [], providerId)).find((r) => r.id === id);
}

export function updateProviderRequestStatus(id: string, status: ProviderRequest["status"], providerId: string = ""): void {
  if (status === "open") return;
  const statuses = getProviderStatuses(providerId);
  writeJSON(providerStatusesKey(providerId), { ...statuses, [id]: status as ProviderActionStatus });
}

/* ─── Seen IDs (local, per-browser dismissal state) ─────────────── */

export function getSeenIds(providerId?: string): string[] {
  const perUser = providerId ? readJSON<string[]>(seenKey(providerId), []) : [];
  const global = readJSON<string[]>("hormang_provider_seen", []);
  return providerId ? Array.from(new Set([...perUser, ...global])) : global;
}

export function markSeen(id: string, providerId?: string): void {
  const k = seenKey(providerId);
  const seen = readJSON<string[]>(k, []);
  if (!seen.includes(id)) writeJSON(k, [...seen, id]);
}

export async function markAllSeen(
  selectedCategories: string[] = [], serviceAreas: string[] = [], providerId: string = "", serviceAreaV2?: ProviderServiceArea,
): Promise<void> {
  const ids = (await getMatchingRequests(selectedCategories, serviceAreas, providerId, serviceAreaV2)).map((r) => r.id);
  const existing = getSeenIds(providerId);
  writeJSON(seenKey(providerId || undefined), Array.from(new Set([...existing, ...ids])));
}

export async function getUnseenRequests(
  selectedCategories: string[] = [], serviceAreas: string[] = [], providerId: string = "", serviceAreaV2?: ProviderServiceArea,
): Promise<ProviderRequest[]> {
  const seen = getSeenIds(providerId);
  return (await getMatchingRequests(selectedCategories, serviceAreas, providerId, serviceAreaV2))
    .filter((r) => !seen.includes(r.id) && r.status === "open");
}

/* ─── Upcoming Services (local — scheduling metadata not modeled server-side) ── */

export function getUpcomingServices(providerId: string): UpcomingService[] {
  if (!providerId) return [];
  return readJSON<UpcomingService[]>(servicesKey(providerId), []).sort(
    (a, b) => new Date(a.date + "T" + a.time).getTime() - new Date(b.date + "T" + b.time).getTime(),
  );
}

export function markServiceDone(id: string, providerId: string): void {
  if (!providerId) return;
  const k = servicesKey(providerId);
  writeJSON(k, readJSON<UpcomingService[]>(k, []).map((s) => (s.id === id ? { ...s, status: "done" as const } : s)));
}

export async function addUpcomingService(service: Omit<UpcomingService, "id" | "status">): Promise<UpcomingService> {
  const providerId = service.masterId ?? "";
  if (!providerId) console.error("[Hormang] addUpcomingService: masterId yo'q — saqlash bekor qilindi.");
  const newService: UpcomingService = { ...service, id: uid(), status: "upcoming" };
  const k = servicesKey(providerId);
  writeJSON(k, [...readJSON<UpcomingService[]>(k, []), newService]);
  if (service.offerId) await markOfferInProgressStore(service.offerId);
  return newService;
}

/* ─── Provider Chats ─────────────────────────────────────────────── */

export async function getProviderChats(masterId: string = ""): Promise<ProviderChat[]> {
  const { chats } = await api.fetchMyChats();
  const mine = masterId ? chats.filter((c) => c.masterId === masterId) : chats;
  const blocked = masterId ? new Set(getBlockedUsers(masterId)) : new Set<string>();
  const requests = await Promise.all(mine.map((c) => getRequestById(c.requestId)));
  const requestByChat = new Map(mine.map((c, i) => [c.id, requests[i]]));
  const withoutBlocked = mine.filter((c) => {
    const req = requestByChat.get(c.id);
    return !req?.customerId || !blocked.has(req.customerId);
  });
  return Promise.all(withoutBlocked.map(async (c) => {
    const { chat, messages } = await api.fetchChatByPair(c.requestId, c.masterId);
    const req = requestByChat.get(c.id);
    const enriched = chatToProviderChat({
      id: chat.id, requestId: chat.requestId, masterId: chat.masterId,
      masterName: "", masterInitials: "", masterColor: "", avgResponseTime: 14,
      categoryId: req?.categoryId ?? "", categoryName: req?.categoryName ?? "", categoryEmoji: req?.emoji ?? "📋",
      customerName: req?.customerName || "Mijoz", customerInitials: (req?.customerName || "Mijoz").split(" ").map((p) => p[0] ?? "").join("").toUpperCase().slice(0, 2),
      customerColor: "#2563EB", providerUnread: chat.providerUnread, customerUnread: chat.customerUnread,
      customerClearedAt: chat.customerClearedAt ? new Date(chat.customerClearedAt).getTime() : 0,
      providerClearedAt: chat.providerClearedAt ? new Date(chat.providerClearedAt).getTime() : 0,
      messages: messages.map((m) => ({
        id: m.id, sender: m.sender, text: m.text ?? "", timestamp: m.createdAt,
        attachment: m.attachment, deliveredAt: m.deliveredAt ?? null, readAt: m.readAt ?? null,
        deletedForEveryone: m.deletedForEveryone, deletedAt: m.deletedAt ?? null, deletedForUsers: m.deletedForUsers,
      })),
      createdAt: chat.createdAt,
    }, req?.categoryId);
    enriched.customerId = req?.customerId ?? "";
    return enriched;
  }));
}

export async function getProviderChatById(id: string, masterId: string = ""): Promise<ProviderChat | undefined> {
  const all = await getProviderChats(masterId);
  return all.find((c) => c.id === id);
}

export async function sendProviderMessage(
  chatId: string, sender: "provider" | "customer", text: string,
  attachment?: import("./requests-store").ChatAttachment,
): Promise<void> {
  const unifiedSender = sender === "provider" ? "master" : "customer";
  await sendMessageStore(chatId, unifiedSender, text, attachment);
}

export async function markChatRead(chatId: string): Promise<void> {
  await markProviderChatReadStore(chatId);
}

export async function getTotalUnread(masterId: string = ""): Promise<number> {
  const { chats } = await api.fetchMyChats();
  return chats.filter((c) => !masterId || c.masterId === masterId).reduce((sum, c) => sum + (c.providerUnread ?? 0), 0);
}

/* ─── Offers ─────────────────────────────────────────────────────── */

export async function getOffers(providerId: string = ""): Promise<ProviderOffer[]> {
  void providerId; // backend derives "mine" from the JWT — kept for call-site compatibility
  const { offers } = await api.fetchMyOffers();
  return offers;
}

export async function getOfferByRequestId(requestId: string, providerId: string = ""): Promise<ProviderOffer | undefined> {
  const { offers } = await api.fetchOffersByRequest(requestId);
  return offers.find((o) => o.masterId === providerId || !providerId);
}

export interface ProviderOfferExtra {
  requestId: string;
  providerName?: string;
  providerInitials?: string;
  providerColor?: string;
}

/**
 * Submit an offer: real atomic server-side wallet debit + offer create +
 * chat open (see POST /api/offers). Throws with `.message` set to one of
 * REQUEST_CLOSED / SELF_OFFER / already_offered / matched / insufficient_balance
 * on rejection, matching the error codes the UI already branches on.
 */
export async function saveOffer(
  data: { requestId: string; price: number; priceLabel: string; message: string; termsAccepted: boolean; fileUrls: string[] },
  providerMeta?: { name: string; initials: string; color: string; id: string },
  tangaSpent?: number,
): Promise<ProviderOffer> {
  return submitOfferStore({
    requestId: data.requestId,
    price: data.price,
    priceLabel: data.priceLabel,
    message: data.message,
    fileUrls: data.fileUrls,
    costTanga: tangaSpent ?? 0,
    masterName: providerMeta?.name,
    masterInitials: providerMeta?.initials,
    masterColor: providerMeta?.color,
  });
}

/* ─── Avg Response Time (local display preference) ──────────────────── */

export function getAvgResponseMinutes(): number {
  const raw = localStorage.getItem(AVG_RESPONSE_KEY);
  return raw ? parseInt(raw, 10) : 14;
}
export function setAvgResponseMinutes(mins: number): void {
  localStorage.setItem(AVG_RESPONSE_KEY, String(mins));
}

/* ─── Offer count helpers ─────────────────────────────────────────── */

export async function getRequestOfferCount(requestId: string): Promise<number> {
  const { count } = await api.fetchRequestOfferCount(requestId);
  return count;
}

export async function getRequestsWithZeroOffers(
  selectedCategories: string[] = [], serviceAreas: string[] = [], providerId: string = "", serviceAreaV2?: ProviderServiceArea,
): Promise<ProviderRequest[]> {
  return (await getMatchingRequests(selectedCategories, serviceAreas, providerId, serviceAreaV2))
    .filter((r) => r.status === "open" && (r.offerCount ?? 0) === 0);
}

/* ─── Chat creation is now handled server-side as part of offer submission
 * (POST /api/offers) — no separate createChatFromOffer step needed. ────── */
