import { useState, useEffect, useMemo } from "react";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { BottomNav } from "@/components/bottom-nav";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import logoImg from "/hormang-logo.png";
import {
  ClipboardList, Inbox, CheckCircle2,
  Plus, MessageCircle, LayoutGrid, Briefcase, LogOut, MessagesSquare,
  ChevronRight, Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { getCategoryDisplayName, getCategoryEmoji } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { getRegionLabel } from "@/lib/regions";
import { getPopularCategories, type PopularCategory } from "@/lib/popularity";
import { tFormat } from "@/lib/i18n";
import {
  getLocalProfile, hasProviderAccess,
  type LocalProfile,
} from "@/lib/local-profile";
import {
  getRequestsByCustomer, getOffersByCustomer, getChatsByCustomer,
  type CustomerRequest, type Offer, type Chat, type CooldownState,
} from "@/lib/requests-store";
import { fetchRequestCooldown } from "@/lib/requests-client";
import { getCompletedCount } from "@/lib/completion-store";
import { RollingCategories } from "@/components/ui/RollingCategories";
import { getLocalizedText } from "@/lib/localization";
import {
  getPublishedAnnouncements, markAnnouncementSeen, getSeenAnnouncementIds,
  type Announcement,
} from "@/lib/announcements-store";

const BLUE      = "hsl(221,78%,50%)";
const BLUE_GRAD = "linear-gradient(135deg, hsl(221,78%,48%) 0%, hsl(199,89%,56%) 100%)";

/* ─── Announcement full-content modal ───────────────────────────── */
function AnnouncementModal({ ann, onClose }: { ann: Announcement; onClose: () => void }) {
  const { t, locale } = useI18n();
  const ev = t.customerHome.events;
  const [, setLocation] = useLocation();
  const annTitle   = getLocalizedText(ann.titleLocalized   ?? ann.title,   locale);
  const annContent = getLocalizedText(ann.contentLocalized ?? ann.content, locale);
  const annCtaText = ann.ctaTextLocalized
    ? getLocalizedText(ann.ctaTextLocalized, locale)
    : ann.ctaText ?? "";
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="fixed inset-x-4 top-[8vh] bottom-[8vh] z-[61] max-w-md mx-auto bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {ann.image && (
          <img
            src={ann.image} alt={ann.title}
            className="w-full h-44 object-cover flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              ann.type === "event"
                ? "bg-orange-50 text-orange-700 border-orange-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}>
              {ann.type === "event" ? ev.typeEvent : ev.typeNews}
            </span>
            {ann.isPinned && <span className="text-base">📌</span>}
          </div>
          <h2 className="font-extrabold text-gray-900 text-lg leading-snug">{annTitle}</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{annContent}</p>
          {ann.expiresAt && (
            <p className="text-[10px] text-gray-400">
              {tFormat(ev.deadlineTpl, { date: new Date(ann.expiresAt).toLocaleDateString("uz-UZ") })}
            </p>
          )}
        </div>
        <div className="px-5 pb-5 space-y-2 flex-shrink-0">
          {annCtaText && ann.ctaLink && (
            <button
              onClick={() => { onClose(); setLocation(ann.ctaLink!); }}
              className="w-full py-3 rounded-2xl font-bold text-sm text-white shadow-sm active:scale-95 transition-all"
              style={{ background: BLUE }}
            >
              {annCtaText}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl font-bold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {ev.closeBtn}
          </button>
        </div>
      </motion.div>
    </>
  );
}

/* ─── Events / News section ──────────────────────────────────────── */
function CustomerEventsSection() {
  useStoreRefresh();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const ev = t.customerHome.events;
  const [selected, setSelected] = useState<Announcement | null>(null);

  const items = getPublishedAnnouncements("customers");
  const seenIds = user?.id ? getSeenAnnouncementIds(user.id) : [];
  const unseenCount = items.filter((a) => !seenIds.includes(a.id)).length;

  if (items.length === 0) return null;

  function openAnn(a: Announcement) {
    if (user?.id) markAnnouncementSeen(user!.id, a.id);
    setSelected(a);
  }

  return (
    <>
      <section className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <h2 className="font-bold text-sm text-gray-900">{ev.title}</h2>
            {unseenCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-red-500 text-white">
                {unseenCount}
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-400">{tFormat(ev.countTpl, { n: items.length })}</span>
        </div>

        <div className="space-y-2">
          {items.map((ann) => {
            const isNew = !seenIds.includes(ann.id);
            return (
              <button key={ann.id} onClick={() => openAnn(ann)} className="w-full text-left">
                <div className={`bg-white rounded-2xl border overflow-hidden card-shadow transition-all active:scale-[0.99] ${
                  ann.isPinned ? "border-amber-200" : "border-gray-100"
                }`}>
                  {ann.image && (
                    <img
                      src={ann.image} alt={ann.title}
                      className="w-full h-28 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                            ann.type === "event"
                              ? "bg-orange-50 text-orange-700 border-orange-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            {ann.type === "event" ? ev.typeEvent : ev.typeNews}
                          </span>
                          {ann.isPinned && <span className="text-[11px]">📌</span>}
                          {isNew && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">
                              {ev.isNew}
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-gray-900 text-sm leading-snug truncate">
                          {getLocalizedText(ann.titleLocalized ?? ann.title, locale)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">
                          {getLocalizedText(ann.contentLocalized ?? ann.content, locale)}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
                    </div>
                    {(ann.ctaTextLocalized ? getLocalizedText(ann.ctaTextLocalized, locale) : ann.ctaText) && (
                      <div className="mt-3">
                        <span
                          className="inline-block px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                          style={{ background: BLUE }}
                        >
                          {ann.ctaTextLocalized ? getLocalizedText(ann.ctaTextLocalized, locale) : ann.ctaText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {selected && (
          <AnnouncementModal ann={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

export default function CustomerHomePage() {
  const { user, providerProfile, logout } = useAuth();
  const { t, locale } = useI18n();
  const [, setLocation] = useLocation();
  const [local, setLocal] = useState<LocalProfile>({});
  const [cooldown, setCooldown] = useState<CooldownState>({ blocked: false, remainingMs: 0, until: null, durationMs: 0, recentCount: 0, extended: false });
  useEffect(() => {
    let cancelled = false;
    fetchRequestCooldown().then((c) => { if (!cancelled) setCooldown(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);
  useEffect(() => {
    if (!cooldown.blocked) return;
    const id = window.setInterval(() => {
      setCooldown((c) => ({ ...c, remainingMs: Math.max(0, c.remainingMs - 1000) }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown.blocked]);
  const storeVersion = useStoreRefresh();

  const [popularCategories, setPopularCategories] = useState<PopularCategory[]>([]);
  useEffect(() => {
    getPopularCategories().then(setPopularCategories).catch((err) => console.error("Load popular categories failed:", err));
  }, [storeVersion]);

  useEffect(() => {
    if (user?.id) setLocal(getLocalProfile(user.id));
  }, [user?.id, storeVersion]);

  const [allRequests, setAllRequests] = useState<CustomerRequest[]>([]);
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [allChats, setAllChats] = useState<Chat[]>([]);
  useEffect(() => {
    if (!user?.id) { setAllRequests([]); setAllOffers([]); setAllChats([]); return; }
    let cancelled = false;
    Promise.all([
      getRequestsByCustomer(user.id),
      getOffersByCustomer(user.id),
      getChatsByCustomer(user.id),
    ]).then(([requests, offers, chats]) => {
      if (cancelled) return;
      setAllRequests(requests);
      setAllOffers(offers);
      setAllChats(chats);
    }).catch((err) => console.error("Load customer home data failed:", err));
    return () => { cancelled = true; };
  }, [user?.id, storeVersion]);

  function fmtDate(iso: string, withYear = false): string {
    const d = new Date(iso);
    return withYear
      ? `${d.getDate()}-${t.shared.months[d.getMonth()]}, ${d.getFullYear()}`
      : `${d.getDate()}-${t.shared.months[d.getMonth()]}`;
  }

  const activeRequests    = allRequests.filter(r => r.status !== "completed" && r.status !== "cancelled");
  const completedRequests = allRequests.filter(r => r.status === "completed");
  const pendingOffers     = allOffers.filter(o => o.status === "pending");

  const recentOffers = [...allOffers]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const recentChats = [...allChats]
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.timestamp ?? a.createdAt;
      const bLast = b.messages[b.messages.length - 1]?.timestamp ?? b.createdAt;
      return new Date(bLast).getTime() - new Date(aLast).getTime();
    })
    .slice(0, 5);

  const firstName = user?.firstName ?? t.shared.user;
  const fullName  = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  const initials  = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase();
  const hasProviderRole = hasProviderAccess(user ?? null, providerProfile ?? null, local);

  const secondaryActions = [
    { icon: LayoutGrid,    label: t.customerHome.secondaryActions.categories.label,     desc: t.customerHome.secondaryActions.categories.desc,     path: "/questionnaire" },
    { icon: ClipboardList, label: t.customerHome.secondaryActions.requests.label,        desc: t.customerHome.secondaryActions.requests.desc,        path: "/my-requests" },
    ...(!hasProviderRole
      ? [{ icon: Briefcase, label: t.customerHome.secondaryActions.becomeProvider.label, desc: t.customerHome.secondaryActions.becomeProvider.desc, path: "/dashboard" }]
      : []),
  ];

  const requestStatusLabel = (status: string): string => {
    const map = t.statuses.request as Record<string, string>;
    return map[status] ?? status;
  };
  const offerStatusLabel = (status: string): string => {
    const map = t.statuses.offer as Record<string, string>;
    return map[status] ?? status;
  };

  async function handleLogout() {
    try { await logout(); } catch { /* ignore */ }
    setLocation("/");
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">

        {/* ── STICKY WHITE HEADER ── */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10 card-shadow">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain" />
              <span className="font-bold text-gray-900 text-sm">Hormang</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setLocation("/dashboard")}
                className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-blue-100 active:scale-95 transition-transform"
                style={local.photoUrl ? {} : { background: BLUE_GRAD }}
              >
                {local.photoUrl ? (
                  <img src={local.photoUrl} alt={fullName} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                    {initials || "?"}
                  </span>
                )}
              </button>
              <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-4 pb-28 space-y-4">

          {/* ── GREETING + PRIMARY CTA CARD ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-5 pt-5 pb-5"
            style={{ background: BLUE_GRAD }}
          >
            <p className="text-blue-100 text-sm font-medium mb-0.5">{tFormat(t.customerHome.greetingTpl, { name: firstName })}</p>
            <h1 className="text-white text-xl font-extrabold leading-tight mb-1">
              {t.customerHome.whatService}
            </h1>
            <p className="text-blue-200 text-xs mb-4">
              {t.customerHome.createNewRequestSubtitle}
            </p>
            <motion.button
              whileTap={{ scale: cooldown.blocked ? 1 : 0.97 }}
              disabled={cooldown.blocked}
              onClick={() => !cooldown.blocked && setLocation("/questionnaire")}
              className="w-full bg-white text-blue-700 font-extrabold text-sm py-3 rounded-xl flex items-center justify-center gap-2 shadow-md active:bg-blue-50 transition-colors disabled:bg-white/70 disabled:text-blue-400 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              {cooldown.blocked
                ? t.customerHome.cooldownActive
                : t.customerHome.createNewRequest}
            </motion.button>

            {cooldown.blocked && (
              <div className="mt-2.5 rounded-xl bg-blue-900/40 border border-blue-300/30 px-3 py-2 flex items-center gap-2">
                <span className="text-base">⏳</span>
                <p className="text-[11px] font-bold text-white tabular-nums">
                  {tFormat(t.customerHome.nextRequestInTpl, { time: tFormat(t.time.cooldownTpl, { m: Math.floor(Math.max(0, Math.ceil(cooldown.remainingMs / 1000)) / 60), s: String(Math.max(0, Math.ceil(cooldown.remainingMs / 1000)) % 60).padStart(2, "0") }) })}
                </p>
              </div>
            )}
          </motion.div>

          {/* ── Popular Categories ── */}
          <section>
            <div className="mb-2.5">
              <h2 className="font-extrabold text-gray-900 text-sm leading-tight">{t.customerHome.sections.popularServices}</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">{t.customerHome.sections.popularServicesSubtitle}</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 pt-3.5 no-scrollbar">
              {popularCategories.map((cat) => {
                const name  = getCategoryDisplayName(cat.categoryId, locale);
                const emoji = getCategoryEmoji(cat.categoryId);
                const hasScore = cat.popularityScore > 0;
                const rankMeta =
                  hasScore && cat.rank === 1 ? { label: "#1", style: "linear-gradient(135deg,#F59E0B,#D97706)", shadow: "0 2px 8px rgba(245,158,11,0.5)", ring: "ring-amber-300 border-amber-100" } :
                  hasScore && cat.rank === 2 ? { label: "#2", style: "linear-gradient(135deg,#9DB4C0,#607D8B)", shadow: "0 2px 8px rgba(100,116,139,0.45)", ring: "ring-slate-300 border-slate-100"  } :
                  hasScore && cat.rank === 3 ? { label: "#3", style: "linear-gradient(135deg,#C97B4B,#7C4A1E)", shadow: "0 2px 8px rgba(180,83,9,0.4)",   ring: "ring-orange-200 border-orange-100" } :
                  null;
                return (
                  <button
                    key={cat.categoryId}
                    onClick={() => setLocation("/questionnaire")}
                    className={`relative flex-shrink-0 bg-white rounded-2xl border card-shadow px-3.5 py-2.5 text-center active:scale-[0.97] transition-all ${
                      rankMeta ? `ring-1 ${rankMeta.ring}` : "border-gray-100 hover:border-blue-200"
                    }`}
                  >
                    {rankMeta && (
                      <span
                        className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap leading-tight"
                        style={{ background: rankMeta.style, boxShadow: rankMeta.shadow }}
                      >
                        {rankMeta.label}
                      </span>
                    )}
                    <div className="flex justify-center mb-0.5">
                      <CategoryIcon categoryId={cat.categoryId} emoji={emoji} size={28} shape="square" />
                    </div>
                    <p className="text-[10px] font-bold text-gray-700 whitespace-nowrap">{name}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Secondary Actions ── */}
          <div className="flex gap-2.5">
            {/* Categories — special card with RollingCategories on the right */}
            <button
              onClick={() => setLocation("/questionnaire")}
              className="flex-1 bg-white border border-gray-100 card-shadow rounded-2xl p-3.5 text-left hover:border-blue-200 active:scale-[0.97] transition-all flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <LayoutGrid className="w-4 h-4 text-blue-600 mb-1.5" />
                <p className="font-bold text-gray-900 text-xs leading-tight">{t.customerHome.secondaryActions.categories.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{t.customerHome.secondaryActions.categories.desc}</p>
              </div>
              <RollingCategories
                items={t.customerHome.rollingCats}
                interval={3000}
                onClick={() => setLocation("/questionnaire")}
              />
            </button>

            {/* Remaining secondary actions */}
            {secondaryActions.filter(a => a.label !== t.customerHome.secondaryActions.categories.label).map((a) => (
              <button
                key={a.label}
                onClick={() => setLocation(a.path)}
                className="flex-1 bg-white border border-gray-100 card-shadow rounded-2xl p-3.5 text-left hover:border-blue-200 active:scale-[0.97] transition-all"
              >
                <a.icon className="w-4 h-4 text-blue-600 mb-2" />
                <p className="font-bold text-gray-900 text-xs leading-tight">{a.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{a.desc}</p>
              </button>
            ))}
          </div>

          {/* ── Quick Stats ── */}
          <div className="flex gap-2.5">
            {[
              { label: t.customerHome.stats.activeRequests, val: activeRequests.length,    color: "text-blue-600",   bg: "bg-blue-50",   Icon: ClipboardList, href: "/my-requests",      ref: null },
              { label: t.customerHome.stats.newOffers,      val: pendingOffers.length,     color: "text-violet-600", bg: "bg-violet-50", Icon: Inbox,          href: "/chat-offers",      ref: null },
              { label: t.customerHome.stats.completed,      val: user?.id ? getCompletedCount(user.id, "customer") : 0, color: "text-green-600",  bg: "bg-green-50",  Icon: CheckCircle2,   href: "/request-history",  ref: "/customer-home" },
            ].map((s) => (
              <button key={s.label} onClick={() => { if (s.ref) sessionStorage.setItem("request_history_referrer", s.ref); setLocation(s.href); }} className={`flex-1 ${s.bg} rounded-2xl p-3 flex flex-col items-center text-center active:scale-95 transition-transform`}>
                <s.Icon className={`w-4 h-4 ${s.color} mb-1`} />
                <p className={`text-xl font-extrabold ${s.color} leading-none`}>{s.val}</p>
                <p className="text-[9px] text-gray-500 font-semibold leading-tight mt-1">{s.label}</p>
              </button>
            ))}
          </div>

          {/* ── News & Events ── */}
          <CustomerEventsSection />

          {/* ── Active Requests ── */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="font-extrabold text-gray-900 text-sm">{t.customerHome.sections.activeRequests}</h2>
              <button onClick={() => setLocation("/my-requests")} className="text-xs font-semibold text-blue-600 hover:underline">
                {t.shared.all}
              </button>
            </div>

            {activeRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 card-shadow p-6 flex flex-col items-center text-center">
                <ClipboardList className="w-8 h-8 text-gray-200 mb-2" />
                <p className="font-semibold text-gray-400 text-sm">{t.customerHome.emptyStates.noActiveRequests}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeRequests.slice(0, 5).map((req, i) => (
                  <motion.button
                    key={req.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setLocation("/my-requests")}
                    className="w-full bg-white rounded-2xl border border-gray-100 card-shadow p-4 text-left hover:border-blue-200 active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <CategoryIcon categoryId={req.categoryId} emoji={req.emoji} size={40} shape="square" className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{getCategoryDisplayName(req.categoryId, locale, req.categoryName)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {fmtDate(req.createdAt, true)}{req.region ? ` · ${getRegionLabel(req.region, locale)}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          req.status === "open"      ? "bg-blue-50 text-blue-700"   :
                          req.status === "matched"   ? "bg-teal-50 text-teal-700"   :
                          req.status === "accepted"  ? "bg-green-50 text-green-700" :
                          req.status === "completed" ? "bg-green-50 text-green-700" :
                          req.status === "cancelled" ? "bg-red-50 text-red-500"     :
                                                       "bg-gray-100 text-gray-500"
                        }`}>
                          {requestStatusLabel(req.status)}
                        </span>
                        {req.offerCount > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setLocation("/chat-offers"); }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 transition-colors"
                          >
                            <MessagesSquare className="w-3 h-3 flex-shrink-0" />
                            <span className="text-[10px] font-bold leading-none">{req.offerCount}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </section>

          {/* ── New Offers ── */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="font-extrabold text-gray-900 text-sm">{t.customerHome.sections.newOffers}</h2>
              <button onClick={() => setLocation("/chat-offers")} className="text-xs font-semibold text-blue-600 hover:underline">
                {t.shared.all}
              </button>
            </div>

            {recentOffers.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 card-shadow p-5 flex flex-col items-center text-center">
                <Inbox className="w-7 h-7 text-gray-200 mb-2" />
                <p className="text-sm font-semibold text-gray-400">{t.customerHome.emptyStates.noOffers}</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {recentOffers.map((offer) => {
                  const req = allRequests.find(r => r.id === offer.requestId);
                  return (
                    <button
                      key={offer.id}
                      onClick={() => setLocation("/chat-offers")}
                      className="flex-shrink-0 w-40 bg-white rounded-2xl border border-gray-100 card-shadow p-3.5 text-left hover:border-blue-200 active:scale-[0.98] transition-all"
                    >
                      {offer.masterPhotoUrl || getLocalProfile(offer.masterId).photoUrl ? (
                        <img
                          src={offer.masterPhotoUrl || getLocalProfile(offer.masterId).photoUrl}
                          alt={offer.masterName}
                          className="w-9 h-9 rounded-xl object-cover mb-2.5 shadow-sm"
                          onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black mb-2.5"
                          style={{ background: offer.masterColor || BLUE_GRAD }}
                        >
                          {offer.masterInitials}
                        </div>
                      )}
                      <p className="font-bold text-gray-900 text-sm leading-snug truncate">{offer.masterName}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{getCategoryDisplayName(req?.categoryId ?? "", locale, req?.categoryName)}</p>
                      <p className="text-sm font-extrabold text-blue-600 mt-1.5">
                        {offer.price.toLocaleString()} {t.shared.sumSuffix}
                      </p>
                      <span className={`mt-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        offer.status === "pending"         ? "bg-amber-50 text-amber-700" :
                        offer.status === "accepted"        ? "bg-blue-50 text-blue-700" :
                        offer.status === "completed"       ? "bg-green-50 text-green-700" :
                        offer.status === "rejected"        ? "bg-red-50 text-red-600" :
                                                             "bg-gray-100 text-gray-500"
                      }`}>
                        {offerStatusLabel(offer.status)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Recent Chats ── */}
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="font-extrabold text-gray-900 text-sm">{t.customerHome.sections.recentChats}</h2>
              <button onClick={() => setLocation("/chat-offers")} className="text-xs font-semibold text-blue-600 hover:underline">
                {t.shared.all}
              </button>
            </div>

            {recentChats.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 card-shadow p-5 flex flex-col items-center text-center">
                <MessageCircle className="w-7 h-7 text-gray-200 mb-2" />
                <p className="text-sm font-semibold text-gray-400">{t.customerHome.emptyStates.noChats}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentChats.map((chat) => {
                  const lastMsg = chat.messages[chat.messages.length - 1];
                  const unreadCount = chat.customerUnread ?? 0;
                  const hasNewMsg = unreadCount > 0;
                  return (
                    <button
                      key={chat.id}
                      onClick={() => setLocation(`/chat/${chat.id}`)}
                      className="w-full bg-white rounded-2xl border border-gray-100 card-shadow p-3.5 text-left hover:border-blue-200 active:scale-[0.99] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                          style={{ background: chat.masterColor || BLUE_GRAD }}
                        >
                          {chat.masterInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-gray-900 text-sm truncate">{chat.masterName}</p>
                            {lastMsg && (
                              <span className="text-[10px] text-gray-400 flex-shrink-0">
                                {fmtDate(lastMsg.timestamp)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {lastMsg
                              ? lastMsg.attachment ? t.shared.fileAttachment : lastMsg.text
                              : getCategoryDisplayName(chat.categoryId, locale, chat.categoryName)}
                          </p>
                        </div>
                        {hasNewMsg && (
                          <div className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

        </main>
      </div>
      <BottomNav />
    </>
  );
}
