/**
 * referral-store.ts
 * Per-user referral system.
 */
import { apiFetch } from "./api-client";

export const TANGA_PER_REFERRAL = 3;
export const MAX_REFERRALS = 5;
export const MAX_REFERRAL_TANGA = TANGA_PER_REFERRAL * MAX_REFERRALS; // 15

export interface ReferralInvitee {
  userId: string;
  completedAt: string;
}

export interface ReferralStats {
  count: number;
  earned: number;
  invitees: ReferralInvitee[];
}

const ACTIVE_REF_KEY = "hormang_active_ref_code";

/* ─── Code helpers (deterministic, no storage needed) ──────────────── */

export function getReferralCode(userId: string): string {
  return `HORMANG-${userId.slice(0, 6).toUpperCase()}`;
}

export function getReferralLink(userId: string): string {
  const code = getReferralCode(userId);
  return `${window.location.origin}/auth/register?ref=${code}`;
}

/** Captures ?ref= from the current URL and persists in localStorage so navigation doesn't lose it. */
export function captureReferralFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref");
    if (code && code.trim().length >= 4) {
      const clean = code.trim().toUpperCase();
      localStorage.setItem(ACTIVE_REF_KEY, clean);
      return clean;
    }
  } catch {
    // noop
  }
  return null;
}

/** Gets the active referral code from either the URL or localStorage. */
export function getActiveReferralCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("ref");
    if (urlCode && urlCode.trim().length >= 4) {
      const clean = urlCode.trim().toUpperCase();
      localStorage.setItem(ACTIVE_REF_KEY, clean);
      return clean;
    }
    return localStorage.getItem(ACTIVE_REF_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearActiveReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_REF_KEY);
  } catch {
    // noop
  }
}

/* ─── Real stats (the current authenticated user's own) ─────────────── */

export async function getReferralStats(): Promise<ReferralStats> {
  try {
    return await apiFetch<ReferralStats>("/wallet/referral-stats");
  } catch {
    return { count: 0, earned: 0, invitees: [] };
  }
}

/* ─── Pending-code bookkeeping (local, single registration flow) ────── */

function pendingKey(userId: string): string {
  return `hormang_ref_pending_${userId}`;
}

/** Called immediately after a new user registers via a referral link. */
export function recordReferralSignup(refCode: string, newUserId: string): void {
  if (!refCode || !newUserId) return;
  try {
    localStorage.setItem(pendingKey(newUserId), refCode.toUpperCase());
    localStorage.setItem(ACTIVE_REF_KEY, refCode.toUpperCase());
  } catch {
    // noop
  }
}

/**
 * Submits the referral code to the real backend, which credits the referrer's
 * wallet (capped at MAX_REFERRALS) — safe to call more than once (idempotent).
 */
export async function processReferralReward(newUserId?: string, explicitCode?: string): Promise<boolean> {
  const code = explicitCode || (newUserId ? localStorage.getItem(pendingKey(newUserId)) : null) || getActiveReferralCode();
  if (!code) return false;

  try {
    const res = await apiFetch<{ granted: boolean; alreadyGranted?: boolean; capped?: boolean; balance?: number }>(
      "/wallet/referral-reward",
      { method: "POST", body: { referrerCode: code } },
    );
    if (res.granted || res.alreadyGranted || res.capped) {
      if (newUserId) {
        try { localStorage.removeItem(pendingKey(newUserId)); } catch {}
      }
      clearActiveReferralCode();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
