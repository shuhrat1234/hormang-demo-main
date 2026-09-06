/**
 * /admin — Hormang Admin Dashboard
 * Credentials: hormangVIP / ourhormang123
 * Color theme: RED
 *
 * Data keys (match main app exactly):
 *   hormang_requests        — CustomerRequest[]
 *   hormang_offers          — Offer[]  (buyer side)
 *   hormang_provider_offers — ProviderOffer[] (provider side)
 *   hormang_provider_chats  — ProviderChat[]
 *   hormang_local_profile_* — ProviderProfile (one per user)
 *   hormang_pricing_tiers   — PricingTier[]
 *   hormang_admin_log       — AdminLogEntry[]
 *
 * Real-time sync: listens to "hormang:store-change" (same bus as main app)
 * plus window "storage" for cross-tab updates.
 */
import { useState, useEffect, useCallback, Fragment, useMemo } from "react";
import { QuestionsEmbedded } from "./questions";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer, XAxis, YAxis, Legend,
} from "recharts";
import {
  LayoutDashboard, Users, ClipboardList, MessageSquare, CreditCard,
  FileText, Settings, LogOut, ChevronRight, Eye, EyeOff,
  TrendingUp, AlertCircle, Check, X, Search, RefreshCw,
  Shield, Trash2, Ban, CheckCircle2, Inbox, DollarSign,
  Bell, Menu, ChevronLeft, Plus, MapPin, Clock, Wallet,
  Store, LayoutGrid, TriangleAlert, ChevronDown, ChevronUp,
  Flag, Tag, Star, UserCheck, Zap, Activity, StickyNote, Download, Gift,
  BadgeCheck, Edit3, Save, Loader2, Languages,
} from "lucide-react";
import {
  getAllCategories as getAllCategoriesFromStore,
  setCategoryActive as setAdminCategoryActive,
  upsertCategory as upsertAdminCategory,
  deleteCategory as deleteAdminCategory,
} from "@/lib/categories";
import { markAdminAuthenticated, AdminApiError, adminFetch, translateTexts } from "@/lib/admin-client";
import {
  fetchPricingTiers, createPricingTier, updatePricingTier, setPricingTierActive, deletePricingTier,
  fetchAdminWallets, fetchAllWalletTransactions, fetchWalletTransactions, adjustWalletBalance as adjustWalletBalanceBackend,
  fetchAdminUsers, setUserSuspended as setUserSuspendedBackend, setUserVerified as setUserVerifiedBackend,
  setUserFlagCountBackend, setUserTagsBackend, addUserNoteBackend, removeUserNoteBackend, deleteUserBackend,
  fetchAdminReferrals,
  type BackendPricingTier, type BackendWallet, type BackendTangaTx, type BackendAdminUser,
  type BackendUserModeration, type PricingTierInput, type BackendReferral,
} from "@/lib/admin-data";
import { CategoryIcon } from "@/components/category-icon";
import {
  CATEGORY_ICONS,
  suggestIconFromEmoji,
} from "@/lib/categories/icon-registry";
import {
  GRADIENT_PRESETS,
  CATEGORY_COLOR_PRESETS,
} from "@/lib/categories/gradient-presets";
import { getCategorySpecificQuestionCount } from "@/lib/questionnaire-store";
import { Button } from "@/components/ui/button";
import { TangaCoin } from "@/components/tanga-coin";
import { onStoreChange, emitStoreChange } from "@/lib/store-events";
import { ProviderBadges, AdminBadgeManager } from "@/components/provider-badges";
import { getStoredBadges } from "@/lib/badge-store";
import { formatDateTime, formatMonthYear, formatDate } from "@/lib/date-utils";
import { getAllQuestionsForCategory, collectActiveQuestions } from "@/lib/questionnaire-store";
import { ImageGrid, getAnswerImageUrls } from "@/components/image-grid";
import { OfferDetailModal } from "@/components/offer-detail-modal";
import {
  getAllTangaTransactions,
  type TangaTransaction as TangaTx,
} from "@/lib/tanga-history-store";
import { getTangaBalance } from "@/lib/tanga-store";
import { getReferralCode, TANGA_PER_REFERRAL } from "@/lib/referral-store";
import { getAllOffersAdmin, getAllRequestsAdmin, getAllChatsAdmin, getPhoneRegistry, getOffersByRequestId, markOfferCompleted, type Offer as BuyerOfferFull, type CustomerRequest as StoreCustomerRequest, type Chat as StoreChat, updateOfferStatus, deleteRequestCascade, adminSetRequestStatus, adminDeleteOffer, deleteUserDataCascade, getLast10RejectedEligibility, adminRefundProvider, getRecentRequestCount, getRequestById, REQUEST_DAILY_FLAG_THRESHOLD } from "@/lib/requests-store";
import { getAvgResponseMinutes, formatAvgResponseTime } from "@/lib/response-time-store";
import {
  getAllAnnouncements, saveAnnouncement, deleteAnnouncement,
  toggleAnnouncementPublished, toggleAnnouncementPinned,
  type Announcement,
} from "@/lib/announcements-store";
import ReactMarkdown from "react-markdown";
import { FeedbackAdminSection } from "./feedback-panel";
import { getAllFeedbacks, type Feedback as FeedbackEntry } from "@/lib/feedback-store";
import type { LocalizedText } from "@/lib/localization";
import { getLocalizedText } from "@/lib/localization";
import {
  getAllReports, updateReportStatus,
  type UserReport, type ReportStatus as RptStatus,
} from "@/lib/report-store";

/* ─── Credentials ───────────────────────────────────────────────── */
const ADMIN_USER = "hormangVIP";
const ADMIN_PASS = "ourhormang123";
const SESSION_KEY = "hormang_admin_session_v1";

/* ─── Storage keys (mirrors main app exactly) ────────────────────── */
const K = {
  REQUESTS:        "hormang_requests",
  OFFERS_BUYER:    "hormang_offers",
  OFFERS_PROVIDER: "hormang_provider_offers",
  CHATS_PROVIDER:  "hormang_provider_chats",
  CHATS_BUYER:     "hormang_chats",
  PRICING_TIERS:   "hormang_pricing_tiers",
  ADMIN_LOG:       "hormang_admin_log",
  /** LocalProfile key shape (lib/local-profile.ts): `user_<userId>_localProfile` */
  PROFILE_PREFIX:  "user_",
  PROFILE_SUFFIX:  "_localProfile",
} as const;

/* ─── Platform reset ─────────────────────────────────────────────── */
const RESET_KEYS = [
  "hormang_requests",
  "hormang_offers",
  "hormang_provider_offers",
  "hormang_provider_chats",
  "hormang_chats",
  "hormang_provider_requests",
  "hormang_provider_seen",
  "hormang_provider_statuses",
  "hormang_provider_avg_response",
  "hormang_provider_seed_version",
  "hormang_customer_registry",
];
const RESET_INIT_EMPTY = [
  "hormang_requests","hormang_offers","hormang_provider_offers",
  "hormang_provider_chats","hormang_chats",
];

function resetPlatformData(): boolean {
  if (!confirm("⚠️ Barcha so'rovlar, takliflar, chatlar va foydalanuvchi ro'yxati o'chiriladi.\nFaqat joriy admin sessiyasi saqlanib qoladi.\n\nDavom etasizmi?")) return false;
  RESET_KEYS.forEach((key) => localStorage.removeItem(key));
  RESET_INIT_EMPTY.forEach((key) => localStorage.setItem(key, "[]"));
  logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "PLATFORM_RESET", category: "admin", targetId: "all", targetType: "platform", description: "Barcha platform ma'lumotlari tozalandi" });
  emitStoreChange();
  return true;
}

/* ─── 9 canonical categories ─────────────────────────────────────── */
const CATEGORIES = [
  "Tozalash", "Ta'mirlash", "Enagalik", "Tadbir xizmatlari",
  "Ko'chirish / yuk yetkazish", "Go'zallik", "Avto xizmat",
  "Repetitorlar", "Ustachilik",
];

/* ─── Types ─────────────────────────────────────────────────────── */
type Section = "overview" | "marketplace" | "requests" | "offers" | "users" | "monetization" | "audit" | "categories" | "announcements" | "feedback" | "reports";

type AuditLogCategory   = "admin" | "marketplace" | "financial" | "referral" | "risk";
type AuditLogActorRole  = "admin" | "provider" | "customer" | "system";
type AuditLogTargetType = "user" | "request" | "offer" | "referral" | "tanga" | "platform" | "pricing";
interface AuditLog {
  id: string;
  actorId: string;
  actorRole: AuditLogActorRole;
  action: string;
  category: AuditLogCategory;
  targetId?: string;
  targetType?: AuditLogTargetType;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
type CustomerRequest = StoreCustomerRequest;
type BuyerOffer = BuyerOfferFull;
interface PricingTier {
  id: string; name: string; credits: number; price: number;
  salePrice?: number; saleLimit?: number; salePurchaseCount?: number;
  perUserLimit?: number;
  bonusTokens?: number;
  startsAt?: string; validUntil?: string;
  status?: "draft" | "active" | "scheduled" | "expired" | "archived";
  visibilityTarget?: "all" | "new" | "active" | "referral";
  featured?: boolean; hotOffer?: boolean; bonusPlan?: boolean; badge?: string;
  badgeLocalized?: LocalizedText;
  desc: string; color: string; active: boolean;
  nameLocalized?: LocalizedText;
  descLocalized?: LocalizedText;
}
interface LocalProfile {
  userId: string; name: string; bio?: string; phone?: string;
  categories?: string[]; rating?: number; reviewCount?: number;
  verified?: boolean; createdAt?: string;
}

/* ─── Storage helpers ───────────────────────────────────────────── */
function readKey<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fallback; }
  catch { return fallback; }
}
function writeKey<T>(key: string, val: T) { localStorage.setItem(key, JSON.stringify(val)); }

/* ─── Answer-field extractors (mirrors provider-store.ts) ─────────── */
function urgencyFrom(answers: Record<string, unknown>): string {
  const u = String(answers["urgency"] ?? "");
  if (u === "urgent" || u === "today" || u === "1_2_days") return "Shoshilinch";
  if (u === "3_7_days" || u === "1_2_weeks") return "Normal";
  if (u) return "Moslashuvchan";
  return "—";
}
function budgetLabel(answers: Record<string, unknown>): string {
  const b = answers["budget"] as number | undefined;
  const open = answers["budget_open"] as boolean | undefined;
  if (b && b > 0) return `${b.toLocaleString()} so'm`;
  if (open) return "Murosalashtirish";
  return "Kelishiladi";
}
function locationFrom(answers: Record<string, unknown>): string {
  for (const k of ["district", "location", "address", "region", "move_from", "turar_joy"]) {
    const v = answers[k];
    if (v && typeof v === "string" && v.trim()) return v.trim();
  }
  return "Toshkent";
}

/* ─── Audit log — fire-and-forget write to the real backend, shared across
   every admin/browser instead of being trapped in one admin's localStorage.
   A failed write never blocks the action that triggered it. ─────────── */
function logAction(params: Omit<AuditLog, "id" | "createdAt">) {
  adminFetch("/admin/audit-log", { method: "POST", body: params }).catch((err) => {
    console.error("Audit log write failed:", err);
  });
}

/* ─── User Metadata Helpers (flags / tags / notes / verified) ──── */
const UMK = {
  FLAGS:    "hormang_admin_user_flags",
  TAGS:     "hormang_admin_user_tags",
  NOTES:    "hormang_admin_user_notes",
  VERIFIED: "hormang_admin_user_verified",
} as const;

type AdminNote = { text: string; at: string };

function getUserFlags():    Record<string, number>    { return readKey(UMK.FLAGS,    {}); }
function getUserTags():     Record<string, string[]>  { return readKey(UMK.TAGS,     {}); }
function getUserNotes():    Record<string, AdminNote[]> { return readKey(UMK.NOTES, {}); }
function getUserVerified(): Record<string, boolean>   { return readKey(UMK.VERIFIED, {}); }

function setUserFlagCount(userId: string, count: number) {
  const m = getUserFlags(); m[userId] = count; writeKey(UMK.FLAGS, m); emitStoreChange();
}
function setUserTagsList(userId: string, tags: string[]) {
  const m = getUserTags(); m[userId] = tags; writeKey(UMK.TAGS, m); emitStoreChange();
}
function addAdminNote(userId: string, note: string) {
  const m = getUserNotes();
  m[userId] = [{ text: note, at: new Date().toISOString() }, ...(m[userId] ?? [])];
  writeKey(UMK.NOTES, m); emitStoreChange();
}
function removeAdminNote(userId: string, idx: number) {
  const m = getUserNotes();
  m[userId] = (m[userId] ?? []).filter((_: AdminNote, i: number) => i !== idx);
  writeKey(UMK.NOTES, m); emitStoreChange();
}
function setUserVerifiedStatus(userId: string, val: boolean) {
  const m = getUserVerified(); m[userId] = val; writeKey(UMK.VERIFIED, m); emitStoreChange();
}

/* ─── Session ───────────────────────────────────────────────────── */
function getSession() { return sessionStorage.getItem(SESSION_KEY) === "1"; }
function setSession() { sessionStorage.setItem(SESSION_KEY, "1"); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

/* ─── Formatting ─────────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return formatDateTime(iso);
}
function fmtMoney(n: number) { return `${n.toLocaleString()} so'm`; }
function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (d < 60)   return `${d} daqiqa oldin`;
  if (d < 1440) return `${Math.floor(d / 60)} soat oldin`;
  return `${Math.floor(d / 1440)} kun oldin`;
}

/* ─── Tanga tx direction helpers ─────────────────────────────────── */
/**
 * Returns the *signed* effect on a user's balance:
 *   spend / admin-deduct  → negative
 *   purchase / referral / admin-add → positive
 * Admin adjustments store `amount` as a positive number regardless of direction;
 * we detect direction from the description text ("ayirdi" = deducted).
 */
function txSignedAmount(tx: TangaTx): number {
  // Explicit direction wins (new data).
  if (tx.direction === "out") return -Math.abs(tx.amount);
  if (tx.direction === "in")  return  Math.abs(tx.amount);
  // Legacy / heuristic fallback.
  if (tx.type === "spend" || (!tx.type && tx.amount > 0)) return -Math.abs(tx.amount);
  if (tx.type === "admin_adjustment") {
    const desc = tx.description ?? "";
    // "ayirdi" / "−" / "-" → deducted; otherwise treat as added.
    if (/ayirdi|deduct|−|-/i.test(desc)) return -Math.abs(tx.amount);
    return Math.abs(tx.amount);
  }
  // purchase, referral → in
  return Math.abs(tx.amount);
}
/** True only for offer-cost spending (excludes admin deducts, purchases, etc). */
function txIsOfferSpend(tx: TangaTx): boolean {
  return tx.type === "spend" || (!tx.type && tx.amount > 0);
}

/* ─── Request Q&A helpers (mirrors RequestPreviewModal) ─────────── */
const MKT_SKIP_KEYS = new Set(["budget_open", "urgency", "budget", "region", "district"]);

function mktFormatAnswer(
  value: unknown,
  options?: { label: string; value: string; type?: string }[],
  otherText?: string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && value.startsWith("data:")) return "__IMAGE__";
  if (typeof value === "boolean") return value ? "Ha" : "Yo'q";
  if (typeof value === "number")
    return value.toLocaleString("uz-Latn-UZ") + (String(value).length > 3 ? " so'm" : "");
  const otherOpt = options?.find((o) => o.type === "other");
  if (typeof value === "string") {
    if (otherOpt && value === otherOpt.value && otherText) return otherText;
    return options?.find((o) => o.value === value)?.label ?? value;
  }
  if (Array.isArray(value)) {
    return (value as string[])
      .map((v) => {
        if (otherOpt && v === otherOpt.value && otherText) return otherText;
        return options?.find((o) => o.value === v)?.label ?? v;
      })
      .join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const loc = value as { region?: string; district?: string };
    if (loc.region) return loc.district ? `${loc.district}, ${loc.region}` : loc.region;
    return "—";
  }
  return String(value);
}

const MKT_URGENCY_MAP: Record<string, { label: string; color: string }> = {
  today_tomorrow: { label: "Bugun / ertaga",  color: "text-red-600 bg-red-50 border-red-100"       },
  "3_7_days":     { label: "3–7 kun",         color: "text-orange-600 bg-orange-50 border-orange-100" },
  "1_2_weeks":    { label: "1–2 hafta",       color: "text-yellow-700 bg-yellow-50 border-yellow-100" },
  "1_month":      { label: "1 oy",            color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  flexible:       { label: "Shoshilinch emas", color: "text-gray-500 bg-gray-100 border-gray-200"   },
};

/* ─── Status badge ──────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open:      "bg-red-50 text-red-700 border-red-100",
    accepted:  "bg-emerald-50 text-emerald-700 border-emerald-100",
    completed: "bg-green-50 text-green-700 border-green-100 ",
    cancelled: "bg-rose-100 text-rose-700 border-rose-200",
    pending:   "bg-amber-50 text-amber-700 border-amber-100",
    rejected:  "bg-rose-100 text-rose-700 border-rose-200",
    responded: "bg-red-50 text-red-600 border-red-100",
    ignored:   "bg-gray-100 text-gray-500 border-gray-200",
  };
  const labels: Record<string, string> = {
    open: "Ochiq", accepted: "Qabul", completed: "Yakunlangan",
    cancelled: "Bekor", pending: "Kutmoqda", rejected: "Rad etildi",
    responded: "Javob berildi", ignored: "O'tkazildi",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {labels[status] ?? status}
    </span>
  );
}

/* ─── Shared style constants ─────────────────────────────────────── */
const inputCls = "px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/20 transition-all";
const RED_HEX  = "#DC2626";
const ORANGE_HEX = "#F97316";
const PIE_COLORS = ["#DC2626","#F97316","#10B981","#F59E0B","#EF4444","#06B6D4","#8B5CF6","#F43F5E","#84CC16"];

/* ════════════════════════════════════════════════════════════════════
   LOGIN GATE
   ════════════════════════════════════════════════════════════════════ */
function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      if (username === ADMIN_USER && password === ADMIN_PASS) {
        setSession();
        markAdminAuthenticated();
        logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "LOGIN", category: "admin", description: "Admin tizimga kirdi" });
        onSuccess();
      } else {
        setError("Noto'g'ri login yoki parol");
        setLoading(false);
      }
    }, 600);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #1a0505 0%, #2d0a0a 40%, #1a0505 100%)" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #DC2626 0%, transparent 70%)" }} />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-red-900/50"
              style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)" }}>
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-1">Hormang Admin</h1>
          <p className="text-red-300/60 text-sm">Boshqaruv paneliga kirish</p>
        </div>

        <form onSubmit={submit}
          className="rounded-2xl p-6 border shadow-2xl"
          style={{ background: "rgba(30,8,8,0.85)", borderColor: "rgba(220,38,38,0.2)", backdropFilter: "blur(10px)" }}>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(252,165,165,0.8)" }}>Foydalanuvchi nomi</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="hormangVIP"
                className="w-full px-3.5 py-3 rounded-xl text-white placeholder:text-red-900/60 text-sm focus:outline-none transition-all"
                style={{ background: "rgba(127,29,29,0.3)", border: "1px solid rgba(220,38,38,0.25)" }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(220,38,38,0.7)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "rgba(220,38,38,0.25)"; }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(252,165,165,0.8)" }}>Parol</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••"
                  className="w-full px-3.5 py-3 pr-11 rounded-xl text-white placeholder:text-red-900/60 text-sm focus:outline-none transition-all"
                  style={{ background: "rgba(127,29,29,0.3)", border: "1px solid rgba(220,38,38,0.25)" }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(220,38,38,0.7)"; }}
                  onBlur={(e)  => { e.target.style.borderColor = "rgba(220,38,38,0.25)"; }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400/60 hover:text-red-300 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-xl flex items-center gap-2"
              style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}>
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading || !username || !password}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)", boxShadow: "0 4px 20px rgba(220,38,38,0.4)" }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Tekshirilmoqda...
              </span>
            ) : "Kirish →"}
          </button>
        </form>
        <p className="text-center text-xs mt-4" style={{ color: "rgba(220,38,38,0.3)" }}>Hormang Admin Panel v2.0</p>
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SIDEBAR
   ════════════════════════════════════════════════════════════════════ */
const NAV_ITEMS: { id: Section; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "overview",       label: "Umumiy ko'rinish",  icon: LayoutDashboard },
  { id: "marketplace",    label: "Bozor markazi",      icon: Store           },
  { id: "users",          label: "Foydalanuvchilar",   icon: Users           },
  { id: "monetization",   label: "Monetizatsiya",      icon: CreditCard      },
  { id: "announcements",  label: "E'lonlar",           icon: Bell            },
  { id: "reports",        label: "Shikoyatlar",        icon: Flag            },
  { id: "audit",          label: "Audit log",          icon: FileText        },
  { id: "categories",     label: "Kategoriyalar",      icon: Settings        },
  { id: "feedback",       label: "Fikrlar",            icon: MessageSquare   },
];

