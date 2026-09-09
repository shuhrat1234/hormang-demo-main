/**
 * Admin Panel — Advanced Multilingual Question Manager
 * Password: hormang2024
 * Supports UZ (primary) + RU (recommended) translations.
 * Changes are only persisted when the "Saqlash" button is clicked.
 */
import { useState, useRef, useEffect } from "react";
import { TangaCoin } from "@/components/tanga-coin";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Plus, Trash2, Edit3, ChevronUp, ChevronDown,
  Save, X, Check, RefreshCw, Eye, EyeOff, GripVertical,
  AlertTriangle, Star, Layers, GitBranch, Hash, ToggleLeft,
  Calendar, FileUp, AlignLeft, List, Type, Sliders,
  SlidersHorizontal, ChevronRight, Info, MapPin, Copy, Languages, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCategories, saveCategories,
  getCommonQuestions, saveCommonQuestions,
  resetCategories, resetCommonQuestions,
  type CategoryConfig, type Question, type QuestionType, type QuestionOption,
} from "@/lib/questionnaire-store";
import { getCategory, getCategoryDisplayName } from "@/lib/categories";
import { markAdminAuthenticated, translateTexts } from "@/lib/admin-client";
import { onStoreChange } from "@/lib/store-events";
import logoImg from "/hormang-logo.png";

const ADMIN_PASSWORD = "hormang2024";

/* ─── Type meta ─────────────────────────────────────────────────── */
interface TypeMeta { value: QuestionType; label: string; icon: React.ReactNode }
const QUESTION_TYPES: TypeMeta[] = [
  { value: "single-select",  label: "Bir tanlash",    icon: <List className="w-3.5 h-3.5" /> },
  { value: "multi-select",   label: "Ko'p tanlash",   icon: <List className="w-3.5 h-3.5" /> },
  { value: "text",           label: "Matn (1 qator)", icon: <Type className="w-3.5 h-3.5" /> },
  { value: "textarea",       label: "Katta matn",     icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { value: "number",         label: "Raqam",          icon: <Hash className="w-3.5 h-3.5" /> },
  { value: "range",          label: "Slider (range)", icon: <Sliders className="w-3.5 h-3.5" /> },
  { value: "yes-no",         label: "Ha / Yo'q",      icon: <ToggleLeft className="w-3.5 h-3.5" /> },
  { value: "date",           label: "Sana",           icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "file",           label: "Fayl yuklash",   icon: <FileUp className="w-3.5 h-3.5" /> },
  { value: "location",       label: "Manzil (smart)", icon: <MapPin className="w-3.5 h-3.5" /> },
  { value: "section-header", label: "Bo'lim sarlavhasi", icon: <Layers className="w-3.5 h-3.5" /> },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t.label]));

/* ─── Editor types ───────────────────────────────────────────────── */
interface EditorOption {
  _key: string;
  label: string;    /** UZ label — primary */
  labelRu: string;  /** RU label */
  labelEn: string;  /** EN label */
  value: string;
  type: "fixed" | "other";
  tangaCost: string;
}

interface EditorState {
  id: string;
  label: string;        /** UZ question text — primary */
  labelRu: string;      /** RU question text */
  labelEn: string;      /** EN question text */
  type: QuestionType;
  required: boolean;
  isCore: boolean;
  helpText: string;        /** UZ help text */
  helpTextRu: string;      /** RU help text */
  helpTextEn: string;      /** EN help text */
  placeholder: string;     /** UZ placeholder */
  placeholderRu: string;   /** RU placeholder */
  placeholderEn: string;   /** EN placeholder */
  min: string;
  max: string;
  step: string;
  options: EditorOption[];
  autofillExamples: string[];
  autofillExamplesRu: string[];
  autofillExamplesEn: string[];
  condEnabled: boolean;
  condQuestionId: string;
  condValue: string;
  conditionalBranches: Record<string, Question[]>;
}

function mkKey() { return `_${Math.random().toString(36).slice(2, 8)}`; }

function blankOption(): EditorOption {
  return { _key: mkKey(), label: "", labelRu: "", labelEn: "", value: "", type: "fixed" as const, tangaCost: "0" };
}

function blankEditor(): EditorState {
  return {
    id: `q_${Date.now()}`,
    label: "",
    labelRu: "",
    labelEn: "",
    type: "single-select",
    required: false,
    isCore: false,
    helpText: "",
    helpTextRu: "",
    helpTextEn: "",
    placeholder: "",
    placeholderRu: "",
    placeholderEn: "",
    min: "",
    max: "",
    step: "",
    options: [blankOption()],
    autofillExamples: [],
    autofillExamplesRu: [],
    autofillExamplesEn: [],
    condEnabled: false,
    condQuestionId: "",
    condValue: "",
    conditionalBranches: {},
  };
}

function editorFromQuestion(q: Question): EditorState {
  return {
    id: q.id,
    label: q.labelLocalized?.uz ?? q.label,
    labelRu: q.labelLocalized?.ru ?? "",
    labelEn: q.labelLocalized?.en ?? "",
    type: q.type,
    required: !!q.required,
    isCore: !!q.isCore,
    helpText: q.helpTextLocalized?.uz ?? q.helpText ?? "",
    helpTextRu: q.helpTextLocalized?.ru ?? "",
    helpTextEn: q.helpTextLocalized?.en ?? "",
    placeholder: q.placeholderLocalized?.uz ?? q.placeholder ?? "",
    placeholderRu: q.placeholderLocalized?.ru ?? "",
    placeholderEn: q.placeholderLocalized?.en ?? "",
    min: q.min != null ? String(q.min) : "",
    max: q.max != null ? String(q.max) : "",
    step: q.step != null ? String(q.step) : "",
    options: q.options?.length
      ? q.options.map((o) => ({
          _key: mkKey(),
          label: o.labelLocalized?.uz ?? o.label,
          labelRu: o.labelLocalized?.ru ?? "",
          labelEn: o.labelLocalized?.en ?? "",
          value: o.value,
          type: (o.type === "other" ? "other" : "fixed") as "fixed" | "other",
          tangaCost: o.tangaCost != null ? String(o.tangaCost) : "0",
        }))
      : [blankOption()],
    autofillExamples: q.autofillExamplesLocalized?.uz ?? q.autofillExamples ?? [],
    autofillExamplesRu: q.autofillExamplesLocalized?.ru ?? [],
    autofillExamplesEn: q.autofillExamplesLocalized?.en ?? [],
    condEnabled: !!q.conditional,
    condQuestionId: q.conditional?.questionId ?? "",
    condValue: q.conditional?.value ?? "",
    conditionalBranches: q.conditionalBranches ?? {},
  };
}

