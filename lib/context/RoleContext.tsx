"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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

// LISTA DE RESERVA — a de verdade vem de /api/team/roster (tabela team_members).
//
// Ela existe só pra tela de login não morrer se a busca falhar: sem rede, ninguém entra, e um
// sistema que não deixa a equipe trabalhar por causa de uma consulta é pior que um nome
// desatualizado. Fora esse caso, quem manda é o banco.
//
// NÃO ADICIONE GENTE AQUI. Cadastro é na tela de Equipe, que grava em team_members e cria o login
// junto. Foi manter esta lista em paralelo com a tabela que fez a saída do Pedro Henrique virar
// caça a cinco arquivos — e por pouco não deixou o substituto sem acesso.
export const USER_PROFILES: UserProfile[] = [
  // Socios ADM (Full Access)
  { id: "roberto",  name: "Roberto Lino",    role: "admin",    initials: "RL", color: "text-[#0d4af5]", email: "lonemidiamkt@gmail.com" },
  { id: "lucas",    name: "Lucas Bueno",     role: "admin",    initials: "LB", color: "text-[#0d4af5]", email: "lucas@lonemidia.com" },
  // Gestao e Operacao
  { id: "julio",    name: "Julio",           role: "manager",  initials: "JL", color: "text-[#0d4af5]", email: "julio@lonemidia.com" },
  { id: "carlos",   name: "Carlos Augusto",  role: "social",   initials: "CA", color: "text-[#3b6ff5]", email: "carlos@lonemidia.com" },
  // Thiago assumiu a carteira do Pedro Henrique em 10/08/2026 (mesmo registro, renomeado, pra não
  // perder os 17 clientes). Esta lista é o mapa de login: nome errado aqui = pessoa entra e o
  // sistema não sabe quem ela é.
  { id: "thiago",   name: "Thiago",          role: "social",   initials: "TH", color: "text-[#3b6ff5]", email: "thiago@lonemidia.com" },
  { id: "rodrigo",  name: "Rodrigo",         role: "designer", initials: "RD", color: "text-[#3b6ff5]", email: "rodrigo@lonemidia.com" },
  // Comercial (SDR) — login escopado que vê SÓ o CRM.
  { id: "maria",    name: "Maria Luiza",     role: "comercial", initials: "ML", color: "text-[#0d4af5]", email: "marialuiza@lonemidia.com" },
];

const ROLE_LABELS: Record<Role, string> = {
  admin: "CEO",
  manager: "Gerente",
  traffic: "Tráfego Pago",
  social: "Social Media",
  designer: "Designer",
  comercial: "Comercial (SDR)",
};

interface RoleContextValue {
  /** A equipe de verdade (banco). Use isto em vez de importar USER_PROFILES. */
  profiles: UserProfile[];
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
  profiles: USER_PROFILES,
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
  // A equipe de verdade, do banco. Começa na reserva pra tela ter o que mostrar no primeiro quadro.
  const [profiles, setProfiles] = useState<UserProfile[]>(USER_PROFILES);

  // O ouvinte de sessão vive o tempo todo e foi criado uma vez. Sem ref ele consultaria pra sempre
  // a lista do primeiro quadro — e alguém que entrasse no time hoje não seria reconhecido até dar
  // F5. É o mesmo tipo de armadilha que criou este bug, agora dentro do React.
  const profilesRef = useRef<UserProfile[]>(USER_PROFILES);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);

  /** Quem é o dono deste e-mail. Tenta a lista viva; cai na reserva se não achar. */
  const acharPorEmail = useCallback((email?: string | null): UserProfile | undefined => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return undefined;
    return profilesRef.current.find((p) => p.email.toLowerCase() === e)
        ?? USER_PROFILES.find((p) => p.email.toLowerCase() === e);
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/team/roster")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lista = d?.profiles as UserProfile[] | undefined;
        // Lista vazia = consulta falhou. Fica na reserva: melhor nome velho que tela sem ninguém.
        if (vivo && lista?.length) setProfiles(lista);
      })
      .catch(() => { /* sem rede: segue na reserva */ });
    return () => { vivo = false; };
  }, []);

  // Restore session from Supabase on mount
  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function restoreSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          const profile = acharPorEmail(session.user.email);
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
                const profile = acharPorEmail(session.user.email);
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
        profiles,
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
