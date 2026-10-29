import { useState, useEffect } from "react";
import { Cookie, ShieldCheck, ChevronDown, ChevronUp, Check, Settings2, X } from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";
import { apiFetch } from "@/lib/api-client";

const COOKIE_STORAGE_KEY = "hormang_cookie_consent_v1";

export interface CookieConsentData {
  status: "accepted" | "essential_only" | "custom";
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

export function CookieConsentBanner() {
  const { t } = useI18n();
  const c = t.cookieConsent;

  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COOKIE_STORAGE_KEY);
      if (stored) return;
    } catch {
      // fallback to showing
    }
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const saveConsent = async (status: "accepted" | "essential_only" | "custom", ana: boolean, mkt: boolean) => {
    setSubmitting(true);
    const data: CookieConsentData = {
      status,
      analytics: ana,
      marketing: mkt,
      timestamp: new Date().toISOString(),
    };

    try {
      localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage failure fallback
    }

    try {
      await apiFetch("/cookie-consent", {
        method: "POST",
        body: {
          consentStatus: status,
          analytics: ana,
          marketing: mkt,
        },
      });
    } catch (err) {
      console.warn("Failed to record cookie consent to server:", err);
    } finally {
      setSubmitting(false);
      setVisible(false);
    }
  };

  const handleAcceptAll = () => {
    saveConsent("accepted", true, true);
  };

  const handleEssentialOnly = () => {
    saveConsent("essential_only", false, false);
  };

  const handleSaveCustom = () => {
    saveConsent("custom", analytics, marketing);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent banner"
      className="fixed bottom-0 inset-x-0 z-[80] p-3 sm:p-5 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pointer-events-none animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="max-w-2xl mx-auto bg-white/95 backdrop-blur-md border border-amber-200/80 shadow-2xl rounded-2xl sm:rounded-3xl p-4 sm:p-5 pointer-events-auto ring-1 ring-black/5 text-gray-800">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/10 border border-amber-300/40 flex items-center justify-center flex-shrink-0 text-amber-600 shadow-inner">
            <Cookie className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 tracking-tight flex items-center gap-1.5">
                {c.title}
              </h3>
              <button
                onClick={handleEssentialOnly}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 p-1 -mr-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-[13px] text-gray-600 leading-relaxed mt-1">
              {c.description}
            </p>

            {/* Customizer drawer */}
            {showSettings && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5 text-xs">
                {/* Essential */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="pr-2">
                    <p className="font-bold text-gray-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      {c.essentialTitle}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{c.essentialDesc}</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 whitespace-nowrap">
                    Doimiy faol
                  </span>
                </div>

                {/* Analytics */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="pr-2">
                    <p className="font-bold text-gray-800">{c.analyticsTitle}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{c.analyticsDesc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={analytics}
                      onChange={(e) => setAnalytics(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                  </label>
                </div>

                {/* Marketing */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="pr-2">
                    <p className="font-bold text-gray-800">{c.marketingTitle}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{c.marketingDesc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={marketing}
                      onChange={(e) => setMarketing(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                  </label>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 mt-3.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowSettings((prev) => !prev)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors py-1 px-1.5"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>{showSettings ? (c.save) : c.customize}</span>
                {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <div className="flex items-center gap-2 ml-auto">
                {showSettings ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSaveCustom}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.97] flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {c.save}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleEssentialOnly}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      {c.essentialOnly}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleAcceptAll}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-500/20 transition-[transform,filter,box-shadow] duration-150 ease-out active:scale-[0.97]"
                    >
                      {c.acceptAll}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
