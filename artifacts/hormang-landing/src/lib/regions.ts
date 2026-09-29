/**
 * Unified regions list for Uzbekistan (Toshkent viloyati focus).
 * Used across profile settings, questionnaire, requests, etc.
 */

export interface Region {
  value: string;
  label: string;
  labelRu?: string;
  isCapital?: boolean;
  districts?: string[];
}

export const TOSHKENT_DISTRICTS = [
  "Bektemir",
  "Chilonzor",
  "Mirobod",
  "Mirzo Ulug'bek",
  "Olmazor",
  "Sergeli",
  "Shayxontohur",
  "Uchtepa",
  "Yakkasaroy",
  "Yangihayot",
  "Yashnobod",
  "Yunusobod",
];

/** Russian display names for Tashkent city districts (value → Russian label) */
export const DISTRICT_LABELS_RU: Record<string, string> = {
  "Bektemir":       "Бектемир",
  "Chilonzor":      "Чиланзар",
  "Mirobod":        "Мирабад",
  "Mirzo Ulug'bek": "Мирзо Улугбек",
  "Olmazor":        "Алмазар",
  "Sergeli":        "Сергели",
  "Shayxontohur":   "Шайхантахур",
  "Uchtepa":        "Учтепа",
  "Yakkasaroy":     "Яккасарай",
  "Yangihayot":     "Янгихаёт",
  "Yashnobod":      "Яшнобод",
  "Yunusobod":      "Юнусабад",
};

/** English display names for Tashkent city districts */
export const DISTRICT_LABELS_EN: Record<string, string> = {
  "Bektemir":       "Bektemir",
  "Chilonzor":      "Chilanzar",
  "Mirobod":        "Mirabad",
  "Mirzo Ulug'bek": "Mirzo Ulugbek",
  "Olmazor":        "Almazar",
  "Sergeli":        "Sergeli",
  "Shayxontohur":   "Shaikhontohur",
  "Uchtepa":        "Uchtepa",
  "Yakkasaroy":     "Yakkasaray",
  "Yangihayot":     "Yangihayot",
  "Yashnobod":      "Yashnabad",
  "Yunusobod":      "Yunusabad",
};

/** Normalizes any district name (UZ, RU, EN, case-insensitive) to canonical UZ key */
function normalizeDistrictKey(name: string): string {
  const clean = name.trim().toLowerCase();
  for (const uzKey of TOSHKENT_DISTRICTS) {
    if (uzKey.toLowerCase() === clean) return uzKey;
    const ru = DISTRICT_LABELS_RU[uzKey]?.toLowerCase();
    if (ru && ru === clean) return uzKey;
    const en = DISTRICT_LABELS_EN[uzKey]?.toLowerCase();
    if (en && en === clean) return uzKey;
  }
  return name.trim();
}

/** Get a district's display label in the given locale */
export function getDistrictLabel(name: string, locale: string): string {
  if (!name) return "";
  const canonical = normalizeDistrictKey(name);
  if (locale === "ru") return DISTRICT_LABELS_RU[canonical] ?? canonical;
  if (locale === "en") return DISTRICT_LABELS_EN[canonical] ?? canonical;
  return canonical;
}

/** Normalizes any region name (UZ, RU, EN, case-insensitive) to canonical UZ value */
function normalizeRegionKey(name: string): string {
  const clean = name.trim().toLowerCase().replace(/^г\.\s*/i, "").replace(/\s*шахри$/i, "").replace(/\s*shahri$/i, "").replace(/\s*city$/i, "");
  if (clean === "toshkent" || clean === "ташкент" || clean === "tashkent") {
    return "Toshkent shahri";
  }
  for (const r of regionsList) {
    if (r.value.toLowerCase() === clean || r.label.toLowerCase() === clean) return r.value;
    if (r.labelRu && r.labelRu.toLowerCase() === clean) return r.value;
  }
  return name.trim();
}

/** Get a region's display label in the given locale */
export function getRegionLabel(value: string, locale: string): string {
  if (!value) return "";
  const canonical = normalizeRegionKey(value);
  const regionObj = regionsList.find((x) => x.value === canonical);
  if (locale === "ru") {
    if (canonical === "Toshkent shahri") return "г. Ташкент";
    return regionObj?.labelRu ?? regionObj?.label ?? canonical;
  }
  if (locale === "en") {
    if (canonical === "Toshkent shahri") return "Tashkent city";
    return regionObj?.label ?? canonical;
  }
  return regionObj?.label ?? canonical;
}

