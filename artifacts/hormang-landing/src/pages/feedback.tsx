import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/locales/uz";
import { BottomNav } from "@/components/bottom-nav";
import {
  saveFeedback, getFeedbacksByUser,
  type FeedbackType, type FeedbackStatus, type Feedback,
} from "@/lib/feedback-store";
import { getRequestsByCustomer } from "@/lib/requests-store";
import { compressImage } from "@/lib/image-utils";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Check, Upload, X, CheckCircle2, Loader2,
  Paperclip, MessagesSquare, Plus, ChevronRight,
} from "lucide-react";

const TYPE_STYLES: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  problem:    { emoji: "🆘", color: "text-red-600",   bg: "bg-red-50",   border: "border-red-200"   },
  complaint:  { emoji: "⚠️", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  suggestion: { emoji: "💡", color: "text-blue-600",  bg: "bg-blue-50",  border: "border-blue-200"  },
};

const STATUS_STYLES: Record<FeedbackStatus, { color: string; bg: string }> = {
  new:       { color: "text-gray-500",  bg: "bg-gray-100" },
  in_review: { color: "text-blue-600",  bg: "bg-blue-50"  },
  resolved:  { color: "text-green-600", bg: "bg-green-50" },
  rejected:  { color: "text-red-600",   bg: "bg-red-50"   },
};

function typeLabel(t: Dict, id: string): string {
  if (id === "problem") return t.feedbackPage.typeProblem;
  if (id === "complaint") return t.feedbackPage.typeComplaint;
  if (id === "suggestion") return t.feedbackPage.typeSuggestion;
  return id;
}

function statusLabel(t: Dict, s: FeedbackStatus): string {
  if (s === "new") return t.feedbackPage.statusNew;
  if (s === "in_review") return t.feedbackPage.statusInReview;
  if (s === "resolved") return t.feedbackPage.statusResolved;
  return t.feedbackPage.statusRejected;
}

function getTypeOptions(t: Dict): { id: FeedbackType; emoji: string; label: string; sub: string }[] {
  return [
    { id: "problem",    emoji: "🆘", label: t.feedbackPage.typeProblem,    sub: t.feedbackPage.typeProblemSub    },
    { id: "complaint",  emoji: "⚠️", label: t.feedbackPage.typeComplaint,  sub: t.feedbackPage.typeComplaintSub  },
    { id: "suggestion", emoji: "💡", label: t.feedbackPage.typeSuggestion, sub: t.feedbackPage.typeSuggestionSub },
  ];
}

function getProblemAreas(t: Dict) {
  return [
    { id: "chat",    label: t.feedbackPage.areaChat,    emoji: "💬" },
    { id: "request", label: t.feedbackPage.areaRequest, emoji: "📋" },
    { id: "payment", label: t.feedbackPage.areaPayment, emoji: "💳" },
    { id: "other",   label: t.feedbackPage.areaOther,   emoji: "❓" },
  ] as const;
}

function getComplaintTargets(t: Dict) {
  return [
    { id: "provider", label: t.feedbackPage.targetProvider, emoji: "🔧" },
    { id: "customer", label: t.feedbackPage.targetCustomer, emoji: "👤" },
    { id: "platform", label: t.feedbackPage.targetPlatform, emoji: "🏠" },
  ] as const;
}

function getSuggestionCats(t: Dict) {
  return [
    { id: "ux",       label: t.feedbackPage.catUx,       emoji: "🎨" },
    { id: "features", label: t.feedbackPage.catFeatures, emoji: "✨" },
    { id: "payments", label: t.feedbackPage.catPayments, emoji: "💳" },
  ] as const;
}