function Sidebar({ active, onChange, collapsed, onToggle, onLogout, isDesktop, onCloseMobile }: {
  active: Section; onChange: (s: Section) => void;
  collapsed: boolean; onToggle: () => void; onLogout: () => void;
  isDesktop: boolean; onCloseMobile: () => void;
}) {
  // Icon-rail collapse is a desktop-only concept — on mobile the sidebar is an
  // overlay drawer that's always full width whenever it's shown at all.
  const showLabels = isDesktop ? !collapsed : true;
  return (
    <div className={`h-full flex flex-col transition-all duration-300 w-60 ${collapsed ? "lg:w-16" : "lg:w-60"}`}
      style={{ background: "linear-gradient(180deg, #1a0505 0%, #0f0202 100%)", borderRight: "1px solid rgba(220,38,38,0.15)" }}>
      <div className="px-3 py-4 flex items-center gap-3 min-h-[60px]"
        style={{ borderBottom: "1px solid rgba(220,38,38,0.1)" }}>
        <button onClick={isDesktop ? onToggle : onCloseMobile}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white transition-all hover:opacity-80 active:scale-95"
          style={{ background: "linear-gradient(135deg, #DC2626, #991B1B)" }}>
          {isDesktop ? (collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />) : <X className="w-4 h-4" />}
        </button>
        {showLabels && (
          <div>
            <span className="font-extrabold text-white text-sm tracking-tight">Hormang</span>
            <span className="font-extrabold text-sm tracking-tight" style={{ color: "#DC2626" }}> Admin</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => { onChange(item.id); if (!isDesktop) onCloseMobile(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${isActive ? "text-white" : ""}`}
              style={isActive
                ? { background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)", boxShadow: "0 4px 12px rgba(220,38,38,0.35)" }
                : { color: "rgba(252,165,165,0.5)" }
              }
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.1)"; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = ""; }}>
              <Icon className="w-5 h-5 flex-shrink-0" />
              {showLabels && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="px-2 py-4" style={{ borderTop: "1px solid rgba(220,38,38,0.1)" }}>
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ color: "rgba(252,165,165,0.4)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.15)"; (e.currentTarget as HTMLElement).style.color = "#FCA5A5"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "rgba(252,165,165,0.4)"; }}>
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {showLabels && "Chiqish"}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   METRIC CARD
   ════════════════════════════════════════════════════════════════════ */
function MetricCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub: string;
  icon: React.FC<{ className?: string }>; accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-extrabold text-gray-900 mb-0.5">{value}</p>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="text-[11px] text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   OVERVIEW SECTION
   ════════════════════════════════════════════════════════════════════ */
const DAY_NAMES = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

function OverviewSection({ refreshKey, setSection }: { refreshKey: number; setSection: (s: Section) => void }) {
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  useEffect(() => {
    adminFetch<{ log: AuditLog[] }>("/admin/audit-log")
      .then((res) => setAuditLog(res.log))
      .catch((err) => console.error("Load audit log failed:", err));
  }, [refreshKey]);

  /* ─── Raw data sources (marketplace rows are real, backend-fetched) ── */
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [offers, setOffers] = useState<BuyerOffer[]>([]);
  useEffect(() => {
    Promise.all([getAllRequestsAdmin(), getAllOffersAdmin()]).then(([reqs, ofrs]) => {
      setRequests(reqs);
      setOffers(ofrs);
    }).catch((err) => console.error("Load marketplace overview data failed:", err));
  }, [refreshKey]);
  const [txs, setTxs]           = useState<TangaTx[]>([]);
  const [tiers, setTiers]       = useState<PricingTier[]>([]);
  const [authUsers, setAuthUsers] = useState<BackendAdminUser[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  useEffect(() => {
    Promise.all([fetchAllWalletTransactions(), fetchPricingTiers(), fetchAdminUsers(), fetchAdminWallets()])
      .then(([{ transactions }, { tiers: backendTiers }, { users }, { wallets }]) => {
        setTxs(backendTxsToLocal(transactions));
        setTiers(backendTiers.map(backendTierToLocal));
        setAuthUsers(users);
        setProviders(backendWalletsToProviders(wallets));
      })
      .catch((err) => console.error("Load overview monetization data failed:", err));
  }, [refreshKey]);

  /* ─── Time helpers ────────────────────────────────────────────── */
  const now       = Date.now();
  const todayStr  = new Date(now).toISOString().slice(0, 10);
  const weekAgoMs = now - 7 * 86400000;
  const dayMs     = 86400000;
  const isToday = (iso?: string) => !!iso && iso.slice(0, 10) === todayStr;
  const isWeek  = (iso?: string) => !!iso && new Date(iso).getTime() >= weekAgoMs;

  /* ─── 1. Marketplace Health ───────────────────────────────────── */
  const activeRequests   = requests.filter((r) => r.status === "open");
  const noOfferRequests  = activeRequests.filter((r) => !offers.some((o) => o.requestId === r.id));
  const avgOffersPerReq  = requests.length > 0 ? (offers.length / requests.length).toFixed(1) : "—";

  /* Median time-to-first-offer (in minutes) */
  const firstOfferMins: number[] = [];
  for (const r of requests) {
    if (!r.createdAt) continue;
    const reqOffers = offers.filter((o) => o.requestId === r.id);
    if (reqOffers.length === 0) continue;
    const earliestMs = Math.min(...reqOffers.map((o) => new Date(o.createdAt).getTime()));
    firstOfferMins.push(Math.max(0, (earliestMs - new Date(r.createdAt).getTime()) / 60000));
  }
  function fmtMins(arr: number[]): string {
    if (arr.length === 0) return "—";
    const sorted = [...arr].sort((a, b) => a - b);
    const m = sorted[Math.floor(sorted.length / 2)];
    if (m < 60)   return `${Math.round(m)} daq`;
    if (m < 1440) return `${Math.round(m / 60)} soat`;
    return `${Math.round(m / 1440)} kun`;
  }
  const timeFirstOffer = fmtMins(firstOfferMins);

  /* ─── 2. Today snapshot ──────────────────────────────────────── */
  const newUsersToday     = authUsers.filter((u) => isToday(u.createdAt)).length;
  const newProvidersToday = authUsers.filter((u) => u.role === "provider" && isToday(u.createdAt)).length;
  const requestsToday     = requests.filter((r) => isToday(r.createdAt)).length;
  const offersToday       = offers.filter((o) => isToday(o.createdAt)).length;
  const completedToday    = requests.filter((r) => r.status === "completed" && isToday(r.createdAt)).length;

  /* ─── 3. Monetization (real Tanga purchases in so'm) ──────────── */
  const tierPrice = new Map<string, number>();
  tiers.forEach((t) => {
    const eff = t.salePrice !== undefined && t.salePrice < t.price ? t.salePrice : t.price;
    tierPrice.set(t.name, eff);
  });
  function txRevenue(t: TangaTx): number {
    if (t.type !== "purchase") return 0;
    return typeof t.priceSom === "number" ? t.priceSom : (tierPrice.get(t.categoryName) ?? 0);
  }
  const purchaseTxs = txs.filter((t) => t.type === "purchase");
  const revenue     = purchaseTxs.reduce((s, t) => s + txRevenue(t), 0);
  const tangaSold   = purchaseTxs.reduce((s, t) => s + t.amount, 0);
  const tangaSpent  = txs.filter((t) => t.type === "spend" || (!t.type && t.amount > 0)).reduce((s, t) => s + t.amount, 0);
  const avgSpendPerProvider = providers.length > 0 ? Math.round(tangaSpent / providers.length) : 0;

  /* ─── 4. Users ────────────────────────────────────────────────── */
  const totalUsers     = authUsers.length;
  const totalProviders = authUsers.filter((u) => u.role === "provider").length;
  const totalCustomers = totalUsers - totalProviders;
  const activeUserIds  = new Set<string>();
  txs.forEach((t)      => { if (isWeek(t.createdAt)) activeUserIds.add(t.userId); });
  offers.forEach((o)   => { if (isWeek(o.createdAt)) activeUserIds.add(o.masterId); });
  requests.forEach((r) => { if (isWeek(r.createdAt) && r.customerId) activeUserIds.add(r.customerId); });
  const activeUsers7d   = activeUserIds.size;
  const lowBalanceProvs = providers.filter((p) => p.balance < 3).length;

  /* ─── 5. Alerts (real, only show if non-zero) ─────────────────── */
  const STALE_HOURS = 24;
  const staleNoOffer = noOfferRequests.filter((r) => {
    if (!r.createdAt) return false;
    return (now - new Date(r.createdAt).getTime()) / 3600000 >= STALE_HOURS;
  }).length;
  const flaggedUsers = authUsers.filter((u) => u.flagCount > 0).length;
  const alerts: { icon: typeof AlertCircle; tone: string; text: string; cta?: () => void }[] = [];
  if (staleNoOffer > 0)    alerts.push({ icon: Inbox,        tone: "amber",  text: `${staleNoOffer} ta so'rov ${STALE_HOURS} soatdan beri taklifsiz`, cta: () => setSection("marketplace") });
  if (lowBalanceProvs > 0) alerts.push({ icon: Wallet,       tone: "rose",   text: `${lowBalanceProvs} ta ijrochi balansi <3 🪙`,                     cta: () => setSection("monetization") });
  if (flaggedUsers > 0)    alerts.push({ icon: Flag,         tone: "red",    text: `${flaggedUsers} ta belgilangan foydalanuvchi`,                     cta: () => setSection("users") });

  /* ─── 6. Referral (real "referral" Tanga transactions) ─────────── */
  const referralTxs      = txs.filter((t) => t.type === "referral");
  const referralCount    = referralTxs.length;
  const referralEarned   = referralTxs.reduce((s, t) => s + t.amount, 0);
  const activeReferrers  = new Set(referralTxs.map((t) => t.userId)).size;

  /* ─── 7. Trends — 7-day requests/offers + revenue ─────────────── */
  const activityData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * dayMs);
    const dayStr = d.toISOString().slice(0, 10);
    return {
      name: DAY_NAMES[d.getDay()],
      sorovlar:  requests.filter((r) => r.createdAt?.slice(0, 10) === dayStr).length,
      takliflar: offers.filter((o) => o.createdAt?.slice(0, 10) === dayStr).length,
      daromad:   purchaseTxs.filter((t) => t.createdAt.slice(0, 10) === dayStr).reduce((s, t) => s + txRevenue(t), 0),
    };
  });
  const hasRevenueTrend = activityData.some((d) => d.daromad > 0);

  /* ─── 8. Recent Activity Feed (last 15 audit logs) ────────────── */
  const recentActivity = auditLog.slice(0, 15);
  function categoryBadge(c: AuditLogCategory): string {
    if (c === "admin")       return "bg-violet-50 text-violet-700 border-violet-100";
    if (c === "marketplace") return "bg-blue-50 text-blue-700 border-blue-100";
    if (c === "financial")   return "bg-emerald-50 text-emerald-700 border-emerald-100";
    if (c === "referral")    return "bg-amber-50 text-amber-700 border-amber-100";
    return                          "bg-rose-50 text-rose-700 border-rose-100";
  }

  /* ─── Tile components (compact) ───────────────────────────────── */
  const Tile = ({ label, value, color = "text-gray-900", sub }: { label: string; value: string | number; color?: string; sub?: string }) => (
    <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-lg font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-gray-900 mb-1">Umumiy ko'rinish</h2>
        <p className="text-sm text-gray-500">Platformaning real-time holati — barcha ko'rsatkichlar haqiqiy ma'lumotlardan</p>
      </div>

      {/* ─── 1. Marketplace Health ──────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🏪 Bozor ko'rinishi</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Faol so'rovlar" value={activeRequests.length}
            sub={`${requests.length} dan`} icon={ClipboardList} accent />
          <MetricCard label="Taklifsiz" value={noOfferRequests.length}
            sub={noOfferRequests.length > 0 ? "⚠️ E'tibor talab qiladi" : "Hammasi yopildi"}
            icon={AlertCircle} />
          <MetricCard label="O'rt. taklif/so'rov" value={avgOffersPerReq}
            sub={`${offers.length} ta jami taklif`} icon={MessageSquare} />
          <MetricCard label="Birinchi taklif vaqti" value={timeFirstOffer}
            sub={firstOfferMins.length > 0 ? `${firstOfferMins.length} ta so'rov bo'yicha` : "Ma'lumot yo'q"} icon={Clock} />
        </div>
      </div>

      {/* ─── 2. Today snapshot ──────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">📅 Bugun</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Tile label="Yangi foydalanuvchilar" value={newUsersToday} color="text-blue-700" />
          <Tile label="Yangi ijrochilar"       value={newProvidersToday} color="text-violet-700" />
          <Tile label="So'rovlar"              value={requestsToday} color="text-red-700" />
          <Tile label="Takliflar"              value={offersToday} color="text-orange-700" />
          <Tile label="Tugatilgan ishlar"      value={completedToday} color="text-emerald-700" />
        </div>
      </div>

      {/* ─── 3. Alerts (only when present) ──────────────────────── */}
      {alerts.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🚨 Ogohlantirishlar</p>
          <div className="space-y-2">
            {alerts.map((a, i) => {
              const Icon = a.icon;
              const toneCls =
                a.tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-800" :
                a.tone === "rose"  ? "bg-rose-50  border-rose-200  text-rose-800"  :
                                      "bg-red-50   border-red-200   text-red-800";
              return (
                <button key={i} onClick={a.cta}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border ${toneCls} hover:shadow-sm transition-shadow text-left`}>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-sm font-semibold">{a.text}</span>
                  {a.cta && <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-60" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 4. Money / Users / Referral (3-col panel row) ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-600" />Monetizatsiya</h3>
            <button onClick={() => setSection("monetization")} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5">
              Ko'rish<ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Daromad</span><span className="font-extrabold text-emerald-700 text-sm">{fmtMoney(revenue)}</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Sotilgan Tanga</span><span className="font-extrabold text-amber-600 text-sm">{tangaSold} 🪙</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Sarflangan Tanga</span><span className="font-extrabold text-red-600 text-sm">{tangaSpent} 🪙</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">O'rt. ijrochi sarfi</span><span className="font-extrabold text-gray-700 text-sm">{avgSpendPerProvider} 🪙</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" />Foydalanuvchilar</h3>
            <button onClick={() => setSection("users")} className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
              Ko'rish<ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Jami</span><span className="font-extrabold text-gray-900 text-sm">{totalUsers}</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Faol (7 kun)</span><span className="font-extrabold text-emerald-600 text-sm">{activeUsers7d}</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Ijrochi / Mijoz</span><span className="font-extrabold text-violet-600 text-sm">{totalProviders} / {totalCustomers}</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Kam balans (&lt;3 🪙)</span><span className={`font-extrabold text-sm ${lowBalanceProvs > 0 ? "text-rose-600" : "text-gray-700"}`}>{lowBalanceProvs}</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-600" />Referral</h3>
            <button onClick={() => setSection("monetization")} className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-0.5">
              Ko'rish<ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Jami referrallar</span><span className="font-extrabold text-gray-900 text-sm">{referralCount}</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Berilgan Tanga</span><span className="font-extrabold text-amber-600 text-sm">{referralEarned} 🪙</span></div>
            <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Faol taklifchilar</span><span className="font-extrabold text-violet-600 text-sm">{activeReferrers}</span></div>
          </div>
        </div>
      </div>

      {/* ─── 5. Trend chart ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-bold text-gray-900 text-sm mb-4">Haftalik faollik {hasRevenueTrend ? "+ daromad" : ""}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={activityData}>
            <defs>
              <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={RED_HEX} stopOpacity={0.28} />
                <stop offset="100%" stopColor={RED_HEX} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gOrange" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ORANGE_HEX} stopOpacity={0.22} />
                <stop offset="100%" stopColor={ORANGE_HEX} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gEmerald" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            {hasRevenueTrend && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />}
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #FEE2E2", fontSize: 12 }}
              formatter={(v: number, name: string) => name === "Daromad" ? fmtMoney(v) : v} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area yAxisId="left"  type="monotone" dataKey="sorovlar"  name="So'rovlar"  stroke={RED_HEX}    fill="url(#gRed)"     strokeWidth={2.5} />
            <Area yAxisId="left"  type="monotone" dataKey="takliflar" name="Takliflar"  stroke={ORANGE_HEX} fill="url(#gOrange)"  strokeWidth={2.5} />
            {hasRevenueTrend && <Area yAxisId="right" type="monotone" dataKey="daromad" name="Daromad" stroke="#10B981" fill="url(#gEmerald)" strokeWidth={2.5} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ─── 6. Recent Activity Feed (audit log) ────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-red-500" />So'nggi faollik</h3>
          <button onClick={() => setSection("audit")} className="text-[11px] font-bold text-red-500 hover:text-red-600 flex items-center gap-0.5">
            Hammasi<ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Hali audit yozuvlari yo'q</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${categoryBadge(a.category)}`}>{a.category}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate">{a.description}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{a.actorRole} · {timeAgo(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 7. Quick Actions ───────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">⚡ Tezkor amallar</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Bozor markazi",   sub: "So'rovlar va takliflar", icon: Store,       tone: "bg-red-50 text-red-700 border-red-100",         go: () => setSection("marketplace") },
            { label: "Foydalanuvchilar", sub: `${totalUsers} ta`,        icon: Users,       tone: "bg-blue-50 text-blue-700 border-blue-100",      go: () => setSection("users") },
            { label: "Monetizatsiya",   sub: "Tanga va rejalar",        icon: CreditCard,  tone: "bg-emerald-50 text-emerald-700 border-emerald-100", go: () => setSection("monetization") },
            { label: "Audit log",       sub: `${auditLog.length} yozuv`, icon: FileText,    tone: "bg-violet-50 text-violet-700 border-violet-100", go: () => setSection("audit") },
          ].map((q) => {
            const Icon = q.icon;
            return (
              <button key={q.label} onClick={q.go}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${q.tone} hover:shadow-md transition-shadow text-left`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold truncate">{q.label}</p>
                  <p className="text-[10px] opacity-70 truncate">{q.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-60" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────── */}
      <DangerZone />
    </div>
  );
}

function DangerZone() {
  const [done, setDone] = useState(false);

  function handleReset() {
    const ok = resetPlatformData();
    if (ok) setDone(true);
  }

  return (
    <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Xavfli zona</h3>
          <p className="text-xs text-gray-500 mt-0.5">Bu amalni qaytarib bo'lmaydi. Ehtiyotkorlik bilan foydalaning.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
        <div className="min-w-0">
          <p className="text-sm font-bold text-red-800">Platforma ma'lumotlarini tozalash</p>
          <p className="text-xs text-red-500 mt-0.5">
            Barcha so'rovlar, takliflar va chatlar o'chiriladi. Sessiya va profil ma'lumotlari saqlanib qoladi.
          </p>
        </div>
        {done ? (
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-xl flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" /> Tozalandi
          </div>
        ) : (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-xl flex-shrink-0 transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)" }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Tozalash
          </button>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   REQUESTS SECTION
   ════════════════════════════════════════════════════════════════════ */
function RequestsSection({ refreshKey }: { refreshKey: number }) {
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCat, setFilterCat]       = useState("all");

  const load = useCallback(() => {
    getAllRequestsAdmin()
      .then((rows) => setRequests(rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())))
      .catch((err) => console.error("Load requests failed:", err));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function updateStatus(id: string, status: CustomerRequest["status"]) {
    if (status === "completed") {
      // Route through markOfferCompleted so offer status is updated,
      // counters are incremented for both provider and customer, and
      // a system message is sent. Falls back to direct request update
      // if no accepted/in_progress offer exists for this request.
      const requestOffers = await getOffersByRequestId(id);
      const activeOffer = requestOffers.find(
        (o) => o.status === "accepted" || o.status === "in_progress"
      );
      if (activeOffer) {
        await markOfferCompleted(activeOffer.id);
        setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "completed" } : r));
        logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "UPDATE_REQUEST_STATUS", category: "marketplace", targetId: id, targetType: "request", description: `Status o'zgartirildi: completed`, metadata: { newStatus: "completed" } });
        return;
      }
    }
    await adminSetRequestStatus(id, status);
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "UPDATE_REQUEST_STATUS", category: "marketplace", targetId: id, targetType: "request", description: `Status o'zgartirildi: ${status}`, metadata: { newStatus: status } });
  }
  async function deleteRequest(id: string) {
    if (!confirm("Bu so'rovni o'chirishni tasdiqlaysizmi?\nBog'liq takliflar va suhbatlar ham o'chiriladi, ijrochilarga Tanga qaytariladi.")) return;
    await deleteRequestCascade(id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "DELETE_REQUEST", category: "marketplace", targetId: id, targetType: "request", description: "So'rov o'chirildi (cascade)" });
  }

  const filtered = requests.filter((r) => {
    const q = search.toLowerCase();
    const name = (r.customerName ?? "").toLowerCase();
    return (
      (!q || r.categoryName.toLowerCase().includes(q) || r.id.includes(q) || name.includes(q))
      && (filterStatus === "all" || r.status === filterStatus)
      && (filterCat === "all" || r.categoryName === filterCat)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">So'rovlar</h2>
          <p className="text-sm text-gray-500">{filtered.length} / {requests.length} ta natija</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors border border-red-100">
          <RefreshCw className="w-3.5 h-3.5" /> Yangilash
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Toifa, mijoz yoki ID..."
            className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls}>
          <option value="all">Barcha holatlar</option>
          <option value="open">Ochiq</option>
          <option value="accepted">Qabul</option>
          <option value="completed">Tugallangan</option>
          <option value="cancelled">Bekor</option>
        </select>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className={inputCls}>
          <option value="all">Barcha toifalar</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">
              {requests.length === 0 ? "Hali hech qanday so'rov yo'q" : "So'rovlar topilmadi"}
            </p>
            <p className="text-gray-300 text-sm mt-1">
              {requests.length === 0
                ? "Mijozlar so'rov yuborganda bu yerda ko'rinadi"
                : "Filtrlash parametrlarini o'zgartiring"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/40">
                  {["Toifa", "Mijoz", "Joylashuv", "Shoshilinchlik", "Byudjet", "Holat", "Takliflar", "Sana", "Amallar"].map((h) => (
                    <th key={h} className="text-left text-[10px] font-bold text-red-400 uppercase tracking-widest px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-red-50/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={20} shape="square" />
                        <div>
                          <p className="font-semibold text-gray-800 text-xs leading-tight">{r.categoryName}</p>
                          <p className="text-gray-400 text-[10px] font-mono">{r.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-700 max-w-[90px] truncate">
                        {r.customerName ?? <span className="text-gray-300 italic">Noma'lum</span>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="w-3 h-3 text-red-400 flex-shrink-0" />
                        <span className="max-w-[90px] truncate">
                          {r.district ?? r.region ?? locationFrom(r.answers)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3 text-orange-400 flex-shrink-0" />
                        {urgencyFrom(r.answers)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Wallet className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        <span className="max-w-[100px] truncate">{budgetLabel(r.answers)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${r.offerCount > 0 ? "text-red-600" : "text-gray-300"}`}>{r.offerCount}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{timeAgo(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.status === "open" && (
                          <button onClick={() => updateStatus(r.id, "completed")}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="Tugallangan deb belgilash">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {r.status === "open" && (
                          <button onClick={() => updateStatus(r.id, "cancelled")}
                            className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors" title="Bekor qilish">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => deleteRequest(r.id)}
                          className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="O'chirish">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   OFFERS SECTION
   Reads from hormang_offers (canonical shared key) — same as main app.
   ════════════════════════════════════════════════════════════════════ */
function OffersSection({ refreshKey }: { refreshKey: number }) {
  const [offers, setOffers]               = useState<BuyerOffer[]>([]);
  const [filterStatus, setFilterStatus]   = useState("all");
  const [search, setSearch]               = useState("");

  const load = useCallback(() => {
    getAllOffersAdmin()
      .then((rows) => setOffers(rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())))
      .catch((err) => console.error("Load offers failed:", err));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = offers.filter((o) => {
    const q = search.toLowerCase();
    return (
      (!q || o.masterName.toLowerCase().includes(q) || o.id.includes(q) || o.requestId.includes(q))
      && (filterStatus === "all" || o.status === filterStatus)
    );
  });

  // aggregate stats
  const pending  = offers.filter((o) => o.status === "pending").length;
  const accepted = offers.filter((o) => o.status === "accepted").length;
  const rejected = offers.filter((o) => o.status === "rejected").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">Takliflar</h2>
          <p className="text-sm text-gray-500">{filtered.length} / {offers.length} ta natija</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors border border-red-100">
          <RefreshCw className="w-3.5 h-3.5" /> Yangilash
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Kutmoqda", value: pending,  color: "text-amber-600",   bg: "bg-amber-50 border-amber-100"   },
          { label: "Qabul",    value: accepted, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
          { label: "Rad",      value: rejected, color: "text-rose-600",    bg: "bg-rose-50 border-rose-100"     },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-3 ${s.bg}`}>
            <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Usta nomi, taklif ID yoki so'rov ID..."
            className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls}>
          <option value="all">Barcha holatlar</option>
          <option value="pending">Kutmoqda</option>
          <option value="accepted">Qabul</option>
          <option value="rejected">Rad etildi</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">
              {offers.length === 0 ? "Hali hech qanday taklif yo'q" : "Takliflar topilmadi"}
            </p>
            <p className="text-gray-300 text-sm mt-1">
              {offers.length === 0 ? "Ijrochilar taklif yuboргanда bu yerda ko'rinadi" : "Qidiruv parametrlarini o'zgartiring"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/40">
                  {["Ijrochi", "Narx", "Muddat", "Holat", "So'rov ID", "Javob vaqti", "Sana"].map((h) => (
                    <th key={h} className="text-left text-[10px] font-bold text-red-400 uppercase tracking-widest px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-red-50/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: o.masterColor ?? "#DC2626" }}>
                          {o.masterInitials}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-xs">{o.masterName}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{o.masterId?.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-red-600">
                      {fmtMoney(o.price)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {o.completionDurationMinutes ? `${o.completionDurationMinutes} daqiqa` : "—"}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-400">{o.requestId?.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {o.avgResponseTime ? `~${o.avgResponseTime} daqiqa` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{timeAgo(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   USERS SECTION
   Sources:
     • Providers  → unique masterIds from hormang_offers (real names/initials)
                    + hormang_local_profile_* (serviceAreas, region)
     • Customers  → hormang_customer_registry
     • "Both"     → userId appears in both provider offers AND registry
   ════════════════════════════════════════════════════════════════════ */
interface AdminUser {
  userId:           string;
  name:             string;
  initials:         string;
  color:            string;
  role:             "provider" | "customer" | "both";
  categories?:      string[];
  phone?:           string;
  phoneVerified?:   boolean;
  location?:        string;
  serviceAreas?:    string[];
  serviceAreaV2?:   { toshkent_city: { all: boolean; districts: string[] }; toshkent_region: { all: boolean; cities: string[] } };
  completionPct?:   number;
  offerCount?:      number;
  acceptedCount?:   number;
  requestCount?:    number;
  rating?:          number;
  reviewCount?:     number;
  avgResponseTime?: number;
  verified?:        boolean;
  status:           "active" | "suspended";
  joinedAt?:        string;
  referralCode?:    string;
  referredBy?:      string;
  referralCount?:   number;
  referralEarned?:  number;
  referralInvitees?: { userId: string; completedAt: string }[];
  /* ── Admin-managed metadata ── */
  flagCount?:              number;
  reportCount?:            number;
  tags?:                   string[];
  adminNotes?:             AdminNote[];
  tangaBalance?:           number;
  /* ── Profile completion reward ── */
  profileRewardGranted?:   boolean;
  profileRewardGrantedAt?: string;
}

/* ─── Advanced User Detail Modal ─────────────────────────────────── */
type DetailTab = "overview" | "requests" | "offers" | "referral" | "tanga" | "admin";

function AdvancedUserDetailModal({
  user, allUsers, onClose, onToggleSuspend, onDelete,
}: {
  user: AdminUser;
  allUsers: AdminUser[];
  onClose: () => void;
  onToggleSuspend: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
}) {
  const [tab, setTab]               = useState<DetailTab>("overview");
  const [noteInput, setNoteInput]   = useState("");
  const [tagInput, setTagInput]     = useState("");
  const [localUser, setLocalUser]   = useState<AdminUser>(user);
  const [refundDone, setRefundDone] = useState(false);

  function applyModeration(m: BackendUserModeration) {
    setLocalUser((prev) => ({ ...prev, verified: m.verified, flagCount: m.flagCount, tags: m.tags, adminNotes: m.adminNotes }));
  }

  const u = localUser;
  const roleBg  = u.role === "provider" ? "bg-violet-600"
                : u.role === "both"     ? "bg-gradient-to-br from-violet-600 to-blue-600"
                :                        "bg-blue-600";

  /* Data for sub-tabs */
  const [userOffers, setUserOffers] = useState<BuyerOffer[]>([]);
  const [userRequests, setUserRequests] = useState<CustomerRequest[]>([]);
  const [recentRequestCount, setRecentRequestCount] = useState(0);
  const [tangaTxs, setTangaTxs] = useState<TangaTx[]>([]);
  const tangaBalance = u.tangaBalance ?? 0;

  useEffect(() => {
    fetchWalletTransactions(u.userId)
      .then(({ transactions }) => setTangaTxs(backendTxsToLocal(transactions)))
      .catch((err) => console.error("Load user transactions failed:", err));
  }, [u.userId]);

  useEffect(() => {
    Promise.all([getAllOffersAdmin(), getAllRequestsAdmin()]).then(([offers, requests]) => {
      setUserOffers(offers.filter((o) => o.masterId === u.userId));
      setUserRequests(requests.filter((r) => r.customerId === u.userId));
    }).catch((err) => console.error("Load user marketplace data failed:", err));
    getRecentRequestCount(u.userId).then(setRecentRequestCount).catch(() => {});
  }, [u.userId]);

  const [eligibility, setEligibility] = useState<{ eligible: boolean; refundAmount: number; offers: BuyerOffer[] }>({ eligible: false, refundAmount: 0, offers: [] });
  useEffect(() => {
    getLast10RejectedEligibility(u.userId).then(setEligibility).catch((err) => console.error("Load refund eligibility failed:", err));
  }, [u.userId, refundDone]);

  /* Admin actions */
  async function handleFlagToggle() {
    const cur = u.flagCount ?? 0;
    const next = cur > 0 ? 0 : 1;
    try {
      const { moderation } = await setUserFlagCountBackend(u.userId, next);
      applyModeration(moderation);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: next > 0 ? "FLAG_USER" : "UNFLAG_USER", category: "risk", targetId: u.userId, targetType: "user", description: `${u.name} ${next > 0 ? "flaglandi" : "flag olib tashlandi"}`, metadata: { userName: u.name, flagCount: next } });
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }
  async function handleVerifyToggle() {
    const next = !(u.verified ?? false);
    try {
      const { moderation } = await setUserVerifiedBackend(u.userId, next);
      applyModeration(moderation);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: next ? "VERIFY_USER" : "UNVERIFY_USER", category: "admin", targetId: u.userId, targetType: "user", description: `${u.name} ${next ? "tasdiqlandi" : "tasdiq bekor qilindi"}`, metadata: { userName: u.name, verified: next } });
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }
  async function handleAddNote() {
    const t = noteInput.trim();
    if (!t) return;
    try {
      const { moderation } = await addUserNoteBackend(u.userId, t);
      applyModeration(moderation);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADD_NOTE", category: "admin", targetId: u.userId, targetType: "user", description: `Izoh: ${t.slice(0, 60)}`, metadata: { userName: u.name } });
      setNoteInput("");
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }
  async function handleRemoveNote(idx: number) {
    try {
      const { moderation } = await removeUserNoteBackend(u.userId, idx);
      applyModeration(moderation);
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }
  async function handleAddTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t) return;
    const cur = u.tags ?? [];
    if (cur.includes(t)) { setTagInput(""); return; }
    try {
      const { moderation } = await setUserTagsBackend(u.userId, [...cur, t]);
      applyModeration(moderation);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADD_TAG", category: "admin", targetId: u.userId, targetType: "user", description: `Tag qo'shildi: ${t}`, metadata: { userName: u.name, tag: t } });
      setTagInput("");
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }
  async function handleRemoveTag(tag: string) {
    try {
      const { moderation } = await setUserTagsBackend(u.userId, (u.tags ?? []).filter((x) => x !== tag));
      applyModeration(moderation);
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "overview",  label: "Umumiy" },
    { id: "requests",  label: `So'rovlar (${userRequests.length})` },
    { id: "offers",    label: `Takliflar (${userOffers.length})` },
    { id: "referral",  label: "Referral" },
    { id: "tanga",     label: `Tanga (${tangaTxs.length})` },
    { id: "admin",     label: "Admin" },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="fixed inset-x-0 top-[3vh] bottom-0 z-[71] flex justify-center pointer-events-none"
      >
        <div
          className="bg-white w-full max-w-2xl rounded-t-3xl flex flex-col shadow-2xl overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0 bg-gradient-to-r from-gray-50 to-white">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-extrabold text-white flex-shrink-0 shadow-md ${roleBg}`}>
              {u.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-gray-900 text-base leading-tight">{u.name}</h2>
                {u.verified && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-0.5">
                    <UserCheck className="w-2.5 h-2.5" /> Tasdiqlangan
                  </span>
                )}
                {(u.flagCount ?? 0) > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-0.5">
                    <Flag className="w-2.5 h-2.5" /> Flaglangan
                  </span>
                )}
                {recentRequestCount >= REQUEST_DAILY_FLAG_THRESHOLD && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5"
                    title="Shubhali faollik — oxirgi 24 soatda 5+ ta so'rov"
                  >
                    ⚠️ {recentRequestCount} ta so'rov bugun
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                {(u.role === "provider" || u.role === "both") && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-50 text-violet-700 border border-violet-100">Ijrochi</span>
                )}
                {(u.role === "customer" || u.role === "both") && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100">Mijoz</span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                  u.status === "suspended"
                    ? "bg-red-100 text-red-700 border-red-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-100"
                }`}>{u.status === "suspended" ? "To'xtatilgan" : "Faol"}</span>
                {(u.tags ?? []).map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">#{tag}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => { onToggleSuspend(u); onClose(); }}
                className={`p-2 rounded-xl text-xs font-bold transition-colors ${
                  u.status === "suspended"
                    ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                    : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                }`} title={u.status === "suspended" ? "Faollashtirish" : "To'xtatish"}>
                {u.status === "suspended" ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              </button>
              <button onClick={() => { if (confirm(`${u.name}ni o'chirish?`)) { onDelete(u); onClose(); } }}
                className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors" title="O'chirish">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-0.5 px-5 py-2 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  tab === t.id ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-100"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <div className="space-y-4">
                {/* Stats bar */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Tanga", value: `${tangaBalance} 🪙`, color: "text-amber-600" },
                    { label: "Reyting", value: u.rating ? `★ ${u.rating.toFixed(1)}` : "—", color: "text-amber-700" },
                    { label: u.role === "customer" ? "So'rovlar" : "Takliflar",
                      value: String(u.role === "customer" ? (u.requestCount ?? 0) : (u.offerCount ?? 0)), color: "text-violet-700" },
                    { label: "Referral", value: String(u.referralCount ?? 0), color: "text-blue-700" },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 text-center">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{s.label}</p>
                      <p className={`text-base font-extrabold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Contact */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kontakt</p>
                  {[
                    { label: "ID", val: <span className="font-mono text-[11px] text-gray-500">{u.userId}</span> },
                    { label: "Telefon", val: <span className="font-semibold text-gray-800">{u.phone ?? "—"}{u.phoneVerified ? <span className="text-emerald-600 ml-1 text-[10px]">✓</span> : null}</span> },
                    { label: "Joylashuv", val: <span className="font-semibold text-gray-800">{u.location ?? "—"}</span> },
                    { label: "Ro'yxat", val: <span className="font-semibold text-gray-800">{u.joinedAt ? fmtDate(u.joinedAt) : "—"}</span> },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">{label}</span>
                      {val}
                    </div>
                  ))}
                </div>

                {/* Provider stats */}
                {(u.role === "provider" || u.role === "both") && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Qabul %", val: u.completionPct !== undefined ? `${u.completionPct}%` : "—", bg: "bg-emerald-50 border-emerald-100", tx: "text-emerald-700" },
                        { label: "Qabul qilingan", val: `${u.acceptedCount ?? 0} ta`, bg: "bg-violet-50 border-violet-100", tx: "text-violet-700" },
                        { label: "Sharhlar", val: `${u.reviewCount ?? 0} ta`, bg: "bg-amber-50 border-amber-100", tx: "text-amber-700" },
                        { label: "Javob vaqti", val: formatAvgResponseTime(getAvgResponseMinutes(u.userId), { notAvailable: "—", minutesTpl: "{{n}} daqiqa", aboutHour: "~1 soat" }), bg: "bg-blue-50 border-blue-100", tx: "text-blue-700" },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-xl p-3 border text-center ${s.bg}`}>
                          <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{s.label}</p>
                          <p className={`text-lg font-extrabold ${s.tx}`}>{s.val}</p>
                        </div>
                      ))}
                    </div>
                    {/* Profile completion reward badge */}
                    <div className={`flex items-center justify-between rounded-xl px-3 py-2 border ${u.profileRewardGranted ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base">🎖</span>
                        <span className="text-[11px] font-bold text-gray-700">Profil bonusi (+5 🪙)</span>
                      </div>
                      {u.profileRewardGranted ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[11px] font-extrabold text-emerald-700">✅ Berilgan</span>
                          {u.profileRewardGrantedAt && (
                            <span className="text-[9px] text-gray-400">{new Date(u.profileRewardGrantedAt).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-gray-400">⏳ Kutilmoqda</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Provider/customer badges (read-only display in overview) */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <BadgeCheck className="w-3 h-3" /> Nishonlar
                  </p>
                  {getStoredBadges(u.userId).length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">Nishonlar yo'q</p>
                  ) : (
                    <ProviderBadges userId={u.userId} size="sm" />
                  )}
                </div>

                {/* Service areas */}
                {(u.serviceAreaV2 || (u.serviceAreas && u.serviceAreas.length > 0)) && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Xizmat hududlari</p>
                    <div className="flex flex-wrap gap-1.5">
                      {u.serviceAreaV2 ? (
                        <>
                          {u.serviceAreaV2.toshkent_city.all && <span className="px-2.5 py-1 bg-violet-50 text-violet-700 text-xs font-semibold rounded-lg border border-violet-100">🏙 Butun Toshkent</span>}
                          {!u.serviceAreaV2.toshkent_city.all && u.serviceAreaV2.toshkent_city.districts.map((d) => (
                            <span key={d} className="px-2.5 py-1 bg-violet-50 text-violet-700 text-xs font-semibold rounded-lg border border-violet-100">🏙 {d}</span>
                          ))}
                          {u.serviceAreaV2.toshkent_region.all && <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-100">🗺 Butun viloyat</span>}
                          {!u.serviceAreaV2.toshkent_region.all && u.serviceAreaV2.toshkent_region.cities.map((c) => (
                            <span key={c} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-100">🗺 {c}</span>
                          ))}
                        </>
                      ) : u.serviceAreas!.map((a) => (
                        <span key={a} className="px-2.5 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded-lg border border-red-100">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Categories */}
                {u.categories && u.categories.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Kategoriyalar</p>
                    <div className="flex flex-wrap gap-1.5">
                      {u.categories.map((c) => (
                        <span key={c} className="px-2.5 py-1 bg-violet-50 text-violet-700 text-xs font-semibold rounded-lg border border-violet-100">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── REQUESTS ── */}
            {tab === "requests" && (
              <div className="space-y-2">
                {userRequests.length === 0 ? (
                  <div className="text-center py-10">
                    <ClipboardList className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm font-semibold">So'rovlar yo'q</p>
                  </div>
                ) : userRequests.map((r) => (
                  <div key={r.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                    <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={28} shape="square" className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-xs truncate">{r.categoryName}</p>
                      <p className="text-[10px] text-gray-400">{fmtDate(r.createdAt)} · {r.offerCount ?? 0} taklif</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}

            {/* ── OFFERS ── */}
            {tab === "offers" && (() => {
              const { offers: last10, eligible, refundAmount } = eligibility;
              const alreadyRefunded = !refundDone && last10.length === 10 && last10.every((o) => o.refunded);

              async function handleAdminRefund() {
                if (!confirm(`${u.name}ga ${refundAmount} Tanga (50%) qaytarilsinmi?`)) return;
                const result = await adminRefundProvider(u.userId);
                if (result.ok) {
                  logAction({
                    actorId: ADMIN_USER, actorRole: "admin", action: "PROVIDER_REFUND",
                    category: "financial", targetId: u.userId, targetType: "user",
                    description: `50% admin qaytarish: +${result.refundAmount} Tanga — ${u.name}`,
                    metadata: { userName: u.name, refundAmount: result.refundAmount },
                  });
                  setRefundDone(true);
                } else {
                  alert("Qaytarish amalga oshmadi: noma'lum xato");
                }
              }

              return (
                <div className="space-y-4">
                  {/* ── Offer Performance Panel ── */}
                  {(u.role === "provider" || u.role === "both") && (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3" /> Taklif natijalari (so'nggi 10)
                      </p>

                      {/* Last 10 offer status pills */}
                      {last10.length === 0 ? (
                        <p className="text-xs text-gray-400">Hali taklif yuborilmagan</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {last10.map((o, i) => (
                            <span key={o.id}
                              title={`#${i + 1} — ${fmtDate(o.createdAt)}${o.tangaSpent ? ` · ${o.tangaSpent} 🪙` : ""}`}
                              className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                o.status === "accepted"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : o.status === "rejected"
                                  ? "bg-red-50 text-red-600 border-red-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                              {o.status === "accepted" ? "✅" : o.status === "rejected" ? "❌" : "⏳"}
                              {o.refunded && <span className="text-emerald-500 text-[9px]">↩</span>}
                            </span>
                          ))}
                          {last10.length < 10 && (
                            <span className="text-[10px] text-gray-400 self-center ml-1">
                              ({10 - last10.length} ta yetishmaydi)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Eligibility warning */}
                      {eligible && !refundDone && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                          <TriangleAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-amber-800">
                              So'nggi 10 taklif ham rad etilgan!
                            </p>
                            <p className="text-[10px] text-amber-700 mt-0.5">
                              Ijrochi 50% qaytarish (
                              {refundAmount} 🪙) uchun layoqatli.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Refund button */}
                      {(u.role === "provider" || u.role === "both") && (
                        <button
                          onClick={handleAdminRefund}
                          disabled={!eligible || refundDone || alreadyRefunded}
                          className={`w-full py-2.5 rounded-xl font-bold text-sm border transition-colors flex items-center justify-center gap-2 ${
                            refundDone || alreadyRefunded
                              ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                              : eligible
                              ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                              : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                          }`}>
                          {refundDone ? (
                            <><CheckCircle2 className="w-4 h-4" /> Qaytarildi</>
                          ) : alreadyRefunded ? (
                            <><CheckCircle2 className="w-4 h-4" /> Allaqachon qaytarilgan</>
                          ) : (
                            <>50% qaytarish {eligible ? `(${refundAmount} 🪙)` : ""}</>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── All offers list ── */}
                  {userOffers.length === 0 ? (
                    <div className="text-center py-10">
                      <Inbox className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-semibold">Takliflar yo'q</p>
                    </div>
                  ) : userOffers.map((o) => (
                    <div key={o.id} className={`bg-gray-50 rounded-xl p-3 border flex items-center gap-3 ${o.status === "accepted" ? "border-emerald-200" : "border-gray-100"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-xs truncate">{(o as BuyerOffer & { categoryName?: string }).categoryName ?? "Xizmat"}</p>
                        <p className="text-[10px] text-gray-400">
                          {fmtDate(o.createdAt)}
                          {o.tangaSpent != null && <span className="ml-1 text-amber-500">· {o.tangaSpent} 🪙</span>}
                          {o.refunded && <span className="ml-1 text-emerald-500">· ↩ qaytarildi</span>}
                        </p>
                      </div>
                      <span className="font-extrabold text-red-600 text-sm flex-shrink-0">{fmtMoney(o.price)}</span>
                      <StatusBadge status={o.status} />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── REFERRAL ── */}
            {tab === "referral" && (() => {
              const invitees = u.referralInvitees ?? [];
              const userById = new Map(allUsers.map((x) => [x.userId, x] as const));
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Kod",        val: u.referralCode ?? "—",              color: "text-gray-800" },
                      { label: "Taklif",     val: String(u.referralCount ?? 0),        color: "text-violet-700" },
                      { label: "Daromad",    val: `${u.referralEarned ?? 0} 🪙`,       color: "text-amber-600" },
                    ].map((s) => (
                      <div key={s.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                        <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{s.label}</p>
                        <p className={`text-base font-extrabold ${s.color}`}>{s.val}</p>
                      </div>
                    ))}
                  </div>

                  {u.referredBy && (
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-sm">
                      <span className="text-blue-500 text-[11px] font-bold uppercase tracking-wide">Kim taklif qildi:</span>
                      <p className="font-semibold text-blue-800 mt-0.5">{u.referredBy}</p>
                    </div>
                  )}

                  {/* Invited users list */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Gift className="w-3 h-3" /> Kimlarni taklif qilgan ({invitees.length})
                    </p>
                    {invitees.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-gray-400 text-sm">Hali hech kimni taklif qilmagan</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {invitees.map((inv) => {
                          const invitee = userById.get(inv.userId);
                          const initials = invitee?.initials ?? inv.userId.slice(0, 2).toUpperCase();
                          const color = invitee?.color ?? "#7C3AED";
                          const name = invitee?.name ?? "Noma'lum foydalanuvchi";
                          return (
                            <div key={inv.userId} className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                   style={{ background: color }}>
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 text-sm truncate">{name}</p>
                                <p className="text-[10px] text-gray-400 font-mono truncate">{inv.userId}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[10px] text-gray-400">{fmtDate(inv.completedAt)}</p>
                                <p className="text-amber-600 font-extrabold text-xs">+{TANGA_PER_REFERRAL} 🪙</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── TANGA ── */}
            {tab === "tanga" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Balans",        val: `${tangaBalance} 🪙`,                                                        color: "text-amber-600" },
                    { label: "Sarflandi",      val: `${tangaTxs.filter(txIsOfferSpend).reduce((s,t)=>s+t.amount,0)} 🪙`,        color: "text-red-600"   },
                    { label: "Tranzaksiyalar", val: String(tangaTxs.length),                                                    color: "text-gray-700"  },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                      <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{s.label}</p>
                      <p className={`text-base font-extrabold ${s.color}`}>{s.val}</p>
                    </div>
                  ))}
                </div>
                {tangaTxs.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="flex justify-center mb-1"><TangaCoin size="lg" /></div>
                    <p className="text-gray-400 text-sm font-semibold">Tranzaksiyalar yo'q</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tangaTxs.map((tx) => {
                      const signed = txSignedAmount(tx);
                      const isIn   = signed >= 0;
                      return (
                        <div key={tx.id} className="bg-gray-50 rounded-xl p-3 flex items-center gap-3 border border-gray-100">
                          <CategoryIcon categoryId={null} emoji={tx.categoryEmoji || "📋"} size={24} shape="square" className="flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-xs truncate">{tx.categoryName}</p>
                            <p className="text-[10px] text-gray-400">{new Date(tx.createdAt).toLocaleDateString("uz-UZ")}</p>
                          </div>
                          <span className={`font-extrabold text-sm flex-shrink-0 ${isIn ? "text-emerald-600" : "text-amber-600"}`}>
                            {isIn ? "+" : "−"}{Math.abs(signed)} <TangaCoin size="xs" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── ADMIN ── */}
            {tab === "admin" && (
              <div className="space-y-5">
                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleVerifyToggle}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border transition-colors ${
                      u.verified
                        ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}>
                    <UserCheck className="w-4 h-4" />
                    {u.verified ? "Tasdiqlangan ✓" : "Tasdiqlash"}
                  </button>
                  <button onClick={handleFlagToggle}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border transition-colors ${
                      (u.flagCount ?? 0) > 0
                        ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                        : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                    }`}>
                    <Flag className="w-4 h-4" />
                    {(u.flagCount ?? 0) > 0 ? "Flaglangan 🚩" : "Flag qo'yish"}
                  </button>
                  <button onClick={() => { onToggleSuspend(u); setLocalUser((prev) => ({ ...prev, status: prev.status === "suspended" ? "active" : "suspended" })); }}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border transition-colors ${
                      u.status === "suspended"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                        : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                    }`}>
                    {u.status === "suspended" ? <><CheckCircle2 className="w-4 h-4" /> Faollashtirish</> : <><Ban className="w-4 h-4" /> To'xtatish</>}
                  </button>
                  <button onClick={() => { if (confirm(`${u.name}ni o'chirish?`)) { onDelete(u); onClose(); } }}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 transition-colors">
                    <Trash2 className="w-4 h-4" /> O'chirish
                  </button>
                </div>

                {/* Badge management (admin grant/remove) */}
                <AdminBadgeManager
                  targetUser={{ userId: u.userId, name: u.name, role: u.role }}
                  adminId={ADMIN_USER}
                  onChange={() => setLocalUser((prev) => ({ ...prev }))}
                />

                {/* Tags */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Tag className="w-3 h-3" /> Teglar
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(u.tags ?? []).length === 0 && (
                      <p className="text-xs text-gray-400">Hali teg qo'shilmagan</p>
                    )}
                    {(u.tags ?? []).map((tag) => (
                      <span key={tag}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                        #{tag}
                        <button onClick={() => handleRemoveTag(tag)} className="ml-0.5 text-amber-400 hover:text-rose-600 transition-colors">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                      placeholder="yangi-teg"
                      className={`${inputCls} flex-1 text-xs`}
                    />
                    <button onClick={handleAddTag}
                      className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors flex-shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Notes */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <StickyNote className="w-3 h-3" /> Admin izohlari
                  </p>
                  {(u.adminNotes ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">Hali izoh qo'shilmagan</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(u.adminNotes ?? []).map((note, i) => (
                        <div key={i} className="bg-white rounded-xl p-2.5 border border-gray-100 flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 leading-relaxed">{note.text}</p>
                            <p className="text-[9px] text-gray-400 mt-0.5">{fmtDate(note.at)}</p>
                          </div>
                          <button onClick={() => handleRemoveNote(i)}
                            className="text-gray-300 hover:text-rose-500 transition-colors flex-shrink-0 mt-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddNote(); } }}
                      placeholder="Izoh yozing..."
                      className={`${inputCls} flex-1 text-xs`}
                    />
                    <button onClick={handleAddNote}
                      className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors flex-shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MARKETPLACE SECTION — Unified Request + Offers Control Center
   ════════════════════════════════════════════════════════════════════ */

/* ── Shared admin-chat types (backed by the real /chats/admin/all endpoint) ── */
type AdminChatMsg = StoreChat["messages"][number];
type AdminChatRow = StoreChat;

/* ── Kanban column classifier ─────────────────────────────────────── */
type KanbanCol = "new" | "incoming" | "assigned" | "completed" | "problem";
function mktKanbanCol(req: CustomerRequest, offers: BuyerOffer[]): KanbanCol {
  if (req.status === "completed") return "completed";
  if (req.status === "cancelled") return "problem";
  if (offers.some((o) => o.status === "accepted" || o.status === "in_progress")) return "assigned";
  if (offers.length > 0) return "incoming";
  const ageH = (Date.now() - new Date(req.createdAt).getTime()) / 3_600_000;
  if (ageH > 1) return "problem";
  return "new";
}

/* ── Small reusable cards (marketplace-specific) ─────────────────── */
function MktInfoCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <p className="text-sm font-extrabold text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}
function MktMetricCard({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-extrabold ${color}`}>
        {value}
        {unit && <span className="text-sm font-semibold text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

/* ── Marketplace Table ────────────────────────────────────────────── */
type MktRow = { request: CustomerRequest; offers: BuyerOffer[]; acceptedOffer?: BuyerOffer; col: KanbanCol; chat?: AdminChatRow };
function MarketplaceTable({ rows, onOpen, onDelete }: {
  rows: MktRow[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
      <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-400 font-semibold">So'rovlar topilmadi</p>
    </div>
  );
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-red-50/40">
              {["Xizmat / Toifa", "Mijoz", "Joylashuv", "Faol", "Jami", "Holat", "Tanlangan ijrochi", "Vaqt", "Amallar"].map((h) => (
                <th key={h} className="text-left text-[10px] font-bold text-red-400 uppercase tracking-widest px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(({ request: r, offers, acceptedOffer, col }) => (
              <tr key={r.id} className="hover:bg-red-50/20 transition-colors cursor-pointer" onClick={() => onOpen(r.id)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={20} shape="square" />
                    <div>
                      <p className="font-semibold text-gray-800 text-xs leading-tight">{r.categoryName}</p>
                      <p className="text-gray-400 text-[10px] font-mono">{r.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-700 max-w-[90px] truncate">
                    {r.customerName ?? <span className="text-gray-300 italic">Noma'lum</span>}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="w-3 h-3 text-red-400 flex-shrink-0" />
                    <span className="max-w-[90px] truncate">{r.district ?? r.region ?? locationFrom(r.answers)}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const active = offers.filter((o) => ["pending", "negotiating", "accepted"].includes(o.status)).length;
                    const cls = active >= 5 ? "text-rose-600" : active > 0 ? "text-red-600" : "text-gray-300";
                    return <span className={`font-extrabold text-sm ${cls}`}>{active}/5</span>;
                  })()}
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const total = offers.length;
                    const cls = total >= 10 ? "text-rose-600" : total > 0 ? "text-red-600" : "text-gray-300";
                    return (
                      <div className="flex items-center gap-1">
                        <span className={`font-extrabold text-sm ${cls}`}>{total}/10</span>
                        {col === "problem" && total === 0 && (
                          <TriangleAlert className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <StatusBadge status={r.status} />
                    {(r.status === "matched" || (r as { acceptedOfferId?: string }).acceptedOfferId) && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">🔒 Matched</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {acceptedOffer ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                        style={{ background: acceptedOffer.masterColor ?? "#DC2626" }}>
                        {acceptedOffer.masterInitials}
                      </div>
                      <p className="text-xs font-semibold text-gray-700 max-w-[80px] truncate">{acceptedOffer.masterName}</p>
                    </div>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{timeAgo(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onOpen(r.id)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors" title="Boshqarish">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onDelete(r.id)}
                      className="p-1.5 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors" title="O'chirish">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Marketplace Kanban ───────────────────────────────────────────── */
const KANBAN_COL_DEFS: { key: KanbanCol; label: string; color: string; bg: string; border: string }[] = [
  { key: "new",       label: "Yangi",            color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-100"   },
  { key: "incoming",  label: "Takliflar keldi",  color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-100"  },
  { key: "assigned",  label: "Tayinlangan",      color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-100" },
  { key: "completed", label: "Tugallangan",      color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100"},
  { key: "problem",   label: "Muammoli",         color: "text-rose-700",    bg: "bg-rose-50",    border: "border-rose-100"   },
];
function MarketplaceKanban({ rows, onOpen }: { rows: MktRow[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-5 gap-3 min-h-[320px]">
      {KANBAN_COL_DEFS.map((col) => {
        const colRows = rows.filter((r) => r.col === col.key);
        return (
          <div key={col.key} className="flex flex-col gap-2">
            <div className={`rounded-xl px-3 py-2 border ${col.bg} ${col.border}`}>
              <p className={`text-[11px] font-extrabold ${col.color} uppercase tracking-wide`}>{col.label}</p>
              <p className="text-xs text-gray-500 font-semibold">{colRows.length} ta</p>
            </div>
            <div className="space-y-2 flex-1">
              {colRows.map(({ request: r, offers }) => (
                <button key={r.id} onClick={() => onOpen(r.id)}
                  className="w-full text-left bg-white rounded-xl border border-gray-100 p-3 hover:border-red-300 hover:shadow-sm transition-all shadow-xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={18} shape="square" className="flex-shrink-0" />
                    <p className="text-xs font-extrabold text-gray-800 leading-tight truncate">{r.categoryName}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate mb-2">{r.customerName ?? "Noma'lum"}</p>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={r.status} />
                    <span className={`text-[11px] font-bold ${offers.length > 0 ? "text-red-600" : "text-gray-300"}`}>
                      {offers.length} taklif
                    </span>
                  </div>
                </button>
              ))}
              {colRows.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-gray-100 p-4 text-center">
                  <p className="text-[11px] text-gray-300 font-semibold">Bo'sh</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Request Command Center Modal ────────────────────────────────── */
function RequestCommandCenter({ row, onClose, onAcceptOffer, onRejectOffer, onRemoveOffer, onUpdateStatus, onDelete }: {
  row: MktRow;
  onClose: () => void;
  onAcceptOffer: (offerId: string, requestId: string) => void;
  onRejectOffer: (offerId: string) => void;
  onRemoveOffer: (offerId: string) => void;
  onUpdateStatus: (reqId: string, status: CustomerRequest["status"]) => void;
  onDelete: (reqId: string) => void;
}) {
  const [tab, setTab] = useState<"overview" | "offers" | "timeline" | "chat" | "metrics">("overview");
  const { request: r, offers, acceptedOffer, chat } = row;

  const avgPrice = offers.length > 0 ? offers.reduce((s, o) => s + o.price, 0) / offers.length : 0;
  const minPrice = offers.length > 0 ? Math.min(...offers.map((o) => o.price)) : 0;
  const maxPrice = offers.length > 0 ? Math.max(...offers.map((o) => o.price)) : 0;
  const sortedOffers = [...offers].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const firstOfferMs = sortedOffers.length > 0
    ? new Date(sortedOffers[0].createdAt).getTime() - new Date(r.createdAt).getTime()
    : null;

  /* ── Q&A from questionnaire (mirrors RequestPreviewModal) ── */
  const allQuestions = getAllQuestionsForCategory(r.categoryId);
  const activeQuestions = collectActiveQuestions(allQuestions, (r.answers ?? {}) as Record<string, unknown>);
  const qaPairs = activeQuestions
    .filter((q) => !MKT_SKIP_KEYS.has(q.id))
    .map((q) => {
      const raw = r.answers?.[q.id];
      if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
      const otherText = r.answers?.[q.id + "_other"] as string | undefined;
      const formatted = mktFormatAnswer(raw, q.options, otherText);
      if (formatted === "__IMAGE__") return null;
      return { label: q.label, value: formatted };
    })
    .filter(Boolean) as { label: string; value: string }[];
  const photoUrls = r.answers
    ? getAnswerImageUrls(r.answers as Record<string, unknown>, r.requestPhotos)
    : (r.requestPhotos ?? []);
  const urgInfo = r.answers?.["urgency"]
    ? (MKT_URGENCY_MAP[r.answers["urgency"] as string] ?? null) : null;
  const location = [r.district, r.region].filter(Boolean).join(", ");
  const budgetAnswer = r.answers?.["budget"];
  const openToOffers = r.answers?.["budget_open"] as boolean | undefined;
  const budgetDisplay = openToOffers
    ? "Taklifga ochiq"
    : typeof budgetAnswer === "number"
    ? budgetAnswer.toLocaleString("uz-Latn-UZ") + " so'm"
    : null;

  /* ── Timeline events ── */
  const timeline: { time: string; label: string; icon: string }[] = [
    { time: r.createdAt, label: "So'rov yaratildi", icon: "📋" },
    ...sortedOffers.map((o) => ({
      time: o.createdAt,
      label: `Taklif keldi — ${o.masterName} (${fmtMoney(o.price)})`,
      icon: "💼",
    })),
  ];
  if (acceptedOffer) timeline.push({
    time: acceptedOffer.createdAt,
    label: `Taklif qabul qilindi — ${acceptedOffer.masterName}`,
    icon: "✅",
  });
  if (r.status === "completed") timeline.push({ time: r.createdAt, label: "Xizmat tugallandi", icon: "🎉" });
  timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const TABS = [
    { id: "overview" as const,  label: "Umumiy" },
    { id: "offers"   as const,  label: `Takliflar (${offers.length})` },
    { id: "timeline" as const,  label: "Timeline" },
    { id: "chat"     as const,  label: "Suhbat" },
    { id: "metrics"  as const,  label: "Metrikalar" },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="fixed inset-x-0 top-[4vh] bottom-0 z-[71] flex justify-center pointer-events-none"
      >
        <div
          className="bg-white w-full max-w-3xl rounded-t-3xl flex flex-col shadow-2xl overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={36} shape="square" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-900 text-base leading-tight">{r.categoryName}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <StatusBadge status={r.status} />
                <p className="text-[11px] text-gray-400 font-mono">{r.id.slice(0, 12)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {r.status === "open" && (
                <>
                  <button onClick={() => { onUpdateStatus(r.id, "completed"); onClose(); }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 border border-emerald-100 transition-colors">
                    Tugallangan
                  </button>
                  <button onClick={() => { onUpdateStatus(r.id, "cancelled"); onClose(); }}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 border border-amber-100 transition-colors">
                    Bekor qilish
                  </button>
                </>
              )}
              <button onClick={() => { onDelete(r.id); onClose(); }}
                className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors" title="O'chirish">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={onClose}
                className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 py-2.5 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${tab === t.id ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">

                {/* Request top bar */}
                <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                  <div className="flex items-start gap-3">
                    <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={44} shape="square" shadow className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-sm text-gray-900">{r.categoryName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(r.createdAt)}</p>
                      {r.customerName && (
                        <p className="text-xs text-gray-500 mt-0.5 font-semibold">👤 {r.customerName}</p>
                      )}
                    </div>
                    {urgInfo && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${urgInfo.color}`}>
                        <Clock className="w-3 h-3 inline mr-1" />
                        {urgInfo.label}
                      </span>
                    )}
                  </div>

                  {/* Key meta: location + budget */}
                  {(location || budgetDisplay) && (
                    <div className="flex flex-wrap gap-3 mt-3">
                      {location && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          <span>{location}</span>
                        </div>
                      )}
                      {budgetDisplay && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                          <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{budgetDisplay}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Q&A pairs */}
                {qaPairs.length > 0 && (
                  <div className="px-4 py-3 space-y-2.5 border-b border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Savol · Javob</p>
                    {qaPairs.map((pair, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <div className="flex-shrink-0 w-1 rounded-full bg-red-200 self-stretch" />
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-400 font-medium">{pair.label}:</span>
                          <span className="font-bold text-gray-800 ml-1">{pair.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Customer uploaded photos */}
                {photoUrls.length > 0 && (
                  <div className="px-4 py-3">
                    <ImageGrid urls={photoUrls} label="Mijoz rasmlari" columns={4} />
                  </div>
                )}

                {/* Empty state */}
                {qaPairs.length === 0 && photoUrls.length === 0 && (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-gray-400">Qo'shimcha ma'lumot yo'q</p>
                  </div>
                )}
              </div>
            )}

            {/* ── OFFERS ── */}
            {tab === "offers" && (
              <div className="space-y-3">
                {offers.length === 0 ? (
                  <div className="text-center py-10">
                    <Inbox className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm font-semibold">Hali hech qanday taklif yo'q</p>
                  </div>
                ) : sortedOffers.map((o) => (
                  <div key={o.id} className={`bg-white border rounded-2xl p-4 ${o.status === "accepted" ? "border-emerald-300 bg-emerald-50/20" : o.status === "rejected" ? "border-rose-200 opacity-60" : "border-gray-100"}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: o.masterColor ?? "#DC2626" }}>
                        {o.masterInitials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="font-extrabold text-gray-900 text-sm">{o.masterName}</p>
                          <StatusBadge status={o.status} />
                        </div>
                        <p className="text-red-600 font-extrabold text-base mt-0.5">{fmtMoney(o.price)}</p>
                        {o.completionDurationMinutes ? <p className="text-xs text-gray-500 mt-0.5">⏱ {o.completionDurationMinutes} daqiqa</p> : null}
                        {o.message && <p className="text-sm text-gray-700 mt-2 leading-relaxed">{o.message}</p>}
                        {Array.isArray((o as any).fileUrls) && (o as any).fileUrls.length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {((o as any).fileUrls as string[]).slice(0, 3).map((url: string, i: number) => (
                              <img key={i} src={url} alt="" className="w-14 h-14 object-cover rounded-xl border border-gray-200" />
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-[11px] text-gray-400">{timeAgo(o.createdAt)}</p>
                          <div className="flex items-center gap-1">
                            {o.status === "pending" && (
                              <>
                                <button onClick={() => onAcceptOffer(o.id, r.id)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 border border-emerald-200 transition-colors">
                                  <Check className="w-3 h-3" /> Qabul
                                </button>
                                <button onClick={() => onRejectOffer(o.id)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold hover:bg-rose-100 border border-rose-200 transition-colors">
                                  <X className="w-3 h-3" /> Rad
                                </button>
                              </>
                            )}
                            <button onClick={() => onRemoveOffer(o.id)}
                              className="p-1.5 rounded-lg bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors border border-gray-200">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── TIMELINE ── */}
            {tab === "timeline" && (
              <div className="space-y-3">
                {timeline.map((ev, i) => (
                  <div key={i} className="flex gap-4 items-start">
                    <div className="flex flex-col items-center">
                      <span className="text-xl">{ev.icon}</span>
                      {i < timeline.length - 1 && <div className="w-px h-6 bg-gray-200 mt-1" />}
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-semibold text-gray-800">{ev.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(ev.time)}</p>
                    </div>
                  </div>
                ))}
                {timeline.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-8">Faoliyat yo'q</p>
                )}
              </div>
            )}

            {/* ── CHAT ── */}
            {tab === "chat" && (
              <div>
                {!chat || chat.messages.length === 0 ? (
                  <div className="text-center py-10">
                    <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm font-semibold">Suhbat topilmadi</p>
                    <p className="text-gray-300 text-xs mt-1">Bu so'rov bo'yicha hali suhbat boshlangan emas</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wide mb-3">
                      {chat.masterName ?? "Ijrochi"} ↔ {r.customerName ?? "Mijoz"} · {chat.messages.length} xabar
                    </p>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {chat.messages.map((msg) => {
                        if (msg.sender === "system") return (
                          <div key={msg.id} className="text-center">
                            <span className="text-[11px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{msg.text}</span>
                          </div>
                        );
                        const isCustomer = msg.sender === "customer";
                        return (
                          <div key={msg.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[70%] rounded-2xl overflow-hidden text-sm ${isCustomer ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                              <div className="px-3 pt-2 pb-0.5">
                                <p className="text-[10px] font-bold opacity-60">{isCustomer ? (r.customerName ?? "Mijoz") : (chat.masterName ?? "Ijrochi")}</p>
                              </div>
                              {msg.attachment?.type === "image" && (
                                <img src={msg.attachment.url} alt="" className="max-w-full" style={{ display: "block" }} />
                              )}
                              <div className="px-3 pb-2">
                                {msg.text && <p style={{ whiteSpace: "pre-wrap" }}>{msg.text}</p>}
                                <p className="text-[10px] mt-1 opacity-50 text-right">{timeAgo(msg.timestamp)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── METRICS ── */}
            {tab === "metrics" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <MktMetricCard label="Jami takliflar" value={offers.length.toString()} unit="ta" color="text-red-600" />
                  <MktMetricCard label="O'rtacha narx" value={offers.length > 0 ? fmtMoney(Math.round(avgPrice)) : "—"} color="text-amber-600" />
                  <MktMetricCard label="Eng arzon taklif" value={offers.length > 0 ? fmtMoney(minPrice) : "—"} color="text-emerald-600" />
                  <MktMetricCard label="Eng qimmat taklif" value={offers.length > 0 ? fmtMoney(maxPrice) : "—"} color="text-violet-600" />
                </div>
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3">Javob ko'rsatkichlari</p>
                  <div className="space-y-2">
                    {[
                      {
                        label: "Birinchi taklifgacha vaqt",
                        value: firstOfferMs !== null
                          ? firstOfferMs < 3_600_000
                            ? `${Math.round(firstOfferMs / 60_000)} daqiqa`
                            : `${Math.round(firstOfferMs / 3_600_000)} soat`
                          : "—"
                      },
                      { label: "Qabul qilingan takliflar", value: `${offers.filter((o) => o.status === "accepted").length} / ${offers.length}` },
                      { label: "Rad etilgan takliflar", value: String(offers.filter((o) => o.status === "rejected").length) },
                      { label: "So'rov holati", value: r.status === "completed" ? "Tugallangan ✅" : r.status === "accepted" ? "Qabul qilingan" : r.status === "cancelled" ? "Bekor qilingan" : "Ochiq" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between text-sm gap-3">
                        <span className="text-gray-500">{label}</span>
                        <span className="font-bold text-gray-800 text-right">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ── Main Marketplace Section ─────────────────────────────────────── */
function MarketplaceSection({ refreshKey }: { refreshKey: number }) {
  const [view, setView] = useState<"table" | "kanban">("table");
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [offers, setOffers] = useState<BuyerOffer[]>([]);
  const [chats, setChats] = useState<AdminChatRow[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "offers" | "budget">("newest");
  const [showExceptions, setShowExceptions] = useState(false);
  const [commandId, setCommandId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getAllRequestsAdmin(), getAllOffersAdmin(), getAllChatsAdmin()]).then(([reqs, ofrs, cts]) => {
      setRequests(reqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setOffers(ofrs);
      setChats(cts);
    }).catch((err) => console.error("Load marketplace data failed:", err));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const offersFor = (requestId: string) => offers.filter((o) => o.requestId === requestId);
  const chatFor = (requestId: string) => chats.find((c) => c.requestId === requestId);

  async function acceptOffer(offerId: string, requestId: string) {
    await updateOfferStatus(offerId, "accepted");
    load();
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADMIN_ACCEPT_OFFER", category: "marketplace", targetId: offerId, targetType: "offer", description: "Taklif qabul qilindi", metadata: { requestId } });
  }
  async function rejectOffer(offerId: string) {
    await updateOfferStatus(offerId, "rejected");
    load();
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADMIN_REJECT_OFFER", category: "marketplace", targetId: offerId, targetType: "offer", description: "Taklif rad etildi" });
  }
  async function removeOffer(offerId: string) {
    if (!confirm("Bu taklifni o'chirishni tasdiqlaysizmi?")) return;
    await adminDeleteOffer(offerId);
    load();
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADMIN_REMOVE_OFFER", category: "marketplace", targetId: offerId, targetType: "offer", description: "Taklif o'chirildi" });
  }
  async function updateRequestStatus(reqId: string, status: CustomerRequest["status"]) {
    await adminSetRequestStatus(reqId, status);
    load();
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADMIN_UPDATE_REQUEST", category: "marketplace", targetId: reqId, targetType: "request", description: `So'rov statusi yangilandi: ${status}`, metadata: { newStatus: status } });
  }
  async function deleteRequest(reqId: string) {
    if (!confirm("Bu so'rovni o'chirish tasdiqlaysizmi?\nBog'liq takliflar va suhbatlar ham o'chiriladi, ijrochilarga Tanga qaytariladi.")) return;
    await deleteRequestCascade(reqId);
    load();
    if (commandId === reqId) setCommandId(null);
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADMIN_DELETE_REQUEST", category: "marketplace", targetId: reqId, targetType: "request", description: "So'rov o'chirildi (cascade)" });
  }

  /* ── Build rows ── */
  const allRows: MktRow[] = requests.map((r) => {
    const ro = offersFor(r.id);
    return {
      request: r,
      offers: ro,
      acceptedOffer: ro.find((o) => o.status === "accepted"),
      col: mktKanbanCol(r, ro),
      chat: chatFor(r.id),
    };
  });

  const exceptionRows = allRows.filter((r) => r.col === "problem");

  let filtered = showExceptions ? exceptionRows : allRows;
  filtered = filtered.filter((r) => {
    const q = search.toLowerCase();
    const req = r.request;
    const name = (req.customerName ?? "").toLowerCase();
    return (
      (!q || req.categoryName.toLowerCase().includes(q) || req.id.includes(q) || name.includes(q))
      && (filterStatus === "all" || req.status === filterStatus)
      && (filterCat === "all" || req.categoryName === filterCat)
    );
  });
  if (sortBy === "offers")  filtered = [...filtered].sort((a, b) => b.offers.length - a.offers.length);
  if (sortBy === "budget")  filtered = [...filtered].sort((a, b) => ((b.request.answers["budget"] as number) || 0) - ((a.request.answers["budget"] as number) || 0));

  const commandRow = commandId ? allRows.find((r) => r.request.id === commandId) ?? null : null;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">Bozor markazi</h2>
          <p className="text-sm text-gray-500">
            {filtered.length} / {allRows.length} ta so'rov · {offers.length} ta taklif
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {exceptionRows.length > 0 && (
            <button
              onClick={() => setShowExceptions((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                showExceptions
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100"
              }`}
            >
              <TriangleAlert className="w-3.5 h-3.5" />
              Muammoli ({exceptionRows.length})
            </button>
          )}
          <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden">
            {(["table", "kanban"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${view === v ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                {v === "table" ? <><ClipboardList className="w-3.5 h-3.5" /> Jadval</> : <><LayoutGrid className="w-3.5 h-3.5" /> Kanban</>}
              </button>
            ))}
          </div>
          <button onClick={load} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Pipeline stats strip ── */}
      <div className="grid grid-cols-5 gap-2">
        {KANBAN_COL_DEFS.map((col) => {
          const count = allRows.filter((r) => r.col === col.key).length;
          return (
            <button key={col.key}
              onClick={() => { setShowExceptions(false); setFilterStatus("all"); }}
              className={`rounded-xl border p-2.5 text-left hover:shadow-sm transition-all ${col.bg} ${col.border}`}>
              <p className={`text-lg font-extrabold ${col.color}`}>{count}</p>
              <p className="text-[10px] text-gray-500 font-semibold truncate">{col.label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Toifa, mijoz yoki ID..."
            className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputCls}>
          <option value="all">Barcha holatlar</option>
          <option value="open">Ochiq</option>
          <option value="accepted">Qabul</option>
          <option value="completed">Tugallangan</option>
          <option value="cancelled">Bekor</option>
        </select>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className={inputCls}>
          <option value="all">Barcha toifalar</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={inputCls}>
          <option value="newest">Yangi avval</option>
          <option value="offers">Ko'p takliflar</option>
          <option value="budget">Yuqori byudjet</option>
        </select>
      </div>

      {/* ── Exception banner ── */}
      {showExceptions && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
          <TriangleAlert className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-rose-700">Muammoli holatlar filtri yoqilgan</p>
            <p className="text-xs text-rose-500">Taklif olmagan (1+ soat) va bekor qilingan so'rovlar ko'rsatilmoqda</p>
          </div>
          <button onClick={() => setShowExceptions(false)} className="ml-auto text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Main view ── */}
      {view === "table"
        ? <MarketplaceTable rows={filtered} onOpen={setCommandId} onDelete={deleteRequest} />
        : <MarketplaceKanban rows={filtered} onOpen={setCommandId} />
      }

      {/* ── Command Center Modal ── */}
      <AnimatePresence>
        {commandRow && (
          <RequestCommandCenter
            key={commandId!}
            row={commandRow}
            onClose={() => setCommandId(null)}
            onAcceptOffer={acceptOffer}
            onRejectOffer={rejectOffer}
            onRemoveOffer={removeOffer}
            onUpdateStatus={updateRequestStatus}
            onDelete={deleteRequest}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── UsersSection — Advanced Control Center ─────────────────────── */
type RoleFilter     = "all" | "provider" | "customer" | "both";
type ActivityFilter = "all" | "new7d" | "active7d" | "inactive30d";
type PerfFilter     = "all" | "top" | "low" | "nojobs";
type RiskFilter     = "all" | "flagged" | "suspended";
type ReferralFilter = "all" | "top" | "none";

function UsersSection({ refreshKey, onGoToFeedback, openUserId, onOpenUserIdConsumed }: {
  refreshKey: number;
  onGoToFeedback?: (userId: string) => void;
  openUserId?: string | null;
  onOpenUserIdConsumed?: () => void;
}) {
  const [users, setUsers]                     = useState<AdminUser[]>([]);
  const [search, setSearch]                   = useState("");
  const [filterRole, setFilterRole]           = useState<RoleFilter>("all");
  const [filterActivity, setFilterActivity]   = useState<ActivityFilter>("all");
  const [filterPerf, setFilterPerf]           = useState<PerfFilter>("all");
  const [filterRisk, setFilterRisk]           = useState<RiskFilter>("all");
  const [filterReferral, setFilterReferral]   = useState<ReferralFilter>("all");
  const [filterCats, setFilterCats]           = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser]       = useState<AdminUser | null>(null);
  const [txUserId, setTxUserId]               = useState<string | null>(null);
  const [txUserName, setTxUserName]           = useState<string>("");
  const [txUserBalance, setTxUserBalance]     = useState<number>(0);

  /* Auto-open detail modal when navigated here from another section */
  useEffect(() => {
    if (!openUserId) return;
    const target = users.find(u => u.userId === openUserId);
    if (target) {
      setSelectedUser(target);
      onOpenUserIdConsumed?.();
    }
  }, [openUserId, users]);

  const load = useCallback(() => {
    (async () => {
    let backendUsers: BackendAdminUser[] = [];
    try {
      backendUsers = (await fetchAdminUsers()).users;
    } catch (err) {
      console.error("Load admin users failed:", err);
    }
    let reportCountByUser = new Map<string, number>();
    try {
      const allReports = await getAllReports();
      reportCountByUser = allReports.reduce((m, r) => m.set(r.reportedUserId, (m.get(r.reportedUserId) ?? 0) + 1), new Map<string, number>());
    } catch (err) {
      console.error("Load reports for user counts failed:", err);
    }

    let allOffers: BuyerOffer[] = [];
    let allRequests: CustomerRequest[] = [];
    try {
      [allOffers, allRequests] = await Promise.all([getAllOffersAdmin(), getAllRequestsAdmin()]);
    } catch (err) {
      console.error("Load marketplace data for user list failed:", err);
    }
    const registry    = readKey<Record<string, { name: string; initials: string }>>(
      "hormang_customer_registry", {}
    );

    /* ── Phone registry — populated on every user login ── */
    const phoneRegistry = getPhoneRegistry();

    /* ── Step 1a: Seed user map from the real backend `users` table — shared
       server-truth across every admin/browser, unlike the old per-browser
       `hormang_auth_users` cache. A user marked role="provider" here MUST
       appear as a provider in admin, even if they have not yet posted an offer. */
    const userMap = new Map<string, AdminUser>();

    for (const bu of backendUsers) {
      const fullName = `${bu.firstName ?? ""} ${bu.lastName ?? ""}`.trim();
      const initials = ((bu.firstName?.[0] ?? "") + (bu.lastName?.[0] ?? "")).toUpperCase()
                    || fullName[0]?.toUpperCase() || "U";
      const isProvider = bu.role === "provider";
      userMap.set(bu.id, {
        userId:    bu.id,
        name:      fullName || (isProvider ? "Ijrochi" : "Mijoz"),
        initials,
        color:     isProvider ? "#7C3AED" : "#2563EB",
        role:      isProvider ? "provider" : "customer",
        phone:     bu.phone ?? phoneRegistry[bu.id],
        joinedAt:  bu.createdAt,
        status:    bu.suspended ? "suspended" : "active",
        verified:    bu.verified,
        flagCount:   bu.flagCount,
        tags:        bu.tags,
        adminNotes:  bu.adminNotes,
        tangaBalance: bu.balance,
        offerCount:    isProvider ? 0 : undefined,
        acceptedCount: isProvider ? 0 : undefined,
        avgResponseTime: isProvider ? 0 : undefined,
      });
    }

    /* ── Step 1b: Enrich/seed from offers (canonical provider activity source) ── */
    for (const offer of allOffers) {
      if (!offer.masterId) continue;
      let p = userMap.get(offer.masterId);
      if (!p) {
        p = {
          userId:    offer.masterId,
          name:      offer.masterName   ?? "Ijrochi",
          initials:  offer.masterInitials ?? offer.masterName?.[0] ?? "I",
          color:     offer.masterColor  ?? "#7C3AED",
          role:      "provider",
          offerCount:    0,
          acceptedCount: 0,
          avgResponseTime: 0,
          phone:     phoneRegistry[offer.masterId],
          status:    "active",
        };
        userMap.set(offer.masterId, p);
      } else {
        // User exists from auth — make sure they're flagged as a provider
        if (p.role === "customer") p.role = "both";
        else if (!p.role) p.role = "provider";
        if (p.offerCount === undefined) p.offerCount = 0;
        if (p.acceptedCount === undefined) p.acceptedCount = 0;
        if (p.avgResponseTime === undefined) p.avgResponseTime = 0;
      }
      p.offerCount    = (p.offerCount ?? 0) + 1;
      if (offer.status === "accepted") p.acceptedCount = (p.acceptedCount ?? 0) + 1;
      if (offer.avgResponseTime) {
        p.avgResponseTime = Math.round(
          ((p.avgResponseTime ?? 0) * ((p.offerCount ?? 1) - 1) + offer.avgResponseTime) / (p.offerCount ?? 1)
        );
      }
    }
    // Compute completionPct
    for (const p of userMap.values()) {
      if (p.offerCount && p.offerCount > 0) {
        p.completionPct = Math.round(((p.acceptedCount ?? 0) / p.offerCount) * 100);
      }
    }

    /* ── Step 2: Enrich providers with LocalProfile data (serviceAreas, joinedAt) ──
       Real key (lib/local-profile.ts): `user_<userId>_localProfile` */
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i);
      if (!lsKey?.startsWith("user_") || !lsKey.endsWith("_localProfile")) continue;
      try {
        const raw = localStorage.getItem(lsKey);
        if (!raw) continue;
        const lp = JSON.parse(raw) as {
          serviceAreas?: string[]; serviceAreaV2?: AdminUser["serviceAreaV2"];
          region?: string; district?: string;
          categories?: string[];
          createdAt?: string; photoUrl?: string;
        };
        const uid_ = lsKey.slice("user_".length, -("_localProfile".length));
        const u_ = userMap.get(uid_);
        if (u_) {
          u_.serviceAreas  = lp.serviceAreas ?? (lp.region ? [lp.region] : undefined);
          u_.serviceAreaV2 = lp.serviceAreaV2;
          u_.joinedAt      = u_.joinedAt ?? lp.createdAt;
          u_.location      = u_.location ?? lp.district ?? lp.region;
          if (lp.categories?.length) u_.categories = lp.categories;
          // Categories present → ensure role reflects provider access
          if (lp.categories?.length && u_.role === "customer") u_.role = "both";
        }
      } catch { /* skip */ }
    }

    /* ── Step 3: Customer registry → enrich customers / upgrade to "both" ── */
    const result: AdminUser[] = [];

    for (const [userId, entry] of Object.entries(registry)) {
      const custRequests = allRequests.filter((r) => r.customerId === userId);
      const location     = custRequests.length > 0
        ? (custRequests[0].district ?? custRequests[0].region ?? locationFrom(custRequests[0].answers))
        : undefined;

      const existing = userMap.get(userId);
      if (existing) {
        // User already known (auth store or offers). If they show up in
        // customer registry too, they have customer activity → expand role.
        if (existing.role === "provider") existing.role = "both";
        existing.requestCount = custRequests.length;
        existing.location     = existing.location ?? location;
        existing.phone        = existing.phone ?? phoneRegistry[userId];
        existing.name         = existing.name && existing.name !== "Ijrochi" && existing.name !== "Mijoz"
          ? existing.name
          : (entry.name ?? existing.name);
      }
      // Note: deliberately does NOT fabricate a new user purely from this
      // browser's local registry cache — the backend user list (already
      // seeded above) is the sole source of truth for who actually exists.
      // A stale local-only entry here previously resurrected deleted users
      // as phantom rows in the admin panel.
    }

    // Also enrich customers (from auth store) with their request counts
    for (const u of userMap.values()) {
      if (u.requestCount === undefined) {
        const reqs = allRequests.filter((r) => r.customerId === u.userId);
        if (reqs.length > 0) {
          u.requestCount = reqs.length;
          u.location = u.location ?? reqs[0].district ?? reqs[0].region ?? locationFrom(reqs[0].answers);
          if (u.role === "provider") u.role = "both";
        }
      }
    }

    result.push(...userMap.values());

    /* ── Step 4/5: Enrich all users with real referral data (referrals table —
       rewarding now happens server-side via POST /wallet/referral-reward,
       called by the invitee themselves right after their profile completes,
       so there's nothing left to retroactively process here). ── */
    let allReferrals: BackendReferral[] = [];
    try {
      allReferrals = (await fetchAdminReferrals()).referrals;
    } catch (err) {
      console.error("Load referrals failed:", err);
    }
    const nameById = new Map(result.map((u) => [u.userId, u.name] as const));
    const referrerByInvitee = new Map(allReferrals.map((r) => [r.inviteeId, r.referrerId] as const));
    for (const u of result) {
      u.referralCode = getReferralCode(u.userId);
      const rewarded = allReferrals.filter((r) => r.referrerId === u.userId && r.rewarded);
      u.referralCount = rewarded.length;
      u.referralEarned = rewarded.length * TANGA_PER_REFERRAL;
      u.referralInvitees = rewarded.map((r) => ({ userId: r.inviteeId, completedAt: r.createdAt }));
      const inviterId = referrerByInvitee.get(u.userId);
      if (inviterId) {
        u.referredBy = nameById.get(inviterId) ?? getReferralCode(inviterId);
      }
    }

    /* ── Step 6: Feedback counts per user ── */
    let allFeedbacks: FeedbackEntry[] = [];
    try {
      allFeedbacks = await getAllFeedbacks();
    } catch (err) {
      console.error("Load feedbacks for user counts failed:", err);
    }
    for (const u of result) {
      const uFbs = allFeedbacks.filter(f => f.userId === u.userId);
      if (uFbs.length > 0) {
        (u as AdminUser & { feedbackCount?: number; feedbackComplaints?: number }).feedbackCount = uFbs.length;
        (u as AdminUser & { feedbackComplaints?: number }).feedbackComplaints = uFbs.filter(f => f.type === "complaint").length;
      }
    }

    /* ── Step 7: Profile completion reward status ── */
    for (const u of result) {
      try {
        const raw = localStorage.getItem(`hormang_profile_reward_${u.userId}`);
        if (raw) {
          const r = JSON.parse(raw) as { granted?: boolean; grantedAt?: string };
          u.profileRewardGranted  = r.granted === true;
          u.profileRewardGrantedAt = r.grantedAt;
        }
      } catch { /* skip */ }
    }

    for (const u of result) u.reportCount = reportCountByUser.get(u.userId) ?? 0;

    setUsers(result.sort((a, b) => {
      // providers + both first, then customers; within groups alphabetical
      const roleOrder = { both: 0, provider: 1, customer: 2 };
      const diff = roleOrder[a.role] - roleOrder[b.role];
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    }));
    })();
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  /* ── Actions ── */
  async function toggleSuspend(userId: string) {
    const u = users.find((x) => x.userId === userId);
    const nextSuspended = u?.status !== "suspended";
    try {
      await setUserSuspendedBackend(userId, nextSuspended);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: nextSuspended ? "SUSPEND_USER" : "RESTORE_USER", category: "admin", targetId: userId, targetType: "user", description: `${u?.name ?? userId} ${nextSuspended ? "to'xtatildi" : "faollashtirildi"}`, metadata: { userName: u?.name, suspended: nextSuspended } });
      load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(`"${user.name}" foydalanuvchisini o'chirishni tasdiqlaysizmi?\nUning so'rovlari, takliflari, suhbatlari va Tanga balansi ham yo'qotiladi. Bu amalni qaytarib bo'lmaydi.`)) return;

    try {
      await deleteUserBackend(user.userId);
    } catch (err) {
      console.error("Backend user delete failed:", err);
    }
    // Cascading delete of every per-user local key + shared rows (offers/requests/chats —
    // still local-only, Phase D territory).
    deleteUserDataCascade(user.userId);

    setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "DELETE_USER", category: "risk", targetId: user.userId, targetType: "user", description: `${user.name} o'chirildi (cascade)`, metadata: { userName: user.name } });
  }

  /* ── Category pill toggle ── */
  function toggleCat(cat: string) {
    setFilterCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  const enriched = users;

  /* ── Filtering ── */
  const now7  = Date.now() - 7  * 24 * 60 * 60 * 1000;
  const now30 = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const filtered = enriched.filter((u) => {
    const q = search.toLowerCase().trim();
    if (q) {
      const inTags = (u.tags ?? []).some((t) => t.includes(q));
      if (!u.name.toLowerCase().includes(q) && !u.userId.includes(q) && !(u.phone?.includes(q)) && !inTags) return false;
    }
    if (filterRole !== "all" && u.role !== filterRole) return false;
    /* Activity */
    const joinedMs = u.joinedAt ? new Date(u.joinedAt).getTime() : 0;
    if (filterActivity === "new7d"      && joinedMs < now7)  return false;
    if (filterActivity === "inactive30d" && joinedMs > now30) return false;
    if (filterActivity === "active7d"   && joinedMs < now7)  return false;
    /* Performance */
    if (filterPerf === "top"    && (u.rating === undefined || u.rating < 4.5))         return false;
    if (filterPerf === "low"    && (u.rating === undefined || u.rating >= 3))           return false;
    if (filterPerf === "nojobs" && (u.offerCount ?? 0) > 0)                            return false;
    /* Risk */
    if (filterRisk === "flagged"   && (u.flagCount ?? 0) === 0)    return false;
    if (filterRisk === "suspended" && u.status !== "suspended")     return false;
    /* Referral */
    if (filterReferral === "top"  && (u.referralCount ?? 0) < 3)   return false;
    if (filterReferral === "none" && (u.referralCount ?? 0) > 0)   return false;
    if (filterCats.size > 0 && !([...filterCats].some((c) => u.categories?.includes(c)))) return false;
    return true;
  });

  /* ── Metrics ── */
  const providerCount  = enriched.filter((u) => u.role === "provider" || u.role === "both").length;
  const customerCount  = enriched.filter((u) => u.role === "customer" || u.role === "both").length;
  const verifiedCount  = enriched.filter((u) => u.verified).length;
  const flaggedCount   = enriched.filter((u) => (u.flagCount ?? 0) > 0).length;
  const suspCount      = enriched.filter((u) => u.status === "suspended").length;
  const newThisWeek    = enriched.filter((u) => u.joinedAt && new Date(u.joinedAt).getTime() > now7).length;

  /* ── Smart alerts ── */
  const alerts: { label: string; count: number; color: string }[] = [];
  if (flaggedCount > 0)  alerts.push({ label: `${flaggedCount} ta flaglangan foydalanuvchi`, count: flaggedCount, color: "text-rose-700 bg-rose-50 border-rose-200" });
  if (suspCount > 0)     alerts.push({ label: `${suspCount} ta to'xtatilgan akkaunt`, count: suspCount, color: "text-orange-700 bg-orange-50 border-orange-200" });
  const noJobProviders = enriched.filter((u) => (u.role === "provider" || u.role === "both") && (u.offerCount ?? 0) === 0).length;
  if (noJobProviders > 0) alerts.push({ label: `${noJobProviders} ta ijrochi hali taklif bermagan`, count: noJobProviders, color: "text-amber-700 bg-amber-50 border-amber-200" });

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">Foydalanuvchilar Boshqaruvi</h2>
          <p className="text-sm text-gray-500 mt-0.5">Kengaytirilgan nazorat markazi</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors border border-red-100 flex-shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Yangilash
        </button>
      </div>

      {/* ── Metrics bar ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "Jami",        value: enriched.length,  color: "text-gray-900",     icon: <Users className="w-4 h-4 text-gray-400" /> },
          { label: "Ijrochilar",  value: providerCount,    color: "text-violet-700",   icon: <Zap className="w-4 h-4 text-violet-400" /> },
          { label: "Mijozlar",  value: customerCount,    color: "text-blue-700",     icon: <Activity className="w-4 h-4 text-blue-400" /> },
          { label: "Tasdiqlangan",value: verifiedCount,    color: "text-teal-700",     icon: <UserCheck className="w-4 h-4 text-teal-400" /> },
          { label: "Flaglangan",  value: flaggedCount,     color: "text-rose-700",     icon: <Flag className="w-4 h-4 text-rose-400" /> },
          { label: "Yangi (7k)",  value: newThisWeek,      color: "text-emerald-700",  icon: <Star className="w-4 h-4 text-emerald-400" /> },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{m.label}</span>
              {m.icon}
            </div>
            <span className={`text-xl font-extrabold ${m.color}`}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* ── Smart alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-semibold ${a.color}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {a.label}
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, telefon, ID yoki teg bo'yicha qidirish..."
            className={`${inputCls} w-full pl-9`} />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-2">
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value as RoleFilter)} className={inputCls}>
            <option value="all">Barcha rollar</option>
            <option value="provider">Ijrochilar</option>
            <option value="customer">Mijozlar</option>
            <option value="both">Ikkalasi ham</option>
          </select>
          <select value={filterActivity} onChange={(e) => setFilterActivity(e.target.value as ActivityFilter)} className={inputCls}>
            <option value="all">Barcha faollik</option>
            <option value="new7d">Yangi (7 kun)</option>
            <option value="active7d">Faol (7 kun)</option>
            <option value="inactive30d">Inaktiv (30+ kun)</option>
          </select>
          <select value={filterPerf} onChange={(e) => setFilterPerf(e.target.value as PerfFilter)} className={inputCls}>
            <option value="all">Barcha samaradorlik</option>
            <option value="top">Top (4.5+ reyting)</option>
            <option value="low">Past (&lt;3 reyting)</option>
            <option value="nojobs">Ishsiz ijrochilar</option>
          </select>
          <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value as RiskFilter)} className={inputCls}>
            <option value="all">Barcha risk</option>
            <option value="flagged">Flaglangan</option>
            <option value="suspended">To'xtatilgan</option>
          </select>
          <select value={filterReferral} onChange={(e) => setFilterReferral(e.target.value as ReferralFilter)} className={inputCls}>
            <option value="all">Barcha referral</option>
            <option value="top">Top (3+ taklif)</option>
            <option value="none">Referal yo'q</option>
          </select>
          {(filterActivity !== "all" || filterPerf !== "all" || filterRisk !== "all" || filterReferral !== "all" || filterCats.size > 0 || filterRole !== "all") && (
            <button onClick={() => {
              setFilterRole("all"); setFilterActivity("all"); setFilterPerf("all");
              setFilterRisk("all"); setFilterReferral("all"); setFilterCats(new Set()); setSearch("");
            }} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-500 text-xs font-bold hover:bg-gray-200 transition-colors">
              Filtrni tozalash ✕
            </button>
          )}
        </div>

        {/* Category pills (provider-relevant) */}
        {(filterRole === "all" || filterRole === "provider" || filterRole === "both") && (
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => {
              const active = filterCats.has(cat);
              return (
                <button key={cat} onClick={() => toggleCat(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                    active
                      ? "bg-red-600 text-white border-red-600 shadow-sm"
                      : "bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600"
                  }`}>
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold text-base">
              {enriched.length === 0 ? "Hali foydalanuvchilar yo'q" : "Topilmadi"}
            </p>
            <p className="text-gray-300 text-sm mt-1.5">
              {enriched.length === 0
                ? "Tizimga kirgan foydalanuvchilar bu yerda ko'rinadi"
                : "Qidiruv yoki filtrlash parametrlarini o'zgartiring"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/40">
                  {[
                    "Foydalanuvchi", "Rol", "Kontakt",
                    "Samaradorlik", "Murojaatlar 💬", "Tanga 🪙", "Profil bonusi 🎖", "Referral 🔗",
                    "Risk", "Teglar", "Holat", "Amallar",
                  ].map((h) => (
                    <th key={h} className="text-left text-[9px] font-bold text-red-400 uppercase tracking-widest px-3 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u) => {
                  const avatarBg =
                    u.role === "both"     ? "bg-gradient-to-br from-violet-500 to-blue-500 text-white"
                    : u.role === "provider" ? "bg-violet-100 text-violet-700"
                    :                        "bg-blue-100 text-blue-700";
                  const tangaBal = u.tangaBalance ?? 0;
                  return (
                    <tr key={u.userId}
                      className="hover:bg-red-50/20 transition-colors group cursor-pointer"
                      onClick={() => setSelectedUser(u)}>

                      {/* User */}
                      <td className="px-3 py-3 min-w-[160px]">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 ${avatarBg}`}>
                            {u.initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <p className="font-semibold text-gray-800 text-[12px] leading-tight whitespace-nowrap">{u.name}</p>
                              {u.verified && <UserCheck className="w-3 h-3 text-teal-500 flex-shrink-0" />}
                            </div>
                            <p className="text-[9px] text-gray-400 font-mono">{u.userId.slice(0, 12)}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          {(u.role === "provider" || u.role === "both") && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-violet-50 text-violet-700 border-violet-100 w-fit">Ijrochi</span>
                          )}
                          {(u.role === "customer" || u.role === "both") && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-blue-50 text-blue-700 border-blue-100 w-fit">Mijoz</span>
                          )}
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-3 py-3">
                        {u.phone ? (
                          <div>
                            <p className="text-[11px] font-semibold text-gray-700 whitespace-nowrap">{u.phone}</p>
                            <p className={`text-[9px] font-bold ${u.phoneVerified ? "text-emerald-600" : "text-gray-300"}`}>
                              {u.phoneVerified ? "✓ Tasdiqlangan" : "Tasdiqlanmagan"}
                            </p>
                          </div>
                        ) : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>

                      {/* Performance */}
                      <td className="px-3 py-3">
                        {u.offerCount !== undefined ? (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-[10px] font-bold text-amber-600">
                                {u.rating ? `★ ${u.rating.toFixed(1)}` : "—"}
                              </span>
                              <span className="text-[9px] text-gray-400">({u.reviewCount ?? 0})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-semibold text-gray-600">{u.acceptedCount}/{u.offerCount}</span>
                              {u.completionPct !== undefined && (
                                <span className={`text-[9px] font-bold ${u.completionPct >= 70 ? "text-emerald-600" : u.completionPct >= 40 ? "text-amber-600" : "text-red-500"}`}>
                                  {u.completionPct}%
                                </span>
                              )}
                            </div>
                          </div>
                        ) : u.requestCount !== undefined ? (
                          <span className="text-[11px] font-semibold text-blue-600">{u.requestCount} so'rov</span>
                        ) : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>

                      {/* Murojaatlar (Feedback) */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const fc = (u as AdminUser & { feedbackCount?: number; feedbackComplaints?: number }).feedbackCount ?? 0;
                          const cc = (u as AdminUser & { feedbackComplaints?: number }).feedbackComplaints ?? 0;
                          if (fc === 0) return <span className="text-gray-200 text-[11px]">—</span>;
                          return (
                            <button
                              onClick={() => onGoToFeedback?.(u.userId)}
                              className="text-left group"
                            >
                              <p className="text-[11px] font-extrabold text-blue-600 group-hover:text-blue-800 transition-colors whitespace-nowrap">{fc} ta</p>
                              {cc >= 3 ? (
                                <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded whitespace-nowrap">⚠️ {cc} shikoyat</span>
                              ) : cc > 0 ? (
                                <p className="text-[9px] text-amber-600 font-semibold whitespace-nowrap">{cc} shikoyat</p>
                              ) : null}
                            </button>
                          );
                        })()}
                      </td>

                      {/* Tanga */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-[12px] font-extrabold ${tangaBal > 0 ? "text-amber-600" : "text-gray-300"}`}>
                            {tangaBal > 0 ? `${tangaBal} 🪙` : "—"}
                          </span>
                          {(u.role === "provider" || u.role === "both") && (
                            <button onClick={(e) => { e.stopPropagation(); setTxUserId(u.userId); setTxUserName(u.name); setTxUserBalance(u.tangaBalance ?? 0); }}
                              className="text-[9px] font-bold text-violet-600 hover:text-violet-800 underline whitespace-nowrap text-left">
                              Tarix
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Profile Reward */}
                      <td className="px-3 py-3">
                        {u.profileRewardGranted ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 whitespace-nowrap">
                              ✅ Berilgan
                            </span>
                            {u.profileRewardGrantedAt && (
                              <span className="text-[9px] text-gray-400">
                                {new Date(u.profileRewardGrantedAt).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap">⏳ Kutilmoqda</span>
                        )}
                      </td>

                      {/* Referral */}
                      <td className="px-3 py-3">
                        {(u.referralCount ?? 0) > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-extrabold text-emerald-600">{u.referralCount} ta</span>
                            <span className="text-[9px] text-amber-600 font-bold">+{u.referralEarned}🪙</span>
                            {(u.referralCount ?? 0) >= 3 && (
                              <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-600 border border-amber-200 w-fit">Top 🔥</span>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-[11px]">—</span>}
                      </td>

                      {/* Risk */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          {(u.flagCount ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-600 whitespace-nowrap">
                              <Flag className="w-2.5 h-2.5" /> Flaglangan
                            </span>
                          )}
                          {(u.reportCount ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 whitespace-nowrap">
                              <TriangleAlert className="w-2.5 h-2.5" /> {u.reportCount} shikoyat
                            </span>
                          )}
                          {(u.adminNotes ?? []).length > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-blue-500 whitespace-nowrap">
                              <StickyNote className="w-2.5 h-2.5" /> {(u.adminNotes ?? []).length} izoh
                            </span>
                          )}
                          {(u.flagCount ?? 0) === 0 && (u.reportCount ?? 0) === 0 && (u.adminNotes ?? []).length === 0 && (
                            <span className="text-gray-200 text-[11px]">—</span>
                          )}
                        </div>
                      </td>

                      {/* Tags */}
                      <td className="px-3 py-3 max-w-[100px]">
                        {(u.tags ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-0.5">
                            {(u.tags ?? []).slice(0, 2).map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[8px] font-bold">#{tag}</span>
                            ))}
                            {(u.tags ?? []).length > 2 && <span className="text-[8px] text-gray-400">+{(u.tags ?? []).length - 2}</span>}
                          </div>
                        ) : <span className="text-gray-200 text-[11px]">—</span>}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap ${
                          u.status === "suspended"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        }`}>{u.status === "suspended" ? "To'xtatilgan" : "Faol"}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelectedUser(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Batafsil">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => toggleSuspend(u.userId)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.status === "suspended"
                                ? "text-emerald-600 hover:bg-emerald-50"
                                : "text-orange-500 hover:bg-orange-50"
                            }`} title={u.status === "suspended" ? "Faollashtirish" : "To'xtatish"}>
                            {u.status === "suspended" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={async () => {
                            const cur = u.flagCount ?? 0;
                            try {
                              await setUserFlagCountBackend(u.userId, cur > 0 ? 0 : 1);
                              load();
                            } catch (err) {
                              alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
                            }
                          }} className={`p-1.5 rounded-lg transition-colors ${
                            (u.flagCount ?? 0) > 0 ? "text-rose-600 bg-rose-50 hover:bg-rose-100" : "text-gray-300 hover:text-rose-400 hover:bg-rose-50"
                          }`} title="Flag qo'yish / olib tashlash">
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteUser(u)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors" title="O'chirish">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Result count */}
      {enriched.length > 0 && (
        <p className="text-[11px] text-gray-400 text-right">
          {filtered.length} / {enriched.length} foydalanuvchi ko'rsatilmoqda
        </p>
      )}

      {/* Advanced User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <AdvancedUserDetailModal
            user={selectedUser}
            allUsers={users}
            onClose={() => { setSelectedUser(null); load(); }}
            onToggleSuspend={(u) => toggleSuspend(u.userId)}
            onDelete={deleteUser}
          />
        )}
      </AnimatePresence>

      {/* Tanga transactions modal */}
      <AnimatePresence>
        {txUserId && (
          <AdminUserTxModal
            userId={txUserId}
            userName={txUserName}
            balance={txUserBalance}
            onClose={() => setTxUserId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}


/* ─── Admin User Transactions Modal ─────────────────────────────────── */
function AdminUserTxModal({
  userId, userName, balance, onClose,
}: {
  userId: string; userName: string; balance: number; onClose: () => void;
}) {
  const [txs, setTxs] = useState<TangaTx[]>([]);
  const [allOffers, setAllOffers] = useState<BuyerOfferFull[]>([]);
  const totalSpent = txs.filter(txIsOfferSpend).reduce((s, t) => s + t.amount, 0);
  const [viewOfferId, setViewOfferId] = useState<string | null>(null);
  const viewedOffer = viewOfferId ? allOffers.find((o) => o.id === viewOfferId) : undefined;

  useEffect(() => {
    fetchWalletTransactions(userId)
      .then(({ transactions }) => setTxs(backendTxsToLocal(transactions)))
      .catch((err) => console.error("Load user transactions failed:", err));
    getAllOffersAdmin().then(setAllOffers).catch((err) => console.error("Load offers failed:", err));
  }, [userId]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex-1">
              <h2 className="font-extrabold text-base text-gray-900">{userName} — Tanga tarixi</h2>
              <p className="text-xs text-gray-400">{txs.length} ta tranzaksiya · Joriy balans: {balance} 🪙</p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stats */}
          <div className="px-5 py-3 border-b border-gray-50 grid grid-cols-3 gap-3 flex-shrink-0">
            <div className="text-center">
              <p className="text-[10px] text-gray-400">Balans</p>
              <p className="font-extrabold text-amber-600 text-base">{balance} 🪙</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-400">Jami sarflandi</p>
              <p className="font-extrabold text-red-600 text-base">{totalSpent} 🪙</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-400">Tranzaksiyalar</p>
              <p className="font-extrabold text-gray-700 text-base">{txs.length}</p>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {txs.length === 0 ? (
              <div className="text-center py-10">
                <div className="flex justify-center mb-2"><TangaCoin size="lg" /></div>
                <p className="text-gray-400 font-semibold text-sm">Hali tranzaksiyalar yo'q</p>
              </div>
            ) : (
              <div className="space-y-2">
                {txs.map((tx) => {
                  const offer  = allOffers.find((o) => o.id === tx.offerId);
                  const signed = txSignedAmount(tx);
                  const isIn   = signed >= 0;
                  return (
                    <div key={tx.id} className="bg-gray-50 rounded-xl p-3 flex items-center gap-3 border border-gray-100">
                      <CategoryIcon categoryId={null} emoji={tx.categoryEmoji || "📋"} size={28} shape="square" className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-xs truncate">{tx.categoryName}</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(tx.createdAt).toLocaleDateString("uz-UZ")}&ensp;
                          {new Date(tx.createdAt).toLocaleTimeString("uz-Latn-UZ", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`font-extrabold text-sm flex-shrink-0 ${isIn ? "text-emerald-600" : "text-amber-600"}`}>
                        {isIn ? "+" : "−"}{Math.abs(signed)} <TangaCoin size="xs" />
                      </span>
                      {offer && (
                        <button
                          onClick={() => setViewOfferId(offer.id)}
                          className="px-2 py-1 rounded-lg bg-violet-50 text-violet-600 text-[10px] font-bold hover:bg-violet-100 transition-colors border border-violet-100 flex-shrink-0">
                          Batafsil
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {viewedOffer && (
          <OfferDetailModal offer={viewedOffer} onClose={() => setViewOfferId(null)} readOnly />
        )}
      </AnimatePresence>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MONETIZATION — Token Economy Control Center
   ════════════════════════════════════════════════════════════════════ */

/* ─── Shared provider summary type ──────────────────────────────── */
type ProviderSummary = {
  userId: string; name: string; balance: number;
  totalPurchased: number; totalSpent: number; referralEarned: number; txCount: number;
};

/* ─── Backend ↔ local shape converters (real pricing_tiers/wallets/tanga_transactions tables) ─── */
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "tier";
}
function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function backendTierToLocal(t: BackendPricingTier): PricingTier {
  return {
    id: t.id,
    name: t.nameUz,
    credits: t.credits,
    price: t.priceSom,
    salePrice: t.salePrice ?? undefined,
    saleLimit: t.saleLimit ?? undefined,
    salePurchaseCount: t.salePurchaseCount,
    perUserLimit: t.perUserLimit ?? undefined,
    bonusTokens: t.bonusTokens || undefined,
    startsAt: t.startsAt ?? undefined,
    validUntil: t.validUntil ?? undefined,
    status: (t.status as PricingTier["status"]) ?? "active",
    visibilityTarget: (t.visibilityTarget as PricingTier["visibilityTarget"]) ?? "all",
    featured: t.featured || undefined,
    hotOffer: t.hotOffer || undefined,
    bonusPlan: t.bonusPlan || undefined,
    badge: t.badgeUz ?? undefined,
    badgeLocalized: t.badgeRu && t.badgeRu !== t.badgeUz ? { ru: t.badgeRu } : undefined,
    desc: t.descUz ?? "",
    descLocalized: t.descRu && t.descRu !== t.descUz ? { ru: t.descRu } : undefined,
    nameLocalized: t.nameRu && t.nameRu !== t.nameUz ? { ru: t.nameRu } : undefined,
    color: t.color ?? "bg-amber-50 text-amber-700",
    active: t.active,
  };
}
function backendWalletsToProviders(wallets: BackendWallet[], referrals: BackendReferral[] = []): ProviderSummary[] {
  const referralEarnedByUser = new Map<string, number>();
  for (const r of referrals) {
    if (!r.rewarded) continue;
    referralEarnedByUser.set(r.referrerId, (referralEarnedByUser.get(r.referrerId) ?? 0) + TANGA_PER_REFERRAL);
  }
  return wallets
    .filter((w) => w.role === "provider")
    .map((w) => ({
      userId: w.userId,
      name: `${w.firstName} ${w.lastName}`.trim() || `Ijrochi ${w.userId.slice(0, 6)}`,
      balance: w.balance,
      totalPurchased: w.totalPurchased,
      totalSpent: w.totalSpent,
      referralEarned: referralEarnedByUser.get(w.userId) ?? 0,
      txCount: w.txCount,
    }))
    .sort((a, b) => b.balance - a.balance);
}
function backendTxsToLocal(txs: BackendTangaTx[]): TangaTx[] {
  return txs.map((tx) => ({
    id: tx.id,
    userId: tx.userId,
    offerId: "",
    requestId: "",
    categoryName: tx.type === "purchase" ? (tx.tierName ?? "Tanga xaridi") : "Admin sozlamasi",
    categoryEmoji: tx.type === "purchase" ? "💳" : "🛡",
    description: tx.description ?? "",
    amount: tx.amount,
    type: tx.type,
    direction: tx.direction,
    priceSom: tx.priceSom ?? undefined,
    createdAt: tx.createdAt,
  }));
}

/* ─── Root MonetizationSection ───────────────────────────────────── */
function MonetizationSection({ refreshKey }: { refreshKey: number }) {
  type MonoTab = "overview" | "plans" | "transactions" | "balances" | "referral";
  const [monoTab, setMonoTab] = useState<MonoTab>("overview");
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [txs, setTxs]           = useState<TangaTx[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [referrals, setReferrals] = useState<BackendReferral[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  void refreshKey;

  const reload = useCallback(() => {
    (async () => {
      try {
        const [{ tiers: backendTiers }, { wallets }, { transactions }, { referrals }] = await Promise.all([
          fetchPricingTiers(), fetchAdminWallets(), fetchAllWalletTransactions(), fetchAdminReferrals(),
        ]);
        setTiers(backendTiers.map(backendTierToLocal));
        setProviders(backendWalletsToProviders(wallets, referrals));
        setTxs(backendTxsToLocal(transactions));
        setReferrals(referrals);
        setLoadError(null);
      } catch (err) {
        console.error("Load monetization data failed:", err);
        setLoadError(err instanceof AdminApiError ? err.message : "Ma'lumotlarni yuklab bo'lmadi");
      }
    })();
  }, []);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const TABS: { id: MonoTab; label: string; emoji: string }[] = [
    { id: "overview",     label: "Ko'rinish",      emoji: "📊" },
    { id: "plans",        label: "Rejalar",         emoji: "💳" },
    { id: "transactions", label: "Tranzaksiyalar",  emoji: "🪙" },
    { id: "balances",     label: "Balanslar",       emoji: "⚖️" },
    { id: "referral",     label: "Referral",        emoji: "🔗" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">💰 Token Iqtisodiyoti</h2>
          <p className="text-sm text-gray-500">Tanga oqimi · monetizatsiya · referral boshqaruvi</p>
        </div>
        <button onClick={reload} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors border border-red-100">
          <RefreshCw className="w-3.5 h-3.5" /> Yangilash
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setMonoTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
              monoTab === tab.id ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold text-red-700 bg-red-50 border-red-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {loadError}
        </div>
      )}

      {monoTab === "overview"     && <MonoOverview txs={txs} providers={providers} tiers={tiers} />}
      {monoTab === "plans"        && <MonoPlans tiers={tiers} txs={txs} reload={reload} />}
      {monoTab === "transactions" && <MonoTransactions txs={txs} reload={reload} />}
      {monoTab === "balances"     && <MonoBalances providers={providers} reload={reload} />}
      {monoTab === "referral"     && <MonoReferral providers={providers} referrals={referrals} />}
    </div>
  );
}

/* ─── Overview Tab ───────────────────────────────────────────────── */
function MonoOverview({ txs, providers, tiers }: { txs: TangaTx[]; providers: ProviderSummary[]; tiers: PricingTier[] }) {
  const [flowPeriod, setFlowPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [allOffers, setAllOffers] = useState<BuyerOffer[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  useEffect(() => {
    Promise.all([getAllOffersAdmin(), getAllRequestsAdmin()]).then(([ofrs, reqs]) => {
      setAllOffers(ofrs);
      setRequests(reqs);
    }).catch((err) => console.error("Load marketplace stats failed:", err));
  }, []);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo  = new Date(now.getTime() - 7 * 86400000);
  const monthStr = now.toISOString().slice(0, 7);

  /* Revenue = real money received from Tanga PLAN SALES (purchase transactions).
     For each purchase tx we use the so'm price actually paid. Older purchase txs
     created before priceSom was tracked fall back to looking up the tier by name. */
  const tierPriceByName = new Map<string, number>();
  tiers.forEach((t) => {
    const eff = t.salePrice !== undefined && t.salePrice < t.price ? t.salePrice : t.price;
    tierPriceByName.set(t.name, eff);
  });
  function txRevenueSom(tx: TangaTx): number {
    if (tx.type !== "purchase") return 0;
    if (typeof tx.priceSom === "number") return tx.priceSom;
    return tierPriceByName.get(tx.categoryName) ?? 0;
  }
  const purchases    = txs.filter((t) => t.type === "purchase");
  const totalRevenue = purchases.reduce((s, t) => s + txRevenueSom(t), 0);
  const todayRevenue = purchases.filter((t) => t.createdAt.startsWith(todayStr)).reduce((s, t) => s + txRevenueSom(t), 0);
  const weekRevenue  = purchases.filter((t) => new Date(t.createdAt) >= weekAgo).reduce((s, t) => s + txRevenueSom(t), 0);
  const monthRevenue = purchases.filter((t) => t.createdAt.startsWith(monthStr)).reduce((s, t) => s + txRevenueSom(t), 0);

  const totalSold  = txs.filter((t) => t.type === "purchase").reduce((s, t) => s + t.amount, 0);
  const totalSpent = txs.filter((t) => t.type === "spend" || (!t.type && t.amount > 0)).reduce((s, t) => s + t.amount, 0);
  const totalCirc  = providers.reduce((s, p) => s + p.balance, 0);

  const avgTangaPerProv = providers.length > 0 ? Math.round(totalCirc / providers.length) : 0;
  const avgOffersPerReq = requests.length > 0 ? (allOffers.length / requests.length).toFixed(1) : "—";
  const spendTxs        = txs.filter((t) => t.type === "spend" || (!t.type && t.amount > 0));
  const avgCostPerOffer = spendTxs.length > 0 ? Math.round(spendTxs.reduce((s, t) => s + t.amount, 0) / spendTxs.length) : 0;

  /* ── ISO week helper ─────────────────────────────────────────── */
  function isoWeekKey(dateStr: string): string {
    const d = new Date(dateStr);
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const wk = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
  }

  /* ── Build flow map grouped by selected period ────────────────── */
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const twelveWeeksAgo = new Date(now.getTime() - 84 * 86400000);

  const flowMap: Record<string, { sarflandi: number; sotildi: number; referral: number }> = {};
  for (const tx of txs) {
    const d = new Date(tx.createdAt);
    if (flowPeriod === "daily"   && d < thirtyDaysAgo)  continue;
    if (flowPeriod === "weekly"  && d < twelveWeeksAgo) continue;

    let key: string;
    if      (flowPeriod === "daily")   key = tx.createdAt.slice(0, 10);
    else if (flowPeriod === "weekly")  key = isoWeekKey(tx.createdAt);
    else if (flowPeriod === "yearly")  key = tx.createdAt.slice(0, 4);
    else                               key = tx.createdAt.slice(0, 7);

    if (!flowMap[key]) flowMap[key] = { sarflandi: 0, sotildi: 0, referral: 0 };
    if (tx.type === "spend" || (!tx.type && tx.amount > 0)) flowMap[key].sarflandi += tx.amount;
    if (tx.type === "purchase")  flowMap[key].sotildi  += tx.amount;
    if (tx.type === "referral")  flowMap[key].referral += tx.amount;
  }
  const flowData = Object.entries(flowMap).sort(([a], [b]) => a.localeCompare(b)).map(([name, v]) => ({ name, ...v }));

  const flowPeriodLabels: Record<typeof flowPeriod, string> = {
    daily: "Kunlik (oxirgi 30 kun)",
    weekly: "Haftalik (oxirgi 12 hafta)",
    monthly: "Oylik",
    yearly: "Yillik",
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">💵 Daromad (Tanga rejalari sotuvi)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Jami daromad", value: fmtMoney(totalRevenue), color: "text-emerald-700" },
            { label: "Bugun",        value: fmtMoney(todayRevenue), color: "text-blue-700"    },
            { label: "Bu hafta",     value: fmtMoney(weekRevenue),  color: "text-violet-700"  },
            { label: "Bu oy",        value: fmtMoney(monthRevenue), color: "text-amber-700"   },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-[10px] font-semibold text-gray-400 mb-1">{m.label}</p>
              <p className={`text-base font-extrabold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🪙 Token ko'rsatkichlari</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Sotilgan Tanga",   value: `${totalSold} 🪙`,  color: "text-emerald-600" },
            { label: "Sarflangan Tanga", value: `${totalSpent} 🪙`, color: "text-red-600"     },
            { label: "Muomaladagi",      value: `${totalCirc} 🪙`,  color: "text-amber-600"   },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
              <p className="text-[10px] font-semibold text-gray-400 mb-1">{m.label}</p>
              <p className={`text-xl font-extrabold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🏪 Bozor ko'rsatkichlari</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "O'rtacha Tanga/ijrochi",  value: `${avgTangaPerProv} 🪙`, color: "text-amber-600"  },
            { label: "O'rtacha taklif/so'rov",  value: avgOffersPerReq,          color: "text-blue-600"   },
            { label: "O'rtacha taklif xarajati", value: `${avgCostPerOffer} 🪙`, color: "text-violet-600" },
          ].map((m) => (
            <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
              <p className="text-[10px] font-semibold text-gray-400 mb-1">{m.label}</p>
              <p className={`text-base font-extrabold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {(flowData.length > 0 || txs.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Tanga oqimi</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">{flowPeriodLabels[flowPeriod]}</p>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {(["daily", "weekly", "monthly", "yearly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setFlowPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                    flowPeriod === p
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {{ daily: "Kun", weekly: "Hafta", monthly: "Oy", yearly: "Yil" }[p]}
                </button>
              ))}
            </div>
          </div>
          {flowData.length === 0 ? (
            <div className="flex items-center justify-center h-[180px] text-gray-300 text-sm font-semibold">
              Ushbu davr uchun ma'lumot yo'q
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={flowData}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E5E7EB", fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="sotildi"   name="Sotildi"   stroke="#10B981" fill="#D1FAE5" strokeWidth={2} />
                <Area type="monotone" dataKey="sarflandi" name="Sarflandi" stroke="#DC2626" fill="#FEE2E2" strokeWidth={2} />
                <Area type="monotone" dataKey="referral"  name="Referral"  stroke="#3B82F6" fill="#DBEAFE" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Active plans + campaigns */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-sm">Faol rejalar</h3>
          <span className="text-xs font-bold text-gray-400">{tiers.filter((t) => t.active).length}/{tiers.length} ta</span>
        </div>
        {tiers.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Rejalar yo'q — "Rejalar" tabiga o'ting</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tiers.filter((t) => t.active).map((t) => {
              const hasCampaign = t.salePrice !== undefined;
              const soldOut = t.saleLimit !== undefined && (t.salePurchaseCount ?? 0) >= t.saleLimit;
              return (
                <span key={t.id} className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${t.color}`}>
                  {t.featured && "⭐"}{t.hotOffer && "🔥"}{t.bonusPlan && "🎁"}
                  {t.name} · {t.credits} 🪙
                  {hasCampaign && !soldOut && <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1 rounded">Aksiya</span>}
                  {soldOut && <span className="text-[9px] font-bold bg-red-100 text-red-500 px-1 rounded">Tugadi</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Top-selling plans */}
      {purchases.length > 0 && (() => {
        const countMap: Record<string, number> = {};
        purchases.forEach((p) => { countMap[p.categoryName] = (countMap[p.categoryName] ?? 0) + 1; });
        const top = Object.entries(countMap).sort(([, a], [, b]) => b - a).slice(0, 3);
        return (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <h3 className="font-bold text-gray-900 text-sm mb-3">🏆 Ko'p sotilgan rejalar</h3>
            <div className="space-y-2">
              {top.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-600" : "bg-orange-50 text-orange-600"}`}>{i + 1}</span>
                  <span className="flex-1 text-xs font-semibold text-gray-700 truncate">{name}</span>
                  <span className="text-xs font-bold text-gray-900">{count} ta</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Plans Tab ──────────────────────────────────────────────────── */
type PlanDraft = {
  name: string; credits: number | ""; price: number | ""; salePrice: number | "";
  saleLimit: number | ""; perUserLimit: number | ""; bonusTokens: number | "";
  startsAt: string; validUntil: string;
  status: "draft" | "active" | "scheduled" | "expired" | "archived";
  visibilityTarget: "all" | "new" | "active" | "referral";
  featured: boolean; hotOffer: boolean; bonusPlan: boolean;
  badge: string; desc: string;
  nameLocalized: LocalizedText;
  descLocalized: LocalizedText;
  badgeLocalized: LocalizedText;
};
const BLANK_DRAFT: PlanDraft = {
  name: "", credits: "", price: "", salePrice: "", saleLimit: "", perUserLimit: "",
  bonusTokens: "", startsAt: "", validUntil: "", status: "active",
  visibilityTarget: "all", featured: false, hotOffer: false, bonusPlan: false,
  badge: "", desc: "",
  nameLocalized: {}, descLocalized: {}, badgeLocalized: {},
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
      <span className="flex-1 border-t border-gray-100" />{children}<span className="flex-1 border-t border-gray-100" />
    </p>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div><label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">{label}</label>{children}</div>
  );
}

function planStatusMeta(t: PricingTier): { label: string; cls: string } {
  if (!t.active) return { label: "O'chirilgan", cls: "bg-gray-100 text-gray-500" };
  const s = t.status ?? "active";
  const now = new Date();
  if (t.validUntil && new Date(t.validUntil) <= now) return { label: "Muddati tugagan", cls: "bg-red-50 text-red-500" };
  if (t.startsAt && new Date(t.startsAt) > now)      return { label: "Rejalashtirilgan", cls: "bg-blue-50 text-blue-600" };
  if (s === "draft")    return { label: "Qoralama", cls: "bg-gray-100 text-gray-500" };
  if (s === "archived") return { label: "Arxivlangan", cls: "bg-gray-100 text-gray-400" };
  return { label: "Faol", cls: "bg-emerald-50 text-emerald-700" };
}

function MonoPlans({ tiers, txs, reload }: { tiers: PricingTier[]; txs: TangaTx[]; reload: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [draft, setDraft]         = useState<PlanDraft>(BLANK_DRAFT);
  const [errors, setErrors]       = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);

  const planStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    for (const tx of txs) {
      if (tx.type !== "purchase") continue;
      const key = tx.categoryName;
      if (!map[key]) map[key] = { count: 0, revenue: 0 };
      map[key].count++;
      map[key].revenue += typeof tx.priceSom === "number" ? tx.priceSom : 0;
    }
    return map;
  }, [txs]);

  const totalRevenue   = Object.values(planStats).reduce((s, v) => s + v.revenue, 0);
  const totalPurchases = Object.values(planStats).reduce((s, v) => s + v.count, 0);
  const activeCampaigns = tiers.filter((t) => {
    if (!t.active || t.salePrice === undefined) return false;
    const now = new Date();
    if (t.validUntil && new Date(t.validUntil) <= now) return false;
    if (t.saleLimit !== undefined && (t.salePurchaseCount ?? 0) >= t.saleLimit) return false;
    return true;
  }).length;

  function startCreate() { setEditingId(null); setDraft(BLANK_DRAFT); setErrors([]); setShowForm(true); }
  function startEdit(t: PricingTier) {
    setEditingId(t.id);
    setDraft({
      name: t.name, credits: t.credits, price: t.price,
      salePrice: t.salePrice ?? "", saleLimit: t.saleLimit ?? "",
      perUserLimit: t.perUserLimit ?? "", bonusTokens: t.bonusTokens ?? "",
      startsAt: toDatetimeLocal(t.startsAt), validUntil: toDatetimeLocal(t.validUntil),
      status: t.status ?? "active", visibilityTarget: t.visibilityTarget ?? "all",
      featured: t.featured ?? false, hotOffer: t.hotOffer ?? false, bonusPlan: t.bonusPlan ?? false,
      badge: t.badge ?? "", desc: t.desc,
      nameLocalized: t.nameLocalized ?? {}, descLocalized: t.descLocalized ?? {},
      badgeLocalized: t.badgeLocalized ?? {},
    });
    setErrors([]); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setErrors([]); }

  function validate(): string[] {
    const errs: string[] = [];
    if (!draft.name.trim()) errs.push("Reja nomini kiriting.");
    if (!draft.credits || Number(draft.credits) <= 0) errs.push("Tanga soni 0 dan katta bo'lishi kerak.");
    if (!draft.price || Number(draft.price) < 0) errs.push("Narx manfiy bo'lishi mumkin emas.");
    if (draft.salePrice !== "" && Number(draft.salePrice) >= Number(draft.price)) errs.push("Aksiya narxi asl narxdan kichik bo'lishi kerak.");
    if (draft.salePrice !== "" && Number(draft.salePrice) < 0) errs.push("Aksiya narxi manfiy bo'lishi mumkin emas.");
    if (draft.saleLimit !== "" && Number(draft.saleLimit) <= 0) errs.push("Umumiy aksiya limiti 0 dan katta bo'lishi kerak.");
    if (draft.perUserLimit !== "" && Number(draft.perUserLimit) <= 0) errs.push("Bir foydalanuvchi limiti 0 dan katta bo'lishi kerak.");
    return errs;
  }

  function toBackendInput(): PricingTierInput {
    return {
      ...(editingId ? {} : { key: `${slugify(draft.name)}-${Date.now().toString(36)}` }),
      name: draft.name.trim(),
      nameRu: draft.nameLocalized.ru?.trim() || undefined,
      desc: draft.desc,
      descRu: draft.descLocalized.ru?.trim() || undefined,
      badge: draft.badge.trim() || undefined,
      badgeRu: draft.badgeLocalized.ru?.trim() || undefined,
      credits: Number(draft.credits),
      bonusTokens: draft.bonusTokens !== "" ? Number(draft.bonusTokens) : 0,
      priceSom: Number(draft.price),
      salePrice: draft.salePrice !== "" ? Number(draft.salePrice) : null,
      saleLimit: draft.saleLimit !== "" ? Number(draft.saleLimit) : null,
      perUserLimit: draft.perUserLimit !== "" ? Number(draft.perUserLimit) : null,
      startsAt: draft.startsAt || null,
      validUntil: draft.validUntil || null,
      status: draft.status,
      visibilityTarget: draft.visibilityTarget,
      featured: draft.featured,
      hotOffer: draft.hotOffer,
      bonusPlan: draft.bonusPlan,
      active: draft.status === "active",
    };
  }

  async function save() {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const body = toBackendInput();
      if (editingId) {
        await updatePricingTier(editingId, body);
        logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "UPDATE_PRICING", category: "financial", targetId: editingId, targetType: "pricing", description: `Yangilandi: ${body.name}` });
      } else {
        const { tier } = await createPricingTier(body);
        logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ADD_PRICING_TIER", category: "financial", targetId: tier.id, targetType: "pricing", description: `Yangi reja: ${body.name}` });
      }
      closeForm();
      reload();
    } catch (err) {
      setErrors([err instanceof AdminApiError ? err.message : "Saqlashda xatolik yuz berdi"]);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTier(id: string) {
    try {
      await deletePricingTier(id);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "DELETE_PRICING_TIER", category: "financial", targetId: id, targetType: "pricing", description: "Reja o'chirildi" });
      reload();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "O'chirishda xatolik yuz berdi");
    }
  }
  async function toggleTier(t: PricingTier) {
    try {
      await setPricingTierActive(t.id, !t.active);
      reload();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  /* ── Live preview calculations ─────────────────────────────────── */
  const liveCredits  = Number(draft.credits) || 0;
  const liveBonus    = Number(draft.bonusTokens) || 0;
  const livePrice    = Number(draft.price) || 0;
  const liveSale     = draft.salePrice !== "" ? Number(draft.salePrice) : null;
  const liveSaving   = liveSale !== null && livePrice > 0 && liveSale < livePrice
    ? Math.round((1 - liveSale / livePrice) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* ── Stats bar ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Jami daromad",    value: fmtMoney(totalRevenue),  color: "text-emerald-700" },
          { label: "Sotuvlar soni",   value: `${totalPurchases} ta`,  color: "text-gray-900"    },
          { label: "Faol aksiyalar",  value: `${activeCampaigns} ta`, color: "text-amber-600"   },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] text-gray-400 font-semibold mb-1">{s.label}</p>
            <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Plan cards ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-sm">Tanga rejalari</h3>
          <button onClick={startCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Yangi reja
          </button>
        </div>

        {tiers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-red-200 p-8 text-center">
            <CreditCard className="w-8 h-8 text-red-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Hali rejalar yo'q</p>
            <p className="text-xs text-gray-300 mt-1">"Yangi reja" tugmasini bosing</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tiers.map((t) => {
              const { label: statusLabel, cls: statusCls } = planStatusMeta(t);
              const stats = planStats[t.name] ?? { count: 0, revenue: 0 };
              const campaignUsed = t.salePurchaseCount ?? 0;
              const campaignTotal = t.saleLimit;
              return (
                <div key={t.id} className={`bg-white rounded-2xl border p-4 shadow-sm transition-all ${t.active && (t.status ?? "active") === "active" ? "border-amber-100" : "border-gray-100 opacity-60"}`}>
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="font-extrabold text-gray-900 text-sm">{t.name}</span>
                        {t.badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">{t.badge}</span>}
                        {t.featured && <span className="text-[9px]">⭐</span>}
                        {t.hotOffer && <span className="text-[9px]">🔥</span>}
                        {t.bonusPlan && <span className="text-[9px]">🎁</span>}
                      </div>
                      <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => toggleTier(t)} className={`text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${t.active ? "text-orange-500 hover:bg-orange-50" : "text-emerald-600 hover:bg-emerald-50"}`}>
                        {t.active ? "O'ch" : "Yoq"}
                      </button>
                      <button onClick={() => { if (confirm(`"${t.name}" ni o'chirish?`)) deleteTier(t.id); }} className="text-xs text-gray-300 hover:text-red-500 px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors">✕</button>
                    </div>
                  </div>

                  {/* Tanga + price */}
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-black text-gray-900">{t.credits}</span>
                    <span className="text-xs font-semibold text-gray-400">Tanga</span>
                    {(t.bonusTokens ?? 0) > 0 && <span className="text-xs font-bold text-emerald-600">+{t.bonusTokens} bonus</span>}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-sm font-bold text-gray-700">{t.price === 0 ? "Bepul" : fmtMoney(t.salePrice !== undefined ? t.salePrice : t.price)}</span>
                    {t.salePrice !== undefined && t.price > t.salePrice && <span className="text-xs text-gray-400 line-through">{fmtMoney(t.price)}</span>}
                    {t.salePrice !== undefined && t.price > t.salePrice && <span className="text-[10px] font-bold text-orange-600">{Math.round((1 - t.salePrice / t.price) * 100)}% tejash</span>}
                  </div>

                  {/* Campaign stock */}
                  {campaignTotal !== undefined && (
                    <div className="mb-2">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Aksiya ({campaignUsed}/{campaignTotal})</span>
                        {(t.perUserLimit ?? 0) > 0 && <span>1 kishi: maks {t.perUserLimit}</span>}
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.min(100, (campaignUsed / campaignTotal) * 100)}%` }} />
                      </div>
                      {campaignUsed >= campaignTotal && <p className="text-[9px] font-bold text-red-500 mt-0.5">Aksiya tugadi</p>}
                    </div>
                  )}
                  {campaignTotal === undefined && (t.perUserLimit ?? 0) > 0 && (
                    <p className="text-[10px] text-gray-400 mb-2">1 kishi: maks {t.perUserLimit} ta</p>
                  )}

                  {/* Mini analytics */}
                  <div className="flex gap-3 py-2 border-t border-gray-50 mb-3">
                    <div className="text-center flex-1">
                      <p className="text-base font-extrabold text-gray-900">{stats.count}</p>
                      <p className="text-[9px] text-gray-400">sotilgan</p>
                    </div>
                    <div className="w-px bg-gray-100" />
                    <div className="text-center flex-1">
                      <p className="text-xs font-extrabold text-emerald-700">{stats.revenue > 0 ? fmtMoney(stats.revenue) : "—"}</p>
                      <p className="text-[9px] text-gray-400">daromad</p>
                    </div>
                  </div>

                  <button onClick={() => startEdit(t)} className="w-full py-1.5 rounded-xl bg-amber-50 border border-amber-100 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors">
                    Tahrirlash
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Creator / Editor panel ────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
              onClick={closeForm}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed right-0 top-0 h-full z-[61] w-full max-w-2xl bg-white shadow-2xl flex flex-col"
            >
            {/* Form header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white flex-shrink-0">
              <div>
                <h4 className="font-extrabold text-gray-900 text-sm">{editingId ? "Rejani tahrirlash" : "Yangi Tanga rejasi"}</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">Barcha maydonlarni to'ldiring</p>
              </div>
              <button onClick={closeForm} className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Validation errors */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  {errors.map((e) => <p key={e} className="text-xs font-semibold text-red-600">• {e}</p>)}
                </div>
              )}

              {/* ── Section A: Basic Info ───────────────────────── */}
              <div>
                <SectionLabel>A — Asosiy ma'lumotlar</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Reja nomi">
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Masalan: Pro, Starter…" className={`${inputCls} w-full`} />
                  </Field>
                  <Field label="Tanga soni">
                    <input type="number" min={1} value={draft.credits} onChange={(e) => setDraft({ ...draft, credits: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="50" className={`${inputCls} w-full`} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="Tavsif">
                      <input value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Ijrochilar uchun asosiy reja" className={`${inputCls} w-full`} />
                    </Field>
                  </div>

                  {/* ── Russian translation ─────────────────────── */}
                  <div className="col-span-2">
                    <Field label="🇷🇺 Rus tilidagi tarjima (tavsiya)">
                      <div className={`rounded-xl border p-3 space-y-2 mt-1 ${(draft.nameLocalized.ru ?? "").trim() ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-gray-50/60"}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm">🇷🇺</span>
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Русский</span>
                          <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${(draft.nameLocalized.ru ?? "").trim() ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-400"}`}>
                            {(draft.nameLocalized.ru ?? "").trim() ? "✅ To'ldirilgan" : "○ Ixtiyoriy"}
                          </span>
                        </div>
                        <input
                          value={draft.nameLocalized.ru ?? ""}
                          onChange={(e) => setDraft({ ...draft, nameLocalized: { ...draft.nameLocalized, ru: e.target.value } })}
                          placeholder="Reja nomi (ru)"
                          className={`${inputCls} w-full text-xs`}
                        />
                        <input
                          value={draft.descLocalized.ru ?? ""}
                          onChange={(e) => setDraft({ ...draft, descLocalized: { ...draft.descLocalized, ru: e.target.value } })}
                          placeholder="Tavsif (ru)"
                          className={`${inputCls} w-full text-xs`}
                        />
                        <input
                          value={draft.badgeLocalized.ru ?? ""}
                          onChange={(e) => setDraft({ ...draft, badgeLocalized: { ...draft.badgeLocalized, ru: e.target.value } })}
                          placeholder="Nishon (ru) — ixtiyoriy"
                          className={`${inputCls} w-full text-xs`}
                        />
                      </div>
                    </Field>
                  </div>

                  <Field label="Nishon (ixtiyoriy)">
                    <input value={draft.badge} onChange={(e) => setDraft({ ...draft, badge: e.target.value })} placeholder="Eng mashhur" className={`${inputCls} w-full`} />
                  </Field>
                </div>
              </div>

              {/* ── Section B: Pricing ──────────────────────────── */}
              <div>
                <SectionLabel>B — Narxlash</SectionLabel>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Asl narx (so'm)">
                    <input type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="49 000" className={`${inputCls} w-full`} />
                  </Field>
                  <Field label="Aksiya narxi (so'm)">
                    <input type="number" min={0} value={draft.salePrice} onChange={(e) => setDraft({ ...draft, salePrice: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="39 000 (ixtiyoriy)" className={`${inputCls} w-full`} />
                  </Field>
                  <Field label="Bonus Tanga">
                    <input type="number" min={0} value={draft.bonusTokens} onChange={(e) => setDraft({ ...draft, bonusTokens: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="10 (ixtiyoriy)" className={`${inputCls} w-full`} />
                  </Field>
                </div>
                {/* Live preview */}
                {(liveCredits > 0 || livePrice > 0) && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-black text-amber-700">{liveCredits}</span>
                      {liveBonus > 0 && <><span className="text-xs text-gray-400">+</span><span className="text-sm font-bold text-emerald-600">{liveBonus} bonus</span></>}
                      <span className="text-xs text-gray-500">= jami</span>
                      <span className="text-sm font-black text-gray-900">{liveCredits + liveBonus} Tanga</span>
                    </div>
                    <div className="h-4 w-px bg-amber-200" />
                    <div className="flex items-center gap-1.5">
                      {liveSale !== null && livePrice > liveSale ? (
                        <>
                          <span className="text-sm font-bold text-orange-600">{liveSale.toLocaleString()} so'm</span>
                          <span className="text-xs text-gray-400 line-through">{livePrice.toLocaleString()}</span>
                          {liveSaving > 0 && <span className="text-[10px] font-black text-white bg-orange-500 px-1.5 py-0.5 rounded-full">{liveSaving}% tejash</span>}
                        </>
                      ) : (
                        <span className="text-sm font-bold text-gray-700">{livePrice > 0 ? livePrice.toLocaleString() + " so'm" : "Bepul"}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section C: Campaign Rules ────────────────────── */}
              <div>
                <SectionLabel>C — Aksiya qoidalari</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Holati">
                    <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as PlanDraft["status"] })} className={`${inputCls} w-full`}>
                      <option value="active">✅ Faol</option>
                      <option value="draft">📝 Qoralama</option>
                      <option value="scheduled">📅 Rejalashtirilgan</option>
                      <option value="archived">📦 Arxivlangan</option>
                    </select>
                  </Field>
                  <Field label="Umumiy aksiya limiti">
                    <input type="number" min={1} value={draft.saleLimit} onChange={(e) => setDraft({ ...draft, saleLimit: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="100 (ixtiyoriy)" className={`${inputCls} w-full`} />
                  </Field>
                  <Field label="Bir foydalanuvchi limiti">
                    <input type="number" min={1} value={draft.perUserLimit} onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="1 (ixtiyoriy)" className={`${inputCls} w-full`} />
                  </Field>
                  <div />
                  <Field label="Boshlanish vaqti">
                    <input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} className={`${inputCls} w-full`} />
                  </Field>
                  <Field label="Tugash vaqti">
                    <input type="datetime-local" value={draft.validUntil} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} className={`${inputCls} w-full`} />
                  </Field>
                </div>
              </div>

              {/* ── Section D: Visibility ────────────────────────── */}
              <div>
                <SectionLabel>D — Ko'rish sozlamalari</SectionLabel>
                <Field label="Kimlarga ko'rinadi?">
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {([
                      ["all", "👥 Barcha ijrochilar"],
                      ["new", "🆕 Yangi ijrochilar"],
                      ["active", "⚡ Faol ijrochilar"],
                      ["referral", "🔗 Referral foydalanuvchilar"],
                    ] as [PlanDraft["visibilityTarget"], string][]).map(([val, lbl]) => (
                      <button key={val} type="button" onClick={() => setDraft({ ...draft, visibilityTarget: val })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors text-left ${draft.visibilityTarget === val ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* ── Section E: Highlighting ──────────────────────── */}
              <div>
                <SectionLabel>E — Ta'kidlash</SectionLabel>
                <div className="flex gap-3 flex-wrap">
                  {([
                    ["featured", "⭐ Tavsiya etilgan"],
                    ["hotOffer", "🔥 Hot offer"],
                    ["bonusPlan", "🎁 Bonusli reja"],
                  ] as [keyof Pick<PlanDraft, "featured" | "hotOffer" | "bonusPlan">, string][]).map(([key, lbl]) => (
                    <button key={key} type="button" onClick={() => setDraft({ ...draft, [key]: !draft[key] })}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${draft[key] ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sticky save footer */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 active:scale-[.98] transition-all shadow-sm disabled:opacity-60">
                {saving ? "Saqlanmoqda…" : editingId ? "Saqlash" : "Reja qo'shish"}
              </button>
              <button onClick={closeForm} className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                Bekor
              </button>
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Transactions Tab ───────────────────────────────────────────── */
function MonoTransactions({ txs, reload }: { txs: TangaTx[]; reload: () => void }) {
  const [search, setSearch]           = useState("");
  const [filterType, setFilterType]   = useState<"all" | "spend" | "purchase" | "referral" | "admin_adjustment">("all");
  const [filterDate, setFilterDate]   = useState<"all" | "today" | "week" | "month">("all");
  const [viewOfferId, setViewOfferId] = useState<string | null>(null);
  const [allOffers, setAllOffers] = useState<BuyerOfferFull[]>([]);
  const [adminUsers, setAdminUsers] = useState<BackendAdminUser[]>([]);
  useEffect(() => {
    getAllOffersAdmin().then(setAllOffers).catch((err) => console.error("Load offers failed:", err));
    fetchAdminUsers().then((r) => setAdminUsers(r.users)).catch((err) => console.error("Load users failed:", err));
  }, []);

  /* ── User lookup: id → { name, phone } ────────────────────────── */
  const userLookup = useMemo(() => {
    const map = new Map<string, { name: string; phone: string | null }>();
    for (const u of adminUsers) {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
        || (u.role === "provider" ? "Ijrochi" : "Mijoz");
      map.set(u.id, { name, phone: u.phone ?? null });
    }
    for (const offer of allOffers) {
      if (offer.masterId && !map.has(offer.masterId) && offer.masterName) {
        map.set(offer.masterId, { name: offer.masterName, phone: null });
      }
    }
    return map;
  }, [adminUsers, allOffers]);
  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo  = new Date(now.getTime() - 7 * 86400000);
  const monthStr = now.toISOString().slice(0, 7);

  function txTypeInfo(tx: TangaTx): { label: string; cls: string } {
    if (tx.type === "purchase")                  return { label: "Xarid",         cls: "bg-emerald-50 text-emerald-700 border-emerald-100" };
    if (tx.type === "referral")                  return { label: "Referral",      cls: "bg-blue-50 text-blue-700 border-blue-100" };
    if (tx.type === "admin_adjustment")          return { label: "Admin",         cls: "bg-violet-50 text-violet-700 border-violet-100" };
    if (tx.type === "refund")                    return { label: "Qaytarildi",    cls: "bg-teal-50 text-teal-700 border-teal-100" };
    if (tx.type === "profile_completion_reward") return { label: "Profil bonusi", cls: "bg-amber-50 text-amber-700 border-amber-100" };
    return                                              { label: "Sarflandi",     cls: "bg-rose-50 text-rose-700 border-rose-100" };
  }

  const filtered = txs.filter((tx) => {
    const effectiveType = tx.type ?? "spend";
    if (filterType !== "all" && effectiveType !== filterType) return false;
    if (filterDate === "today" && !tx.createdAt.startsWith(todayStr)) return false;
    if (filterDate === "week"  && new Date(tx.createdAt) < weekAgo)   return false;
    if (filterDate === "month" && !tx.createdAt.startsWith(monthStr)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!tx.userId.toLowerCase().includes(q) && !tx.categoryName.toLowerCase().includes(q) && !(tx.description ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalIn  = filtered.filter((t) => txSignedAmount(t) > 0).reduce((s, t) => s + txSignedAmount(t), 0);
  const totalOut = filtered.filter((t) => txSignedAmount(t) < 0).reduce((s, t) => s + txSignedAmount(t), 0);

  function exportCSV() {
    const rows = [["Sana", "Foydalanuvchi", "Turi", "Miqdor", "Kategoriya", "Tavsif", "Offer ID"]];
    filtered.forEach((tx) => {
      rows.push([tx.createdAt, tx.userId, tx.type || "spend", String(txSignedAmount(tx)), tx.categoryName, tx.description ?? "", tx.offerId ?? ""]);
    });
    const csv  = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = `tanga_txs_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const viewedOffer = viewOfferId ? allOffers.find((o) => o.id === viewOfferId) : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-400 font-semibold">Kirdi</p>
          <p className="text-xl font-extrabold text-emerald-600">+{totalIn} 🪙</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-400 font-semibold">Chiqdi</p>
          <p className="text-xl font-extrabold text-red-600">{totalOut} 🪙</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-400 font-semibold">Ko'rsatildi</p>
          <p className="text-xl font-extrabold text-gray-700">{filtered.length} ta</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Foydalanuvchi ID, kategoriya..." className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} className={inputCls}>
          <option value="all">Barcha tur</option>
          <option value="spend">Sarflandi</option>
          <option value="purchase">Xarid</option>
          <option value="referral">Referral</option>
          <option value="admin_adjustment">Admin</option>
        </select>
        <select value={filterDate} onChange={(e) => setFilterDate(e.target.value as typeof filterDate)} className={inputCls}>
          <option value="all">Barcha vaqt</option>
          <option value="today">Bugun</option>
          <option value="week">Bu hafta</option>
          <option value="month">Bu oy</option>
        </select>
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 border border-emerald-100">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
        <button onClick={reload} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 border border-red-100">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="flex justify-center mb-2"><TangaCoin size="lg" /></div>
            <p className="text-gray-400 font-semibold text-sm">{txs.length === 0 ? "Hali tranzaksiyalar yo'q" : "Topilmadi"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/40">
                  {["Foydalanuvchi", "Turi", "Miqdor", "Manba", "Sana", "Amal"].map((h) => (
                    <th key={h} className="text-left text-[9px] font-bold text-red-400 uppercase tracking-widest px-3 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((tx) => {
                  const signed        = txSignedAmount(tx);
                  const { label, cls } = txTypeInfo(tx);
                  const offer         = allOffers.find((o) => o.id === tx.offerId);
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-3 py-3 max-w-[150px]">
                        {(() => {
                          const u = userLookup.get(tx.userId);
                          return (
                            <>
                              <p className="text-xs font-bold text-gray-800 truncate">{u?.name ?? "Noma'lum"}</p>
                              {u?.phone && <p className="text-[10px] text-gray-500 font-medium">{u.phone}</p>}
                              <p className="text-[9px] text-gray-300 font-mono mt-0.5">{tx.userId.slice(0, 12)}</p>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
                          {tx.categoryEmoji || "📋"} {label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`font-extrabold text-[13px] ${signed >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {signed >= 0 ? "+" : "−"}{Math.abs(signed)} 🪙
                        </span>
                      </td>
                      <td className="px-3 py-3 max-w-[160px]">
                        <p className="text-[11px] text-gray-600 truncate">{tx.categoryName}</p>
                        {tx.source && (
                          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${
                            tx.source === "discount_campaign" ? "bg-orange-50 text-orange-600" :
                            tx.source === "referral_bonus"   ? "bg-blue-50 text-blue-600"   :
                            tx.source === "admin_grant"      ? "bg-violet-50 text-violet-600" :
                                                               "bg-gray-100 text-gray-500"
                          }`}>
                            {tx.source === "discount_campaign" ? "🔥 Aksiya" :
                             tx.source === "referral_bonus"    ? "🔗 Referral" :
                             tx.source === "admin_grant"       ? "👤 Admin" :
                                                                 "Oddiy xarid"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-gray-500 whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString("uz-UZ")}{" "}
                        {new Date(tx.createdAt).toLocaleTimeString("uz-Latn-UZ", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-3">
                        {offer && (
                          <button onClick={() => setViewOfferId(offer.id)} className="px-2 py-1 rounded-lg bg-violet-50 text-violet-600 text-[10px] font-bold hover:bg-violet-100 border border-violet-100">
                            Batafsil
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 text-right">{filtered.length} / {txs.length} tranzaksiya</p>

      <AnimatePresence>
        {viewedOffer && <OfferDetailModal offer={viewedOffer} onClose={() => setViewOfferId(null)} readOnly />}
      </AnimatePresence>
    </div>
  );
}

/* ─── Provider Balances Tab ──────────────────────────────────────── */
function MonoBalances({ providers, reload }: { providers: ProviderSummary[]; reload: () => void }) {
  const [filterBal, setFilterBal]   = useState<"all" | "low" | "zero" | "high">("all");
  const [search, setSearch]         = useState("");
  const [adjustId, setAdjustId]     = useState<string | null>(null);
  const [adjustAmt, setAdjustAmt]   = useState(0);
  const [adjustType, setAdjustType] = useState<"add" | "remove">("add");

  const filtered = providers.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.userId.includes(search)) return false;
    if (filterBal === "low"  && p.balance >= 5)  return false;
    if (filterBal === "zero" && p.balance !== 0) return false;
    if (filterBal === "high" && p.balance < 20)  return false;
    return true;
  });

  async function applyAdjust(userId: string, name: string) {
    if (adjustAmt <= 0) return;
    const direction = adjustType === "add" ? "in" : "out";
    const reason = adjustType === "add" ? `Admin +${adjustAmt} Tanga qo'shdi` : `Admin −${adjustAmt} Tanga ayirdi`;
    try {
      await adjustWalletBalanceBackend(userId, adjustAmt, direction, reason);
      logAction({
        actorId: ADMIN_USER, actorRole: "admin",
        action: adjustType === "add" ? "ADMIN_ADD_TANGA" : "ADMIN_REMOVE_TANGA",
        category: "financial", targetId: userId, targetType: "tanga",
        description: adjustType === "add" ? `${name}ga +${adjustAmt} Tanga qo'shildi` : `${name}dan −${adjustAmt} Tanga ayirildi`,
        metadata: { amount: adjustAmt },
      });
      setAdjustId(null); setAdjustAmt(0);
      reload();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Balansni o'zgartirishda xatolik yuz berdi");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-400 font-semibold">Jami ijrochilar</p>
          <p className="text-xl font-extrabold text-gray-900">{providers.length} ta</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-400 font-semibold">Muomaladagi Tanga</p>
          <p className="text-xl font-extrabold text-amber-600">{providers.reduce((s, p) => s + p.balance, 0)} 🪙</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-400 font-semibold">Kam balans (&lt;5)</p>
          <p className="text-xl font-extrabold text-red-600">{providers.filter((p) => p.balance < 5).length} ta</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ijrochi nomi yoki ID..." className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filterBal} onChange={(e) => setFilterBal(e.target.value as typeof filterBal)} className={inputCls}>
          <option value="all">Barcha balans</option>
          <option value="low">Kam (&lt;5 🪙)</option>
          <option value="zero">Nol</option>
          <option value="high">Yuqori (≥20 🪙)</option>
        </select>
      </div>

      {providers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <Wallet className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-400 text-sm font-semibold">Ijrochilar topilmadi</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/40">
                  {["Ijrochi", "Balans", "Sotib oldi", "Sarfladi", "Referral", "Amal"].map((h) => (
                    <th key={h} className="text-left text-[9px] font-bold text-red-400 uppercase tracking-widest px-3 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <tr key={p.userId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-3">
                      <p className="text-xs font-bold text-gray-800">{p.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{p.userId.slice(0, 10)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-extrabold text-sm ${p.balance === 0 ? "text-gray-300" : p.balance < 5 ? "text-red-500" : "text-amber-600"}`}>{p.balance} 🪙</span>
                        {p.balance < 5 && p.balance > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-100">Kam</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] font-semibold text-emerald-600">+{p.totalPurchased} 🪙</td>
                    <td className="px-3 py-3 text-[11px] font-semibold text-red-500">−{p.totalSpent} 🪙</td>
                    <td className="px-3 py-3 text-[11px] font-semibold text-blue-600">+{p.referralEarned} 🪙</td>
                    <td className="px-3 py-3">
                      {adjustId === p.userId ? (
                        <div className="flex items-center gap-1.5">
                          <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as "add" | "remove")} className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-900 bg-white focus:outline-none">
                            <option value="add">Qo'shish</option>
                            <option value="remove">Ayirish</option>
                          </select>
                          <input type="number" min={1} value={adjustAmt || ""} onChange={(e) => setAdjustAmt(Number(e.target.value))} placeholder="🪙" className="w-14 text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-900 bg-white focus:outline-none focus:border-red-400" />
                          <button onClick={() => applyAdjust(p.userId, p.name)} className="px-2 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600">✓</button>
                          <button onClick={() => { setAdjustId(null); setAdjustAmt(0); }} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-bold hover:bg-gray-200">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAdjustId(p.userId); setAdjustAmt(0); setAdjustType("add"); }} className="px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-bold hover:bg-amber-100 border border-amber-100 whitespace-nowrap">
                          ± Sozlash
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 text-right px-4 py-2">{filtered.length}/{providers.length} ijrochi</p>
        </div>
      )}
    </div>
  );
}

/* ─── Referral Economy Tab ───────────────────────────────────────── */
function MonoReferral({ providers, referrals }: { providers: ProviderSummary[]; referrals: BackendReferral[] }) {
  const referralData = providers.map((p) => {
    const rewarded = referrals.filter((r) => r.referrerId === p.userId && r.rewarded);
    return {
      ...p,
      refCount: rewarded.length,
      refEarned: rewarded.length * TANGA_PER_REFERRAL,
      invitees: rewarded.map((r) => ({ userId: r.inviteeId, completedAt: r.createdAt })),
    };
  }).filter((p) => p.refCount > 0 || p.refEarned > 0).sort((a, b) => b.refEarned - a.refEarned);

  const totalRefTanga     = referralData.reduce((s, r) => s + r.refEarned, 0);
  const totalRefCompleted = referralData.reduce((s, r) => s + r.invitees.length, 0);
  const topReferrers      = referralData.slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Referral Tanga berildi", value: `${totalRefTanga} 🪙`,       color: "text-emerald-600" },
          { label: "Bajarilgan taklif",      value: `${totalRefCompleted} ta`,    color: "text-blue-700"   },
          { label: "Faol referrerlar",       value: `${referralData.length} ta`,  color: "text-violet-700" },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-center">
            <p className="text-[10px] font-semibold text-gray-400 mb-1">{m.label}</p>
            <p className={`text-xl font-extrabold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {topReferrers.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-100 p-4">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-3">🏆 Top referrerlar</p>
          <div className="flex gap-3 flex-wrap">
            {topReferrers.map((r, i) => (
              <div key={r.userId} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-amber-100 shadow-sm">
                <span className="text-base">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                <div>
                  <p className="text-xs font-bold text-gray-800">{r.name}</p>
                  <p className="text-[10px] text-amber-600 font-semibold">{r.invitees.length} ta · +{r.refEarned} 🪙</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {referralData.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-3xl mb-2">🔗</p>
          <p className="text-gray-400 text-sm font-semibold">Hali referral faoliyati yo'q</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/40">
                  {["Referrer", "Taklif qildi", "Bajaraldi", "Tanga topdi", "Referral kodi"].map((h) => (
                    <th key={h} className="text-left text-[9px] font-bold text-red-400 uppercase tracking-widest px-3 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {referralData.map((r) => (
                  <tr key={r.userId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-3">
                      <p className="text-xs font-bold text-gray-800">{r.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{r.userId.slice(0, 10)}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{r.refCount} ta</td>
                    <td className="px-3 py-3 text-xs font-semibold text-emerald-600">{r.invitees.length} ta ✓</td>
                    <td className="px-3 py-3"><span className="font-extrabold text-amber-600">+{r.refEarned} 🪙</span></td>
                    <td className="px-3 py-3"><span className="font-mono text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">{getReferralCode(r.userId)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AUDIT LOG SECTION
   ════════════════════════════════════════════════════════════════════ */
function AuditLogSection({ refreshKey }: { refreshKey: number }) {
  const [log, setLog]                       = useState<AuditLog[]>([]);
  const [search, setSearch]                 = useState("");
  const [filterCategory, setFilterCategory] = useState<"all" | AuditLogCategory>("all");
  const [filterActorRole, setFilterActorRole]   = useState<"all" | AuditLogActorRole>("all");
  const [filterTargetType, setFilterTargetType] = useState<"all" | AuditLogTargetType>("all");
  const [filterDate, setFilterDate]         = useState<"all" | "today" | "week" | "month">("all");
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [page, setPage]                     = useState(1);
  const PAGE_SIZE = 50;

  const load = useCallback(() => {
    adminFetch<{ log: AuditLog[] }>("/admin/audit-log")
      .then((res) => setLog(res.log))
      .catch((err) => console.error("Load audit log failed:", err));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function clearLog() {
    if (!confirm("Barcha audit loglarni o'chirishni tasdiqlaysizmi?")) return;
    try {
      await adminFetch("/admin/audit-log", { method: "DELETE" });
      setLog([]);
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  function exportCSV() {
    const rows = [["Vaqt", "Amal", "Toifa", "Aktor roli", "Nishon ID", "Nishon turi", "Tavsif"]];
    filtered.forEach((e) => {
      rows.push([e.createdAt, e.action, e.category, e.actorRole, e.targetId ?? "", e.targetType ?? "", e.description]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `hormang_audit_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Filtering ── */
  const now = Date.now();
  const filtered = log.filter((e) => {
    if (filterCategory   !== "all" && e.category   !== filterCategory)   return false;
    if (filterActorRole  !== "all" && e.actorRole  !== filterActorRole)  return false;
    if (filterTargetType !== "all" && e.targetType !== filterTargetType) return false;
    if (filterDate !== "all") {
      const age = now - new Date(e.createdAt).getTime();
      if (filterDate === "today" && age > 86_400_000)    return false;
      if (filterDate === "week"  && age > 7*86_400_000)  return false;
      if (filterDate === "month" && age > 30*86_400_000) return false;
    }
    const q = search.toLowerCase();
    if (q && !e.action.toLowerCase().includes(q) && !(e.targetId ?? "").toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)) return false;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* ── Summary metrics ── */
  const todayCount     = log.filter((e) => (now - new Date(e.createdAt).getTime()) < 86_400_000).length;
  const adminCount     = log.filter((e) => e.category === "admin").length;
  const riskCount      = log.filter((e) => e.category === "risk").length;
  const marketplaceCount = log.filter((e) => e.category === "marketplace").length;

  /* ── Action config (color + dot) ── */
  const ACTION_CFG: Record<string, { badge: string; dot: string }> = {
    LOGIN:                 { badge: "bg-red-50 text-red-700 border border-red-100",            dot: "bg-red-400"     },
    LOGOUT:                { badge: "bg-rose-50 text-rose-500 border border-rose-100",         dot: "bg-rose-400"    },
    DELETE_REQUEST:        { badge: "bg-rose-100 text-rose-700 border border-rose-200",        dot: "bg-rose-600"    },
    ADMIN_DELETE_REQUEST:  { badge: "bg-rose-100 text-rose-700 border border-rose-200",        dot: "bg-rose-600"    },
    UPDATE_REQUEST_STATUS: { badge: "bg-amber-50 text-amber-700 border border-amber-100",      dot: "bg-amber-400"   },
    ADMIN_UPDATE_REQUEST:  { badge: "bg-amber-50 text-amber-700 border border-amber-100",      dot: "bg-amber-400"   },
    ADMIN_ACCEPT_OFFER:    { badge: "bg-emerald-50 text-emerald-700 border border-emerald-100",dot: "bg-emerald-500" },
    ADMIN_REJECT_OFFER:    { badge: "bg-orange-50 text-orange-700 border border-orange-100",   dot: "bg-orange-400"  },
    ADMIN_REMOVE_OFFER:    { badge: "bg-rose-100 text-rose-600 border border-rose-200",        dot: "bg-rose-500"    },
    SUSPEND_USER:          { badge: "bg-orange-100 text-orange-700 border border-orange-200",  dot: "bg-orange-500"  },
    RESTORE_USER:          { badge: "bg-teal-50 text-teal-700 border border-teal-100",         dot: "bg-teal-400"    },
    DELETE_USER:           { badge: "bg-red-100 text-red-700 border border-red-200",           dot: "bg-red-600"     },
    FLAG_USER:             { badge: "bg-yellow-50 text-yellow-700 border border-yellow-200",   dot: "bg-yellow-500"  },
    UNFLAG_USER:           { badge: "bg-gray-100 text-gray-600 border border-gray-200",        dot: "bg-gray-400"    },
    VERIFY_USER:           { badge: "bg-teal-50 text-teal-700 border border-teal-100",         dot: "bg-teal-500"    },
    UNVERIFY_USER:         { badge: "bg-amber-50 text-amber-600 border border-amber-100",      dot: "bg-amber-400"   },
    ADD_NOTE:              { badge: "bg-violet-50 text-violet-700 border border-violet-100",   dot: "bg-violet-400"  },
    ADD_TAG:               { badge: "bg-blue-50 text-blue-700 border border-blue-100",         dot: "bg-blue-400"    },
    PLATFORM_RESET:        { badge: "bg-red-100 text-red-700 border border-red-200",           dot: "bg-red-700"     },
  };
  const DEFAULT_CFG = { badge: "bg-gray-100 text-gray-600 border border-gray-200", dot: "bg-gray-400" };

  /* ── Category tabs ── */
  const CATEGORY_TABS: { id: "all" | AuditLogCategory; label: string; emoji: string }[] = [
    { id: "all",         label: "Hammasi",   emoji: "📋" },
    { id: "admin",       label: "Admin",     emoji: "🛡" },
    { id: "marketplace", label: "Bozor",     emoji: "🏪" },
    { id: "financial",   label: "Moliyaviy", emoji: "💰" },
    { id: "referral",    label: "Referral",  emoji: "🔗" },
    { id: "risk",        label: "Risk",      emoji: "⚠️" },
  ];

  const ACTOR_LABELS:  Record<string, string> = { admin: "Admin", provider: "Ijrochi", customer: "Mijoz", system: "Tizim" };
  const TARGET_LABELS: Record<string, string> = { user: "Foydalanuvchi", request: "So'rov", offer: "Taklif", referral: "Referral", tanga: "Tanga", platform: "Platforma", pricing: "Narx" };

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-500 mt-0.5">Tizim harakatlari tarixi · {log.length} ta yozuv</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors border border-emerald-100">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors border border-red-100">
            <RefreshCw className="w-3.5 h-3.5" /> Yangilash
          </button>
          <button onClick={clearLog}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-sm font-semibold hover:bg-rose-100 transition-colors border border-rose-100">
            <Trash2 className="w-3.5 h-3.5" /> Tozalash
          </button>
        </div>
      </div>

      {/* ── Metrics bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Jami yozuvlar",  value: log.length,       color: "text-gray-900",  emoji: "📋" },
          { label: "Bugun",          value: todayCount,        color: "text-blue-700",  emoji: "🕐" },
          { label: "Admin amallar",  value: adminCount,        color: "text-red-700",   emoji: "🛡" },
          { label: "Risk hodisalar", value: riskCount + marketplaceCount, color: "text-amber-700", emoji: "⚠️" },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{m.label}</span>
              <span className="text-sm">{m.emoji}</span>
            </div>
            <span className={`text-xl font-extrabold ${m.color}`}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* ── Category tabs ── */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORY_TABS.map((t) => {
          const count = t.id === "all" ? log.length : log.filter((e) => e.category === t.id).length;
          return (
            <button key={t.id} onClick={() => { setFilterCategory(t.id); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                filterCategory === t.id
                  ? "bg-red-600 text-white border-red-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600"
              }`}>
              {t.emoji} {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${
                filterCategory === t.id ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filters row ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Amal, nishon, tavsifni qidirish..."
            className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filterActorRole} onChange={(e) => { setFilterActorRole(e.target.value as "all" | AuditLogActorRole); setPage(1); }}
          className={inputCls}>
          <option value="all">Barcha aktorlar</option>
          <option value="admin">Admin</option>
          <option value="provider">Ijrochi</option>
          <option value="customer">Mijoz</option>
          <option value="system">Tizim</option>
        </select>
        <select value={filterTargetType} onChange={(e) => { setFilterTargetType(e.target.value as "all" | AuditLogTargetType); setPage(1); }}
          className={inputCls}>
          <option value="all">Barcha nishonlar</option>
          <option value="user">Foydalanuvchi</option>
          <option value="request">So'rov</option>
          <option value="offer">Taklif</option>
          <option value="tanga">Tanga</option>
          <option value="referral">Referral</option>
          <option value="platform">Platforma</option>
          <option value="pricing">Narx</option>
        </select>
        <select value={filterDate} onChange={(e) => { setFilterDate(e.target.value as "all" | "today" | "week" | "month"); setPage(1); }}
          className={inputCls}>
          <option value="all">Barcha vaqt</option>
          <option value="today">Bugun</option>
          <option value="week">So'nggi 7 kun</option>
          <option value="month">So'nggi 30 kun</option>
        </select>
      </div>

      {/* ── Log list ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {paginated.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">
              {log.length === 0 ? "Hali hech qanday amal qayd etilmagan" : "Filtr bo'yicha topilmadi"}
            </p>
            <p className="text-gray-300 text-sm mt-1">
              {log.length === 0
                ? "Admin amallari amalga oshirilganda bu yerda ko'rinadi"
                : "Filtr yoki qidiruvni o'zgartiring"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {paginated.map((entry) => {
              const cfg      = ACTION_CFG[entry.action] ?? DEFAULT_CFG;
              const expanded = expandedId === entry.id;
              const hasMeta  = !!entry.metadata && Object.keys(entry.metadata).length > 0;
              return (
                <div key={entry.id}
                  className="hover:bg-red-50/20 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : entry.id)}>
                  <div className="px-4 py-3 flex items-start gap-3">
                    {/* color dot */}
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                    {/* action badge */}
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wide flex-shrink-0 mt-0.5 ${cfg.badge}`}>
                      {entry.action}
                    </span>
                    {/* content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[9px] font-bold text-gray-400 uppercase">{ACTOR_LABELS[entry.actorRole] ?? entry.actorRole}</span>
                        {entry.targetId && (
                          <>
                            <span className="text-[9px] text-gray-300">→</span>
                            <span className="text-[9px] font-mono text-gray-400">{entry.targetId.slice(0, 18)}</span>
                          </>
                        )}
                        {entry.targetType && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                            {TARGET_LABELS[entry.targetType] ?? entry.targetType}
                          </span>
                        )}
                        {hasMeta && (
                          <span className="text-[8px] text-violet-500 font-bold">● metadata</span>
                        )}
                      </div>
                    </div>
                    {/* timestamp + chevron */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <p className="text-[10px] text-gray-400 whitespace-nowrap">{fmtDate(entry.createdAt)}</p>
                      {hasMeta && (
                        expanded
                          ? <ChevronUp   className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                  </div>
                  {/* expanded metadata panel */}
                  {expanded && hasMeta && (
                    <div className="px-4 pb-3 ml-5">
                      <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-2">Metadata</p>
                        <div className="space-y-1">
                          {Object.entries(entry.metadata!).map(([k, v]) => (
                            <div key={k} className="flex items-start gap-2">
                              <span className="text-[10px] font-bold text-gray-500 w-28 flex-shrink-0">{k}:</span>
                              <span className="text-[10px] font-mono text-gray-700">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            {filtered.length} ta yozuv · {page} / {pageCount} sahifa
          </p>
          <div className="flex gap-1.5">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              ← Oldingi
            </button>
            <button disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              Keyingi →
            </button>
          </div>
        </div>
      )}

      {/* result count when no pagination */}
      {pageCount <= 1 && filtered.length > 0 && (
        <p className="text-[11px] text-gray-400 text-right">
          {filtered.length} / {log.length} yozuv ko'rsatilmoqda
        </p>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ANNOUNCEMENTS SECTION
   ════════════════════════════════════════════════════════════════════ */
type AnnForm = Omit<Announcement, "id" | "createdAt" | "updatedAt">;
const EMPTY_FORM: AnnForm = {
  type: "news", title: "", content: "", image: "", ctaText: "", ctaLink: "",
  target: "all", isPinned: false, expiresAt: "", status: "draft", publishAt: "",
  titleLocalized: {}, contentLocalized: {}, ctaTextLocalized: {},
};

function AnnouncementsSection({ refreshKey }: { refreshKey: number }) {
  const [items, setItems]               = useState<Announcement[]>([]);
  const [editing, setEditing]           = useState<Announcement | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState<AnnForm>(EMPTY_FORM);
  const [preview, setPreview]           = useState<Announcement | null>(null);
  const [saving, setSaving]             = useState(false);
  const [contentTab, setContentTab]     = useState<"write" | "preview">("write");
  const [errors, setErrors]             = useState<Record<string, string>>({});

  function load() {
    getAllAnnouncements().then(setItems).catch((err) => console.error("Load announcements failed:", err));
  }
  useEffect(() => { load(); }, [refreshKey]);

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setErrors({}); setContentTab("write"); setShowForm(true); }
  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({
      type: a.type, title: a.title, content: a.content, image: a.image ?? "",
      ctaText: a.ctaText ?? "", ctaLink: a.ctaLink ?? "", target: a.target,
      isPinned: a.isPinned ?? false, expiresAt: a.expiresAt ?? "", status: a.status,
      publishAt: a.publishAt ?? "",
      titleLocalized:   a.titleLocalized   ?? {},
      contentLocalized: a.contentLocalized ?? {},
      ctaTextLocalized: a.ctaTextLocalized  ?? {},
    });
    setErrors({});
    setContentTab("write");
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditing(null); setErrors({}); }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Sarlavha majburiy";
    if (form.title.length > 120) e.title = "Sarlavha 120 belgidan oshmasin";
    if (!form.content.trim()) e.content = "Kontent majburiy";
    if (form.ctaText?.trim() && !form.ctaLink?.trim()) e.ctaLink = "CTA havolasi ham talab qilinadi";
    if (form.ctaLink?.trim() && !form.ctaText?.trim()) e.ctaText = "CTA matni ham talab qilinadi";
    if (form.ctaLink?.trim() && !form.ctaLink.startsWith("/") && !form.ctaLink.startsWith("http")) {
      e.ctaLink = "Havola / yoki https:// bilan boshlanishi kerak";
    }
    if (form.type === "event" && !form.expiresAt) {
      e.expiresAt = "Tadbirlar uchun muddat tavsiya etiladi";
    }
    setErrors(e);
    return !Object.keys(e).some((k) => k !== "expiresAt");
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => set("image", reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const hasTitleLoc = !!(form.titleLocalized?.ru?.trim());
    const hasContentLoc = !!(form.contentLocalized?.ru?.trim());
    const hasCtaLoc = !!(form.ctaTextLocalized?.ru?.trim());
    const payload = {
      ...form,
      id: editing?.id,
      image: form.image?.trim() || undefined,
      ctaText: form.ctaText?.trim() || undefined,
      ctaLink: form.ctaLink?.trim() || undefined,
      expiresAt: form.expiresAt?.trim() || undefined,
      publishAt: form.publishAt?.trim() || undefined,
      titleLocalized:   hasTitleLoc   ? { uz: form.title, ...form.titleLocalized }   : undefined,
      contentLocalized: hasContentLoc ? { uz: form.content, ...form.contentLocalized } : undefined,
      ctaTextLocalized: hasCtaLoc     ? form.ctaTextLocalized : undefined,
    };
    try {
      const saved = await saveAnnouncement(payload as Parameters<typeof saveAnnouncement>[0]);
      logAction({
        actorId: ADMIN_USER, actorRole: "admin",
        action: editing ? "ANNOUNCEMENT_UPDATED" : "ANNOUNCEMENT_CREATED",
        category: "admin", targetId: saved.id, targetType: "platform",
        description: `E'lon ${editing ? "tahrirlandi" : "yaratildi"}: ${saved.title}`,
        metadata: { title: saved.title, type: saved.type, status: saved.status },
      });
      load(); closeForm();
    } catch (err) {
      setErrors({ title: err instanceof AdminApiError ? err.message : "Saqlashda xatolik yuz berdi" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: Announcement) {
    if (!confirm(`"${a.title}" o'chirilsinmi?`)) return;
    try {
      await deleteAnnouncement(a.id);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "ANNOUNCEMENT_DELETED", category: "admin", targetId: a.id, targetType: "platform", description: `E'lon o'chirildi: ${a.title}` });
      load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  async function handleTogglePublish(a: Announcement) {
    try {
      const updated = await toggleAnnouncementPublished(a.id);
      logAction({ actorId: ADMIN_USER, actorRole: "admin", action: updated.status === "published" ? "ANNOUNCEMENT_PUBLISHED" : "ANNOUNCEMENT_UNPUBLISHED", category: "admin", targetId: a.id, targetType: "platform", description: `E'lon ${updated.status === "published" ? "chop etildi" : "qoralama qilindi"}: ${a.title}` });
      load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  async function handleTogglePin(a: Announcement) {
    try {
      await toggleAnnouncementPinned(a.id);
      load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  const f = form;
  const set = (k: keyof AnnForm, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const typeBadge = (t: Announcement["type"]) =>
    t === "event"
      ? "bg-orange-50 text-orange-700 border-orange-200"
      : "bg-blue-50 text-blue-700 border-blue-200";

  const statusBadge = (s: Announcement["status"]) =>
    s === "published"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-gray-100 text-gray-500 border-gray-200";

  const targetLabel = (t: Announcement["target"]) =>
    t === "all" ? "Hammaga" : t === "providers" ? "Ijrochilar" : "Mijozlar";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">E'lonlar (CMS)</h2>
          <p className="text-sm text-gray-400">Yangiliklar va tadbirlarni boshqarish</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg,#DC2626,#B91C1C)" }}>
          <Plus className="w-4 h-4" /> Yangi e'lon
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Jami",        val: items.length,                                    color: "text-gray-800"    },
          { label: "Chop etilgan", val: items.filter((a) => a.status === "published").length, color: "text-emerald-600" },
          { label: "Pinnlangan",   val: items.filter((a) => a.isPinned).length,           color: "text-amber-600"   },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="font-bold text-gray-400">Hali e'lon yo'q</p>
            <p className="text-sm text-gray-300 mt-1">Yangi e'lon yarating</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Tur", "Sarlavha", "Status", "Auditoriya", "Xususiyatlar", "Harakatlar"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge(a.type)}`}>
                        {a.type === "event" ? "Tadbir" : "Yangilik"}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="font-semibold text-gray-800 truncate">{a.title}</p>
                      <p className="text-[10px] text-gray-400 truncate">{a.content.slice(0, 60)}…</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => handleTogglePublish(a)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors hover:opacity-80 ${statusBadge(a.status)}`}>
                        {a.status === "published" ? "✓ Chop etilgan" : "Qoralama"}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-gray-600">{targetLabel(a.target)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-[10px]">
                        {a.isPinned && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold">📌 Pin</span>}
                        {a.expiresAt && <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full font-bold whitespace-nowrap">
                          ⏳ {new Date(a.expiresAt).toLocaleDateString("uz-UZ")}
                        </span>}
                        {a.ctaText && <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full font-bold">CTA</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPreview(a)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Ko'rinish">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleTogglePin(a)}
                          className={`p-1.5 rounded-lg transition-colors ${a.isPinned ? "text-amber-500 bg-amber-50" : "text-gray-400 hover:text-amber-500 hover:bg-amber-50"}`} title="Pin">
                          <Star className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(a)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors" title="Tahrirlash">
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(a)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="O'chirish">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create / Edit drawer ── */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
              onClick={closeForm}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed right-0 top-0 h-full z-[61] w-full max-w-5xl bg-gray-50 shadow-2xl flex flex-col"
            >
              {/* ── Drawer header ── */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
                <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-extrabold text-gray-900 text-sm">{editing ? "E'lonni tahrirlash" : "Yangi e'lon yaratish"}</h2>
                  <p className="text-[10px] text-gray-400">Barcha o'zgarishlar avtomatik saqlanmaydi</p>
                </div>
                <button onClick={closeForm} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Two-column body ── */}
              <div className="flex flex-1 overflow-hidden">

                {/* LEFT: form */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 border-r border-gray-200">

                  {/* 📌 Asosiy ma'lumot */}
                  <section>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">📌 Asosiy ma'lumot</p>
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-gray-600">Sarlavha *</label>
                          <span className={`text-[10px] font-mono ${f.title.length > 100 ? "text-orange-500" : "text-gray-400"}`}>
                            {f.title.length}/120
                          </span>
                        </div>
                        <input
                          value={f.title}
                          onChange={(e) => set("title", e.target.value.slice(0, 120))}
                          className={`${inputCls} w-full ${errors.title ? "border-red-400 bg-red-50" : ""}`}
                          placeholder="E'lon sarlavhasi..."
                        />
                        {errors.title && <p className="text-[10px] text-red-500 mt-0.5">⚠ {errors.title}</p>}
                      </div>

                      {/* ── Russian title translation ────────────── */}
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">🇷🇺 Sarlavha (Русский, tavsiya)</p>
                        <div className={`rounded-xl border p-2.5 ${(f.titleLocalized?.ru ?? "").trim() ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200"}`}>
                          <div className="flex items-center gap-1 mb-1.5">
                            <span className="text-xs">🇷🇺</span>
                            <span className="text-[9px] font-bold text-gray-500 uppercase flex-1">Русский</span>
                            {(f.titleLocalized?.ru ?? "").trim() && <span className="text-[9px] text-emerald-600 font-bold">✅</span>}
                          </div>
                          <input
                            value={f.titleLocalized?.ru ?? ""}
                            onChange={(e) => set("titleLocalized", { ...(f.titleLocalized ?? {}), ru: e.target.value.slice(0, 120) })}
                            placeholder="Sarlavha (ru)"
                            className={`${inputCls} w-full text-xs`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-600 mb-1 block">Tur</label>
                          <select value={f.type} onChange={(e) => set("type", e.target.value)} className={`${inputCls} w-full`}>
                            <option value="news">📰 Yangilik</option>
                            <option value="event">🎯 Tadbir</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 mb-1 block">Auditoriya</label>
                          <select value={f.target} onChange={(e) => set("target", e.target.value as Announcement["target"])} className={`${inputCls} w-full`}>
                            <option value="all">👥 Hammaga</option>
                            <option value="providers">🔧 Ijrochilar</option>
                            <option value="customers">🛍 Mijozlar</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="border-t border-gray-200" />

                  {/* 🖼 Media */}
                  <section>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🖼 Muqova rasmi</p>
                    {f.image ? (
                      <div className="relative">
                        <img
                          src={f.image} alt="cover"
                          className="w-full h-40 object-cover rounded-xl border border-gray-200"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <button
                          onClick={() => set("image", "")}
                          className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur text-xs font-bold text-red-600 border border-red-200 shadow hover:bg-red-50 transition-colors"
                        >
                          🗑 O'chirish
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-colors group">
                        <div className="text-center">
                          <div className="text-2xl mb-1">📷</div>
                          <p className="text-xs font-semibold text-gray-500 group-hover:text-red-600">Rasm yuklash</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, WebP · Maks 5 MB</p>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </label>
                    )}
                  </section>

                  <div className="border-t border-gray-200" />

                  {/* 📝 Kontent */}
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">📝 Kontent *</p>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => setContentTab("write")}
                          className={`px-3 py-1 text-[10px] font-bold transition-colors ${contentTab === "write" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                        >
                          ✏️ Yozish
                        </button>
                        <button
                          onClick={() => setContentTab("preview")}
                          className={`px-3 py-1 text-[10px] font-bold transition-colors ${contentTab === "preview" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                        >
                          👁 Ko'rish
                        </button>
                      </div>
                    </div>
                    {contentTab === "write" ? (
                      <textarea
                        value={f.content}
                        onChange={(e) => set("content", e.target.value)}
                        rows={8}
                        className={`${inputCls} w-full resize-y min-h-[160px] font-mono text-sm ${errors.content ? "border-red-400 bg-red-50" : ""}`}
                        placeholder={"E'lon matni...\n\n**Qalin** matn, *kursiv*, - ro'yxat\n\nMarkdown qo'llab-quvvatlanadi."}
                      />
                    ) : (
                      <div className="min-h-[160px] p-4 bg-white rounded-xl border border-gray-200 text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none overflow-auto">
                        {f.content ? (
                          <ReactMarkdown>{f.content}</ReactMarkdown>
                        ) : (
                          <p className="text-gray-400 italic">Hali kontent yo'q…</p>
                        )}
                      </div>
                    )}
                    {errors.content && <p className="text-[10px] text-red-500 mt-0.5">⚠ {errors.content}</p>}

                    {/* ── Russian content translation ──────────── */}
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">🇷🇺 Kontent (Русский, tavsiya)</p>
                      <div className={`rounded-xl border p-2.5 ${(f.contentLocalized?.ru ?? "").trim() ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200"}`}>
                        <div className="flex items-center gap-1 mb-1.5">
                          <span className="text-xs">🇷🇺</span>
                          <span className="text-[9px] font-bold text-gray-500 uppercase flex-1">Русский</span>
                          {(f.contentLocalized?.ru ?? "").trim() && <span className="text-[9px] text-emerald-600 font-bold">✅</span>}
                        </div>
                        <textarea
                          value={f.contentLocalized?.ru ?? ""}
                          onChange={(e) => set("contentLocalized", { ...(f.contentLocalized ?? {}), ru: e.target.value })}
                          rows={4}
                          placeholder="Kontent (ru) — Markdown qo'llab-quvvatlanadi"
                          className={`${inputCls} w-full resize-y min-h-[80px] font-mono text-xs`}
                        />
                      </div>
                    </div>
                  </section>

                  <div className="border-t border-gray-200" />

                  {/* 🎯 CTA */}
                  <section>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">🎯 CTA tugma (ixtiyoriy)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Tugma matni</label>
                        <input
                          value={f.ctaText ?? ""}
                          onChange={(e) => set("ctaText", e.target.value)}
                          className={`${inputCls} w-full ${errors.ctaText ? "border-red-400" : ""}`}
                          placeholder="Tanga sotib olish"
                        />
                        {errors.ctaText && <p className="text-[10px] text-red-500 mt-0.5">⚠ {errors.ctaText}</p>}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Havola</label>
                        <input
                          value={f.ctaLink ?? ""}
                          onChange={(e) => set("ctaLink", e.target.value)}
                          className={`${inputCls} w-full ${errors.ctaLink ? "border-red-400" : ""}`}
                          placeholder="/plans yoki https://..."
                        />
                        {errors.ctaLink && <p className="text-[10px] text-red-500 mt-0.5">⚠ {errors.ctaLink}</p>}
                      </div>
                    </div>
                  </section>

                  <div className="border-t border-gray-200" />

                  {/* ⚙️ Ko'rinish */}
                  <section>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">⚙️ Ko'rinish va rejalashtirish</p>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-600 mb-1 block">Status</label>
                          <select value={f.status} onChange={(e) => set("status", e.target.value as Announcement["status"])} className={`${inputCls} w-full`}>
                            <option value="draft">📝 Qoralama</option>
                            <option value="published">✅ Chop etilgan</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 mb-1 block">
                            Muddat {f.type === "event" && <span className="text-orange-500">(tavsiya)</span>}
                          </label>
                          <input
                            type="date"
                            value={f.expiresAt ?? ""}
                            onChange={(e) => set("expiresAt", e.target.value)}
                            className={`${inputCls} w-full ${errors.expiresAt ? "border-orange-400" : ""}`}
                          />
                          {errors.expiresAt && <p className="text-[10px] text-orange-500 mt-0.5">⚠ {errors.expiresAt}</p>}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">
                          🕐 Rejalashtirish (ixtiyoriy)
                        </label>
                        <input
                          type="datetime-local"
                          value={f.publishAt ?? ""}
                          onChange={(e) => set("publishAt", e.target.value)}
                          className={`${inputCls} w-full`}
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Belgilangan vaqtda avtomatik chop etiladi</p>
                      </div>
                      <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <input
                          type="checkbox"
                          checked={f.isPinned ?? false}
                          onChange={(e) => set("isPinned", e.target.checked)}
                          className="w-4 h-4 rounded accent-amber-500"
                        />
                        <div>
                          <p className="text-sm font-bold text-amber-800">📌 Tepada qo'yish</p>
                          <p className="text-[10px] text-amber-600">Barcha e'lonlar ustida ko'rinadi</p>
                        </div>
                      </label>
                    </div>
                  </section>
                </div>

                {/* RIGHT: live preview */}
                <div className="w-80 flex-shrink-0 overflow-y-auto p-5 bg-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">👁 Jonli ko'rinish</p>

                  {/* Provider-home-style card preview */}
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    {f.image ? (
                      <img
                        src={f.image} alt="preview"
                        className="w-full h-28 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-full h-20 bg-gradient-to-r from-gray-100 to-gray-200 flex items-center justify-center">
                        <span className="text-2xl opacity-30">🖼</span>
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                          f.type === "event" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {f.type === "event" ? "🎯 Tadbir" : "📰 Yangilik"}
                        </span>
                        {f.isPinned && <span className="text-xs">📌</span>}
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">Yangi</span>
                      </div>
                      <p className="font-bold text-gray-900 text-sm leading-snug mb-1">
                        {f.title || <span className="text-gray-400 italic">Sarlavha…</span>}
                      </p>
                      <div className="text-xs text-gray-500 leading-snug line-clamp-3 prose prose-xs max-w-none">
                        {f.content ? (
                          <ReactMarkdown>{f.content.slice(0, 200) + (f.content.length > 200 ? "…" : "")}</ReactMarkdown>
                        ) : (
                          <span className="italic text-gray-400">Kontent…</span>
                        )}
                      </div>
                      {f.ctaText && (
                        <div className="mt-3">
                          <span
                            className="inline-block px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                            style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}
                          >
                            {f.ctaText}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status preview */}
                  <div className="mt-4 p-3 rounded-xl bg-white border border-gray-200 space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Ma'lumotlar</p>
                    {[
                      { label: "Status", val: f.status === "published" ? "✅ Chop etilgan" : "📝 Qoralama" },
                      { label: "Auditoriya", val: f.target === "all" ? "👥 Hammaga" : f.target === "providers" ? "🔧 Ijrochilar" : "🛍 Mijozlar" },
                      { label: "Muddat", val: f.expiresAt ? new Date(f.expiresAt).toLocaleDateString("uz-UZ") : "—" },
                      { label: "Chop etish vaqti", val: f.publishAt ? new Date(f.publishAt).toLocaleString("uz-UZ") : "Darhol" },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-400">{row.label}</span>
                        <span className="text-[10px] font-semibold text-gray-700">{row.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Drawer footer ── */}
              <div className="flex gap-2 px-6 py-4 border-t border-gray-200 bg-white flex-shrink-0">
                <button onClick={closeForm} className="px-5 py-2.5 rounded-xl font-bold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  Bekor qilish
                </button>
                <div className="flex-1" />
                {Object.keys(errors).length > 0 && (
                  <p className="text-xs text-red-500 self-center">{Object.keys(errors).filter(k => k !== "expiresAt").length} xato bor</p>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#DC2626,#B91C1C)" }}
                >
                  {saving ? "Saqlanmoqda…" : editing ? "💾 Saqlash" : "✅ Yaratish"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Preview modal ── */}
      <AnimatePresence>
        {preview && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
              onClick={() => setPreview(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="fixed inset-x-4 top-[10vh] z-[71] max-w-md mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {preview.image && (
                <img src={preview.image} alt={preview.title} className="w-full h-44 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge(preview.type)}`}>
                    {preview.type === "event" ? "Tadbir" : "Yangilik"}
                  </span>
                  {preview.isPinned && <span className="text-sm">📌</span>}
                </div>
                <h3 className="font-extrabold text-gray-900 text-base leading-snug">{preview.title}</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{preview.content}</p>
                {preview.ctaText && preview.ctaLink && (
                  <div className="pt-1">
                    <span className="inline-block px-4 py-2 rounded-xl text-sm font-bold text-white"
                      style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}>
                      {preview.ctaText}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-gray-400">{targetLabel(preview.target)} · {new Date(preview.createdAt).toLocaleDateString("uz-UZ")}</p>
              </div>
              <div className="px-5 pb-5">
                <button onClick={() => setPreview(null)}
                  className="w-full py-2.5 rounded-xl font-bold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  Yopish
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoriesSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-gray-900">Kategoriyalar va Savollar</h2>
        <p className="text-sm text-gray-500">Kategoriyalarni boshqaring, savol va variantlarni tahrirlang</p>
      </div>
      <CategoryManagementPanel />
      <QuestionsEmbedded />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CATEGORY MANAGEMENT PANEL — ID-based CRUD
   ════════════════════════════════════════════════════════════════════ */
function CategoryManagementPanel() {
  const [cats, setCats] = useState<AdminCategoryRow[]>([]);
  const [editing, setEditing] = useState<AdminCategoryRow | null>(null);
  const [creating, setCreating] = useState(false);

  function reload() {
    setCats(getAllAdminCategories());
  }
  useEffect(() => {
    reload();
    return onStoreChange(reload);
  }, []);

  async function handleToggleActive(id: string, active: boolean) {
    if (!active) {
      const row = cats.find((c) => c.id === id);
      const consequences =
        `«${row?.nameUz ?? id}» kategoriyasini o'chirasizmi?\n\n` +
        `• Yangi mijozlar bu kategoriya bo'yicha so'rov yarata olmaydi.\n` +
        `• Mavjud so'rovlar va profillar saqlanib qoladi (faqat yashiriladi).\n` +
        `• Provayder shu kategoriyani tanlay olmaydi.\n` +
        `• Istalgan vaqtda qayta yoqishingiz mumkin.\n\n` +
        `Davom etamizmi?`;
      if (!confirm(consequences)) return;
    }
    await setAdminCategoryActive(id, active);
    logAction({
      actorId: ADMIN_USER, actorRole: "admin",
      action: active ? "CATEGORY_ENABLED" : "CATEGORY_DISABLED",
      category: "admin", targetId: id, targetType: "platform",
      description: `Kategoriya ${active ? "yoqildi" : "o'chirildi"}: ${id}`,
    });
    reload();
  }

  async function handleDelete(id: string) {
    const row = cats.find((c) => c.id === id);
    if (!row) return;
    const consequences =
      `«${row.nameUz}» kategoriyasini BUTUNLAY o'chirasizmi?\n\n` +
      (row.builtIn
        ? `• Bu ASOSIY (standart) kategoriya — uni o'chirish ilova bo'ylab kategoriya tanlovlariga ta'sir qilishi mumkin.\n`
        : ``) +
      `• Bu amalni ORQAGA QAYTARIB BO'LMAYDI.\n` +
      `• Shu kategoriyaga bog'liq eski so'rovlar/profillarda ID saqlanib qoladi, lekin nomi ko'rinmay qoladi.\n\n` +
      `Agar shunchaki yashirmoqchi bo'lsangiz, "Faol" tugmasidan foydalaning.\n\n` +
      `Davom etamizmi?`;
    if (!confirm(consequences)) return;

    const result = await deleteAdminCategory(id);
    if (!result.ok) {
      alert("Kategoriyani o'chirib bo'lmadi.");
      return;
    }
    logAction({
      actorId: ADMIN_USER, actorRole: "admin",
      action: "CATEGORY_DELETED",
      category: "admin", targetId: id, targetType: "platform",
      description: `Kategoriya o'chirildi: ${id}`,
    });
    reload();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 bg-gradient-to-r from-rose-50 to-orange-50">
        <div className="w-9 h-9 rounded-xl bg-white border border-rose-100 flex items-center justify-center flex-shrink-0">
          <Tag className="w-4 h-4 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-sm text-gray-900">Kategoriyalar boshqaruvi</p>
          <p className="text-xs text-gray-500">
            Kategoriyalar ID orqali bog'lanadi — ismni o'zgartirish ijrochi profillariga ta'sir qilmaydi.
            Har qanday kategoriyani (shu jumladan ASOSIY) butunlay o'chirish mumkin — ehtiyot bo'ling, bu amalni qaytarib bo'lmaydi.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}
          className="h-9 px-4 font-bold text-sm gap-2 bg-rose-600 hover:bg-rose-700 flex-shrink-0">
          <Plus className="w-4 h-4" /> Yangi kategoriya
        </Button>
      </div>

      <div className="divide-y divide-gray-50">
        {cats.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Hali kategoriya yo'q</div>
        )}
        {cats.map((row) => (
          <div key={row.id} className={`px-5 py-3 flex items-center gap-3 ${!row.active ? "opacity-60" : ""}`}>
            <CategoryIcon
              categoryId={row.id}
              size={40}
              shape="square"
              shadow={!!row.gradient || !!row.icon}
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sm text-gray-900 truncate">{row.nameUz}</p>
                <span className="text-xs text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 flex-shrink-0">
                  {row.id}
                </span>
                {row.builtIn && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    Asosiy
                  </span>
                )}
                {!row.active && (
                  <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    O'chirilgan
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-2 flex-wrap">
                <span><span className="font-semibold">RU:</span> {row.nameRu || <span className="text-amber-600">tarjima yo'q ⚠️</span>}</span>
                <span className="text-gray-300">·</span>
                <span><span className="font-semibold">EN:</span> {row.nameEn || <span className="text-amber-600">tarjima yo'q ⚠️</span>}</span>
                <span className="text-gray-300">·</span>
                <span className="font-semibold text-violet-600">{row.questionCount} savol</span>
                {row.baseCost > 0 && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-amber-700 font-semibold">{row.baseCost} Tanga</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleToggleActive(row.id, !row.active)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${row.active ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100" : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"}`}
                title={row.active ? "Bosib o'chirish" : "Bosib yoqish"}
              >
                {row.active ? "Faol" : "O'chirilgan"}
              </button>
              <button onClick={() => setEditing(row)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(row.id)}
                title="Butunlay o'chirish"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {(editing || creating) && (
          <CategoryEditorModal
            initial={editing}
            onClose={() => { setEditing(null); setCreating(false); }}
            onSaved={(id, isNew) => {
              logAction({
                actorId: ADMIN_USER, actorRole: "admin",
                action: isNew ? "CATEGORY_CREATED" : "CATEGORY_UPDATED",
                category: "admin", targetId: id, targetType: "platform",
                description: `Kategoriya ${isNew ? "yaratildi" : "yangilandi"}: ${id}`,
              });
              setEditing(null); setCreating(false);
              reload();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Category editor modal ──────────────────────────────────────── */
/** Slugify a UZ name into a canonical category ID (a-z, 0-9, _). */
function slugifyCategoryId(name: string): string {
  return name
    .toLowerCase()
    .replace(/['ʻʼ’`]/g, "")
    .replace(/ў/g, "u").replace(/ғ/g, "g").replace(/ҳ/g, "h").replace(/қ/g, "q")
    .replace(/ё/g, "yo").replace(/ю/g, "yu").replace(/я/g, "ya").replace(/ч/g, "ch")
    .replace(/ш/g, "sh").replace(/ж/g, "j").replace(/ц/g, "ts")
    .replace(/[аэ]/g, "a").replace(/[еэ]/g, "e").replace(/и/g, "i").replace(/о/g, "o")
    .replace(/у/g, "u").replace(/ы/g, "y").replace(/б/g, "b").replace(/в/g, "v")
    .replace(/г/g, "g").replace(/д/g, "d").replace(/з/g, "z").replace(/к/g, "k")
    .replace(/л/g, "l").replace(/м/g, "m").replace(/н/g, "n").replace(/п/g, "p")
    .replace(/р/g, "r").replace(/с/g, "s").replace(/т/g, "t").replace(/ф/g, "f")
    .replace(/х/g, "x").replace(/[ьъ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function CategoryEditorModal({
  initial, onClose, onSaved,
}: {
  initial: AdminCategoryRow | null;
  onClose: () => void;
  onSaved: (id: string, isNew: boolean) => void;
}) {
  const isNew = !initial;
  const [nameUz, setNameUz] = useState(initial?.nameUz ?? "");
  const [nameRu, setNameRu] = useState(initial?.nameRu ?? "");
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? "");
  const [descUz, setDescUz] = useState(initial?.descriptionUz ?? "");
  const [descRu, setDescRu] = useState(initial?.descriptionRu ?? "");
  const [descEn, setDescEn] = useState(initial?.descriptionEn ?? "");
  const [parentCategoryId, setParentCategoryId] = useState<string>(initial?.parentCategoryId ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "📋");
  // Auto-suggest a curated icon for legacy emoji-only categories so admins
  // don't have to start from a blank picker.
  const [icon, setIcon] = useState<string | undefined>(
    initial?.icon ?? (initial?.emoji ? suggestIconFromEmoji(initial.emoji) : undefined),
  );
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLOR_PRESETS[0]);
  const [gradient, setGradient] = useState<string | null>(initial?.gradient ?? null);
  const [baseCost, setBaseCost] = useState(String(initial?.baseCost ?? 0));
  const [active, setActive] = useState(initial?.active !== false);
  const [error, setError] = useState("");
  const [translating, setTranslating] = useState(false);

  // Auto-generated preview ID (new categories only). On save we ensure uniqueness.
  const previewId = isNew ? slugifyCategoryId(nameUz) : initial!.id;

  /* Auto-fires once when the admin leaves the Uzbek name field, as long as
   * RU/EN are both still untouched — mirrors the question editor's
   * fire-once-on-empty-tab behavior without a tab switcher to hang it off. */
  function handleNameUzBlur() {
    if (nameUz.trim() && !nameRu.trim() && !nameEn.trim()) void handleAutoTranslate();
  }

  /* Opening an existing category that already has an Uzbek name but no
   * RU/EN translates proactively on open — so it's filled in without the
   * admin needing to touch (blur) the name field at all. */
  useEffect(() => {
    if (initial && initial.nameUz.trim() && !initial.nameRu.trim() && !initial.nameEn.trim()) {
      void handleAutoTranslate();
    }
    // Mount-only: translates the as-opened Uzbek name, not live keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAutoTranslate() {
    if (!nameUz.trim()) { setError("Avval o'zbekcha nomini kiriting"); return; }
    setError("");
    setTranslating(true);
    try {
      const [ru, en] = await Promise.all([
        translateTexts([nameUz, descUz], "ru"),
        translateTexts([nameUz, descUz], "en"),
      ]);
      setNameRu(ru[0] || nameRu);
      if (descUz.trim()) setDescRu(ru[1] || descRu);
      setNameEn(en[0] || nameEn);
      if (descUz.trim()) setDescEn(en[1] || descEn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tarjima qilib bo'lmadi");
    } finally {
      setTranslating(false);
    }
  }

  async function handleSave() {
    setError("");
    if (!nameUz.trim()) { setError("O'zbekcha nomini kiriting"); return; }

    let finalId = initial?.id ?? slugifyCategoryId(nameUz);
    if (!finalId) { setError("Nomdan ID yaratib bo'lmadi — boshqa nom kiriting"); return; }

    // Ensure uniqueness for new categories by appending a numeric suffix.
    if (isNew) {
      const existing = new Set(getAllAdminCategories().map((c) => c.id));
      if (existing.has(finalId)) {
        let n = 2;
        while (existing.has(`${finalId}_${n}`)) n++;
        finalId = `${finalId}_${n}`;
      }
    }

    const cost = parseInt(baseCost, 10);
    const descriptionLocalized = (descUz.trim() || descRu.trim() || descEn.trim())
      ? {
          ...(descUz.trim() ? { uz: descUz.trim() } : {}),
          ...(descRu.trim() ? { ru: descRu.trim() } : {}),
          ...(descEn.trim() ? { en: descEn.trim() } : {}),
        }
      : undefined;
    try {
      await upsertAdminCategory({
        id: finalId,
        nameLocalized: {
          uz: nameUz.trim(),
          ...(nameRu.trim() ? { ru: nameRu.trim() } : {}),
          ...(nameEn.trim() ? { en: nameEn.trim() } : {}),
        },
        ...(descriptionLocalized ? { descriptionLocalized } : {}),
        emoji, // kept as legacy fallback
        icon: icon ?? undefined,
        iconFamily: icon ? "phosphor" : undefined,
        color,
        gradient: gradient ?? null,
        baseCost: isNaN(cost) ? 0 : Math.max(0, cost),
        active,
        parentCategoryId: parentCategoryId.trim() || null,
      });
      onSaved(finalId, isNew);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlab bo'lmadi");
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-0 z-[71] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
      >
        <div className="bg-white w-full sm:rounded-3xl sm:max-w-lg max-h-[95vh] overflow-y-auto shadow-2xl pointer-events-auto">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 bg-white z-10">
            <CategoryIcon
              icon={icon}
              color={color}
              gradient={gradient}
              emoji={emoji}
              size={36}
              shape="square"
              shadow={!!gradient || !!icon}
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-900 text-base">
                {isNew ? "Yangi kategoriya" : "Kategoriyani tahrirlash"}
              </p>
              <p className="text-xs text-gray-400 truncate">
                ID: <span className="font-mono">{previewId || "—"}</span>
                {isNew && <span className="ml-1 text-gray-400">(nomdan yaratiladi)</span>}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Read-only internal ID field */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Ichki ID
                {isNew && <span className="ml-1.5 text-gray-400 font-normal normal-case">(o'zbek nomidan yaratiladi)</span>}
                {!isNew && <span className="ml-1.5 text-gray-400 font-normal normal-case">(o'zgartirib bo'lmaydi)</span>}
              </label>
              <input
                readOnly
                value={previewId || "—"}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 text-sm font-mono text-gray-500 cursor-not-allowed select-all"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400">
                Nomi va tavsifi
              </label>
              <button type="button" onClick={handleAutoTranslate} disabled={translating || !nameUz.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                Ruscha/Inglizchaga tarjima qilish
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  O'zbekcha nom <span className="text-rose-500">*</span>
                </label>
                <input value={nameUz} onChange={(e) => setNameUz(e.target.value)} onBlur={handleNameUzBlur}
                  placeholder="Tozalash"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  Ruscha nom
                </label>
                <input value={nameRu} onChange={(e) => setNameRu(e.target.value)}
                  placeholder="Уборка"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  Inglizcha nom
                </label>
                <input value={nameEn} onChange={(e) => setNameEn(e.target.value)}
                  placeholder="Cleaning"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  O'zbekcha tavsif
                </label>
                <textarea value={descUz} onChange={(e) => setDescUz(e.target.value)}
                  rows={2}
                  placeholder="Qisqacha izoh (ixtiyoriy)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none" />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  Ruscha tavsif
                </label>
                <textarea value={descRu} onChange={(e) => setDescRu(e.target.value)}
                  rows={2}
                  placeholder="Краткое описание (необязательно)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none" />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  Inglizcha tavsif
                </label>
                <textarea value={descEn} onChange={(e) => setDescEn(e.target.value)}
                  rows={2}
                  placeholder="Short description (optional)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Ota-kategoriya
                <span className="ml-2 text-gray-400 font-normal normal-case">(ixtiyoriy — quyi kategoriya uchun)</span>
              </label>
              <select value={parentCategoryId} onChange={(e) => setParentCategoryId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400">
                <option value="">— yo'q (asosiy kategoriya) —</option>
                {getAllAdminCategories()
                  .filter((c) => c.id !== initial?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.nameUz} ({c.id})</option>
                  ))}
              </select>
            </div>

            {/* ── Icon picker ───────────────────────────────────────── */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Ikona
                {!icon && emoji && (
                  <span className="ml-1.5 text-amber-600 font-normal normal-case">(eski emoji ishlatilmoqda)</span>
                )}
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {CATEGORY_ICONS.map((def) => {
                  const Icon = def.Component;
                  const selected = icon === def.name;
                  return (
                    <button
                      key={def.name}
                      type="button"
                      onClick={() => setIcon(def.name)}
                      title={def.label}
                      className={`aspect-square rounded-xl flex items-center justify-center transition-all ${
                        selected
                          ? "bg-blue-50 border-2 border-blue-500 scale-105 shadow-sm"
                          : "bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:scale-105"
                      }`}
                    >
                      <Icon size={20} weight="fill" className={selected ? "text-blue-600" : "text-gray-700"} />
                    </button>
                  );
                })}
              </div>
              {icon && (
                <button
                  type="button"
                  onClick={() => setIcon(undefined)}
                  className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 font-semibold"
                >
                  ✕ Ikonani olib tashlash
                </button>
              )}
            </div>

            {/* ── Solid color ──────────────────────────────────────── */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Rang
                {gradient && (
                  <span className="ml-1.5 text-gray-400 font-normal normal-case">(gradient ustun keladi)</span>
                )}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-10 rounded-full border border-gray-200 cursor-pointer p-0 overflow-hidden" />
                {CATEGORY_COLOR_PRESETS.map((c) => {
                  const selected = !gradient && color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-9 h-9 rounded-full transition-all hover:scale-110 ${
                        selected ? "ring-2 ring-offset-2 ring-gray-900 scale-110" : ""
                      }`}
                      style={{ background: c }}
                      title={c}
                    />
                  );
                })}
              </div>
            </div>

            {/* ── Gradient presets ─────────────────────────────────── */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Gradient
                <span className="ml-1.5 text-gray-400 font-normal normal-case">(ixtiyoriy — rangdan ustun)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setGradient(null)}
                  className={`px-3 h-9 rounded-full text-[11px] font-bold transition-all ${
                    !gradient
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  Yo'q
                </button>
                {GRADIENT_PRESETS.map((g) => {
                  const selected = gradient === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGradient(g.id)}
                      title={g.label}
                      className={`relative h-9 px-3 rounded-full text-[11px] font-bold text-white transition-all hover:scale-105 ${
                        selected ? "ring-2 ring-offset-2 ring-gray-900 scale-105" : ""
                      }`}
                      style={{ background: g.css }}
                    >
                      {g.label}
                      {selected && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow">
                          <Check className="w-3 h-3 text-emerald-600" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Live preview card ────────────────────────────────── */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                Ko'rinish
              </label>
              <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 flex items-center gap-3">
                <CategoryIcon
                  icon={icon}
                  color={color}
                  gradient={gradient}
                  emoji={emoji}
                  size={56}
                  shape="square"
                  shadow={!!gradient || !!icon}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-gray-900 text-sm truncate">
                    {nameUz.trim() || "Kategoriya nomi"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {(descUz.trim() || nameRu.trim()) || "Xizmat kategoriyasi"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  Asosiy narx (Tanga)
                </label>
                <input type="number" min="0" value={baseCost} onChange={(e) => setBaseCost(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">Holat</label>
                <button type="button" onClick={() => setActive(!active)}
                  className={`w-full h-12 rounded-xl border-2 text-sm font-bold transition-all ${active ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-gray-50 border-gray-300 text-gray-500"}`}>
                  {active ? "✓ Faol" : "○ O'chirilgan"}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
            <Button variant="outline" onClick={onClose} className="flex-1 font-semibold border-gray-200">Bekor qilish</Button>
            <Button onClick={handleSave} className="flex-1 font-bold bg-rose-600 hover:bg-rose-700 gap-2">
              <Save className="w-4 h-4" /> {isNew ? "Yaratish" : "Saqlash"}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

interface AdminCategoryRow {
  id: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  descriptionUz: string;
  descriptionRu: string;
  descriptionEn: string;
  parentCategoryId: string | null;
  emoji: string;
  icon?: string;
  iconFamily?: string;
  color: string;
  gradient?: string | null;
  baseCost: number;
  active: boolean;
  builtIn: boolean;
  questionCount: number;
}

function getAllAdminCategories(): AdminCategoryRow[] {
  return getAllCategoriesFromStore().map((c) => {
    let qCount = 0;
    try { qCount = getCategorySpecificQuestionCount(c.id); } catch { /* noop */ }
    return {
      id: c.id,
      nameUz: c.nameLocalized.uz ?? "",
      nameRu: c.nameLocalized.ru ?? "",
      nameEn: c.nameLocalized.en ?? "",
      descriptionUz: c.descriptionLocalized?.uz ?? "",
      descriptionRu: c.descriptionLocalized?.ru ?? "",
      descriptionEn: c.descriptionLocalized?.en ?? "",
      parentCategoryId: c.parentCategoryId ?? null,
      emoji: c.emoji,
      icon: c.icon,
      iconFamily: c.iconFamily,
      color: c.color,
      gradient: c.gradient ?? null,
      baseCost: c.baseCost,
      active: c.active,
      builtIn: c.builtIn,
      questionCount: qCount,
    };
  });
}

/* ════════════════════════════════════════════════════════════════════
   REPORTS SECTION
   ════════════════════════════════════════════════════════════════════ */
const REASON_LABELS: Record<string, string> = {
  spam:                  "Spam",
  fake_profile:          "Soxta profil",
  abuse:                 "Qo'pol muomala",
  fraud:                 "Firibgarlik",
  inappropriate_content: "Nomaqul kontent",
  outside_contact:       "Xizmatdan tashqari aloqa",
  other:                 "Boshqa",
};
const RPT_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  new:        { label: "Yangi",               cls: "bg-rose-50 text-rose-700 border-rose-200" },
  in_review:  { label: "Ko'rib chiqilmoqda",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  resolved:   { label: "Hal qilindi",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  dismissed:  { label: "Rad etildi",          cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

/* Resolves reporter/reported names against the real backend user list
   (fetchAdminUsers), not the per-browser hormang_auth_users cache — a report
   filed from any device must still show a readable name here. */
let userResolveCache = new Map<string, { name: string; initials: string; role: "provider" | "customer" }>();
async function refreshUserResolveCache(): Promise<void> {
  try {
    const { users } = await fetchAdminUsers();
    userResolveCache = new Map(users.map((u) => {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Foydalanuvchi";
      const initials = ((u.firstName?.[0] ?? "") + (u.lastName?.[0] ?? "")).toUpperCase() || name[0]?.toUpperCase() || "U";
      return [u.id, { name, initials, role: u.role === "provider" ? "provider" as const : "customer" as const }];
    }));
  } catch (err) {
    console.error("Load admin users for resolveUser failed:", err);
  }
}
function resolveUser(userId: string): { name: string; initials: string; role: "provider" | "customer" } {
  return userResolveCache.get(userId) ?? { name: userId.slice(0, 8) + "…", initials: "?", role: "customer" };
}

function UserPill({ userId }: { userId: string }) {
  const { name, initials, role } = resolveUser(userId);
  const bg = role === "provider" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700";
  const badge = role === "provider" ? "bg-violet-50 text-violet-700 border-violet-100" : "bg-blue-50 text-blue-700 border-blue-100";
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-extrabold flex-shrink-0 ${bg}`}>
        {initials}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-800 leading-tight whitespace-nowrap">{name}</p>
        <span className={`text-[8px] font-bold px-1 py-0.5 rounded border ${badge}`}>
          {role === "provider" ? "Ijrochi" : "Mijoz"}
        </span>
      </div>
    </div>
  );
}

function ReportsSection({ refreshKey }: { refreshKey: number }) {
  const [reports,     setReports]     = useState<UserReport[]>([]);
  const [filterStatus, setFilterStatus] = useState<RptStatus | "all">("all");
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [noteInputs,  setNoteInputs]  = useState<Record<string, string>>({});

  function load() {
    Promise.all([getAllReports(), refreshUserResolveCache()])
      .then(([r]) => setReports(r))
      .catch((err) => console.error("Load reports failed:", err));
  }
  useEffect(() => { load(); }, [refreshKey]);

  async function changeStatus(id: string, status: RptStatus) {
    try {
      await updateReportStatus(id, status, noteInputs[id]);
      load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  async function saveNote(id: string) {
    const r = reports.find((r) => r.id === id);
    if (!r) return;
    try {
      await updateReportStatus(id, r.status, noteInputs[id]);
      load();
    } catch (err) {
      alert(err instanceof AdminApiError ? err.message : "Xatolik yuz berdi");
    }
  }

  const filtered = filterStatus === "all"
    ? reports
    : reports.filter((r) => r.status === filterStatus);

  const newCount       = reports.filter((r) => r.status === "new").length;
  const inReviewCount  = reports.filter((r) => r.status === "in_review").length;
  const resolvedCount  = reports.filter((r) => r.status === "resolved").length;
  const dismissedCount = reports.filter((r) => r.status === "dismissed").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">Foydalanuvchi Shikoyatlari</h2>
          <p className="text-sm text-gray-500 mt-0.5">Barcha shikoyatlarni ko'rib chiqing va boshqaring</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition-colors border border-red-100 flex-shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Yangilash
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Jami",               value: reports.length, color: "text-gray-900",    cls: "bg-gray-50 text-gray-400" },
          { label: "Yangi",              value: newCount,       color: "text-rose-700",    cls: "bg-rose-50 text-rose-400" },
          { label: "Ko'rib chiqilmoqda", value: inReviewCount,  color: "text-amber-700",   cls: "bg-amber-50 text-amber-400" },
          { label: "Hal qilindi",        value: resolvedCount + dismissedCount, color: "text-emerald-700", cls: "bg-emerald-50 text-emerald-400" },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{m.label}</p>
            <p className={`text-2xl font-extrabold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        {(["all", "new", "in_review", "resolved", "dismissed"] as const).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              filterStatus === s
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}>
            {s === "all" ? `Barchasi (${reports.length})` : `${RPT_STATUS_MAP[s]?.label} (${reports.filter(r => r.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Flag className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">
              {reports.length === 0 ? "Hali shikoyatlar yo'q" : "Mos shikoyatlar topilmadi"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-red-50/40">
                  {["Shikoyat olgan foydalanuvchi", "Shikoyat qiluvchi", "Sabab", "Sana", "Holat", "Batafsil"].map((h) => (
                    <th key={h} className="text-left text-[9px] font-bold text-red-400 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => {
                  const isOpen = expanded === r.id;
                  const statusInfo = RPT_STATUS_MAP[r.status] ?? RPT_STATUS_MAP.new;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="hover:bg-red-50/20 transition-colors cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : r.id)}>

                        {/* Reported */}
                        <td className="px-4 py-3 min-w-[160px]">
                          <UserPill userId={r.reportedUserId} />
                        </td>

                        {/* Reporter */}
                        <td className="px-4 py-3 min-w-[160px]">
                          <UserPill userId={r.reporterUserId} />
                        </td>

                        {/* Reason */}
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded-lg whitespace-nowrap">
                            {REASON_LABELS[r.reason] ?? r.reason}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-[11px] text-gray-500">{fmtDate(r.createdAt)}</p>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${statusInfo.cls}`}>
                            {statusInfo.label}
                          </span>
                        </td>

                        {/* Expand */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setExpanded(isOpen ? null : r.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                              isOpen
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            {isOpen ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                Yopish
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                Ko'rish
                              </>
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isOpen && (
                        <tr className="bg-amber-50/40">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="space-y-3">
                              {/* Description */}
                              {r.description && (
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Izoh</p>
                                  <p className="text-sm text-gray-700 bg-white rounded-xl px-3 py-2 border border-gray-100">
                                    {r.description}
                                  </p>
                                </div>
                              )}

                              {/* Attachments */}
                              {(r.attachments ?? []).length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Dalil rasmlari</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {r.attachments!.map((src, i) => (
                                      <a key={i} href={src} target="_blank" rel="noreferrer">
                                        <img src={src} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 hover:opacity-80 transition-opacity" />
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Admin note */}
                              {r.adminNote && (
                                <div className="bg-blue-50 rounded-xl px-3 py-2 border border-blue-100">
                                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wide mb-0.5">Admin izohi</p>
                                  <p className="text-sm text-blue-800">{r.adminNote}</p>
                                </div>
                              )}

                              {/* Action row */}
                              <div className="flex flex-wrap items-start gap-2">
                                {/* Status buttons */}
                                <div className="flex flex-wrap gap-1.5">
                                  {(["in_review", "resolved", "dismissed"] as RptStatus[]).map((s) => (
                                    <button key={s}
                                      onClick={() => changeStatus(r.id, s)}
                                      disabled={r.status === s}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                        r.status === s
                                          ? RPT_STATUS_MAP[s].cls
                                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                                      }`}>
                                      {RPT_STATUS_MAP[s].label}
                                    </button>
                                  ))}
                                  {r.status !== "new" && (
                                    <button onClick={() => changeStatus(r.id, "new")}
                                      className="px-3 py-1.5 rounded-xl text-xs font-bold border bg-white text-gray-500 border-gray-200 hover:border-gray-300 transition-colors">
                                      Yangi qilib belgilash
                                    </button>
                                  )}
                                </div>

                                {/* Admin note input */}
                                <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                                  <input
                                    value={noteInputs[r.id] ?? r.adminNote ?? ""}
                                    onChange={(e) => setNoteInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                    placeholder="Admin izohi yozing..."
                                    className={`${inputCls} flex-1 text-xs`}
                                  />
                                  <button
                                    onClick={() => saveNote(r.id)}
                                    className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors flex-shrink-0"
                                  >
                                    Saqlash
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TOP BAR
   ════════════════════════════════════════════════════════════════════ */
function TopBar({ section, unseenAlerts, onRefresh, onOpenMobileSidebar }: {
  section: Section; unseenAlerts: number; onRefresh: () => void; onOpenMobileSidebar: () => void;
}) {
  const [spinning, setSpinning] = useState(false);

  function handleRefresh() {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 700);
  }

  return (
    <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onOpenMobileSidebar}
          className="lg:hidden flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 bg-gray-50 border border-gray-100 active:scale-95 transition-transform">
          <Menu className="w-4.5 h-4.5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-extrabold text-gray-900 text-sm truncate">{NAV_ITEMS.find((n) => n.id === section)?.label}</h1>
          <p className="text-xs text-gray-400 truncate">Hormang Admin · <span className="text-red-500">{ADMIN_USER}</span></p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {unseenAlerts > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-50 border border-red-100">
            <Bell className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-bold text-red-600">{unseenAlerts} ta taklif kutmoqda</span>
          </div>
        )}
        <button onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)", color: "white", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" }}
          title="Barcha ma'lumotlarni yangilash">
          <RefreshCw className={`w-3.5 h-3.5 ${spinning ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Yangilash</span>
        </button>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: "linear-gradient(135deg, #DC2626, #991B1B)" }}>A</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD — real-time sync via hormang:store-change + storage
   ════════════════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const [authed,    setAuthed]    = useState(getSession());
  const [section,   setSection]   = useState<Section>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) setMobileSidebarOpen(false); // switching to desktop always shows the sidebar inline
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const [refreshKey, setRefreshKey]           = useState(0);
  const [feedbackFilterUserId, setFeedbackFilterUserId] = useState<string | null>(null);
  const [openUserIdInUsers,   setOpenUserIdInUsers]     = useState<string | null>(null);

  /* Re-arm the backend admin key whenever this tab is authed — covers both a
     fresh login (LoginGate already does this too, redundant but harmless)
     and a persisted `authed` flag from sessionStorage on reload/remount,
     which otherwise skips LoginGate entirely and leaves admin write calls
     403ing with no x-admin-key header. */
  useEffect(() => {
    if (authed) markAdminAuthenticated();
  }, [authed]);

  /* Subscribe to main app store events + cross-tab storage events */
  useEffect(() => {
    if (!authed) return;
    const bump = () => setRefreshKey((k) => k + 1);
    const unsub = onStoreChange(bump);
    window.addEventListener("storage", bump);
    return () => { unsub(); window.removeEventListener("storage", bump); };
  }, [authed]);

  function logout() {
    logAction({ actorId: ADMIN_USER, actorRole: "admin", action: "LOGOUT", category: "admin", description: "Admin tizimdan chiqdi" });
    clearSession();
    setAuthed(false);
  }

  const [unseenAlerts, setUnseenAlerts] = useState(0);
  useEffect(() => {
    if (!authed) return;
    getAllRequestsAdmin()
      .then((requests) => setUnseenAlerts(requests.filter((r) => r.status === "open" && r.offerCount === 0).length))
      .catch((err) => console.error("Load unseen alerts count failed:", err));
  }, [authed, refreshKey]);

  if (!authed) return <LoginGate onSuccess={() => setAuthed(true)} />;

  const sectionProps = { refreshKey };

  return (
    <div className="min-h-screen bg-gray-50 flex [color-scheme:light]">
      {/* Backdrop — mobile only, shown while the drawer is open */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar — inline on desktop, an off-canvas drawer (fully open or fully
          closed, never squished) below the lg breakpoint. */}
      <div
        className={`h-screen top-0 z-50 flex-shrink-0 transition-transform duration-300 fixed lg:sticky lg:translate-x-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar active={section} onChange={setSection} collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)} onLogout={logout}
          isDesktop={isDesktop} onCloseMobile={() => setMobileSidebarOpen(false)} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar section={section} unseenAlerts={unseenAlerts} onRefresh={() => setRefreshKey((k) => k + 1)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />

        <div className="flex-1 p-3 sm:p-6 overflow-auto overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div key={section}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}>
              {section === "overview"       && <OverviewSection       {...sectionProps} setSection={setSection} />}
              {section === "marketplace"    && <MarketplaceSection    {...sectionProps} />}
              {section === "requests"       && <RequestsSection       {...sectionProps} />}
              {section === "offers"         && <OffersSection         {...sectionProps} />}
              {section === "users"          && <UsersSection          {...sectionProps} onGoToFeedback={(uid) => { setFeedbackFilterUserId(uid); setSection("feedback"); }} openUserId={openUserIdInUsers} onOpenUserIdConsumed={() => setOpenUserIdInUsers(null)} />}
              {section === "monetization"   && <MonetizationSection   {...sectionProps} />}
              {section === "announcements"  && <AnnouncementsSection  {...sectionProps} />}
              {section === "audit"          && <AuditLogSection       {...sectionProps} />}
              {section === "categories"     && <CategoriesSection />}
              {section === "reports"         && <ReportsSection        {...sectionProps} />}
              {section === "feedback"       && <FeedbackAdminSection {...sectionProps} filterUserId={feedbackFilterUserId} onNavigateToUser={(uid) => { setFeedbackFilterUserId(null); setOpenUserIdInUsers(uid); setSection("users"); }} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