function editorToQuestion(e: EditorState): Question {
  const uzLabel = e.label.trim();
  const ruLabel = e.labelRu.trim();
  const enLabel = e.labelEn.trim();
  const uzPlaceholder = e.placeholder.trim();
  const ruPlaceholder = e.placeholderRu.trim();
  const enPlaceholder = e.placeholderEn.trim();
  const uzHelp = e.helpText.trim();
  const ruHelp = e.helpTextRu.trim();
  const enHelp = e.helpTextEn.trim();

  const q: Question = {
    id: e.id,
    label: uzLabel || ruLabel || enLabel,   // UZ primary, RU then EN fallback
    type: e.type,
  };

  if (uzLabel || ruLabel || enLabel) {
    q.labelLocalized = {
      ...(uzLabel ? { uz: uzLabel } : {}),
      ...(ruLabel ? { ru: ruLabel } : {}),
      ...(enLabel ? { en: enLabel } : {}),
    };
  }

  if (e.required) q.required = true;
  if (e.isCore) q.isCore = true;

  if (uzPlaceholder || ruPlaceholder || enPlaceholder) {
    q.placeholder = uzPlaceholder || ruPlaceholder || enPlaceholder;
    q.placeholderLocalized = {
      ...(uzPlaceholder ? { uz: uzPlaceholder } : {}),
      ...(ruPlaceholder ? { ru: ruPlaceholder } : {}),
      ...(enPlaceholder ? { en: enPlaceholder } : {}),
    };
  }

  if (uzHelp || ruHelp || enHelp) {
    q.helpText = uzHelp || ruHelp || enHelp;
    q.helpTextLocalized = {
      ...(uzHelp ? { uz: uzHelp } : {}),
      ...(ruHelp ? { ru: ruHelp } : {}),
      ...(enHelp ? { en: enHelp } : {}),
    };
  }

  if (e.min !== "") q.min = Number(e.min);
  if (e.max !== "") q.max = Number(e.max);
  if (e.step !== "") q.step = Number(e.step);

  const needsOptions = e.type === "single-select" || e.type === "multi-select";
  if (needsOptions) {
    q.options = e.options
      .filter((o) => o.label.trim() || o.labelRu.trim() || o.labelEn.trim())
      .map((o): QuestionOption => {
        const uz = o.label.trim();
        const ru = o.labelRu.trim();
        const en = o.labelEn.trim();
        const cost = parseInt(o.tangaCost, 10);
        const opt: QuestionOption = {
          label: uz || ru || en,
          value: o.value.trim() || (uz || ru || en).toLowerCase().replace(/\s+/g, "_"),
          ...(o.type === "other" ? { type: "other" as const } : {}),
          ...(cost > 0 ? { tangaCost: cost } : {}),
        };
        if (uz || ru || en) {
          opt.labelLocalized = {
            ...(uz ? { uz } : {}),
            ...(ru ? { ru } : {}),
            ...(en ? { en } : {}),
          };
        }
        return opt;
      });
  }

  const uzExamples = (e.autofillExamples ?? []).map((s) => s.trim()).filter(Boolean);
  const ruExamples = (e.autofillExamplesRu ?? []).map((s) => s.trim()).filter(Boolean);
  const enExamples = (e.autofillExamplesEn ?? []).map((s) => s.trim()).filter(Boolean);
  if (uzExamples.length > 0) q.autofillExamples = uzExamples;
  if (uzExamples.length > 0 || ruExamples.length > 0 || enExamples.length > 0) {
    q.autofillExamplesLocalized = {
      ...(uzExamples.length > 0 ? { uz: uzExamples } : {}),
      ...(ruExamples.length > 0 ? { ru: ruExamples } : {}),
      ...(enExamples.length > 0 ? { en: enExamples } : {}),
    };
  }

  if (e.condEnabled && e.condQuestionId) {
    q.conditional = { questionId: e.condQuestionId, value: e.condValue };
  }
  const nonEmptyBranches = Object.fromEntries(
    Object.entries(e.conditionalBranches).filter(([, qs]) => qs.length > 0)
  );
  if (Object.keys(nonEmptyBranches).length > 0) {
    q.conditionalBranches = nonEmptyBranches;
  }
  return q;
}

/* ─── Password Gate ──────────────────────────────────────────────── */
function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) { markAdminAuthenticated(); onSuccess(); }
    else { setError(true); setTimeout(() => setError(false), 1500); }
  }
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white rounded-3xl border border-gray-100 p-8 w-full max-w-sm shadow-lg">
        <div className="flex items-center gap-3 mb-8">
          <img src={logoImg} alt="Hormang" className="w-10 h-10 object-contain" />
          <div><p className="font-extrabold text-gray-900">Admin Panel</p><p className="text-xs text-gray-400">Savollar boshqaruvi</p></div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
          <Lock className="w-6 h-6 text-blue-600" />
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Parol</label>
            <div className="relative">
              <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
                placeholder="Admin parolini kiriting" autoFocus
                className={`w-full px-4 py-3 pr-11 rounded-xl border text-sm transition-all ${error ? "border-red-400 bg-red-50 focus:ring-red-200" : "border-gray-200 bg-gray-50 focus:border-blue-400 focus:ring-blue-200"} focus:outline-none focus:ring-2`} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1.5 font-medium">Parol noto'g'ri</p>}
          </div>
          <Button type="submit" className="w-full font-bold bg-blue-600 hover:bg-blue-700 py-3">Kirish</Button>
        </form>
      </motion.div>
    </div>
  );
}

/* ─── iOS Toggle ─────────────────────────────────────────────────── */
function Toggle({ checked, onChange, size = "sm" }: { checked: boolean; onChange: (v: boolean) => void; size?: "sm" | "md" }) {
  const h = size === "md" ? "h-6 w-11" : "h-5 w-9";
  const knob = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const tx = size === "md" ? "translateX(22px)" : "translateX(18px)";
  return (
    <button onClick={() => onChange(!checked)} className={`relative inline-flex ${h} items-center rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none`}
      style={{ background: checked ? "#2563EB" : "#D1D5DB" }}>
      <span className={`inline-block ${knob} rounded-full bg-white shadow-sm transition-transform duration-200`}
        style={{ transform: checked ? tx : "translateX(2px)" }} />
    </button>
  );
}

