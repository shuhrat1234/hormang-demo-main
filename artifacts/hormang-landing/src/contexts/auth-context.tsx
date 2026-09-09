import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getMe, logoutUser, refreshToken, type SafeUser, type ProviderProfile } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api-client";
import { saveCustomerToRegistry, savePhoneToRegistry } from "@/lib/requests-store";
import { getLocalProfile, hasProviderAccess, markProviderAccess } from "@/lib/local-profile";

type Role = "buyer" | "provider";

interface AuthState {
  user: SafeUser | null;
  providerProfile: ProviderProfile | null;
  activeRole: Role;
  loading: boolean;
  setAuth: (user: SafeUser, profile?: ProviderProfile | null) => void;
  setProviderProfile: (profile: ProviderProfile | null) => void;
  switchRole: (role: Role) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

/* ─── Per-user role key ──────────────────────────────────────────── */

function activeRoleKey(userId: string) {
  return `user_${userId}_activeRole`;
}

const LAST_USER_KEY = "hormang_last_user_id";

/**
 * Global localStorage keys that are NOT scoped to a specific user.
 * These must be cleared when a DIFFERENT user logs in to prevent cross-user
 * data leakage. Keys that are already per-user (e.g. user_${id}_*) are
 * naturally isolated and do NOT need to be listed here.
 */
const GLOBAL_KEYS_TO_CLEAR_ON_USER_SWITCH: string[] = [
  "hormang_provider_seen",   // legacy global seen-request IDs
  "hormang_active_role",     // legacy global role (before per-user keys)
  "activeRole",              // potential legacy key
  "currentUser",             // potential legacy key
];

/**
 * Determine which role to activate on login / session restore.
 *
 * Priority:
 *   1. Per-user saved key  user_${userId}_activeRole
 *   2. Legacy global key   hormang_active_role  (migrate once, then discard)
 *   3. "provider" if server or local profile proves provider access
 *   4. fallback (user.role from the DB)
 */
function resolveAndPersistRole(
  user: SafeUser,
  providerProfile: ProviderProfile | null,
  fallback: Role,
): Role {
  const userId = user.id;
  const saved = localStorage.getItem(activeRoleKey(userId));
  if (saved === "buyer" || saved === "provider") return saved;

  // Legacy global key — only safe to migrate if this was the last logged-in user
  const lastUserId = localStorage.getItem(LAST_USER_KEY);
  const legacy = localStorage.getItem("hormang_active_role");
  if (
    (legacy === "buyer" || legacy === "provider") &&
    (!lastUserId || lastUserId === userId)
  ) {
    localStorage.setItem(activeRoleKey(userId), legacy);
    return legacy;
  }

  const localProfile = getLocalProfile(userId);
  const role: Role = hasProviderAccess(user, providerProfile, localProfile) ? "provider" : fallback;
  localStorage.setItem(activeRoleKey(userId), role);
  return role;
}

/* ─── Cross-user cleanup ─────────────────────────────────────────── */

/**
 * Called whenever a user authenticates. If the authenticated userId differs
 * from the previously-seen userId, ALL global (non-per-user) keys are wiped
 * so stale data from another account can never bleed through.
 */
function handleUserSwitch(newUserId: string): void {
  const lastId = localStorage.getItem(LAST_USER_KEY);
  if (lastId && lastId !== newUserId) {
    console.log(`[Hormang] 🔄 Foydalanuvchi almashdi: ${lastId.slice(0, 8)}... → ${newUserId.slice(0, 8)}... Eski global kalitlar tozalanmoqda.`);
    GLOBAL_KEYS_TO_CLEAR_ON_USER_SWITCH.forEach((key) => {
      localStorage.removeItem(key);
    });
  }
  localStorage.setItem(LAST_USER_KEY, newUserId);
}

/* ─── Registry helpers ───────────────────────────────────────────── */

function registryName(u: SafeUser): string {
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
}

function registryInitials(u: SafeUser): string {
  return `${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

function persistUserToRegistry(u: SafeUser) {
  if (!u.id) {
    console.warn("[Hormang] persistUserToRegistry: foydalanuvchi ID yo'q, o'tkazib yuborildi.");
    return;
  }
  const name = registryName(u);
  if (name) saveCustomerToRegistry(u.id, name, registryInitials(u));
  savePhoneToRegistry(u.id, u.phone);
  console.log(`[Hormang] 📋 Registry yangilandi: id=${u.id.slice(0, 8)} phone=${u.phone ?? "—"}`);
}

/* ─── Context ────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthState>({
  user: null,
  providerProfile: null,
  activeRole: "buyer",
  loading: true,
  setAuth: () => {},
  setProviderProfile: () => {},
  switchRole: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [providerProfile, setProviderProfileState] = useState<ProviderProfile | null>(null);
  const [activeRole, setActiveRoleState] = useState<Role>("buyer");
  const [loading, setLoading] = useState(true);

  /* Cross-tab / cross-iframe sync: listen for token changes in localStorage.
   * This ensures that when one iframe logs out or a new user logs in, ALL
   * other open instances of the app immediately sync their React state. */
  useEffect(() => {
    function onStorageChange(e: StorageEvent) {
      if (e.key !== "hormang_access_token") return;

      if (!e.newValue) {
        // Token was removed in another tab/iframe → sync logout here too
        setUser(null);
        setProviderProfileState(null);
        setActiveRoleState("buyer");
        console.log("[Hormang] 🔄 Boshqa oynada chiqish — holat tozalandi.");
      } else {
        // Token changed (new login in another tab/iframe) → re-validate session
        getMe()
          .then(({ user: u, providerProfile: pp }) => {
            // Suspended users are blocked even on cross-tab token sync.
            if (u.suspended) {
              console.warn(`[Hormang] 🚫 Suspended user (cross-tab) bloklandi: ${u.id.slice(0, 8)}`);
              logoutUser().catch(() => {});
              setUser(null);
              setProviderProfileState(null);
              setActiveRoleState("buyer");
              return;
            }
            handleUserSwitch(u.id);
            persistUserToRegistry(u);
            if (hasProviderAccess(u, pp, getLocalProfile(u.id))) markProviderAccess(u.id);
            setUser(u);
            setProviderProfileState(pp);
            const role = resolveAndPersistRole(u, pp, u.role as Role);
            setActiveRoleState(role);
            console.log(`[Hormang] 🔄 Boshqa oynada kirish — sessiya yangilandi: id=${u.id.slice(0, 8)}`);
          })
          .catch(() => {
            setUser(null);
            setProviderProfileState(null);
            setActiveRoleState("buyer");
          });
      }
    }

    window.addEventListener("storage", onStorageChange);
    return () => window.removeEventListener("storage", onStorageChange);
  }, []);

  /* On mount: restore session from existing token */
  useEffect(() => {
    const token = localStorage.getItem("hormang_access_token");
    if (!token) { setLoading(false); return; }

    function applyUser(u: SafeUser, pp: ProviderProfile | null) {
      // Suspended users are immediately logged out — they cannot access the app.
      if (u.suspended) {
        console.warn(`[Hormang] 🚫 Suspended user kirishga uringan: ${u.id.slice(0, 8)} — chiqarildi`);
        logoutUser().finally(() => {
          setUser(null);
          setProviderProfileState(null);
          setActiveRoleState("buyer");
        });
        return;
      }
      persistUserToRegistry(u);
      handleUserSwitch(u.id);
      if (hasProviderAccess(u, pp, getLocalProfile(u.id))) markProviderAccess(u.id);
      setUser(u);
      setProviderProfileState(pp);
      const role = resolveAndPersistRole(u, pp, u.role as Role);
      setActiveRoleState(role);
      console.log(`[Hormang] ✅ Sessiya tiklandi: id=${u.id.slice(0, 8)} rol=${role}`);
    }

    getMe()
      .then(({ user: u, providerProfile: pp }) => applyUser(u, pp))
      .catch(async () => {
        const newToken = await refreshToken();
        if (newToken) {
          getMe()
            .then(({ user: u, providerProfile: pp }) => applyUser(u, pp))
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, []);

  /**
   * Called right after login/register and after mid-session profile saves.
   * Defensively guards against empty userId to prevent cross-user key corruption.
   */
  const setAuth = useCallback((u: SafeUser, profile?: ProviderProfile | null) => {
    if (!u?.id) {
      console.error("[Hormang] setAuth: foydalanuvchi ID yo'q — auth o'rnatilmadi.");
      return;
    }

    // Suspended users cannot log in.
    if (u.suspended) {
      console.warn(`[Hormang] 🚫 Suspended user setAuth bloklandi: ${u.id.slice(0, 8)}`);
      logoutUser().catch(() => {});
      setUser(null);
      setProviderProfileState(null);
      setActiveRoleState("buyer");
      return;
    }

    const pp = profile ?? null;

    // Cross-user cleanup before applying new user's data
    handleUserSwitch(u.id);
    persistUserToRegistry(u);
    if (hasProviderAccess(u, pp, getLocalProfile(u.id))) markProviderAccess(u.id);

    setUser(u);
    setProviderProfileState(pp);

    const role = resolveAndPersistRole(u, pp, u.role as Role);
    setActiveRoleState(role);
    console.log(`[Hormang] 🔐 setAuth: id=${u.id.slice(0, 8)} phone=${u.phone ?? "—"} rol=${role}`);
  }, []);

  const setProviderProfile = useCallback((profile: ProviderProfile | null) => {
    if (profile?.userId) markProviderAccess(profile.userId);
    setProviderProfileState(profile);
  }, []);

  /** Save role per-user so it survives logout/login cycles. */
  const switchRole = useCallback((role: Role) => {
    setActiveRoleState(role);
    if (user?.id) {
      if (role === "provider") markProviderAccess(user.id);
      localStorage.setItem(activeRoleKey(user.id), role);
      console.log(`[Hormang] 🔄 Rol almashtirildi → ${role === "provider" ? "Ijrochi" : "Mijoz"} (user=${user.id.slice(0, 8)})`);
      apiFetch("/auth/role", { method: "PATCH", body: { role } }).catch((err) => {
        console.warn("[Hormang] Failed to sync role to backend:", err);
      });
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const { user: u, providerProfile: pp } = await getMe();
      setUser(u);
      setProviderProfileState(pp);
    } catch {
      setUser(null);
      setProviderProfileState(null);
    }
  }, []);

  const logout = useCallback(async () => {
    const outgoingId = user?.id;
    await logoutUser();
    // Clear global leaked keys so next login starts clean
    GLOBAL_KEYS_TO_CLEAR_ON_USER_SWITCH.forEach((key) => localStorage.removeItem(key));
    setUser(null);
    setProviderProfileState(null);
    setActiveRoleState("buyer");
    console.log(`[Hormang] 👋 Logout: id=${outgoingId?.slice(0, 8) ?? "—"}`);
    // Per-user keys (user_${id}_*) are intentionally kept so the same user's
    // role, local profile, and tanga balance are restored on re-login.
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, providerProfile, activeRole, loading,
      setAuth, setProviderProfile, switchRole, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
