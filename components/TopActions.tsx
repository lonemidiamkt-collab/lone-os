"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { Bell, LogOut, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import { ExpandableTabs, type ExpandableItem } from "@/components/ui/expandable-tabs";
import MedievalAvatar, { getUserAvatar } from "@/components/MedievalAvatars";
import { useRole } from "@/lib/context/RoleContext";
import { useTheme } from "@/lib/context/ThemeContext";
import { useNotificationsStore } from "@/stores/useNotificationsStore";

// A barra mora no <Header> das telas que o usam; nas outras, o AppShell a mostra flutuando no
// canto. Este contador diz ao AppShell se há um Header montado, para ela não aparecer duas vezes.
const useTopo = create<{ headers: number; entrar: () => void; sair: () => void }>((set) => ({
  headers: 0,
  entrar: () => set((s) => ({ headers: s.headers + 1 })),
  sair: () => set((s) => ({ headers: Math.max(0, s.headers - 1) })),
}));

export function useRegistrarHeader() {
  const entrar = useTopo((s) => s.entrar);
  const sair = useTopo((s) => s.sair);
  useEffect(() => { entrar(); return sair; }, [entrar, sair]);
}

export const ABRIR_BUSCA = "lone:abrir-busca";
export const ABRIR_NOTIFICACOES = "lone:abrir-notificacoes";

const PODE_CRIAR_CONTEUDO = new Set(["admin", "manager", "social"]);

export default function TopActions({ flutuante = false }: { flutuante?: boolean }) {
  const pathname = usePathname();
  const headers = useTopo((s) => s.headers);
  const { currentProfile, role, roleLabel, logout } = useRole();
  const { theme, toggleTheme } = useTheme();
  const naoLidas = useNotificationsStore((s) => s.notifications.filter((n) => !n.read).length);

  if (flutuante && headers > 0) return null;

  const items: ExpandableItem[] = [
    { key: "busca", label: "Buscar (⌘K)", icon: Search, onClick: () => window.dispatchEvent(new Event(ABRIR_BUSCA)) },
    ...(PODE_CRIAR_CONTEUDO.has(role)
      ? [{ key: "novo", label: "Novo conteúdo", icon: Plus, href: "/social?action=new-content" }]
      : []),
    { key: "notificacoes", label: "Notificações", icon: Bell, badge: naoLidas, onClick: () => window.dispatchEvent(new Event(ABRIR_NOTIFICACOES)) },
    { type: "separator", key: "sep" },
    { key: "tema", label: theme === "dark" ? "Modo claro" : "Modo escuro", icon: theme === "dark" ? Sun : Moon, onClick: toggleTheme },
    { key: "config", label: "Configurações", icon: Settings, href: "/settings", active: pathname === "/settings" },
    {
      key: "sair", label: "Sair", icon: LogOut, tone: "danger",
      onClick: () => { if (window.confirm("Sair da conta?")) logout(); },
    },
  ];

  return (
    <div className={flutuante ? "fixed right-4 top-3 z-30 hidden lg:flex items-center gap-2" : "hidden lg:flex items-center gap-2 shrink-0"}>
      <ExpandableTabs items={items} />
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card py-1 pl-1 pr-3 shadow-sm" title={`${currentProfile.name} · ${roleLabel}`}>
        <MedievalAvatar type={getUserAvatar(currentProfile.id)} size={30} />
        <div className="hidden xl:block leading-tight">
          <p className="max-w-[120px] truncate text-xs font-medium text-foreground">{currentProfile.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{roleLabel}</p>
        </div>
      </div>
    </div>
  );
}
