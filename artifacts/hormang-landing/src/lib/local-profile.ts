/**
 * local-profile.ts
 * Provider profile data: photo, experience, portfolio albums, region/district,
 * bio, categories. Backed by the real provider_profiles table (fast-path
 * cache, background-fetched via getProviderPublicProfile) so it's visible to
 * every viewer/device once saved — not just the browser that saved it.
 *
 * Storage key: user_${userId}_localProfile (still used as a same-device
 * DRAFT layer — instant feedback while typing/uploading before the explicit
 * "Profilni saqlash" flow syncs to the backend via updateProviderProfile()).
 * getLocalProfile() merges the two, with the local draft taking priority on
 * the device that has one — this is why editing feels instant while other
 * devices/viewers still see the real, synced data.
 *
 * ISOLATION GUARANTEE: every read and write is strictly scoped to the
 * provided userId. If userId is empty or falsy the operation is a no-op
 * (or returns {}) and a warning is logged — this prevents the
 * "user__localProfile" corruption key that would appear during a race
 * between logout and a debounced auto-save.
 */

import type { SafeUser, ProviderProfile } from "./auth-client";
import { getProviderPublicProfile, getStoredProviderProfile } from "./auth-client";
import { emitStoreChange } from "./store-events";
import { type ProviderServiceArea, emptyProviderServiceArea, isServiceAreaEmpty } from "./matching";
import { TOSHKENT_DISTRICTS, regionsList } from "./regions";
import { migrateCategoryValuesSafe } from "./categories";

/* ─── Types ─────────────────────────────────────────────────────── */

export type { ProviderServiceArea } from "./matching";
export { emptyProviderServiceArea, isServiceAreaEmpty } from "./matching";

export interface PortfolioItem {
  url: string;
  caption?: string;
}

export interface PortfolioAlbum {
  id: string;
  title: string;
  photos: PortfolioItem[];
  coverIdx?: number; // index of the cover photo (default 0)
}

export interface LocalProfile {
  photoUrl?: string;
  experience?: number;
  /** Legacy — kept for backward compat on read. Never write this; use portfolioItems. */
  portfolioImages?: string[];
  /** Legacy flat portfolio items — kept for migration. Prefer albums. */
  portfolioItems?: PortfolioItem[];
  /** Album-based portfolio system (up to 10 albums, 20 photos each) */
  albums?: PortfolioAlbum[];
  region?: string;
  district?: string;
  /** @deprecated Use serviceAreaV2 instead */
  serviceAreas?: string[];
  /** Structured provider service area (V2) */
  serviceAreaV2?: ProviderServiceArea;
  /** Provider bio — stored locally so PublicProfileModal can display it without an API call */
  bio?: string;
  /** Provider service categories — stored locally for public profile display */
  categories?: string[];
}

export function hasProviderAccess(
  user: SafeUser | null,
  providerProfile: ProviderProfile | null,
  local: LocalProfile = {},
): boolean {
  return !!(
    (user?.id && hasStoredProviderAccess(user.id)) ||
    user?.role === "provider" ||
    providerProfile ||
    (local.categories && local.categories.length > 0)
  );
}

/* ─── Storage helpers ───────────────────────────────────────────── */

function key(userId: string): string {
  return `user_${userId}_localProfile`;
}

function providerAccessKey(userId: string): string {
  return `user_${userId}_hasProviderAccess`;
}

export function markProviderAccess(userId: string): void {
  if (!userId) return;
  try {
    localStorage.setItem(providerAccessKey(userId), "1");
  } catch {
    console.warn("[Hormang] Provider marker saqlanmadi — localStorage xotirasi to'liq bo'lishi mumkin.");
  }
}

export function hasStoredProviderAccess(userId: string): boolean {
  return !!userId && localStorage.getItem(providerAccessKey(userId)) === "1";
}

/* ─── Real backend — fast-path cache ─────────────────────────────────
 * getLocalProfile() must stay synchronous (dozens of render-time callers),
 * so this mirrors the pattern used by service-history-store.ts etc.: a
 * background fetch populates an in-memory cache, and getLocalProfile()
 * merges it with the local draft on every call. */

