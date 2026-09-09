import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, Zap, X, Timer } from "lucide-react";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { BottomNav } from "@/components/bottom-nav";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import logoImg from "/hormang-logo.png";
import { getCachedTangaBalance, refreshTangaBalance } from "@/lib/wallet-balance";
import { getWallet, createWalletOrder, type WalletTier } from "@/lib/wallet-client";
import { ApiError } from "@/lib/api-client";
import { ReferralCard } from "@/components/referral-card";
import { SUSPENDED_MESSAGE } from "@/lib/safety-store";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import { getLocalizedText } from "@/lib/localization";

const GOLD_GRAD = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)";
const GOLD_DARK = "linear-gradient(135deg, #f59e0b 0%, #92400e 100%)";

/* ─── Coin Icon ──────────────────────────────────────────────────── */
export function CoinIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/tanga-coin.jpg"
      alt="Tanga"
      draggable={false}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(217,119,6,0.35)",
      }}
    />
  );
}

/* ─── Tanga Balance Chip ─────────────────────────────────────────── */
export function TangaChip({ userId, onClick }: { userId: string; onClick?: () => void }) {
  useStoreRefresh();
  useEffect(() => { if (userId) refreshTangaBalance(userId); }, [userId]);
  const balance = getCachedTangaBalance();
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 active:scale-95 transition-all"
    >
      <CoinIcon size={16} />
      <span className="text-xs font-bold text-amber-700 leading-none">{balance}</span>
    </button>
  );
}

/* ─── Countdown ──────────────────────────────────────────────────── */
function useCountdown(target?: string | null): string | null {
  const { t } = useI18n();
  const tt = t.plansPage;
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!target) { setLabel(null); return; }
    const targetMs = new Date(target).getTime();

    function tick() {
      const diff = targetMs - Date.now();
      if (diff <= 0) { setLabel(null); return; }
      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (days > 0) setLabel(tFormat(tt.days, { n: days }));
      else if (hours > 0) setLabel(tFormat(tt.hoursMinutes, { h: hours, m: minutes }));
      else if (minutes > 0) setLabel(tFormat(tt.minutesSeconds, { m: minutes, s: seconds }));
      else setLabel(tFormat(tt.seconds, { s: seconds }));
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, tt]);

  return label;
}

