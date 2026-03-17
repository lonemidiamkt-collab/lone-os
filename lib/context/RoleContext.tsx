"use client";

import { createContext, useContext, useState } from "react";
import type { Role } from "@/lib/types";

export interface UserProfile {
  id: string;
  name: string;
  role: Role;
  initials: string;
  color: string; // tailwind text color class
}

export const USER_PROFILES: UserProfile[] = [
  { id: "admin",    name: "Admin CEO",       role: "admin",    initials: "AC", color: "text-purple-400" },
  { id: "manager",  name: "Gerente Ops",     role: "manager",  initials: "GO", color: "text-blue-400" },
  { id: "ana",      name: "Ana Lima",        role: "traffic",  initials: "AL", color: "text-green-400" },
  { id: "pedro",    name: "Pedro Alves",     role: "traffic",  initials: "PA", color: "text-green-400" },
  { id: "carlos",   name: "Carlos Melo",     role: "social",   initials: "CM", color: "text-pink-400" },
  { id: "mariana",  name: "Mariana Costa",   role: "social",   initials: "MC", color: "text-pink-400" },
  { id: "rafael",   name: "Rafael Designer", role: "designer", initials: "RD", color: "text-yellow-400" },
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
  // keep setRole/setCurrentUser for backward compat
  setRole: (role: Role) => void;
  setCurrentUser: (name: string) => void;
  roleLabel: string;
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
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfileState] = useState<UserProfile>(DEFAULT_PROFILE);

  const setProfile = (profile: UserProfile) => {
    setCurrentProfileState(profile);
  };

  // backward compat: setRole picks the first user with that role
  const setRole = (role: Role) => {
    const found = USER_PROFILES.find((p) => p.role === role);
    if (found) setCurrentProfileState(found);
  };

  const setCurrentUser = (name: string) => {
    const found = USER_PROFILES.find((p) => p.name === name);
    if (found) setCurrentProfileState(found);
  };

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
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
