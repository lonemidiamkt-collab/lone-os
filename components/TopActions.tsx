"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { Bell, ChevronDown, ChevronRight, LogOut, Moon, Plus, Search, Settings, Sun } from "lucide-react";
import { ExpandableTabs, type ExpandableItem } from "@/components/ui/expandable-tabs";
import { FotoPessoa } from "@/components/ui/FotoPessoa";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRole } from "@/lib/context/RoleContext";
import { useTheme } from "@/lib/context/ThemeContext";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { casarRota, menuDoPapel } from "@/lib/navegacao/menu";

// A barra mora no <Header> das telas que o usam; nas outras, o AppShell põe uma FAIXA própria no
// topo do conteúdo (FaixaTopActions). Este contador diz ao AppShell se há um Header montado, para ela
// não aparecer duas vezes.
//
// Leva 7A: antes, nas telas sem Header, a barra FLUTUAVA (fixed) no canto por cima da página — em
// Contas & Verba cobria os botões do próprio cabeçalho ("Alertas por…" cortado), e cada tela tinha
// que lembrar de reservar o canto (o Comercial usava pr-12). Agora o espaço é reservado no fluxo.
const useTopo = create<{ headers: number; entrar: () => void; sair: () => void }>((set) => ({
  headers: 0,
  entrar: () => set((s) => ({ headers: s.headers + 1 })),
  sair: () => set((s) => ({ headers: Math.max(0, s.headers - 1) })),
}));

// Layout effect: o Header se registra ANTES da pintura, então a faixa do AppShell some no mesmo
// quadro — com useEffect ela piscava (e empurrava a tela 64px) em toda tela que tem Header.
const useEfeitoAntesDePintar = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useRegistrarHeader() {
  const entrar = useTopo((s) => s.entrar);
  const sair = useTopo((s) => s.sair);
  useEfeitoAntesDePintar(() => { entrar(); return sair; }, [entrar, sair]);
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

/**
 * Telas sem <Header> (Contas & Verba, Comercial, Processos, Configurações…): a barra ganha uma faixa
 * do mesmo tamanho do Header no topo do conteúdo, só no computador (no celular a barra não existe —
 * a navegação é a barra inferior). Com o conteúdo começando embaixo dela, nada da página fica coberto.
 */
export function FaixaTopActions() {
  const headers = useTopo((s) => s.headers);
  const pathname = usePathname();
  const { role } = useRole();
  if (headers > 0) return null;
  const casou = casarRota(menuDoPapel(role), pathname);
  return (
    <div className="hidden h-16 shrink-0 items-center gap-4 border-b border-border bg-background px-6 lg:flex">
      <nav aria-label="Você está em" className="min-w-0 flex-1">
        {casou && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{casou.grupo.rotulo}</span>
            {casou.item.rotulo !== casou.grupo.rotulo && (
              <>
                <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
                <span className="truncate font-medium text-foreground">{casou.item.rotulo}</span>
              </>
            )}
          </p>
        )}
      </nav>
      <TopActions />
    </div>
  );
}

export default function TopActions() {
  const pathname = usePathname();
  const atalhoBusca = useAtalhoBusca();
  const { currentProfile, role, roleLabel, logout } = useRole();
  const { theme, toggleTheme } = useTheme();
  const naoLidas = useNotificationsStore((s) => s.notifications.filter((n) => !n.read).length);

  const items: ExpandableItem[] = [
    { key: "busca", label: `Buscar (${atalhoBusca})`, icon: Search, onClick: () => window.dispatchEvent(new Event(ABRIR_BUSCA)) },
    ...(PODE_CRIAR_CONTEUDO.has(role)
      ? [{ key: "novo", label: "Novo conteúdo", icon: Plus, href: "/social?action=new-content" }]
      : []),
    { key: "notificacoes", label: "Notificações", icon: Bell, badge: naoLidas, onClick: () => window.dispatchEvent(new Event(ABRIR_NOTIFICACOES)) },
    { type: "separator", key: "sep" },
    { key: "tema", label: theme === "dark" ? "Modo claro" : "Modo escuro", icon: theme === "dark" ? Sun : Moon, onClick: toggleTheme },
  ];

  return (
    <div className="hidden lg:flex items-center gap-2 shrink-0">
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
        <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-1.5">
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-3 rounded-md bg-muted/60 p-3">
              <FotoPessoa perfil={currentProfile} size={44} />
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold leading-none text-foreground">{currentProfile.name}</p>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  {roleLabel}
                </span>
                <p className="truncate text-xs text-muted-foreground">{currentProfile.email}</p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className={pathname === "/settings" ? "bg-accent" : undefined}>
            <Link href="/settings"><Settings size={15} className="mr-2" />Perfil e configurações</Link>
          </DropdownMenuItem>
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
