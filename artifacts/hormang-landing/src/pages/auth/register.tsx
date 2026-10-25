import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useSearch, Link } from "wouter";
import { AuthBackButton } from "@/components/auth-back-button";
import { Phone, Loader2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { getActiveCategories, getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { tFormat, getAuthError } from "@/lib/i18n";
import { sendSmsCode, registerUser, saveProviderProfile, saveRegistrationSource } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";
import { recordReferralSignup, processReferralReward } from "@/lib/referral-store";
import logoImg from "/hormang-logo.png";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  if (digits.length <= 9) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 3)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}

type Step = "info" | "phone" | "otp" | "provider" | "survey";

function makeInfoSchema(t: ReturnType<typeof useI18n>["t"]) {
  return z.object({
    firstName: z.string().min(2, t.auth.register.firstNameMin),
    lastName: z.string().min(2, t.auth.register.lastNameMin),
    agreeTerms: z.literal(true, { errorMap: () => ({ message: t.auth.register.agreeRequired }) }),
  });
}

function makeProviderSchema(t: ReturnType<typeof useI18n>["t"]) {
  return z.object({
    categories: z.array(z.string()).min(1, t.auth.register.catsRequired),
    bio: z.string().max(300).optional(),
    preferredLocation: z.string().optional(),
  });
}

type InfoData = z.infer<ReturnType<typeof makeInfoSchema>>;
type ProviderData = z.infer<ReturnType<typeof makeProviderSchema>>;

