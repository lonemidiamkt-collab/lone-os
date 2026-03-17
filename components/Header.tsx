"use client";

import { Bell, ChevronDown, Users } from "lucide-react";
import { useState } from "react";
import type { Role } from "@/lib/types";
import { useRole, USER_PROFILES } from "@/lib/context/RoleContext";

const ROLE_LABELS: Record<Role, string> = {
  admin: "CEO",
  manager: "Gerente",
  traffic: "Tráfego Pago",
  social: "Social Media",
  designer: "Designer",
};

const ROLE_GROUPS: { role: Role; label: string }[] = [
  { role: "admin",    label: "Diretoria" },
  { role: "manager",  label: "Gestão" },
  { role: "traffic",  label: "Tráfego Pago" },
  { role: "social",   label: "Social Media" },
  { role: "designer", label: "Design" },
];

const avatarDotColor: Record<string, string> = {
  "text-purple-400": "bg-purple-400",
  "text-blue-400":   "bg-blue-400",
  "text-green-400":  "bg-green-400",
  "text-pink-400":   "bg-pink-400",
  "text-yellow-400": "bg-yellow-400",
};

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { currentProfile, setProfile, roleLabel } = useRole();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur flex items-center px-6 gap-4 shrink-0">
      {/* Title */}
      <div className="flex-1">
        <h2 className="font-semibold text-foreground text-sm leading-none">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-xs mt-1">{subtitle}</p>}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 w-56 border border-border">
        <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          placeholder="Buscar..."
        />
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-accent transition-colors">
        <Bell size={18} className="text-muted-foreground" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
      </button>

      {/* User Profile Switcher */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2.5 bg-muted border border-border rounded-xl px-3 py-2 hover:bg-accent transition-colors"
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className={`text-xs font-bold ${currentProfile.color}`}>
              {currentProfile.initials}
            </span>
          </div>

          {/* Name + Role */}
          <div className="text-left">
            <p className="text-xs font-semibold text-foreground leading-none">{currentProfile.name}</p>
            <p className={`text-xs leading-none mt-0.5 ${currentProfile.color}`}>
              {roleLabel}
            </p>
          </div>

          <ChevronDown size={13} className="text-muted-foreground" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-2 w-60 bg-card border border-border rounded-xl shadow-xl z-50 py-2 animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center gap-2 px-3 pb-2 mb-1 border-b border-border">
                <Users size={12} className="text-muted-foreground" />
                <p className="text-muted-foreground text-xs font-medium">Simular usuário (dev)</p>
              </div>

              {ROLE_GROUPS.map((group) => {
                const groupProfiles = USER_PROFILES.filter((p) => p.role === group.role);
                return (
                  <div key={group.role}>
                    <p className="text-muted-foreground/60 text-[10px] font-semibold uppercase tracking-widest px-3 pt-2 pb-1">
                      {group.label}
                    </p>
                    {groupProfiles.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => { setProfile(profile); setShowMenu(false); }}
                        className={`w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2.5 ${
                          currentProfile.id === profile.id ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <span className={`text-[10px] font-bold ${profile.color}`}>{profile.initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-none font-medium ${currentProfile.id === profile.id ? profile.color : "text-foreground"}`}>
                            {profile.name}
                          </p>
                          <p className="text-xs text-muted-foreground/60 leading-none mt-0.5">
                            {ROLE_LABELS[profile.role]}
                          </p>
                        </div>
                        {currentProfile.id === profile.id && (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${avatarDotColor[profile.color] ?? "bg-primary"}`} />
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
