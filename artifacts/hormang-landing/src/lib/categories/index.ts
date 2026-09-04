/**
 * lib/categories
 * Single source of truth for service categories.
 *
 * Backed by the real `categories` table on the server (shared across every
 * admin/browser/device) — see `artifacts/api-server/src/routes/categories.ts`.
 * Most consumers throughout the app read this module's synchronous getters
 * (`getCategoryDisplayName`, `getActiveCategories`, etc.) from many call
 * sites; rewriting every one of them to be async would be a large, risky
 * refactor. Instead this module keeps an in-memory cache, refreshed once on
 * app boot (see `App.tsx`) and again after every admin mutation — the
 * getters read the cache synchronously, unchanged for every existing caller.
 */
import type { LocalizedText, Locale } from "@/lib/localization";
import { getLocalizedText } from "@/lib/localization";
import { emitStoreChange } from "@/lib/store-events";
import { apiFetch } from "@/lib/api-client";
import { adminFetch } from "@/lib/admin-client";
import { migrateLegacyCategoryValueWith } from "./categoryMigration";

export { LEGACY_NAME_MAP } from "./categoryMigration";

/**
 * Canonical category model (CategoryModel).
 * Identified by an immutable string ID; carries multilingual display name and
 * optional description, taxonomy (parentCategoryId, future-proof), pricing
 * (baseCost in Tanga), and lifecycle (active, builtIn).
 */
export interface Category {
  id: string;
  /** Multilingual display name (UZ + RU). */
  nameLocalized: LocalizedText;
  /** Optional multilingual short description (UZ + RU). */
  descriptionLocalized?: LocalizedText;
  /**
   * Legacy emoji glyph. Kept as a fallback for categories created before
   * the icon system existed. New categories should set `icon` instead;
   * renderers prefer `icon` over `emoji` when both are present.
   */
  emoji: string;
  /**
   * Name of a curated icon (e.g. "Wrench"). When set, takes precedence over
   * `emoji` in `<CategoryIcon />`. See `lib/categories/icon-registry.tsx`.
   */
  icon?: string;
  /** Icon family identifier — currently only "phosphor". Future-proof for Iconify. */
  iconFamily?: string;
  /** Hex color used as the icon chip background (when no gradient is set). */
  color: string;
  /**
   * Optional gradient preset id (e.g. "blue-indigo"). When set, the chip
   * background is the resolved gradient and overrides solid `color`.
   * See `lib/categories/gradient-presets.ts`.
   */
  gradient?: string | null;
  /** Base Tanga cost for any offer in this category. */
  baseCost: number;
  /** When false, hidden from selectors / new requests but kept for history. */
  active: boolean;
  /** Built-in categories are seeded by default but are no longer protected from deletion. */
  builtIn: boolean;
  /** Optional parent category ID (reserved for future subcategory support; flat for now). */
  parentCategoryId?: string | null;
  createdAt: string;
  /** Present when fetched from the API list endpoint; number of questions configured for this category. */
  questionCount?: number;
}

/** Backwards-compatible alias. */
export type CategoryModel = Category;

const FALLBACK_COLOR = "#3B82F6";

