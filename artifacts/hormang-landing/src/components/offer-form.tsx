/**
 * OfferForm — full-screen bottom sheet for provider to send an offer on a request.
 * Opens from "Javob berish" button on So'rovlar page.
 *
 * Features:
 *  - Full Q&A display of customer's request answers
 *  - "Mijoz profilini ko'rish" profile preview button
 *  - No editable avg-response-time field (removed)
 */
import { useState, useEffect } from "react";
import { TangaCoin } from "@/components/tanga-coin";
import { CompactMediaUpload } from "@/components/media-upload";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, Send, Clock, MapPin,
  CheckCircle2, AlertCircle, User,
  DollarSign,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { getLocalProfile } from "@/lib/local-profile";
import {
  saveOffer, updateProviderRequestStatus, markSeen,
  getAvgResponseMinutes,
  type ProviderRequest,
} from "@/lib/provider-store";
import { canSubmitOffer, offerBlockLabel, ApiError, type CanSubmitOfferReason } from "@/lib/requests-store";
import { getAllQuestionsForCategory, collectActiveQuestions, type QuestionOption } from "@/lib/questionnaire-store";
import { PublicProfilePreviewModal } from "@/components/public-profile-preview-modal";
import { getLocalizedText } from "@/lib/localization";
import { getRequestLocation } from "@/lib/regions";
import { ImageGrid, getAnswerImageUrls } from "@/components/image-grid";
import { getWallet } from "@/lib/wallet-client";
import { calculateOfferCost } from "@/lib/offer-cost";
import { SUSPENDED_MESSAGE } from "@/lib/safety-store";
import { useLocation } from "wouter";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat, getBudgetLabel, type Locale } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/locales/uz";
import { getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";

function formatPrice(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function urgencyLabel(u: ProviderRequest["urgency"], t: Dict): { label: string; color: string } {
  if (u === "urgent") return { label: t.offerForm.urgency.urgent, color: "text-red-600 bg-red-50 border border-red-100" };
  if (u === "normal") return { label: t.offerForm.urgency.normal, color: "text-blue-600 bg-blue-50 border border-blue-100" };
  return { label: t.offerForm.urgency.flexible, color: "text-gray-500 bg-gray-100 border border-gray-200" };
}

function timeAgo(iso: string, t: Dict): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return tFormat(t.offerForm.timeAgo.minutes, { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return tFormat(t.offerForm.timeAgo.hours, { n: hrs });
  return tFormat(t.offerForm.timeAgo.days, { n: Math.floor(hrs / 24) });
}

function formatAnswerValue(
  value: unknown,
  t: Dict,
  options?: QuestionOption[],
  otherText?: string,
  locale?: string,
): string {
  const optLabel = (o: QuestionOption) => getLocalizedText(o.labelLocalized ?? o.label, (locale ?? "uz") as Locale);
  if (value === null || value === undefined || value === "") return t.offerForm.answer.dash;
  if (typeof value === "string" && value.startsWith("data:")) return "__IMAGE__";
  if (typeof value === "boolean") return value ? t.offerForm.answer.yes : t.offerForm.answer.no;
  if (typeof value === "number") return value.toLocaleString("uz-Latn-UZ") + (String(value).length > 3 ? ` ${t.offerForm.answer.sumSuffix}` : "");
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
    return strs.join(", ") || t.offerForm.answer.dash;
  }
  return String(value);
}

const SKIP_ANSWER_KEYS = new Set(["budget_open", "urgency", "budget", "region", "district", "location"]);

/* ─── Main Form ──────────────────────────────────────────────────── */
interface Props {
  request: ProviderRequest;
  onClose: () => void;
  onSubmitted: () => void;
}

export function OfferForm({ request, onClose, onSubmitted }: Props) {
  useStoreRefresh();
  const { toast } = useToast();
  const { user, providerProfile } = useAuth();
  const [, setLocation] = useLocation();
  const { t, locale } = useI18n();
  /* Tanga cost calculation — client-computed from the (already backend-cached)
     category/question config; the server floors it at its own minimum. */
  const offerCost = calculateOfferCost({
    categoryId: request.categoryId,
    answers: (request.answers ?? {}) as Record<string, unknown>,
  });

  /* Real wallet balance + offer-limit/acceptance-lock validation — both
     fetched from the backend since they're now the actual source of truth. */
  const [balance, setBalance] = useState(0);
  const [submissionCheck, setSubmissionCheck] = useState<{ ok: boolean; reason?: CanSubmitOfferReason; active: number; total: number }>({ ok: true, active: 0, total: 0 });
  useEffect(() => {
    let cancelled = false;
    getWallet().then((w) => { if (!cancelled) setBalance(w.balance); }).catch(() => {});
    canSubmitOffer(request.id, user?.id ?? "").then((c) => { if (!cancelled) setSubmissionCheck(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [request.id, user?.id]);
  const hasEnoughTanga = balance >= offerCost;
  const blockedReason = submissionCheck.ok ? undefined : submissionCheck.reason;
  const blockedLabel = submissionCheck.ok ? "" : offerBlockLabel(submissionCheck.reason, t);

  /* Form state */
  const [priceRaw, setPriceRaw] = useState("");
  const [message, setMessage] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);
  const [offerPhotos, setOfferPhotos] = useState<string[]>([]);

  /* UI state */
  const [showCustomerProfile, setShowCustomerProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const urg = urgencyLabel(request.urgency, t);

  /* Build Q&A pairs from questionnaire + answers (skip image answers)
     collectActiveQuestions includes conditional branch questions whose
     triggering option was selected, so follow-up answers are shown too. */
  const allQuestions = getAllQuestionsForCategory(request.categoryId);
  const activeQuestions = collectActiveQuestions(allQuestions, (request.answers ?? {}) as Record<string, unknown>);
  const qaPairs = activeQuestions
    .filter((q) => !SKIP_ANSWER_KEYS.has(q.id))
    .map((q) => {
      const raw = request.answers?.[q.id];
      if (raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
      const otherText = request.answers?.[q.id + "_other"] as string | undefined;
      const formatted = formatAnswerValue(raw, t, q.options, otherText, locale);
      if (formatted === "__IMAGE__") return null;
      return { label: getLocalizedText(q.labelLocalized ?? q.label, locale as Locale), value: formatted };
    })
    .filter(Boolean) as { label: string; value: string }[];

  /* Customer uploaded photos (from file-type questions + dedicated requestPhotos) */
  const customerPhotoUrls = request.answers
    ? getAnswerImageUrls(request.answers as Record<string, unknown>, request.requestPhotos)
    : (request.requestPhotos ?? []);

  function validate(): boolean {
    const e: Record<string, string> = {};
    const numPrice = parseInt(priceRaw.replace(/\D/g, ""), 10);
    if (!priceRaw || isNaN(numPrice) || numPrice <= 0) e.price = t.offerForm.errors.price;
    if (!message.trim() || message.trim().length < 10) e.message = t.offerForm.errors.message;
    if (!termsChecked) e.terms = t.offerForm.errors.terms;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!hasEnoughTanga) return;
    if (!validate()) return;
    if (user?.suspended) {
      toast({ title: SUSPENDED_MESSAGE, variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const numPrice = parseInt(priceRaw.replace(/\D/g, ""), 10);
    const priceLabel = formatPrice(String(numPrice)) + ` ${t.offerForm.sumSuffix}`;

    const firstName = user?.firstName ?? "";
    const lastName = user?.lastName ?? "";
    const fullName = `${firstName} ${lastName}`.trim() || t.offerForm.providerFallback;
    const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "IJ";
    const palette = ["#7C3AED", "#2563EB", "#059669", "#D97706", "#DC2626", "#0891B2"];
    const color = palette[(user?.id?.charCodeAt(0) ?? 0) % palette.length];
    const localProfile = user?.id ? getLocalProfile(user.id) : undefined;
    const providerPhoto = localProfile?.photoUrl || providerProfile?.photoUrl || undefined;

    /* Single atomic backend call: validates offer limits/request state,
       debits the wallet, creates the offer, and opens the chat — all in one
       DB transaction. No client-side compensating refund needed anymore. */
    try {
      await saveOffer(
        {
          requestId: request.id,
          price: numPrice,
          priceLabel,
          message: message.trim(),
          termsAccepted: termsChecked,
          fileUrls: offerPhotos,
        },
        user ? { id: user.id, name: fullName, initials, color, photoUrl: providerPhoto } : undefined,
        offerCost,
      );
    } catch (err) {
      setSubmitting(false);
      const code = err instanceof ApiError ? err.message : "";
      const description =
        code === "request_closed" || code === "matched"
          ? t.offerForm.toasts.requestClosed
          : code === "already_offered"
            ? t.offerForm.toasts.duplicate
            : code === "insufficient_balance"
              ? tFormat(t.offerForm.toasts.insufficientDescTpl, { n: offerCost })
              : t.offerForm.toasts.photoSize;
      toast({ title: t.offerForm.toasts.errorTitle, description, variant: "destructive" });
      return;
    }

    updateProviderRequestStatus(request.id, "responded", user?.id ?? "");
    markSeen(request.id, user?.id);

    setTimeout(() => {
      setSubmitting(false);
      toast({ title: tFormat(t.offerForm.toasts.sentTpl, { n: offerCost }) });
      onSubmitted();
    }, 500);
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
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="bg-white w-full max-w-lg rounded-t-3xl max-h-[96vh] flex flex-col"
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
              <h2 className="font-extrabold text-base text-gray-900">{t.offerForm.headerTitle}</h2>
              <p className="text-xs text-gray-400">{t.offerForm.headerSubtitle}</p>
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

            {/* ── Offer Limit / Lock Banner ── */}
            {blockedReason && (
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                <span className="text-xl flex-shrink-0">🔒</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-gray-800">{blockedLabel}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {tFormat(t.offerForm.activeOffersTpl, { n: submissionCheck.active, max: 5 })}
                  </p>
                </div>
              </div>
            )}

            {/* ── Tanga Cost Banner ── */}
            {hasEnoughTanga ? (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                <TangaCoin size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-amber-900">
                    {t.offerForm.tangaBannerOk1} <span className="text-amber-700">{tFormat(t.offerForm.tangaBannerOk2Tpl, { n: offerCost })}</span>
                  </p>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    {tFormat(t.offerForm.tangaBannerOk3Tpl, { balance, after: balance - offerCost })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <TangaCoin size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-extrabold text-red-800">
                    {tFormat(t.offerForm.tangaBannerLowTpl, { n: offerCost })}
                  </p>
                  <p className="text-[11px] text-red-500 mt-0.5">
                    {tFormat(t.offerForm.tangaBannerLowDescTpl, { balance })}
                  </p>
                </div>
                <button
                  onClick={() => { onClose(); setLocation("/plans"); }}
                  className="flex-shrink-0 text-[11px] font-extrabold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-xl transition-colors"
                >
                  {t.offerForm.buyTanga}
                </button>
              </div>
            )}

            {/* ── Request Summary ── */}
            <div className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
              {/* Top bar */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <CategoryIcon categoryId={request.categoryId} emoji={request.emoji} size={44} shape="square" className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-sm text-gray-900">{getCategoryDisplayName(request.categoryId, locale, request.categoryName)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{request.customerName} · {timeAgo(request.createdAt, t)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${urg.color}`}>
                    {urg.label}
                  </span>
                </div>

                {/* Key details row */}
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

              {/* Q&A section */}
              {qaPairs.length > 0 && (
                <div className="px-4 py-3 space-y-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t.offerForm.qaTitle}</p>
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

              {/* Customer uploaded photos */}
              {customerPhotoUrls.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100">
                  <ImageGrid
                    urls={customerPhotoUrls}
                    label={t.offerForm.customerPhotos}
                    columns={3}
                  />
                </div>
              )}

              {/* Customer profile link */}
              <div className="px-4 py-3 border-t border-gray-100">
                <button
                  onClick={() => setShowCustomerProfile(true)}
                  className="flex items-center gap-2 text-xs font-bold text-violet-600 hover:text-violet-700 transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  {t.offerForm.viewCustomerProfile}
                </button>
              </div>
            </div>

            {/* ── Price ── */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                {t.offerForm.priceLabel} <span className="text-red-500">*</span>
              </label>
              <div className={`flex items-center bg-white border-2 rounded-2xl px-4 h-12 transition-colors ${
                errors.price ? "border-red-300" : priceRaw ? "border-violet-400" : "border-gray-200 focus-within:border-violet-400"
              }`}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatPrice(priceRaw)}
                  onChange={(e) => {
                    setPriceRaw(e.target.value.replace(/\D/g, ""));
                    if (errors.price) setErrors((prev) => ({ ...prev, price: "" }));
                  }}
                  placeholder={t.offerForm.pricePlaceholder}
                  className="flex-1 bg-transparent text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none"
                />
                <span className="text-xs font-bold text-gray-400 ml-2">{t.offerForm.sumSuffix}</span>
              </div>
              {errors.price && (
                <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                  <AlertCircle className="w-3.5 h-3.5" />{errors.price}
                </p>
              )}
            </div>

            {/* ── Message ── */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                {t.offerForm.messageLabel} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (errors.message) setErrors((prev) => ({ ...prev, message: "" }));
                }}
                placeholder={t.offerForm.messagePlaceholder}
                rows={4}
                className={`w-full bg-white border-2 rounded-2xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none resize-none transition-colors ${
                  errors.message ? "border-red-300" : message ? "border-violet-400" : "border-gray-200 focus:border-violet-400"
                }`}
              />
              <div className="flex items-center justify-between mt-1">
                {errors.message ? (
                  <p className="flex items-center gap-1 text-xs text-red-500">
                    <AlertCircle className="w-3.5 h-3.5" />{errors.message}
                  </p>
                ) : <span />}
                <span className="text-[10px] text-gray-400 ml-auto">{tFormat(t.offerForm.charsTpl, { n: message.length })}</span>
              </div>
            </div>

            {/* ── Offer photo upload ── */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                {t.offerForm.samplePhotosLabel} <span className="font-normal text-gray-400">{t.offerForm.samplePhotosOptional}</span>
              </label>
              <CompactMediaUpload
                urls={offerPhotos}
                onChange={setOfferPhotos}
                max={3}
              />
            </div>

            {/* ── Terms ── */}
            <div
              onClick={() => {
                setTermsChecked((v) => !v);
                if (errors.terms) setErrors((prev) => ({ ...prev, terms: "" }));
              }}
              className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-colors ${
                errors.terms
                  ? "border-red-300 bg-red-50"
                  : termsChecked
                  ? "border-violet-300 bg-violet-50"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
              }`}
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                termsChecked ? "border-violet-600 bg-violet-600" : "border-gray-300 bg-white"
              }`}>
                {termsChecked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-bold text-gray-800">{t.offerForm.termsTextBold}</span>{t.offerForm.termsTextRest}
              </p>
            </div>
            {errors.terms && (
              <p className="flex items-center gap-1 text-xs text-red-500 -mt-2">
                <AlertCircle className="w-3.5 h-3.5" />{errors.terms}
              </p>
            )}
          </div>

          {/* Bottom actions */}
          <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-2">
            {!hasEnoughTanga && (
              <button
                onClick={() => { onClose(); setLocation("/plans"); }}
                className="w-full h-12 rounded-2xl font-extrabold text-sm text-white flex items-center justify-center gap-2 transition-all shadow-lg"
                style={{ background: "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)" }}
              >
                <TangaCoin size="sm" /> {tFormat(t.offerForm.buyTangaCtaTpl, { n: offerCost })}
              </button>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-12 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                {t.offerForm.cancel}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !hasEnoughTanga || !!blockedReason}
                className="flex-[2] h-12 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[.98] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: blockedReason ? "#9CA3AF" : hasEnoughTanga ? "linear-gradient(135deg, #059669 0%, #10B981 100%)" : "#9CA3AF" }}
              >
                {submitting ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {blockedReason
                  ? blockedLabel
                  : hasEnoughTanga
                    ? <span className="flex items-center gap-1">{tFormat(t.offerForm.submitOkTpl, { n: offerCost })}<TangaCoin size="xs" />)</span>
                    : t.offerForm.submitInsufficient}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Customer Profile Modal */}
      <AnimatePresence>
        {showCustomerProfile && (
          <PublicProfilePreviewModal
            key={`offer-customer-${request.customerId}-${request.region}-${request.district}`}
            mode="customer"
            customerData={{
              customerName: request.customerName ?? t.offerForm.customerFallback,
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