/**
 * Universal location formatter & translator:
 * Handles district + region or a single compound string like "Chilonzor, Toshkent shahri"
 * and returns the localized representation for the viewer's active locale.
 */
export function localizeLocation(district?: string | null, region?: string | null, locale: string = "uz"): string {
  const dist = district?.trim() || "";
  const reg = region?.trim() || "";

  if (dist && reg) {
    const dLabel = getDistrictLabel(dist, locale);
    const rLabel = getRegionLabel(reg, locale);
    return `${dLabel}, ${rLabel}`;
  }

  const single = dist || reg;
  if (!single) return "";

  // If compound string like "Chilonzor, Toshkent shahri" or "Чиланзар, Ташкент"
  if (single.includes(",")) {
    const parts = single.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return localizeLocation(parts[0], parts[1], locale);
    }
  }

  // Check if it's a known district
  const distKey = normalizeDistrictKey(single);
  if (TOSHKENT_DISTRICTS.includes(distKey)) {
    return getDistrictLabel(distKey, locale);
  }

  // Otherwise treat as region
  return getRegionLabel(single, locale);
}

/**
 * Get a fully-localized location string from a ProviderRequest-like object.
 * Prefers district + region codes (translated) over the raw stored location string.
 */
export function getRequestLocation(
  r: { location?: string; region?: string; district?: string },
  locale: string,
): string {
  return localizeLocation(r.district, r.region, locale) || (r.location ? localizeLocation(undefined, r.location, locale) : "");
}

export const regionsList: Region[] = [
  {
    value: "Toshkent shahri",
    label: "Toshkent shahri",
    labelRu: "Ташкент",
    isCapital: true,
    districts: TOSHKENT_DISTRICTS,
  },
  { value: "Angren",          label: "Angren",          labelRu: "Ангрен" },
  { value: "Bekobod",         label: "Bekobod",         labelRu: "Бекабад" },
  { value: "Bo'ka",           label: "Bo'ka",           labelRu: "Бука" },
  { value: "Bo'stonliq",      label: "Bo'stonliq",      labelRu: "Бустонлик" },
  { value: "Chinoz",          label: "Chinoz",          labelRu: "Чиноз" },
  { value: "Chirchiq",        label: "Chirchiq",        labelRu: "Чирчик" },
  { value: "Chorvoq",         label: "Chorvoq",         labelRu: "Чарвак" },
  { value: "Do'stobod",       label: "Do'stobod",       labelRu: "Дустабад" },
  { value: "G'azalkent",      label: "G'azalkent",      labelRu: "Газалкент" },
  { value: "Keles",           label: "Keles",           labelRu: "Келес" },
  { value: "Ohangaron",       label: "Ohangaron",       labelRu: "Ахангаран" },
  { value: "Olmaliq",         label: "Olmaliq",         labelRu: "Алмалык" },
  { value: "Oqqo'rg'on",      label: "Oqqo'rg'on",      labelRu: "Аккурган" },
  { value: "O'rta Chirchiq",  label: "O'rta Chirchiq",  labelRu: "Урта Чирчик" },
  { value: "Parkent",         label: "Parkent",         labelRu: "Паркент" },
  { value: "Piskent",         label: "Piskent",         labelRu: "Пискент" },
  { value: "Qibray",          label: "Qibray",          labelRu: "Кибрай" },
  { value: "Quyi Chirchiq",   label: "Quyi Chirchiq",   labelRu: "Куйи Чирчик" },
  { value: "To'ytepa",        label: "To'ytepa",        labelRu: "Тойтепа" },
  { value: "Yangiobod",       label: "Yangiobod",       labelRu: "Янгиобод" },
  { value: "Yangiyо'l",       label: "Yangiyо'l",       labelRu: "Янгиюль" },
  { value: "Yuqori Chirchiq", label: "Yuqori Chirchiq", labelRu: "Юкори Чирчик" },
  { value: "Zangiota",        label: "Zangiota",        labelRu: "Зангиата" },
];
