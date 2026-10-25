import { useState, useEffect, type ComponentType } from "react";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { BottomNav } from "@/components/bottom-nav";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "/hormang-logo.png";
import {
  Search, ClipboardList, Settings, UserPen, LogOut, ChevronRight,
  Inbox, Star, CheckCircle2, MapPin,
  ShoppingBag, Briefcase, Loader2, ArrowRight, X,
  Phone, ShieldCheck, Plus, MessageCircle, LayoutGrid, MessagesSquare,
  IdCard,
} from "lucide-react";
import { BadgePill, BadgeConditionsSheet } from "@/components/provider-badges";
import { getBadges, evaluateAutoBadges, type BadgeType } from "@/lib/badge-store";
import { onStoreChange } from "@/lib/store-events";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat, getAuthError } from "@/lib/i18n";
import { getCategoryDisplayName } from "@/lib/categories";
import { getRegionLabel, getDistrictLabel } from "@/lib/regions";
import { saveProviderProfile } from "@/lib/auth-client";
import { processReferralReward } from "@/lib/referral-store";
import { useToast } from "@/hooks/use-toast";
import {
  getLocalProfile, saveLocalProfile, hasProviderAccess,
  markProviderAccess,
  getCompletionChecks, getCompletionPct,
  type LocalProfile,
} from "@/lib/local-profile";
import {
  getMatchingRequests, getSeenIds,
} from "@/lib/provider-store";
import {
  getRequestsByCustomer, getOffersByCustomer, getChatsByCustomer,
} from "@/lib/requests-store";
import { getAverageRatingForUser, getReviewsForUser, getCompletedCount } from "@/lib/completion-store";
import { TangaChip } from "@/pages/plans";
import { StarRating } from "@/components/star-rating";

const VIOLET_SOLID = "hsl(262,80%,54%)";
const VIOLET_GRAD  = "linear-gradient(135deg, hsl(262,80%,54%) 0%, hsl(236,76%,60%) 100%)";

function BecomeProviderCard({ onBecome }: { onBecome: () => void }) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="rounded-2xl p-5 text-white mb-5 shadow-md"
      style={{ background: VIOLET_GRAD }}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-extrabold text-base leading-tight">{t.dashboard.becomeProviderCard.title}</h3>
          <p className="text-white/75 text-xs mt-0.5">{t.dashboard.becomeProviderCard.desc}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-xs text-white/80 mb-4">
        {t.dashboard.becomeProviderCard.benefits.map((b) => (
          <div key={b} className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-white/60 flex-shrink-0" /> {b}</div>
        ))}
      </div>
      <button
        onClick={onBecome}
        className="w-full bg-white text-violet-700 font-extrabold py-2.5 rounded-xl text-sm hover:bg-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
      >
        {t.dashboard.becomeProviderCard.cta} <ArrowRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

