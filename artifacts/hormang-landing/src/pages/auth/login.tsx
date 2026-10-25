import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useSearch, Link } from "wouter";
import { Phone, Mail, ArrowRight, Loader2, LogIn, ChevronLeft, RefreshCw, Lock, ShieldCheck, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthBackButton } from "@/components/auth-back-button";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat, getAuthError } from "@/lib/i18n";
import { sendSmsCode, sendEmailCode, loginUser, loginWithEmailCode, verifyLogin2FA, type LoginChallenge } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import logoImg from "/hormang-logo.png";

type Step = "phone" | "otp" | "email" | "twofa";
type Mode = "phone" | "email";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  if (digits.length <= 9) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const returnTo = new URLSearchParams(useSearch()).get("returnTo");

  function afterAuthRedirect() {
    setLocation(returnTo ? decodeURIComponent(returnTo) : "/dashboard");
  }

  const [mode, setMode] = useState<Mode>("phone");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [emailValue, setEmailValue] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [twoFACode, setTwoFACode] = useState("");
  // When a phone-login code was actually routed to a verified email instead of
  // SMS (see /auth/sms/send), this tracks that so the UI can say so.
  const [otpEmailDest, setOtpEmailDest] = useState<string | null>(null);

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

  async function handleSendCode() {
    setError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setError(t.auth.shared.invalidPhone);
      return;
    }
    setLoading(true);
    try {
      const res = await sendSmsCode(getFullPhone(), "login");
      setDevCode(res.devCode ?? null);
      const sentToEmail = res.channel === "email" ? (res.maskedDestination ?? null) : null;
      setOtpEmailDest(sentToEmail);
      setStep("otp");
      startResendTimer();
      toast({ title: sentToEmail ? tFormat(t.common.codeSentEmailTpl, { email: sentToEmail }) : t.common.codeSent });
    } catch (err: unknown) {
      const msg = getAuthError(err instanceof Error ? err.message : "", t);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    setError("");
    if (otp.length < 4) {
      setError(t.auth.shared.invalidOtp);
      return;
    }
    setLoading(true);
    try {
      const res = mode === "phone"
        ? await loginUser({ phone: getFullPhone(), otp })
        : await loginWithEmailCode({ email: emailValue, otp });
      if ("needs2FA" in res) {
        setChallenge(res);
        setDevCode(null);
        setTwoFACode("");
        setOtp("");
        setStep("twofa");
      } else {
        setAuth(res.user, res.providerProfile ?? null);
        toast({ title: tFormat(t.auth.login.welcomeTpl, { name: res.user.firstName }) });
        afterAuthRedirect();
      }
    } catch (err: unknown) {
      const msg = getAuthError(err instanceof Error ? err.message : "", t);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmailCode() {
    setError("");
    if (!emailValue.trim()) {
      setError(t.common.errorGeneric);
      return;
    }
    setLoading(true);
    try {
      const res = await sendEmailCode(emailValue, "login-email");
      setDevCode(res.devCode ?? null);
      setStep("otp");
      startResendTimer();
      toast({ title: t.common.codeSent });
    } catch (err: unknown) {
      setError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally { setLoading(false); }
  }

  async function handleVerify2FA() {
    if (!challenge || !twoFACode.trim()) return;
    setError(""); setLoading(true);
    try {
      const res = await verifyLogin2FA({ challengeId: challenge.challengeId, otp: twoFACode });
      setAuth(res.user, res.providerProfile ?? null);
      toast({ title: tFormat(t.auth.login.welcomeTpl, { name: res.user.firstName }) });
      afterAuthRedirect();
    } catch (err) {
      setError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally { setLoading(false); }
  }

  async function handleResend() {
    if (resendTimer > 0) return;
    setError("");
    setOtp("");
    setLoading(true);
    try {
      if (mode === "phone") {
        const res = await sendSmsCode(getFullPhone(), "login");
        setDevCode(res.devCode ?? null);
        setOtpEmailDest(res.channel === "email" ? (res.maskedDestination ?? null) : null);
      } else {
        const res = await sendEmailCode(emailValue, "login-email");
        setDevCode(res.devCode ?? null);
      }
      startResendTimer();
      toast({ title: t.common.newCodeSent });
    } catch (err: unknown) {
      const msg = getAuthError(err instanceof Error ? err.message : "", t);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleForceSms() {
    setError("");
    setOtp("");
    setLoading(true);
    try {
      const res = await sendSmsCode(getFullPhone(), "login", true);
      setDevCode(res.devCode ?? null);
      setOtpEmailDest(null);
      startResendTimer();
      toast({ title: t.common.codeSent });
    } catch (err: unknown) {
      const msg = getAuthError(err instanceof Error ? err.message : "", t);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

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
          <motion.div
            whileHover={{ scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="flex justify-center mb-3"
          >
            <Link href="/" title={t.dashboard.backHome} className="cursor-pointer">
              <img src={logoImg} alt="Hormang" className="w-24 h-24 object-contain drop-shadow-lg" />
            </Link>
          </motion.div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-1">{t.auth.login.title}</h1>
          <p className="text-muted-foreground text-sm">
            {step === "phone" ? t.auth.login.enterPhone
              : step === "email" ? t.auth.login.enterEmailLogin
              : step === "twofa" ? t.auth.twoFA.codeLabel
              : mode === "phone" && otpEmailDest ? tFormat(t.common.codeSentEmailTpl, { email: otpEmailDest })
              : mode === "phone" ? tFormat(t.auth.shared.sentToTpl, { phone })
              : tFormat(t.auth.login.sentToEmailTpl, { email: emailValue })}
          </p>
        </div>

        {(step === "phone" || step === "email") && (
          <div className="flex bg-muted rounded-xl p-1 mb-4">
            <button
              type="button"
              onClick={() => { setMode("phone"); setStep("phone"); setError(""); setOtpEmailDest(null); }}
              className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${mode === "phone" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <Phone className="w-3.5 h-3.5" /> {t.auth.shared.phoneLabel}
            </button>
            <button
              type="button"
              onClick={() => { setMode("email"); setStep("email"); setError(""); }}
              className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${mode === "email" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </button>
          </div>
        )}

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
          {step === "phone" && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  <Phone className="w-3.5 h-3.5 inline mr-1.5 text-primary" />
                  {t.auth.shared.phoneLabel}
                </label>
                <div className="flex items-center gap-0">
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
                    className="flex-1 h-11 px-4 rounded-r-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                onClick={handleSendCode}
                disabled={loading}
                className="w-full h-11 font-bold text-sm gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {loading ? t.common.sending : t.auth.shared.sendCode}
              </Button>

              <p className="text-center text-xs text-muted-foreground pt-1">
                {t.auth.shared.smsHint}
              </p>
            </motion.div>
          )}

          {step === "email" && (
            <motion.div
              key="email"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  <Mail className="w-3.5 h-3.5 inline mr-1.5 text-primary" /> Email
                </label>
                <input
                  type="email"
                  value={emailValue}
                  onChange={(e) => setEmailValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendEmailCode()}
                  placeholder="you@example.com"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                  autoFocus
                />
              </div>

              <Button
                onClick={handleSendEmailCode}
                disabled={loading}
                className="w-full h-11 font-bold text-sm gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {loading ? t.common.sending : t.auth.shared.sendCode}
              </Button>
            </motion.div>
          )}

          {step === "twofa" && (
            <motion.div
              key="twofa"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-3 bg-primary/8 border border-primary/15 rounded-xl px-4 py-3">
                <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
                <p className="text-sm text-foreground font-medium">{t.security.rows.twoFA.title}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  <Lock className="w-3.5 h-3.5 inline mr-1.5 text-primary" />
                  {t.auth.twoFA.codeLabel}
                </label>
                <input
                  type="password"
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify2FA()}
                  placeholder={t.auth.twoFA.codePlaceholder}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-sm"
                  autoFocus
                />
                {challenge?.hint && (
                  <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" />
                    <span><span className="font-semibold">{t.auth.twoFA.hintLabel}:</span> {challenge.hint}</span>
                  </p>
                )}
              </div>

              <Button onClick={handleVerify2FA} disabled={loading || !twoFACode.trim()} className="w-full h-11 font-bold text-sm gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {loading ? t.common.checking : t.auth.login.submit}
              </Button>

              <div className="flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => { setStep(mode === "phone" ? "phone" : "email"); setTwoFACode(""); setOtp(""); setChallenge(null); setError(""); }}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> {t.common.back}
                </button>
              </div>
            </motion.div>
          )}

          {step === "otp" && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {devCode && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-700 font-semibold mb-0.5">{t.common.demoSmsTitle}</p>
                  <p className="text-amber-900 font-bold text-lg tracking-[0.3em]">{devCode}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  {t.auth.shared.otpLabel}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
                  placeholder={t.auth.shared.otpPlaceholder}
                  maxLength={6}
                  className="w-full h-14 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-2xl font-bold tracking-[0.4em] text-center"
                  autoFocus
                />
              </div>

              <Button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 4}
                className="w-full h-11 font-bold text-sm gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {loading ? t.common.checking : t.auth.login.submit}
              </Button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setStep(mode === "phone" ? "phone" : "email"); setOtp(""); setDevCode(null); setError(""); }}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> {mode === "phone" ? t.common.changePhone : t.common.changeEmailShort}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendTimer > 0}
                  className="text-sm text-primary hover:underline flex items-center gap-1.5 disabled:opacity-50 disabled:no-underline transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {resendTimer > 0 ? `${resendTimer}s` : t.common.resend}
                </button>
              </div>

              {otpEmailDest && (
                <button
                  type="button"
                  onClick={handleForceSms}
                  disabled={loading}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  {t.common.noInboxAccessSendSms}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t.auth.login.notRegistered}{" "}
          <button
            onClick={() => setLocation(returnTo ? `/auth/role?returnTo=${encodeURIComponent(returnTo)}` : "/auth/role")}
            className="font-bold text-primary hover:underline"
          >
            {t.auth.login.register}
          </button>
        </p>

        <p className="text-center text-xs text-muted-foreground mt-3">
          {t.auth.login.legacyAccount}{" "}
          <button
            onClick={() => setLocation("/auth/migrate")}
            className="font-medium text-muted-foreground hover:text-primary hover:underline transition-colors"
          >
            {t.auth.login.migrate}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
