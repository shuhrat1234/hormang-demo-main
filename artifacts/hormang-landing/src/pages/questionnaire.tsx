import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useSearch } from "wouter";
import {
  ChevronLeft, ChevronRight, Check, CheckCircle2,
  FileText, Clock, Upload, X, MapPin, ChevronDown, Camera,
} from "lucide-react";
import { MediaUploadZone } from "@/components/media-upload";
import { Button } from "@/components/ui/button";
import {
  getCategories, getAllQuestionsForCategory, getCategoryById, collectActiveQuestions,
  type Question, type CategoryConfig,
} from "@/lib/questionnaire-store";
import {
  saveNewRequest,
  type CooldownState,
} from "@/lib/requests-store";
import { fetchRequestCooldown } from "@/lib/requests-client";
import { savePendingRequest, getPendingRequest, clearPendingRequest } from "@/lib/pending-request-store";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useI18n } from "@/contexts/i18n-context";
import { tFormat, type Locale } from "@/lib/i18n";
import { getLocalProfile } from "@/lib/local-profile";
import { getLocalizedText } from "@/lib/localization";
import { getCategoryDisplayName } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import { compressImage } from "@/lib/image-utils";
import { regionsList, TOSHKENT_DISTRICTS, getDistrictLabel, getRegionLabel } from "@/lib/regions";
import logoImg from "/hormang-logo.png";

/* ─── Types ─────────────────────────────────────────────────────── */
type Stage = "select-category" | "questions" | "summary" | "recommendations";
export interface LocationAnswer {
  mode: "profile" | "custom";
  region: string;         // "Toshkent shahri" | "Angren" | ... | ""
  district?: string;      // set only when region === "Toshkent shahri"
  regionType?: "shahri" | "viloyati"; // tracks custom two-level state
}
export type Answers = Record<string, string | string[] | boolean | number | null | LocationAnswer>;

/**
 * The questionnaire always collects a location as an `answers.location`
 * field (see LocationAnswer above), but saveNewRequest() needs it as a
 * separate top-level {region, district} — without this extraction the
 * request's dedicated region/district columns stay null even though the
 * customer did pick a location, which silently hides the request from any
 * provider whose service-area filter checks those columns.
 */
function locationFromAnswers(a: Answers): { region?: string; district?: string } | undefined {
  const loc = a.location as LocationAnswer | undefined;
  if (!loc?.region) return undefined;
  return { region: loc.region, district: loc.district };
}

const URGENCY_COLORS: Record<string, string> = {
  today_tomorrow: "text-red-600 bg-red-50 border-red-200",
  "3_7_days": "text-orange-600 bg-orange-50 border-orange-200",
  "1_2_weeks": "text-yellow-700 bg-yellow-50 border-yellow-200",
  "1_month": "text-emerald-600 bg-emerald-50 border-emerald-200",
  flexible: "text-gray-600 bg-gray-50 border-gray-200",
};

/* ─── Answer formatting helpers ─────────────────────────────────── */
interface FormatLabels { yes: string; no: string; fileUploaded: string; soum: string; budgetTpl: string; locale?: Locale }
function formatAnswer(question: Question, value: unknown, labels?: FormatLabels): string {
  if (value === null || value === undefined || value === "") return "—";
  if (question.type === "location") {
    if (typeof value !== "object" || !value) return "—";
    const loc = value as LocationAnswer;
    if (!loc.region) return "—";
    return loc.district ? `${loc.district}, ${loc.region}` : loc.region;
  }
  if (question.type === "multi-select" && Array.isArray(value)) {
    if (value.length === 0) return "—";
    const opts = question.options ?? [];
    return value.map((v) => {
      const opt = opts.find((o) => o.value === v);
      if (!opt) return String(v);
      return getLocalizedText(opt.labelLocalized ?? opt.label, labels?.locale ?? "uz");
    }).join(", ");
  }
  if (question.type === "single-select") {
    const opt = question.options?.find((o) => o.value === value);
    if (!opt) return String(value);
    return getLocalizedText(opt.labelLocalized ?? opt.label, labels?.locale ?? "uz");
  }
  if (question.type === "yes-no") return value ? (labels?.yes ?? "Ha") : (labels?.no ?? "Yo'q");
  if (question.type === "file") return value ? (labels?.fileUploaded ?? "Rasm yuklandi ✓") : "—";
  if (question.type === "number") {
    const n = Number(value);
    if (!n) return "—";
    if (question.id === "budget") return labels?.budgetTpl
      ? tFormat(labels.budgetTpl, { n: n.toLocaleString() })
      : `${n.toLocaleString()} so'm`;
    return String(n);
  }
  return String(value);
}

/* ─── Required follow-up validation helper ───────────────────────── */
function isRequiredBranchAnswered(bq: Question, answers: Answers): boolean {
  if (bq.required) {
    const val = answers[bq.id] ?? (bq.type === "multi-select" ? [] : null);
    if (bq.type === "multi-select") {
      if (!Array.isArray(val) || val.length === 0) return false;
    } else if (bq.type === "range") {
      // range always has a displayable value
    } else {
      if (val === null || val === undefined || val === "") return false;
    }
  }
  // Validate number min/max even for non-required branch questions
  if (bq.type === "number") {
    const val = answers[bq.id];
    if (val != null && val !== "") {
      const n = Number(val);
      if (bq.min != null && n < bq.min) return false;
      if (bq.max != null && n > bq.max) return false;
    }
  }
  // Recurse into nested branches
  const nested = getActiveBranchesRaw(bq, answers);
  for (const nbq of nested) {
    if (!isRequiredBranchAnswered(nbq, answers)) return false;
  }
  return true;
}

function getActiveBranchesRaw(q: Question, answers: Answers): Question[] {
  if (!q.conditionalBranches) return [];
  if (q.type === "single-select") {
    const val = answers[q.id] as string | null;
    if (!val) return [];
    return q.conditionalBranches[val] ?? [];
  }
  if (q.type === "multi-select") {
    const vals = (answers[q.id] as string[]) ?? [];
    const result: Question[] = [];
    const seen = new Set<string>();
    for (const val of vals) {
      for (const bq of q.conditionalBranches[val] ?? []) {
        if (!seen.has(bq.id)) { seen.add(bq.id); result.push(bq); }
      }
    }
    return result;
  }
  return [];
}

