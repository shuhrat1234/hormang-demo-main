import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, ImagePlus, Loader2, X } from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";
import { compressImage } from "@/lib/image-utils";
import type { CompletionDetails } from "@/lib/requests-store";

const MAX_PHOTOS = 10;
const MAX_NOTES = 500;

interface CompletionModalProps {
  onConfirm: (details: CompletionDetails) => void;
  onClose: () => void;
}

export function CompletionModal({ onConfirm, onClose }: CompletionModalProps) {
  const { t } = useI18n();
  const tt = t.providerChats.completionModal;
  const fileRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    setBusy(true);
    try {
      const next: string[] = [];
      for (const f of files.slice(0, room)) {
        next.push(await compressImage(f, 1024, 0.72));
      }
      setPhotos((p) => [...p, ...next].slice(0, MAX_PHOTOS));
    } finally {
      setBusy(false);
    }
  }

  function handleConfirm() {
    const minutes = parseInt(duration, 10);
    onConfirm({
      afterPhotos: photos,
      completionNotes: notes.trim() || undefined,
      durationMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
    });
    onClose();
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70]"
        style={{ background: "rgba(10,10,30,0.6)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%", opacity: 0.8 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[71] flex justify-center"
      >
        <div
          className="bg-white w-full max-w-lg rounded-t-3xl flex flex-col max-h-[92vh]"
          style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.16)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-gray-900 text-base leading-snug">{tt.title}</h3>
                <p className="text-xs text-gray-500">{tt.subtitle}</p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-5 overflow-y-auto">
            {/* Photos */}
            <div>
              <p className="text-sm font-black text-gray-800">{tt.photosLabel}</p>
              <p className="text-xs text-gray-400 mb-2.5">{tt.photosHint}</p>
              <div className="grid grid-cols-4 gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-violet-300 hover:text-violet-500 transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">{photos.length}/{MAX_PHOTOS}</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={handlePick}
              />
            </div>

            {/* Notes */}
            <div>
              <p className="text-sm font-black text-gray-800 mb-2">{tt.notesLabel}</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))}
                placeholder={tt.notesPlaceholder}
                rows={3}
                className="w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-3 text-sm focus:outline-none focus:border-violet-400 resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-1 text-right">{notes.length}/{MAX_NOTES}</p>
            </div>

            {/* Duration */}
            <div>
              <p className="text-sm font-black text-gray-800 mb-2">{tt.durationLabel}</p>
              <div className="relative">
                <Clock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder={tt.durationPlaceholder}
                  className="w-full h-12 pl-10 pr-16 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-violet-400"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                  {tt.minutesSuffix}
                </span>
              </div>
            </div>
          </div>

          <div className="px-5 pt-3 pb-8 border-t border-gray-100 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {tt.cancel}
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="flex-1 h-12 rounded-2xl text-sm font-bold text-white shadow-sm transition-[transform,opacity,filter] duration-150 ease-out active:scale-[0.97] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
            >
              {tt.confirm}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
