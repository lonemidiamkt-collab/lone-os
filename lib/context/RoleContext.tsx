"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

export interface UserProfile {
  id: string;
  name: string;
  role: Role;
  initials: string;
  color: string;
  email: string;
  teamMemberId?: string; // UUID from team_members table
}

// Hardcoded profiles for the login dropdown (emails match seed.sql)
export const USER_PROFILES: UserProfile[] = [
  // Socios ADM (Full Access)
  { id: "roberto",  name: "Roberto Lino",    role: "admin",    initials: "RL", color: "text-[#0d4af5]", email: "roberto@lonemidia.com" },
  { id: "lucas",    name: "Lucas Bueno",     role: "admin",    initials: "LB", color: "text-[#0d4af5]", email: "lucas@lonemidia.com" },
  // Gestao e Operacao
  { id: "julio",    name: "Julio",           role: "manager",  initials: "JL", color: "text-[#0d4af5]", email: "julio@lonemidia.com" },
  { id: "carlos",   name: "Carlos Augusto",  role: "social",   initials: "CA", color: "text-[#3b6ff5]", email: "carlos@lonemidia.com" },
  { id: "pedro",    name: "Pedro Henrique",  role: "social",   initials: "PH", color: "text-[#3b6ff5]", email: "pedro@lonemidia.com" },
  { id: "rodrigo",  name: "Rodrigo",         role: "designer", initials: "RD", color: "text-[#3b6ff5]", email: "rodrigo@lonemidia.com" },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: "CEO",
  manager: "Gerente",
  traffic: "Tráfego Pago",
  social: "Social Media",
  designer: "Designer",
};

interface RoleContextValue {
  role: Role;
  currentUser: string;
  currentProfile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  setRole: (role: Role) => void;
  setCurrentUser: (name: string) => void;
  roleLabel: string;
  isAuthenticated: boolean;
  hydrated: boolean;
  login: (userId: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const DEFAULT_PROFILE = USER_PROFILES[0];

const RoleContext = createContext<RoleContextValue>({
  role: "admin",
  currentUser: "Admin CEO",
  currentProfile: DEFAULT_PROFILE,
  setProfile: () => {},
  setRole: () => {},
  setCurrentUser: () => {},
  roleLabel: "CEO",
  isAuthenticated: false,
  hydrated: false,
  login: async () => false,
  logout: async () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfileState] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Track if Supabase is reachable (fallback to local auth if not)
  const [supabaseAvailable, setSupabaseAvailable] = useState<boolean | null>(null);

  // Restore session from Supabase or sessionStorage on mount
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function restoreSession() {
      // 1. Check sessionStorage for local (fallback) auth first — instant restore
      try {
        const localSession = sessionStorage.getItem("lone_local_session");
        if (localSession) {
          const profile = USER_PROFILES.find((p) => p.id === localSession);
          if (profile && mounted) {
            setCurrentProfileState(profile);
            setIsAuthenticated(true);
            setSupabaseAvailable(false);
            setHydrated(true);
            return; // skip Supabase entirely
          }
        }
      } catch { /* sessionStorage not available */ }

      // 2. Quick Supabase connectivity check with timeout
      let isReachable = false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321"}/rest/v1/`, {
          method: "HEAD",
          signal: controller.signal,
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
        });
        clearTimeout(timeout);
        isReachable = res.ok || res.status === 401 || res.status === 403;
      } catch {
        isReachable = false;
      }

      if (mounted) setSupabaseAvailable(isReachable);

