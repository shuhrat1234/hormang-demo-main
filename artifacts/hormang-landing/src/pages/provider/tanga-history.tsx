/**
 * /provider/tanga-history — Provider Tanga spending history
 * Shows all offers sent + Tanga cost for each, with balance summary.
 */
import { useEffect, useState } from "react";
import { TangaCoin } from "@/components/tanga-coin";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import type { TangaTransaction } from "@/lib/tanga-history-store";
import { getWalletTransactions } from "@/lib/wallet-client";
import { getCachedTangaBalance, refreshTangaBalance } from "@/lib/wallet-balance";
import { getRequestById, type Offer } from "@/lib/requests-store";
import { getOffers } from "@/lib/provider-store";
import { getCategoryDisplayName } from "@/lib/categories";
import { TangaChip } from "@/pages/plans";
import { OfferDetailModal } from "@/components/offer-detail-modal";
import { BottomNav } from "@/components/bottom-nav";
import { formatDate } from "@/lib/date-utils";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";

const VIOLET = "linear-gradient(135deg,#7C3AED 0%,#6D28D9 100%)";

/* ─── Transaction row ────────────────────────────────────────────── */
/** Signed balance effect of a transaction: positive = added, negative = deducted. */
function signedAmount(tx: TangaTransaction): number {
  // Explicit direction field always wins (set on new refund/adjustment records).
  if (tx.direction === "out") return -Math.abs(tx.amount);
  if (tx.direction === "in")  return  Math.abs(tx.amount);
  // Type-based heuristic for older records.
  if (tx.type === "spend") return -Math.abs(tx.amount);
  if (tx.type === "purchase" || tx.type === "referral" || tx.type === "refund") return Math.abs(tx.amount);
  if (tx.type === "admin_adjustment" || /admin/i.test(tx.type ?? "") || /admin_adj/i.test(tx.description ?? "")) {
    const d = tx.description ?? "";
    if (/ayirdi|deduct|−|-/i.test(d)) return -Math.abs(tx.amount);
    return Math.abs(tx.amount);
  }
  // Legacy untyped → spend (deduction).
  return -Math.abs(tx.amount);
}

