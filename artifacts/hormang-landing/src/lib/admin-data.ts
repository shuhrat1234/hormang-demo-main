/**
 * Typed wrappers around the real backend admin endpoints (pricing tiers,
 * wallets, users) — Phase B of the "move admin off localStorage" migration.
 * Every call goes through adminFetch() so it's authenticated + shared across
 * every admin/browser, unlike the localStorage-only stores it replaces.
 */
import { adminFetch } from "./admin-client";

/* ─── Pricing tiers ──────────────────────────────────────────────── */
export interface BackendPricingTier {
  id: string; key: string; nameUz: string; nameRu: string;
  nameEn?: string | null;
  descUz: string | null; descRu: string | null;
  descEn?: string | null;
  credits: number; bonusTokens: number; priceSom: number;
  salePrice: number | null; saleLimit: number | null; salePurchaseCount: number;
  perUserLimit: number | null;
  startsAt: string | null; validUntil: string | null;
  status: string; visibilityTarget: string | null;
  featured: boolean; hotOffer: boolean; bonusPlan: boolean;
  badgeUz: string | null; badgeRu: string | null;
  badgeEn?: string | null;
  color: string | null; active: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
}

export interface PricingTierInput {
  key?: string; name: string; nameRu?: string; nameEn?: string;
  desc?: string; descRu?: string; descEn?: string;
  badge?: string; badgeRu?: string; badgeEn?: string;
  credits: number; bonusTokens?: number; priceSom: number;
  salePrice?: number | null; saleLimit?: number | null; perUserLimit?: number | null;
  startsAt?: string | null; validUntil?: string | null;
  status?: string; visibilityTarget?: string | null;
  featured?: boolean; hotOffer?: boolean; bonusPlan?: boolean;
  color?: string | null; active?: boolean; sortOrder?: number;
}

export function fetchPricingTiers() {
  return adminFetch<{ tiers: BackendPricingTier[] }>("/admin/pricing-tiers");
}
export function createPricingTier(body: PricingTierInput) {
  return adminFetch<{ tier: BackendPricingTier }>("/admin/pricing-tiers", { method: "POST", body });
}
export function updatePricingTier(id: string, body: PricingTierInput) {
  return adminFetch<{ tier: BackendPricingTier }>(`/admin/pricing-tiers/${id}`, { method: "PUT", body });
}
export function setPricingTierActive(id: string, active: boolean) {
  return adminFetch<{ tier: BackendPricingTier }>(`/admin/pricing-tiers/${id}/active`, { method: "PATCH", body: { active } });
}
export function deletePricingTier(id: string) {
  return adminFetch<{ ok: boolean }>(`/admin/pricing-tiers/${id}`, { method: "DELETE" });
}
export function reorderPricingTiers(items: { id: string; sortOrder: number }[]) {
  return adminFetch<{ ok: boolean }>("/admin/pricing-tiers/reorder", { method: "PUT", body: { items } });
}

/* ─── Wallets ────────────────────────────────────────────────────── */
export interface BackendWallet {
  userId: string; firstName: string; lastName: string; phone: string | null;
  role: "buyer" | "provider"; balance: number;
  totalPurchased: number; totalSpent: number; txCount: number;
}
export function fetchAdminWallets() {
  return adminFetch<{ wallets: BackendWallet[] }>("/admin/wallets");
}

export interface BackendTangaTx {
  id: string; userId: string; orderId: string | null;
  type: "purchase" | "spend" | "referral" | "refund" | "admin_adjustment" | "profile_completion_reward";
  direction: "in" | "out"; amount: number; priceSom: number | null;
  description: string | null; createdAt: string;
  firstName?: string | null; lastName?: string | null; phone?: string | null;
  tierName?: string | null;
}
export function fetchAllWalletTransactions() {
  return adminFetch<{ transactions: BackendTangaTx[] }>("/admin/wallets/transactions");
}
export function fetchWalletTransactions(userId: string) {
  return adminFetch<{ transactions: BackendTangaTx[] }>(`/admin/wallets/${userId}/transactions`);
}
export interface BackendReferral {
  id: string; referrerId: string; inviteeId: string; rewarded: boolean; createdAt: string;
}
export function fetchAdminReferrals() {
  return adminFetch<{ referrals: BackendReferral[] }>("/admin/wallets/referrals");
}
export function adjustWalletBalance(userId: string, amount: number, direction: "in" | "out", reason?: string) {
  return adminFetch<{ ok: boolean; balance: number }>(`/admin/wallets/${userId}/adjust`, {
    method: "POST",
    body: { amount, direction, reason },
  });
}

/* ─── Users / moderation ─────────────────────────────────────────── */
export interface BackendAdminNote { text: string; at: string; }
export interface BackendAdminUser {
  id: string; firstName: string; lastName: string; phone: string | null; email: string | null;
  role: "buyer" | "provider"; createdAt: string; lastLoginAt: string | null;
  balance: number; suspended: boolean; verified: boolean; flagCount: number;
  tags: string[]; adminNotes: BackendAdminNote[];
}
export interface BackendUserModeration {
  userId: string; suspended: boolean; verified: boolean; flagCount: number;
  tags: string[]; adminNotes: BackendAdminNote[]; updatedAt: string;
}
export function fetchAdminUsers() {
  return adminFetch<{ users: BackendAdminUser[] }>("/admin/users");
}
export function setUserSuspended(id: string, suspended: boolean) {
  return adminFetch<{ moderation: BackendUserModeration }>(`/admin/users/${id}/suspend`, { method: "POST", body: { suspended } });
}
export function setUserVerified(id: string, verified: boolean) {
  return adminFetch<{ moderation: BackendUserModeration }>(`/admin/users/${id}/verify`, { method: "POST", body: { verified } });
}
export function setUserFlagCountBackend(id: string, flagCount: number) {
  return adminFetch<{ moderation: BackendUserModeration }>(`/admin/users/${id}/flag`, { method: "POST", body: { flagCount } });
}
export function setUserTagsBackend(id: string, tags: string[]) {
  return adminFetch<{ moderation: BackendUserModeration }>(`/admin/users/${id}/tags`, { method: "PUT", body: { tags } });
}
export function addUserNoteBackend(id: string, text: string) {
  return adminFetch<{ moderation: BackendUserModeration }>(`/admin/users/${id}/notes`, { method: "POST", body: { text } });
}
export function removeUserNoteBackend(id: string, index: number) {
  return adminFetch<{ moderation: BackendUserModeration }>(`/admin/users/${id}/notes/${index}`, { method: "DELETE" });
}
export function deleteUserBackend(id: string) {
  return adminFetch<{ ok: boolean }>(`/admin/users/${id}`, { method: "DELETE" });
}