/* ─── Conditional branch helpers ────────────────────────────────── */
function getActiveBranches(q: Question, answers: Answers): Question[] {
  if (!q.conditionalBranches) return [];
  if (q.type === "single-select") {
    const val = answers[q.id] as string | null;
    if (!val) return [];
    return q.conditionalBranches[val] ?? [];
  }
  if (q.type === "multi-select") {
    const vals = (answers[q.id] as string[]) ?? [];
    const result: Question[] = [];
    const seen = new Set<string>();
    for (const val of vals) {
      for (const bq of q.conditionalBranches[val] ?? []) {
        if (!seen.has(bq.id)) { seen.add(bq.id); result.push(bq); }
      }
    }
    return result;
  }
  return [];
}

/* ─── Inline conditional questions block ─────────────────────────── */
function ConditionalInlineBlock({
  questions,
  answers,
  onChange,
}: {
  questions: Question[];
  answers: Answers;
  onChange: (id: string, val: unknown) => void;
}) {
  const { t, locale } = useI18n();
  if (questions.length === 0) return null;

  const pillBase = "px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-150 cursor-pointer select-none";
  const pillOff = `${pillBase} border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600`;
  const pillOn = `${pillBase} border-blue-500 bg-blue-600 text-white shadow-sm`;
  const otherInputClass = "w-full px-4 py-3.5 rounded-2xl border border-blue-300 bg-blue-50/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      className="mt-5 border-l-2 border-blue-200 pl-4 space-y-6"
    >
      {questions.map((bq) => {
        const bVal = answers[bq.id] ?? (bq.type === "multi-select" ? [] : null);
        const nestedBranches = getActiveBranches(bq, answers);
        return (
          <div key={bq.id}>
            <div className="mb-3">
              <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest">{t.questionnaire.followUpLabel}</span>
              <h3 className="text-base font-bold text-gray-800 mt-0.5 leading-snug">
                {getLocalizedText(bq.labelLocalized ?? bq.label, locale)}
                {bq.required && <span className="text-red-500 ml-1" title={t.questionnaire.requiredTitle}>*</span>}
              </h3>
              {bq.helpText && <p className="text-xs text-gray-400 mt-0.5">{getLocalizedText(bq.helpTextLocalized ?? bq.helpText, locale)}</p>}
            </div>

            {/* Inline QuestionInput — only for common types to keep it concise */}
            {bq.type === "single-select" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {bq.options?.map((opt) => (
                    <button key={opt.value} onClick={() => { onChange(bq.id, bVal === opt.value ? null : opt.value); if (opt.type !== "other") onChange(bq.id + "_other", ""); }}
                      className={bVal === opt.value ? pillOn : pillOff}>
                      {bVal === opt.value && <Check className="w-3.5 h-3.5 inline mr-1.5" />}{getLocalizedText(opt.labelLocalized ?? opt.label, locale)}
                    </button>
                  ))}
                </div>
                {bq.options?.find((o) => o.value === bVal && o.type === "other") && (
                  <input autoFocus value={(answers[bq.id + "_other"] as string) ?? ""} onChange={(e) => onChange(bq.id + "_other", e.target.value)} placeholder={t.questionnaire.otherPlaceholder} className={otherInputClass} />
                )}
              </div>
            )}
            {bq.type === "multi-select" && (() => {
              const sel = Array.isArray(bVal) ? (bVal as string[]) : [];
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {bq.options?.map((opt) => {
                      const on = sel.includes(opt.value);
                      return (
                        <button key={opt.value} onClick={() => { const next = on ? sel.filter(x => x !== opt.value) : [...sel, opt.value]; onChange(bq.id, next); if (opt.type === "other" && on) onChange(bq.id + "_other", ""); }}
                          className={on ? pillOn : pillOff}>
                          {on && <Check className="w-3.5 h-3.5 inline mr-1.5" />}{getLocalizedText(opt.labelLocalized ?? opt.label, locale)}
                        </button>
                      );
                    })}
                  </div>
                  {bq.options?.find((o) => o.type === "other" && sel.includes(o.value)) && (
                    <input autoFocus value={(answers[bq.id + "_other"] as string) ?? ""} onChange={(e) => onChange(bq.id + "_other", e.target.value)} placeholder={t.questionnaire.otherPlaceholder} className={otherInputClass} />
                  )}
                </div>
              );
            })()}
            {bq.type === "text" && (() => {
              const bExamples = (bq.autofillExamples ?? []).filter(Boolean);
              return (
                <div className="space-y-2">
                  <input type="text" value={(bVal as string) ?? ""} onChange={(e) => onChange(bq.id, e.target.value)} placeholder={getLocalizedText(bq.placeholderLocalized ?? bq.placeholder, locale) || t.misc.textPlaceholder}
                    className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all" />
                  {bExamples.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {bExamples.map((ex, i) => (
                        <button key={i} type="button" onClick={() => onChange(bq.id, ex)}
                          className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">{ex}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {bq.type === "textarea" && (() => {
              const bExamples = (bq.autofillExamples ?? []).filter(Boolean);
              return (
                <div className="space-y-2">
                  <textarea rows={3} value={(bVal as string) ?? ""} onChange={(e) => onChange(bq.id, e.target.value)} placeholder={getLocalizedText(bq.placeholderLocalized ?? bq.placeholder, locale) || t.misc.textPlaceholder}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none transition-all" />
                  {bExamples.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {bExamples.map((ex, i) => (
                        <button key={i} type="button" onClick={() => onChange(bq.id, ex)}
                          className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all">{ex}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {bq.type === "number" && (() => {
              const bNum = bVal as number | null;
              const bHasMin = bq.min != null;
              const bHasMax = bq.max != null;
              const bOutOfRange = bNum != null && (
                (bHasMin && bNum < bq.min!) ||
                (bHasMax && bNum > bq.max!)
              );
              return (
                <div className="space-y-1.5">
                  <input type="number" value={bNum ?? ""} onChange={(e) => onChange(bq.id, e.target.value ? Number(e.target.value) : null)}
                    placeholder={bq.placeholder || "0"} min={bq.min} max={bq.max} step={bq.step}
                    className={`w-full px-4 py-3.5 rounded-2xl border bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${bOutOfRange ? "border-red-300 focus:ring-red-300/30 focus:border-red-400" : "border-gray-200 focus:ring-blue-500/30 focus:border-blue-400"}`} />
                  {(bHasMin || bHasMax) && !bOutOfRange && (
                    <p className="text-xs text-gray-400 px-1">{bHasMin && bHasMax ? `${bq.min} dan ${bq.max} gacha` : bHasMin ? `Minimal: ${bq.min}` : `Maksimal: ${bq.max}`}</p>
                  )}
                  {bOutOfRange && (
                    <p className="text-xs text-red-500 font-semibold px-1">Qiymat {bHasMin && bHasMax ? `${bq.min} dan ${bq.max} gacha` : bHasMin ? `${bq.min} dan katta yoki teng` : `${bq.max} dan kichik yoki teng`} bo'lishi kerak</p>
                  )}
                </div>
              );
            })()}
            {bq.type === "range" && (() => {
              const bMin = bq.min ?? 0;
              const bMax = bq.max ?? 100;
              const bStep = bq.step ?? 1;
              const bDisplay = (bVal as number) ?? bMin;
              const bPct = bMax === bMin ? 0 : ((bDisplay - bMin) / (bMax - bMin)) * 100;
              return (
                <div className="space-y-3 px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-extrabold text-blue-600">{bDisplay}</span>
                    {bq.helpText && <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded-lg">{bq.helpText}</span>}
                  </div>
                  <div className="relative py-1">
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${bPct}%` }} />
                    </div>
                    <input type="range" min={bMin} max={bMax} step={bStep} value={bDisplay}
                      onChange={(e) => onChange(bq.id, Number(e.target.value))}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 font-semibold">
                    <span>{bMin}</span><span>{bMax}</span>
                  </div>
                </div>
              );
            })()}
            {bq.type === "yes-no" && (
              <div className="flex gap-3">
                {([{ label: "Ha", v: true }, { label: "Yo'q", v: false }] as const).map(({ label, v }) => (
                  <button key={label} onClick={() => onChange(bq.id, v)}
                    className={`flex-1 py-3 rounded-2xl border text-sm font-bold transition-all ${bVal === v ? "border-blue-500 bg-blue-600 text-white shadow-sm" : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"}`}>
                    {bVal === v && <Check className="w-3.5 h-3.5 inline mr-1.5" />}{label}
                  </button>
                ))}
              </div>
            )}

            {/* Nested branches */}
            <AnimatePresence>
              {nestedBranches.length > 0 && (
                <ConditionalInlineBlock questions={nestedBranches} answers={answers} onChange={onChange} />
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}

/* ─── Location Question Component ───────────────────────────────── */
const VILOYAT_CITIES = regionsList.filter((r) => !r.isCapital).map((r) => r.value);

function LocationQuestionInput({
  value,
  onChange,
  userId,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  userId?: string;
}) {
  const { t, locale } = useI18n();
  const tq = t.questionnaire;
  const profile = userId ? getLocalProfile(userId) : {};
  const profileRegion = profile.region;
  const profileDistrict = profile.district;
  const hasProfileAddress = !!profileRegion;
  const profileDisplay = profileDistrict
    ? `${getDistrictLabel(profileDistrict, locale)}, ${getRegionLabel(profileRegion!, locale)}`
    : profileRegion ? getRegionLabel(profileRegion, locale) : "";

  const loc: LocationAnswer | null =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as LocationAnswer)
      : null;

  const currentMode = loc?.mode ?? (hasProfileAddress ? "profile" : "custom");
  const customRegionType = loc?.regionType;
  const customRegion = loc?.region ?? "";
  const customDistrict = loc?.district ?? "";

  function selectProfile() {
    if (!hasProfileAddress) return;
    onChange({ mode: "profile", region: profileRegion!, district: profileDistrict });
  }

  function selectCustom() {
    onChange({
      mode: "custom",
      region: loc?.mode === "custom" ? customRegion : "",
      district: loc?.mode === "custom" ? customDistrict : undefined,
      regionType: loc?.mode === "custom" ? customRegionType : undefined,
    } as LocationAnswer);
  }

  function pickRegionType(rt: "shahri" | "viloyati") {
    onChange({
      mode: "custom",
      regionType: rt,
      region: rt === "shahri" ? "Toshkent shahri" : "",
      district: undefined,
    } as LocationAnswer);
  }

  function pickDistrict(d: string) {
    onChange({ mode: "custom", regionType: "shahri", region: "Toshkent shahri", district: d } as LocationAnswer);
  }

  function pickViloyatCity(city: string) {
    onChange({ mode: "custom", regionType: "viloyati", region: city, district: undefined } as LocationAnswer);
  }

  const radioBase = "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all";
  const chipBase = "px-3 py-1.5 rounded-xl border text-sm font-medium transition-all cursor-pointer";
  const chipOff = `${chipBase} border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600`;
  const chipOn = `${chipBase} border-blue-500 bg-blue-600 text-white shadow-sm`;

  return (
    <div className="space-y-3">
      {/* Option A — saved profile address */}
      <button
        onClick={selectProfile}
        disabled={!hasProfileAddress}
        className={`w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
          currentMode === "profile" && hasProfileAddress
            ? "border-blue-500 bg-blue-50/70"
            : hasProfileAddress
            ? "border-gray-200 bg-white hover:border-blue-200"
            : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
        }`}
      >
        <div className={`${radioBase} mt-0.5 ${currentMode === "profile" && hasProfileAddress ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
          {currentMode === "profile" && hasProfileAddress && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-gray-900">{tq.myAddress}</p>
          </div>
          {hasProfileAddress ? (
            <p className="text-sm text-gray-500 truncate">{profileDisplay}</p>
          ) : (
            <p className="text-xs text-gray-400">{tq.noAddress}</p>
          )}
        </div>
      </button>

      {/* Option B — custom address */}
      <button
        onClick={selectCustom}
        className={`w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
          currentMode === "custom"
            ? "border-blue-500 bg-blue-50/70"
            : "border-gray-200 bg-white hover:border-blue-200"
        }`}
      >
        <div className={`${radioBase} mt-0.5 ${currentMode === "custom" ? "border-blue-500 bg-blue-500" : "border-gray-300"}`}>
          {currentMode === "custom" && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{tq.customAddress}</p>
          {currentMode === "custom" && customRegion && (
            <p className="text-sm text-gray-500 mt-0.5">
              {customDistrict
                ? `${getDistrictLabel(customDistrict, locale)}, ${getRegionLabel(customRegion, locale)}`
                : getRegionLabel(customRegion, locale)}
            </p>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${currentMode === "custom" ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded two-level selector */}
      <AnimatePresence>
        {currentMode === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-2 pt-1 space-y-4">
              {/* Level 1 — city / viloyat chooser */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{tq.selectRegion}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => pickRegionType("shahri")}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      customRegionType === "shahri"
                        ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                        : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                    }`}
                  >
                    {tq.toshkentCity}
                  </button>
                  <button
                    onClick={() => pickRegionType("viloyati")}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                      customRegionType === "viloyati"
                        ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                        : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                    }`}
                  >
                    {tq.toshkentRegion}
                  </button>
                </div>
              </div>

              {/* Level 2A — Toshkent districts */}
              {customRegionType === "shahri" && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{tq.selectDistrict}</p>
                  <div className="flex flex-wrap gap-2">
                    {TOSHKENT_DISTRICTS.map((d) => (
                      <button
                        key={d}
                        onClick={() => pickDistrict(d)}
                        className={customDistrict === d ? chipOn : chipOff}
                      >
                        {getDistrictLabel(d, locale)}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Level 2B — viloyat cities */}
              {customRegionType === "viloyati" && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{tq.selectCity}</p>
                  <div className="flex flex-wrap gap-2">
                    {VILOYAT_CITIES.map((city) => (
                      <button
                        key={city}
                        onClick={() => pickViloyatCity(city)}
                        className={customRegion === city ? chipOn : chipOff}
                      >
                        {getRegionLabel(city, locale)}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Single question renderer ───────────────────────────────────── */
function QuestionInput({
  question,
  value,
  onChange,
  otherValue,
  onOtherChange,
  openToOffers,
  onOpenToOffersChange,
  userId,
}: {
  question: Question;
  value: unknown;
  onChange: (v: unknown) => void;
  otherValue?: string;
  onOtherChange?: (v: string) => void;
  openToOffers?: boolean;
  onOpenToOffersChange?: (v: boolean) => void;
  userId?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const pillBase = "px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-150 cursor-pointer select-none";
  const pillOff = `${pillBase} border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600`;
  const pillOn = `${pillBase} border-blue-500 bg-blue-600 text-white shadow-sm`;

  const otherInputClass = "w-full px-4 py-3.5 rounded-2xl border border-blue-300 bg-blue-50/60 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all";

  const { t, locale } = useI18n();

  if (question.type === "location") {
    return <LocationQuestionInput value={value} onChange={onChange} userId={userId} />;
  }

  if (question.type === "single-select") {
    const selectedOpt = question.options?.find((o) => o.value === value);
    const showOther = !!selectedOpt && selectedOpt.type === "other";
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2.5">
          {question.options?.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                const next = value === opt.value ? null : opt.value;
                onChange(next);
                if (opt.type !== "other") onOtherChange?.("");
              }}
              className={value === opt.value ? pillOn : pillOff}
            >
              {value === opt.value && <Check className="w-3.5 h-3.5 inline mr-1.5" />}
              {getLocalizedText(opt.labelLocalized ?? opt.label, locale)}
            </button>
          ))}
        </div>
        {showOther && (
          <input
            autoFocus
            value={otherValue ?? ""}
            onChange={(e) => onOtherChange?.(e.target.value)}
            placeholder={t.questionnaire.otherPlaceholder}
            className={otherInputClass}
          />
        )}
      </div>
    );
  }

  if (question.type === "multi-select") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (v: string) => {
      const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
      onChange(next);
      const opt = question.options?.find((o) => o.value === v);
      if (opt?.type === "other" && selected.includes(v)) onOtherChange?.("");
    };
    const activeOtherOpt = question.options?.find((o) => o.type === "other" && selected.includes(o.value));
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2.5">
          {question.options?.map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <button key={opt.value} onClick={() => toggle(opt.value)} className={on ? pillOn : pillOff}>
                {on && <Check className="w-3.5 h-3.5 inline mr-1.5" />}
                {getLocalizedText(opt.labelLocalized ?? opt.label, locale)}
              </button>
            );
          })}
        </div>
        {activeOtherOpt && (
          <input
            autoFocus
            value={otherValue ?? ""}
            onChange={(e) => onOtherChange?.(e.target.value)}
            placeholder={t.questionnaire.otherPlaceholder}
            className={otherInputClass}
          />
        )}
      </div>
    );
  }

  if (question.type === "yes-no") {
    return (
      <div className="flex gap-3">
        {[{ label: t.questionnaire.yes, v: true }, { label: t.questionnaire.no, v: false }].map(({ label, v }) => (
          <button
            key={label}
            onClick={() => onChange(v)}
            className={`flex-1 py-4 rounded-2xl border text-base font-bold transition-all duration-150 ${
              value === v
                ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
            }`}
          >
            {value === v && <Check className="w-4 h-4 inline mr-1.5" />}
            {label}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "textarea") {
    const examples = (question.autofillExamples ?? []).filter(Boolean);
    return (
      <div className="space-y-2">
        <textarea
          rows={4}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getLocalizedText(question.placeholderLocalized ?? question.placeholder, locale) || t.misc.textPlaceholder}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none transition-all"
        />
        {examples.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(ex)}
                className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (question.type === "text") {
    const examples = (question.autofillExamples ?? []).filter(Boolean);
    return (
      <div className="space-y-2">
        <input
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getLocalizedText(question.placeholderLocalized ?? question.placeholder, locale) || t.misc.textPlaceholder}
          className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
        />
        {examples.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(ex)}
                className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 hover:border-blue-300 active:scale-95 transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (question.type === "date") {
    return (
      <input
        type="date"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
      />
    );
  }

  if (question.type === "number") {
    const isBudget = question.id === "budget";
    const numVal = value as number | null;
    const hasMin = question.min != null;
    const hasMax = question.max != null;
    const outOfRange = numVal != null && numVal !== (null as unknown as number) && (
      (hasMin && numVal < question.min!) ||
      (hasMax && numVal > question.max!)
    );
    return (
      <div className="space-y-3">
        {isBudget && openToOffers ? (
          <div className="w-full px-4 py-3.5 rounded-2xl border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-700">
            {t.questionnaire.budgetFlexible}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="relative">
              <input
                type="number"
                value={numVal ?? ""}
                onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
                placeholder={question.placeholder || "0"}
                min={question.min}
                max={question.max}
                step={question.step}
                disabled={isBudget && openToOffers}
                className={`w-full px-4 py-3.5 pr-16 rounded-2xl border bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all disabled:opacity-50 ${outOfRange ? "border-red-300 focus:ring-red-300/30 focus:border-red-400" : "border-gray-200 focus:ring-blue-500/30 focus:border-blue-400"}`}
              />
              {question.helpText && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                  {question.helpText}
                </span>
              )}
            </div>
            {(hasMin || hasMax) && !outOfRange && (
              <p className="text-xs text-gray-400 px-1">
                {hasMin && hasMax
                  ? tFormat(t.questionnaire.numberRangeTpl, { min: question.min!, max: question.max! })
                  : hasMin
                  ? tFormat(t.questionnaire.numberMinTpl, { min: question.min! })
                  : tFormat(t.questionnaire.numberMaxTpl, { max: question.max! })}
              </p>
            )}
            {outOfRange && (
              <p className="text-xs text-red-500 font-semibold px-1">
                {hasMin && hasMax
                  ? tFormat(t.questionnaire.numberRangeErr, { min: question.min!, max: question.max! })
                  : hasMin
                  ? tFormat(t.questionnaire.numberMinErr, { min: question.min! })
                  : tFormat(t.questionnaire.numberMaxErr, { max: question.max! })}
              </p>
            )}
          </div>
        )}
        {isBudget && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={openToOffers ?? false}
              onChange={(e) => onOpenToOffersChange?.(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600 font-medium">{t.questionnaire.openToOffers}</span>
          </label>
        )}
      </div>
    );
  }

  if (question.type === "range") {
    const min = question.min ?? 0;
    const max = question.max ?? 100;
    const step = question.step ?? 1;
    const displayVal = (value as number) ?? min;
    const pct = max === min ? 0 : ((displayVal - min) / (max - min)) * 100;
    return (
      <div className="space-y-3 px-1">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-extrabold text-blue-600">{displayVal}</span>
          {question.helpText && (
            <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded-lg">{question.helpText}</span>
          )}
        </div>
        <div className="relative py-1">
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayVal}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 font-semibold">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    );
  }

  if (question.type === "file") {
    const dataUrl = typeof value === "string" && value.startsWith("data:") ? value : null;
    const hasFile = !!value;

    function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      compressImage(file, 1024, 0.72).then(onChange).catch(() => {
        const reader = new FileReader();
        reader.onload = (ev) => onChange(ev.target?.result as string);
        reader.readAsDataURL(file);
      });
    }

    return (
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        {hasFile ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 overflow-hidden">
            {dataUrl ? (
              <div className="relative">
                <img
                  src={dataUrl}
                  alt={t.misc.uploadedImageAlt}
                  className="w-full max-h-64 object-cover"
                />
                <button
                  onClick={() => onChange(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="px-4 py-2 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-emerald-700">{t.questionnaire.fileUploaded}</span>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="ml-auto text-xs text-blue-600 font-semibold hover:text-blue-700"
                  >
                    {t.questionnaire.fileReplace}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-semibold text-emerald-700 flex-1 truncate">{value as string}</span>
                <button onClick={() => onChange(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-8 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center gap-3 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-all duration-200"
          >
            <Upload className="w-6 h-6" />
            <span className="text-sm font-medium">{t.questionnaire.fileSelectCta}</span>
            <span className="text-xs opacity-70">{t.questionnaire.fileSelectSub}</span>
          </button>
        )}
      </div>
    );
  }

  return null;
}

/* ─── Header ─────────────────────────────────────────────────────── */
function QuizHeader({
  onBack,
  step,
  total,
  categoryName,
  emoji,
  categoryId,
}: {
  onBack: () => void;
  step?: number;
  total?: number;
  categoryName?: string;
  emoji?: string;
  categoryId?: string | null;
}) {
  const progress = step !== undefined && total ? ((step + 1) / total) * 100 : 0;
  return (
    <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {categoryName && (
            <p className="text-xs text-gray-400 font-medium truncate inline-flex items-center gap-1.5">
              <CategoryIcon categoryId={categoryId ?? null} emoji={emoji} size={16} shape="square" />
              <span className="truncate">
                {categoryName}
                {step !== undefined && total ? ` — ${step + 1} / ${total}` : ""}
              </span>
            </p>
          )}
          {step !== undefined && total && (
            <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-600 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          )}
        </div>
        <img src={logoImg} alt="Hormang" className="w-8 h-8 object-contain flex-shrink-0" />
      </div>
    </div>
  );
}

/* ─── Category Select Screen ─────────────────────────────────────── */
function CategorySelectScreen({ onSelect }: { onSelect: (id: string) => void }) {
  const categories = getCategories();
  const [, setLocation] = useLocation();
  const { t, locale } = useI18n();
  return (
    <div className="min-h-screen bg-gray-50">
      <QuizHeader onBack={() => setLocation("/customer-home")} />
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-gray-900 mb-1">{t.questionnaire.categoryTitle}</h1>
          <p className="text-gray-500 text-sm">{t.questionnaire.categorySub}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {categories.map((cat, i) => (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              onClick={() => onSelect(cat.id)}
              className="bg-white border border-gray-100 rounded-2xl p-5 text-left hover:border-blue-200 hover:shadow-md transition-all duration-200 group"
            >
              <div className="mb-3"><CategoryIcon categoryId={cat.id} emoji={cat.emoji} size={40} shape="square" /></div>
              <p className="font-bold text-sm text-gray-900 group-hover:text-blue-600 transition-colors leading-snug">
                {getCategoryDisplayName(cat.id, locale, cat.name)}
              </p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Questions Screen ───────────────────────────────────────────── */
function QuestionsScreen({
  categoryId,
  onComplete,
  onBack,
}: {
  categoryId: string;
  onComplete: (answers: Answers) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const cat = getCategoryById(categoryId);
  const catDisplayName = getCategoryDisplayName(categoryId, locale, cat?.name);
  const allQuestions = getAllQuestionsForCategory(categoryId);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [openToOffers, setOpenToOffers] = useState(false);
  const [direction, setDirection] = useState(1);

  const q = allQuestions[step];
  if (!q) return null;

  const currentValue = answers[q.id] ?? (q.type === "multi-select" ? [] : null);

  const isAnswered = () => {
    // Check the current top-level question first
    if (q.required) {
      if (q.type === "location") {
        const loc = currentValue as LocationAnswer | null;
        if (!loc || !loc.region) return false;
        // Toshkent shahri requires a district
        if (loc.region === "Toshkent shahri" && !loc.district) return false;
      } else if (q.type === "multi-select") {
        if (!Array.isArray(currentValue) || currentValue.length === 0) return false;
      } else if (q.type === "range") {
        // range always has a displayable value — always passes required check
      } else if (q.id === "budget") {
        if (!openToOffers && (currentValue === null || currentValue === "")) return false;
      } else {
        if (currentValue === null || currentValue === "" || currentValue === undefined) return false;
      }
    }
    // Validate number min/max constraints (blocks Next even for non-required if value entered)
    if (q.type === "number" && currentValue != null && currentValue !== "") {
      const n = Number(currentValue);
      if (q.min != null && n < q.min) return false;
      if (q.max != null && n > q.max) return false;
    }
    // Also validate any required follow-up questions that are currently visible
    const visibleBranches = getActiveBranches(q, { ...answers, [q.id]: currentValue });
    for (const bq of visibleBranches) {
      if (!isRequiredBranchAnswered(bq, answers)) return false;
    }
    return true;
  };

  const canSkip = !q.required;

  function goNext() {
    // For range: if user never moved the slider, save the displayed default (min or 0)
    const savedValue = q.type === "range" && currentValue === null
      ? (q.min ?? 0)
      : currentValue;
    const updated = { ...answers, [q.id]: savedValue };
    if (q.id === "budget") updated["budget_open"] = openToOffers;
    setAnswers(updated);

    let nextStep = step + 1;

    if (nextStep < allQuestions.length) {
      setDirection(1);
      setStep(nextStep);
    } else {
      onComplete(updated);
    }
  }

  function goBack() {
    if (step === 0) { onBack(); return; }
    setDirection(-1);
    setStep(step - 1);
  }

  const isLast = step === allQuestions.length - 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <QuizHeader
        onBack={goBack}
        step={step}
        total={allQuestions.length}
        categoryName={catDisplayName}
        emoji={cat?.emoji}
        categoryId={cat?.id ?? null}
      />
      <div className="max-w-lg mx-auto px-4 py-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -32 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-6">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2 block">
                {tFormat(t.questionnaire.questionNumLabel, { n: step + 1 })}
              </span>
              <h2 className="text-xl font-extrabold text-gray-900 leading-snug">
                {getLocalizedText(q.labelLocalized ?? q.label, locale)}
                {q.required && <span className="text-red-500 ml-1" title={t.questionnaire.requiredTitle}>*</span>}
              </h2>
              {currentValue != null && currentValue !== "" && (
                <p className="text-sm text-gray-400 mt-1 leading-relaxed">{formatAnswer(q, currentValue, { yes: t.questionnaire.yes, no: t.questionnaire.no, fileUploaded: t.questionnaire.fileUploaded, soum: t.misc.soum, budgetTpl: t.questionnaire.budgetTpl })}</p>
              )}
              {q.helpText && (
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{getLocalizedText(q.helpTextLocalized ?? q.helpText, locale)}</p>
              )}
            </div>

            <QuestionInput
              question={q}
              value={currentValue}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v as Answers[string] }))}
              otherValue={(answers[q.id + "_other"] as string) ?? ""}
              onOtherChange={(v) => setAnswers((prev) => ({ ...prev, [q.id + "_other"]: v }))}
              openToOffers={openToOffers}
              onOpenToOffersChange={setOpenToOffers}
              userId={user?.id}
            />

            {/* Inline conditional follow-up questions */}
            <AnimatePresence>
              {getActiveBranches(q, { ...answers, [q.id]: currentValue }).length > 0 && (
                <ConditionalInlineBlock
                  questions={getActiveBranches(q, { ...answers, [q.id]: currentValue })}
                  answers={answers}
                  onChange={(id, val) => setAnswers((prev) => ({ ...prev, [id]: val as Answers[string] }))}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mt-10">
          {canSkip && step > 0 && (
            <Button variant="outline" onClick={goNext} className="flex-1 font-semibold border-gray-200">
              {t.questionnaire.skip}
            </Button>
          )}
          <Button
            onClick={goNext}
            disabled={!isAnswered()}
            className="flex-1 font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 gap-2"
          >
            {isLast ? t.questionnaire.finish : t.questionnaire.next}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Summary Screen ─────────────────────────────────────────────── */
function SummaryScreen({
  categoryId,
  answers,
  onSeeProviders,
  onBack,
  submitting = false,
}: {
  categoryId: string;
  answers: Answers;
  onSeeProviders: (photos: string[]) => void;
  onBack: () => void;
  submitting?: boolean;
}) {
  const { t, locale } = useI18n();
  const tt = t.misc;
  const tq = t.questionnaire;
  const cat = getCategoryById(categoryId);
  const catDisplayName = getCategoryDisplayName(categoryId, locale, cat?.name);
  const allQuestions = getAllQuestionsForCategory(categoryId);
  const urgency = answers["urgency"] as string | undefined;
  const openToOffers = answers["budget_open"] as boolean | undefined;
  const budget = answers["budget"] as number | undefined;
  const urgencyLabelMap: Record<string, string> = {
    today_tomorrow: tq.urgencyTodayTomorrow,
    "3_7_days": tq.urgency3to7Days,
    "1_2_weeks": tq.urgency1to2Weeks,
    "1_month": tq.urgency1Month,
    flexible: tq.urgencyFlexible,
  };
  const urgencyLabel = urgency ? urgencyLabelMap[urgency] ?? urgency : null;
  const urgencyColor = urgency ? URGENCY_COLORS[urgency] ?? "" : "";

  const [requestPhotos, setRequestPhotos] = useState<string[]>([]);

  // Include active branch questions so their answers are shown in the summary
  const activeQuestions = collectActiveQuestions(allQuestions, answers as Record<string, unknown>);
  const specificQs = activeQuestions.filter((q) => q.id !== "urgency" && q.id !== "budget");

  return (
    <div className="min-h-screen bg-gray-50">
      <QuizHeader onBack={submitting ? () => {} : onBack} categoryName={catDisplayName} emoji={cat?.emoji} categoryId={cat?.id ?? null} />
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-extrabold text-gray-900">{tq.summaryTitle}</h1>
          </div>
          <p className="text-gray-500 text-sm">{tq.summarySub}</p>
        </div>

        {/* Urgency + Budget highlights */}
        <div className="flex gap-3 mb-5">
          {urgencyLabel && (
            <div className={`flex-1 rounded-2xl border px-4 py-3 ${urgencyColor}`}>
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5 opacity-70">{tt.urgency}</p>
              <p className="text-sm font-bold">{urgencyLabel}</p>
            </div>
          )}
          <div className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide mb-0.5 text-gray-400">{tt.budget}</p>
            <p className="text-sm font-bold text-gray-900">
              {openToOffers ? tq.openToOffers : budget ? tFormat(tq.budgetTpl, { n: Number(budget).toLocaleString() }) : tt.notSpecified}
            </p>
          </div>
        </div>

        {/* Specific answers */}
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 mb-5">
          {specificQs.map((q) => {
            const val = answers[q.id];
            if (q.type === "file") return null;
            const formatted = formatAnswer(q, val, { yes: tq.yes, no: tq.no, fileUploaded: tq.fileUploaded, soum: tt.soum, budgetTpl: tq.budgetTpl, locale });
            if (formatted === "—") return null;
            const otherText = answers[q.id + "_other"] as string | undefined;
            const hasOtherText = !!otherText?.trim();
            return (
              <div key={q.id} className="px-5 py-4">
                <p className="text-xs text-gray-400 font-semibold mb-1">{getLocalizedText(q.labelLocalized ?? q.label, locale)}</p>
                <p className="text-sm font-semibold text-gray-900">{formatted}</p>
                {hasOtherText && (
                  <p className="text-xs text-blue-600 mt-0.5 font-medium">↳ {otherText}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Photo upload section ─────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Camera className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{tq.photosLabel} <span className="text-gray-400 font-normal">{tq.photosOptional}</span></p>
              <p className="text-xs text-gray-500">{tq.photosSub}</p>
            </div>
          </div>
          <MediaUploadZone
            urls={requestPhotos}
            onChange={setRequestPhotos}
            max={10}
            hint={tq.photosHint}
          />
        </div>

        <Button
          onClick={() => {
            if (submitting) return;
            onSeeProviders(requestPhotos);
          }}
          disabled={submitting}
          className="w-full py-4 text-base font-bold bg-blue-600 hover:bg-blue-700 rounded-2xl gap-2 disabled:opacity-60"
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {tq.submitBtn}
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/* ─── Recommendations Screen ─────────────────────────────────────── */
function RecommendationsScreen({
  categoryId,
}: {
  categoryId: string;
  answers: Answers;
  requestId: string;
  onBack: () => void;
}) {
  const cat = getCategoryById(categoryId);
  const [, setLocation] = useLocation();
  const { t, locale } = useI18n();
  const tq = t.questionnaire;
  const catDisplayName = getCategoryDisplayName(categoryId, locale, cat?.name);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-lg mx-auto px-4 py-12 flex-1 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-5 shadow-sm"
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex justify-center mb-2"><CategoryIcon categoryId={cat?.id ?? null} emoji={cat?.emoji ?? "📋"} size={40} shape="square" /></div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-2">{tq.successTitle}</h1>
          <p className="text-gray-500 text-sm max-w-xs mx-auto mb-1">
            {tFormat(tq.successDescTpl, { cat: catDisplayName })}
          </p>
          <p className="text-gray-400 text-xs max-w-xs mx-auto mb-8">
            {tq.successNote}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="w-full space-y-3"
        >
          <Button
            className="w-full py-4 font-bold bg-blue-600 hover:bg-blue-700 rounded-2xl gap-2"
            onClick={() => setLocation("/my-requests")}
          >
            {tq.myRequestsBtn}
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            className="w-full font-semibold border-gray-200 rounded-2xl"
            onClick={() => setLocation("/customer-home")}
          >
            {tq.homeBtn}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function QuestionnairePage() {
  const { user, loading: authLoading } = useAuth();
  const { toast, dismiss } = useToast();
  const { t } = useI18n();
  const tt = t.misc;
  const [, setLocation] = useLocation();
  const rawSearch = useSearch();
  const params = new URLSearchParams(rawSearch);
  const presetCat = params.get("cat") ?? undefined;
  const resume = params.get("resume") === "1";

  const [stage, setStage] = useState<Stage>(presetCat ? "questions" : "select-category");
  const [categoryId, setCategoryId] = useState<string>(presetCat ?? "");
  const [answers, setAnswers] = useState<Answers>({});
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [resumeChecked, setResumeChecked] = useState(!resume);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const resumeHandledRef = useRef(false);

  /* Coming back from a "finish survey → create account" redirect: the answers
   * were stashed pre-auth (see handleSeeProviders below); once we know who
   * the user is, actually create the request and jump to the success screen.
   * resumeChecked guards against spinning forever if there's nothing pending
   * (e.g. sessionStorage was cleared, or this URL was opened directly). */
  useEffect(() => {
    if (!resume || authLoading) return;
    if (!user) { setResumeChecked(true); return; }
    if (resumeHandledRef.current) return;
    const pending = getPendingRequest();
    if (!pending) { setResumeChecked(true); return; }
    resumeHandledRef.current = true;
    clearPendingRequest();
    const customerName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || undefined;
    (async () => {
      try {
        const req = await saveNewRequest(pending.categoryId, pending.categoryName, pending.answers, locationFromAnswers(pending.answers), user.id, customerName, pending.photos);
        setCategoryId(pending.categoryId);
        setAnswers(pending.answers);
        setCurrentRequestId(req.id);
        dismiss();
        setStage("recommendations");
      } catch (e) {
        const err = e as Error & { code?: string; cooldown?: CooldownState };
        const isCooldown = err.code === "REQUEST_COOLDOWN" || err.message === "REQUEST_COOLDOWN";
        if (isCooldown) {
          if (err.cooldown) {
            setCooldown(err.cooldown);
          } else {
            fetchRequestCooldown().then((c) => setCooldown(c)).catch(() => {});
          }
        } else {
          toast({ title: tt.cantCreateRequest, description: err.message ?? tt.pleaseWait, variant: "destructive" });
        }
      } finally {
        setResumeChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, authLoading, user]);

  /* Cooldown: fetched once from the server, then ticked down locally every second. */
  const [cooldown, setCooldown] = useState<CooldownState | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchRequestCooldown().then((c) => { if (!cancelled) setCooldown(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);
  useEffect(() => {
    if (!cooldown?.blocked) return;
    const id = window.setInterval(() => {
      setCooldown((c) => (c ? { ...c, remainingMs: Math.max(0, c.remainingMs - 1000) } : c));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown?.blocked]);

  function handleSelectCategory(id: string) {
    setCategoryId(id);
    setStage("questions");
  }

  function handleQuestionsComplete(a: Answers) {
    setAnswers(a);
    setStage("summary");
  }

  async function handleSeeProviders(photos: string[]) {
    if (isSubmittingRef.current || stage === "recommendations") return;
    const cat = getCategoryById(categoryId);

    if (!user) {
      // Let anonymous users finish the survey, then gate account creation
      // right at the end instead of upfront — see pending-request-store.ts.
      savePendingRequest({
        categoryId,
        categoryName: cat?.name ?? categoryId,
        answers,
        photos: photos.length ? photos : undefined,
      });
      setLocation(`/auth/role?returnTo=${encodeURIComponent("/questionnaire?resume=1")}`);
      return;
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    const customerName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || undefined;
    try {
      const req = await saveNewRequest(categoryId, cat?.name ?? categoryId, answers, locationFromAnswers(answers), user.id, customerName, photos.length ? photos : undefined);
      setCurrentRequestId(req.id);
      dismiss();
      setStage("recommendations");
    } catch (e) {
      const err = e as Error & { code?: string; cooldown?: CooldownState };
      const isCooldown = err.code === "REQUEST_COOLDOWN" || err.message === "REQUEST_COOLDOWN";
      if (isCooldown) {
        if (err.cooldown) {
          setCooldown(err.cooldown);
        } else {
          fetchRequestCooldown().then((c) => setCooldown(c)).catch(() => {});
        }
      } else {
        toast({
          title: tt.cantCreateRequest,
          description: err.message ?? tt.pleaseWait,
          variant: "destructive",
        });
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  /* Resuming after a "finish survey → create account" redirect: wait for the
   * auth session to resolve (and the effect above to create the request)
   * instead of flashing the category-select screen first. */
  if (resume && !resumeChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  /* Hard block: customer is in cooldown — show clean blocking screen.
   * Scoped to pre-creation stages only so the post-submit recommendations
   * page (which renders for the just-created request) is never hidden. */
  const isPreCreationStage = stage === "select-category" || stage === "questions" || stage === "summary";
  if (cooldown?.blocked && isPreCreationStage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-blue-100 p-6 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4 text-3xl">
            ⏳
          </div>
          <h1 className="text-lg font-extrabold text-gray-900 mb-1.5">
            {tt.cooldownTitle}
          </h1>
          <p className="text-xs text-gray-500 mb-5 leading-relaxed">
            {cooldown.extended ? tt.cooldownExtended : tt.cooldownNormal}
          </p>
          <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 mb-5">
            <p className="text-[11px] font-bold text-blue-500 uppercase tracking-wider mb-1">{tt.cooldownNextLabel}</p>
            <p className="text-2xl font-extrabold text-blue-700 tabular-nums">
              {tFormat(t.time.cooldownTpl, { m: Math.floor(Math.max(0, Math.ceil(cooldown.remainingMs / 1000)) / 60), s: String(Math.max(0, Math.ceil(cooldown.remainingMs / 1000)) % 60).padStart(2, "0") })}
            </p>
            <p className="text-[10px] text-blue-400 mt-1">{tt.cooldownRemain}</p>
          </div>
          <Button
            onClick={() => setLocation("/my-requests")}
            className="w-full font-bold bg-blue-600 hover:bg-blue-700"
          >
            {tt.viewMyRequests}
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {stage === "select-category" && (
        <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <CategorySelectScreen onSelect={handleSelectCategory} />
        </motion.div>
      )}
      {stage === "questions" && categoryId && (
        <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <QuestionsScreen
            categoryId={categoryId}
            onComplete={handleQuestionsComplete}
            onBack={() => setStage("select-category")}
          />
        </motion.div>
      )}
      {stage === "summary" && (
        <motion.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <SummaryScreen
            categoryId={categoryId}
            answers={answers}
            onSeeProviders={handleSeeProviders}
            onBack={() => setStage("questions")}
            submitting={submitting}
          />
        </motion.div>
      )}
      {stage === "recommendations" && (
        <motion.div key="recs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <RecommendationsScreen
            categoryId={categoryId}
            answers={answers}
            requestId={currentRequestId!}
            onBack={() => setStage("summary")}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