function BecomeProviderModal({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (categories: string[]) => void;
  loading: boolean;
}) {
  const { t } = useI18n();
  const PROVIDER_CATEGORIES = t.dashboard.modal.categories;
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(cat: string) {
    setSelected(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: VIOLET_GRAD }}
            >
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-extrabold text-gray-900 leading-tight">{t.dashboard.modal.title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {t.dashboard.modal.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0 mt-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category grid */}
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {PROVIDER_CATEGORIES.map(cat => {
              const active = selected.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggle(cat)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                    active
                      ? "text-white border-transparent shadow-sm"
                      : "bg-gray-50 border-gray-200 text-gray-600 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                  style={active ? { background: VIOLET_GRAD } : {}}
                >
                  {active && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                  {cat}
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-violet-600 font-semibold mt-3"
            >
              {tFormat(t.dashboard.modal.selectedTpl, { count: selected.length })}
            </motion.p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-shrink-0 border-2 font-semibold"
            disabled={loading}
          >
            {t.common.cancel}
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0 || loading}
            onClick={() => onSubmit(selected)}
            className="flex-1 font-bold gap-2"
            style={{ background: VIOLET_GRAD }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {loading ? t.dashboard.modal.saving : t.dashboard.modal.continue}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function BuyerContent({ onNavigate, onBecome }: { onNavigate: (path: string) => void; onBecome: () => void }) {
  const { user, providerProfile } = useAuth();
  const { t, locale } = useI18n();
  const [local, setLocal] = useState<LocalProfile>({});
  const storeVersion = useStoreRefresh();

  useEffect(() => {
    if (user?.id) setLocal(getLocalProfile(user.id));
  }, [user?.id, storeVersion]);

  const fullName = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase();
  const location = local.district
    ? `${getDistrictLabel(local.district, locale)}, ${getRegionLabel(local.region ?? "", locale)}`
    : local.region ? getRegionLabel(local.region, locale) : undefined;
  const hasProviderRole = hasProviderAccess(user ?? null, providerProfile ?? null, local);

  const items: { icon: ComponentType<{ className?: string }>; title: string; desc: string; action?: () => void; highlight?: boolean }[] = [
    {
      icon: Search,
      title: t.dashboard.buyerItems.search.title,
      desc: t.dashboard.buyerItems.search.desc,
      action: () => onNavigate("/questionnaire"),
      highlight: true,
    },
    {
      icon: ClipboardList,
      title: t.dashboard.buyerItems.requests.title,
      desc: t.dashboard.buyerItems.requests.desc,
      action: () => { sessionStorage.setItem("request_history_referrer", "/dashboard"); onNavigate("/request-history"); },
    },
    {
      icon: UserPen,
      title: t.dashboard.buyerItems.profile.title,
      desc: t.dashboard.buyerItems.profile.desc,
      action: () => onNavigate("/profile/settings"),
    },
    {
      icon: Settings,
      title: t.dashboard.buyerItems.settings.title,
      desc: t.dashboard.buyerItems.settings.desc,
      action: () => onNavigate("/settings"),
    },
  ];

  return (
    <div className="space-y-3">
      {/* ── Customer Profile Header Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-100 card-shadow p-4"
      >
        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            {local.photoUrl ? (
              <img
                src={local.photoUrl}
                alt={fullName}
                className="w-[72px] h-[72px] rounded-2xl object-cover ring-2 ring-blue-100"
              />
            ) : (
              <div
                className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white text-xl font-black ring-2 ring-blue-100"
                style={{ background: "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)" }}
              >
                {initials || "?"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h2 className="text-base font-bold text-gray-900 truncate">
                {fullName || t.dashboard.guest}
              </h2>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)" }}
              >
                {t.dashboard.rolePillBuyer}
              </span>
            </div>

            {location && (
              <p className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                <MapPin className="w-3 h-3" />
                {location}
              </p>
            )}

            {user?.phone && (
              <p className="flex items-center gap-1 text-xs text-gray-600">
                <Phone className="w-3 h-3" />
                {user.phone}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {user?.phone ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-green-50 text-green-700 border border-green-100">
              <Phone className="w-3 h-3" /> {t.dashboard.phoneVerified}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-100">
              <Phone className="w-3 h-3" /> {t.dashboard.phoneNotVerified}
            </span>
          )}
        </div>
      </motion.div>

      {items.map(({ icon: Icon, title, desc, action, highlight }, i) => (
        <motion.button
          key={title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.35 }}
          whileHover={action ? { scale: 1.01, y: -1 } : {}}
          whileTap={action ? { scale: 0.99 } : {}}
          onClick={action}
          disabled={!action}
          className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 group ${
            highlight
              ? "text-white border-transparent"
              : action
              ? "bg-white border-gray-100 hover:border-blue-200 hover:shadow-md card-shadow"
              : "bg-white border-gray-100 opacity-55 cursor-not-allowed card-shadow"
          }`}
          style={highlight ? { background: "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)" } : {}}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${action ? "group-hover:scale-110" : ""} ${highlight ? "bg-white/20" : "bg-blue-50"}`}>
            <Icon className={`w-5 h-5 ${highlight ? "text-white" : "text-blue-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-sm ${highlight ? "text-white" : "text-gray-900"}`}>{title}</h3>
            <p className={`text-xs truncate ${highlight ? "text-blue-100" : "text-gray-500"}`}>{desc}</p>
          </div>
          {action ? (
            <ChevronRight className={`w-4 h-4 flex-shrink-0 ${highlight ? "text-blue-200" : "text-gray-400 group-hover:text-blue-500"}`} />
          ) : null}
        </motion.button>
      ))}

      {!hasProviderRole && <BecomeProviderCard onBecome={onBecome} />}
    </div>
  );
}

function CircularProgress({ pct }: { pct: number }) {
  const r    = 34;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct < 40 ? "#EF4444" : pct < 75 ? "#F97316" : VIOLET_SOLID;
  return (
    <svg width="88" height="88" className="rotate-[-90deg]"
      style={{ filter: "drop-shadow(0 0 6px rgba(139,92,246,0.2))" }}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="#EDE9FE" strokeWidth="7" />
      <circle
        cx="44" cy="44" r={r} fill="none" strokeWidth="7"
        stroke={pct < 75 ? color : "url(#pgradUnified)"}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease" }}
      />
      <defs>
        <linearGradient id="pgradUnified" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(262,80%,54%)" />
          <stop offset="100%" stopColor="hsl(236,76%,60%)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ProviderContent({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, providerProfile } = useAuth();
  const { toast } = useToast();
  const { t, locale } = useI18n();
  const [local, setLocal] = useState<LocalProfile>({});
  const storeVersion = useStoreRefresh();
  const completionDismissKey = user?.id ? `profile_completion_dismissed_${user.id}` : "";
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    if (user?.id) setLocal(getLocalProfile(user.id));
  }, [user?.id, storeVersion]);

  useEffect(() => {
    if (!user) return;
    evaluateAutoBadges(user);
    return onStoreChange(() => evaluateAutoBadges(user));
  }, [user]);

  useEffect(() => {
    if (!completionDismissKey) {
      setCompletionDismissed(false);
      return;
    }
    setCompletionDismissed(localStorage.getItem(completionDismissKey) === "1");
  }, [completionDismissKey]);

  const rawCategories = providerProfile?.categories?.length ? providerProfile.categories : (local.categories ?? []);
  const selectedCategories = [...new Set(rawCategories)];

  const completionLocal = {
    photoUrl:       local.photoUrl,
    region:         local.region,
    district:       local.district,
    serviceAreas:   local.serviceAreas,
    serviceAreaV2:  local.serviceAreaV2,
    experience:     local.experience,
    portfolioItems: local.portfolioItems ?? [],
    albums:         local.albums ?? [],
    bio:            local.bio,
    categories:     selectedCategories,
  };
  const rawChecks = getCompletionChecks(user ?? null, providerProfile ?? null, completionLocal);
  const pct       = getCompletionPct(rawChecks);
  const ps        = t.profileSettings;
  const providerCheckLabels: Record<string, string> = {
    photo:      ps.providerCheckPhoto,
    name:       ps.providerCheckName,
    region:     ps.providerCheckRegion,
    services:   ps.providerCheckServices,
    bio:        ps.providerCheckBio,
    experience: ps.providerCheckExperience,
    portfolio:  ps.providerCheckPortfolio,
  };
  const missing = rawChecks
    .filter((c) => !c.done)
    .map((c) => providerCheckLabels[c.key] ? { ...c, label: providerCheckLabels[c.key] } : c);

  const avgRating      = user?.id ? getAverageRatingForUser(user.id, "provider") : 0;
  const reviewCount    = user?.id ? getReviewsForUser(user.id, "provider").length : 0;
  const completedCount = user?.id ? getCompletedCount(user.id, "provider") : 0;

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`;
  const hasPhoto = !!local.photoUrl;

  const serviceAreas = local.serviceAreas ?? (local.region ? [local.region] : []);
  const serviceAreaV2 = local.serviceAreaV2;
  const selectedCategoriesKey = selectedCategories.join(",");
  const serviceAreasKey = serviceAreas.join(",");
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getMatchingRequests(selectedCategories, serviceAreas, user.id, serviceAreaV2).then((requests) => {
      if (cancelled) return;
      const seen = getSeenIds(user.id);
      setUnseenCount(requests.filter((r) => !seen.includes(r.id) && r.status === "open").length);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedCategoriesKey, serviceAreasKey, serviceAreaV2]);

  const menuItems = [
    {
      icon: Inbox,
      title: t.dashboard.providerItems.newRequests.title,
      desc: t.dashboard.providerItems.newRequests.desc,
      badge: unseenCount.toString(),
      badgeColor: "bg-blue-600 text-white",
      action: () => onNavigate("/provider/requests"),
    },
    {
      icon: ClipboardList,
      title: t.dashboard.providerItems.history.title,
      desc: t.dashboard.providerItems.history.desc,
      action: () => onNavigate("/provider/history"),
    },
    {
      icon: Star,
      title: t.dashboard.providerItems.reviews.title,
      desc: t.dashboard.providerItems.reviews.desc,
      action: () => onNavigate("/provider-reviews"),
    },
    {
      icon: UserPen,
      title: t.dashboard.providerItems.profile.title,
      desc: t.dashboard.providerItems.profile.desc,
      action: () => onNavigate("/profile/settings"),
    },
    {
      icon: Settings,
      title: t.dashboard.providerItems.settings.title,
      desc: t.dashboard.providerItems.settings.desc,
      action: () => onNavigate("/settings"),
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── Profile header card ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-100 card-shadow p-4"
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {hasPhoto ? (
              <img
                src={local.photoUrl}
                alt={user?.firstName}
                className="w-[72px] h-[72px] rounded-2xl object-cover ring-2 ring-violet-100"
              />
            ) : (
              <div
                className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white text-xl font-black ring-2 ring-violet-100"
                style={{ background: VIOLET_GRAD }}
              >
                {initials}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h2 className="text-base font-bold text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                style={{ background: VIOLET_GRAD }}>
                {t.dashboard.rolePillProvider}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3">
              <button
                className="flex items-center gap-1"
                onClick={() => onNavigate("/provider-reviews")}
              >
                <StarRating rating={avgRating} size="w-3.5 h-3.5" />
                <span className="text-xs font-bold text-gray-700 ml-0.5 underline">
                  {avgRating > 0 ? avgRating.toFixed(1) : "–"}
                </span>
                {reviewCount > 0 && (
                  <span className="text-xs text-gray-400">({reviewCount})</span>
                )}
              </button>
              <span className="text-gray-200">·</span>
              <button
                className="flex items-center gap-1"
                onClick={() => onNavigate("/provider/history")}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-semibold text-gray-600 underline">{tFormat(t.dashboard.completedSuffixTpl, { count: completedCount })}</span>
              </button>
            </div>

            {/* Badges + ID chip row */}
            {(() => {
              const PRIORITY: BadgeType[] = ["under_review", "recommended_by_hormang"];
              const all      = user?.id ? getBadges(user.id).filter((b) => b.visible) : [];
              const priority = all.filter((b) => PRIORITY.includes(b.type));
              const rest     = all.filter((b) => !PRIORITY.includes(b.type));
              const ordered  = [...priority, ...rest];
              return (
                <div className="flex items-center gap-1.5 mt-2 overflow-x-auto no-scrollbar">
                  {ordered.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowBadgeSheet(true)}
                      className="flex items-center gap-1.5 flex-nowrap"
                    >
                      {ordered.map((b) => (
                        <BadgePill key={b.type} type={b.type} size="sm" />
                      ))}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowBadgeSheet(true)}
                      className="text-[11px] font-semibold text-violet-500 hover:text-violet-700 transition-colors flex-shrink-0"
                    >
                      {t.dashboard.badgesEmpty}
                    </button>
                  )}
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-100 flex-shrink-0 whitespace-nowrap">
                    <IdCard className="w-3 h-3 flex-shrink-0" /> {t.dashboard.idCheckSoon}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
        <BadgeConditionsSheet open={showBadgeSheet} onClose={() => setShowBadgeSheet(false)} />

        {/* Category chips */}
        {selectedCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {selectedCategories.slice(0, 4).map(cat => (
              <span key={cat}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-violet-50 text-violet-700 border border-violet-100">
                {getCategoryDisplayName(cat, locale)}
              </span>
            ))}
            {selectedCategories.length > 4 && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-gray-50 text-gray-400 border border-gray-100">
                +{selectedCategories.length - 4}
              </span>
            )}
          </div>
        )}

      </motion.div>

      {/* ── Completion card ── */}
      {!(pct === 100 && completionDismissed) && (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ delay: 0.05 }}
        className="relative bg-white rounded-2xl border border-gray-100 card-shadow p-4"
      >
        {pct === 100 && (
          <button
            type="button"
            onClick={() => {
              if (completionDismissKey) localStorage.setItem(completionDismissKey, "1");
              setCompletionDismissed(true);
            }}
            className="absolute right-3 top-3 w-7 h-7 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={t.dashboard.closeCompletionAria}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex items-center gap-4">
          {/* Ring */}
          <div className="relative flex-shrink-0 flex items-center justify-center">
            <CircularProgress pct={pct} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-base font-black"
                style={{ color: pct === 100 ? VIOLET_SOLID : pct < 40 ? "#EF4444" : pct < 75 ? "#F97316" : VIOLET_SOLID }}>
                {pct}%
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 mb-1">
              {pct === 100 ? t.dashboard.profileFullShort : t.dashboard.profileFillTitle}
            </p>
            {/* Bar */}
            <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden mb-2">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: pct < 40 ? "#EF4444" : pct < 75 ? "#F97316" : VIOLET_GRAD,
                }}
              />
            </div>
            {pct < 100 && (
              <p className="text-xs text-gray-400">{tFormat(t.dashboard.fieldsLeftTpl, { count: missing.length })}</p>
            )}
          </div>
        </div>

        {/* Missing items list */}
        {missing.length > 0 && (
          <div className="mt-3 space-y-2">
            {missing.map((item) => (
              <div key={item.key}
                className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-violet-600 flex-shrink-0 bg-violet-50 border border-violet-100 rounded-lg px-1.5 py-0.5">
                    {item.weight}%
                  </span>
                  <span className="text-xs text-gray-600 truncate">{item.label}</span>
                </div>
                <button
                  onClick={() => onNavigate("/profile/settings")}
                  className="text-[11px] font-bold text-violet-600 hover:text-violet-800 flex-shrink-0 transition-colors"
                >
                  {t.dashboard.add}
                </button>
              </div>
            ))}
          </div>
        )}

        {pct === 100 && (
          <div className="mt-3 flex items-center gap-2 bg-violet-50 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-violet-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-violet-700">
              {t.dashboard.profileFullCardLabel}
            </span>
          </div>
        )}
      </motion.div>
      )}

      {/* ── Menu items ── */}
      {menuItems.map(({ icon: Icon, title, desc, action, badge, badgeColor }, i) => (
        <motion.button
          key={title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 + i * 0.055, duration: 0.35 }}
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.99 }}
          onClick={action}
          className="w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 group card-shadow bg-white border-gray-100 hover:border-violet-200 hover:shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110">
            <Icon className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 truncate">{desc}</p>
          </div>
          {badge ? (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-violet-500 flex-shrink-0" />
          )}
        </motion.button>
      ))}
    </div>
  );
}

