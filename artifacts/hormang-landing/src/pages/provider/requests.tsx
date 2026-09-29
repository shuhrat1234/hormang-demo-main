import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  ChevronLeft, ChevronRight, Send, Inbox, MapPin, Filter, X, Check, CheckCircle2,
  Eye, Clock, DollarSign, FileText, AlertOctagon, User, Search, SlidersHorizontal,
  Loader2, Flag,
} from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { OfferForm } from "@/components/offer-form";
import { PublicProfilePreviewModal } from "@/components/public-profile-preview-modal";
import { ImageGrid, getAnswerImageUrls } from "@/components/image-grid";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { getLocalProfile } from "@/lib/local-profile";
import {
  getMatchingRequests, getUnseenRequests, markSeen, markAllSeen,
  updateProviderRequestStatus, getOfferByRequestId, getRequestOfferCount,
  getLocalizedDescription, getRequestsWithZeroOffers,
  type ProviderRequest, type ProviderOffer,
} from "@/lib/provider-store";
import { canSubmitOffer, offerBlockLabel, MAX_ACTIVE_OFFERS, MAX_LIFETIME_OFFERS, type CanSubmitOfferReason, type Offer } from "@/lib/requests-store";
import { getAllQuestionsForCategory, collectActiveQuestions, type QuestionOption } from "@/lib/questionnaire-store";
import { getLocalizedText } from "@/lib/localization";
import { getRequestLocation } from "@/lib/regions";
import logoImg from "/hormang-logo.png";
import { TangaChip } from "@/pages/plans";
import { useI18n } from "@/contexts/i18n-context";
import { getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { tFormat, getBudgetLabel, type Locale } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/locales/uz";

function timeAgo(iso: string, t: Dict): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return tFormat(t.time.minutesAgoTpl, { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return tFormat(t.time.hoursAgoTpl, { n: hrs });
  return tFormat(t.time.daysAgoTpl, { n: Math.floor(hrs / 24) });
}

function urgencyLabel(u: ProviderRequest["urgency"], t: Dict): { label: string; color: string; dot: string } {
  if (u === "urgent") return { label: t.urgency.urgent, color: "text-red-600 bg-red-50 border-red-100", dot: "bg-red-500" };
  if (u === "normal") return { label: t.urgency.normal, color: "text-blue-600 bg-blue-50 border-blue-100", dot: "bg-blue-500" };
  return { label: t.urgency.flexible, color: "text-gray-500 bg-gray-100 border-gray-200", dot: "bg-gray-400" };
}

const VIOLET = "linear-gradient(135deg, hsl(262,80%,54%) 0%, hsl(236,76%,60%) 100%)";
const BLUE   = "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)";

const SKIP_ANSWER_KEYS = new Set(["budget_open", "urgency", "budget", "region", "district", "location"]);

function formatAnswerValue(
  value: unknown,
  options: QuestionOption[] | undefined,
  otherText: string | undefined,
  t: Dict,
  locale?: string,
): string {
  const optLabel = (o: QuestionOption) => getLocalizedText(o.labelLocalized ?? o.label, (locale ?? "uz") as Locale);
  if (value === null || value === undefined || value === "") return t.providerRequests.formatHelpers.none;
  if (typeof value === "string" && value.startsWith("data:")) return "__IMAGE__";
  if (typeof value === "boolean") return value ? t.providerRequests.formatHelpers.yes : t.providerRequests.formatHelpers.no;
  if (typeof value === "number") return value.toLocaleString("uz-Latn-UZ") + (String(value).length > 3 ? " " + t.shared.sumSuffix : "");
  const otherOpt = options?.find((o) => o.type === "other");
  if (typeof value === "string") {
    if (otherOpt && value === otherOpt.value && otherText) return otherText;
    const match = options?.find((o) => o.value === value);
    return match ? optLabel(match) : value;
  }
  if (Array.isArray(value)) {
    return (value as string[]).map((v) => {
      if (otherOpt && v === otherOpt.value && otherText) return otherText;
      const match = options?.find((o) => o.value === v);
      return match ? optLabel(match) : v;
    }).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const loc = value as Record<string, unknown>;
    const parts = [loc.district, loc.region].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length > 0) return parts.join(", ");
    const strs = Object.values(loc).filter((v): v is string => typeof v === "string" && v.length > 0);
    return strs.join(", ") || t.providerRequests.formatHelpers.none;
  }
  return String(value);
}

function FullscreenSlider({
  requests,
  startIndex,
  onClose,
  onOpenOffer,
  onIgnore,
}: {
  requests: ProviderRequest[];
  startIndex: number;
  onClose: () => void;
  onOpenOffer: (req: ProviderRequest) => void;
  onIgnore: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [index, setIndex] = useState(startIndex);
  const current = requests[index];
  const { user: sliderUser } = useAuth();

  const urg = current ? urgencyLabel(current.urgency, t) : null;
  const [sliderCheck, setSliderCheck] = useState<{ ok: boolean; reason?: CanSubmitOfferReason }>({ ok: true, reason: undefined });
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    canSubmitOffer(current.id, sliderUser?.id ?? "").then((c) => { if (!cancelled) setSliderCheck(c); });
    return () => { cancelled = true; };
  }, [current?.id, sliderUser?.id]);
  const sliderBlocked = !sliderCheck.ok;
  const sliderBlockedText = sliderBlocked ? offerBlockLabel(sliderCheck.reason, t) : "";

  useEffect(() => { if (current) markSeen(current.id, sliderUser?.id); }, [current?.id, sliderUser?.id]);

  function next() { if (index < requests.length - 1) setIndex((i) => i + 1); }
  function prev() { if (index > 0) setIndex((i) => i - 1); }

  function handleIgnore() {
    if (!current) return;
    onIgnore(current.id);
    if (index < requests.length - 1) setIndex((i) => i + 1);
    else onClose();
  }

  function handleDrag(_: unknown, info: PanInfo) {
    if (info.offset.x < -60) next();
    else if (info.offset.x > 60) prev();
  }

  if (!current) { onClose(); return null; }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDragEnd={handleDrag}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto relative"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute top-3 left-1/2 -translate-x-1/2" />
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-6 pt-2">
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {requests.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index ? "w-6 bg-violet-600" : i < index ? "w-1.5 bg-violet-200" : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>

          <p className="text-center text-xs text-gray-400 font-semibold mb-4">
            {tFormat(t.providerRequests.slider.counterTpl, { i: index + 1, n: requests.length })}
          </p>

          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-start gap-3 mb-4">
                <CategoryIcon categoryId={current.categoryId} emoji={current.emoji} size={48} shape="square" className="flex-shrink-0" />
                <div>
                  <p className="font-extrabold text-base text-gray-900">{getCategoryDisplayName(current.categoryId, locale, current.categoryName)}</p>
                  <p className="text-xs text-gray-400">{current.customerName} · {timeAgo(current.createdAt, t)}</p>
                </div>
              </div>

              {urg && (
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border mb-4 ${urg.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${urg.dot}`} />
                  {urg.label}
                </span>
              )}

              <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                <p className="text-sm text-gray-700 leading-relaxed">{getLocalizedDescription(current, locale)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-violet-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wide mb-1">{t.providerRequests.slider.budget}</p>
                  <p className="text-sm font-extrabold text-violet-700">{getBudgetLabel(current.budgetLabel, t)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{t.providerRequests.slider.location}</p>
                  <p className="text-xs font-bold text-gray-800">{getRequestLocation(current, locale)}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex gap-2 mb-3">
            <button
              disabled={index === 0}
              onClick={prev}
              className="w-10 h-11 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-400 disabled:opacity-30 hover:border-gray-300 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleIgnore}
              className="flex-1 h-11 rounded-xl border-2 border-red-100 bg-red-50 text-red-600 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 hover:bg-red-100 transition-all"
            >
              {t.providerRequests.slider.delete}
            </button>
            <button
              onClick={() => !sliderBlocked && onOpenOffer(current)}
              disabled={sliderBlocked}
              className="flex-1 h-11 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
              style={{ background: sliderBlocked ? "#9CA3AF" : VIOLET }}
              title={sliderBlocked ? sliderBlockedText : undefined}
            >
              <Send className="w-4 h-4" />
              {sliderBlocked ? sliderBlockedText : t.providerRequests.slider.sendOffer}
            </button>
            <button
              disabled={index >= requests.length - 1}
              onClick={next}
              className="w-10 h-11 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-400 disabled:opacity-30 hover:border-gray-300 transition-colors flex-shrink-0"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function OfferDetailModal({
  request,
  offer,
  onClose,
}: {
  request: ProviderRequest;
  offer: ProviderOffer;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [showCustomerProfile, setShowCustomerProfile] = useState(false);

  const urg = urgencyLabel(request.urgency, t);

  const allQuestions = getAllQuestionsForCategory(request.categoryId);
  const activeQuestions = collectActiveQuestions(allQuestions, (request.answers ?? {}) as Record<string, unknown>);
  const qaPairs = activeQuestions
    .filter((q) => !SKIP_ANSWER_KEYS.has(q.id))
    .map((q) => {
      const raw = request.answers?.[q.id];
      if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
      const otherText = request.answers?.[q.id + "_other"] as string | undefined;
      const formatted = formatAnswerValue(raw, q.options, otherText, t, locale);
      if (formatted === "__IMAGE__") return null;
      return { label: getLocalizedText(q.labelLocalized ?? q.label, locale as Locale), value: formatted };
    })
    .filter(Boolean) as { label: string; value: string }[];

  const customerPhotoUrls = request.answers ? getAnswerImageUrls(request.answers as Record<string, unknown>) : [];

  const offerImageUrls = (offer.fileUrls ?? []).filter(
    (u) => u.startsWith("data:image") || u.startsWith("http") || u.startsWith("blob:")
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          className="w-full max-w-lg bg-white rounded-t-3xl max-h-[96vh] flex flex-col"
        >
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h2 className="font-extrabold text-base text-gray-900">{t.providerRequests.offerDetail.title}</h2>
              <p className="text-xs text-gray-400">{t.providerRequests.offerDetail.subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.providerRequests.offerDetail.sectionRequest}</p>

            <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <CategoryIcon categoryId={request.categoryId} emoji={request.emoji} size={44} shape="square" className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-sm text-gray-900">{getCategoryDisplayName(request.categoryId, locale, request.categoryName)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{request.customerName} · {timeAgo(request.createdAt, t)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${urg.color}`}>
                    {urg.label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 mt-3">
                  {request.location && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                      <span>{getRequestLocation(request, locale)}</span>
                    </div>
                  )}
                  {request.budgetLabel && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-violet-700">
                      <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{getBudgetLabel(request.budgetLabel, t)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>{timeAgo(request.createdAt, t)}</span>
                  </div>
                </div>
              </div>

              {qaPairs.length > 0 && (
                <div className="px-4 py-3 space-y-2.5 border-b border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.providerRequests.offerDetail.qaLabel}</p>
                  {qaPairs.map((pair, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <div className="flex-shrink-0 w-1 rounded-full bg-violet-200 self-stretch" />
                      <div className="flex-1 min-w-0">
                        <span className="text-gray-400 font-medium">{pair.label}:</span>
                        <span className="font-bold text-gray-800 ml-1">{pair.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {customerPhotoUrls.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-100">
                  <ImageGrid
                    urls={customerPhotoUrls}
                    label={t.providerRequests.offerDetail.customerImages}
                    columns={3}
                  />
                </div>
              )}

              <div className="px-4 py-3">
                <button
                  onClick={() => setShowCustomerProfile(true)}
                  className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  {t.providerRequests.offerDetail.viewCustomer}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.providerRequests.offerDetail.sectionMyOffer}</p>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 border ${
              offer.status === "accepted" ? "bg-emerald-50 border-emerald-200" :
              offer.status === "rejected" ? "bg-red-50 border-red-200" :
              "bg-amber-50 border-amber-200"
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                offer.status === "accepted" ? "bg-emerald-500" :
                offer.status === "rejected" ? "bg-red-500" : "bg-amber-400"
              }`} />
              <p className={`text-xs font-bold ${
                offer.status === "accepted" ? "text-emerald-700" :
                offer.status === "rejected" ? "text-red-700" : "text-amber-700"
              }`}>
                {offer.status === "accepted" ? t.providerRequests.offerDetail.statusAccepted :
                 offer.status === "rejected" ? t.providerRequests.offerDetail.statusRejected : t.providerRequests.offerDetail.statusPending}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-violet-50 rounded-2xl p-3 border border-violet-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-violet-600" />
                  <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">{t.providerRequests.offerDetail.offerPrice}</p>
                </div>
                <p className="text-sm font-extrabold text-violet-800">{offer.price.toLocaleString() + " " + t.shared.sumSuffix}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-gray-500" />
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t.providerRequests.offerDetail.message}</p>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{offer.message}</p>
            </div>

            {offerImageUrls.length > 0 && (
              <ImageGrid
                urls={offerImageUrls}
                label={t.providerRequests.offerDetail.myImages}
                columns={3}
              />
            )}
          </div>

          <div className="px-5 pb-6 pt-2 flex-shrink-0 border-t border-gray-100">
            <button
              onClick={onClose}
              className="w-full h-11 rounded-2xl border-2 border-gray-200 font-bold text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t.providerRequests.offerDetail.closeBtn}
            </button>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showCustomerProfile && (
          <PublicProfilePreviewModal
            key={`req-customer-${request.customerId}`}
            mode="customer"
            customerData={{
              customerName: request.customerName ?? t.providerRequests.offerDetail.customerFallback,
              customerId: request.customerId,
              region: request.region,
              district: request.district,
              joinedAt: request.createdAt,
            }}
            onClose={() => setShowCustomerProfile(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Available Request Card (resolves canSubmitOffer async) ────────── */
function RequestListCard({ r, index: i, isUnseen, providerId, onOpenOfferForm, onIgnore }: {
  r: ProviderRequest;
  index: number;
  isUnseen: boolean;
  providerId: string;
  onOpenOfferForm: (req: ProviderRequest) => void;
  onIgnore: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const urg = urgencyLabel(r.urgency, t);
  const [submitCheck, setSubmitCheck] = useState<{ ok: boolean; reason?: CanSubmitOfferReason; active: number; total: number }>({ ok: true, active: 0, total: 0 });
  useEffect(() => {
    let cancelled = false;
    canSubmitOffer(r.id, providerId).then((c) => { if (!cancelled) setSubmitCheck(c); });
    return () => { cancelled = true; };
  }, [r.id, providerId]);
  const blocked = !submitCheck.ok;
  const blockedText = blocked ? offerBlockLabel(submitCheck.reason, t) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      className={`bg-white rounded-2xl border card-shadow overflow-hidden ${
        isUnseen ? "border-violet-100" : "border-gray-100"
      }`}
    >
      <div
        onClick={() => onOpenOfferForm(r)}
        className="px-4 pt-3 pb-2 border-b border-gray-50 flex items-center gap-2">
        <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={22} shape="square" className="flex-shrink-0" />
        <p className="text-xs font-semibold text-gray-500 flex-1">{getCategoryDisplayName(r.categoryId, locale, r.categoryName)}</p>
        {isUnseen && <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />}
        <span className="text-[10px] text-gray-400">{timeAgo(r.createdAt, t)}</span>
      </div>
      <div
        onClick={() => onOpenOfferForm(r)}
        className="p-4">
        <p className="text-sm text-gray-700 mb-2 leading-relaxed">{getLocalizedDescription(r, locale)}</p>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="font-extrabold text-sm text-violet-700">{getBudgetLabel(r.budgetLabel, t)}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${urg.color}`}>
            {urg.label}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
            <MapPin className="w-3 h-3" />{getRequestLocation(r, locale)}
          </span>
          <span className={`text-[11px] font-bold ${submitCheck.active === 0 ? "text-red-500" : "text-emerald-600"}`}>
            {tFormat(t.providerRequests.card.activeOffersTpl, { n: submitCheck.active, max: MAX_ACTIVE_OFFERS })}
          </span>
        </div>
        {blocked && (
          <div className="mb-2 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <span className="text-sm flex-shrink-0">🔒</span>
            <p className="text-[11px] font-bold text-gray-700 truncate">{blockedText}</p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onIgnore(r.id)}
            className="flex-1 h-9 rounded-xl border-2 border-red-100 bg-red-50 text-red-500 font-bold text-xs flex items-center justify-center active:scale-95 hover:bg-red-100 transition-all"
          >
            {t.providerRequests.card.delete}
          </button>
          <button
            onClick={() => !blocked && onOpenOfferForm(r)}
            disabled={blocked}
            className="flex-1 h-9 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1 active:scale-95 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
            style={{ background: blocked ? "#9CA3AF" : VIOLET }}
          >
            <Send className="w-3.5 h-3.5" />
            {blocked ? t.providerRequests.card.blockedShort : t.providerRequests.card.sendOffer}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Responded Request Row (resolves its offer async) ───────────────── */
function RespondedRow({ r, index: i, providerId, onOpenDetail }: {
  r: ProviderRequest;
  index: number;
  providerId: string;
  onOpenDetail: (request: ProviderRequest, offer: Offer) => void;
}) {
  useStoreRefresh();
  const { t, locale } = useI18n();
  const [offer, setOffer] = useState<Offer | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getOfferByRequestId(r.id, providerId).then((o) => { if (!cancelled) setOffer(o); });
    return () => { cancelled = true; };
  }, [r.id, providerId]);

  const st = offer?.status ?? "pending";
  const badge =
    st === "accepted"
      ? { label: t.providerChats.badges.accepted, cls: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> }
      : st === "rejected" || st === "Yopilgan"
      ? { label: t.providerChats.badges.rejected, cls: "text-red-500 bg-red-50 border-red-200", icon: <X className="w-3 h-3" /> }
      : st === "in_progress"
      ? { label: t.providerChats.badges.inProgress, cls: "text-blue-600 bg-blue-50 border-blue-200", icon: <Loader2 className="w-3 h-3 animate-spin" /> }
      : st === "completed"
      ? { label: t.providerChats.badges.completed, cls: "text-emerald-700 bg-emerald-100 border-emerald-300", icon: <Flag className="w-3 h-3" /> }
      : { label: t.providerRequests.responded.pending, cls: "text-amber-600 bg-amber-50 border-amber-200", icon: <Clock className="w-3 h-3" /> };
  const cardBorder =
    st === "accepted" ? "border-emerald-100 hover:border-emerald-200" :
    st === "rejected" || st === "Yopilgan" ? "border-red-100 hover:border-red-200" :
    st === "in_progress" ? "border-blue-100 hover:border-blue-200" :
    st === "completed" ? "border-emerald-100 hover:border-emerald-200" :
    "border-gray-100 hover:border-gray-200";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      onClick={() => offer && onOpenDetail(r, offer)}
      className={`bg-white rounded-2xl border overflow-hidden cursor-pointer active:scale-[.99] transition-all ${cardBorder}`}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={36} shape="square" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{getCategoryDisplayName(r.categoryId, locale, r.categoryName)}</p>
          <p className="text-[11px] text-gray-400 truncate">{r.customerName} · {getRequestLocation(r, locale)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.icon}
            {badge.label}
          </span>
          {offer && (
            <span className="text-[10px] text-violet-600 font-bold">{offer.price.toLocaleString() + " " + t.shared.sumSuffix}</span>
          )}
        </div>
        {offer && <Eye className="w-4 h-4 text-gray-300 flex-shrink-0" />}
      </div>
    </motion.div>
  );
}

export default function ProviderRequestsPage() {
  useStoreRefresh();
  const { t, locale } = useI18n();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { providerProfile } = useAuth();
  const [activeCategoryFilters, setActiveCategoryFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"all" | "unread" | "no-offers">("all");
  const [showSlider, setShowSlider] = useState(false);
  const [sliderStart, setSliderStart] = useState(0);
  const [sliderRequests, setSliderRequests] = useState<ProviderRequest[]>([]);
  const [offerRequest, setOfferRequest] = useState<ProviderRequest | null>(null);
  const [offerDetail, setOfferDetail] = useState<{ request: ProviderRequest; offer: Offer } | null>(null);

  const { user } = useAuth();
  const providerId = user?.id ?? "";
  const reqLocalProfile = user?.id ? getLocalProfile(user.id) : {};
  const serviceAreas = reqLocalProfile.serviceAreas ?? [];
  const serviceAreaV2 = reqLocalProfile.serviceAreaV2;
  const selectedCategories = providerProfile?.categories ?? [];
  const filterableCategories: string[] = selectedCategories.length > 1 ? selectedCategories : [];
  const selectedCategoriesKey = selectedCategories.join(",");
  const serviceAreasKey = serviceAreas.join(",");

  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [unseen, setUnseen] = useState<ProviderRequest[]>([]);
  const [zeroOfferRequests, setZeroOfferRequests] = useState<ProviderRequest[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const load = () => setRefreshTick((n) => n + 1);
  useEffect(() => {
    if (!providerId) { setRequests([]); setUnseen([]); setZeroOfferRequests([]); return; }
    Promise.all([
      getMatchingRequests(selectedCategories, serviceAreas, providerId, serviceAreaV2),
      getUnseenRequests(selectedCategories, serviceAreas, providerId, serviceAreaV2),
      getRequestsWithZeroOffers(selectedCategories, serviceAreas, providerId, serviceAreaV2),
    ]).then(([reqs, uns, zero]) => {
      setRequests(reqs);
      setUnseen(uns);
      setZeroOfferRequests(zero);
    }).catch((err) => console.error("Load provider requests failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoriesKey, serviceAreasKey, serviceAreaV2, providerId, refreshTick]);

  const prevUnseenCount = useRef<number | null>(null);
  useEffect(() => {
    if (prevUnseenCount.current !== null && unseen.length > prevUnseenCount.current) {
      const diff = unseen.length - prevUnseenCount.current;
      toast({ title: t.providerRequests.toast.newRequestTitle, description: tFormat(t.providerRequests.toast.newRequestDescTpl, { n: diff }) });
    }
    prevUnseenCount.current = unseen.length;
  }, [unseen.length]);

  const processedRequestId = useRef<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    const requestId = params.get("requestId");
    const view = params.get("view");
    if (requestId && requestId !== processedRequestId.current && requests.length > 0) {
      processedRequestId.current = requestId;
      const req = requests.find((r) => r.id === requestId);
      if (req) {
        if (view === "slider") {
          const openList = requests.filter((r) => r.status === "open");
          const idx = openList.findIndex((r) => r.id === requestId);
          setSliderRequests(openList);
          setSliderStart(idx >= 0 ? idx : 0);
          setShowSlider(true);
        } else {
          setOfferRequest(req);
        }
      }
    }
  }, [location, requests]);

  const allOpen = requests.filter((r) => r.status === "open");
  const allResponded = requests.filter((r) => r.status === "responded");
  const allIgnored = requests.filter((r) => r.status === "ignored");

  const tabSource =
    tab === "unread"    ? unseen :
    tab === "no-offers" ? zeroOfferRequests :
    requests;

  const filtered = tabSource.filter((r) => {
    if (r.status !== "open") return false;
    if (activeCategoryFilters.length > 0 && !activeCategoryFilters.includes(r.categoryId)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const desc = getLocalizedDescription(r, locale).toLowerCase();
      const catName = getCategoryDisplayName(r.categoryId, locale, r.categoryName).toLowerCase();
      const loc = getRequestLocation(r, locale).toLowerCase();
      return desc.includes(q) || catName.includes(q) || loc.includes(q);
    }
    return true;
  });

  function toggleCategoryFilter(catId: string) {
    setActiveCategoryFilters((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  }

  function clearAllFilters() {
    setActiveCategoryFilters([]);
  }

  function toggleSearch() {
    if (searchExpanded) {
      setSearchQuery("");
      setSearchExpanded(false);
    } else {
      setFilterExpanded(false);
      setSearchExpanded(true);
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }

  function toggleFilter() {
    if (filterExpanded) {
      setFilterExpanded(false);
    } else {
      setSearchExpanded(false);
      setFilterExpanded(true);
    }
  }

  const pageTabs = [
    { id: "all"       as const, label: t.providerRequests.tabs.all,      count: allOpen.length },
    { id: "unread"    as const, label: t.providerRequests.tabs.unread,   count: unseen.length },
    { id: "no-offers" as const, label: t.providerRequests.tabs.noOffers, count: zeroOfferRequests.length },
  ];

  function openSlider(startIdx = 0) {
    setSliderRequests([...unseen]);
    setSliderStart(startIdx);
    setShowSlider(true);
  }

  async function handleMarkAllSeen() {
    await markAllSeen(selectedCategories, serviceAreas, providerId, serviceAreaV2);
    toast({ title: t.providerRequests.toast.allSeen });
    load();
  }

  function openOfferForm(req: ProviderRequest) {
    markSeen(req.id, providerId);
    setShowSlider(false);
    setOfferRequest(req);
    load();
  }

  function closeOfferForm() {
    setOfferRequest(null);
  }

  function onOfferSubmitted() {
    setOfferRequest(null);
    setLocation("/provider/chats");
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 card-shadow">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setLocation("/provider-home")} className="flex items-center">
              <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain" />
            </button>
            <div className="flex-1">
              <h1 className="font-extrabold text-sm text-gray-900">{t.providerRequests.title}</h1>
              <p className="text-xs text-gray-400">{tFormat(t.providerRequests.subtitleTpl, { open: allOpen.length, responded: allResponded.length })}</p>
            </div>
            {unseen.length > 0 && (
              <button
                onClick={handleMarkAllSeen}
                className="flex items-center gap-1 text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1.5 rounded-xl hover:bg-violet-100 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                {t.providerRequests.markAllSeen}
              </button>
            )}
            <TangaChip userId={providerId} onClick={() => setLocation("/plans")} />
          </div>

          <div className="flex gap-2">
            {pageTabs.map((pt) => (
              <button
                key={pt.id}
                onClick={() => setTab(pt.id)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                  tab === pt.id
                    ? "text-white shadow-sm"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                style={tab === pt.id ? { background: VIOLET } : {}}
              >
                {pt.label}
                {pt.count > 0 && (
                  <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                    tab === pt.id ? "bg-white text-violet-700" : "bg-violet-500 text-white"
                  }`}>
                    {pt.count > 9 ? "9+" : pt.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-3 pb-4">
        {/* ── Compact toolbar: Filter + Search ── */}
        <div className="mb-3">
          <div className="flex items-center gap-2">

              {/* Filter button */}
              {filterableCategories.length > 0 && (
                <button
                  onClick={toggleFilter}
                  className={`relative flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                    filterExpanded || activeCategoryFilters.length > 0
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {activeCategoryFilters.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white border border-violet-200 text-violet-700 text-[9px] font-extrabold flex items-center justify-center shadow-sm">
                      {activeCategoryFilters.length}
                    </span>
                  )}
                </button>
              )}

              {/* Search button / expanded field */}
              <motion.div layout className="flex items-center flex-1 min-w-0">
                <AnimatePresence mode="wait" initial={false}>
                  {searchExpanded ? (
                    <motion.div
                      key="search-field"
                      initial={{ opacity: 0, width: 40 }}
                      animate={{ opacity: 1, width: "100%" }}
                      exit={{ opacity: 0, width: 40 }}
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                      className="relative w-full"
                    >
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onBlur={() => { if (!searchQuery) { setSearchExpanded(false); } }}
                        onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); setSearchExpanded(false); } }}
                        placeholder={t.providerRequests.searchPlaceholder}
                        className="w-full h-7 pl-9 pr-9 rounded-full bg-white border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all shadow-sm"
                      />
                      {searchQuery && (
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setSearchQuery(""); setSearchExpanded(false); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </motion.div>
                  ) : (
                    <motion.button
                      key="search-btn"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={toggleSearch}
                      className={`flex-shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm ${
                        searchQuery
                          ? "bg-violet-600 border-violet-600 text-white"
                          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <Search className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Active filter pills */}
              {activeCategoryFilters.length > 0 && !filterExpanded && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink min-w-0">
                  {activeCategoryFilters.map((catId) => (
                    <span
                      key={catId}
                      className="inline-flex items-center gap-1 flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
                      style={{ background: "linear-gradient(135deg,hsl(262,80%,54%),hsl(236,76%,60%))" }}
                    >
                      {getCategoryDisplayName(catId, locale)}
                      <button
                        onClick={() => toggleCategoryFilter(catId)}
                        className="w-3.5 h-3.5 rounded-full bg-white/25 flex items-center justify-center hover:bg-white/40 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={clearAllFilters}
                    className="flex-shrink-0 text-[11px] font-bold text-gray-400 hover:text-gray-600 transition-colors ml-0.5"
                  >
                    {t.providerRequests.filterAll === "Barchasi" ? "Tozalash" : "Сбросить"}
                  </button>
                </div>
              )}
            </div>

            {/* Expanded filter chips row */}
            <AnimatePresence>
              {filterExpanded && filterableCategories.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-1.5 pt-2 pb-0.5 overflow-x-auto no-scrollbar">
                    <button
                      onClick={clearAllFilters}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                        activeCategoryFilters.length === 0
                          ? "text-white border-transparent shadow-sm"
                          : "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200"
                      }`}
                      style={activeCategoryFilters.length === 0 ? { background: "linear-gradient(135deg,hsl(262,80%,54%),hsl(236,76%,60%))" } : {}}
                    >
                      {t.providerRequests.filterAll}
                    </button>
                    {filterableCategories.map((catId) => {
                      const active = activeCategoryFilters.includes(catId);
                      return (
                        <button
                          key={catId}
                          onClick={() => toggleCategoryFilter(catId)}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                            active
                              ? "text-white border-transparent shadow-sm"
                              : "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200"
                          }`}
                          style={active ? { background: "linear-gradient(135deg,hsl(262,80%,54%),hsl(236,76%,60%))" } : {}}
                        >
                          {getCategoryDisplayName(catId, locale)}
                        </button>
                      );
                    })}
                    {activeCategoryFilters.length > 0 && (
                      <button
                        onClick={() => { clearAllFilters(); setFilterExpanded(false); }}
                        className="flex-shrink-0 text-[11px] font-bold text-gray-400 hover:text-red-500 transition-colors ml-1"
                      >
                        X
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        {unseen.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => openSlider(0)}
            className="mb-4 rounded-2xl p-4 cursor-pointer active:scale-[.99] transition-all flex items-center gap-3"
            style={{ background: VIOLET }}
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Inbox className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white text-sm">{tFormat(t.providerRequests.banner.titleTpl, { n: unseen.length })}</p>
              <p className="text-violet-200 text-xs">{t.providerRequests.banner.subtitle}</p>
            </div>
            <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <ChevronRight className="w-4 h-4 text-white" />
            </span>
          </motion.div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="font-bold text-gray-400 mb-1">
              {searchQuery.trim()
                ? t.providerRequests.searchNoResults
                : selectedCategories.length > 0
                  ? t.providerRequests.empty.noMatching
                  : t.providerRequests.empty.none}
            </p>
            <p className="text-sm text-gray-300">
              {searchQuery.trim()
                ? ""
                : selectedCategories.length === 0
                  ? t.providerRequests.empty.pickCategories
                  : t.providerRequests.empty.noneInCategory}
            </p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {filtered.map((r, i) => (
              <RequestListCard
                key={r.id}
                r={r}
                index={i}
                isUnseen={unseen.some((u) => u.id === r.id)}
                providerId={providerId}
                onOpenOfferForm={openOfferForm}
                onIgnore={(id) => {
                  updateProviderRequestStatus(id, "ignored", providerId);
                  markSeen(id, providerId);
                  load();
                }}
              />
            ))}
          </div>
        )}

        {allResponded.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
              {tFormat(t.providerRequests.responded.titleTpl, { n: allResponded.length })}
            </p>
            <div className="space-y-2">
              {allResponded.map((r, i) => (
                <RespondedRow
                  key={r.id}
                  r={r}
                  index={i}
                  providerId={providerId}
                  onOpenDetail={(request, offer) => setOfferDetail({ request, offer })}
                />
              ))}
            </div>
          </div>
        )}

        {allIgnored.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
              {tFormat(t.providerRequests.ignored.titleTpl, { n: allIgnored.length })}
            </p>
            <div className="space-y-2">
              {allIgnored.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    <CategoryIcon categoryId={r.categoryId} emoji={r.emoji} size={36} shape="square" className="flex-shrink-0 opacity-60" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-500 truncate">{getCategoryDisplayName(r.categoryId, locale, r.categoryName)}</p>
                      <p className="text-[11px] text-gray-300 truncate">{r.customerName} · {timeAgo(r.createdAt, t)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        <AlertOctagon className="w-3 h-3" />
                        {t.providerRequests.ignored.label}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showSlider && sliderRequests.length > 0 && (
          <FullscreenSlider
            requests={sliderRequests}
            startIndex={sliderStart}
            onClose={() => setShowSlider(false)}
            onOpenOffer={(req) => openOfferForm(req)}
            onIgnore={(id) => {
              updateProviderRequestStatus(id, "ignored", providerId);
              markSeen(id, providerId);
              load();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {offerRequest && (
          <OfferForm
            request={offerRequest}
            onClose={closeOfferForm}
            onSubmitted={onOfferSubmitted}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {offerDetail && (
          <OfferDetailModal
            key={offerDetail.request.id}
            request={offerDetail.request}
            offer={offerDetail.offer}
            onClose={() => setOfferDetail(null)}
          />
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
