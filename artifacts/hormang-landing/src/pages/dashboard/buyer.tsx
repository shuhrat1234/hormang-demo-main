import { type ComponentType } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Search, ClipboardList, Settings, LogOut, ChevronRight } from "lucide-react";

export default function BuyerDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useI18n();

  async function handleLogout() {
    await logout();
    setLocation("/");
  }

  const menuItems: { icon: ComponentType<{ className?: string }>; title: string; desc: string; action?: () => void; highlight?: boolean }[] = [
    {
      icon: Search,
      title: t.dashboard.buyerItems.search.title,
      desc: t.dashboard.buyerItems.search.desc,
      action: () => setLocation("/"),
      highlight: true,
    },
    {
      icon: ClipboardList,
      title: t.dashboard.buyerItems.requests.title,
      desc: t.dashboard.buyerItems.requests.desc,
      action: () => { sessionStorage.setItem("request_history_referrer", "/dashboard"); setLocation("/request-history"); },
    },
    {
      icon: Settings,
      title: t.dashboard.buyerItems.profile.title,
      desc: t.dashboard.buyerItems.profile.desc,
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

      <main className="max-w-lg mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
          <div className="mb-8">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xl font-black">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{tFormat(t.dashboard.welcomeTpl, { name: user?.firstName ?? "" })}</h1>
                <p className="text-gray-500 text-sm">{t.dashboard.customerPanel}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {menuItems.map(({ icon: Icon, title, desc, action, highlight }, i) => (
              <motion.button
                key={title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 + i * 0.07, duration: 0.4 }}
                whileHover={action ? { scale: 1.01, y: -1 } : {}}
                whileTap={action ? { scale: 0.99 } : {}}
                onClick={action}
                disabled={!action}
                className={`w-full text-left p-5 rounded-2xl border transition-all flex items-center gap-4 group
                  ${highlight
                    ? "bg-blue-600 border-blue-600 hover:bg-blue-700 text-white"
                    : action
                    ? "bg-white border-gray-100 hover:border-blue-200 hover:shadow-md card-shadow"
                    : "bg-white border-gray-100 opacity-60 cursor-not-allowed card-shadow"
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform ${action ? "group-hover:scale-110" : ""}
                  ${highlight ? "bg-white/20" : "bg-blue-50"}`}>
                  <Icon className={`w-5 h-5 ${highlight ? "text-white" : "text-blue-600"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-sm ${highlight ? "text-white" : "text-gray-900"}`}>{title}</h3>
                  <p className={`text-xs truncate ${highlight ? "text-blue-100" : "text-gray-500"}`}>{desc}</p>
                </div>
                {action ? (
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 ${highlight ? "text-blue-200" : "text-gray-400 group-hover:text-blue-500"}`} />
                ) : null}
              </motion.button>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Button onClick={() => setLocation("/")} variant="outline" size="sm" className="border-2 font-semibold gap-2">
              {t.dashboard.backHome}
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