export default function UnifiedDashboard() {
  const { user, providerProfile, activeRole, switchRole, setProviderProfile, logout } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [logoHovered, setLogoHovered] = useState(false);
  const [headerLocal, setHeaderLocal] = useState<LocalProfile>({});
  const [showBecomeModal, setShowBecomeModal] = useState(false);
  const [becomingProvider, setBecomingProvider] = useState(false);
  const storeVersion = useStoreRefresh();

  useEffect(() => {
    if (user?.id) setHeaderLocal(getLocalProfile(user.id));
  }, [user?.id, storeVersion]);

  const isProvider = activeRole === "provider";
  const hasBothRoles = hasProviderAccess(user ?? null, providerProfile ?? null, headerLocal) || activeRole === "provider";

  const accentGradient = isProvider
    ? "linear-gradient(135deg, hsl(262,80%,54%) 0%, hsl(236,76%,60%) 100%)"
    : "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)";

  async function handleLogout() {
    await logout();
    setLocation("/");
  }

  function handleBecomeProvider() {
    setShowBecomeModal(true);
  }

  async function handleModalSubmit(categories: string[]) {
    if (!user || categories.length === 0) return;
    setBecomingProvider(true);
    try {
      const res = await saveProviderProfile({ categories });
      setProviderProfile(res.profile);
      markProviderAccess(user.id);
      saveLocalProfile(user.id, { ...getLocalProfile(user.id), categories });
      // Award referral reward to the inviter (if the new provider was invited).
      try { processReferralReward(user.id); } catch (_) {}
      switchRole("provider");
      sessionStorage.setItem("justBecameProvider", "1");
      setShowBecomeModal(false);
      setLocation("/profile/settings");
    } catch (err: unknown) {
      toast({ title: getAuthError(err instanceof Error ? err.message : "", t), variant: "destructive" });
    } finally {
      setBecomingProvider(false);
    }
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10 card-shadow">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            {/* Logo */}
            <button
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => setLocation("/provider-home")}
              onMouseEnter={() => setLogoHovered(true)}
              onMouseLeave={() => setLogoHovered(false)}
            >
              <motion.img
                src={logoImg}
                alt="Hormang"
                animate={logoHovered
                  ? { rotate: [-8, 8], transition: { repeat: Infinity, repeatType: "reverse", duration: 0.35, ease: "easeInOut" } }
                  : { rotate: 0, transition: { duration: 0.25, ease: "easeOut" } }
                }
                className="w-8 h-8 object-contain"
              />
              <span className="font-bold text-gray-900 text-sm hidden sm:inline">Hormang</span>
            </button>

            {/* Center: role switcher (both roles) OR "Ijrochi bo'lish" (buyer only) */}
            <div className="flex-1 flex justify-center">
              {hasBothRoles ? (
                <div className="relative flex items-center bg-gray-100 rounded-2xl p-1 gap-1">
                  {(["buyer", "provider"] as const).map((role) => {
                    const active = activeRole === role;
                    return (
                      <button
                        key={role}
                        onClick={() => switchRole(role)}
                        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors duration-150 z-10 ${
                          active ? "text-white" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="role-pill"
                            className="absolute inset-0 rounded-xl shadow-sm"
                            style={{ background: accentGradient }}
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span className="relative">
                          {role === "buyer" ? <ShoppingBag className="w-3.5 h-3.5" /> : <Briefcase className="w-3.5 h-3.5" />}
                        </span>
                        <span className="relative">{role === "buyer" ? t.dashboard.rolePillBuyer : t.dashboard.rolePillProvider}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button
                  onClick={handleBecomeProvider}
                  disabled={becomingProvider}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
                  style={{ background: VIOLET_GRAD }}
                >
                  {becomingProvider
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Briefcase className="w-3.5 h-3.5" />
                  }
                  {t.dashboard.becomeProviderBtn}
                </button>
              )}
            </div>

            {/* Right: avatar + logout */}
            <div className="flex items-center gap-2">
              {isProvider && (
                <TangaChip userId={user?.id ?? ""} onClick={() => setLocation("/plans")} />
              )}
              <button
                onClick={() => setLocation("/profile/settings")}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm transition-all duration-500 overflow-hidden flex-shrink-0"
                style={headerLocal.photoUrl ? {} : { background: accentGradient }}
                title={`${user?.firstName} ${user?.lastName}`}
              >
                {headerLocal.photoUrl ? (
                  <img src={headerLocal.photoUrl} alt={user?.firstName} className="w-full h-full object-cover" />
                ) : (
                  user?.firstName?.[0]
                )}
              </button>
              <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>
      
        <main className="max-w-lg mx-auto px-4 py-8 pb-28">
          <motion.div
            key={activeRole}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <AnimatePresence mode="wait">
              {isProvider ? (
                <motion.div
                  key="provider"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <ProviderContent onNavigate={setLocation} />
                </motion.div>
              ) : (
                <motion.div
                  key="buyer"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.25 }}
                >
                  <BuyerContent onNavigate={setLocation} onBecome={handleBecomeProvider} />
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        </main>
      </div>

      <AnimatePresence>
        {showBecomeModal && (
          <BecomeProviderModal
            onClose={() => setShowBecomeModal(false)}
            onSubmit={handleModalSubmit}
            loading={becomingProvider}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </>
  );
}
