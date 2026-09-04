/**
 * requests-client.ts
 * Thin async wrapper around the real backend for requests/offers/chats
 * (/api/requests, /api/offers, /api/chats). Used by requests-store.ts and
 * provider-store.ts, which own the shape adaptation for existing UI callers.
 */
import { apiFetch, ApiError } from "@/lib/api-client";
import { adminFetch } from "@/lib/admin-client";

export { ApiError };

/* ─── Requests ───────────────────────────────────────────────────── */

export interface BackendRequest {
  id: string;
  customerId?: string;
  customerName?: string;
  categoryId: string;
  categoryName: string;
  emoji: string;
  answers: Record<string, unknown>;
  requestPhotos?: string[];
  status: "open" | "accepted" | "matched" | "completed" | "cancelled" | "inactive";
  region?: string;
  district?: string;
  acceptedOfferId?: string;
  closedForOffers: boolean;
  createdAt: string;
  /** Present on /mine and /open (list endpoints); absent on the single-item GET. */
  offerCount?: number;
}

export interface CooldownState {
  blocked: boolean;
  remainingMs: number;
  until: number | null;
  durationMs: number;
  recentCount: number;
  extended: boolean;
}

export function fetchMyRequests() {
  return apiFetch<{ requests: BackendRequest[] }>("/requests/mine");
}
export function fetchOpenRequests() {
  return apiFetch<{ requests: BackendRequest[] }>("/requests/open");
}
export function fetchRequestById(id: string) {
  return apiFetch<{ request: BackendRequest }>(`/requests/${id}`, { auth: false });
}
export function fetchRequestOfferCount(id: string) {
  return apiFetch<{ count: number }>(`/requests/${id}/offer-count`, { auth: false });
}
export function fetchRequestPopularity() {
  return apiFetch<{ categories: { categoryId: string; requestCount: number; offerCount: number; completedCount: number }[] }>("/requests/popularity", { auth: false });
}
export function fetchRequestCooldown() {
  return apiFetch<CooldownState>("/requests/cooldown");
}
export function createRequest(body: {
  categoryId: string; categoryName: string; emoji?: string;
  answers: Record<string, unknown>; requestPhotos?: string[];
  customerName?: string; region?: string; district?: string;
}) {
  return apiFetch<{ request: BackendRequest }>("/requests", { method: "POST", body });
}
export function updateRequestStatus(id: string, status: BackendRequest["status"]) {
  return apiFetch<{ request: BackendRequest }>(`/requests/${id}/status`, { method: "PATCH", body: { status } });
}
export function deleteRequest(id: string) {
  return apiFetch<{ ok: boolean; reason?: string }>(`/requests/${id}`, { method: "DELETE" });
}
export function adminDeleteRequest(id: string) {
  return adminFetch<{ ok: boolean }>(`/requests/admin/${id}`, { method: "DELETE" });
}
export function adminFetchAllRequests() {
  return adminFetch<{ requests: BackendRequest[] }>("/requests/admin/all");
}
export function adminSetRequestStatus(id: string, status: BackendRequest["status"]) {
  return adminFetch<{ request: BackendRequest }>(`/requests/admin/${id}/status`, { method: "PATCH", body: { status } });
}

/* ─── Offers ─────────────────────────────────────────────────────── */

export interface BackendOffer {
  id: string;
  requestId: string;
  masterId: string;
  masterName: string;
  masterInitials: string;
  masterColor: string;
  masterPhotoUrl?: string;
  price: number;
  priceLabel?: string;
  message: string;
  fileUrls?: string[];
  avgResponseTime: number;
  status: "pending" | "negotiating" | "accepted" | "rejected" | "cancelled" | "expired" | "in_progress" | "completed" | "Yopilgan";
  tangaSpent?: number;
  refunded: boolean;
  providerConfirmedCompleted: boolean;
  customerConfirmedCompleted: boolean;
  completionAfterPhotos?: string[];
  completionNotes?: string;
  completionDurationMinutes?: number;
  completedAt?: string;
  portfolioTitle?: string;
  portfolioDescription?: string;
  portfolioCoverPhoto?: string;
  portfolioAdditionalPhotos?: string[];
  portfolioFeatured?: boolean;
  createdAt: string;
}