const backendProfileCache = new Map<string, LocalProfile>();
const backendProfileInFlight = new Set<string>();
/** Live current display name (firstName + lastName), same fetch as above —
 * see getLiveProviderName(). Fixes offer/chat displays that used to freeze a
 * provider's name at whatever it was when that offer/chat was created. */
const nameCache = new Map<string, string>();

function backendToLocal(pp: ProviderProfile): LocalProfile {
  return {
    photoUrl: pp.photoUrl ?? undefined,
    experience: pp.experience ?? undefined,
    region: pp.region ?? undefined,
    district: pp.district ?? undefined,
    serviceAreaV2: pp.serviceAreaV2 ?? undefined,
    albums: pp.albums ?? undefined,
    bio: pp.bio ?? undefined,
    categories: pp.categories?.length ? pp.categories : undefined,
  };
}

function ensureBackendProfileLoaded(userId: string): void {
  if (!userId || backendProfileCache.has(userId) || backendProfileInFlight.has(userId)) return;
  backendProfileInFlight.add(userId);
  getProviderPublicProfile(userId)
    .then(({ user, providerProfile }) => {
      const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
      if (fullName) nameCache.set(userId, fullName);
      if (providerProfile) {
        backendProfileCache.set(userId, backendToLocal(providerProfile));
      } else {
        const stored = getStoredProviderProfile(userId);
        if (stored) {
          backendProfileCache.set(userId, backendToLocal(stored));
        } else {
          backendProfileCache.set(userId, {});
        }
      }
      emitStoreChange();
    })
    .catch(() => {
      const stored = getStoredProviderProfile(userId);
      if (stored) {
        backendProfileCache.set(userId, backendToLocal(stored));
        emitStoreChange();
      }
    })
    .finally(() => backendProfileInFlight.delete(userId));
}

/** Seed provider photo into synchronous cache directly (e.g. from offer payload). */
export function seedProfilePhoto(userId: string, photoUrl?: string): void {
  if (!userId || !photoUrl) return;
  const current = backendProfileCache.get(userId) ?? {};
  if (current.photoUrl !== photoUrl) {
    backendProfileCache.set(userId, { ...current, photoUrl });
    emitStoreChange();
  }
}

/** Live current display name for a provider. Falls back to undefined until
 * the background fetch resolves — callers should keep using their own
 * fallback (e.g. a stored snapshot name) until then. */
export function getLiveProviderName(userId: string): string | undefined {
  if (!userId) return undefined;
  ensureBackendProfileLoaded(userId);
  return nameCache.get(userId);
}

/** Same-device draft layer only — see getLocalProfile() for the merged read. */
function readLocalDraft(userId: string): LocalProfile {
  try {
    const raw = localStorage.getItem(key(userId));
    const p = raw ? (JSON.parse(raw) as LocalProfile) : {};
    /* Migrate legacy portfolioImages → portfolioItems */
    if (!p.portfolioItems && p.portfolioImages?.length) {
      p.portfolioItems = p.portfolioImages.map((url) => ({ url }));
    }
    /* Migrate legacy region → serviceAreas for providers */
    if ((!p.serviceAreas || p.serviceAreas.length === 0) && p.region) {
      p.serviceAreas = [p.region];
    }
    /* Migrate legacy serviceAreas[] → serviceAreaV2 if V2 not yet set */
    if (!p.serviceAreaV2 && p.serviceAreas && p.serviceAreas.length > 0) {
      const viloyatValues = new Set(regionsList.filter((r) => !r.isCapital).map((r) => r.value));
      const v2 = emptyProviderServiceArea();
      for (const area of p.serviceAreas) {
        if (area === "Toshkent shahri") {
          v2.toshkent_city.all = true;
        } else if (TOSHKENT_DISTRICTS.includes(area)) {
          v2.toshkent_city.districts.push(area);
        } else if (viloyatValues.has(area)) {
          v2.toshkent_region.cities.push(area);
        }
      }
      if (!isServiceAreaEmpty(v2)) p.serviceAreaV2 = v2;
    }
    /* Migrate legacy translated category names → canonical IDs.
     * Old profiles stored UZ/RU strings ("Tozalash", "Уборка"); the matching
     * layer now expects canonical IDs. We rewrite at read-time so callers
     * always see IDs, with a one-time write-back on next save. */
    if (p.categories && p.categories.length > 0) {
      const migrated = migrateCategoryValuesSafe(p.categories);
      if (migrated.join("|") !== p.categories.join("|")) {
        p.categories = migrated;
      }
    }
    /* Migrate legacy portfolioItems → albums (create a default "Ishlarim" album) */
    if (!p.albums && p.portfolioItems && p.portfolioItems.length > 0) {
      p.albums = [{
        id: "default",
        title: "Ishlarim",
        photos: p.portfolioItems,
        coverIdx: 0,
      }];
    }
    return p;
  } catch {
    return {};
  }
}

