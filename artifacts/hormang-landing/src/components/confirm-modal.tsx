import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ title, message, confirmText, onConfirm, onClose }: ConfirmModalProps) {
  const { t } = useI18n();
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
          className="bg-white w-full max-w-lg rounded-t-3xl px-5 pb-10 pt-4"
          style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.16)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-5">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-4 flex-shrink-0">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="font-extrabold text-gray-900 text-base mb-3 leading-snug">{title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{message}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t.confirmModal.cancel}
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className="flex-1 h-12 rounded-2xl text-sm font-bold text-white shadow-sm transition-[transform,opacity,filter] duration-150 ease-out active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