export function fetchMyOffers() {
  return apiFetch<{ offers: BackendOffer[] }>("/offers/mine");
}
export function fetchOffersForMyRequests() {
  return apiFetch<{ offers: BackendOffer[] }>("/offers/for-my-requests");
}
export function adminFetchAllOffers() {
  return adminFetch<{ offers: BackendOffer[] }>("/offers/admin/all");
}
export function adminDeleteOffer(id: string) {
  return adminFetch<{ ok: boolean }>(`/offers/admin/${id}`, { method: "DELETE" });
}
export function fetchOffersByRequest(requestId: string) {
  return apiFetch<{ offers: BackendOffer[] }>(`/offers/by-request/${requestId}`);
}
export function fetchOfferById(id: string) {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${id}`, { auth: false });
}
export function submitOffer(body: {
  requestId: string; price: number; priceLabel?: string; message: string;
  fileUrls?: string[]; costTanga: number;
  masterName?: string; masterInitials?: string; masterColor?: string;
}) {
  return apiFetch<{ offer: BackendOffer }>("/offers", { method: "POST", body });
}
export function setOfferStatus(id: string, status: "accepted" | "rejected") {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${id}/status`, { method: "PATCH", body: { status } });
}
export function reopenOffer(id: string) {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${id}/reopen`, { method: "PATCH" });
}
export function markOfferInProgress(id: string) {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${id}/in-progress`, { method: "PATCH" });
}
export function confirmOfferCompletion(
  id: string,
  role: "provider" | "customer",
  completion?: { afterPhotos?: string[]; completionNotes?: string; durationMinutes?: number },
) {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${id}/confirm-completion`, { method: "PATCH", body: { role, completion } });
}
export function adminForceCompleteOffer(id: string) {
  return adminFetch<{ offer: BackendOffer }>(`/offers/admin/${id}/force-complete`, { method: "POST" });
}
export function adminSetOfferStatus(id: string, status: BackendOffer["status"]) {
  return adminFetch<{ offer: BackendOffer }>(`/offers/admin/${id}/status`, { method: "PATCH", body: { status } });
}
export function adminRefundEligibility(providerId: string) {
  return adminFetch<{ eligible: boolean; refundAmount: number; offers: BackendOffer[] }>(`/offers/admin/refund-eligibility/${providerId}`);
}
export function adminRefundProvider(providerId: string) {
  return adminFetch<{ ok: boolean; refundAmount: number }>(`/offers/admin/refund/${providerId}`, { method: "POST" });
}

/* ─── Service history / portfolio (derived from completed offers) ──────── */

export interface BackendPortfolioProject {
  title: string;
  description: string;
  coverPhoto: string;
  additionalPhotos: string[];
  featured: boolean;
  createdAt: string;
}

export interface BackendServiceHistory {
  id: string;
  providerId: string;
  customerId?: string;
  customerName?: string;
  requestId: string;
  offerId: string;
  categoryId: string;
  categoryName: string;
  emoji?: string;
  serviceTitle: string;
  serviceDescription: string;
  completionNotes?: string;
  finalPrice: number;
  status: "completed";
  rating?: number;
  review?: string;
  completedAt: string;
  durationMinutes?: number;
  beforePhotos?: string[];
  afterPhotos?: string[];
  region?: string;
  district?: string;
  isRepeatCustomer: boolean;
  isPortfolio: boolean;
  portfolioData?: BackendPortfolioProject;
}

export interface BackendHistoryStats {
  totalCompleted: number;
  totalEarnings: number;
  thisMonthEarnings: number;
  averageRating: number;
  successRate: number;
  mostPopularCategoryId?: string;
  mostPopularCategoryName?: string;
  repeatCustomers: number;
}

export interface BackendPublicPortfolioProject {
  id: string;
  title: string;
  description: string;
  coverPhoto?: string;
  photos: string[];
  categoryId: string;
  categoryName: string;
  emoji?: string;
  completedAt: string;
  durationMinutes?: number;
  rating?: number;
  review?: string;
  featured: boolean;
}

export function fetchProviderHistory(providerId: string) {
  return apiFetch<{ history: BackendServiceHistory[]; stats: BackendHistoryStats }>(`/offers/history/${providerId}`);
}
export function fetchPublicPortfolio(providerId: string) {
  return apiFetch<{ portfolio: BackendPublicPortfolioProject[] }>(`/offers/portfolio/${providerId}`, { auth: false });
}
export function setOfferAfterPhotos(offerId: string, afterPhotos: string[]) {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${offerId}/after-photos`, { method: "PATCH", body: { afterPhotos } });
}
export function saveOfferPortfolio(offerId: string, project: {
  title: string; description: string; coverPhoto: string; additionalPhotos: string[]; featured: boolean;
}) {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${offerId}/portfolio`, { method: "PATCH", body: project });
}
export function removeOfferPortfolio(offerId: string) {
  return apiFetch<{ offer: BackendOffer }>(`/offers/${offerId}/portfolio`, { method: "DELETE" });
}

/* ─── Chats ──────────────────────────────────────────────────────── */

export interface BackendChat {
  id: string;
  requestId: string;
  masterId: string;
  providerUnread: number;
  customerUnread: number;
  customerClearedAt?: string;
  providerClearedAt?: string;
  createdAt: string;
}
export interface BackendChatMessage {
  id: string;
  chatId: string;
  sender: "customer" | "master" | "system";
  text?: string;
  attachment?: { type: "image" | "file"; url: string };
  deliveredAt?: string;
  readAt?: string;
  deletedForEveryone: boolean;
  deletedAt?: string;
  deletedForUsers: string[];
  createdAt: string;
}

export function fetchMyChats() {
  return apiFetch<{ chats: BackendChat[] }>("/chats/mine");
}
export function fetchChatByPair(requestId: string, masterId: string) {
  return apiFetch<{ chat: BackendChat; messages: BackendChatMessage[] }>(`/chats/by-pair/${requestId}/${masterId}`);
}
export function sendChatMessage(chatId: string, text?: string, attachment?: { type: "image" | "file"; url: string }) {
  return apiFetch<{ message: BackendChatMessage }>(`/chats/${chatId}/messages`, { method: "POST", body: { text, attachment } });
}
export function markChatRead(chatId: string) {
  return apiFetch<{ ok: boolean }>(`/chats/${chatId}/read`, { method: "PATCH" });
}
export function clearChat(chatId: string) {
  return apiFetch<{ ok: boolean }>(`/chats/${chatId}/clear`, { method: "PATCH" });
}
export function deleteChatMessage(messageId: string, mode: "everyone" | "me") {
  return apiFetch<{ ok: boolean }>(`/chats/messages/${messageId}?mode=${mode}`, { method: "DELETE" });
}
export function adminFetchAllChats() {
  return adminFetch<{ chats: (BackendChat & { messages: BackendChatMessage[] })[] }>("/chats/admin/all");
}