/**
 * Merged read: real backend data (visible to every viewer/device) as the
 * base, overlaid with this device's local draft (if any — e.g. mid-edit,
 * or not yet synced). Triggers a background fetch of the backend copy on
 * first read for a given userId.
 */
export function getLocalProfile(userId: string): LocalProfile {
  if (!userId) {
    console.warn("[Hormang] getLocalProfile: userId bo'sh — {} qaytarildi.");
    return {};
  }
  ensureBackendProfileLoaded(userId);
  const backend = backendProfileCache.get(userId) ?? {};
  const draft = readLocalDraft(userId);
  const merged: LocalProfile = { ...backend };
  for (const [k, v] of Object.entries(draft)) {
    if (v !== undefined && v !== null && v !== "") {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  return merged;
}

export function saveLocalProfile(userId: string, data: LocalProfile): void {
  /* CRITICAL defensive guard: never write to an empty key. */
  if (!userId) {
    console.error("[Hormang] saveLocalProfile: userId bo'sh — saqlash bekor qilindi. Ma'lumotlar yo'qolmadi.");
    return;
  }

  /* Strip the legacy `portfolioImages` field before saving */
  const { portfolioImages: _dropped, ...rest } = data;
  /* Normalize category values to canonical IDs at save time, preserving any
   * unknown legacy strings verbatim so historical provider data is never lost
   * if the migration map doesn't cover a value. Idempotent. */
  const clean: LocalProfile = rest.categories?.length
    ? { ...rest, categories: migrateCategoryValuesSafe(rest.categories) }
    : rest;

  console.log(
    `[Hormang] 💾 saveLocalProfile: user=${userId.slice(0, 8)} photo=${!!clean.photoUrl} portfolio=${clean.portfolioItems?.length ?? 0} cats=${clean.categories?.length ?? 0} bio=${!!clean.bio} region=${clean.region ?? "—"}`,
  );

  try {
    localStorage.setItem(key(userId), JSON.stringify(clean));
    if (clean.categories?.length) markProviderAccess(userId);
    emitStoreChange();
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      console.warn(
        `[Hormang] ⚠️ LocalStorage quota oshdi — portfolio tushirilmoqda (user=${userId.slice(0, 8)}).`,
      );
      /* First fallback: keep photo + text fields, drop only portfolio images */
      const withoutPortfolio: LocalProfile = { ...clean, portfolioItems: [] };
      try {
        localStorage.setItem(key(userId), JSON.stringify(withoutPortfolio));
        emitStoreChange();
        console.warn("[Hormang] ⚠️ Portfolio rasmlari saqlanmadi (xotira to'liq). Matnli maydonlar saqlandi.");
        return;
      } catch {
        /* Second fallback: keep only text fields */
      }
      const minimal: LocalProfile = {
        bio: clean.bio,
        region: clean.region,
        district: clean.district,
        serviceAreas: clean.serviceAreas,
        experience: clean.experience,
        categories: clean.categories,
        portfolioItems: [],
      };
      try {
        localStorage.setItem(key(userId), JSON.stringify(minimal));
        emitStoreChange();
        console.warn("[Hormang] ⚠️ Faqat matnli maydonlar saqlandi (rasm ham sig'madi).");
      } catch (fallbackError) {
        console.error("[Hormang] ❌ Profil saqlanmadi (minimal ham sig'madi):", fallbackError);
      }
    } else {
      throw error;
    }
  }
}

/* ─── Completion logic ───────────────────────────────────────────── */

/**
 * Weighted completion checks (total = 100):
 *   photo        20 %
 *   name         10 %
 *   region       15 %
 *   services     20 %
 *   bio          20 %
 *   experience   10 %
 *   portfolio     5 %
 */
export interface CompletionCheck {
  key: string;
  label: string;
  done: boolean;
  weight: number;
  hint?: string;
}

export function getCompletionChecks(
  user: SafeUser | null,
  providerProfile: ProviderProfile | null,
  local: LocalProfile,
): CompletionCheck[] {
  /* Count portfolio photos across all storage formats (albums is current; portfolioItems
   * and portfolioImages are legacy). getLocalProfile already migrates old formats to
   * albums on read, so albums is the authoritative source when present. */
  const albumsPhotoCount = (local.albums ?? []).reduce((s, a) => s + (a.photos?.length ?? 0), 0);
  const portfolioCount = albumsPhotoCount
    || (local.portfolioItems ?? []).length
    || (local.portfolioImages ?? []).length;
  const categories = (providerProfile?.categories?.length ? providerProfile.categories : local.categories) ?? [];
  const bio = providerProfile?.bio?.trim() || local.bio?.trim() || "";

  return [
    {
      key: "photo",
      label: "Profil surati yuklang",
      hint: "Surat bilan provayderlar 4x ko'proq buyurtma oladi",
      done: !!local.photoUrl,
      weight: 20,
    },
    {
      key: "name",
      label: "To'liq ismingizni kiriting",
      hint: "Ism va familiya kamida 2 ta harf bo'lishi kerak",
      done: !!(
        user?.firstName && user.firstName.length > 1 &&
        user?.lastName  && user.lastName.length  > 1
      ),
      weight: 10,
    },
    {
      key: "region",
      label: "Xizmat hududini tanlang",
      hint: "Yaqin atrofdagi buyurtmalar ko'rsatiladi",
      done: !!(
        (local.serviceAreaV2 && !isServiceAreaEmpty(local.serviceAreaV2)) ||
        (local.serviceAreas && local.serviceAreas.length > 0) ||
        !!local.region
      ),
      weight: 15,
    },
    {
      key: "services",
      label: "Kamida 1 ta xizmat turini tanlang",
      hint: "Tegishli buyurtmalar siz uchun ko'rsatiladi",
      done: categories.length > 0,
      weight: 20,
    },
    {
      key: "bio",
      label: "Bio: kamida 50 ta belgi yozing",
      hint: "O'zingizni taniting — bu ishonchni oshiradi",
      done: bio.length >= 50,
      weight: 20,
    },
    {
      key: "experience",
      label: "Tajriba yilini kiriting",
      hint: "Tajriba — asosiy tanlov mezonlaridan biri",
      done: !!(local.experience !== undefined && local.experience >= 0),
      weight: 10,
    },
    {
      key: "portfolio",
      label: "Kamida 2 ta portfolio rasm qo'shing",
      hint: "Rasmlar buyurtma olish ehtimolini 3x oshiradi",
      done: portfolioCount >= 2,
      weight: 5,
    },
  ];
}

/**
 * Returns a flat list of human-readable service area labels from a LocalProfile.
 * Prefers the new V2 structured format, falls back to legacy serviceAreas[].
 * Pass `areaLabels` to override the "all city/region" fallback strings with
 * locale-specific text.
 */
export function getServiceAreaLabels(
  local: LocalProfile,
  areaLabels?: { allToshkentCity?: string; allToshkentRegion?: string },
): string[] {
  const allCity   = areaLabels?.allToshkentCity   ?? "Butun Toshkent shahri";
  const allRegion = areaLabels?.allToshkentRegion ?? "Butun Toshkent viloyati";
  if (local.serviceAreaV2) {
    const v2 = local.serviceAreaV2;
    const labels: string[] = [];
    if (v2.toshkent_city.all) {
      labels.push(allCity);
    } else {
      labels.push(...v2.toshkent_city.districts);
    }
    if (v2.toshkent_region.all) {
      labels.push(allRegion);
    } else {
      labels.push(...v2.toshkent_region.cities);
    }
    return labels;
  }
  if (local.serviceAreas?.length) return local.serviceAreas;
  if (local.region) return [local.region];
  return [];
}

/** Returns weighted completion 0–100 (sum of done check weights). */
export function getCompletionPct(checks: CompletionCheck[]): number {
  return checks.filter((c) => c.done).reduce((s, c) => s + c.weight, 0);
}