/* ─── Plan Card ──────────────────────────────────────────────────── */
function PlanCard({
  tier, buying, bought, onBuy,
}: {
  tier: WalletTier;
  buying: boolean;
  bought: boolean;
  onBuy: () => void;
}) {
  const { t, locale } = useI18n();
  const tt = t.plansPage;
  const countdown = useCountdown(tier.validUntil);
  const tierName = getLocalizedText({ uz: tier.nameUz, ru: tier.nameRu, en: tier.nameEn ?? undefined }, locale);
  const tierDesc = getLocalizedText({ uz: tier.descUz ?? undefined, ru: tier.descRu ?? undefined, en: tier.descEn ?? undefined }, locale);
  const tierBadge = getLocalizedText({ uz: tier.badgeUz ?? undefined, ru: tier.badgeRu ?? undefined, en: tier.badgeEn ?? undefined }, locale);
  const isExpired = tier.validUntil ? new Date(tier.validUntil) <= new Date() : false;
  const totalTokens = tier.credits + tier.bonusTokens;

  // Mirrors the admin panel's own sale-eligibility check (see admin/index.tsx's
  // activeCampaigns filter) — the actual charged amount is still decided
  // server-side in getEffectivePrice, this only controls what's displayed.
  const now = new Date();
  const saleActive =
    tier.salePrice != null &&
    tier.salePrice < tier.priceSom &&
    (!tier.startsAt || new Date(tier.startsAt) <= now) &&
    (!tier.validUntil || new Date(tier.validUntil) > now) &&
    (tier.saleLimit == null || tier.salePurchaseCount < tier.saleLimit);
  const displayPrice = saleActive ? tier.salePrice! : tier.priceSom;
  const savingsPercent = saleActive ? Math.round((1 - tier.salePrice! / tier.priceSom) * 100) : 0;
  const slotsLeft = saleActive && tier.saleLimit != null ? Math.max(0, tier.saleLimit - tier.salePurchaseCount) : null;

  const perUserLimit = tier.perUserLimit ?? 0;
  const userCount = tier.userPurchaseCount ?? 0;
  const userLimitHit = perUserLimit > 0 && userCount >= perUserLimit;
  const userRemaining = perUserLimit > 0 ? perUserLimit - userCount : null;

  const disabled = isExpired || userLimitHit;

  if (bought) {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[300px] gap-2">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check className="w-6 h-6 text-emerald-600" />
        </div>
        <p className="font-extrabold text-emerald-700 text-sm">{tt.successTitle}</p>
        <p className="text-xs text-emerald-600">{tFormat(tt.successDescTpl, { n: totalTokens })}</p>
      </div>
    );
  }

  if (buying) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col items-center justify-center h-full min-h-[300px] gap-3">
        <div className="w-10 h-10 rounded-full border-[3px] border-amber-400 border-t-transparent animate-spin" />
        <p className="text-xs font-semibold text-gray-400">{tt.buying}</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-opacity h-full flex flex-col ${disabled ? "opacity-60" : "border-amber-100"}`}>
      <div className="h-1.5 w-full flex-shrink-0" style={{ background: GOLD_GRAD }} />
      <div className="p-4 flex-1 flex flex-col">
        {/* Highlighting badges */}
        <div className="min-h-[26px] mb-2.5 flex flex-wrap gap-1.5 items-start">
          {tierBadge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{tierBadge}</span>}
          {tier.featured && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{tt.badgeFeatured}</span>}
          {tier.hotOffer && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">{tt.badgeHot}</span>}
          {tier.bonusPlan && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{tt.badgeBonus}</span>}
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-extrabold text-sm text-gray-900">{tierName}</p>
            {tierDesc && <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{tierDesc}</p>}
          </div>
          {tier.bonusTokens > 0 && (
            <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded-full whitespace-nowrap">
              <Zap className="w-2.5 h-2.5" />+{tier.bonusTokens}
            </span>
          )}
        </div>

        {/* Token amount */}
        <div className="flex items-center gap-2.5 mb-3">
          <CoinIcon size={32} />
          <div>
            <p className="text-3xl font-black text-gray-900 leading-none">{tier.credits}</p>
            {tier.bonusTokens > 0 && (
              <p className="text-[11px] font-bold text-emerald-600 mt-0.5">
                {tFormat(tt.bonusTotalTpl, { bonus: tier.bonusTokens, total: totalTokens })}
              </p>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
          <span className="text-lg font-extrabold text-gray-900">
            {displayPrice === 0 ? tt.free : `${displayPrice.toLocaleString()} ${tt.sumSuffix}`}
          </span>
          {saleActive && (
            <>
              <span className="text-xs text-gray-400 line-through">
                {tier.priceSom.toLocaleString()} {tt.sumSuffix}
              </span>
              <span className="text-[10px] font-black text-white bg-orange-500 px-1.5 py-0.5 rounded-full">
                {tFormat(tt.saveTpl, { n: savingsPercent })}
              </span>
            </>
          )}
          {!saleActive && tier.salePrice != null && (
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{tt.saleEnded}</span>
          )}
        </div>

        {/* Flexible middle space */}
        <div className="flex-1 flex flex-col justify-end">
          {/* Campaign remaining slots */}
          {saleActive && slotsLeft !== null && (
            <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 bg-orange-50 rounded-xl border border-orange-100">
              <span className="text-[10px] font-black text-orange-600">🔥</span>
              <span className="text-[11px] font-bold text-orange-700">{tFormat(tt.slotsLeftTpl, { n: slotsLeft })}</span>
            </div>
          )}

          {/* Per-user limit info */}
          {perUserLimit > 0 && !userLimitHit && userRemaining !== null && (
            <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 bg-blue-50 rounded-xl border border-blue-100">
              <span className="text-[10px] font-black text-blue-600">👤</span>
              <span className="text-[11px] font-bold text-blue-700">{tFormat(tt.userQuotaTpl, { n: userRemaining })}</span>
            </div>
          )}
          {userLimitHit && (
            <div className="mb-2 px-2.5 py-1.5 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-bold text-gray-500 text-center">
              {tt.userLimitReached}
            </div>
          )}

          {/* Countdown */}
          {countdown && !isExpired && (
            <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 bg-amber-50 rounded-xl border border-amber-100">
              <Timer className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="text-[11px] font-bold text-amber-700">{tFormat(tt.countdownLeft, { label: countdown })}</span>
            </div>
          )}
          {isExpired && tier.validUntil && (
            <div className="mb-2 px-2.5 py-1.5 bg-gray-50 rounded-xl border border-gray-100 text-[11px] font-bold text-gray-400 text-center">
              {tt.expired}
            </div>
          )}
        </div>

        {/* Buy button at the bottom */}
        <button
          onClick={onBuy}
          disabled={disabled}
          className="w-full h-10 rounded-xl font-bold text-sm text-white transition-all active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm mt-3 flex-shrink-0"
          style={{ background: disabled ? "#d1d5db" : GOLD_DARK }}
        >
          {userLimitHit ? tt.limitReachedBtn : tt.buyBtn}
        </button>
      </div>
    </div>
  );
}

/* ─── Payment Method Sheet ───────────────────────────────────────── */
function PaymentMethodSheet({
  onClose, onChoosePayme, onChooseClick,
}: {
  onClose: () => void;
  onChoosePayme: () => void;
  onChooseClick: () => void;
}) {
  const { t } = useI18n();
  const tt = t.plansPage;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:pb-5"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-extrabold text-sm text-gray-900">{tt.choosePaymentMethod}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={onChoosePayme}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-gray-100 hover:border-cyan-300 hover:bg-cyan-50/50 transition-all active:scale-[.98]"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#00CCCC" }}>
              <span className="text-white font-black text-[13px] tracking-tight">Payme</span>
            </div>
            <span className="font-bold text-sm text-gray-900">{tt.payWithPayme}</span>
          </button>

          <button
            onClick={onChooseClick}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 transition-all active:scale-[.98]"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#0074E4" }}>
              <span className="text-white font-black text-[13px] tracking-tight">Click</span>
            </div>
            <span className="font-bold text-sm text-gray-900">{tt.payWithClick}</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function PlansPage() {
  useStoreRefresh();
  const { t } = useI18n();
  const tt = t.plansPage;
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const userId = user?.id ?? "";
  const balance = getCachedTangaBalance();

  const [tiers, setTiers] = useState<WalletTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [bought, setBought] = useState<string | null>(null);
  const [pickerTier, setPickerTier] = useState<WalletTier | null>(null);

  const sortedTiers = useMemo(() => {
    return [...tiers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [tiers]);

  useEffect(() => {
    let cancelled = false;
    getWallet()
      .then((res) => {
        if (cancelled) return;
        setTiers(res.tiers);
        refreshTangaBalance(userId);
      })
      .catch(() => { if (!cancelled) setTiers([]); })
      .finally(() => { if (!cancelled) setTiersLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  async function handleBuy(tier: WalletTier, provider: "payme" | "click") {
    if (!userId || buying) return;
    if (user?.suspended) {
      toast({ title: SUSPENDED_MESSAGE, variant: "destructive" });
      return;
    }
    setBuying(tier.id);
    try {
      const { checkoutUrl } = await createWalletOrder(tier.id, provider);
      window.location.href = checkoutUrl;
    } catch (err) {
      setBuying(null);
      const message = err instanceof ApiError ? err.message : tt.errTierNotFound;
      toast({ title: tt.purchaseFailedTitle, description: message, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 card-shadow">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation("/provider-home")} className="flex items-center flex-shrink-0">
            <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain" />
          </button>
          <div className="flex-1">
            <h1 className="font-extrabold text-sm text-gray-900">{tt.headerTitle}</h1>
            <p className="text-xs text-gray-400">{tt.headerSubtitle}</p>
          </div>
          <CoinIcon size={30} />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Balance hero */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 mb-6 text-white relative overflow-hidden shadow-md"
          style={{ background: GOLD_DARK }}
        >
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 80% 10%, white 0%, transparent 55%)" }}
          />
          <p className="text-sm font-semibold text-amber-100 mb-3">{tt.walletLabel}</p>
          <div className="flex items-center gap-4">
            <img
              src="/tanga-coin.jpg"
              alt="Tanga"
              draggable={false}
              className="w-18 h-18 rounded-2xl object-cover flex-shrink-0"
            />
            <div>
              <p className="text-5xl font-black text-white leading-none">{balance}</p>
              <p className="text-amber-200 text-xs font-semibold mt-1">{tt.tangaLabel}</p>
            </div>
          </div>
          <p className="text-amber-200/70 text-[10px] mt-3">
            {tt.walletNote}
          </p>
          <button
            onClick={() => setLocation("/provider/tanga-history")}
            className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-amber-100 hover:text-white transition-colors"
          >
            {tt.historyLink}
          </button>
        </motion.div>

        {/* Plans */}
        {!tiersLoading && tiers.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-amber-400" />
            </div>
            <p className="font-bold text-gray-600 mb-1">{tt.emptyTitle}</p>
            <p className="text-sm text-gray-400">{tt.emptyDesc}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AnimatePresence>
              {sortedTiers.map((tier, i) => (
                <motion.div
                  key={tier.id}
                  className="h-full flex flex-col"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <PlanCard
                    tier={tier}
                    buying={buying === tier.id}
                    bought={bought === tier.id}
                    onBuy={() => setPickerTier(tier)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Referral card */}
        <div className="mt-6">
          <ReferralCard title={tt.referralTitle} />
        </div>
      </div>

      <AnimatePresence>
        {pickerTier && (
          <PaymentMethodSheet
            onClose={() => setPickerTier(null)}
            onChoosePayme={() => {
              const tier = pickerTier;
              setPickerTier(null);
              handleBuy(tier, "payme");
            }}
            onChooseClick={() => {
              const tier = pickerTier;
              setPickerTier(null);
              handleBuy(tier, "click");
            }}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
