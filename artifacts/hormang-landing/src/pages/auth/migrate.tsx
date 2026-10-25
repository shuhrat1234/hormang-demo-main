import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Link } from "wouter";
import { AuthBackButton } from "@/components/auth-back-button";
import { Mail, Phone, Loader2, ArrowRight, ChevronLeft, RefreshCw, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat, getAuthError } from "@/lib/i18n";
import { sendSmsCode, migrateAccount } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import logoImg from "/hormang-logo.png";

type Step = "credentials" | "phone" | "otp" | "done";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}

export default function MigratePage() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  function getFullPhone() {
    return "+998" + phone.replace(/\D/g, "");
  }

  function startResendTimer() {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function handleCredentialsContinue() {
    setError("");
    if (!email.includes("@")) { setError(t.auth.migrate.invalidEmail); return; }
    if (!password) { setError(t.auth.migrate.enterPassword); return; }
    setStep("phone");
  }

  async function handleSendCode() {
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setError(t.auth.shared.invalidPhone);
      return;
    }
    setLoading(true);
    try {
      const res = await sendSmsCode(getFullPhone(), "migrate");
      setDevCode(res.devCode ?? null);
      setStep("otp");
      startResendTimer();
    } catch (err: unknown) {
      setError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return;
    setError("");
    setOtp("");
    setLoading(true);
    try {
      const res = await sendSmsCode(getFullPhone(), "migrate");
      setDevCode(res.devCode ?? null);
      startResendTimer();
    } catch (err: unknown) {
      setError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally {
      setLoading(false);
    }
  }

  async function handleMigrate() {
    setError("");
    if (otp.length < 6) { setError(t.auth.shared.invalidOtp); return; }
    setLoading(true);
    try {
      const res = await migrateAccount({
        email,
        password,
        phone: getFullPhone(),
        otp,
      });
      setAuth(res.user, res.providerProfile ?? null);
      toast({ title: tFormat(t.auth.migrate.successTpl, { name: res.user.firstName }) });
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally {
      setLoading(false);
    }
  }

  const steps: Step[] = ["credentials", "phone", "otp"];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pt-16 sm:pt-4 relative">
      <AuthBackButton />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <Link href="/" title={t.dashboard.backHome} className="cursor-pointer hover:opacity-90 transition-opacity">
              <img src={logoImg} alt="Hormang" className="w-20 h-20 object-contain drop-shadow-lg" />
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mb-4">
            {steps.map((s, i) => (
              <div
                key={s}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: s === step ? 28 : 14,
                  background: i <= steps.indexOf(step) ? "var(--brand-gradient)" : undefined,
                  backgroundColor: i > steps.indexOf(step) ? "var(--muted)" : undefined,
                }}
              />
            ))}
          </div>

          <h1 className="text-2xl font-display font-bold text-foreground mb-1">
            {t.auth.migrate.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {step === "credentials" && t.auth.migrate.descCredentials}
            {step === "phone" && t.auth.migrate.descPhone}
            {step === "otp" && tFormat(t.auth.migrate.sentToTpl, { phone })}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5">
          <p className="text-blue-700 text-xs leading-relaxed">
            {t.auth.migrate.notice}
          </p>
        </div>

        {error && (
          <motion.div
            key={error}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl px-4 py-3 mb-4"
          >
            {error}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {step === "credentials" && (
            <motion.div key="cred" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  <Mail className="w-3.5 h-3.5 inline mr-1.5 text-primary" />
                  {t.auth.migrate.emailLabel}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">{t.auth.migrate.passwordLabel}</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCredentialsContinue()}
                    placeholder={t.auth.migrate.passwordPh}
                    className="w-full h-11 px-4 pr-11 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button onClick={handleCredentialsContinue} className="w-full h-11 font-bold gap-2">
                {t.common.continue} <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {step === "phone" && (
            <motion.div key="phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  <Phone className="w-3.5 h-3.5 inline mr-1.5 text-primary" />
                  {t.auth.migrate.newPhoneLabel}
                </label>
                <div className="flex items-center">
                  <span className="h-11 px-3 flex items-center rounded-l-xl border border-r-0 border-border bg-muted text-sm font-semibold text-muted-foreground select-none">
                    +998
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(formatPhone(e.target.value))}
                    onKeyDown={e => e.key === "Enter" && handleSendCode()}
                    placeholder={t.auth.shared.phonePlaceholder}
                    maxLength={12}
                    className="flex-1 h-11 px-4 rounded-r-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep("credentials")} className="h-11 px-5 border-2 font-semibold gap-1">
                  <ChevronLeft className="w-4 h-4" /> {t.common.back}
                </Button>
                <Button onClick={handleSendCode} disabled={loading} className="flex-1 h-11 font-bold gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {loading ? t.common.sending : t.auth.shared.sendCodeShort}
                </Button>
              </div>
            </motion.div>
          )}

          {step === "otp" && (
            <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-4">
              {devCode && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-700 font-semibold mb-0.5">{t.common.demoSmsTitle}</p>
                  <p className="text-amber-900 font-bold text-lg tracking-[0.3em]">{devCode}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">{t.auth.shared.otpLabel}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => e.key === "Enter" && handleMigrate()}
                  placeholder={t.auth.shared.otpPlaceholder}
                  maxLength={6}
                  className="w-full h-14 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-2xl font-bold tracking-[0.4em] text-center"
                  autoFocus
                />
              </div>
              <Button onClick={handleMigrate} disabled={loading || otp.length < 6} className="w-full h-11 font-bold gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {loading ? t.auth.migrate.submitting : t.auth.migrate.submit}
              </Button>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { setStep("phone"); setOtp(""); setDevCode(null); }}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> {t.common.changePhone}
                </button>
                <button type="button" onClick={handleResend} disabled={resendTimer > 0}
                  className="text-sm text-primary hover:underline flex items-center gap-1.5 disabled:opacity-50 transition-all">
                  <RefreshCw className="w-3.5 h-3.5" />
                  {resendTimer > 0 ? `${resendTimer}s` : t.common.resend}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t.auth.migrate.newUser}{" "}
          <button onClick={() => setLocation("/auth/login")} className="font-bold text-primary hover:underline">
            {t.auth.migrate.login}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
