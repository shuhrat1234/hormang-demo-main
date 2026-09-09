/**
 * /provider-home — Provider (Ijrochi) home page
 * Sections:
 *   1. Profile Completion
 *   2. Upcoming Services
 *   3. Events (coming soon)
 *   4. Available Requests (tabs + swipeable cards)
 *   5. Referral System
 */
import { useState, useEffect, useRef } from "react";
import { TangaCoin } from "@/components/tanga-coin";
import { useLocation } from "wouter";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, CalendarDays, Sparkles,
  CheckCircle2, Clock, MapPin, AlertCircle, Inbox, Send, Check, X,
} from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { OfferForm } from "@/components/offer-form";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat, getBudgetLabel } from "@/lib/i18n";
import { getLocalizedText } from "@/lib/localization";
import { getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { getRequestById } from "@/lib/requests-store";
import type { Dict } from "@/lib/i18n/locales/uz";
import { useToast } from "@/hooks/use-toast";
import {
  getMatchingRequests, getUpcomingServices, markServiceDone,
  updateProviderRequestStatus, getSeenIds, markSeen, markAllSeen,
  getRequestOfferCount, getRequestsWithZeroOffers, getLocalizedDescription,
  type ProviderRequest, type UpcomingService,
} from "@/lib/provider-store";
import { confirmCompletion, getOfferById, type Offer } from "@/lib/requests-store";
import { getRequestLocation } from "@/lib/regions";
import { addReview, hasReviewedRequest } from "@/lib/completion-store";
import { ReviewModal, type ReviewSubmitData } from "@/components/review-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { OfferDetailModal } from "@/components/offer-detail-modal";
import { getLocalProfile, getCompletionChecks, getCompletionPct } from "@/lib/local-profile";
import { tryGrantProfileReward, getProfileRewardStatus } from "@/lib/profile-reward-store";
import { BadgeConditionsSheet, BadgePill } from "@/components/provider-badges";
import { getBadges, evaluateAutoBadges } from "@/lib/badge-store";
import { onStoreChange } from "@/lib/store-events";
import { formatDate as formatUzDate } from "@/lib/date-utils";
import { ReferralCard } from "@/components/referral-card";
import logoImg from "/hormang-logo.png";
import { TangaChip } from "@/pages/plans";
import {
  getPublishedAnnouncements, markAnnouncementSeen, getSeenAnnouncementIds,
  type Announcement,
} from "@/lib/announcements-store";
import { NotificationsBell } from "@/components/notifications-bell";

/* ─── Helpers ─────────────────────────────────────────────────────── */
function formatDate(iso: string, months?: string[]): string {
  return formatUzDate(iso, { months });
}

function timeAgo(iso: string, t: Dict): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return tFormat(t.time.minutesAgoTpl, { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return tFormat(t.time.hoursAgoTpl, { n: hrs });
  return tFormat(t.time.daysAgoTpl, { n: Math.floor(hrs / 24) });
}

function urgencyLabel(u: ProviderRequest["urgency"], t: Dict): { label: string; color: string } {
  if (u === "urgent") return { label: t.urgency.urgent, color: "text-red-600 bg-red-50 border-red-100" };
  if (u === "normal") return { label: t.urgency.normal, color: "text-blue-600 bg-blue-50 border-blue-100" };
  return { label: t.urgency.flexible, color: "text-gray-500 bg-gray-100 border-gray-200" };
}

const VIOLET = "linear-gradient(135deg, hsl(262,80%,54%) 0%, hsl(236,76%,60%) 100%)";

/* ─── Reward celebration confetti dots ───────────────────────────── */
const CONFETTI_DOTS = [
  { x: "8%",  y: "20%", s: 7,  c: "#FCD34D" },
  { x: "18%", y: "65%", s: 5,  c: "#A78BFA" },
  { x: "30%", y: "12%", s: 6,  c: "#34D399" },
  { x: "45%", y: "70%", s: 4,  c: "#FB7185" },
  { x: "58%", y: "18%", s: 5,  c: "#60A5FA" },
  { x: "68%", y: "55%", s: 7,  c: "#FCD34D" },
  { x: "78%", y: "10%", s: 4,  c: "#A78BFA" },
  { x: "88%", y: "62%", s: 6,  c: "#34D399" },
  { x: "92%", y: "30%", s: 5,  c: "#FB7185" },
  { x: "22%", y: "40%", s: 4,  c: "#60A5FA" },
  { x: "72%", y: "80%", s: 5,  c: "#FCD34D" },
  { x: "50%", y: "45%", s: 3,  c: "#A78BFA" },
];

/* ─── Celebration Modal ──────────────────────────────────────────── */
function CelebrationModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.82, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="relative bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient header */}
        <div
          className="relative h-32 flex items-center justify-center overflow-hidden"
          style={{ background: VIOLET }}
        >
          {CONFETTI_DOTS.map((d, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{ width: d.s, height: d.s, background: d.c, left: d.x, top: d.y }}
              animate={{ y: [0, -16, 0], opacity: [0.9, 0.5, 0.9], rotate: [0, 180, 360] }}
              transition={{ duration: 1.6 + i * 0.12, repeat: Infinity, ease: "easeInOut", delay: i * 0.07 }}
            />
          ))}
          <span className="text-5xl relative z-10 drop-shadow-lg select-none">🎉</span>
        </div>

        {/* Body */}
        <div className="px-6 pt-5 pb-6 text-center">
          <h2 className="text-xl font-extrabold text-gray-900 mb-1.5">{t.providerHome.celebration.title}</h2>
          <p className="text-sm text-gray-500 mb-5 leading-relaxed">
            {tFormat(t.providerHome.celebration.bodyTpl, { pct: 100 })}
            <br />{t.providerHome.celebration.bodyLine2}
          </p>

          {/* Reward badge */}
          <div className="flex items-center justify-center gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 mb-5">
            <span className="text-2xl font-extrabold text-amber-600 leading-none">+5</span>
            <TangaCoin size="lg" />
            <div className="text-left">
              <p className="text-sm font-extrabold text-amber-700">{t.providerHome.celebration.rewardTitle}</p>
              <p className="text-[11px] text-amber-500">{t.providerHome.celebration.rewardSubtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-sm transition-all active:scale-[.98] shadow-md shadow-violet-200"
            style={{ background: VIOLET }}
          >
            {t.providerHome.celebration.closeBtn}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Circular Progress ──────────────────────────────────────────── */
function CircularProgress({ pct }: { pct: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="72" height="72" className="rotate-[-90deg]">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#EDE9FE" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={r} fill="none" strokeWidth="7"
        stroke="url(#vgrad)" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <defs>
        <linearGradient id="vgrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(262,80%,54%)" />
          <stop offset="100%" stopColor="hsl(236,76%,60%)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─── Profile Completion ─────────────────────────────────────────── */
function ProfileCompletion() {
  useStoreRefresh();
  const { user, providerProfile } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const dismissKey = user?.id ? `profile_completion_dismissed_${user.id}` : "";
  const [dismissed, setDismissed] = useState(false);
  const [justRewarded, setJustRewarded] = useState(false);
  const [rewardGranted, setRewardGranted] = useState(false);
  const [showBadgeHint, setShowBadgeHint] = useState(false);

  const local     = user ? getLocalProfile(user.id) : {};
  const rawChecks = getCompletionChecks(user ?? null, providerProfile, local);
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
  const checks  = rawChecks.map((c) => providerCheckLabels[c.key] ? { ...c, label: providerCheckLabels[c.key] } : c);
  const missing = checks.filter((c) => !c.done);

  useEffect(() => {
    if (!dismissKey) {
      setDismissed(false);
      return;
    }
    setDismissed(localStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  useEffect(() => {
    if (!user?.id) return;
    setRewardGranted(getProfileRewardStatus(user.id).granted);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || pct !== 100) return;
    let cancelled = false;
    tryGrantProfileReward(user.id).then((wasJustGranted) => {
      if (cancelled) return;
      if (wasJustGranted) {
        setRewardGranted(true);
        setJustRewarded(true);
      } else {
        setRewardGranted(getProfileRewardStatus(user.id).granted);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id, pct]);

  useEffect(() => {
    if (!user) return;
    evaluateAutoBadges(user);
    return onStoreChange(() => evaluateAutoBadges(user));
  }, [user]);

  if (pct === 100 && dismissed) return null;

  return (
    <>
      <AnimatePresence>
        {justRewarded && (
          <CelebrationModal onClose={() => setJustRewarded(false)} />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => pct < 100 && setLocation("/profile/settings")}
        className={`relative bg-white rounded-2xl border border-violet-100 card-shadow p-4 mb-4 active:scale-[.99] transition-all ${pct < 100 ? "cursor-pointer" : ""}`}
      >
        {pct === 100 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (dismissKey) localStorage.setItem(dismissKey, "1");
              setDismissed(true);
            }}
            className="absolute right-3 top-3 w-7 h-7 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label={t.providerHome.profileCompletion.closeAria}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <CircularProgress pct={pct} />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-violet-700">
              {pct}%
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm mb-0.5">
              {pct === 100 ? t.providerHome.profileCompletion.fullTitle : t.providerHome.profileCompletion.fillTitle}
            </p>
            <p className="text-xs text-gray-500 mb-2">{tFormat(t.providerHome.profileCompletion.stepsTpl, { done: checks.length - missing.length, total: checks.length })}</p>
            {pct === 100 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  {t.providerHome.profileCompletion.fullBadge}
                </div>
                {rewardGranted ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
                    <span className="text-sm">🎖</span>
                    {t.providerHome.profileCompletion.rewardClaimed}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1">
                {missing.slice(0, 2).map((m) => (
                  <div key={m.key} className="flex items-center gap-1.5 text-xs text-violet-600">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {m.label}
                  </div>
                ))}
                {!rewardGranted && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-1">
                    <TangaCoin size="sm" />
                    {t.providerHome.profileCompletion.rewardHint}
                  </div>
                )}
              </div>
            )}
          </div>
          {pct < 100 && <ChevronRight className="w-5 h-5 text-violet-400 flex-shrink-0" />}
        </div>

        {/* ── Badge strip — click to see conditions ── */}
        {user && (() => {
          const badges = getBadges(user.id);
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowBadgeHint(true); }}
              className="mt-3 pt-3 border-t border-gray-100 w-full flex items-center gap-2 group text-left"
            >
              {badges.length > 0 ? (
                <div className="flex flex-wrap gap-1 flex-1">
                  {badges.map((b) => (
                    <BadgePill key={b.type} type={b.type} size="sm" />
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-gray-400 font-medium flex-1">
                  {t.providerHome.profileCompletion.noBadges}
                </span>
              )}
              <span className="text-[10px] text-violet-400 group-hover:text-violet-600 transition-colors font-semibold flex-shrink-0 whitespace-nowrap">
                {t.providerHome.profileCompletion.conditions}
              </span>
            </button>
          );
        })()}
      </motion.div>

      <BadgeConditionsSheet open={showBadgeHint} onClose={() => setShowBadgeHint(false)} />
    </>
  );
}

/* ─── Upcoming Service Row (resolves its request's categoryId async) ── */
function UpcomingServiceRow({ service: s, index: i, onSelect, onComplete }: {
  service: UpcomingService;
  index: number;
  onSelect: () => void;
  onComplete: (e: React.MouseEvent) => void;
}) {
  const { t, locale } = useI18n();
  const [categoryId, setCategoryId] = useState<string>("");
  useEffect(() => {
    if (!s.requestId) { setCategoryId(""); return; }
    let cancelled = false;
    getRequestById(s.requestId).then((req) => { if (!cancelled) setCategoryId(req?.categoryId ?? ""); });
    return () => { cancelled = true; };
  }, [s.requestId]);

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.07 }}
      onClick={onSelect}
      className="w-full bg-white rounded-2xl border border-gray-100 card-shadow p-4 flex items-start gap-3 hover:shadow-sm hover:border-violet-100 transition-all text-left active:scale-[.99]"
    >
      <CategoryIcon
        categoryId={s.requestId ? categoryId || null : null}
        emoji={s.categoryEmoji}
        size={44}
        shape="square"
        className="flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-gray-900 truncate">
          {s.requestId ? getCategoryDisplayName(categoryId, locale, s.title) : s.title}
        </p>
        <p className="text-xs text-gray-500 mb-1">{s.customerName}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] text-violet-600 font-semibold">
            <CalendarDays className="w-3 h-3" />
            {formatDate(s.date, t.shared.months)} · {s.time}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <MapPin className="w-3 h-3" />{s.location}
          </span>
        </div>
      </div>
      <button
        onClick={onComplete}
        className="w-8 h-8 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 flex items-center justify-center flex-shrink-0 transition-colors"
        title={t.providerHome.upcoming.doneBtnTitle}
      >
        <Check className="w-4 h-4 text-emerald-600" />
      </button>
    </motion.button>
  );
}

/* ─── Upcoming Services ──────────────────────────────────────────── */
function UpcomingServices() {
  useStoreRefresh();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const masterId = user?.id ?? "";
  const services = getUpcomingServices(masterId).filter((s) => s.status === "upcoming");
  const [selectedService, setSelectedService] = useState<UpcomingService | null>(null);
  const [reviewService, setReviewService] = useState<UpcomingService | null>(null);
  const [confirmService, setConfirmService] = useState<UpcomingService | null>(null);

  function requestComplete(s: UpcomingService, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmService(s);
  }

  async function handleDone(s: UpcomingService) {
    if (s.offerId) {
      const result = await confirmCompletion(s.offerId, "provider");
      if (result === "completed") {
        const alreadyReviewed = s.requestId ? hasReviewedRequest(s.requestId, masterId) : false;
        if (!alreadyReviewed) {
          setReviewService(s);
          return;
        }
      }
    }
    markServiceDone(s.id, masterId);
  }

  async function handleReviewSubmit(data: ReviewSubmitData) {
    if (!reviewService) return;
    if (reviewService.customerId && reviewService.requestId) {
      const offer = reviewService.offerId ? await getOfferById(reviewService.offerId) : null;
      try {
        await addReview({
          requestId: reviewService.requestId,
          offerId: reviewService.offerId,
          reviewerId: masterId,
          reviewerRole: "provider",
          reviewedId: reviewService.customerId,
          reviewedRole: "customer",
          rating: data.rating,
          comment: data.text || undefined,
          photoUrl: data.photoUrl,
          platformSentiment: data.platformSentiment,
          platformFeedback: data.platformFeedback,
          reviewerName: offer?.masterName,
          reviewerInitials: offer?.masterInitials,
          reviewerColor: offer?.masterColor,
          reviewedName: reviewService.customerName,
          serviceCategory: reviewService.title,
        });
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : t.common.errorGeneric, variant: "destructive" });
      }
    }
    markServiceDone(reviewService.id, masterId);
    setReviewService(null);
  }

  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  useEffect(() => {
    if (!selectedService?.offerId) { setSelectedOffer(null); return; }
    let cancelled = false;
    getOfferById(selectedService.offerId).then((o) => { if (!cancelled) setSelectedOffer(o ?? null); });
    return () => { cancelled = true; };
  }, [selectedService?.offerId]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-violet-600" />
          <h2 className="font-bold text-sm text-gray-900">{t.providerHome.upcoming.title}</h2>
        </div>
        <span className="text-xs font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{tFormat(t.providerHome.countTpl, { n: services.length })}</span>
      </div>

      {services.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 card-shadow p-5 text-center">
          <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-400">{t.providerHome.upcoming.empty}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((s, i) => (
            <UpcomingServiceRow
              key={s.id}
              service={s}
              index={i}
              onSelect={() => setSelectedService(s)}
              onComplete={(e) => requestComplete(s, e)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedService && selectedOffer && (
          <OfferDetailModal
            key={`upcoming-offer-${selectedOffer.id}`}
            offer={selectedOffer}
            readOnly
            onClose={() => setSelectedService(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reviewService && (
          <ReviewModal
            key="home-review"
            subjectName={reviewService.customerName}
            subjectInitials={reviewService.customerInitials}
            subjectColor={reviewService.customerColor}
            subjectPhotoUrl={reviewService.customerId ? getLocalProfile(reviewService.customerId).photoUrl : undefined}
            prompt={t.providerHome.upcoming.reviewPrompt}
            onSubmit={handleReviewSubmit}
            onSkip={() => {
              markServiceDone(reviewService.id, masterId);
              setReviewService(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmService && (
          <ConfirmModal
            key="home-complete-confirm"
            title={t.providerHome.upcoming.confirmTitle}
            message={t.providerHome.upcoming.confirmMessage}
            confirmText={t.providerHome.upcoming.confirmYes}
            onConfirm={() => handleDone(confirmService)}
            onClose={() => setConfirmService(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Request Card (swipeable) ───────────────────────────────────── */
function RequestSlideCard({
  request,
  onRespond,
  onIgnore,
  onNext,
  isLast,
  index,
  total,
}: {
  request: ProviderRequest;
  onRespond: (id: string) => void;
  onIgnore: (id: string) => void;
  onNext: () => void;
  isLast: boolean;
  index: number;
  total: number;
}) {
  const { t, locale } = useI18n();
  const urg = urgencyLabel(request.urgency, t);
  const [offerCount, setOfferCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getRequestOfferCount(request.id).then((n) => { if (!cancelled) setOfferCount(n); });
    return () => { cancelled = true; };
  }, [request.id]);

  return (
    <motion.div
      key={request.id}
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: -10 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="bg-white rounded-3xl border border-gray-100 card-shadow overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-50 flex items-center gap-3">
        <CategoryIcon categoryId={request.categoryId} emoji={request.emoji} size={36} shape="square" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-gray-900">{getCategoryDisplayName(request.categoryId, locale, request.categoryName)}</p>
          <p className="text-xs text-gray-400">{request.customerName} · {timeAgo(request.createdAt, t)}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urg.color}`}>
          {urg.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <p className="text-sm text-gray-700 leading-relaxed mb-4">{getLocalizedDescription(request, locale)}</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{t.providerHome.card.budget}</p>
            <p className="text-sm font-extrabold text-violet-700">{getBudgetLabel(request.budgetLabel, t)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{t.providerHome.card.location}</p>
            <p className="text-sm font-bold text-gray-800 truncate">{getRequestLocation(request, locale)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{t.providerHome.card.offers}</p>
            <p className={`text-sm font-extrabold ${offerCount === 0 ? "text-red-500" : "text-emerald-600"}`}>
              {tFormat(t.providerHome.countTpl, { n: offerCount })}
            </p>
          </div>
        </div>

        {/* Counter */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-violet-600" : "w-1.5 bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onIgnore(request.id)}
            className="flex-1 h-11 rounded-2xl border-2 border-red-100 bg-red-50 text-red-600 font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 hover:bg-red-100"
          >
            {t.providerHome.card.delete}
          </button>
          <button
            onClick={() => onRespond(request.id)}
            className="flex-1 h-11 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
            style={{ background: VIOLET }}
          >
            <Send className="w-4 h-4" />
            {t.providerHome.card.sendOffer}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Request List Modal — Card ──────────────────────────────────── */
function RequestModalCard({ r, index: i, onRespond, onIgnore }: {
  r: ProviderRequest;
  index: number;
  onRespond: (id: string) => void;
  onIgnore: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const urg = urgencyLabel(r.urgency, t);
  const isResponded = r.status === "responded";
  const [offerCnt, setOfferCnt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getRequestOfferCount(r.id).then((n) => { if (!cancelled) setOfferCnt(n); });
    return () => { cancelled = true; };
  }, [r.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isResponded ? "border-emerald-100" : "border-gray-100"}`}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-50">
        <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={36} shape="square" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-gray-900">{getCategoryDisplayName(r.categoryId, locale, r.categoryName)}</p>
          <p className="text-xs text-gray-400">{r.customerName} · {timeAgo(r.createdAt, t)}</p>
        </div>
        {isResponded ? (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 flex items-center gap-1">
            <Check className="w-2.5 h-2.5" />
            {t.providerHome.card.offerSent}
          </span>
        ) : (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urg.color}`}>
            {urg.label}
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="px-4 py-3">
        <p className="text-sm text-gray-600 leading-relaxed mb-3 line-clamp-2">
          {getLocalizedDescription(r, locale)}
        </p>

        {/* Info chips */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{t.providerHome.card.budget}</p>
            <p className="text-xs font-extrabold text-violet-700">{getBudgetLabel(r.budgetLabel, t)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{t.providerHome.card.location}</p>
            <p className="text-xs font-bold text-gray-700 truncate">{getRequestLocation(r, locale)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2 text-center">
            <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{t.providerHome.card.offers}</p>
            <p className={`text-xs font-extrabold ${offerCnt === 0 ? "text-red-500" : "text-emerald-600"}`}>
              {tFormat(t.providerHome.countTpl, { n: offerCnt })}
            </p>
          </div>
        </div>

        {/* Actions */}
        {isResponded ? (
          <div className="h-9 rounded-xl border-2 border-emerald-100 bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t.providerHome.card.offerSentWaiting}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => onIgnore(r.id)}
              className="flex-1 h-9 rounded-xl border-2 border-red-100 bg-red-50 text-red-600 font-bold text-xs flex items-center justify-center gap-1 transition-all active:scale-95 hover:bg-red-100"
            >
              {t.providerHome.card.delete}
            </button>
            <button
              onClick={() => onRespond(r.id)}
              className="flex-1 h-9 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
              style={{ background: VIOLET }}
            >
              <Send className="w-3.5 h-3.5" />
              {t.providerHome.card.sendOffer}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Request List Modal ─────────────────────────────────────────── */
function RequestsModal({
  title,
  requests,
  onClose,
  onRespond,
  onIgnore,
  onMarkAllSeen,
  isNewModal,
}: {
  title: string;
  requests: ProviderRequest[];
  onClose: () => void;
  onRespond: (id: string) => void;
  onIgnore: (id: string) => void;
  onMarkAllSeen: () => void;
  isNewModal: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 38 }}
          className="bg-gray-50 rounded-t-3xl flex flex-col mt-16 flex-1 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-100 rounded-t-3xl">
            <h2 className="font-black text-base text-gray-900">{title}</h2>
            <div className="flex items-center gap-2">
              {isNewModal && requests.length > 0 && (
                <button
                  onClick={() => {
                    onMarkAllSeen();
                  }}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                  title={t.providerHome.modal.markAllSeen}
                >
                  {t.providerHome.modal.markAllSeen}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8">
            {requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="w-10 h-10 text-gray-300 mb-3" />
                <p className="text-sm font-semibold text-gray-400">
                  {t.providerHome.modal.noMatching}
                </p>
              </div>
            ) : (
              requests.map((r, i) => (
                <RequestModalCard
                  key={r.id}
                  r={r}
                  index={i}
                  onRespond={onRespond}
                  onIgnore={onIgnore}
                />
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── Available Requests ─────────────────────────────────────────── */
type ModalType = "all" | "new" | "zero" | null;

function AvailableRequests() {
  useStoreRefresh();
  const { t } = useI18n();
  const [modal, setModal] = useState<ModalType>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [offerRequest, setOfferRequest] = useState<ProviderRequest | null>(null);
  const { toast } = useToast();
  const { providerProfile, user: authUser } = useAuth();

  const selectedCategories = providerProfile?.categories ?? [];
  const localProfile = authUser?.id ? getLocalProfile(authUser.id) : {};
  const serviceAreas = localProfile.serviceAreas ?? [];
  const serviceAreaV2 = localProfile.serviceAreaV2;
  const providerId = authUser?.id ?? "";
  const selectedCategoriesKey = selectedCategories.join(",");
  const serviceAreasKey = serviceAreas.join(",");

  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [zeroOffers, setZeroOffers] = useState<ProviderRequest[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const load = () => setRefreshTick((n) => n + 1);
  useEffect(() => {
    if (!providerId) { setRequests([]); setZeroOffers([]); return; }
    Promise.all([
      getMatchingRequests(selectedCategories, serviceAreas, providerId, serviceAreaV2),
      getRequestsWithZeroOffers(selectedCategories, serviceAreas, providerId, serviceAreaV2),
    ]).then(([reqs, zero]) => {
      setRequests(reqs);
      setZeroOffers(zero);
    }).catch((err) => console.error("Load available requests failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoriesKey, serviceAreasKey, serviceAreaV2, providerId, refreshTick]);

  const seen = getSeenIds(providerId);

  const visibleRequests = requests.filter((r) => r.status !== "ignored");
  const newUnseen       = requests.filter((r) => !seen.includes(r.id) && r.status === "open");

  const newCount      = newUnseen.length;
  const totalOpen     = visibleRequests.length;
  const zeroCount     = zeroOffers.length;

  const prevUnseenCount = useRef<number | null>(null);
  useEffect(() => {
    if (prevUnseenCount.current !== null && newCount > prevUnseenCount.current) {
      const diff = newCount - prevUnseenCount.current;
      toast({ title: t.providerHome.available.toastTitle, description: tFormat(t.providerHome.available.toastDescTpl, { n: diff }) });
    }
    prevUnseenCount.current = newCount;
  }, [newCount]);

  const slideReqs = newUnseen;
  const current   = slideReqs[slideIndex];

  function handleIgnore(id: string) {
    const nextIndex = Math.max(0, slideReqs.length - 2);
    updateProviderRequestStatus(id, "ignored", providerId);
    markSeen(id, providerId);
    setSlideIndex(slideIndex >= slideReqs.length - 1 ? nextIndex : slideIndex);
    load();
  }

  function handleRespondFromModal(id: string) {
    const nextIndex = Math.max(0, slideReqs.length - 2);
    markSeen(id, providerId);
    const req = requests.find((r) => r.id === id) ?? null;
    setOfferRequest(req);
    setModal(null);
    if (slideIndex >= slideReqs.length - 1) setSlideIndex(nextIndex);
  }

  function handleIgnoreFromModal(id: string) {
    updateProviderRequestStatus(id, "ignored", providerId);
    markSeen(id, providerId);
    load();
  }

  const modalRequests =
    modal === "all"  ? visibleRequests :
    modal === "new"  ? newUnseen :
    modal === "zero" ? zeroOffers :
    [];

  const modalTitle =
    modal === "all"  ? t.providerHome.modal.titleAll :
    modal === "new"  ? t.providerHome.modal.titleNew :
    modal === "zero" ? t.providerHome.modal.titleZero :
    "";

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="w-4 h-4 text-violet-600" />
          <h2 className="font-bold text-sm text-gray-900">{t.providerHome.available.title}</h2>
        </div>

        {/* ── Clickable Stats Row ── */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            onClick={() => setModal("all")}
            className="bg-white rounded-2xl border border-gray-100 card-shadow p-3 text-center transition-all active:scale-95 hover:border-violet-200 hover:shadow-md"
          >
            <p className="text-xl font-black text-gray-900">{totalOpen}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-0.5 leading-tight">{t.providerHome.available.statAll}</p>
          </button>

          <button
            onClick={() => setModal("new")}
            className="bg-white rounded-2xl border border-gray-100 card-shadow p-3 text-center relative transition-all active:scale-95 hover:border-red-200 hover:shadow-md"
          >
            {newCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500" />
            )}
            <p className="text-xl font-black text-gray-900">{newCount}</p>
            <p className="text-[10px] font-bold text-gray-400 mt-0.5 leading-tight">{t.providerHome.available.statNew}</p>
          </button>

          <button
            onClick={() => setModal("zero")}
            className="bg-white rounded-2xl border border-gray-100 card-shadow p-3 text-center transition-all active:scale-95 hover:border-orange-200 hover:shadow-md"
          >
            <p className={`text-xl font-black ${zeroCount > 0 ? "text-red-500" : "text-gray-900"}`}>
              {zeroCount}
            </p>
            <p className="text-[10px] font-bold text-gray-400 mt-0.5 leading-tight">{t.providerHome.available.statZero}</p>
          </button>
        </div>

        {/* ── Slide Cards for new requests ── */}
        {slideReqs.length > 0 && (
          <div className="mb-2">
            <AnimatePresence mode="wait">
              {current && (
                <RequestSlideCard
                  key={current.id}
                  request={current}
                  onRespond={handleRespondFromModal}
                  onIgnore={handleIgnore}
                  onNext={() => setSlideIndex((i) => Math.min(i + 1, slideReqs.length - 1))}
                  isLast={slideIndex === slideReqs.length - 1}
                  index={slideIndex}
                  total={slideReqs.length}
                />
              )}
            </AnimatePresence>
            <div className="flex justify-between mt-3">
              <button
                disabled={slideIndex === 0}
                onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 disabled:opacity-30 hover:text-violet-600 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> {t.providerHome.available.prev}
              </button>
              <button
                disabled={slideIndex >= slideReqs.length - 1}
                onClick={() => setSlideIndex((i) => Math.min(i + 1, slideReqs.length - 1))}
                className="flex items-center gap-1 text-xs font-semibold text-gray-400 disabled:opacity-30 hover:text-violet-600 transition-colors"
              >
                {t.providerHome.available.next} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {slideReqs.length === 0 && (
          <div className="text-center py-6">
            <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-400">
              {selectedCategories.length > 0
                ? t.providerHome.available.emptyNew
                : t.providerHome.available.pickCategories}
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal !== null && (
        <RequestsModal
          title={modalTitle}
          requests={modalRequests}
          onClose={() => setModal(null)}
          onRespond={(id) => { handleRespondFromModal(id); }}
          onIgnore={(id) => { handleIgnoreFromModal(id); }}
          isNewModal={modal === "new"}
          onMarkAllSeen={() => {
            modalRequests.forEach((r) => markSeen(r.id, providerId));
          }}
        />
      )}

      {/* ── Inline Offer Form ── */}
      <AnimatePresence>
        {offerRequest && (
          <OfferForm
            request={offerRequest}
            onClose={() => setOfferRequest(null)}
            onSubmitted={() => { setOfferRequest(null); load(); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}


/* ─── Announcement full-content modal ───────────────────────────── */
function AnnouncementModal({
  ann,
  onClose,
}: {
  ann: Announcement;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const annTitle   = getLocalizedText(ann.titleLocalized   ?? ann.title,   locale);
  const annContent = getLocalizedText(ann.contentLocalized ?? ann.content, locale);
  const annCtaText = ann.ctaTextLocalized
    ? getLocalizedText(ann.ctaTextLocalized, locale)
    : ann.ctaText ?? "";
  const [, setLocation] = useLocation();
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="fixed inset-x-4 top-[8vh] bottom-[8vh] z-[61] max-w-md mx-auto bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {ann.image && (
          <img
            src={ann.image} alt={ann.title}
            className="w-full h-44 object-cover flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              ann.type === "event"
                ? "bg-orange-50 text-orange-700 border-orange-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}>
              {ann.type === "event" ? t.providerHome.events.typeEvent : t.providerHome.events.typeNews}
            </span>
            {ann.isPinned && <span className="text-base">📌</span>}
          </div>
          <h2 className="font-extrabold text-gray-900 text-lg leading-snug">{annTitle}</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{annContent}</p>
          {ann.expiresAt && (
            <p className="text-[10px] text-gray-400">
              {tFormat(t.providerHome.events.deadlineTpl, { date: new Date(ann.expiresAt).toLocaleDateString("uz-UZ") })}
            </p>
          )}
        </div>
        <div className="px-5 pb-5 space-y-2 flex-shrink-0">
          {annCtaText && ann.ctaLink && (
            <button
              onClick={() => { onClose(); setLocation(ann.ctaLink!); }}
              className="w-full py-3 rounded-2xl font-bold text-sm text-white shadow-sm active:scale-95 transition-all"
              style={{ background: VIOLET }}
            >
              {annCtaText}
            </button>
          )}
          <button onClick={onClose}
            className="w-full py-2.5 rounded-2xl font-bold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            {t.providerHome.modal.closeBtn}
          </button>
        </div>
      </motion.div>
    </>
  );
}

/* ─── Announcements / Events Section ────────────────────────────── */
function EventsSection() {
  useStoreRefresh();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<Announcement | null>(null);

  const items = getPublishedAnnouncements("providers");
  const seenIds = user?.id ? getSeenAnnouncementIds(user.id) : [];
  const unseenCount = items.filter((a) => !seenIds.includes(a.id)).length;

  if (items.length === 0) return null;

  function openAnn(a: Announcement) {
    if (user?.id) markAnnouncementSeen(user!.id, a.id);
    setSelected(a);
  }

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <h2 className="font-bold text-sm text-gray-900">{t.providerHome.events.title}</h2>
            {unseenCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-red-500 text-white">
                {unseenCount}
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-400">{tFormat(t.providerHome.countTpl, { n: items.length })}</span>
        </div>

        <div className="space-y-2">
          {items.map((ann) => {
            const isNew = !seenIds.includes(ann.id);
            return (
              <button
                key={ann.id}
                onClick={() => openAnn(ann)}
                className="w-full text-left"
              >
                <div className={`bg-white rounded-2xl border overflow-hidden card-shadow transition-all active:scale-[0.99] ${
                  ann.isPinned ? "border-amber-200" : "border-gray-100"
                }`}>
                  {ann.image && (
                    <img
                      src={ann.image} alt={ann.title}
                      className="w-full h-28 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                            ann.type === "event"
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            {ann.type === "event" ? t.providerHome.events.typeEvent : t.providerHome.events.typeNews}
                          </span>
                          {ann.isPinned && <span className="text-[11px]">📌</span>}
                          {isNew && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">
                              {t.providerHome.events.isNew}
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-gray-900 text-sm leading-snug truncate">
                          {getLocalizedText(ann.titleLocalized ?? ann.title, locale)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">
                          {getLocalizedText(ann.contentLocalized ?? ann.content, locale)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                    </div>
                    {(ann.ctaTextLocalized ? getLocalizedText(ann.ctaTextLocalized, locale) : ann.ctaText) && (
                      <div className="mt-3">
                        <span
                          className="inline-block px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                          style={{ background: VIOLET }}
                        >
                          {ann.ctaTextLocalized ? getLocalizedText(ann.ctaTextLocalized, locale) : ann.ctaText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <AnnouncementModal ann={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function ProviderHomePage() {
  useStoreRefresh();
  const { user, providerProfile } = useAuth();
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [logoHovered, setLogoHovered] = useState(false);
  const [headerLocal, setHeaderLocal] = useState<ReturnType<typeof getLocalProfile>>({});

  useEffect(() => {
    if (user?.id) setHeaderLocal(getLocalProfile(user.id));
  }, [user?.id]);

  const selectedCategories = providerProfile?.categories ?? [];
  const headerLocalProfile = user?.id ? getLocalProfile(user.id) : {};
  const headerServiceAreas = headerLocalProfile.serviceAreas ?? [];
  const headerServiceAreaV2 = headerLocalProfile.serviceAreaV2;
  const selectedCategoriesKey = selectedCategories.join(",");
  const headerServiceAreasKey = headerServiceAreas.join(",");
  const [unseenCount, setUnseenCount] = useState(0);
  useEffect(() => {
    if (!user?.id) { setUnseenCount(0); return; }
    getMatchingRequests(selectedCategories, headerServiceAreas, user.id, headerServiceAreaV2).then((reqs) => {
      const seen = getSeenIds(user.id);
      setUnseenCount(reqs.filter((r) => !seen.includes(r.id) && r.status === "open").length);
    }).catch((err) => console.error("Load unseen count failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedCategoriesKey, headerServiceAreasKey, headerServiceAreaV2]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 card-shadow">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation("/provider-home")}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
            className="flex items-center gap-2.5">
            <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain" />
            <span className="font-bold text-gray-900 text-sm hidden sm:inline">Hormang</span>
          </button>
          <div className="flex-1" />
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: VIOLET }}>
            {t.providerHome.roleBadge}
          </span>
          {unseenCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">
              {tFormat(t.providerHome.newCountTpl, { n: unseenCount })}
            </span>
          )}
          <TangaChip userId={user?.id ?? ""} onClick={() => setLocation("/plans")} />
          <NotificationsBell audience="providers" accentColor={VIOLET} />
          <button
            onClick={() => setLocation("/dashboard")}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm overflow-hidden flex-shrink-0"
            style={headerLocal.photoUrl ? {} : { background: VIOLET }}
          >
            {headerLocal.photoUrl ? (
              <img src={headerLocal.photoUrl} alt={user?.firstName} className="w-full h-full object-cover" />
            ) : (
              user?.firstName?.[0]
            )}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5"
        >
          <h1 className="text-lg font-extrabold text-gray-900">
            {tFormat(t.providerHome.greetingTpl, { name: user?.firstName ?? "" })}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.providerHome.greetingSubtitle}</p>
        </motion.div>

        <ProfileCompletion />
        <UpcomingServices />
        <EventsSection />
        <AvailableRequests />
        <ReferralCard />
      </div>

      <BottomNav />
    </div>
  );
}
