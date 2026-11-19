"use client";

// components/portal/PortalCasco.tsx — o casco do Painel de Resultados (19/11/2026, Lone Results 3.0).
//
// Antes as áreas eram um seletor de até 5 botões numa linha só: no celular ("Atendimento e vendas",
// "Crescimento nas redes", "Conteúdo e envios") a linha passava da tela e as últimas abas ficavam escondidas
// para o lado, sem nada avisando que existiam.
//   · Computador: menu lateral fixo, sempre com todas as áreas à vista.
//   · Celular: barra fixa embaixo, ao alcance do polegar, com nome curto — como um aplicativo. Respeita a
//     faixa do indicador de início do iPhone (safe-area).
// Cliente com uma área só não tem menu nenhum: a página ocupa a tela toda, como antes.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ItemDoCasco<T extends string> {
  valor: T;
  /** Nome completo (menu lateral e leitor de tela). */
  rotulo: string;
  /** Nome que cabe na barra do celular. */
  curto: string;
  icone: LucideIcon;
}

/** Iniciais da empresa para o selo do rodapé do menu ("Império dos Pisos" → "IP"). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  const letras = (partes.length ? partes : [nome.trim()]).map((p) => p[0] ?? "");
  return ((letras[0] ?? "") + (letras.length > 1 ? letras[letras.length - 1] : "")).toUpperCase();
}

const FOCO = "[-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40";

export default function PortalCasco<T extends string>({ itens, valor, onChange, clientName, children }: {
  itens: readonly ItemDoCasco<T>[];
  valor: T;
  onChange: (v: T) => void;
  clientName: string;
  children: ReactNode;
}) {
  const temMenu = itens.length > 1;

  return (
    <div className={cn("min-h-screen bg-background text-foreground", temMenu && "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]")}>
      {temMenu && (
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-card px-3 py-6 lg:flex">
          <div className="flex items-center gap-2 px-3 pb-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Lone Mídia" className="h-5 w-auto" />
            <p className="text-lone-eyebrow uppercase text-muted-foreground">Painel de Resultados</p>
          </div>
          <nav aria-label="Áreas do painel" className="flex flex-col gap-1">
            {itens.map((it) => {
              const ativo = it.valor === valor;
              const Icone = it.icone;
              return (
                <button key={it.valor} type="button" aria-current={ativo ? "page" : undefined}
                  onClick={() => { if (!ativo) onChange(it.valor); }}
                  className={cn(
                    "flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors duration-200", FOCO,
                    ativo ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-foreground",
                  )}>
                  <Icone size={17} className={cn("shrink-0", ativo && "text-lone-brand-soft")} aria-hidden />
                  <span className="min-w-0 break-words">{it.rotulo}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-auto flex items-center gap-3 border-t border-border px-2 pt-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-lone-brand-soft" aria-hidden>
              {iniciais(clientName)}
            </span>
            <p className="min-w-0 break-words text-sm font-medium leading-snug text-foreground">{clientName}</p>
          </div>
        </aside>
      )}

      {/* No celular o conteúdo termina acima da barra (4rem) — o html já reserva a faixa do iPhone. */}
      <div className={cn("min-w-0", temMenu && "pb-16 lg:pb-0")}>{children}</div>

      {temMenu && (
        <nav aria-label="Áreas do painel"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="mx-auto flex max-w-lg">
            {itens.map((it) => {
              const ativo = it.valor === valor;
              const Icone = it.icone;
              return (
                <button key={it.valor} type="button" aria-label={it.rotulo} aria-current={ativo ? "page" : undefined}
                  onClick={() => { if (!ativo) onChange(it.valor); }}
                  className={cn(
                    "flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors duration-200", FOCO,
                    ativo ? "text-foreground" : "text-muted-foreground",
                  )}>
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", ativo && "bg-primary/15 text-lone-brand-soft")}>
                    <Icone size={18} aria-hidden />
                  </span>
                  <span className={cn("max-w-full truncate text-[11px] leading-none", ativo && "font-medium")}>{it.curto}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
