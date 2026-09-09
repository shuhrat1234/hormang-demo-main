import { useState } from "react";
import { Bell, Sparkles, X, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { useSettingsPrefs } from "@/lib/settings-prefs-store";
import {
  getPublishedAnnouncements,
  getSeenAnnouncementIds,
  markAnnouncementSeen,
  type Announcement,
} from "@/lib/announcements-store";
import { getLocalizedText } from "@/lib/localization";

interface NotificationsBellProps {
  audience: "customers" | "providers";
  accentColor?: string;
}

export function NotificationsBell({
  audience,
  accentColor = "hsl(221,78%,50%)",
}: NotificationsBellProps) {
  useStoreRefresh();
  const { user } = useAuth();
  const { locale } = useI18n();
  const [prefs] = useSettingsPrefs();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAnn, setSelectedAnn] = useState<Announcement | null>(null);

  const items = getPublishedAnnouncements(audience);
  const seenIds = user?.id ? getSeenAnnouncementIds(user.id) : [];
  const unseenCount = items.filter((a) => !seenIds.includes(a.id)).length;

  // If user disabled app notifications in Settings, don't show the bell or badge
  if (!prefs.notifApp) {
    return null;
  }

  function handleOpenAnn(a: Announcement) {
    if (user?.id) {
      markAnnouncementSeen(user.id, a.id);
    }
    setSelectedAnn(a);
  }

  function handleMarkAllSeen() {
    if (user?.id) {
      for (const item of items) {
        markAnnouncementSeen(user.id, item.id);
      }
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 active:scale-95 transition-all"
        aria-label="Bildirishnomalar"
        title={locale === "ru" ? "Уведомления" : locale === "en" ? "Notifications" : "Bildirishnomalar"}
      >
        <Bell className="w-5 h-5" />
        {unseenCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center shadow-sm animate-pulse">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {/* Notifications Drawer / Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[65] bg-black/50 backdrop-blur-xs"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="fixed inset-x-4 top-[10vh] bottom-[10vh] max-w-md mx-auto z-[66] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accentColor}18` }}>
                    <Bell className="w-4 h-4" style={{ color: accentColor }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">
                      {locale === "ru" ? "Уведомления" : locale === "en" ? "Notifications" : "Bildirishnomalar"}
                    </h3>
                    <p className="text-[10px] text-gray-400">
                      {items.length}{" "}
                      {locale === "ru" ? "событий" : locale === "en" ? "events" : "ta xabarlar"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {unseenCount > 0 && (
                    <button
                      onClick={handleMarkAllSeen}
                      className="text-[11px] font-bold text-blue-600 hover:underline px-1.5 py-1"
                    >
                      {locale === "ru" ? "Прочитать все" : locale === "en" ? "Mark all read" : "Barchasini o'qish"}
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {items.length === 0 ? (
                  <div className="text-center py-16">
                    <Bell className="w-10 h-10 text-gray-200 mx-auto mb-2.5" />
                    <p className="font-bold text-gray-400 text-sm">
                      {locale === "ru" ? "Нет новых уведомлений" : locale === "en" ? "No new notifications" : "Yangi bildirishnomalar yo'q"}
                    </p>
                    <p className="text-xs text-gray-300 mt-0.5">
                      {locale === "ru" ? "Здесь будут новости и события" : locale === "en" ? "News and events will appear here" : "Yangiliklar va tadbirlar shu yerda paydo bo'ladi"}
                    </p>
                  </div>
                ) : (
                  items.map((ann) => {
                    const isNew = !seenIds.includes(ann.id);
                    const title = getLocalizedText(ann.titleLocalized ?? ann.title, locale);
                    const content = getLocalizedText(ann.contentLocalized ?? ann.content, locale);
                    const cta = ann.ctaTextLocalized ? getLocalizedText(ann.ctaTextLocalized, locale) : ann.ctaText;

                    return (
                      <button
                        key={ann.id}
                        onClick={() => handleOpenAnn(ann)}
                        className="w-full text-left bg-gray-50/70 hover:bg-gray-100/70 rounded-2xl p-3.5 border border-gray-100 transition-all active:scale-[0.99] flex items-start gap-3"
                      >
                        <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs">
                          {ann.type === "event" ? (
                            <span className="text-sm">🎯</span>
                          ) : (
                            <Sparkles className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                              ann.type === "event"
                                ? "bg-orange-50 text-orange-700 border-orange-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}>
                              {ann.type === "event"
                                ? (locale === "ru" ? "Событие" : locale === "en" ? "Event" : "Tadbir")
                                : (locale === "ru" ? "Новость" : locale === "en" ? "News" : "Yangilik")}
                            </span>
                            {ann.isPinned && <span className="text-[11px]">📌</span>}
                            {isNew && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">
                                {locale === "ru" ? "Новое" : locale === "en" ? "New" : "Yangi"}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-1">
                            {title}
                          </p>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 leading-snug">
                            {content}
                          </p>
                          {cta && (
                            <span
                              className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-lg text-white"
                              style={{ background: accentColor }}
                            >
                              {cta}
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-2" />
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Selected announcement full detail modal */}
      <AnimatePresence>
        {selectedAnn && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedAnn(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="fixed inset-x-4 top-[8vh] bottom-[8vh] z-[71] max-w-md mx-auto bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedAnn.image && (
                <img
                  src={selectedAnn.image}
                  alt={selectedAnn.title}
                  className="w-full h-44 object-cover flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      selectedAnn.type === "event"
                        ? "bg-orange-50 text-orange-700 border-orange-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}
                  >
                    {selectedAnn.type === "event"
                      ? (locale === "ru" ? "Событие" : locale === "en" ? "Event" : "Tadbir")
                      : (locale === "ru" ? "Новость" : locale === "en" ? "News" : "Yangilik")}
                  </span>
                  {selectedAnn.isPinned && <span className="text-base">📌</span>}
                </div>
                <h2 className="font-extrabold text-gray-900 text-lg leading-snug">
                  {getLocalizedText(selectedAnn.titleLocalized ?? selectedAnn.title, locale)}
                </h2>
                <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                  {getLocalizedText(selectedAnn.contentLocalized ?? selectedAnn.content, locale)}
                </p>
                {selectedAnn.expiresAt && (
                  <p className="text-[10px] text-gray-400">
                    {locale === "ru" ? "Срок:" : locale === "en" ? "Expires:" : "Muddat:"}{" "}
                    {new Date(selectedAnn.expiresAt).toLocaleDateString(
                      locale === "ru" ? "ru-RU" : "uz-Latn-UZ"
                    )}
                  </p>
                )}
              </div>
              <div className="px-5 pb-5 space-y-2 flex-shrink-0">
                {selectedAnn.ctaLink && (
                  <button
                    onClick={() => {
                      const link = selectedAnn.ctaLink!;
                      setSelectedAnn(null);
                      setIsOpen(false);
                      if (link.startsWith("http")) {
                        window.open(link, "_blank");
                      } else {
                        setLocation(link);
                      }
                    }}
                    className="w-full py-3 rounded-2xl font-bold text-sm text-white shadow-sm active:scale-95 transition-all"
                    style={{ background: accentColor }}
                  >
                    {selectedAnn.ctaTextLocalized
                      ? getLocalizedText(selectedAnn.ctaTextLocalized, locale)
                      : selectedAnn.ctaText || (locale === "ru" ? "Перейти" : locale === "en" ? "Open" : "O'tish")}
                  </button>
                )}
                <button
                  onClick={() => setSelectedAnn(null)}
                  className="w-full py-2.5 rounded-2xl font-bold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {locale === "ru" ? "Закрыть" : locale === "en" ? "Close" : "Yopish"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
