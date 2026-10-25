import { useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { X, Flag, ImagePlus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import {
  submitReport,
  blockUser,
  isBlockedBy,
  type ReportReason,
} from "@/lib/report-store";
import { ApiError } from "@/lib/api-client";

async function compressToDataUrl(file: File, maxPx = 900): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export interface ReportModalProps {
  reporterUserId: string;
  reportedUserId: string;
  reportedName:   string;
  onClose:        () => void;
  /** Where this report originates. Defaults to "profile". */
  source?:        "profile" | "chat";
  /** Required when source === "chat". */
  chatId?:        string;
  /** Optional — last message id at time of report, when filed from chat. */
  lastMessageId?: string;
}

export function ReportModal({
  reporterUserId,
  reportedUserId,
  reportedName,
  onClose,
  source = "profile",
  chatId,
  lastMessageId,
}: ReportModalProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const tt = t.reportModal;
  const REASONS = useMemo<{ value: ReportReason; label: string }[]>(() => [
    { value: "spam",                  label: tt.reasons.spam },
    { value: "fake_profile",          label: tt.reasons.fake_profile },
    { value: "abuse",                 label: tt.reasons.abuse },
    { value: "fraud",                 label: tt.reasons.fraud },
    { value: "inappropriate_content", label: tt.reasons.inappropriate_content },
    { value: "outside_contact",       label: tt.reasons.outside_contact },
    { value: "other",                 label: tt.reasons.other },
  ], [tt]);
  const [reason,      setReason]      = useState<ReportReason | "">("");
  const [description, setDescription] = useState("");
  const [images,      setImages]      = useState<string[]>([]);
  const [blockToo,    setBlockToo]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const alreadyBlocked = isBlockedBy(reporterUserId, reportedUserId);
  const charLeft = 500 - description.length;

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 3 - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const compressed = await Promise.all(toAdd.map((f) => compressToDataUrl(f)));
    setImages((prev) => [...prev, ...compressed]);
  }

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    try {
      await submitReport({
        reporterUserId,
        reportedUserId,
        reason,
        description: description.trim() || undefined,
        attachments: images.length > 0 ? images : undefined,
        source,
        ...(source === "chat" && chatId ? { chatId } : {}),
        ...(source === "chat" && lastMessageId ? { lastMessageId } : {}),
      });
      if (blockToo && !alreadyBlocked) {
        blockUser(reporterUserId, reportedUserId);
      }
      toast({ title: tt.submittedToast });
      onClose();
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : tt.title, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90]"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />

      <motion.div
        initial={{ y: "100%", opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[91] flex justify-center"
      >
        <div
          className="bg-white w-full max-w-lg rounded-t-[28px] flex flex-col overflow-hidden"
          style={{ maxHeight: "90dvh", boxShadow: "0 -8px 48px rgba(0,0,0,0.2)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          <div className="flex items-center justify-between px-5 pb-3 pt-1 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                <Flag className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h2 className="font-black text-gray-900 text-base leading-tight">
                  {tt.title}
                </h2>
                <p className="text-[11px] text-gray-400 font-medium leading-tight">{reportedName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-5">

            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">
                {tt.reasonLabel} <span className="text-rose-500">*</span>
              </p>
              <div className="space-y-2">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-semibold text-left transition-all ${
                      reason === r.value
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-white"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        reason === r.value ? "border-amber-500 bg-amber-500" : "border-gray-300"
                      }`}
                    >
                      {reason === r.value && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">
                {tt.descLabel}{" "}
                <span className="text-gray-400 font-normal normal-case">{tt.optional}</span>
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder={tt.descPlaceholder}
                rows={3}
                className="w-full px-3.5 py-3 rounded-2xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition-all placeholder:text-gray-300"
              />
              <p
                className={`text-[11px] mt-1 text-right font-medium ${
                  charLeft < 60 ? "text-amber-600" : "text-gray-300"
                }`}
              >
                {tFormat(tt.charsLeftTpl, { n: charLeft })}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">
                {tt.evidenceLabel}{" "}
                <span className="text-gray-400 font-normal normal-case">{tt.evidenceOptional}</span>
              </p>
              <div className="flex items-start gap-2.5 flex-wrap">
                {images.map((src, i) => (
                  <div
                    key={i}
                    className="relative w-[72px] h-[72px] rounded-xl overflow-hidden border border-gray-200 flex-shrink-0"
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                {images.length < 3 && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-[72px] h-[72px] rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-300 hover:border-amber-300 hover:text-amber-400 transition-colors flex-shrink-0"
                  >
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[9px] font-bold">{tt.photoBtn}</span>
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            <button
              onClick={() => !alreadyBlocked && setBlockToo((b) => !b)}
              disabled={alreadyBlocked}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all ${
                blockToo || alreadyBlocked
                  ? "border-rose-200 bg-rose-50"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
              } ${alreadyBlocked ? "cursor-not-allowed opacity-75" : ""}`}
            >
              <div className="text-left">
                <p
                  className={`text-sm font-bold ${
                    blockToo || alreadyBlocked ? "text-rose-700" : "text-gray-700"
                  }`}
                >
                  {(blockToo || alreadyBlocked) ? tt.blockedDone : tt.blockUser}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                  {(blockToo || alreadyBlocked) ? tt.blockedDesc : tt.blockDesc}
                </p>
              </div>
              <div
                className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 flex items-center ${
                  blockToo || alreadyBlocked ? "bg-rose-500" : "bg-gray-200"
                }`}
              >
                <div
                  className={`w-[18px] h-[18px] rounded-full bg-white shadow-sm mx-0.5 transition-transform ${
                    blockToo || alreadyBlocked ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
            </button>

            <div className="pb-1" />
          </div>

          <div className="px-5 pb-6 pt-3 border-t border-gray-100 flex-shrink-0">
            <button
              disabled={!reason || submitting}
              onClick={handleSubmit}
              className="w-full py-3.5 rounded-2xl text-sm font-black text-white transition-[transform,opacity,filter] duration-150 ease-out active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: !reason || submitting
                  ? "#D1D5DB"
                  : "linear-gradient(135deg, #D97706 0%, #B45309 100%)",
              }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {tt.submitting}
                </span>
              ) : (
                tt.submit
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