/* ─── Language Tab Bar (reusable mini component) ─────────────────── */
function LangTabs({
  lang, onChange,
  uzFilled, ruFilled, enFilled,
}: {
  lang: "uz" | "ru" | "en";
  onChange: (l: "uz" | "ru" | "en") => void;
  uzFilled: boolean;
  ruFilled: boolean;
  enFilled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
      <button
        onClick={() => onChange("uz")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${lang === "uz" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
      >
        <span className="text-sm">🇺🇿</span>
        <span>O'Z</span>
        {uzFilled
          ? <span className="text-[10px] text-emerald-600 font-black">✅</span>
          : <span className="text-[10px] text-gray-300 font-black">○</span>}
      </button>
      <button
        onClick={() => onChange("ru")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${lang === "ru" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
      >
        <span className="text-sm">🇷🇺</span>
        <span>РУС</span>
        {ruFilled
          ? <span className="text-[10px] text-emerald-600 font-black">✅</span>
          : <span className="text-[10px] text-amber-500 font-black">⚠️</span>}
      </button>
      <button
        onClick={() => onChange("en")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${lang === "en" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
      >
        <span className="text-sm">🇬🇧</span>
        <span>EN</span>
        {enFilled
          ? <span className="text-[10px] text-emerald-600 font-black">✅</span>
          : <span className="text-[10px] text-amber-500 font-black">⚠️</span>}
      </button>
    </div>
  );
}

/* ─── Live Question Preview ──────────────────────────────────────── */
function QuestionPreview({ q, lang = "uz" }: { q: EditorState; lang?: "uz" | "ru" | "en" }) {
  const [selectedSingle, setSelectedSingle] = useState<string>("");
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [rangeVal, setRangeVal] = useState(q.min || "0");

  const resolvedLabel = lang === "ru" ? (q.labelRu || q.label) : lang === "en" ? (q.labelEn || q.label) : q.label;
  const resolvedPlaceholder = lang === "ru" ? (q.placeholderRu || q.placeholder) : lang === "en" ? (q.placeholderEn || q.placeholder) : q.placeholder;
  const resolvedHelp = lang === "ru" ? (q.helpTextRu || q.helpText) : lang === "en" ? (q.helpTextEn || q.helpText) : q.helpText;
  const resolvedExamples =
    lang === "ru"
      ? (q.autofillExamplesRu && q.autofillExamplesRu.length > 0 ? q.autofillExamplesRu : q.autofillExamples)
      : lang === "en"
      ? (q.autofillExamplesEn && q.autofillExamplesEn.length > 0 ? q.autofillExamplesEn : q.autofillExamples)
      : q.autofillExamples;
  function optLabel(o: EditorOption) { return lang === "ru" ? (o.labelRu || o.label) : lang === "en" ? (o.labelEn || o.label) : o.label; }
  /** Picks a UI copy string for the preview's static chrome text (not editable content). */
  function tri(uz: string, ru: string, en: string) { return lang === "ru" ? ru : lang === "en" ? en : uz; }

  if (q.type === "section-header") {
    return (
      <div className="py-3 px-4 border-l-4 border-blue-400 bg-blue-50 rounded-r-xl">
        <p className="font-extrabold text-blue-700 text-sm">{resolvedLabel || "Bo'lim sarlavhasi"}</p>
        {resolvedHelp && <p className="text-xs text-blue-500 mt-0.5">{resolvedHelp}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-1">
        <p className="text-sm font-semibold text-gray-800 leading-snug flex-1">
          {resolvedLabel || <span className="text-gray-300 italic">Savol matni…</span>}
        </p>
        {q.required && <span className="text-red-500 text-xs font-bold mt-0.5">*</span>}
      </div>
      {resolvedHelp && <p className="text-xs text-gray-400">{resolvedHelp}</p>}

      {q.type === "single-select" && (
        <div className="flex flex-wrap gap-1.5">
          {q.options.filter(o => optLabel(o)).map((o) => (
            <button key={o._key} onClick={() => { setSelectedSingle(o._key); setShowOther(o.type === "other"); }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${selectedSingle === o._key ? "border-blue-500 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"}`}>
              {optLabel(o)}
            </button>
          ))}
          {showOther && <input placeholder={tri("Boshqa variantni kiriting...", "Введите вариант...", "Enter an option...")} className="mt-1 w-full px-3 py-1.5 rounded-lg border border-blue-300 text-xs focus:outline-none" />}
        </div>
      )}

      {q.type === "multi-select" && (
        <div className="flex flex-wrap gap-1.5">
          {q.options.filter(o => optLabel(o)).map((o) => {
            const on = selectedMulti.includes(o._key);
            return (
              <button key={o._key} onClick={() => {
                const next = on ? selectedMulti.filter(k => k !== o._key) : [...selectedMulti, o._key];
                setSelectedMulti(next);
                setShowOther(q.options.some(x => x.type === "other" && next.includes(x._key)));
              }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1 ${on ? "border-blue-500 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-300"}`}>
                {on && <Check className="w-3 h-3" />} {optLabel(o)}
              </button>
            );
          })}
          {showOther && <input placeholder={tri("Boshqa variantni kiriting...", "Введите вариант...", "Enter an option...")} className="mt-1 w-full px-3 py-1.5 rounded-lg border border-blue-300 text-xs focus:outline-none" />}
        </div>
      )}

      {q.type === "location" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-blue-400 bg-blue-50">
            <div className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
            <MapPin className="w-3.5 h-3.5 text-blue-500" />
            <p className="text-xs font-semibold text-blue-700">
              {tri("📍 Mening manzilim (profildan)", "📍 Мой адрес (из профиля)", "📍 My address (from profile)")}
            </p>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 bg-white">
            <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
            <p className="text-xs font-semibold text-gray-600">
              {tri("Boshqa manzil", "Другой адрес", "Other address")}
            </p>
          </div>
        </div>
      )}

      {q.type === "text" && (
        <div className="space-y-2">
          <input placeholder={resolvedPlaceholder || tri("Matn kiriting…", "Введите текст…", "Enter text…")} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-300" />
          {resolvedExamples && resolvedExamples.filter(Boolean).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {resolvedExamples.filter(Boolean).map((ex, i) => (
                <span key={i} className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-medium cursor-pointer hover:bg-blue-100 transition-colors">{ex}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {q.type === "textarea" && (
        <div className="space-y-2">
          <textarea rows={2} placeholder={resolvedPlaceholder || tri("Matn kiriting…", "Введите текст…", "Enter text…")} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-300 resize-none" />
          {resolvedExamples && resolvedExamples.filter(Boolean).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {resolvedExamples.filter(Boolean).map((ex, i) => (
                <span key={i} className="px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-medium cursor-pointer hover:bg-blue-100 transition-colors">{ex}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {q.type === "number" && (
        <div className="flex items-center gap-2">
          <input type="number" placeholder={resolvedPlaceholder || "0"} min={q.min || undefined} max={q.max || undefined} step={q.step || undefined}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-300" />
          {resolvedHelp && <span className="text-xs text-gray-400 font-medium">{resolvedHelp}</span>}
        </div>
      )}
      {q.type === "range" && (
        <div className="space-y-1">
          <input type="range" min={q.min || 0} max={q.max || 100} step={q.step || 1} value={rangeVal} onChange={e => setRangeVal(e.target.value)} className="w-full accent-blue-600" />
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>{q.min || 0}</span><span className="font-semibold text-blue-600">{rangeVal}</span><span>{q.max || 100}</span>
          </div>
        </div>
      )}
      {q.type === "yes-no" && (
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold">
            {tri("✓ Ha", "✓ Да", "✓ Yes")}
          </button>
          <button className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-semibold">
            {tri("✗ Yo'q", "✗ Нет", "✗ No")}
          </button>
        </div>
      )}
      {q.type === "date" && <input type="date" className="px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-blue-300" />}
      {q.type === "file" && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center">
          <FileUp className="w-5 h-5 text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-gray-400">{tri("Fayl yuklash", "Загрузить файл", "Upload file")}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Single Option Row (in editor) ─────────────────────────────── */
function OptionRow({
  opt, index, total, lang,
  onChange, onDelete, onMove,
  isDragging, onDragStart, onDragOver, onDrop,
  otherExists,
}: {
  opt: EditorOption; index: number; total: number;
  lang: "uz" | "ru" | "en";
  onChange: (f: keyof EditorOption, v: string) => void;
  onDelete: () => void; onMove: (dir: -1 | 1) => void;
  isDragging: boolean;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void;
  otherExists: boolean;
}) {
  const isOther = opt.type === "other";
  const canSetOther = isOther || !otherExists;

  const labelField = lang === "ru" ? "labelRu" : lang === "en" ? "labelEn" : "label";
  const labelVal = lang === "ru" ? opt.labelRu : lang === "en" ? opt.labelEn : opt.label;
  const labelPlaceholder = isOther
    ? (lang === "ru" ? "Другое" : lang === "en" ? "Other" : "Boshqa")
    : (lang === "ru" ? `Вариант ${index + 1}` : lang === "en" ? `Option ${index + 1}` : `Variant ${index + 1}`);

  function setType(t: "fixed" | "other") {
    onChange("type", t);
    if (t === "other" && !opt.label.trim()) onChange("label", "Boshqa");
  }

  const uzFilled = !!opt.label.trim();
  const ruFilled = !!opt.labelRu.trim();
  const enFilled = !!opt.labelEn.trim();
  const otherLangFilled = lang === "uz" ? (ruFilled || enFilled) : lang === "ru" ? (uzFilled || enFilled) : (uzFilled || ruFilled);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={onDrop}
      className={`rounded-xl border transition-all ${isDragging ? "opacity-40 border-blue-300 bg-blue-50" : isOther ? "border-violet-200 bg-violet-50/50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
    >
      <div className="flex items-center gap-2 p-2.5">
        <div className="cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Label input — switches between UZ and RU based on lang */}
        <div className="flex-1 relative">
          <input
            value={labelVal}
            onChange={(e) => onChange(labelField, e.target.value)}
            placeholder={labelPlaceholder}
            className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-1 transition-all ${isOther ? "border-violet-200 bg-white focus:ring-violet-300 focus:border-violet-400 text-violet-800 font-semibold" : "border-gray-200 bg-white focus:ring-blue-300 focus:border-blue-400"}`}
          />
          {/* Completeness indicator — warns when the other two languages aren't both filled yet */}
          {labelVal.trim() && !otherLangFilled && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-300 font-black" title="Boshqa tillar hali to'ldirilmagan">○</span>
          )}
          {lang !== "uz" && !labelVal.trim() && uzFilled && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-black" title="Tarjima yo'q">⚠️</span>
          )}
        </div>

        {/* Tanga cost */}
        <div className="flex items-center gap-1 flex-shrink-0 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
          <TangaCoin size="xs" />
          <input
            type="number" min="0"
            value={opt.tangaCost}
            onChange={(e) => onChange("tangaCost", e.target.value)}
            placeholder="0"
            className="w-10 bg-transparent text-[11px] font-bold text-amber-800 focus:outline-none text-center"
            title="Tanga narxi"
          />
        </div>

        {/* Fixed / Boshqa toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
          <button onClick={() => setType("fixed")}
            className={`px-2 py-1 text-[10px] font-bold transition-colors ${!isOther ? "bg-blue-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
            Fixed
          </button>
          <button onClick={() => canSetOther && setType("other")} disabled={!canSetOther}
            title={!canSetOther ? "Allaqachon bir 'Boshqa' variant bor" : "Boshqa (matn kiritish)"}
            className={`px-2 py-1 text-[10px] font-bold transition-colors border-l border-gray-200 ${isOther ? "bg-violet-600 text-white" : canSetOther ? "bg-white text-gray-400 hover:bg-gray-50" : "bg-white text-gray-200 cursor-not-allowed"}`}>
            Boshqa
          </button>
        </div>

        {/* Reorder + delete */}
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isOther && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5 text-[11px] text-violet-500 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
          {lang === "ru" ? "При выборе появится поле для ввода текста" : lang === "en" ? "A text field appears when this is selected" : "Tanlanganda matn kiritish maydoni paydo bo'ladi"}
        </div>
      )}
    </div>
  );
}

/* ─── Branch Panel Modal ─────────────────────────────────────────── */
function BranchPanelModal({
  optionLabel, optionValue, questions, allQuestions, onChange, onClose,
}: {
  optionLabel: string; optionValue: string;
  questions: Question[]; allQuestions: Question[];
  onChange: (qs: Question[]) => void; onClose: () => void;
}) {
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const qs = [...questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    onChange(qs);
  }
  function del(i: number) { onChange(questions.filter((_, idx) => idx !== i)); }
  function save(q: Question) {
    const qs = editingIdx !== null
      ? questions.map((orig, i) => (i === editingIdx ? q : orig))
      : [...questions, q];
    onChange(qs);
    setEditorState(null); setEditingIdx(null); setShowAdd(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }}
        className="bg-white w-full sm:rounded-3xl sm:border sm:border-gray-100 sm:max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
            <GitBranch className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">«{optionLabel}» uchun shartli savollar</p>
            <p className="text-xs text-gray-400">{questions.length} ta follow-up savol</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {questions.length === 0 && (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <GitBranch className="w-6 h-6 text-violet-400" />
              </div>
              <p className="text-sm text-gray-500 font-semibold">Hali follow-up savol yo'q</p>
              <p className="text-xs text-gray-400 mt-1">«{optionLabel}» tanlanganda ko'rinadigan savollar</p>
            </div>
          )}
          {questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} total={questions.length}
              onEdit={() => { setEditorState(editorFromQuestion(q)); setEditingIdx(i); }}
              onDelete={() => del(i)} onMove={(d) => move(i, d)} />
          ))}
        </div>

        <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <button onClick={() => { setShowAdd(true); setEditorState(null); setEditingIdx(null); }}
            className="flex items-center gap-2 text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors">
            <Plus className="w-4 h-4" /> Follow-up savol qo'shish
          </button>
          <Button variant="outline" onClick={onClose} className="font-semibold border-gray-200">Yopish</Button>
        </div>

        <AnimatePresence>
          {(editorState !== null || showAdd) && (
            <QuestionEditorModal
              initial={editorState ?? undefined}
              allQuestions={[...allQuestions, ...questions]}
              onSave={save}
              onClose={() => { setEditorState(null); setEditingIdx(null); setShowAdd(false); }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Question Editor Modal ──────────────────────────────────────── */
function QuestionEditorModal({
  initial, allQuestions, onSave, onClose,
}: {
  initial?: EditorState;
  allQuestions: Question[];
  onSave: (q: Question) => void;
  onClose: () => void;
}) {
  const [s, setS] = useState<EditorState>(() => {
    const base = initial ?? blankEditor();
    return { ...base, conditionalBranches: base.conditionalBranches ?? {} };
  });
  const [editorLang, setEditorLang] = useState<"uz" | "ru" | "en">("uz");
  const [showPreview, setShowPreview] = useState(true);
  const [branchEditorFor, setBranchEditorFor] = useState<string | null>(null);
  const autoTranslatedOnOpen = useRef(false);
  const [translating, setTranslating] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const set = <K extends keyof EditorState>(k: K, v: EditorState[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const needsOptions = s.type === "single-select" || s.type === "multi-select";
  const needsNumeric = s.type === "number" || s.type === "range";
  const needsPlaceholder = ["text", "textarea", "number"].includes(s.type);

  /* Completeness */
  const uzFilled = !!s.label.trim();
  const ruFilled = !!s.labelRu.trim();
  const enFilled = !!s.labelEn.trim();

  /* Active-lang field bindings */
  const activeLabelVal = editorLang === "uz" ? s.label : editorLang === "ru" ? s.labelRu : s.labelEn;
  const activeLabelKey: keyof EditorState = editorLang === "uz" ? "label" : editorLang === "ru" ? "labelRu" : "labelEn";
  const activePlaceholderVal = editorLang === "uz" ? s.placeholder : editorLang === "ru" ? s.placeholderRu : s.placeholderEn;
  const activePlaceholderKey: keyof EditorState = editorLang === "uz" ? "placeholder" : editorLang === "ru" ? "placeholderRu" : "placeholderEn";
  const activeHelpVal = editorLang === "uz" ? s.helpText : editorLang === "ru" ? s.helpTextRu : s.helpTextEn;
  const activeHelpKey: keyof EditorState = editorLang === "uz" ? "helpText" : editorLang === "ru" ? "helpTextRu" : "helpTextEn";

  /* Copy from Uzbek → the currently active non-UZ tab */
  function copyFromUz() {
    setS((prev) => {
      if (editorLang === "ru") {
        return {
          ...prev,
          labelRu: prev.labelRu || prev.label,
          placeholderRu: prev.placeholderRu || prev.placeholder,
          helpTextRu: prev.helpTextRu || prev.helpText,
          options: prev.options.map((o) => ({ ...o, labelRu: o.labelRu || o.label })),
        };
      }
      return {
        ...prev,
        labelEn: prev.labelEn || prev.label,
        placeholderEn: prev.placeholderEn || prev.placeholder,
        helpTextEn: prev.helpTextEn || prev.helpText,
        options: prev.options.map((o) => ({ ...o, labelEn: o.labelEn || o.label })),
      };
    });
  }

/* Auto-translate Uzbek → the given non-UZ target (real translation, unlike
   * copyFromUz which just repeats the UZ text verbatim). Overwrites the
   * target-language fields — safe to call from a fresh/empty tab, and an
   * explicit re-click is expected to refresh a stale translation too. */
  async function autoTranslate(target: "ru" | "en") {
    if (!s.label.trim()) return;
    setTranslating(true);
    try {
      const texts = [s.label, s.placeholder, s.helpText, ...s.options.map((o) => o.label)];
      const translations = await translateTexts(texts, target);
      const [label, placeholder, helpText, ...optionLabels] = translations;
      setS((prev) => ({
        ...prev,
        ...(target === "ru"
          ? { labelRu: label || prev.labelRu, placeholderRu: placeholder || prev.placeholderRu, helpTextRu: helpText || prev.helpTextRu }
          : { labelEn: label || prev.labelEn, placeholderEn: placeholder || prev.placeholderEn, helpTextEn: helpText || prev.helpTextEn }),
        options: prev.options.map((o, i) =>
          target === "ru"
            ? { ...o, labelRu: optionLabels[i] || o.labelRu }
            : { ...o, labelEn: optionLabels[i] || o.labelEn }),
      }));
    } catch {
      // best-effort — admin can still type translations by hand
    } finally {
      setTranslating(false);
    }
  }

  /* Switching into an empty RU/EN tab auto-fires the translation once, so
   * admins don't have to remember to click the button every time — the
   * button stays for a manual re-translate afterward. */
  function handleLangChange(lang: "uz" | "ru" | "en") {
    setEditorLang(lang);
    if (lang === "uz" || !s.label.trim()) return;
    const targetFilled = lang === "ru"
      ? !!(s.labelRu.trim() || s.placeholderRu.trim() || s.helpTextRu.trim())
      : !!(s.labelEn.trim() || s.placeholderEn.trim() || s.helpTextEn.trim());
    if (!targetFilled) void autoTranslate(lang);
  }

  /* Opening an existing question that already has Uzbek text but missing
   * RU/EN translates both proactively — so they're already filled in even
   * if the admin never switches to those tabs at all, not just on switch. */
  useEffect(() => {
    if (autoTranslatedOnOpen.current || !initial) return;
    autoTranslatedOnOpen.current = true;
    if (!initial.label.trim()) return;
    (async () => {
      if (!initial.labelRu.trim() && !initial.placeholderRu.trim() && !initial.helpTextRu.trim()) {
        await autoTranslate("ru");
      }
      if (!initial.labelEn.trim() && !initial.placeholderEn.trim() && !initial.helpTextEn.trim()) {
        await autoTranslate("en");
      }
    })();
    // Runs once when the editor opens for an existing question — deliberately not
    // re-run on every keystroke, so only the mount-time `initial` snapshot is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addOption() {
    setS((prev) => ({ ...prev, options: [...prev.options, blankOption()] }));
  }
  function updateOption(i: number, field: keyof EditorOption, val: string) {
    setS((prev) => ({ ...prev, options: prev.options.map((o, idx) => idx === i ? { ...o, [field]: val } : o) }));
  }
  function removeOption(i: number) {
    setS((prev) => ({ ...prev, options: prev.options.filter((_, idx) => idx !== i) }));
  }
  function moveOption(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= s.options.length) return;
    const opts = [...s.options];
    [opts[i], opts[j]] = [opts[j], opts[i]];
    setS((prev) => ({ ...prev, options: opts }));
  }

  function handleSave() {
    if (!s.label.trim() && !s.labelRu.trim() && !s.labelEn.trim() && s.type !== "section-header") return;
    onSave(editorToQuestion(s));
  }

  const validQuestions = allQuestions.filter(q => q.id !== s.id && (q.type === "single-select" || q.type === "yes-no"));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }}
        className="bg-white w-full sm:rounded-3xl sm:border sm:border-gray-100 sm:max-w-4xl max-h-[95vh] flex flex-col shadow-2xl">

        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Languages className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-base">{initial ? "Savolni tahrirlash" : "Yangi savol qo'shish"}</p>
              <p className="text-xs text-gray-400 mt-0.5">Barcha o'zgarishlar sahifaga "Saqlash" tugmasida qo'llanadi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPreview(!showPreview)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${showPreview ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Left: Fields ── */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 min-w-0">

            {/* Savol turi */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">Savol turi</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {QUESTION_TYPES.map((t) => (
                  <button key={t.value} onClick={() => set("type", t.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${s.type === t.value ? "border-blue-500 bg-blue-600 text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-blue-50"}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Language tabs ── */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <LangTabs lang={editorLang} onChange={handleLangChange} uzFilled={uzFilled} ruFilled={ruFilled} enFilled={enFilled} />
              {editorLang !== "uz" && (
                <div className="flex items-center gap-2">
                  <button onClick={() => autoTranslate(editorLang as "ru" | "en")} disabled={translating || !uzFilled}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                    Avtomatik tarjima
                  </button>
                  <button onClick={copyFromUz}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors">
                    <Copy className="w-3 h-3" />
                    O'zbekchadan nusxa
                  </button>
                </div>
              )}
            </div>

            {/* Savol matni */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                {editorLang === "uz" ? "Savol matni (O'zbek)" : editorLang === "ru" ? "Savol matni (Русский)" : "Savol matni (English)"}
                {s.type !== "section-header" && editorLang === "uz" && <span className="text-red-400 ml-1">*</span>}
              </label>
              <textarea rows={2} value={activeLabelVal}
                onChange={(e) => set(activeLabelKey, e.target.value)}
                placeholder={
                  editorLang === "uz"
                    ? (s.type === "section-header" ? "Bo'lim nomi…" : "Savol matnini yozing...")
                    : editorLang === "ru"
                      ? (s.type === "section-header" ? "Название раздела…" : "Введите текст вопроса...")
                      : (s.type === "section-header" ? "Section title…" : "Type the question text...")
                }
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 resize-none transition-all" />
              {editorLang !== "uz" && !activeLabelVal.trim() && uzFilled && (
                <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                  <span>⚠️</span> {editorLang === "ru" ? "Rus tilidagi tarjima yo'q — UZ matni zaxira sifatida ishlatiladi" : "Inglizcha tarjima yo'q — UZ matni zaxira sifatida ishlatiladi"}
                </p>
              )}
            </div>

            {/* Location type info */}
            {s.type === "location" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <p className="text-sm font-bold text-blue-800">Smart Manzil Selectori</p>
                </div>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Bu savol qo'llanuvchiga ikki variant taklif qiladi: <strong>Mening manzilim</strong> (profildan) yoki <strong>Boshqa manzil</strong> (Toshkent shahri tumanlari yoki Toshkent viloyati shaharlari).
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold">🏙 Toshkent shahri → 12 tuman</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-semibold">🗺 Toshkent viloyati → 22 shahar</span>
                </div>
              </div>
            )}

            {/* Options */}
            {needsOptions && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400">
                    Variantlar <span className="text-gray-300 font-normal normal-case">(tortib joyini o'zgartiring)</span>
                  </label>
                  {editorLang === "ru" && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">РУС variantlarini kiriting</span>
                  )}
                  {editorLang === "en" && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">EN variantlarini kiriting</span>
                  )}
                </div>
                <div className="space-y-2">
                  {s.options.map((opt, i) => (
                    <OptionRow key={opt._key} opt={opt} index={i} total={s.options.length} lang={editorLang}
                      otherExists={s.options.some((o, j) => j !== i && o.type === "other")}
                      onChange={(f, v) => updateOption(i, f, v)}
                      onDelete={() => removeOption(i)}
                      onMove={(d) => moveOption(i, d)}
                      isDragging={dragIdx.current === i}
                      onDragStart={() => { dragIdx.current = i; }}
                      onDragOver={() => {}}
                      onDrop={() => {
                        if (dragIdx.current === null || dragIdx.current === i) return;
                        const opts = [...s.options];
                        const [moved] = opts.splice(dragIdx.current, 1);
                        opts.splice(i, 0, moved);
                        setS((prev) => ({ ...prev, options: opts }));
                        dragIdx.current = null;
                      }}
                    />
                  ))}
                </div>
                <button onClick={addOption}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Variant qo'shish
                </button>
              </div>
            )}

            {/* Conditional Branches */}
            {needsOptions && (
              <div className="border border-violet-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-violet-50">
                  <GitBranch className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  <p className="text-sm font-bold text-violet-800 flex-1">Shartli savollar (Follow-ups)</p>
                  {Object.values(s.conditionalBranches).flat().length > 0 && (
                    <span className="text-[10px] bg-violet-200 text-violet-800 font-bold px-2 py-0.5 rounded-full">
                      {Object.values(s.conditionalBranches).flat().length} ta savol
                    </span>
                  )}
                </div>
                <div className="divide-y divide-violet-100">
                  {s.options.filter((o) => o.label.trim() || o.labelRu.trim() || o.labelEn.trim()).length === 0 && (
                    <p className="px-4 py-3 text-xs text-gray-400 italic">Avval variantlar qo'shing</p>
                  )}
                  {s.options.filter((o) => o.label.trim() || o.labelRu.trim() || o.labelEn.trim()).map((opt) => {
                    const optVal = opt.value.trim() || (opt.label || opt.labelRu || opt.labelEn).trim().toLowerCase().replace(/\s+/g, "_");
                    const displayLabel = editorLang === "ru" ? (opt.labelRu || opt.label) : editorLang === "en" ? (opt.labelEn || opt.label) : opt.label;
                    const branches = s.conditionalBranches[optVal] ?? [];
                    return (
                      <div key={opt._key} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{displayLabel}</span>
                        {branches.length > 0 && (
                          <span className="text-[10px] bg-violet-100 text-violet-700 font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                            {branches.length} savol
                          </span>
                        )}
                        <button onClick={() => setBranchEditorFor(optVal)}
                          className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0">
                          {branches.length > 0 ? "Tahrirlash" : "+ Qo'shish"}
                        </button>
                        {branches.length > 0 && (
                          <button onClick={() => setS((prev) => ({
                            ...prev,
                            conditionalBranches: Object.fromEntries(
                              Object.entries(prev.conditionalBranches).filter(([k]) => k !== optVal)
                            ),
                          }))} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Placeholder */}
            {needsPlaceholder && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                  {editorLang === "uz" ? "Placeholder (O'zbek)" : editorLang === "ru" ? "Placeholder (Русский)" : "Placeholder (English)"}
                </label>
                <input value={activePlaceholderVal}
                  onChange={(e) => set(activePlaceholderKey, e.target.value)}
                  placeholder={editorLang === "uz" ? "Foydalanuvchi uchun misol matn…" : editorLang === "ru" ? "Пример текста для пользователя…" : "Example text for the user…"}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all" />
              </div>
            )}

            {/* Autofill examples */}
            {(s.type === "text" || s.type === "textarea") && (() => {
              const activeExamplesKey = editorLang === "uz" ? "autofillExamples" : editorLang === "ru" ? "autofillExamplesRu" : "autofillExamplesEn";
              const currentList = (s[activeExamplesKey] ?? []) as string[];
              const labelText =
                editorLang === "uz"
                  ? "Misol javoblar (autofill chips)"
                  : editorLang === "ru"
                  ? "Примеры ответов (autofill chips)"
                  : "Example answers (autofill chips)";
              const plText =
                editorLang === "uz" ? "Misol" : editorLang === "ru" ? "Пример" : "Example";
              const addText =
                editorLang === "uz" ? "Misol qo'shish" : editorLang === "ru" ? "Добавить пример" : "Add example";

              return (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                    {labelText}
                  </label>
                  <div className="space-y-2">
                    {currentList.map((ex, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={ex}
                          onChange={(e) => {
                            const next = [...currentList];
                            next[idx] = e.target.value;
                            set(activeExamplesKey, next);
                          }}
                          placeholder={`${plText} ${idx + 1}…`}
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                        />
                        <button
                          onClick={() => {
                            const next = currentList.filter((_, i) => i !== idx);
                            set(activeExamplesKey, next);
                          }}
                          className="p-1.5 text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => set(activeExamplesKey, [...currentList, ""])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-blue-300 text-blue-600 text-xs font-semibold hover:bg-blue-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {addText}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Numeric range */}
            {needsNumeric && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">Min / Max / Qadam</label>
                <div className="grid grid-cols-3 gap-2">
                  {([["min", "Min"], ["max", "Max"], ["step", "Qadam"]] as const).map(([k, pl]) => (
                    <div key={k}>
                      <p className="text-[10px] text-gray-400 mb-1">{pl}</p>
                      <input type="number" value={(s as any)[k]} onChange={(e) => set(k as any, e.target.value)}
                        placeholder={pl}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 transition-all" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Help text */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide text-gray-400 mb-1.5">
                {editorLang === "uz" ? "Yordam matni (O'zbek)" : editorLang === "ru" ? "Yordam matni (Русский)" : "Yordam matni (English)"}
              </label>
              <input value={activeHelpVal}
                onChange={(e) => set(activeHelpKey, e.target.value)}
                placeholder={editorLang === "uz" ? "Foydalanuvchiga qo'shimcha izoh…" : editorLang === "ru" ? "Дополнительное пояснение для пользователя…" : "Additional hint for the user…"}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all" />
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Majburiy</p>
                  <p className="text-xs text-gray-400">* belgisi qo'shiladi</p>
                </div>
                <Toggle checked={s.required} onChange={(v) => set("required", v)} size="sm" />
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div>
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />Yadro</p>
                  <p className="text-xs text-amber-600">Barcha kategoriyada</p>
                </div>
                <Toggle checked={s.isCore} onChange={(v) => set("isCore", v)} size="sm" />
              </div>
            </div>

            {/* Conditional display */}
            {validQuestions.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => set("condEnabled", !s.condEnabled)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">Shartli ko'rinish</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.condEnabled && <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">YOQIQ</span>}
                    <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${s.condEnabled ? "rotate-90" : ""}`} />
                  </div>
                </button>
                {s.condEnabled && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3 bg-blue-50/30">
                    <p className="text-xs text-gray-500">Bu savolni faqat quyidagi shart bajarilganda ko'rsatish:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-400 mb-1">Savol</p>
                        <select value={s.condQuestionId} onChange={(e) => set("condQuestionId", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-300">
                          <option value="">Tanlang…</option>
                          {validQuestions.map((q) => (
                            <option key={q.id} value={q.id}>{q.label.slice(0, 40)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 mb-1">Javob qiymati</p>
                        {s.condQuestionId && validQuestions.find(q => q.id === s.condQuestionId)?.options?.length ? (
                          <select value={s.condValue} onChange={(e) => set("condValue", e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-300">
                            <option value="">Tanlang…</option>
                            {validQuestions.find(q => q.id === s.condQuestionId)?.options?.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input value={s.condValue} onChange={(e) => set("condValue", e.target.value)}
                            placeholder="Ha yoki yo'q…"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Live Preview ── */}
          {showPreview && (
            <div className="hidden sm:flex w-72 flex-shrink-0 border-l border-gray-100 bg-gray-50/60 flex-col">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-gray-400" />
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Ko'rinish</p>
                </div>
                {/* Preview language toggle */}
                <div className="flex gap-1">
                  {(["uz", "ru", "en"] as const).map((l) => (
                    <button key={l} onClick={() => setEditorLang(l)}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${editorLang === l ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-600"}`}>
                      {l === "uz" ? "🇺🇿" : l === "ru" ? "🇷🇺" : "🇬🇧"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <QuestionPreview q={s} lang={editorLang} />
                </div>
                {(!ruFilled || !enFilled) && (
                  <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 font-medium">
                      {!ruFilled && !enFilled ? "Rus va ingliz tilidagi tarjima yo'q" : !ruFilled ? "Rus tilidagi tarjima yo'q" : "Ingliz tilidagi tarjima yo'q"}
                    </p>
                  </div>
                )}
                {s.condEnabled && s.condQuestionId && (
                  <div className="mt-3 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 font-medium">Bu savol faqat shart bajarilganda ko'rinadi</p>
                  </div>
                )}
                {s.isCore && (
                  <div className="mt-3 flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                    <Star className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5 fill-yellow-400" />
                    <p className="text-xs text-yellow-700 font-medium">Yadro savol — barcha kategoriyalarda ko'rinadi</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="border-t border-gray-100 px-5 py-4 flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1 font-semibold border-gray-200">Bekor qilish</Button>
          <Button onClick={handleSave}
            disabled={!s.label.trim() && !s.labelRu.trim() && !s.labelEn.trim() && s.type !== "section-header"}
            className="flex-1 font-bold bg-blue-600 hover:bg-blue-700 gap-2 disabled:opacity-40">
            <Save className="w-4 h-4" /> {initial ? "Saqlash" : "Qo'shish"}
          </Button>
        </div>

        {/* Branch editor overlay */}
        <AnimatePresence>
          {branchEditorFor && (
            <BranchPanelModal
              optionLabel={
                s.options.find((o) => (o.value.trim() || (o.label || o.labelRu || o.labelEn).trim().toLowerCase().replace(/\s+/g, "_")) === branchEditorFor)?.label ?? branchEditorFor
              }
              optionValue={branchEditorFor}
              questions={s.conditionalBranches[branchEditorFor] ?? []}
              allQuestions={allQuestions}
              onChange={(qs) => setS((prev) => ({
                ...prev,
                conditionalBranches: { ...prev.conditionalBranches, [branchEditorFor]: qs },
              }))}
              onClose={() => setBranchEditorFor(null)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Translation Completeness Badge ─────────────────────────────── */
function TranslationBadge({ q }: { q: Question }) {
  const hasRu = !!(q.labelLocalized?.ru?.trim());
  const hasEn = !!(q.labelLocalized?.en?.trim());
  if (!hasRu || !hasEn) {
    const missing = !hasRu && !hasEn ? "RU + EN" : !hasRu ? "RU" : "EN";
    return (
      <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0"
        title={`Tarjima yo'q: ${missing}`}>
        {!hasRu && "🇷🇺"}{!hasEn && "🇬🇧"} ⚠️
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex-shrink-0"
      title="Barcha tillarda to'ldirilgan">
      🇺🇿🇷🇺🇬🇧 ✅
    </span>
  );
}

/* ─── Question Card ──────────────────────────────────────────────── */
function QuestionCard({
  q, index, total,
  onEdit, onDelete, onMove,
}: {
  q: Question; index: number; total: number;
  onEdit: () => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const hasOther = q.options?.some(o => o.type === "other");
  const typeLabel = TYPE_LABELS[q.type] ?? q.type;
  const totalBranchQuestions = q.conditionalBranches
    ? Object.values(q.conditionalBranches).flat().length
    : 0;

  if (q.type === "section-header") {
    return (
      <div className="group flex items-center gap-3 px-5 py-3 bg-blue-50 border-b border-gray-50 hover:bg-blue-100 transition-colors">
        <Layers className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <p className="flex-1 text-sm font-extrabold text-blue-700">{q.label}</p>
        <TranslationBadge q={q} />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-100 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="group px-5 py-3.5 flex items-start gap-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
      <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5">
        <button onClick={() => onMove(-1)} disabled={index === 0}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onMove(1)} disabled={index === total - 1}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="text-sm font-semibold text-gray-900 truncate max-w-xs">{q.label}</p>
          {q.required && <span className="text-red-500 text-xs font-bold">*</span>}
          {q.isCore && <Star className="w-3 h-3 fill-amber-400 text-amber-400 flex-shrink-0" />}
          {q.conditional && <GitBranch className="w-3 h-3 text-blue-400 flex-shrink-0" />}
          <TranslationBadge q={q} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">{typeLabel}</span>
          {q.options && (
            <span className="text-[11px] text-gray-400">{q.options.length} variant</span>
          )}
          {hasOther && (
            <span className="text-[11px] bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-semibold">+ Boshqa</span>
          )}
          {totalBranchQuestions > 0 && (
            <span className="text-[11px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <GitBranch className="w-2.5 h-2.5" />{totalBranchQuestions} ta filial
            </span>
          )}
          {q.options && q.options.length > 0 && (
            <span className="text-[11px] text-gray-300 truncate max-w-[160px]">
              {q.options.slice(0, 3).map(o => o.label).join(", ")}{q.options.length > 3 ? "…" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-all duration-200">
        <button onClick={onEdit} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Questions Panel ────────────────────────────────────────────── */
function QuestionsPanel({
  title, emoji, subtitle,
  questions, onChange, allQuestionsForCond,
  accent = "blue",
}: {
  title: string; emoji?: string; subtitle?: string;
  questions: Question[];
  onChange: (qs: Question[]) => void;
  allQuestionsForCond: Question[];
  accent?: "blue" | "amber";
}) {
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const qs = [...questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    onChange(qs);
  }
  function del(i: number) { onChange(questions.filter((_, idx) => idx !== i)); }
  function save(q: Question) {
    const qs = editingIdx !== null
      ? questions.map((orig, i) => (i === editingIdx ? q : orig))
      : [...questions, q];
    onChange(qs);
    setEditorState(null); setEditingIdx(null); setShowAdd(false);
  }

  const borderColor = accent === "amber" ? "border-amber-200" : "border-gray-100";
  const headerBg = accent === "amber" ? "bg-amber-50" : "bg-white";
  const addColor = accent === "amber" ? "text-amber-600 hover:text-amber-700" : "text-blue-600 hover:text-blue-700";

  /* Translation completeness stats */
  const total = questions.length;
  const withRu = questions.filter(q => q.labelLocalized?.ru?.trim()).length;
  const pct = total > 0 ? Math.round((withRu / total) * 100) : 100;

  return (
    <div className={`bg-white rounded-2xl border ${borderColor} overflow-hidden mb-4 shadow-sm`}>
      <div className={`px-5 py-4 border-b border-gray-50 ${headerBg} flex items-center gap-3`}>
        {emoji && <span className="text-2xl leading-none">{emoji}</span>}
        <div className="flex-1">
          <p className="font-bold text-gray-900 text-sm">{title}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        <span className="text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">{questions.length} savol</span>
        {/* Translation completeness indicator */}
        {total > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${pct === 100 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
            title={`${withRu}/${total} ta savolda RU tarjima bor`}>
            🇷🇺 {pct}%
          </span>
        )}
      </div>

      {questions.length === 0 && (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-400">Hali savol yo'q</p>
        </div>
      )}

      <div>
        {questions.map((q, i) => (
          <QuestionCard key={q.id} q={q} index={i} total={questions.length}
            onEdit={() => { setEditorState(editorFromQuestion(q)); setEditingIdx(i); }}
            onDelete={() => del(i)}
            onMove={(d) => move(i, d)} />
        ))}
      </div>

      <div className="px-5 py-4 border-t border-gray-50">
        <button onClick={() => { setShowAdd(true); setEditorState(null); setEditingIdx(null); }}
          className={`flex items-center gap-2 text-sm font-semibold transition-colors ${addColor}`}>
          <Plus className="w-4 h-4" /> Savol qo'shish
        </button>
      </div>

      <AnimatePresence>
        {(editorState !== null || showAdd) && (
          <QuestionEditorModal
            initial={editorState ?? undefined}
            allQuestions={allQuestionsForCond}
            onSave={save}
            onClose={() => { setEditorState(null); setEditingIdx(null); setShowAdd(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Category Panel ─────────────────────────────────────────────── */
function CategoryPanel({
  cat, onChange, commonQuestions,
}: {
  cat: CategoryConfig; onChange: (c: CategoryConfig) => void; commonQuestions: Question[];
}) {
  const allQuestionsForCond = [...cat.questions, ...commonQuestions];

  return (
    <div>
      <div className="mb-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
        <TangaCoin size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-amber-800 uppercase tracking-wide">Bu kategoriya uchun asosiy narx</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Har qanday taklif yuborishda qo'shiladigan Tanga miqdori</p>
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded-xl px-3 py-1.5 flex-shrink-0">
          <input type="number" min="0" value={cat.baseCost ?? 0}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onChange({ ...cat, baseCost: isNaN(v) ? 0 : Math.max(0, v) });
            }}
            className="w-14 bg-transparent text-sm font-extrabold text-amber-900 focus:outline-none text-center"
          />
          <span className="text-xs font-bold text-amber-600">Tanga</span>
        </div>
      </div>

      <QuestionsPanel
        title={cat.name}
        emoji={cat.emoji}
        subtitle={`${cat.questions.length} ta o'ziga xos savol · ${commonQuestions.length} ta umumiy savol qo'shiladi`}
        questions={cat.questions}
        onChange={(qs) => onChange({ ...cat, questions: qs })}
        allQuestionsForCond={allQuestionsForCond}
      />
    </div>
  );
}

/* ─── Embedded panel (used inside /admin Toifalar tab) ────────────── */
export function QuestionsEmbedded() {
  const [categories, setCategories] = useState<CategoryConfig[]>(getCategories);
  const [commonQuestions, setCommonQuestions] = useState<Question[]>(getCommonQuestions);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Re-sync category list whenever the category store changes (e.g. after
  // admin creates/deactivates a category in CategoryManagementPanel).
  useEffect(() => {
    return onStoreChange(() => {
      setCategories(getCategories());
    });
  }, []);

  function updateCategory(updated: CategoryConfig) {
    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setDirty(true); setSaved(false);
  }
  function updateCommon(qs: Question[]) {
    setCommonQuestions(qs); setDirty(true); setSaved(false);
  }
  async function handleSave() {
    await saveCategories(categories);
    await saveCommonQuestions(commonQuestions);
    setCategories(getCategories()); setCommonQuestions(getCommonQuestions());
    setSaved(true); setDirty(false);
    setTimeout(() => setSaved(false), 2500);
  }
  async function handleReset() {
    await resetCategories();
    setCategories(getCategories()); setCommonQuestions(getCommonQuestions());
    setDirty(false); setSaved(false); setShowResetConfirm(false);
  }

  const displayed = activeTab && activeTab !== "common"
    ? categories.filter((c) => c.id === activeTab)
    : categories;

  /* Global translation completeness */
  const allQs = [...commonQuestions, ...categories.flatMap(c => c.questions)];
  const ruCount = allQs.filter(q => q.labelLocalized?.ru?.trim()).length;
  const totalQs = allQs.length;
  const globalPct = totalQs > 0 ? Math.round((ruCount / totalQs) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-sm text-gray-900">Savol muharriri</p>
          <p className="text-xs text-gray-400">{categories.length} ta kategoriya · {commonQuestions.length} ta umumiy savol</p>
        </div>
        {/* Global RU completeness */}
        <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${globalPct === 100 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}
          title={`${ruCount}/${totalQs} savol RU tarjimaga ega`}>
          <Languages className="w-3.5 h-3.5" /> РУС {globalPct}%
        </span>
        {dirty && (
          <span className="flex items-center gap-1 text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex-shrink-0">
            <AlertTriangle className="w-3 h-3" /> Saqlanmagan
          </span>
        )}
        <button onClick={() => setShowResetConfirm(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Asl holatga qaytarish">
          <RefreshCw className="w-4 h-4" />
        </button>
        <Button onClick={handleSave}
          className={`h-9 px-4 font-bold text-sm gap-2 flex-shrink-0 transition-all ${saved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"}`}>
          {saved ? <><Check className="w-4 h-4" /> Saqlandi!</> : <><Save className="w-4 h-4" /> Saqlash</>}
        </Button>
      </div>

      {/* ── Category tabs ── */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <button onClick={() => setActiveTab(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === null ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
          Hammasi
        </button>
        <button onClick={() => setActiveTab("common")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-colors ${activeTab === "common" ? "bg-amber-500 text-white shadow-sm" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
          <Star className="w-3 h-3 fill-current" /> Umumiy
        </button>
        {categories.map((c) => {
          const meta = getCategory(c.id);
          const name = meta ? getCategoryDisplayName(c.id, "uz") : c.name;
          const emoji = meta?.emoji ?? c.emoji;
          return (
            <button key={c.id} onClick={() => setActiveTab(activeTab === c.id ? null : c.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === c.id ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {emoji} {name}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {(activeTab === null || activeTab === "common") && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <QuestionsPanel
            title="Umumiy savollar (Barcha kategoriyalar)"
            emoji="⭐"
            subtitle="Bu savollar har bir kategoriyaning oxirida avtomatik qo'shiladi"
            questions={commonQuestions}
            onChange={updateCommon}
            allQuestionsForCond={commonQuestions}
            accent="amber"
          />
        </motion.div>
      )}
      {activeTab !== "common" && (
        <AnimatePresence mode="popLayout">
          {displayed.map((cat) => {
            const meta = getCategory(cat.id);
            const merged: CategoryConfig = meta
              ? { ...cat, name: getCategoryDisplayName(cat.id, "uz"), emoji: meta.emoji }
              : cat;
            return (
              <motion.div key={cat.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                <CategoryPanel cat={merged} onChange={updateCategory} commonQuestions={commonQuestions} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      <p className="text-center text-xs text-gray-400 pb-4">
        O'zgarishlar faqat "Saqlash" tugmasini bosganingizda qo'llanadi
      </p>

      {/* ── Reset confirm ── */}
      <AnimatePresence>
        {showResetConfirm && (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowResetConfirm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border border-gray-100 p-6 w-full max-w-sm shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="font-extrabold text-gray-900 mb-2">Qayta tiklash</h3>
                <p className="text-sm text-gray-500 mb-6">Barcha savol konfiguratsiyasi <strong>asl holatga</strong> qaytariladi. Bu amalni bekor qilib bo'lmaydi.</p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowResetConfirm(false)} className="flex-1 border-gray-200 font-semibold">Bekor</Button>
                  <Button onClick={handleReset} className="flex-1 bg-red-500 hover:bg-red-600 font-bold text-white">Ha, tiklash</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main Admin Page (standalone /admin/questions route) ────────── */
export default function AdminQuestionsPage() {
  const [authed, setAuthed] = useState(false);
  const [categories, setCategories] = useState<CategoryConfig[]>(getCategories);
  const [commonQuestions, setCommonQuestions] = useState<Question[]>(getCommonQuestions);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  function updateCategory(updated: CategoryConfig) {
    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setDirty(true); setSaved(false);
  }
  function updateCommon(qs: Question[]) {
    setCommonQuestions(qs); setDirty(true); setSaved(false);
  }
  async function handleSave() {
    await saveCategories(categories);
    await saveCommonQuestions(commonQuestions);
    setCategories(getCategories()); setCommonQuestions(getCommonQuestions());
    setSaved(true); setDirty(false);
    setTimeout(() => setSaved(false), 2500);
  }
  async function handleReset() {
    await resetCategories();
    setCategories(getCategories()); setCommonQuestions(getCommonQuestions());
    setDirty(false); setSaved(false); setShowResetConfirm(false);
  }

  const displayed = activeTab && activeTab !== "common"
    ? categories.filter((c) => c.id === activeTab)
    : categories;

  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-extrabold text-sm text-gray-900 truncate">Savollar boshqaruvi</p>
            <p className="text-xs text-gray-400">{categories.length} ta kategoriya · {commonQuestions.length} ta umumiy savol</p>
          </div>
          {dirty && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              <AlertTriangle className="w-3 h-3" /> Saqlanmagan
            </span>
          )}
          <button onClick={() => setShowResetConfirm(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0">
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button onClick={handleSave}
            className={`h-9 px-4 font-bold text-sm gap-2 flex-shrink-0 transition-all ${saved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"}`}>
            {saved ? <><Check className="w-4 h-4" /> Saqlandi!</> : <><Save className="w-4 h-4" /> Saqlash</>}
          </Button>
        </div>

        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === null ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            Hammasi
          </button>
          <button onClick={() => setActiveTab("common")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-colors ${activeTab === "common" ? "bg-amber-500 text-white shadow-sm" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
            <Star className="w-3 h-3 fill-current" /> Umumiy
          </button>
          {categories.map((c) => {
            const meta = getCategory(c.id);
            const name = meta ? getCategoryDisplayName(c.id, "uz") : c.name;
            const emoji = meta?.emoji ?? c.emoji;
            return (
              <button key={c.id} onClick={() => setActiveTab(activeTab === c.id ? null : c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === c.id ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {emoji} {name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {(activeTab === null || activeTab === "common") && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <QuestionsPanel
              title="Umumiy savollar (Barcha kategoriyalar)"
              emoji="⭐"
              subtitle="Bu savollar har bir kategoriyaning oxirida avtomatik qo'shiladi"
              questions={commonQuestions}
              onChange={updateCommon}
              allQuestionsForCond={commonQuestions}
              accent="amber"
            />
          </motion.div>
        )}
        {activeTab !== "common" && (
          <AnimatePresence mode="popLayout">
            {displayed.map((cat) => {
              const meta = getCategory(cat.id);
              const merged: CategoryConfig = meta
                ? { ...cat, name: getCategoryDisplayName(cat.id, "uz"), emoji: meta.emoji }
                : cat;
              return (
                <motion.div key={cat.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                  <CategoryPanel cat={merged} onChange={updateCategory} commonQuestions={commonQuestions} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <p className="text-center text-xs text-gray-400 mt-4 pb-8">
          O'zgarishlar faqat "Saqlash" tugmasini bosganingizda qo'llanadi
        </p>
      </div>

      <AnimatePresence>
        {showResetConfirm && (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowResetConfirm(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border border-gray-100 p-6 w-full max-w-sm shadow-xl">
                <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="font-extrabold text-gray-900 mb-2">Qayta tiklash</h3>
                <p className="text-sm text-gray-500 mb-6">Barcha savol konfiguratsiyasi <strong>asl holatga</strong> qaytariladi. Bu amalni bekor qilib bo'lmaydi.</p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowResetConfirm(false)} className="flex-1 border-gray-200 font-semibold">Bekor</Button>
                  <Button onClick={handleReset} className="flex-1 bg-red-500 hover:bg-red-600 font-bold text-white">Ha, tiklash</Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
