import { useState, useEffect } from "react";
import { useStoreRefresh } from "@/hooks/use-store-refresh";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Inbox, TrendingUp, Star, Settings, LogOut,
  CheckCircle2, ChevronRight, MapPin,
  Phone, ShieldCheck,
} from "lucide-react";
import {
  getLocalProfile, getCompletionChecks, getCompletionPct,
  type LocalProfile,
} from "@/lib/local-profile";
import { getAverageRatingForUser, getReviewsForUser, getCompletedCount } from "@/lib/completion-store";

const VIOLET      = "linear-gradient(135deg, hsl(262,80%,54%) 0%, hsl(236,76%,60%) 100%)";
const VIOLET_SOLID = "hsl(262,80%,54%)";

function CircularProgress({ pct }: { pct: number }) {
  const r    = 34;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct < 40 ? "#EF4444" : pct < 75 ? "#F97316" : VIOLET_SOLID;
  return (
    <svg width="88" height="88" className="rotate-[-90deg]"
      style={{ filter: "drop-shadow(0 0 6px rgba(139,92,246,0.2))" }}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="#EDE9FE" strokeWidth="7" />
      <circle
        cx="44" cy="44" r={r} fill="none" strokeWidth="7"
        stroke={pct < 75 ? color : "url(#pgradProv)"}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: "stroke-dasharray 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease" }}
      />
      <defs>
        <linearGradient id="pgradProv" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(262,80%,54%)" />
          <stop offset="100%" stopColor="hsl(236,76%,60%)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function ProviderDashboard() {
  const { user, providerProfile, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useI18n();

  const [local, setLocal] = useState<LocalProfile>({});
  const storeVersion = useStoreRefresh();
  useEffect(() => {
    if (user?.id) setLocal(getLocalProfile(user.id));
  }, [user?.id, storeVersion]);

  const completionLocal = {
    photoUrl:       local.photoUrl,
    region:         local.region,
    district:       local.district,
    experience:     local.experience,
    portfolioItems: local.portfolioItems ?? [],
  };
  const checks  = getCompletionChecks(user ?? null, providerProfile ?? null, completionLocal);
  const pct     = getCompletionPct(checks);
  const missing = checks.filter((c) => !c.done);

  const avgRating      = user?.id ? getAverageRatingForUser(user.id, "provider") : 0;
  const reviewCount    = user?.id ? getReviewsForUser(user.id, "provider").length : 0;
  const completedCount = user?.id ? getCompletedCount(user.id, "provider") : 0;

  async function handleLogout() {
    await logout();
    setLocation("/");
  }

  const menuItems = [
    {
      icon: Inbox,
      title: t.dashboard.providerItems.newRequests.title,
      desc: t.dashboard.providerItems.newRequests.desc,
      action: undefined as (() => void) | undefined,
      badge: "0",
      badgeColor: "bg-blue-600 text-white",
    },
    {
      icon: Star,
      title: t.dashboard.providerItems.reviews.title,
      desc: t.dashboard.providerItems.reviews.desc,
      action: () => setLocation("/provider-reviews"),
    },
    {
      icon: Settings,
      title: t.dashboard.providerItems.profile.title,
      desc: t.dashboard.providerItems.profile.desc,
      action: () => setLocation("/profile/settings"),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 card-shadow">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black shadow-sm"
            style={{ background: "var(--brand-gradient)" }}
          >
            H
          </div>
          <span className="font-bold text-gray-900">Hormang</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
            {t.dashboard.rolePillProvider}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div
            onClick={() => setLocation("/profile/settings")}
            className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-sm font-bold cursor-pointer hover:bg-blue-100 transition-colors"
          >
            {user?.firstName?.[0]}
          </div>
          <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>

          <div className="bg-white rounded-2xl border border-gray-100 card-shadow p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className="relative flex-shrink-0">
                {local.photoUrl ? (
                  <img
                    src={local.photoUrl}
                    alt={user?.firstName}
                    className="w-[72px] h-[72px] rounded-2xl object-cover shadow-md"
                  />
                ) : (
                  <div
                    className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-md select-none"
                    style={{ background: VIOLET }}
                  >
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-[15px] font-extrabold text-gray-900 leading-tight">
                    {user?.firstName} {user?.lastName}
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100 flex-shrink-0">
                    {t.dashboard.rolePillProvider}
                  </span>
                </div>

                {providerProfile?.preferredLocation && (
                  <div className="flex items-center gap-1 text-gray-400 text-xs mb-2">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{providerProfile.preferredLocation}</span>
                  </div>
                )}

                <button
                  onClick={() => setLocation("/provider-reviews")}
                  className="flex items-center gap-1.5 mb-1.5 group"
                >
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 transition-colors ${
                          avgRating >= i
                            ? "text-amber-400 fill-amber-400"
                            : "text-gray-200 fill-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-gray-700 group-hover:text-violet-600 transition-colors">
                    {avgRating > 0 ? avgRating.toFixed(1) : "—"}
                    <span className="text-gray-400 font-normal ml-1">
                      {tFormat(t.dashboard.reviewCountTpl, { count: reviewCount })}
                    </span>
                  </span>
                </button>

                <button
                  onClick={() => toast({ title: t.dashboard.historyToastModal })}
                  className="flex items-center gap-1.5 group"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  <span className="text-xs text-gray-500 group-hover:text-violet-600 transition-colors">
                    <span className="font-bold text-gray-700">{completedCount}</span> {tFormat(t.dashboard.completedReviewsSuffixTpl, { count: completedCount }).replace(String(completedCount), "").trim()}
                  </span>
                </button>
              </div>
            </div>

            {providerProfile?.categories?.length ? (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {providerProfile.categories.slice(0, 4).map((cat) => (
                  <span
                    key={cat}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-100"
                  >
                    <CheckCircle2 className="w-3 h-3" /> {cat}
                  </span>
                ))}
                {providerProfile.categories.length > 4 && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-gray-50 text-gray-500 border border-gray-100">
                    +{providerProfile.categories.length - 4}
                  </span>
                )}
              </div>
            ) : null}

            <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-50">
              {user?.phone ? (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> {t.dashboard.phoneVerified}
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
                  <Phone className="w-3 h-3" /> {t.dashboard.phoneNotVerified}
                </div>
              )}
              <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                <ShieldCheck className="w-3 h-3" /> {t.dashboard.idCheckSoon}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4">
            <div className="flex items-center gap-4 mb-3">
              <div className="relative flex-shrink-0">
                <CircularProgress pct={pct} />
                <span
                  className="absolute inset-0 flex items-center justify-center text-sm font-extrabold"
                  style={{ color: pct < 40 ? "#EF4444" : pct < 75 ? "#F97316" : VIOLET_SOLID }}
                >
                  {pct}%
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-gray-900 text-sm mb-0.5">
                  {pct === 100
                    ? t.dashboard.profileCompleteFull
                    : tFormat(t.dashboard.profileCompletePartialTpl, { pct })}
                </p>
                {pct < 100 && (
                  <p className="text-xs text-gray-400 mb-1.5">{tFormat(t.dashboard.fieldsLeftTpl, { count: missing.length })}</p>
                )}
                {pct < 100 && (
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: VIOLET }}
                    />
                  </div>
                )}
                {pct === 100 && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t.dashboard.allFieldsFilled}
                  </div>
                )}
              </div>
            </div>

            {missing.length > 0 && (
              <div className="border-t border-gray-50 pt-3 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {t.dashboard.fillSoon}
                </p>
                {missing.slice(0, 4).map((m) => (
                  <div key={m.key} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[9px] font-black text-violet-500">{m.weight}%</span>
                      </div>
                      <p className="text-xs text-gray-600 truncate">{m.label}</p>
                    </div>
                    <button
                      onClick={() => setLocation("/profile/settings")}
                      className="flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-1 rounded-lg hover:bg-violet-100 transition-colors flex-shrink-0"
                    >
                      <TrendingUp className="w-2.5 h-2.5" /> {t.dashboard.add}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {menuItems.map(({ icon: Icon, title, desc, action, ...rest }, i) => {
              const badge      = "badge"      in rest ? (rest as { badge: string }).badge           : undefined;
              const badgeColor = "badgeColor" in rest ? (rest as { badgeColor: string }).badgeColor : undefined;
              const comingSoon = "comingSoon" in rest ? (rest as { comingSoon: boolean }).comingSoon : false;

              return (
                <motion.button
                  key={title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.4 }}
                  whileHover={action ? { scale: 1.01, y: -1 } : {}}
                  whileTap={action ? { scale: 0.99 } : {}}
                  onClick={action}
                  disabled={!action}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 group
                    ${action
                      ? "bg-white border-gray-100 hover:border-blue-200 hover:shadow-md card-shadow"
                      : "bg-white border-gray-100 opacity-60 cursor-not-allowed card-shadow"
                    }`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 transition-transform ${action ? "group-hover:scale-110" : ""}`}>
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gray-900">{title}</h3>
                    <p className="text-xs text-gray-500 truncate">{desc}</p>
                  </div>
                  {badge !== undefined && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center ${badgeColor}`}>
                      {badge}
                    </span>
                  )}
                  {comingSoon && (
                    <span className="text-[10px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                      {t.dashboard.soon}
                    </span>
                  )}
                  {action && !badge && !comingSoon && (
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Button
              onClick={() => setLocation("/")}
              variant="outline"
              size="sm"
              className="border-2 font-semibold gap-2"
            >
              {t.dashboard.backHome}
            </Button>
          </div>

        </motion.div>
      </main>
    </div>
  );
}