const BLUE_GRAD = "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)";

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 px-5 py-3">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-1.5 flex-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
              i < step  ? "bg-blue-600 text-white"
              : i === step ? "bg-blue-600 text-white shadow-md shadow-blue-200"
              : "bg-gray-100 text-gray-400"
            }`}
          >
            {i < step ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`flex-1 h-0.5 rounded-full transition-all ${i < step ? "bg-blue-600" : "bg-gray-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function FeedbackFormDrawer({
  open,
  userId,
  activeRole,
  myRequests,
  onClose,
  onSuccess,
}: {
  open: boolean;
  userId: string;
  activeRole: string;
  myRequests: { id: string; categoryName: string; createdAt: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const { t, locale } = useI18n();
  const tt = t.feedbackPage;
  const bcp47 = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const fileRef = useRef<HTMLInputElement>(null);

  const STEPS = [tt.stepType, tt.stepDetail, tt.stepContent, tt.stepImage];
  const TYPE_OPTIONS = getTypeOptions(t);
  const PROBLEM_AREAS = getProblemAreas(t);
  const COMPLAINT_TARGETS = getComplaintTargets(t);
  const SUGGESTION_CATS = getSuggestionCats(t);

  const [step, setStep]               = useState(0);
  const [type, setType]               = useState<FeedbackType | null>(null);
  const [targetType, setTargetType]   = useState<"provider"|"customer"|"platform"|"">("");
  const [problemArea, setProblemArea] = useState("");
  const [suggestionCat, setSuggestionCat] = useState("");
  const [relatedReqId, setRelatedReqId]   = useState("");
  const [title, setTitle]             = useState("");
  const [desc, setDesc]               = useState("");
  const [files, setFiles]             = useState<string[]>([]);
  const [compressingFiles, setCompressingFiles] = useState(false);
  const [submitting, setSubmitting]   = useState(false);

  function resetForm() {
    setStep(0); setType(null); setTargetType(""); setProblemArea("");
    setSuggestionCat(""); setRelatedReqId(""); setTitle(""); setDesc(""); setFiles([]);
    setCompressingFiles(false);
  }

  function handleClose() { resetForm(); onClose(); }

  function canNext() {
    if (compressingFiles) return false;
    if (step === 0) return !!type;
    if (step === 1) {
      if (type === "complaint") return !!targetType;
      if (type === "problem")   return !!problemArea;
      return true;
    }
    if (step === 2) return title.trim().length >= 3 && desc.trim().length >= 10;
    return true;
  }

  async function addFiles(raw: FileList | null) {
    if (!raw) return;
    const incoming = Array.from(raw).slice(0, 5 - files.length);
    if (incoming.length === 0) return;
    setCompressingFiles(true);
    try {
      const processed = await Promise.all(
        incoming.map(async (file) => {
          if (file.type.startsWith("image/")) {
            return await compressImage(file, 1024, 0.72);
          }
          return new Promise<string>((resolve, reject) => {
            if (file.size > 2 * 1024 * 1024) {
              reject(new Error("File size exceeds 2MB"));
              return;
            }
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        })
      );
      setFiles((prev) => [...prev, ...processed].slice(0, 5));
    } catch (err) {
      console.warn("[Hormang] File processing warning:", err);
      toast({ title: tt.errorToast, description: "Faylni yuklashda xatolik yuz berdi", variant: "destructive" });
    } finally {
      setCompressingFiles(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await saveFeedback({
        userId,
        userRole: activeRole === "provider" ? "provider" : "customer",
        type: type!,
        title: title.trim(),
        description: desc.trim(),
        targetType:         type === "complaint"  ? (targetType as "provider"|"customer"|"platform") : undefined,
        problemArea:        type === "problem"    ? (problemArea as "chat"|"request"|"payment"|"other") : undefined,
        suggestionCategory: type === "suggestion" ? (suggestionCat as "ux"|"features"|"payments") : undefined,
        relatedRequestId: relatedReqId || undefined,
        attachments: files,
      });
      toast({ title: tt.sentToast, description: tt.sentDesc });
      resetForm();
      onSuccess();
    } catch {
      toast({ title: tt.errorToast, description: tt.errorDesc, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTypeMeta = type ? TYPE_STYLES[type] : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="form-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end"
          onClick={e => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="w-full bg-white rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden"
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center gap-3 px-4 pb-3 pt-1 border-b border-gray-100 flex-shrink-0">
              <button
                onClick={() => step === 0 ? handleClose() : setStep(s => s - 1)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:scale-95 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1">
                <h2 className="font-extrabold text-gray-900 text-base leading-tight">{tt.newRequestTitle}</h2>
                <p className="text-xs text-gray-400">{tFormat(tt.stepProgressTpl, { name: STEPS[step], cur: step + 1, total: STEPS.length })}</p>
              </div>
              {selectedTypeMeta && type && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${selectedTypeMeta.bg} ${selectedTypeMeta.color}`}>
                  {selectedTypeMeta.emoji} {typeLabel(t, type)}
                </span>
              )}
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <StepBar step={step} total={STEPS.length} />

            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-28">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-3">
                    <p className="text-sm font-bold text-gray-700 px-1">{tt.s0Question}</p>
                    {TYPE_OPTIONS.map(opt => {
                      const m = TYPE_STYLES[opt.id];
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setType(opt.id)}
                          className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-4 ${
                            type === opt.id ? `${m.bg} ${m.border}` : "bg-white border-gray-100 hover:border-gray-200"
                          }`}
                        >
                          <span className="text-3xl">{opt.emoji}</span>
                          <div className="flex-1">
                            <p className={`font-bold text-sm ${type === opt.id ? m.color : "text-gray-900"}`}>{opt.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                          </div>
                          {type === opt.id && (
                            <div className={`w-6 h-6 rounded-full ${m.bg} ${m.border} border-2 flex items-center justify-center`}>
                              <Check className={`w-3.5 h-3.5 ${m.color}`} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-4">
                    {type === "complaint" && (
                      <>
                        <div>
                          <p className="text-sm font-bold text-gray-700 mb-2.5 px-1">{tt.s1ComplaintQ}</p>
                          <div className="grid grid-cols-3 gap-2">
                            {COMPLAINT_TARGETS.map(ct => (
                              <button key={ct.id} onClick={() => setTargetType(ct.id)}
                                className={`flex flex-col items-center gap-1.5 p-3.5 rounded-2xl border-2 transition-all ${targetType === ct.id ? "bg-amber-50 border-amber-300" : "bg-white border-gray-100 hover:border-gray-200"}`}
                              >
                                <span className="text-2xl">{ct.emoji}</span>
                                <span className={`text-[11px] font-bold ${targetType === ct.id ? "text-amber-700" : "text-gray-600"}`}>{ct.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        {myRequests.length > 0 && (
                          <div>
                            <p className="text-sm font-bold text-gray-700 mb-2 px-1">{tt.s1RelatedReq} <span className="font-normal text-gray-400">{tt.optional}</span></p>
                            <select value={relatedReqId} onChange={e => setRelatedReqId(e.target.value)}
                              className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 bg-white text-sm text-gray-700 focus:border-blue-300 outline-none"
                            >
                              <option value="">{tt.selectPlaceholder}</option>
                              {myRequests.map(r => (
                                <option key={r.id} value={r.id}>{r.categoryName} — {new Date(r.createdAt).toLocaleDateString(bcp47)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </>
                    )}
                    {type === "problem" && (
                      <div>
                        <p className="text-sm font-bold text-gray-700 mb-2.5 px-1">{tt.s1ProblemQ}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {PROBLEM_AREAS.map(a => (
                            <button key={a.id} onClick={() => setProblemArea(a.id)}
                              className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${problemArea === a.id ? "bg-red-50 border-red-200" : "bg-white border-gray-100 hover:border-gray-200"}`}
                            >
                              <span className="text-xl">{a.emoji}</span>
                              <span className={`text-sm font-bold ${problemArea === a.id ? "text-red-700" : "text-gray-700"}`}>{a.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {type === "suggestion" && (
                      <div>
                        <p className="text-sm font-bold text-gray-700 mb-2.5 px-1">{tt.s1SuggestionQ} <span className="font-normal text-gray-400">{tt.optional}</span></p>
                        <div className="space-y-2">
                          {SUGGESTION_CATS.map(c => (
                            <button key={c.id} onClick={() => setSuggestionCat(prev => prev === c.id ? "" : c.id)}
                              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${suggestionCat === c.id ? "bg-blue-50 border-blue-200" : "bg-white border-gray-100 hover:border-gray-200"}`}
                            >
                              <span className="text-2xl">{c.emoji}</span>
                              <span className={`text-sm font-bold flex-1 text-left ${suggestionCat === c.id ? "text-blue-700" : "text-gray-700"}`}>{c.label}</span>
                              {suggestionCat === c.id && <Check className="w-4 h-4 text-blue-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2 px-1">{tt.s2TitleLabel} <span className="text-red-500">*</span></label>
                      <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder={tt.s2TitlePlaceholder}
                        className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 outline-none transition-colors"
                      />
                      <p className="text-[11px] text-gray-400 mt-1 px-1">{title.length}/100</p>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2 px-1">{tt.s2DescLabel} <span className="text-red-500">*</span></label>
                      <textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={1000} rows={6}
                        placeholder={tt.s2DescPlaceholder}
                        className="w-full px-4 py-3 rounded-2xl border-2 border-gray-100 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-300 outline-none resize-none transition-colors"
                      />
                      <p className="text-[11px] text-gray-400 mt-1 px-1">{desc.length}/1000</p>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }} className="space-y-4">
                    <div>
                      <p className="text-sm font-bold text-gray-700 mb-1 px-1">{tt.s3FilesLabel} <span className="font-normal text-gray-400">{tt.s3FilesMax}</span></p>
                      <p className="text-[11px] text-gray-400 mb-3 px-1">{tt.s3FilesHint}</p>
                      {files.length < 5 && (
                        <button onClick={() => fileRef.current?.click()}
                          className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center gap-2 text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-all active:scale-[0.98]"
                        >
                          <Upload className="w-7 h-7" />
                          <span className="text-sm font-semibold">{tt.s3UploadCta}</span>
                          <span className="text-[11px]">{tt.s3UploadSub}</span>
                        </button>
                      )}
                      <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={e => addFiles(e.target.files)} />
                      {files.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {files.map((f, i) => (
                            <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                              {f.startsWith("data:image") ? (
                                <img src={f} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                                  <Paperclip className="w-5 h-5 text-gray-400" />
                                  <span className="text-[10px] text-gray-400 text-center px-1 leading-tight">{tFormat(tt.fileNumTpl, { n: i + 1 })}</span>
                                </div>
                              )}
                              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
                      <p className="text-xs font-bold text-blue-700 mb-2">{tt.summaryTitle}</p>
                      {type && (
                        <div className="flex items-center gap-2">
                          <span className="text-base">{TYPE_STYLES[type].emoji}</span>
                          <span className="text-xs font-semibold text-blue-800">{typeLabel(t, type)}</span>
                        </div>
                      )}
                      <p className="text-xs text-blue-700 font-semibold truncate">{title}</p>
                      <p className="text-[11px] text-blue-600 line-clamp-2">{desc}</p>
                      {files.length > 0 && <p className="text-[11px] text-blue-500">{tFormat(tt.filesAttachedTpl, { n: files.length })}</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="px-4 pb-6 pt-3 border-t border-gray-100 bg-white flex-shrink-0">
              <button
                disabled={!canNext() || submitting}
                onClick={() => { if (step < 3) setStep(s => s + 1); else handleSubmit(); }}
                className="w-full py-3.5 rounded-2xl font-extrabold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: BLUE_GRAD, boxShadow: "0 6px 20px rgba(37,99,235,0.3)" }}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {tt.submitting}</>
                ) : step < 3 ? (
                  <>{tt.continue} <ChevronRight className="w-4 h-4" /></>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> {tt.submit}</>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FeedbackDetailDrawer({ fb, onClose }: { fb: Feedback | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const tt = t.feedbackPage;
  const bcp47 = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const tm = fb ? (TYPE_STYLES[fb.type] ?? { emoji: "📋", color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" }) : null;
  const sm = fb ? STATUS_STYLES[fb.status] : null;
  const COMPLAINT_TARGETS = getComplaintTargets(t);
  const PROBLEM_AREAS = getProblemAreas(t);
  const SUGGESTION_CATS = getSuggestionCats(t);

  return (
    <AnimatePresence>
      {fb && tm && sm && (
        <motion.div
          key="detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end"
          onClick={e => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="w-full bg-white rounded-t-3xl max-h-[88vh] flex flex-col overflow-hidden"
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center gap-3 px-4 pb-4 pt-1 border-b border-gray-100 flex-shrink-0">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${tm.bg}`}>
                {tm.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-400">{typeLabel(t, fb.type)}</p>
                <h2 className="font-extrabold text-gray-900 text-base leading-tight truncate">{fb.title}</h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95 transition-all flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${sm.bg} ${sm.color}`}>{statusLabel(t, fb.status)}</span>
                <span className="text-xs text-gray-400">{new Date(fb.createdAt).toLocaleDateString(bcp47)}</span>
              </div>

              <div className="bg-gray-50 rounded-2xl p-4">
                <p className="text-xs font-bold text-gray-500 mb-2">{tt.detailLabel}</p>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{fb.description}</p>
              </div>

              {(fb.targetType || fb.problemArea || fb.suggestionCategory) && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
                  <p className="text-xs font-bold text-gray-500 mb-2">{tt.metaLabel}</p>
                  {fb.targetType && (
                    <p className="text-xs text-gray-700"><span className="font-semibold">{tt.metaComplaint}</span> {COMPLAINT_TARGETS.find(ct => ct.id === fb.targetType)?.label ?? fb.targetType}</p>
                  )}
                  {fb.problemArea && (
                    <p className="text-xs text-gray-700"><span className="font-semibold">{tt.metaArea}</span> {PROBLEM_AREAS.find(a => a.id === fb.problemArea)?.label ?? fb.problemArea}</p>
                  )}
                  {fb.suggestionCategory && (
                    <p className="text-xs text-gray-700"><span className="font-semibold">{tt.metaCategory}</span> {SUGGESTION_CATS.find(c => c.id === fb.suggestionCategory)?.label ?? fb.suggestionCategory}</p>
                  )}
                </div>
              )}

              {fb.attachments && fb.attachments.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">{tFormat(tt.filesCountLabelTpl, { n: fb.attachments.length })}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {fb.attachments.map((f, i) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                        {f.startsWith("data:image") ? (
                          <img src={f} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                            <Paperclip className="w-5 h-5 text-gray-400" />
                            <span className="text-[10px] text-gray-400">{tFormat(tt.fileNumTpl, { n: i + 1 })}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fb.status === "rejected" && fb.rejectionReason && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-xs font-bold text-red-600 mb-1.5">{tt.rejectionReasonLabel}</p>
                  <p className="text-sm text-red-700 leading-relaxed">{fb.rejectionReason}</p>
                </div>
              )}

              {fb.adminNote && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <p className="text-xs font-bold text-amber-700 mb-1.5">{tt.adminNoteLabel}</p>
                  <p className="text-sm text-amber-800 leading-relaxed">{fb.adminNote}</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function FeedbackPage() {
  const { user, activeRole } = useAuth();
  const { t, locale } = useI18n();
  const tt = t.feedbackPage;
  const bcp47 = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const [, setLocation] = useLocation();

  const [showForm, setShowForm]   = useState(false);
  const [selected, setSelected]  = useState<Feedback | null>(null);
  const [history, setHistory]    = useState<Feedback[]>([]);
  const [myRequests, setMyRequests] = useState<{ id: string; categoryName: string; createdAt: string }[]>([]);

  const refreshHistory = useCallback(() => {
    if (!user?.id) return;
    getFeedbacksByUser().then(setHistory).catch((err) => console.error("Load feedback history failed:", err));
  }, [user?.id]);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  useEffect(() => {
    if (!user?.id) { setMyRequests([]); return; }
    getRequestsByCustomer(user.id).then(setMyRequests).catch((err) => console.error("Load my requests failed:", err));
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <button
            onClick={() => setLocation("/settings/help")}
            className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:scale-95 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="font-extrabold text-gray-900 text-base leading-tight">{tt.pageTitle}</h1>
            <p className="text-xs text-gray-400">{tt.pageSubtitle}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold active:scale-95 transition-all shadow-md"
            style={{ background: BLUE_GRAD }}
          >
            <Plus className="w-3.5 h-3.5" />
            {tt.newBtn}
          </button>
        </div>
      </div>

      <div className="flex-1 p-4">
        {history.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5">
              <MessagesSquare className="w-10 h-10 text-blue-300" />
            </div>
            <h2 className="text-base font-extrabold text-gray-800 mb-1.5">{tt.emptyTitle}</h2>
            <p className="text-sm text-gray-400 mb-6 max-w-[220px]">
              {tt.emptyDesc}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white text-sm font-bold active:scale-95 transition-all shadow-lg"
              style={{ background: BLUE_GRAD, boxShadow: "0 6px 20px rgba(37,99,235,0.25)" }}
            >
              <Plus className="w-4 h-4" />
              {tt.emptyCta}
            </button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-bold text-gray-700">{tt.historyTitle}</h2>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                {history.length}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              {history.map((fb, i) => {
                const tm = TYPE_STYLES[fb.type] ?? { emoji: "📋", color: "text-gray-600", bg: "bg-gray-50" };
                const sm = STATUS_STYLES[fb.status];
                return (
                  <motion.button
                    key={fb.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => setSelected(fb)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors ${
                      i < history.length - 1 ? "border-b border-gray-50" : ""
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${tm.bg}`}>
                      {tm.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{fb.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {typeLabel(t, fb.type)} · {new Date(fb.createdAt).toLocaleDateString(bcp47)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.bg} ${sm.color}`}>
                        {statusLabel(t, fb.status)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <FeedbackFormDrawer
        open={showForm}
        userId={user?.id ?? ""}
        activeRole={activeRole ?? "customer"}
        myRequests={myRequests}
        onClose={() => setShowForm(false)}
        onSuccess={() => { setShowForm(false); refreshHistory(); }}
      />

      <FeedbackDetailDrawer
        fb={selected}
        onClose={() => setSelected(null)}
      />

      <BottomNav />
    </div>
  );
}
