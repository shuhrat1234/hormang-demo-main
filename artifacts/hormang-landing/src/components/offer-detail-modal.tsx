/**
 * OfferDetailModal — Customer-side read-only view of a received offer.
 * Shows the original request Q&A + the provider's offer details.
 * Tapping "Ijrochi profilini ko'rish" opens the unified PublicProfileModal.
 */
import { useState, useEffect, useCallback } from "react";
import { TangaCoin } from "@/components/tanga-coin";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, Clock, MapPin,
  MessageCircle, Check, User, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  getRequestById, getOrCreateChat, updateOfferStatus,
  getOffersByRequestId,
  type Offer, type CustomerRequest,
} from "@/lib/requests-store";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { getTransactionByOfferId } from "@/lib/tanga-history-store";
import { getAllQuestionsForCategory, collectActiveQuestions } from "@/lib/questionnaire-store";
import { formatDate as formatUzDate } from "@/lib/date-utils";
import { getLocalProfile } from "@/lib/local-profile";
import { getAvgResponseMinutes, formatAvgResponseTime } from "@/lib/response-time-store";
import { PublicProfilePreviewModal } from "@/components/public-profile-preview-modal";
import { AcceptConfirmModal } from "@/components/accept-confirm-modal";
import { ImageGrid, getAnswerImageUrls } from "@/components/image-grid";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import { getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { getLocalizedText } from "@/lib/localization";
import type { Locale } from "@/lib/i18n";
import { getDistrictLabel, getRegionLabel } from "@/lib/regions";

/* ─── Constants ────────────────────────────────────────────────────── */

const BLUE = "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)";

const SKIP_ANSWER_KEYS = new Set(["budget_open", "urgency", "budget", "region", "district"]);

/* ─── Helpers ──────────────────────────────────────────────────────── */

type OptionItem = { label: string; value: string; type?: string; labelLocalized?: Record<string, string> | string };

function formatAnswerValue(
  value: unknown,
  options: OptionItem[] | undefined,
  otherText: string | undefined,
  yes: string,
  no: string,
  sumSuffix: string,
  locale: Locale,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && value.startsWith("data:")) return "__IMAGE__";
  if (typeof value === "boolean") return value ? yes : no;
  if (typeof value === "number") return value.toLocaleString("uz-Latn-UZ") + (String(value).length > 3 ? " " + sumSuffix : "");
  const otherOpt = options?.find((o) => o.type === "other");
  if (typeof value === "string") {
    if (otherOpt && value === otherOpt.value && otherText) return otherText;
    const opt = options?.find((o) => o.value === value);
    return opt ? getLocalizedText(opt.labelLocalized ?? opt.label, locale) : value;
  }
  if (Array.isArray(value)) {
    return (value as string[]).map((v) => {
      if (otherOpt && v === otherOpt.value && otherText) return otherText;
      const opt = options?.find((o) => o.value === v);
      return opt ? getLocalizedText(opt.labelLocalized ?? opt.label, locale) : v;
    }).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const loc = value as Record<string, unknown>;
    const parts = [loc.district, loc.region].filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length > 0) return parts.join(", ");
    const strs = Object.values(loc).filter((v): v is string => typeof v === "string" && v.length > 0);
    return strs.join(", ") || "—";
  }
  return String(value);
}

function urgencyLabel(
  u: unknown,
  urgent: string,
  normal: string,
  flexible: string,
): { label: string; color: string } {
  if (u === "urgent") return { label: urgent, color: "text-red-600 bg-red-50 border border-red-100" };
  if (u === "normal") return { label: normal, color: "text-blue-600 bg-blue-50 border border-blue-100" };
  return { label: flexible, color: "text-gray-500 bg-gray-100 border border-gray-200" };
}


