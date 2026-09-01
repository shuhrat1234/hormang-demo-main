const RAW_API_BASE = import.meta.env.VITE_API_URL as string | undefined;
const API_BASE = (RAW_API_BASE ?? "/api").replace(/\/$/, "");

// Duplicated from auth-client.ts's TOKEN_KEY on purpose: importing auth-client here
// would create a circular import, since auth-client itself calls apiFetch.
const TOKEN_KEY = "hormang_access_token";

export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: unknown) {
    super(message);
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Attach the stored bearer token. Defaults to true; set false for pre-auth calls. */
  auth?: boolean;
}

// Access tokens expire after 1h; the refresh token lives in an httpOnly cookie.
// Coalesce concurrent 401s into a single refresh instead of firing one per request.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken?: string };
        if (!data.accessToken) return null;
        localStorage.setItem(TOKEN_KEY, data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}, _isRetry = false): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (res.status === 401 && auth && !_isRetry && path !== "/auth/refresh") {
    const newToken = await refreshAccessToken();
    if (newToken) return apiFetch<T>(path, options, true);
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : null) ||
      res.statusText ||
      "Xatolik yuz berdi";
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}
