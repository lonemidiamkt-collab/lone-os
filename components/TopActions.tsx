"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { Bell, ChevronDown, Info, LogOut, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import { ExpandableTabs, type ExpandableItem } from "@/components/ui/expandable-tabs";
import { FotoPessoa } from "@/components/ui/FotoPessoa";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** "⌘K" no Mac, "Ctrl+K" no resto. Começa em ⌘K nos dois lados (servidor e cliente) para não
 *  quebrar a hidratação, e só troca depois de montar. */
function useAtalhoBusca(): string {
  const [atalho, setAtalho] = useState("⌘K");
  useEffect(() => {
    const plataforma = (typeof navigator !== "undefined" && (navigator.platform || navigator.userAgent)) || "";
    if (!/Mac|iPhone|iPad|iPod/i.test(plataforma)) setAtalho("Ctrl+K");
  }, []);
  return atalho;
}

export default function TopActions({ flutuante = false }: { flutuante?: boolean }) {
  const pathname = usePathname();
  const atalhoBusca = useAtalhoBusca();
  const headers = useTopo((s) => s.headers);
  const { currentProfile, role, roleLabel, logout } = useRole();
  const { theme, toggleTheme } = useTheme();
  const naoLidas = useNotificationsStore((s) => s.notifications.filter((n) => !n.read).length);

  if (flutuante && headers > 0) return null;

  const items: ExpandableItem[] = [
    { key: "busca", label: `Buscar (${atalhoBusca})`, icon: Search, onClick: () => window.dispatchEvent(new Event(ABRIR_BUSCA)) },
    ...(PODE_CRIAR_CONTEUDO.has(role)
      ? [{ key: "novo", label: "Novo conteúdo", icon: Plus, href: "/social?action=new-content" }]
      : []),
    { key: "notificacoes", label: "Notificações", icon: Bell, badge: naoLidas, onClick: () => window.dispatchEvent(new Event(ABRIR_NOTIFICACOES)) },
  ];

  return (
    <div className={flutuante ? "fixed right-4 top-3 z-30 hidden lg:flex items-center gap-2" : "hidden lg:flex items-center gap-2 shrink-0"}>
      <ExpandableTabs items={items} />
      {/* Menu da conta: tudo que é da pessoa (perfil, tema, sair) mora aqui, não na barra de ações. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Conta de ${currentProfile.name}`}
          className="group flex items-center gap-2 rounded-2xl border border-border bg-card py-1 pl-1 pr-2 shadow-sm outline-none transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary/40 data-[state=open]:bg-accent"
        >
          <FotoPessoa perfil={currentProfile} size={30} />
          <span className="hidden xl:block text-left leading-tight">
            <span className="block max-w-[120px] truncate text-xs font-medium text-foreground">{currentProfile.name}</span>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{roleLabel}</span>
          </span>
          <ChevronDown size={14} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
            <FotoPessoa perfil={currentProfile} size={40} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium text-foreground">{currentProfile.name}</span>
              <span className="block text-xs text-muted-foreground">{roleLabel}</span>
              <span className="block truncate text-xs text-muted-foreground">{currentProfile.email}</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className={pathname === "/settings" ? "bg-accent" : undefined}>
            <Link href="/settings"><Settings size={15} className="mr-2" />Perfil e configurações</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleTheme(); }}>
            {theme === "dark" ? <Sun size={15} className="mr-2" /> : <Moon size={15} className="mr-2" />}
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(ABRIR_BUSCA))}>
            <Search size={15} className="mr-2" />Buscar
            <DropdownMenuShortcut>{atalhoBusca}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/sobre"><Info size={15} className="mr-2" />Novidades e manual</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => { if (window.confirm("Sair da conta?")) logout(); }}
          >
            <LogOut size={15} className="mr-2" />Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