function TxRow({
  tx,
  offer,
  balanceAfter,
  onView,
}: {
  tx: TangaTransaction;
  offer: Offer | undefined;
  balanceAfter: number;
  onView: () => void;
}) {
  const { t, locale } = useI18n();
  const tt = t.tangaHistoryPage;
  const signed = signedAmount(tx);
  const isIn   = signed >= 0;
  const [categoryId, setCategoryId] = useState("");
  useEffect(() => {
    let cancelled = false;
    getRequestById(tx.requestId).then((req) => { if (!cancelled) setCategoryId(req?.categoryId ?? ""); });
    return () => { cancelled = true; };
  }, [tx.requestId]);
  const tone = isIn
    ? { card: "bg-emerald-50 border-emerald-100", icon: "bg-emerald-100", amount: "text-emerald-600", sign: "+" }
    : { card: "bg-white border-gray-100",         icon: "bg-amber-50",    amount: "text-amber-600",   sign: "−" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl shadow-sm overflow-hidden border ${tone.card}`}
    >
      <div className="px-4 py-3.5 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${tone.icon}`}
        >
          {tx.categoryEmoji || "📋"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm leading-tight truncate">
            {tx.type === "profile_completion_reward" ? tt.txTypeProfileBonus
              : tx.type === "referral"          ? tt.txTypeReferral
              : tx.type === "refund"            ? tt.txTypeRefund
              : (tx.type === "admin_adjustment" || /admin/i.test(tx.type ?? "") || /admin_adj/i.test(tx.description ?? "")) ? tt.txTypeAdminAdjustment
              : tx.type === "purchase"          ? `${tt.txTypePurchase}${tx.categoryName ? ` · ${tx.categoryName}` : ""}`
              : getCategoryDisplayName(categoryId, locale, tx.categoryName)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {formatDate(tx.createdAt, { months: t.shared.months })}
            {" · "}
            {new Date(tx.createdAt).toLocaleTimeString(locale === "ru" ? "ru-RU" : "uz-Latn-UZ", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        {offer && ( 
            <button
              onClick={onView}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100 transition-colors active:scale-95"
            >
              {tt.detailsBtn} <ExternalLink className="w-2.5 h-2.5 inline" />
            </button>
          )}  
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`text-sm font-extrabold ${tone.amount}`}>
            {tone.sign}{Math.abs(signed)}&nbsp;<TangaCoin size="sm" />
          </span>
          <p className="text-[10px] text-gray-600 font-bold mt-0.1">
          &nbsp;{balanceAfter}&nbsp; <span className="text-[10px] text-gray-400 font-bold mt-0.1">{tt.tangaLabel} </span> 
          </p> 
          
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────── */
export default function TangaHistoryPage() {
  useStoreRefresh();
  const { t } = useI18n();
  const tt = t.tangaHistoryPage;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [viewOfferId, setViewOfferId] = useState<string | null>(null);

  const balance = getCachedTangaBalance();
  const [transactions, setTransactions] = useState<TangaTransaction[]>([]);
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  useEffect(() => {
    if (!user?.id) { setAllOffers([]); setTransactions([]); return; }
    getOffers(user.id).then(setAllOffers).catch((err) => console.error("Load offers failed:", err));
    refreshTangaBalance(user.id);
    getWalletTransactions()
      .then((res) => setTransactions(res.transactions.map((tx) => ({
        id: tx.id,
        userId: tx.userId,
        offerId: tx.offerId ?? "",
        requestId: tx.requestId ?? "",
        categoryName: "",
        description: tx.description ?? "",
        amount: tx.amount,
        type: tx.type,
        direction: tx.direction,
        priceSom: tx.priceSom ?? undefined,
        createdAt: tx.createdAt,
      }))))
      .catch((err) => console.error("Load wallet transactions failed:", err));
  }, [user?.id]);

  // Only "spend" type counts as offer-sending cost
  const spendTxs    = transactions.filter((t) => t.type === "spend" || (!t.type && t.amount > 0));
  const referralTxs = transactions.filter((t) => t.type === "referral");
  const totalSpent  = spendTxs.reduce((s, t) => s + t.amount, 0);
  const totalEarnedReferral = referralTxs.reduce((s, t) => s + t.amount, 0);
  const avgSpent = spendTxs.length > 0 ? Math.round(totalSpent / spendTxs.length) : 0;

  // ── Running balance per transaction ──────────────────────────────
  // Sort oldest-first, accumulate signed amounts, build id→balanceAfter map.
  // The total of all signed amounts equals the current balance (all changes go
  // through transactions), so we anchor from 0 and walk forward.
  const balanceAfterMap = (() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    let running = 0;
    const map = new Map<string, number>();
    for (const tx of sorted) {
      running += signedAmount(tx);
      map.set(tx.id, running);
    }
    return map;
  })();

  const viewedOffer = viewOfferId
    ? allOffers.find((o) => o.id === viewOfferId)
    : undefined;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 card-shadow">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/plans")}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-extrabold text-base text-gray-900">{tt.headerTitle}</h1>
            <p className="text-xs text-gray-400">{tt.headerSubtitle}</p>
          </div>
          <TangaChip userId={user?.id ?? ""} onClick={() => setLocation("/plans")} />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── Balance card ── */}
        <div
          className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
          style={{ background: VIOLET }}
        >
          <div className="absolute inset-0 opacity-10"
            style={{
              background: "radial-gradient(circle at 80% 20%, #fff 0%, transparent 60%)",
            }}
          />
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-200 mb-1 relative">
            {tt.balanceLabel}
          </p>
          <p className="text-4xl font-extrabold leading-tight relative">
            <TangaCoin size="xl" /> {balance}
          </p>
          <p className="text-violet-200 text-xs mt-2 relative">
            {tFormat(tt.summaryTpl, { count: spendTxs.length, total: totalSpent })}
            {totalEarnedReferral > 0 && tFormat(tt.referralBonusTpl, { n: totalEarnedReferral })}
          </p>
        </div>

        {/* ── Stats row ── */}
        {transactions.length > 0 && (
          <div className={`grid gap-3 ${totalEarnedReferral > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
            <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-sm text-center">
              <p className="text-[10px] font-semibold text-gray-400 mb-1">{tt.totalSpent}</p>
              <p className="font-extrabold text-amber-600 text-xl">
                {totalSpent}&nbsp;<TangaCoin size="sm" />
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-sm text-center">
              <p className="text-[10px] font-semibold text-gray-400 mb-1">{tt.avgSpent}</p>
              <p className="font-extrabold text-violet-600 text-xl">
                {avgSpent}&nbsp;<TangaCoin size="sm" />
              </p>
            </div>
            {totalEarnedReferral > 0 && (
              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-3.5 shadow-sm text-center">
                <p className="text-[10px] font-semibold text-emerald-600 mb-1">{tt.referralReward}</p>
                <p className="font-extrabold text-emerald-600 text-xl">
                  +{totalEarnedReferral}&nbsp;<TangaCoin size="sm" />
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Transaction list ── */}
        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
            <div className="flex justify-center mb-3"><TangaCoin size="xl" /></div>
            <p className="font-bold text-gray-500 text-sm mb-1">
              {tt.emptyTitle}
            </p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-[220px] mx-auto">
              {tt.emptyDesc}
            </p>
            <button
              onClick={() => setLocation("/provider/requests")}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all active:scale-95"
              style={{ background: VIOLET }}
            >
              {tt.viewRequestsBtn}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
              {tFormat(tt.allTxTpl, { n: transactions.length })}
              {referralTxs.length > 0 && tFormat(tt.referralTxSuffixTpl, { n: referralTxs.length })}
            </p>
            {transactions.map((tx) => {
              const offer = allOffers.find((o) => o.id === tx.offerId);
              return (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  offer={offer}
                  balanceAfter={balanceAfterMap.get(tx.id) ?? 0}
                  onView={() => setViewOfferId(tx.offerId)}
                />
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />

      <AnimatePresence>
        {viewedOffer && (
          <OfferDetailModal
            offer={viewedOffer}
            onClose={() => setViewOfferId(null)}
            readOnly
          />
        )}
      </AnimatePresence>
    </div>
  );
}
