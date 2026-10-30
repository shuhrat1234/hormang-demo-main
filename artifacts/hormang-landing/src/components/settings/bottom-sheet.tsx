import { type ReactNode, useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  maxHeight?: string;
  hideClose?: boolean;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = "85vh",
  hideClose = false,
}: BottomSheetProps) {
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      panelRef.current
        ? Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];

    const initial = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0] ?? panelRef.current;
    initial?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) {
          e.preventDefault();
          panelRef.current?.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[60]"
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={subtitle ? subtitleId : undefined}
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.8 }}
            className="fixed inset-x-0 bottom-0 z-[61] bg-white dark:bg-[hsl(var(--surface))] rounded-t-3xl shadow-[0_-12px_40px_rgba(0,0,0,0.18)] flex flex-col focus:outline-none"
            style={{ maxHeight }}
          >
            <div className="pt-3 pb-2 flex justify-center flex-shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
            {(title || !hideClose) && (
              <div className="px-5 pb-3 flex items-start justify-between gap-3 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  {title && (
                    <h3 id={titleId} className="font-extrabold text-lg text-gray-900 dark:text-[hsl(var(--text-primary))] leading-tight">
                      {title}
                    </h3>
                  )}
                  {subtitle && (
                    <p id={subtitleId} className="text-xs text-gray-500 dark:text-[hsl(var(--text-tertiary))] mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                {!hideClose && (
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[hsl(var(--surface-3))] text-gray-500 dark:text-gray-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-[hsl(var(--surface-2))] transition-colors flex-shrink-0"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] flex-1">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
