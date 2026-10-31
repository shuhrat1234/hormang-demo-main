import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquareText, ChevronDown, Mail, Send, Copy, Check,
  FileText, ScrollText, FileCheck2,
  HeartHandshake, ShieldCheck, Scale, AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";
import { SettingsPageShell } from "@/components/settings/page-shell";
import { Section } from "@/components/settings/section";
import { SettingsRow } from "@/components/settings/settings-row";
import { faqItems, guidelineItems } from "@/data/faq";
import { getLocalizedText } from "@/lib/localization";

export default function HelpSettingsPage() {
  const { t, locale } = useI18n();
  const [, setLocation] = useLocation();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, key: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  function comingSoon() {
    alert(t.help.soon);
  }

  return (
    <SettingsPageShell title={t.help.title} subtitle={t.help.subtitle}>
      <Section title={t.help.sectionFeedback}>
        <SettingsRow
          icon={MessageSquareText}
          iconBg="hsl(262, 80%, 96%)"
          iconColor="hsl(262, 80%, 54%)"
          title={t.help.feedback.title}
          desc={t.help.feedback.desc}
          onClick={() => setLocation("/feedback")}
        />
      </Section>

      <Section title={t.help.sectionFAQ}>
        {faqItems.map((item, i) => {
          const open = openIdx === i;
          const panelId = `faq-panel-${i}`;
          const buttonId = `faq-button-${i}`;
          const question = getLocalizedText(item.question, locale);
          const answer = getLocalizedText(item.answer, locale);
          return (
            <div key={item.id}>
              <button
                id={buttonId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIdx(open ? null : i)}
                className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-[hsl(var(--surface-2))] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 dark:text-[hsl(var(--text-primary))]">
                    {question}
                  </p>
                </div>
                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 -mt-1 text-xs text-gray-600 dark:text-[hsl(var(--text-secondary))] leading-relaxed">
                      {answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </Section>

      <Section title={t.help.sectionContact}>
        <SettingsRow
          icon={Mail}
          iconBg="hsl(213, 100%, 96%)"
          iconColor="hsl(221, 78%, 48%)"
          title={t.help.contact.email}
          desc="support@hormang.co.uz"
          right={
            <button
              onClick={() => copy("support@hormang.co.uz", "email")}
              className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-[hsl(var(--surface-3))] text-gray-700 dark:text-gray-300 text-[11px] font-bold flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-[hsl(var(--surface-2))] transition-colors"
            >
              {copied === "email" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copied === "email" ? t.help.contact.copied : t.help.contact.copy}
            </button>
          }
        />
        <SettingsRow
          icon={Send}
          iconBg="hsl(199, 89%, 95%)"
          iconColor="hsl(199, 89%, 48%)"
          title={t.help.contact.telegram}
          desc="@hormang_web_bot"
          right={
            <button
              onClick={() => copy("https://t.me/hormang_web_bot", "tg")}
              className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-[hsl(var(--surface-3))] text-gray-700 dark:text-gray-300 text-[11px] font-bold flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-[hsl(var(--surface-2))] transition-colors"
            >
              {copied === "tg" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copied === "tg" ? t.help.contact.copied : t.help.contact.copy}
            </button>
          }
        />
      </Section>

      <Section title={t.help.sectionGuidelines}>
        {guidelineItems.map((item) => {
          const iconMap: Record<string, { Icon: LucideIcon; bg: string; color: string }> = {
            respect:    { Icon: HeartHandshake, bg: "bg-rose-50 dark:bg-rose-950/40",    color: "text-rose-500 dark:text-rose-400" },
            no_fraud:   { Icon: ShieldCheck,    bg: "bg-emerald-50 dark:bg-emerald-950/40", color: "text-emerald-600 dark:text-emerald-400" },
            no_threats: { Icon: Scale,          bg: "bg-violet-50 dark:bg-violet-950/40", color: "text-violet-600 dark:text-violet-400" },
          };
          const { Icon, bg, color } = iconMap[item.id] ?? { Icon: HeartHandshake, bg: "bg-gray-50", color: "text-gray-500" };
          return (
            <div key={item.id} className="px-4 py-3 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-xl ${bg} ${color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-[hsl(var(--text-primary))]">
                  {getLocalizedText(item.title, locale)}
                </p>
                <p className="text-xs text-gray-500 dark:text-[hsl(var(--text-tertiary))] mt-0.5 leading-snug">
                  {getLocalizedText(item.desc, locale)}
                </p>
              </div>
            </div>
          );
        })}
        <div className="mx-4 mb-3 mt-1 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-3 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
            {t.help.guidelinesWarning}
          </p>
        </div>
      </Section>

      <Section title={t.help.sectionLegal}>
        <SettingsRow
          icon={ScrollText}
          iconBg="hsl(215, 16%, 94%)"
          iconColor="hsl(215, 25%, 35%)"
          title={t.help.legal.terms}
          onClick={() => window.open(`/hormang-legal-${locale}.html#terms`, "_blank")}
        />
        <SettingsRow
          icon={FileCheck2}
          iconBg="hsl(215, 16%, 94%)"
          iconColor="hsl(215, 25%, 35%)"
          title={t.help.legal.privacy}
          onClick={() => window.open(`/hormang-legal-${locale}.html#privacy`, "_blank")}
        />
        <SettingsRow
          icon={FileText}
          iconBg="hsl(215, 16%, 94%)"
          iconColor="hsl(215, 25%, 35%)"
          title={t.help.legal.licenses}
          onClick={comingSoon}
        />
      </Section>
    </SettingsPageShell>
  );
}