function timeAgo(
  iso: string,
  minsTpl: string,
  hoursTpl: string,
  daysTpl: string,
): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return tFormat(minsTpl, { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return tFormat(hoursTpl, { n: hrs });
  return tFormat(daysTpl, { n: Math.floor(hrs / 24) });
}

/* ─── Offer Detail Modal ───────────────────────────────────────────── */

interface OfferDetailModalProps {
  offer: Offer;
  onClose: () => void;
  /** When true: hides all action buttons (Chat, Accept, Reject) and
   *  provider-profile navigation. Used in admin and provider history views. */
  readOnly?: boolean;
}

export function OfferDetailModal({ offer, onClose, readOnly = false }: OfferDetailModalProps) {
  useStoreRefresh();
  const [, setLocation] = useLocation();
  const [showProviderProfile, setShowProviderProfile] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { t, locale } = useI18n();
  const tt = t.offerDetailModal;

  /* ── Reactive live data ───────────────────────────────────────────
     Refetch this request's offers so the modal reflects the current truth
     even if updateOfferStatus() was called elsewhere (e.g. the list card). */
  const [allOffers, setAllOffers] = useState<Offer[]>([offer]);
  const [req, setReq] = useState<CustomerRequest | undefined>(undefined);
  const load = useCallback(() => {
    Promise.all([getOffersByRequestId(offer.requestId), getRequestById(offer.requestId)])
      .then(([offers, request]) => { setAllOffers(offers); setReq(request); })
      .catch((err) => console.error("Load offer detail failed:", err));
  }, [offer.requestId]);
  useEffect(() => { load(); }, [load]);

  const liveOffer = allOffers.find((o) => o.id === offer.id) ?? offer;

  /* Has ANY other offer on this same request already been accepted? */
  const anyAccepted =
    liveOffer.status !== "accepted" &&
    liveOffer.status !== "in_progress" &&
    liveOffer.status !== "completed" &&
    allOffers.some(
      (o) =>
        o.requestId === offer.requestId &&
        o.id !== offer.id &&
        (o.status === "accepted" || o.status === "in_progress" || o.status === "completed")
    );

  const isAccepted = liveOffer.status === "accepted";
  const isInProgress = liveOffer.status === "in_progress";
  const isRejected = liveOffer.status === "rejected";
  const isCompleted = liveOffer.status === "completed";
  /* Can still accept: offer is pending and no sibling offer is accepted */
  const canAccept = !isAccepted && !isInProgress && !isRejected && !isCompleted && !anyAccepted;

  const providerLocal = getLocalProfile(offer.masterId);
  const providerPhoto = offer.masterPhotoUrl || liveOffer.masterPhotoUrl || providerLocal.photoUrl;

  /* Build Q&A pairs from request (skip image answers)
     collectActiveQuestions traverses conditional branches so follow-up
     answers are included when their triggering option was selected. */
  const allQuestions = req ? getAllQuestionsForCategory(req.categoryId) : [];
  const activeQuestions = req
    ? collectActiveQuestions(allQuestions, (req.answers ?? {}) as Record<string, unknown>)
    : [];
  const qaPairs = activeQuestions
    .filter((q) => !SKIP_ANSWER_KEYS.has(q.id))
    .map((q) => {
      const raw = req?.answers?.[q.id];
      if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
      const otherText = req?.answers?.[q.id + "_other"] as string | undefined;
      const formatted = formatAnswerValue(raw, q.options as OptionItem[] | undefined, otherText, tt.yes, tt.no, tt.sumSuffix, locale);
      if (formatted === "__IMAGE__") return null;
      const qLabel = getLocalizedText(
        (q as { labelLocalized?: Record<string, string> | string }).labelLocalized ?? q.label,
        locale,
      );
      return { label: qLabel, value: formatted };
    })
    .filter(Boolean) as { label: string; value: string }[];

  /* Customer uploaded photos */
  const customerPhotoUrls = req?.answers ? getAnswerImageUrls(req.answers as Record<string, unknown>) : [];

  /* Tanga transaction for this offer */
  const tangaTx = getTransactionByOfferId(offer.id);

  /* Provider offer attachment images */
  const offerImageUrls = (offer.fileUrls ?? []).filter(
    (u) => u.startsWith("data:image") || u.startsWith("http") || u.startsWith("blob:")
  );

  /* Derive request metadata */
  const urgency = req?.answers?.["urgency"] as string | undefined;
  const urg = urgencyLabel(urgency, tt.urgencyUrgent, tt.urgencyNormal, tt.urgencyFlexible);
  const location = [
    req?.district ? getDistrictLabel(req.district, locale) : "",
    req?.region ? getRegionLabel(req.region, locale) : "",
  ].filter(Boolean).join(", ");
  const budgetAnswer = req?.answers?.["budget"];
  const budgetLabel = typeof budgetAnswer === "number"
    ? budgetAnswer.toLocaleString("uz-Latn-UZ") + " " + tt.sumSuffix
    : null;

  async function openChat() {
    const chat = await getOrCreateChat(offer.requestId, offer.masterId);
    onClose();
    setLocation(`/chat/${chat.id}`);
  }

  async function confirmAccept() {
    await updateOfferStatus(offer.id, "accepted");
    setShowConfirm(false);
    onClose();
  }

  async function reject() {
    await updateOfferStatus(offer.id, "rejected");
    load();
  }

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
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          className="w-full max-w-lg bg-white rounded-t-3xl max-h-[96vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h2 className="font-extrabold text-base text-gray-900">{tt.title}</h2>
              <p className="text-xs text-gray-400">
                {isCompleted
                  ? tt.subStateCompleted
                  : isInProgress
                  ? tt.subStateInProgress
                  : readOnly
                  ? tt.subStateReadOnly
                  : tt.subStateView}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            {/* ── Provider offer section ─── */}
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tt.sectionProviderOffer}</p>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              {/* Provider header */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  {providerPhoto ? (
                    <img
                      src={providerPhoto}
                      alt={offer.masterName}
                      className="w-12 h-12 rounded-2xl object-cover border border-gray-200 flex-shrink-0 shadow-sm"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm"
                      style={{ background: offer.masterColor }}
                    >
                      {offer.masterInitials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-sm text-gray-900">{offer.masterName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-[11px] text-gray-400">{formatAvgResponseTime(getAvgResponseMinutes(offer.masterId), t.shared.responseTime)}</span>
                    </div>
                  </div>
                  {/* Status badge */}
                  {isCompleted && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
                      {tt.statusCompleted}
                    </span>
                  )}
                  {isInProgress && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
                      {tt.statusInProgress}
                    </span>
                  )}
                  {isAccepted && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0">
                      {tt.statusAccepted}
                    </span>
                  )}
                  {isRejected && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                      {tt.statusRejected}
                    </span>
                  )}
                </div>

                {/* "Ijrochi profilini ko'rish" button — hidden in read-only mode */}
                {!readOnly && (
                  <button
                    onClick={() => setShowProviderProfile(true)}
                    className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                  >
                    <User className="w-3.5 h-3.5" />
                    {tt.viewProviderProfile}
                  </button>
                )}
              </div>

              {/* Price */}
              <div className="border-b border-gray-100">
                <div className="px-4 py-3">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">{tt.priceLabel}</p>
                  <p className="font-extrabold text-base text-blue-600">
                    {offer.price.toLocaleString() + " " + tt.sumSuffix}
                  </p>
                </div>
              </div>

              {/* Message */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1.5">{tt.messageLabel}</p>
                <p className="text-sm text-gray-700 leading-relaxed">{offer.message}</p>
              </div>

              {/* Provider attached images */}
              {offerImageUrls.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-100">
                  <ImageGrid
                    urls={offerImageUrls}
                    label={tt.providerImagesLabel}
                    columns={3}
                  />
                </div>
              )}

              {/* Date sent */}
              <div className="px-4 py-2.5">
                <p className="text-[10px] text-gray-400">{tFormat(tt.sentAtTpl, { date: formatUzDate(offer.createdAt, { months: t.shared.months }), ago: timeAgo(offer.createdAt, tt.minutesAgoTpl, tt.hoursAgoTpl, tt.daysAgoTpl) })}</p>
              </div>
            </div>

            {/* ── Request section ─── */}
            {req && (
              <>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tt.sectionCustomerRequest}</p>

                <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                  {/* Request top bar */}
                  <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                    <div className="flex items-start gap-3">
                      <CategoryIcon categoryId={req.categoryId} emoji={req.emoji} size={44} shape="square" className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-sm text-gray-900">{getCategoryDisplayName(req.categoryId, locale, req.categoryName)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(req.createdAt, tt.minutesAgoTpl, tt.hoursAgoTpl, tt.daysAgoTpl)}</p>
                      </div>
                      {urgency && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${urg.color}`}>
                          {urg.label}
                        </span>
                      )}
                    </div>

                    {/* Key meta */}
                    <div className="flex flex-wrap gap-3 mt-3">
                      {location && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span>{location}</span>
                        </div>
                      )}
                      {budgetLabel && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700">
                          <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{budgetLabel}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Q&A pairs */}
                  {qaPairs.length > 0 && (
                    <div className="px-4 py-3 space-y-2.5 border-b border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{tt.sectionQA}</p>
                      {qaPairs.map((pair, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <div className="flex-shrink-0 w-1 rounded-full bg-blue-200 self-stretch" />
                          <div className="flex-1 min-w-0">
                            <span className="text-gray-400 font-medium">{pair.label}:</span>
                            <span className="font-bold text-gray-800 ml-1">{pair.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Customer uploaded photos */}
                  {customerPhotoUrls.length > 0 && (
                    <div className="px-4 py-3">
                      <ImageGrid
                        urls={customerPhotoUrls}
                        label={tt.customerImagesLabel}
                        columns={3}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Tranzaksiya ma'lumotlari — only in read-only (admin / provider history) mode ─── */}
            {readOnly && tangaTx && (
              <>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {tt.sectionTransactionInfo}
                </p>
                <div className="bg-amber-50 border border-amber-100 rounded-2xl overflow-hidden">
                  {/* Top row: coin icon + amount */}
                  <div className="px-4 py-3 flex items-center gap-3 border-b border-amber-100">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <TangaCoin size="md" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                        {tt.spentTangaLabel}
                      </p>
                      <p className="font-extrabold text-amber-700 text-base leading-tight">
                        −{tangaTx.amount} Tanga
                      </p>
                    </div>
                    {/* Offer status badge */}
                    {liveOffer.status === "accepted" && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0">
                        {tt.statusAccepted}
                      </span>
                    )}
                    {liveOffer.status === "rejected" && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                        {tt.statusRejected}
                      </span>
                    )}
                    {liveOffer.status === "pending" && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
                        {tt.statusPending}
                      </span>
                    )}
                    {liveOffer.status === "in_progress" && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
                        {tt.statusInProgress}
                      </span>
                    )}
                    {liveOffer.status === "completed" && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
                        {tt.statusCompleted}
                      </span>
                    )}
                  </div>

                  {/* Details rows */}
                  <div className="px-4 py-2.5 space-y-1">
                    {/* Provider name (always shown, especially useful in admin) */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-amber-500 font-semibold">{tt.txProvider}</p>
                      <p className="text-[11px] font-bold text-amber-700">{offer.masterName}</p>
                    </div>
                    {/* Category */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-amber-500 font-semibold">{tt.txCategory}</p>
                      <p className="text-[11px] font-bold text-amber-700 inline-flex items-center gap-1">
                        <CategoryIcon categoryId={req?.categoryId ?? null} emoji={tangaTx.categoryEmoji} size={14} shape="square" />
                        {getCategoryDisplayName(req?.categoryId ?? "", locale, tangaTx.categoryName)}
                      </p>
                    </div>
                    {/* Date + time */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-amber-500 font-semibold">{tt.txDateTime}</p>
                      <p className="text-[11px] text-amber-700 font-semibold">
                        {formatUzDate(tangaTx.createdAt, { months: t.shared.months })}&ensp;
                        {new Date(tangaTx.createdAt).toLocaleTimeString("uz-Latn-UZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {/* Transaction ID */}
                    <p className="text-[10px] text-amber-400 font-mono pt-0.5">
                      ID: {tangaTx.id.slice(0, 24)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action footer — hidden in read-only (admin / history) mode */}
          {!readOnly && !isRejected && (
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-2">
              {/* If another offer on this request was already accepted, show a notice */}
              {anyAccepted && (
                <p className="text-center text-xs text-gray-400 font-semibold bg-gray-50 rounded-xl py-2 px-3">
                  {tt.anyAcceptedNotice}
                </p>
              )}

              <Button
                onClick={openChat}
                className="w-full h-11 font-bold gap-2 text-sm"
                style={{ background: BLUE }}
              >
                <MessageCircle className="w-4 h-4" />
                {tt.chatBtn}
              </Button>

              {canAccept && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowConfirm(true)}
                    className="flex-1 h-10 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {tt.acceptBtn}
                  </Button>
                  <button
                    onClick={reject}
                    className="flex-1 h-10 rounded-xl border-2 border-gray-200 text-xs font-bold text-gray-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    {tt.rejectBtn}
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Provider profile overlay */}
      <AnimatePresence>
        {showProviderProfile && (
          <PublicProfilePreviewModal
            key={`offer-detail-provider-${offer.masterId}`}
            mode="provider"
            providerData={{
              masterId: offer.masterId,
              masterName: offer.masterName,
              masterInitials: offer.masterInitials,
              masterColor: offer.masterColor,
              avgResponseTime: offer.avgResponseTime,
              photoUrl: providerPhoto,
            }}
            onClose={() => setShowProviderProfile(false)}
          />
        )}
      </AnimatePresence>

      {/* Accept confirm checklist (z-[70] so it sits above the detail modal) */}
      <AnimatePresence>
        {showConfirm && (
          <AcceptConfirmModal
            onConfirm={confirmAccept}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