export const DEFAULT_BUILTIN_CATEGORIES: Category[] = [
  { id: "tamirlash",  nameLocalized: { uz: "Ta'mirlash", ru: "Ремонт", en: "Repair" }, emoji: "🔧", icon: "Wrench", color: "#3B82F6", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "tozalash",   nameLocalized: { uz: "Tozalash", ru: "Уборка", en: "Cleaning" }, emoji: "🧹", icon: "Broom", color: "#10B981", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "avto",       nameLocalized: { uz: "Avto xizmat", ru: "Авто услуги", en: "Auto service" }, emoji: "🚗", icon: "Car", color: "#F59E0B", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "kochirish",  nameLocalized: { uz: "Ko'chirish / yuk", ru: "Переезд / доставка", en: "Moving / Delivery" }, emoji: "🚚", icon: "Truck", color: "#8B5CF6", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "repetitor",  nameLocalized: { uz: "Repetitorlar", ru: "Репетиторы", en: "Tutors" }, emoji: "📚", icon: "BookOpen", color: "#EC4899", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "tadbir",     nameLocalized: { uz: "Tadbir xizmatlari", ru: "Ивент услуги", en: "Event services" }, emoji: "🎉", icon: "Gift", color: "#F43F5E", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "gozallik",   nameLocalized: { uz: "Go'zallik", ru: "Красота", en: "Beauty" }, emoji: "💄", icon: "Sparkle", color: "#EAB308", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "enaga",      nameLocalized: { uz: "Enagalik", ru: "Няня", en: "Nanny" }, emoji: "👶", icon: "Baby", color: "#06B6D4", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
  { id: "ustachilik", nameLocalized: { uz: "Ustachilik", ru: "Строительство", en: "Construction" }, emoji: "🏗️", icon: "Hammer", color: "#64748B", baseCost: 0, active: true, builtIn: true, createdAt: new Date(0).toISOString() },
];

/* ─── In-memory cache ────────────────────────────────────────────── */

let cache: Category[] = [...DEFAULT_BUILTIN_CATEGORIES];
let cacheLoaded = false;

interface CategoryApiRow {
  id: string;
  nameLocalized: LocalizedText;
  descriptionLocalized?: LocalizedText;
  emoji: string;
  icon?: string;
  iconFamily?: string;
  color: string;
  gradient?: string | null;
  baseCost: number;
  active: boolean;
  builtIn: boolean;
  parentCategoryId?: string | null;
  createdAt: string;
  questionCount: number;
}

function fromApiRow(row: CategoryApiRow): Category {
  return {
    id: row.id,
    nameLocalized: row.nameLocalized,
    descriptionLocalized: row.descriptionLocalized,
    emoji: row.emoji ?? "📋",
    icon: row.icon,
    iconFamily: row.iconFamily,
    color: row.color ?? FALLBACK_COLOR,
    gradient: row.gradient ?? null,
    baseCost: row.baseCost ?? 0,
    active: row.active !== false,
    builtIn: !!row.builtIn,
    parentCategoryId: row.parentCategoryId ?? null,
    createdAt: row.createdAt,
    questionCount: row.questionCount,
  };
}

/** Fetches the current category list from the server and refreshes the cache. Call on app boot and after any admin mutation. */
export async function refreshCategoriesCache(): Promise<void> {
  try {
    const res = await apiFetch<{ categories: CategoryApiRow[] }>("/categories", { auth: false });
    cache = res.categories.map(fromApiRow);
    cacheLoaded = true;
    emitStoreChange();
  } catch (e) {
    console.warn("[Hormang] kategoriyalarni yuklab bo'lmadi:", e);
  }
}

export function isCategoriesCacheLoaded(): boolean {
  return cacheLoaded;
}

/* ─── Public API ─────────────────────────────────────────────────── */

export function getAllCategories(): Category[] {
  return cache;
}

export function getActiveCategories(): Category[] {
  return getAllCategories().filter((c) => c.active);
}

export function getCategory(id: string): Category | undefined {
  return getAllCategories().find((c) => c.id === id);
}

export async function upsertCategory(input: Partial<Category> & { id: string }): Promise<Category> {
  const row = await adminFetch<CategoryApiRow>(`/categories/${encodeURIComponent(input.id)}`, {
    method: "PUT",
    body: {
      nameLocalized: input.nameLocalized,
      descriptionLocalized: input.descriptionLocalized,
      emoji: input.emoji,
      icon: input.icon ?? null,
      iconFamily: input.iconFamily ?? null,
      color: input.color,
      gradient: input.gradient ?? null,
      baseCost: input.baseCost,
      active: input.active,
      parentCategoryId: input.parentCategoryId ?? null,
    },
  });
  await refreshCategoriesCache();
  return fromApiRow(row);
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  await adminFetch(`/categories/${encodeURIComponent(id)}/active`, { method: "PATCH", body: { active } });
  await refreshCategoriesCache();
}

/**
 * Permanently removes a category, including built-in ones. Any historical
 * requests/offers/profiles that reference this ID keep the raw ID but lose
 * the display name (falls back to showing the ID itself — see
 * `getCategoryDisplayName`'s `fallback` param).
 */
export async function deleteCategory(id: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const result = await adminFetch<{ ok: boolean; reason?: string }>(`/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refreshCategoriesCache();
    return result;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "error" };
  }
}

/* ─── Display helpers ────────────────────────────────────────────── */

export function getCategoryDisplayName(id: string, locale: Locale, fallback?: string): string {
  const cat = getCategory(id) ?? getCategory(migrateLegacyCategoryValue(id) ?? "");
  if (cat) return getLocalizedText(cat.nameLocalized, locale);
  return fallback ?? id;
}

export function getCategoryEmoji(id: string): string {
  return getCategory(id)?.emoji ?? "📋";
}

export function getCategoryColor(id: string): string {
  return getCategory(id)?.color ?? FALLBACK_COLOR;
}

/* ─── Migration: legacy translated names → canonical IDs ─────────── */

/**
 * Resolve a single legacy value (id or translated name) to a canonical id.
 * Returns null when no mapping exists (caller decides whether to drop or keep as legacy).
 */
export function migrateLegacyCategoryValue(value: string): string | null {
  return migrateLegacyCategoryValueWith(value, getAllCategories());
}

/**
 * Resolve an array of legacy/id values to a unique list of canonical IDs.
 * Unknown values are silently dropped — use only for display / matching where
 * unrecognized values would be meaningless. For data persistence prefer
 * `migrateCategoryValuesSafe` which preserves unknowns.
 */
export function resolveCategoryIds(values: string[] | undefined | null): string[] {
  if (!values || values.length === 0) return [];
  const out: string[] = [];
  for (const v of values) {
    const id = migrateLegacyCategoryValue(v);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Safer migration for persistence: maps known values to canonical IDs and
 * **preserves unknown values verbatim**. Guarantees no provider data is lost
 * if a legacy label is missing from the migration map. Dedupes the result.
 */
export function migrateCategoryValuesSafe(values: string[] | undefined | null): string[] {
  if (!values || values.length === 0) return [];
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const id = migrateLegacyCategoryValue(v);
    const resolved = id ?? v;
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}
