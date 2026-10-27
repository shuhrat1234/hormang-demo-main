import { motion } from "framer-motion";
import { useLocation, useSearch, Link } from "wouter";
import { AuthBackButton } from "@/components/auth-back-button";
import { ShoppingBag, Briefcase, ArrowRight } from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";
import { getActiveReferralCode } from "@/lib/referral-store";

export default function RoleSelectPage() {
  const [, setLocation] = useLocation();
  const { t } = useI18n();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const returnTo = params.get("returnTo");
  const refCode = (params.get("ref") || getActiveReferralCode()).trim().toUpperCase();

  function pick(role: "buyer" | "provider") {
    const returnToQs = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
    const refQs = refCode ? `&ref=${encodeURIComponent(refCode)}` : "";
    setLocation(`/auth/register?role=${role}${returnToQs}${refQs}`);
  }

  function goLogin() {
    setLocation(returnTo ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}` : "/auth/login");
  }

  const options = [
    { role: "buyer" as const,    icon: ShoppingBag, title: t.auth.roleSelect.buyerTitle,    desc: t.auth.roleSelect.buyerDesc },
    { role: "provider" as const, icon: Briefcase,   title: t.auth.roleSelect.providerTitle, desc: t.auth.roleSelect.providerDesc },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pt-16 sm:pt-4 relative">
      <AuthBackButton />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <motion.div
            className="inline-flex items-center gap-2 mb-6 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setLocation("/")}
            style={{ background: "var(--brand-gradient)" }}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            Hormang
          </motion.div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-3">
            {t.auth.roleSelect.welcome}
          </h1>
          <p className="text-muted-foreground text-base">
            {t.auth.roleSelect.question}
          </p>
        </div>

        <div className="grid gap-4">
          {options.map(({ role, icon: Icon, title, desc }) => (
            <motion.button
              key={role}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => pick(role)}
              className="group w-full text-left p-6 rounded-2xl bg-card border-2 border-border hover:border-primary/60 hover:shadow-xl transition-all duration-250 flex items-start gap-4"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md group-hover:scale-110 transition-transform"
                style={{ background: "var(--brand-gradient)" }}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-foreground mb-1">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all mt-1 flex-shrink-0" />
            </motion.button>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          {t.auth.roleSelect.haveAccount}{" "}
          <button
            onClick={goLogin}
            className="font-bold text-primary hover:underline"
          >
            {t.auth.roleSelect.login}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