      if (isReachable) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            const profile = USER_PROFILES.find(
              (p) => p.email === session.user.email
            );
            if (profile) {
              let teamMemberId: string | undefined;
              try {
                const { data: member } = await supabase
                  .from("team_members")
                  .select("id")
                  .eq("auth_id", session.user.id)
                  .single();
                teamMemberId = member?.id ?? undefined;
              } catch { /* DB query failed */ }

              setCurrentProfileState({ ...profile, teamMemberId });
              setIsAuthenticated(true);
            }
          }
        } catch { /* session restore failed */ }

        // Listen for auth state changes only when Supabase is reachable
        try {
          const { data } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              if (!mounted) return;
              if (event === "SIGNED_OUT") {
                // Only reset if was previously authenticated to avoid loops
                setIsAuthenticated((prev) => {
                  if (prev) {
                    setCurrentProfileState(DEFAULT_PROFILE);
                    try { sessionStorage.removeItem("lone_local_session"); } catch {}
                  }
                  return false;
                });
              } else if (event === "SIGNED_IN" && session?.user) {
                const profile = USER_PROFILES.find(
                  (p) => p.email === session.user.email
                );
                if (profile) {
                  let teamMemberId: string | undefined;
                  try {
                    const { data: member } = await supabase
                      .from("team_members")
                      .select("id")
                      .eq("auth_id", session.user.id)
                      .single();
                    teamMemberId = member?.id ?? undefined;
                  } catch { /* DB query failed */ }
                  setCurrentProfileState({ ...profile, teamMemberId });
                  setIsAuthenticated(true);
                }
              }
            }
          );
          subscription = data.subscription;
        } catch { /* onAuthStateChange failed */ }
      }

      if (mounted) setHydrated(true);
    }

    restoreSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const setProfile = useCallback((profile: UserProfile) => {
    setCurrentProfileState(profile);
  }, []);

  const setRole = useCallback((role: Role) => {
    const found = USER_PROFILES.find((p) => p.role === role);
    if (found) setCurrentProfileState(found);
  }, []);

  const setCurrentUser = useCallback((name: string) => {
    const found = USER_PROFILES.find((p) => p.name === name);
    if (found) setCurrentProfileState(found);
  }, []);

  // Per-user passwords for local auth
  const USER_PASSWORDS: Record<string, string> = {
    roberto: "2008313",
    lucas:   "5575433",
    julio:   "200359",
    carlos:  "228830",
    pedro:   "407468",
    rodrigo: "097953",
  };
  const FALLBACK_PASSWORD = "882289"; // legacy fallback

  const isValidPassword = (userId: string, pwd: string): boolean => {
    // Check per-user password first, then fallback
    const userPwd = USER_PASSWORDS[userId];
    if (userPwd && pwd === userPwd) return true;
    if (pwd === FALLBACK_PASSWORD) return true;
    return false;
  };

  const login = useCallback(async (userId: string, password: string): Promise<boolean> => {
    const profile = USER_PROFILES.find((p) => p.id === userId);
    if (!profile) return false;

    // Try Supabase auth first — if it fails with network error, fall back to local
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });

      if (!error && data.session) {
        // Supabase auth succeeded
        setSupabaseAvailable(true);

        // Fetch team_member ID
        let teamMemberId: string | undefined;
        try {
          const { data: member } = await supabase
            .from("team_members")
            .select("id")
            .eq("auth_id", data.user.id)
            .single();
          teamMemberId = member?.id ?? undefined;
        } catch {
          // DB query failed, continue without teamMemberId
        }

        setCurrentProfileState({ ...profile, teamMemberId });
        setIsAuthenticated(true);
        return true;
      }

      // Determine if this is a network error (Supabase down) or an auth error (wrong password)
      if (error) {
        const msg = (error.message ?? "").toLowerCase();
        // Only treat as "wrong password" if it's clearly an auth error
        const isAuthError =
          msg.includes("invalid login") ||
          msg.includes("invalid password") ||
          msg.includes("invalid credentials") ||
          msg.includes("email not confirmed") ||
          (error as any)?.status === 400;

        if (isAuthError) {
          // Supabase auth failed — allow fallback with per-user password
          if (isValidPassword(userId, password)) {
            setSupabaseAvailable(false);
            setCurrentProfileState(profile);
            setIsAuthenticated(true);
            try { sessionStorage.setItem("lone_local_session", profile.id); } catch {}
            return true;
          }
          setSupabaseAvailable(true);
          return false;
        }

        // Everything else (rate limit, service unavailable, network) → fallback
        const isDefinitelyReachable =
          (error as any)?.status >= 400 && (error as any)?.status < 500;
        if (isDefinitelyReachable && !isValidPassword(userId, password)) {
          setSupabaseAvailable(true);
          return false;
        }
      }
    } catch {
      // Network error — Supabase not running
    }

    // Fallback: local auth when Supabase is not reachable
    setSupabaseAvailable(false);
    if (!isValidPassword(userId, password)) return false;

    setCurrentProfileState(profile);
    setIsAuthenticated(true);
    try { sessionStorage.setItem("lone_local_session", profile.id); } catch {}
    return true;
  }, []);

  const logout = useCallback(async () => {
    if (supabaseAvailable) {
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
    }
    try { sessionStorage.removeItem("lone_local_session"); } catch {}
    setIsAuthenticated(false);
    setCurrentProfileState(DEFAULT_PROFILE);
  }, [supabaseAvailable]);

  return (
    <RoleContext.Provider
      value={{
        role: currentProfile.role,
        currentUser: currentProfile.name,
        currentProfile,
        setProfile,
        setRole,
        setCurrentUser,
        roleLabel: ROLE_LABELS[currentProfile.role],
        isAuthenticated,
        hydrated,
        login,
        logout,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