function InfoForm({ onDone }: { role: "buyer" | "provider"; onDone: (d: InfoData) => void }) {
  const { t } = useI18n();
  const { register, handleSubmit, formState: { errors } } = useForm<InfoData>({
    resolver: zodResolver(makeInfoSchema(t)),
  });

  return (
    <form onSubmit={handleSubmit(onDone)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">{t.auth.register.firstName}</label>
          <input {...register("firstName")} placeholder={t.auth.register.firstNamePh}
            className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
          {errors.firstName && <p className="text-destructive text-xs mt-1">{errors.firstName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">{t.auth.register.lastName}</label>
          <input {...register("lastName")} placeholder={t.auth.register.lastNamePh}
            className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
          {errors.lastName && <p className="text-destructive text-xs mt-1">{errors.lastName.message}</p>}
        </div>
      </div>
      <div className="flex items-start gap-2">
        <input {...register("agreeTerms")} id="terms" type="checkbox"
          className="w-4 h-4 mt-0.5 rounded accent-primary border-border" />
        <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
          {t.auth.register.agreementBefore}
          <span className="text-primary font-semibold hover:underline">{t.auth.register.termsLink}</span>
          {t.auth.register.agreementConnector}
          <span className="text-primary font-semibold hover:underline">{t.auth.register.privacyLink}</span>
          {t.auth.register.agreementAfter}
        </label>
      </div>
      {errors.agreeTerms && <p className="text-destructive text-xs -mt-2">{errors.agreeTerms.message}</p>}
      <Button type="submit" className="w-full h-11 font-bold gap-2">
        {t.common.continue} <ChevronRight className="w-4 h-4" />
      </Button>
    </form>
  );
}

function ProviderForm({ onDone, onBack, loading }: { onDone: (d: ProviderData) => void; onBack: () => void; loading: boolean }) {
  const { t, locale } = useI18n();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ProviderData>({
    resolver: zodResolver(makeProviderSchema(t)),
    defaultValues: { categories: [] },
  });

  const selected = watch("categories") ?? [];
  // Canonical service categories (ID-based). Display name is resolved from the
  // active locale so renames in admin propagate instantly.
  const SERVICE_CATEGORIES = getActiveCategories();

  function toggleCat(id: string) {
    if (selected.includes(id)) {
      setValue("categories", selected.filter(c => c !== id));
    } else {
      setValue("categories", [...selected, id]);
    }
  }

  return (
    <form onSubmit={handleSubmit(onDone)} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">
          {t.auth.register.catsLabel} <span className="text-destructive">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SERVICE_CATEGORIES.map(cat => {
            const active = selected.includes(cat.id);
            const displayName = getCategoryDisplayName(cat.id, locale);
            return (
              <motion.button
                key={cat.id}
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => toggleCat(cat.id)}
                className={`text-xs px-3 py-2 rounded-xl font-semibold border-2 transition-all duration-200 flex items-center gap-1.5 ${active
                  ? "text-white border-transparent shadow-md"
                  : "bg-muted border-transparent text-muted-foreground hover:border-primary/30"}`}
                style={active ? { background: "var(--brand-gradient)" } : {}}
              >
                {active && <CheckCircle2 className="w-3 h-3" />}
                <CategoryIcon categoryId={cat.id} emoji={cat.emoji} size={14} bare className={active ? "text-white" : "text-gray-500"} />
                {displayName}
              </motion.button>
            );
          })}
        </div>
        {errors.categories && <p className="text-destructive text-xs mt-2">{errors.categories.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5">
          {t.auth.register.bioLabel} <span className="text-muted-foreground font-normal">({t.common.optional})</span>
        </label>
        <textarea {...register("bio")} rows={3}
          placeholder={t.auth.register.bioPlaceholder}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5">{t.auth.register.locationLabel} <span className="text-muted-foreground font-normal">({t.common.optional})</span></label>
        <input {...register("preferredLocation")} placeholder={t.auth.register.locationPlaceholder}
          className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all" />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack} className="h-11 px-5 border-2 font-semibold gap-1">
          <ChevronLeft className="w-4 h-4" /> {t.common.back}
        </Button>
        <Button type="submit" disabled={loading} className="flex-1 h-11 font-bold gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {loading ? t.auth.register.creatingProfile : t.auth.register.createProfile}
        </Button>
      </div>
    </form>
  );
}

interface SurveyOptionItem {
  id: "instagram" | "telegram" | "friends" | "ads" | "other";
  icon: string;
  bgActive: string;
  borderActive: string;
}

const SURVEY_OPTIONS: SurveyOptionItem[] = [
  { id: "instagram", icon: "📸", bgActive: "bg-pink-500/10", borderActive: "border-pink-500 ring-2 ring-pink-500/20" },
  { id: "telegram", icon: "✈️", bgActive: "bg-sky-500/10", borderActive: "border-sky-500 ring-2 ring-sky-500/20" },
  { id: "friends", icon: "👥", bgActive: "bg-emerald-500/10", borderActive: "border-emerald-500 ring-2 ring-emerald-500/20" },
  { id: "ads", icon: "🌐", bgActive: "bg-amber-500/10", borderActive: "border-amber-500 ring-2 ring-amber-500/20" },
  { id: "other", icon: "💬", bgActive: "bg-purple-500/10", borderActive: "border-purple-500 ring-2 ring-purple-500/20" },
];

function SurveyForm({
  onDone,
  onSkip,
  loading,
}: {
  onDone: (source: string) => void;
  onSkip: () => void;
  loading: boolean;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      onSkip();
      return;
    }
    if (selected === "other") {
      const text = otherText.trim();
      onDone(text ? `other: ${text}` : "other");
    } else {
      onDone(selected);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2.5">
        {SURVEY_OPTIONS.map((opt) => {
          const isSelected = selected === opt.id;
          const label = t.auth.register.surveyOptions[opt.id];
          return (
            <motion.div
              key={opt.id}
              whileTap={{ scale: 0.99 }}
              onClick={() => setSelected(opt.id)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                isSelected
                  ? `${opt.bgActive} ${opt.borderActive} shadow-sm`
                  : "bg-card border-border hover:border-primary/40 hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl select-none">{opt.icon}</span>
                <span className={`text-sm font-semibold ${isSelected ? "text-foreground font-bold" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </div>
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isSelected ? "border-primary bg-primary text-white" : "border-muted-foreground/30"
                }`}
              >
                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </motion.div>
          );
        })}
      </div>

      {selected === "other" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
          className="pt-1"
        >
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder={t.auth.register.surveyOtherPlaceholder}
            className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            autoFocus
          />
        </motion.div>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          disabled={loading}
          className="h-11 px-4 text-muted-foreground hover:text-foreground font-semibold"
        >
          {t.auth.register.surveySkip}
        </Button>
        <Button
          type="submit"
          disabled={loading || !selected}
          className="flex-1 h-11 font-bold gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {loading ? t.auth.register.surveySaving : t.auth.register.surveyFinish}
        </Button>
      </div>
    </form>
  );
}

export default function RegisterPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const role = (params.get("role") ?? "buyer") as "buyer" | "provider";
  const refCode = params.get("ref") ?? "";
  const returnTo = params.get("returnTo");
  const [, setLocation] = useLocation();
  const { setAuth, user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();

  function afterAuthRedirect() {
    setLocation(returnTo ? decodeURIComponent(returnTo) : "/dashboard");
  }

  const [step, setStep] = useState<Step>("info");
  const [infoData, setInfoData] = useState<InfoData | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [serverError, setServerError] = useState("");
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

  const stepsForRole: Step[] = role === "provider"
    ? ["info", "phone", "otp", "provider", "survey"]
    : ["info", "phone", "otp", "survey"];

  async function handleSendCode() {
    setServerError("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setServerError(t.auth.shared.invalidPhoneLong);
      return;
    }
    setLoading(true);
    try {
      const res = await sendSmsCode(getFullPhone(), "register");
      setDevCode(res.devCode ?? null);
      setStep("otp");
      startResendTimer();
    } catch (err: unknown) {
      setServerError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return;
    setServerError("");
    setOtp("");
    setLoading(true);
    try {
      const res = await sendSmsCode(getFullPhone(), "register");
      setDevCode(res.devCode ?? null);
      startResendTimer();
      toast({ title: t.common.newCodeSent });
    } catch (err: unknown) {
      setServerError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndRegister() {
    if (!infoData) return;
    setServerError("");
    if (otp.length < 4) {
      setServerError(t.auth.shared.invalidOtp);
      return;
    }
    setLoading(true);
    try {
      const res = await registerUser({
        firstName: infoData.firstName,
        lastName: infoData.lastName,
        phone: getFullPhone(),
        otp,
        role,
      });

      if (role === "buyer") {
        setAuth(res.user, null);
        if (refCode) recordReferralSignup(refCode, res.user.id);
        toast({ title: tFormat(t.auth.register.welcomeBuyerTpl, { name: res.user.firstName }) });
        setStep("survey");
      } else {
        setAuth(res.user, null);
        if (refCode) recordReferralSignup(refCode, res.user.id);
        setStep("provider");
      }
    } catch (err: unknown) {
      setServerError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally {
      setLoading(false);
    }
  }

  async function handleProviderDone(data: ProviderData) {
    setLoading(true);
    setServerError("");
    try {
      const { profile } = await saveProviderProfile({
        categories: data.categories,
        bio: data.bio,
        preferredLocation: data.preferredLocation,
      });
      setAuth(user!, profile);
      processReferralReward(user!.id);
      toast({ title: tFormat(t.auth.register.welcomeProviderTpl, { name: user?.firstName ?? "" }) });
      setStep("survey");
    } catch (err: unknown) {
      setServerError(getAuthError(err instanceof Error ? err.message : "", t));
    } finally {
      setLoading(false);
    }
  }

  async function handleSurveyDone(source: string) {
    if (source) {
      setLoading(true);
      try {
        await saveRegistrationSource(source);
      } catch (err) {
        console.error("Save registration source failed:", err);
      } finally {
        setLoading(false);
      }
    }
    afterAuthRedirect();
  }

  function handleSurveySkip() {
    afterAuthRedirect();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pt-16 sm:pt-4 relative">
      <AuthBackButton />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-7">
          <div className="flex justify-center mb-3">
            <Link href="/" title={t.dashboard.backHome} className="cursor-pointer hover:opacity-90 transition-opacity">
              <img src={logoImg} alt="Hormang" className="w-14 h-14 object-contain drop-shadow-md" />
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 mb-4">
            {stepsForRole.map((s, i) => (
              <div
                key={s}
                className="h-1.5 rounded-full transition-all duration-400"
                style={{
                  width: s === step ? 32 : 16,
                  background: i <= stepsForRole.indexOf(step) ? "var(--brand-gradient)" : undefined,
                  backgroundColor: i > stepsForRole.indexOf(step) ? "var(--muted)" : undefined,
                }}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              {stepsForRole.indexOf(step) + 1}/{stepsForRole.length}
            </span>
          </div>

          <h1 className="text-2xl font-display font-bold text-foreground mb-1">
            {step === "info" && t.auth.register.titleInfo}
            {step === "phone" && t.auth.register.titlePhone}
            {step === "otp" && t.auth.register.titleOtp}
            {step === "provider" && t.auth.register.titleProvider}
            {step === "survey" && t.auth.register.titleSurvey}
          </h1>
          <p className="text-muted-foreground text-sm">
            {step === "info" && t.auth.register.descInfo}
            {step === "phone" && t.auth.register.descPhone}
            {step === "otp" && tFormat(t.auth.register.sentToTpl, { phone })}
            {step === "provider" && t.auth.register.descProvider}
            {step === "survey" && t.auth.register.descSurvey}
          </p>
        </div>

        {serverError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl px-4 py-3 mb-4 flex items-center gap-2"
          >
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {serverError}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {step === "info" && (
            <motion.div key="info" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <InfoForm role={role} onDone={data => { setInfoData(data); setStep("phone"); }} />
            </motion.div>
          )}

          {step === "phone" && (
            <motion.div key="phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  <Phone className="w-3.5 h-3.5 inline mr-1.5 text-primary" />
                  {t.auth.shared.phoneLabel}
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
                <Button type="button" variant="outline" onClick={() => setStep("info")} className="h-11 px-5 border-2 font-semibold gap-1">
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
                  onKeyDown={e => e.key === "Enter" && handleVerifyAndRegister()}
                  placeholder={t.auth.shared.otpPlaceholder}
                  maxLength={6}
                  className="w-full h-14 px-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-2xl font-bold tracking-[0.4em] text-center"
                  autoFocus
                />
              </div>
              <Button onClick={handleVerifyAndRegister} disabled={loading || otp.length < 4} className="w-full h-11 font-bold gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {loading ? (role === "buyer" ? t.auth.register.registeringBuyer : t.common.checking) : t.auth.register.submitOtp}
              </Button>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { setStep("phone"); setOtp(""); setDevCode(null); setServerError(""); }}
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

          {step === "provider" && (
            <motion.div key="provider" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <ProviderForm onDone={handleProviderDone} onBack={() => setStep("otp")} loading={loading} />
            </motion.div>
          )}

          {step === "survey" && (
            <motion.div key="survey" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <SurveyForm onDone={handleSurveyDone} onSkip={handleSurveySkip} loading={loading} />
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t.auth.register.haveAccount}{" "}
          <button onClick={() => setLocation(returnTo ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}` : "/auth/login")} className="font-bold text-primary hover:underline">
            {t.auth.register.login}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
