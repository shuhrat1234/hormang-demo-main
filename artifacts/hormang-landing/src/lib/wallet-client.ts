import { apiFetch } from "./api-client";

export interface WalletTier {
  id: string;
  key: string;
  nameUz: string;
  nameRu: string;
  nameEn?: string | null;
  descUz: string | null;
  descRu: string | null;
  descEn?: string | null;
  credits: number;
  bonusTokens: number;
  priceSom: number;
  salePrice: number | null;
  saleLimit: number | null;
  salePurchaseCount: number;
  perUserLimit: number | null;
  /** This user's paid-purchase count for this tier — only present when perUserLimit is set. */
  userPurchaseCount?: number;
  startsAt: string | null;
  validUntil: string | null;
  status: string;
  featured: boolean;
  hotOffer: boolean;
  bonusPlan: boolean;
  badgeUz: string | null;
  badgeRu: string | null;
  badgeEn?: string | null;
  color: string | null;
  active: boolean;
  sortOrder: number;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  orderId: string | null;
  type: "purchase" | "spend" | "referral" | "refund" | "admin_adjustment" | "profile_completion_reward";
  direction: "in" | "out";
  amount: number;
  priceSom: number | null;
  description: string | null;
  offerId: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface WalletOrder {
  id: string;
  userId: string;
  tierId: string;
  provider: "payme" | "click";
  amountSom: number;
  status: "pending" | "paid" | "cancelled" | "failed";
  providerTransactionId: string | null;
  performedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getWallet(): Promise<{ balance: number; tiers: WalletTier[] }> {
  return apiFetch("/wallet");
}

export function getWalletTransactions(): Promise<{ transactions: WalletTransaction[] }> {
  return apiFetch("/wallet/transactions");
}

export function createWalletOrder(
  tierId: string,
  provider: "payme" | "click" = "payme"
): Promise<{ orderId: string; checkoutUrl: string }> {
  return apiFetch("/wallet/orders", { method: "POST", body: { tierId, provider } });
}

export function getWalletOrder(orderId: string): Promise<{ order: WalletOrder; tier: WalletTier }> {
  return apiFetch(`/wallet/orders/${orderId}`);
}

