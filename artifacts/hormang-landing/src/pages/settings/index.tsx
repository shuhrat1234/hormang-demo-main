import { useState } from "react";
import { useLocation } from "wouter";
import { Bell, ShieldCheck, HelpCircle, Info, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { SettingsPageShell } from "@/components/settings/page-shell";
import { Section } from "@/components/settings/section";
import { SettingsRow } from "@/components/settings/settings-row";

export default function SettingsHome() {
  const { activeRole, logout, user } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const [loggingOut, setLoggingOut] = useState(false);

  const isProvider = activeRole === "provider";
  const subtitle = isProvider ? t.settings.panelProvider : t.settings.panelCustomer;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      setLocation("/");
    } finally {
      setLoggingOut(false);
    }
  }

  const items = [
    {
      key: "notifications",
      icon: Bell,
      iconBg: "hsl(38, 95%, 95%)",
      iconColor: "hsl(35, 90%, 50%)",
      title: t.settings.sections.notifications.title,
      desc: t.settings.sections.notifications.desc,
      href: "/settings/notifications",
    },
    {
      key: "security",
      icon: ShieldCheck,
      iconBg: "hsl(160, 60%, 95%)",
      iconColor: "hsl(160, 60%, 38%)",
      title: t.settings.sections.security.title,
      desc: t.settings.sections.security.desc,
      href: "/settings/security",
    },
    {
      key: "help",
      icon: HelpCircle,
      iconBg: "hsl(221, 78%, 96%)",
      iconColor: "hsl(221, 78%, 48%)",
      title: t.settings.sections.help.title,
      desc: t.settings.sections.help.desc,
      href: "/settings/help",
    },
    {
      key: "about",
      icon: Info,
      iconBg: "hsl(262, 80%, 96%)",
      iconColor: "hsl(262, 80%, 54%)",
      title: t.settings.sections.about.title,
      desc: t.settings.sections.about.desc,
      href: "/settings/about",
    },
  ];

  return (
    <SettingsPageShell
      title={t.settings.title}
      subtitle={subtitle}
      back={isProvider ? "/provider-home" : "/dashboard"}
    >
      {user && (
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-700 dark:to-indigo-800 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white font-extrabold text-lg flex-shrink-0">
            {(user.phone ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm truncate">{user.phone}</p>
            <p className="text-[11px] text-white/80 truncate">ID · {user.id.slice(0, 8)}</p>
          </div>
        </div>
      )}

      <Section>
        {items.map((it) => (
          <SettingsRow
            key={it.key}
            icon={it.icon}
            iconBg={it.iconBg}
            iconColor={it.iconColor}
            title={it.title}
            desc={it.desc}
            onClick={() => setLocation(it.href)}
          />
        ))}
      </Section>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/50 rounded-2xl px-4 py-3.5 flex items-center justify-center gap-2 font-bold text-sm hover:bg-red-100 dark:hover:bg-red-950/60 active:scale-[0.97] transition-[transform,background-color,border-color] duration-150 ease-out disabled:opacity-50"
      >
        <LogOut className="w-4 h-4" />
        {t.settings.logout}
      </button>

      <p className="text-center text-[11px] text-gray-300 dark:text-gray-600 pb-2">
        Hormang · {t.settings.version} 1.0.0
      </p>
    </SettingsPageShell>
  );
}
