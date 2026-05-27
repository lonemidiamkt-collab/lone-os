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
  { id: "roberto",  name: "Roberto Lino",    role: "admin",    initials: "RL", color: "text-[#0d4af5]", email: "lonemidiamkt@gmail.com" },
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
  currentUser: "Roberto Lino",
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

async function fetchTeamMemberId(authId: string): Promise<string | undefined> {
  try {
    const res = await fetch(`/api/auth/team-member?auth_id=${authId}`);
    const data = await res.json();
    return data?.id ?? undefined;
  } catch {
    return undefined;
  }
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfileState] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Restore session from Supabase on mount
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function restoreSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          const profile = USER_PROFILES.find((p) => p.email === session.user.email);
          if (profile) {
            const teamMemberId = await fetchTeamMemberId(session.user.id);
            setCurrentProfileState({ ...profile, teamMemberId });
            setIsAuthenticated(true);
          }
        }

        // Listen for auth state changes
        try {
          const { data } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              if (!mounted) return;
              if (event === "SIGNED_OUT") {
                setIsAuthenticated((prev) => {
                  if (prev) setCurrentProfileState(DEFAULT_PROFILE);
                  return false;
                });
              } else if (event === "SIGNED_IN" && session?.user) {
                const profile = USER_PROFILES.find(
                  (p) => p.email === session.user.email
                );
                if (profile) {
                  const teamMemberId = await fetchTeamMemberId(session.user.id);
                  setCurrentProfileState({ ...profile, teamMemberId });
                  setIsAuthenticated(true);
                }
              }
            }
          );
          subscription = data.subscription;
        } catch { /* onAuthStateChange failed */ }
      } catch { /* session restore failed — Supabase unreachable */ }

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

  const login = useCallback(async (userId: string, password: string): Promise<boolean> => {
    const profile = USER_PROFILES.find((p) => p.id === userId);
    if (!profile) return false;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });

      if (!error && data.session) {
        const teamMemberId = await fetchTeamMemberId(data.user.id);
        setCurrentProfileState({ ...profile, teamMemberId });
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setIsAuthenticated(false);
    setCurrentProfileState(DEFAULT_PROFILE);
  }, []);

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
