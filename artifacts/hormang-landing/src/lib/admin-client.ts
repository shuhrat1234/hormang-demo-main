/**
 * Shared HTTP client for admin endpoints.
 * Authentication uses server-issued JWT tokens from POST /api/admin/login.
 */
const RAW_API_BASE = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE = (RAW_API_BASE ?? "/api").replace(/\/$/, "");

const ADMIN_TOKEN_STORAGE_KEY = "hormang_admin_token";

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export function isAdminAuthenticated(): boolean {
  return Boolean(getAdminToken());
}

export function markAdminAuthenticated(token?: string): void {
  if (token) {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  }
}

export function adminLogout(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem("hormang_admin_session_v1");
}

export async function adminLogin(password: string, username?: string): Promise<{ ok: boolean; token: string }> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.token) {
    const errorMsg = data?.error || "Noto'g'ri login yoki parol";
    throw new AdminApiError(errorMsg, res.status);
  }

  sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, data.token);
  return { ok: true, token: data.token };
}

export class AdminApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface AdminFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function adminFetch<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const token = getAdminToken() ?? "";

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : null) ||
      res.statusText ||
      "Xatolik yuz berdi";
    throw new AdminApiError(message, res.status);
  }

  return data as T;
}

/** Batch-translates Uzbek strings to one target language (server-side, no key needed client-side). */
export async function translateTexts(texts: string[], target: "ru" | "en"): Promise<string[]> {
  const { translations } = await adminFetch<{ translations: string[] }>("/admin/translate", {
    method: "POST",
    body: { texts, target },
  });
  return translations;
}
