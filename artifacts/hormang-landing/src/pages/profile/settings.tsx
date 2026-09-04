/**
 * /profile/settings — Provider Profile Settings (Enhanced)
 *
 * Features:
 *   - Weighted dynamic completion % (photo 20, name 10, region 15,
 *     services 20, bio 20, experience 10, portfolio 5)
 *   - Public Profile Preview modal ("Profilimni ko'rish")
 *   - Portfolio with captions + drag-to-reorder
 *   - Debounced localStorage auto-save for bio/experience
 *   - Helper texts + "Add now" scroll anchors for missing items
 *   - Phone-migration modal
 */
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  ChevronLeft, Camera, Phone, Lock, CheckCircle2, AlertCircle,
  Save, Loader2, MapPin, Briefcase, ImagePlus, Star,
  X, ArrowRight, RefreshCw, ChevronDown, User, AlertTriangle,
  Eye, Zap, GripVertical, TrendingUp, Info,
} from "lucide-react";
import { PublicProfilePreviewModal } from "@/components/public-profile-preview-modal";
import logoImg from "/hormang-logo.png";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat, getAuthError } from "@/lib/i18n";
import { BottomNav } from "@/components/bottom-nav";
import { useToast } from "@/hooks/use-toast";
import { updateProfile, updateProviderProfile, sendSmsCode, addPhone, getProviderPublicProfile } from "@/lib/auth-client";
import { regionsList, getRegionLabel, getDistrictLabel } from "@/lib/regions";
import { getActiveCategories, getCategoryDisplayName, migrateCategoryValuesSafe } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import {
  getLocalProfile, saveLocalProfile, hasProviderAccess,
  getCompletionChecks, getCompletionPct,
  type LocalProfile, type PortfolioItem, type PortfolioAlbum, type ProviderServiceArea,
  emptyProviderServiceArea, isServiceAreaEmpty,
} from "@/lib/local-profile";
import { ProviderAreaSelector } from "@/components/provider-area-selector";
import { MediaUploadZone } from "@/components/media-upload";

/* ─── Theme constants ────────────────────────────────────────────── */
const VIOLET = "linear-gradient(135deg, hsl(262,80%,54%) 0%, hsl(236,76%,60%) 100%)";
const VIOLET_SOLID = "hsl(262,80%,54%)";

/* ─── Image compression ──────────────────────────────────────────── */
function compressDataUrl(dataUrl: string, maxWidth = 1024, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith("data:image")) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* ─── Debounce hook ──────────────────────────────────────────────── */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

/* ─── Circular Progress ──────────────────────────────────────────── */
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
/* ─── Field wrapper ──────────────────────────────────────────────── */
function Field({ label, required, children, hint, error, boost }: {
  label: string; required?: boolean; children: React.ReactNode;
  hint?: string; error?: string; boost?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {boost && !error && (
        <p className="flex items-center gap-1 text-[11px] text-violet-500 mt-1 font-semibold">
          <Zap className="w-3 h-3" />{boost}
        </p>
      )}
      {hint && !error && !boost && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-red-500 mt-1">
          <AlertCircle className="w-3 h-3" />{error}
        </p>
      )}
    </div>
  );
}

function inputCls() {
  return "w-full h-11 px-4 rounded-2xl border-2 border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition-colors";
}

/* ─── Section header ─────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, title, sub }: {
  icon: React.FC<{ className?: string }>; title: string; sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
      <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-violet-600" />
      </div>
      <div>
        <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════════
   ADD PHONE MODAL
   ════════════════════════════════════════════════════════════════════ */
function AddPhoneModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { setAuth, user, providerProfile } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const tt = t.misc;
  const [phone, setPhone]           = useState("");
  const [otp, setOtp]               = useState("");
  const [devCode, setDevCode]       = useState<string | null>(null);
  const [step, setStep]             = useState<"phone" | "otp">("phone");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  function formatPhone(raw: string) {
    const d = raw.replace(/\D/g, "");
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)} ${d.slice(3)}`;
    if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5)}`;
    return `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }

  function startTimer() {
    setResendTimer(60);
    const t = setInterval(() => setResendTimer((p) => { if (p <= 1) { clearInterval(t); return 0; } return p - 1; }), 1000);
  }

  async function sendCode() {
    setError("");
    if (phone.replace(/\D/g, "").length < 9) { setError(tt.correctNumber); return; }
    setLoading(true);
    try {
      const res = await sendSmsCode("+998" + phone.replace(/\D/g, ""), "add-phone");
      setDevCode(res.devCode ?? null);
      setStep("otp");
      startTimer();
    } catch (e: unknown) { setError(getAuthError(e instanceof Error ? e.message : "", t)); }
    finally { setLoading(false); }
  }

  async function verify() {
    setError("");
    if (otp.length < 6) { setError(tt.enter6DigitCode); return; }
    setLoading(true);
    try {
      const res = await addPhone({ phone: "+998" + phone.replace(/\D/g, ""), otp });
      setAuth(res.user, providerProfile);
      toast({ title: tt.phoneAddedOk });
      onSuccess();
    } catch (e: unknown) { setError(getAuthError(e instanceof Error ? e.message : "", t)); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="font-extrabold text-gray-900 text-lg mb-1">{tt.addPhoneTitle}</h3>
        <p className="text-gray-500 text-sm mb-4">
          {step === "phone" ? tt.enterNumberSendSms : tFormat(tt.codeSentToTpl, { phone })}
        </p>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2 mb-4">{error}</div>}
        <AnimatePresence mode="wait">
          {step === "phone" && (
            <motion.div key="ph" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex">
                <span className="h-11 px-3 flex items-center rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 text-sm font-semibold text-gray-500">+998</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && sendCode()} placeholder="90 123 45 67" maxLength={12} autoFocus
                  className="flex-1 h-11 px-4 rounded-r-xl border border-gray-200 bg-white text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20" />
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 h-10 rounded-xl border-2 border-gray-200 font-semibold text-sm text-gray-600 hover:bg-gray-50">{t.misc.cancel}</button>
                <button onClick={sendCode} disabled={loading}
                  className="flex-1 h-10 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-1"
                  style={{ background: VIOLET }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {t.misc.send}
                </button>
              </div>
            </motion.div>
          )}
          {step === "otp" && (
            <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {devCode && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <p className="text-xs text-amber-700 font-semibold mb-0.5">Demo kod</p>
                  <p className="text-amber-900 font-bold tracking-[0.3em]">{devCode}</p>
                </div>
              )}
              <input type="text" inputMode="numeric" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && verify()}
                placeholder="000000" maxLength={6} autoFocus
                className="w-full h-14 text-center text-2xl font-bold tracking-[0.4em] border border-gray-200 rounded-xl focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20" />
              <button onClick={verify} disabled={loading || otp.length < 6}
                className="w-full h-10 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-1 disabled:opacity-60"
                style={{ background: VIOLET }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t.misc.confirm}
              </button>
              <div className="flex justify-between">
                <button onClick={() => { setStep("phone"); setOtp(""); setDevCode(null); }}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <ChevronLeft className="w-3.5 h-3.5" /> {t.misc.changeNumber}
                </button>
                <button onClick={() => { if (resendTimer > 0) return; sendCode(); }} disabled={resendTimer > 0}
                  className="text-xs text-violet-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                  <RefreshCw className="w-3 h-3" />
                  {resendTimer > 0 ? `${resendTimer}s` : t.misc.resend}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
export default function ProfileSettingsPage() {
  const { user, providerProfile, setAuth, setProviderProfile, activeRole, loading } = useAuth();
  const { toast } = useToast();
  const { t, locale } = useI18n();
  const tt = t.misc;
  const [, setLocation] = useLocation();

  /* Welcome banner for new providers */
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(() =>
    sessionStorage.getItem("justBecameProvider") === "1"
  );
  function dismissBanner() {
    sessionStorage.removeItem("justBecameProvider");
    setShowWelcomeBanner(false);
  }

  /* ── Save guard ref: tracks the "authorized user ID" for all saves.
   * Updated synchronously (useLayoutEffect) on every user.id change so that
   * stale closures captured by persistLocal or handleSave can be detected and
   * blocked before they write to the wrong user's localStorage key. */
  const saveGuardRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    saveGuardRef.current = user?.id ?? null;
  }, [user?.id]);

  /* Local profile state */
  const [local, setLocal] = useState<LocalProfile>({});

  /* Form fields */
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [region, setRegion]         = useState("");
  const [district, setDistrict]     = useState("");
  const [serviceAreaV2, setServiceAreaV2] = useState<ProviderServiceArea>(emptyProviderServiceArea());
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [bio, setBio]               = useState("");
  const [showAreaInfo, setShowAreaInfo] = useState(false);

  /* ── Consolidated init effect ─────────────────────────────────────
   * useLayoutEffect (not useEffect) so this runs synchronously before the
   * browser paints and — critically — before any useEffect (including the
   * persistLocal auto-save) fires. Without this, persistLocal fires on the
   * first render with selectedServices=[] and clears local.categories before
   * the categories from providerProfile have a chance to load, causing the
   * category chips in profile/settings to appear empty even when the provider
   * already selected one during the "Become Provider" flow. */
  useLayoutEffect(() => {
    if (!user) {
      setLocal({});
      setPhotoUrl(undefined);
      setAlbums([]);
      setFirstName("");
      setLastName("");
      setBio("");
      setSelectedServices([]);
      setRegion("");
      setDistrict("");
      setServiceAreaV2(emptyProviderServiceArea());
      setExperience("");
      return;
    }

    const loaded = getLocalProfile(user.id);
    console.log(
      `[Hormang] 🔍 loadProfile: user=${user.id.slice(0, 8)} bio=${!!loaded.bio} cats=${loaded.categories?.length ?? 0} portfolio=${loaded.portfolioItems?.length ?? 0}`,
    );
    setLocal(loaded);
    setPhotoUrl(loaded.photoUrl);

    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setRegion(loaded.region ?? "");
    setDistrict(loaded.district ?? "");
    setServiceAreaV2(loaded.serviceAreaV2 ?? emptyProviderServiceArea());
    setExperience(loaded.experience !== undefined ? String(loaded.experience) : "");

    setAlbums(loaded.albums ?? []);

    /* Categories: server wins, local is authoritative fallback.
     * Stored values may be legacy translated names — migrateCategoryValuesSafe
     * maps known ones to canonical IDs and **preserves any unknowns as-is** so
     * pre-existing provider profiles never silently lose category data on load. */
    const raw = providerProfile?.categories?.length
      ? providerProfile.categories
      : (loaded.categories ?? []);
    if (raw.length) {
      if (!providerProfile?.categories?.length) {
        console.log(`[Hormang] 📦 categories — local fallback: ${raw.join(", ")}`);
      }
      setSelectedServices(migrateCategoryValuesSafe(raw));
    } else {
      setSelectedServices([]);
    }

    /* Bio: same logic — server wins, local is authoritative fallback. */
    if (providerProfile?.bio?.trim()) {
      setBio(providerProfile.bio);
    } else if (loaded.bio?.trim()) {
      console.log("[Hormang] 📦 bio — local fallback");
      setBio(loaded.bio);
    } else {
      setBio("");
    }
  }, [user?.id, providerProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Photo */
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl]   = useState<string | undefined>(undefined);
  const [photoLoading, setPhotoLoading] = useState(false);

  function handlePhotoRemove() {
    if (!user) return;
    setPhotoUrl(undefined);
    const currentLocal = getLocalProfile(user.id);
    saveLocalProfile(user.id, { ...currentLocal, photoUrl: undefined });
    updateProviderProfile({ photoUrl: null }).catch((err) => {
      console.warn("[Hormang] Background photo remove warning:", err);
    });
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setPhotoLoading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const newPhotoUrl = await compressDataUrl(raw, 512, 0.80);
      setPhotoUrl(newPhotoUrl);
      setPhotoLoading(false);
      const currentLocal = getLocalProfile(user.id);
      saveLocalProfile(user.id, { ...currentLocal, photoUrl: newPhotoUrl });
      updateProviderProfile({ photoUrl: newPhotoUrl }).catch((err) => {
        console.warn("[Hormang] Background photo save warning:", err);
      });
      console.log(`[Hormang] 📷 Photo saved (user=${user.id.slice(0, 8)})`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  /* ── Portfolio albums ── */
  const [albums, setAlbums] = useState<PortfolioAlbum[]>([]);
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);

  function albumUid() { return Math.random().toString(36).slice(2, 10); }

  function persistAlbums(next: PortfolioAlbum[]) {
    if (!user) return;
    const currentLocal = getLocalProfile(user.id);
    saveLocalProfile(user.id, { ...currentLocal, albums: next, portfolioItems: next.flatMap((a) => a.photos).slice(0, 20) });
  }

  function addAlbum() {
    if (albums.length >= 10) return;
    const newAlbum: PortfolioAlbum = { id: albumUid(), title: `Album ${albums.length + 1}`, photos: [] };
    const next = [...albums, newAlbum];
    setAlbums(next);
    setExpandedAlbumId(newAlbum.id);
    persistAlbums(next);
  }

  function deleteAlbum(albumId: string) {
    const next = albums.filter((a) => a.id !== albumId);
    setAlbums(next);
    if (expandedAlbumId === albumId) setExpandedAlbumId(null);
    persistAlbums(next);
  }

  function renameAlbum(albumId: string, title: string) {
    const next = albums.map((a) => a.id === albumId ? { ...a, title } : a);
    setAlbums(next);
  }

  function updateAlbumPhotos(albumId: string, photos: PortfolioItem[]) {
    const next = albums.map((a) => a.id === albumId ? { ...a, photos } : a);
    setAlbums(next);
    persistAlbums(next);
  }

  /* ── Backfill from the real backend on mount ──────────────────────
   * The init effect above seeds form state synchronously from getLocalProfile()
   * (local draft, instant) but the real provider-profile fetch it also kicks
   * off is async — on a device with no local draft (e.g. editing from a new
   * phone) that fetch would resolve too late for the sync effect to pick up.
   * This applies it once it lands, but ONLY into fields that are still empty,
   * so it can never clobber an in-progress edit or an existing local draft. */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    getProviderPublicProfile(user.id).then(({ providerProfile: pp }) => {
      if (cancelled || !pp) return;
      setPhotoUrl((prev) => prev ?? pp.photoUrl ?? undefined);
      setRegion((prev) => prev || pp.region || "");
      setDistrict((prev) => prev || pp.district || "");
      setServiceAreaV2((prev) => (isServiceAreaEmpty(prev) && pp.serviceAreaV2 ? pp.serviceAreaV2 : prev));
      setExperience((prev) => prev || (pp.experience !== undefined && pp.experience !== null ? String(pp.experience) : ""));
      setAlbums((prev) => (prev.length > 0 ? prev : (pp.albums ?? [])));
    }).catch(() => { /* not fatal — local draft (if any) already seeded the form */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  /* Region */
  const selectedRegionObj = regionsList.find((r) => r.value === region);
  const hasDistricts = selectedRegionObj?.isCapital && (selectedRegionObj.districts?.length ?? 0) > 0;
  function handleRegionChange(val: string) { setRegion(val); setDistrict(""); }

  /* ── Debounced auto-save to localStorage ── */
  const debouncedBio     = useDebounce(bio, 1200);
  const debouncedExp     = useDebounce(experience, 1200);
  const debouncedPhoto   = useDebounce(photoUrl, 300);
  const debouncedAlbums  = useDebounce(albums, 800);
  const debouncedRegion  = useDebounce(region, 600);
  const debouncedDistrict = useDebounce(district, 600);
  const debouncedServiceAreaV2 = useDebounce(serviceAreaV2, 600);
  const [autoSaveAt, setAutoSaveAt] = useState<Date | null>(null);

  const persistLocal = useCallback(() => {
    if (!user) return;

    /* ── CRITICAL: reject stale closures from a previous user session ──
     * saveGuardRef.current is updated synchronously (useLayoutEffect) whenever
     * user.id changes, so this check reliably blocks any persistLocal call that
     * was captured before the user switched. */
    if (user.id !== saveGuardRef.current) {
      console.warn(`[Hormang] persistLocal blocked — stale closure for user=${user.id.slice(0, 8)}`);
      return;
    }

    /* ── CRITICAL: ALL debounced values must have settled before saving ──
     * Only checking debouncedPhoto was insufficient: debouncedBio, debouncedRegion,
     * and debouncedExp would still hold the OLD user's values for up to 1200ms
     * after a user switch, causing cross-user data leakage into the new user's
     * localStorage key. We now require every debounced field to match its
     * live state counterpart before any write occurs. */
    if (debouncedPhoto !== photoUrl) return;
    if (debouncedBio !== bio) return;
    if (debouncedRegion !== region) return;
    if (debouncedDistrict !== district) return;
    if (debouncedExp !== experience) return;

    const next: LocalProfile = {
      photoUrl: debouncedPhoto,
      region: debouncedRegion,
      district: debouncedDistrict,
      serviceAreaV2: debouncedServiceAreaV2,
      experience: debouncedExp ? Number(debouncedExp) : undefined,
      albums: debouncedAlbums,
      portfolioItems: debouncedAlbums.flatMap((a) => a.photos).slice(0, 20),
      bio: debouncedBio || undefined,
      categories: selectedServices.length > 0 ? selectedServices : undefined,
    };
    saveLocalProfile(user.id, next);
    setAutoSaveAt(new Date());
  }, [user, photoUrl, debouncedPhoto, bio, debouncedBio, region, debouncedRegion, district, debouncedDistrict, experience, debouncedExp, debouncedServiceAreaV2, debouncedAlbums, selectedServices]);

  useEffect(() => { persistLocal(); }, [persistLocal]);

  /* ── Completion ── */
  const completionLocal: LocalProfile = {
    photoUrl,
    region,
    district,
    serviceAreaV2,
    experience: experience ? Number(experience) : undefined,
    albums,
    portfolioItems: albums.flatMap((a) => a.photos).slice(0, 20),
  };
  const rawChecks = getCompletionChecks(
    user ?? null,
    { ...providerProfile, categories: selectedServices, bio } as typeof providerProfile,
    completionLocal,
  );
  const pct     = getCompletionPct(rawChecks);
  const missing = rawChecks.filter((c) => !c.done);

  /* Section refs for scroll-to */
  const refPhoto      = useRef<HTMLDivElement>(null);
  const refName       = useRef<HTMLDivElement>(null);
  const refRegion     = useRef<HTMLDivElement>(null);
  const refServices   = useRef<HTMLDivElement>(null);
  const refBio        = useRef<HTMLDivElement>(null);
  const refExperience = useRef<HTMLDivElement>(null);
  const refPortfolio  = useRef<HTMLDivElement>(null);
  const sectionRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    photo: refPhoto, name: refName, region: refRegion,
    services: refServices, bio: refBio, experience: refExperience,
    portfolio: refPortfolio,
  };

  function scrollTo(key: string) {
    const ref = sectionRefs[key as keyof typeof sectionRefs];
    ref?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (key === "photo") setTimeout(() => photoInputRef.current?.click(), 400);
    if (key === "portfolio") setTimeout(() => { if (albums.length > 0) setExpandedAlbumId(albums[0].id); }, 400);
  }

  /* ── Save ── */
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  async function handleSave() {
    /* Strict guard: never save for a user that isn't the currently authenticated
     * one. This blocks any async save that started before a user switch completes. */
    if (!user || user.id !== saveGuardRef.current) {
      console.warn("[Hormang] handleSave blocked — stale or missing user");
      return;
    }

    const errs: Record<string, string> = {};
    if (!firstName.trim() || firstName.trim().length < 2) errs.firstName = t.profileSettings.firstNameMinErr;
    if (!lastName.trim() || lastName.trim().length < 2) errs.lastName = t.profileSettings.lastNameMinErr;
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);

    try {
      console.log(
        `[Hormang] 💾 handleSave: user=${user.id.slice(0, 8)} isProvider=${isProvider} cats=${selectedServices.length} bio=${bio.length} albums=${albums.length}`,
      );

      /* Always update the provider profile when the user is a provider —
       * even if no categories are selected — so bio and other fields are
       * persisted on the server correctly. */
      const shouldSaveProvider = isProvider || !!providerProfile || hasProviderAccess(user, providerProfile, local) || !!photoUrl;
      const [userRes, profileRes] = await Promise.all([
        updateProfile({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }).catch((err) => {
          console.warn("[Hormang] updateProfile warning:", err);
          return { user: { ...user, firstName: firstName.trim(), lastName: lastName.trim() } };
        }),
        shouldSaveProvider
          ? updateProviderProfile({
              categories: selectedServices,
              bio: bio || undefined,
              preferredLocation: region ? (district ? `${region}, ${district}` : region) : undefined,
              photoUrl: photoUrl ?? null,
              experience: experience ? Number(experience) : null,
              region: region || null,
              district: district || null,
              serviceAreaV2: isServiceAreaEmpty(serviceAreaV2) ? null : serviceAreaV2,
              albums: albums.length > 0 ? albums : null,
            }).catch((err) => {
              console.warn("[Hormang] updateProviderProfile warning:", err);
              return {
                profile: providerProfile ?? {
                  id: user.id,
                  userId: user.id,
                  categories: selectedServices,
                  bio: bio || null,
                  preferredLocation: region ? (district ? `${region}, ${district}` : region) : null,
                  isVerified: false,
                },
              };
            })
          : Promise.resolve(null),
      ]);

      const newLocal: LocalProfile = {
        photoUrl,
        region,
        district,
        serviceAreaV2,
        experience: experience ? Number(experience) : undefined,
        albums,
        portfolioItems: albums.flatMap((a) => a.photos).slice(0, 20),
        bio: bio || undefined,
        categories: selectedServices.length > 0 ? selectedServices : undefined,
      };

      saveLocalProfile(user.id, newLocal);
      setLocal(newLocal);
      console.log(`[Hormang] ✅ handleSave complete: user=${user.id.slice(0, 8)}`);

      setAuth(userRes.user, profileRes ? profileRes.profile : providerProfile);

      setSaved(true);
      toast({ title: t.profileSettings.saveSuccessToast });
      setTimeout(() => setSaved(false), 3000);

    } catch (err: unknown) {
      console.error("[Hormang] ❌ handleSave failed:", err);
      toast({
        title: err instanceof Error ? getAuthError(err.message, t) : t.profileSettings.saveErrorToast,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  /* ── UI state ── */
  const [showAddPhone, setShowAddPhone]         = useState(false);
  const [showPreview, setShowPreview]           = useState(false);
  const [showCustomerPreview, setShowCustomerPreview] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) { setLocation("/auth/login"); return null; }

  const isProvider = activeRole === "provider";
  const fullName   = `${firstName} ${lastName}`.trim();

  /* ── Customer completion (used when !isProvider) ── */
  const ps = t.profileSettings;

  // Remap provider check labels to the active locale so RU users see translated text.
  const providerCheckLabels: Record<string, string> = {
    photo:      ps.providerCheckPhoto,
    name:       ps.providerCheckName,
    region:     ps.providerCheckRegion,
    services:   ps.providerCheckServices,
    bio:        ps.providerCheckBio,
    experience: ps.providerCheckExperience,
    portfolio:  ps.providerCheckPortfolio,
  };
  const checks = missing.map((c) =>
    providerCheckLabels[c.key] ? { ...c, label: providerCheckLabels[c.key] } : c,
  );

  const customerChecks = [
    { key: "photo",    label: ps.photoCheckLabel,   weight: 30, done: !!photoUrl },
    { key: "name",     label: ps.nameCheckLabel,    weight: 30, done: !!(firstName.trim().length >= 2 && lastName.trim().length >= 2) },
    { key: "phone",    label: ps.phoneCheckLabel,   weight: 20, done: !!user.phone },
    { key: "region",   label: ps.addressCheckLabel, weight: 20, done: !!region },
  ];
  const customerPct     = customerChecks.reduce((acc, c) => acc + (c.done ? c.weight : 0), 0);
  const customerMissing = customerChecks.filter((c) => !c.done);

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation(isProvider ? "/dashboard" : "/dashboard")}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-extrabold text-sm text-gray-900">{ps.title}</h1>
            <p className="text-xs text-gray-400">{isProvider ? ps.providerProfile : ps.customerProfile}</p>
          </div>
          <button
            onClick={() => isProvider ? setShowPreview(true) : setShowCustomerPreview(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all active:scale-95"
            style={{ background: VIOLET }}
          >
            <Eye className="w-3.5 h-3.5" /> {ps.view}
          </button>
          <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ── New provider welcome banner (only for providers) ── */}
        <AnimatePresence>
          {showWelcomeBanner && isProvider && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="rounded-2xl p-4 text-white shadow-md relative overflow-hidden"
              style={{ background: VIOLET }}
            >
              <button
                onClick={dismissBanner}
                className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-start gap-3 pr-6">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="font-extrabold text-sm leading-tight mb-1">
                    {ps.welcomeTitle}
                  </p>
                  <p className="text-white/75 text-xs leading-relaxed">
                    {ps.welcomeDesc}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Completion Card ── */}
        {(() => {
          const displayPct     = isProvider ? pct : customerPct;
          const displayMissing = isProvider ? checks : customerMissing;
          return (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-shrink-0">
                  <CircularProgress pct={displayPct} />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold"
                    style={{ color: displayPct < 40 ? "#EF4444" : displayPct < 75 ? "#F97316" : VIOLET_SOLID }}>
                    {displayPct}%
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-gray-900 text-sm mb-0.5">
                    {displayPct === 100 ? tt.profileFullEmoji : tFormat(tt.profilePctTpl, { pct: displayPct })}
                  </p>
                  {displayPct < 100 && (
                    <p className="text-xs text-gray-400 mb-1">{tFormat(tt.fieldsLeftTpl, { n: displayMissing.length })}</p>
                  )}
                  {displayPct < 100 && (
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${displayPct}%`, background: VIOLET }} />
                    </div>
                  )}
                  {displayPct === 100 && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {ps.allFieldsFilled}
                    </div>
                  )}
                </div>
              </div>

              {/* Missing items with add-now buttons */}
              {displayMissing.length > 0 && (
                <div className="border-t border-gray-50 pt-3 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400">
                    {isProvider ? ps.fillProfileHintProvider : ps.fillProfileHint}
                  </p>
                  {displayMissing.slice(0, 4).map((m) => (
                    <div key={m.key} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-black text-violet-500">{m.weight}%</span>
                        </div>
                        <p className="text-xs text-gray-600 truncate">{m.label}</p>
                      </div>
                      <button
                        onClick={() => scrollTo(m.key)}
                        className="flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-1 rounded-lg hover:bg-violet-100 transition-colors flex-shrink-0"
                      >
                        <TrendingUp className="w-2.5 h-2.5" /> {ps.add}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* ── Phone migration banner ── */}
        {!user.phone && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-800 text-sm mb-1">{ps.linkPhoneTitle}</p>
              <p className="text-amber-700 text-xs leading-relaxed mb-3">
                {ps.linkPhoneDesc}
              </p>
              <button onClick={() => setShowAddPhone(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-xl transition-colors">
                <Phone className="w-3.5 h-3.5" /> {ps.addPhoneBtn}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Photo + Name card ── */}
        <motion.div ref={refPhoto}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader icon={User} title={ps.basicInfo} />

          <div ref={refName} className="flex items-center gap-4 mb-5">
            <div className="relative flex-shrink-0">
              {photoLoading ? (
                <div className="w-20 h-20 rounded-2xl bg-violet-50 border-2 border-violet-100 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                </div>
              ) : photoUrl ? (
                <img src={photoUrl} alt={ps.title} className="w-20 h-20 rounded-2xl object-cover border-2 border-violet-100" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-violet-50 border-2 border-violet-100 flex items-center justify-center">
                  <span className="text-2xl font-black text-violet-400">
                    {(user.firstName[0] ?? "") + (user.lastName[0] ?? "")}
                  </span>
                </div>
              )}
              <button onClick={() => photoInputRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-md transition-colors"
                style={{ background: VIOLET }}>
                <Camera className="w-3.5 h-3.5" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-900">{fullName || "—"}</p>
              <p className="text-xs text-gray-400 mb-2">{isProvider ? ps.providerLabel : ps.customerLabel}</p>
              <button onClick={() => photoInputRef.current?.click()}
                className="text-xs font-bold text-violet-600 hover:text-violet-700 transition-colors">
                {photoUrl ? ps.changePhoto : ps.addPhoto}
              </button>
              {photoUrl ? (
                <button
                  onClick={handlePhotoRemove}
                  className="block text-xs font-medium text-red-400 hover:text-red-500 transition-colors mt-0.5"
                >
                  {ps.removePhoto}
                </button>
              ) : (
                <p className="text-[10px] text-violet-400 mt-0.5">{ps.photoBoost}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label={ps.firstName} required error={errors.firstName}>
              <input value={firstName}
                onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: "" })); }}
                placeholder="Ism" className={inputCls()} />
            </Field>
            <Field label={tt.lastNameLabel} required error={errors.lastName}>
              <input value={lastName}
                onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, lastName: "" })); }}
                placeholder={tt.lastNamePlaceholder} className={inputCls()} />
            </Field>
          </div>

          <Field label={tt.phoneLabel} hint={tt.phoneHint}>
            <div className="w-full h-11 px-4 rounded-2xl border-2 border-gray-100 bg-gray-50 text-sm text-gray-500 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span>{user.phone ?? "—"}</span>
              <span className="ml-auto text-[10px] text-gray-400 bg-gray-200 px-2 py-0.5 rounded-lg">{ps.cantChange}</span>
            </div>
          </Field>
        </motion.div>

        {/* ── Region card ── */}
        <motion.div ref={refRegion}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5">

          {/* Info button — only for providers */}
          {isProvider && (
            <div className="absolute top-4 right-4">
              <button
                type="button"
                onClick={() => setShowAreaInfo((v) => !v)}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  showAreaInfo
                    ? "bg-violet-600 text-white shadow-md"
                    : "bg-violet-50 text-violet-500 hover:bg-violet-100 hover:text-violet-700"
                }`}
                aria-label="Ma'lumot"
              >
                <Info className="w-3.5 h-3.5" />
              </button>

              <AnimatePresence>
                {showAreaInfo && (
                  <>
                    {/* Backdrop — close on outside click */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowAreaInfo(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-9 z-20 w-64 bg-white rounded-2xl shadow-xl border border-violet-100 p-4"
                    >
                      {/* Pointer arrow */}
                      <div className="absolute -top-2 right-2.5 w-4 h-4 bg-white border-l border-t border-violet-100 rotate-45 rounded-sm" />
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-violet-600" />
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          {ps.areaInfoTooltip}
                        </p>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          <SectionHeader icon={MapPin}
            title={isProvider ? ps.serviceAreas : ps.mainAddress}
            sub={isProvider ? ps.serviceAreasSub : ps.mainAddressSub} />

          {isProvider ? (
            <div className="space-y-3">
              <ProviderAreaSelector value={serviceAreaV2} onChange={setServiceAreaV2} />
            </div>
          ) : (
            <div className="space-y-3">
              <Field label={ps.cityField} required
                boost={ps.cityBoost}>
                <div className="relative">
                  <select value={region} onChange={(e) => handleRegionChange(e.target.value)}
                    className="w-full h-11 px-4 pr-9 rounded-2xl border-2 border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 appearance-none">
                    <option value="">{ps.selectRegion}</option>
                    {regionsList.map((r) => <option key={r.value} value={r.value}>{getRegionLabel(r.value, locale)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </Field>

              <AnimatePresence>
                {hasDistricts && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <Field label={ps.toshkentDistrictLabel}>
                      <div className="relative">
                        <select value={district} onChange={(e) => setDistrict(e.target.value)}
                          className="w-full h-11 px-4 pr-9 rounded-2xl border-2 border-violet-200 text-sm text-gray-800 bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 appearance-none">
                          <option value="">{ps.selectDistrict}</option>
                          {selectedRegionObj?.districts?.map((d) => <option key={d} value={d}>{getDistrictLabel(d, locale)}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* ── Services card ── */}
        {isProvider && (
          <motion.div ref={refServices}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionHeader icon={Briefcase} title={tt.myServices}
              sub={tt.myServicesSub} />

            <div className="flex flex-wrap gap-2 mb-3">
              {getActiveCategories().map((cat) => {
                const active = selectedServices.includes(cat.id);
                const displayName = getCategoryDisplayName(cat.id, locale);
                return (
                  <button key={cat.id} type="button"
                    onClick={() =>
                      setSelectedServices((prev) =>
                        prev.includes(cat.id) ? prev.filter((c) => c !== cat.id) : [...prev, cat.id]
                      )
                    }
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold border-2 transition-all duration-150 ${
                      active ? "text-white border-transparent shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:border-violet-200 hover:text-violet-700"
                    }`}
                    style={active ? { background: VIOLET } : {}}>
                    {active && <CheckCircle2 className="w-3 h-3" />}
                    <CategoryIcon categoryId={cat.id} emoji={cat.emoji} size={25} bare className={active ? "text-white" : "text-gray-500"} />
                    {displayName}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-violet-500 flex items-center gap-1 font-semibold">
              <Zap className="w-3 h-3" /> {ps.servicesBoost}
            </p>
          </motion.div>
        )}

        {/* ── Bio / Details card ── */}
        {isProvider && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <SectionHeader icon={Star} title={ps.experienceSection}
              sub={ps.experienceSub} />

            <div className="space-y-4">
              {/* Experience */}
              <div ref={refExperience}>
                <Field label={tt.experienceLabel} hint={tt.experienceHint}>
                  <input type="number" value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="Masalan: 3" min={0} max={50} className={inputCls()} />
                </Field>
              </div>

              {/* Bio */}
              <div ref={refBio}>
                <Field label={ps.bioLabel}
                  boost={bio.length < 50 ? tFormat(ps.bioBoostShortTpl, { n: 50 - bio.length }) : ps.bioBoostFull}
                  hint={bio.length >= 50 ? undefined : undefined}>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 500))}
                    placeholder={ps.bioPlaceholder}
                    rows={4}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 resize-none transition-colors placeholder:text-gray-300" />
                  <div className="flex justify-between items-center -mt-0.5">
                    <span className={`text-[11px] font-semibold ${bio.length >= 50 ? "text-emerald-500" : "text-gray-400"}`}>
                      {bio.length >= 50 ? ps.bioMinDone : tFormat(ps.bioMinLeftTpl, { n: bio.length })}
                    </span>
                    <span className="text-[11px] text-gray-400">{bio.length}/500</span>
                  </div>
                </Field>
              </div>

              
            {/* Auto-save indicator */}
            {autoSaveAt && (
              <p className="text-[10px] text-gray-300 mt-3 text-right">
                {tFormat(ps.savedChanges.replace("✓ ", ""), {})} {autoSaveAt.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            </div>
          </motion.div>
        )}

        {/* ── Portfolio card ── */}
        {isProvider && (
          <motion.div ref={refPortfolio}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">

            {/* Header */}
            <div className="flex items-center justify-between mb-1 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
                  <ImagePlus className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-sm">{ps.portfolioSection}</h2>
                  <p className="text-[11px] text-gray-400">{ps.portfolioSub}</p>
                </div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${albums.length > 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-violet-50 text-violet-600 border border-violet-100"}`}>
                {albums.length}/10
              </span>
            </div>

            {albums.length === 0 && (
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                <p className="text-xs text-violet-600 font-semibold">
                  {ps.portfolioBoost}
                </p>
              </div>
            )}

            {/* Album list */}
            <div className="space-y-3">
              {albums.map((album) => {
                const isExpanded = expandedAlbumId === album.id;
                const coverPhoto = album.photos[album.coverIdx ?? 0];
                return (
                  <div key={album.id} className="rounded-2xl border border-gray-100 overflow-hidden">
                    {/* Album header row */}
                    <button
                      type="button"
                      onClick={() => setExpandedAlbumId(isExpanded ? null : album.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      {/* Cover thumbnail */}
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-100 bg-gray-100 flex-shrink-0">
                        {coverPhoto ? (
                          <img src={coverPhoto.url} alt={album.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImagePlus className="w-5 h-5 text-gray-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{album.title}</p>
                        <p className="text-xs text-gray-400">
                          {album.photos.length === 0 ? ps.emptyAlbum : tFormat(ps.albumPhotosTpl, { n: album.photos.length })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteAlbum(album.id); }}
                          className="w-6 h-6 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-100 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <Star className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180 text-violet-500" : "text-gray-300"}`} />
                      </div>
                    </button>

                    {/* Expanded album editor */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-gray-100 px-3 py-3 space-y-3"
                        >
                          {/* Album title rename */}
                          <input
                            value={album.title}
                            onChange={(e) => renameAlbum(album.id, e.target.value)}
                            onBlur={() => persistAlbums(albums)}
                            placeholder={ps.albumNamePlaceholder}
                            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20 transition-colors font-semibold"
                          />

                          {/* Photo upload zone (max 20 per album) */}
                          <MediaUploadZone
                            urls={album.photos.map((p) => p.url)}
                            onChange={(urls) =>
                              updateAlbumPhotos(album.id, urls.map((url) => ({ url })))
                            }
                            max={20}
                            hint={tt.photoDragHint}
                            maxDim={900}
                            quality={0.72}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Add album button */}
            {albums.length < 10 && (
              <button
                type="button"
                onClick={addAlbum}
                className="w-full mt-3 h-12 rounded-2xl border-2 border-dashed border-violet-200 flex items-center justify-center gap-2 text-violet-500 hover:border-violet-400 hover:bg-violet-50/50 transition-colors"
              >
                <ImagePlus className="w-4 h-4" />
                <span className="text-sm font-semibold">{tFormat(ps.addAlbumTpl, { n: 10 - albums.length })}</span>
              </button>
            )}
          </motion.div>
        )}

        {/* ── Save button ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <button onClick={handleSave} disabled={saving}
            className="w-full h-14 rounded-2xl text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-lg transition-all active:scale-[.98] disabled:opacity-70"
            style={{ background: saved ? "linear-gradient(135deg,#059669,#10B981)" : VIOLET }}>
            {saving ? <Loader2 className="w-5 h-5 animate-spin" />
              : saved  ? <CheckCircle2 className="w-5 h-5" />
              : <Save className="w-5 h-5" />}
            {saving ? tt.saving : saved ? tt.saved : tt.saveProfile}
          </button>

          {saved && (
            <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="text-center text-xs text-emerald-600 font-semibold mt-2">
              {ps.savedChanges}
            </motion.p>
          )}

          <p className="text-center text-[11px] text-gray-300 mt-3">
            {ps.autoSaveNote}
          </p>
        </motion.div>
      </div>

      <BottomNav />

      {showAddPhone && (
        <AddPhoneModal onClose={() => setShowAddPhone(false)} onSuccess={() => setShowAddPhone(false)} />
      )}

      <AnimatePresence>
        {showPreview && (
          <PublicProfilePreviewModal
            key={`provider-${firstName}-${lastName}-${photoUrl}`}
            mode="provider"
            onClose={() => setShowPreview(false)}
            providerData={{
              masterId: user.id,
              masterName: `${firstName} ${lastName}`.trim(),
              masterInitials: `${(firstName[0] ?? "")}${(lastName[0] ?? "")}`.toUpperCase(),
              masterColor: VIOLET_SOLID,
              avgResponseTime: 14,
              photoUrl: photoUrl || local.photoUrl,
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCustomerPreview && (
          <PublicProfilePreviewModal
            key={`customer-${firstName}-${lastName}-${region}-${district}-${photoUrl}`}
            mode="customer"
            onClose={() => setShowCustomerPreview(false)}
            customerData={{
              customerName: `${firstName} ${lastName}`.trim(),
              customerInitials: `${(firstName[0] ?? "")}${(lastName[0] ?? "")}`.toUpperCase(),
              customerColor: "hsl(221,78%,48%)",
              customerId: user.id,
              photoUrl,
              region,
              district,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
