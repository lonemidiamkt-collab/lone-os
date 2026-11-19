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
// Na barra cabem 5 botões: com 6 áreas, as 4 primeiras ficam à vista e as outras abrem em "Mais".

import { useEffect, useState, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
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

const MAX_NA_BARRA = 5;

const FOCO = "[-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40";

export default function PortalCasco<T extends string>({ itens, valor, onChange, clientName, children }: {
  itens: readonly ItemDoCasco<T>[];
  valor: T;
  onChange: (v: T) => void;
  clientName: string;
  children: ReactNode;
}) {
  const temMenu = itens.length > 1;
  // Barra do celular: até 5 cabem inteiras; passando disso, 4 + "Mais".
  const naBarra = itens.length > MAX_NA_BARRA ? itens.slice(0, MAX_NA_BARRA - 1) : itens;
  const emMais = itens.slice(naBarra.length);
  const [maisAberto, setMaisAberto] = useState(false);
  const ativoEmMais = emMais.some((it) => it.valor === valor);
  // Paleta do portal também no <html>: as janelas (anúncios ativos, "Como contamos") abrem fora do casco.
  useEffect(() => {
    document.documentElement.classList.add("casco-portal");
    return () => document.documentElement.classList.remove("casco-portal");
  }, []);
  useEffect(() => {
    if (!maisAberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setMaisAberto(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [maisAberto]);

  return (
    <div className={cn("casco-portal min-h-screen bg-background text-foreground", temMenu && "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]")}>
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

      {/* "Mais" aberto: véu atrás da barra; toque fora fecha. */}
      {maisAberto && (
        <button type="button" aria-label="Fechar o menu de áreas" tabIndex={-1} onClick={() => setMaisAberto(false)}
          className="fixed inset-0 z-[55] cursor-default bg-overlay lg:hidden" />
      )}

      {temMenu && (
        <nav aria-label="Áreas do painel"
          // Com "Mais" aberto a barra passa na frente do botão do WhatsApp (z-50), que fica sob o véu.
          className={cn("fixed inset-x-0 bottom-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden", maisAberto ? "z-[60]" : "z-40")}>
          {maisAberto && (
            <>
              <div id="portal-mais" className="border-b border-border bg-card p-2">
                {emMais.map((it) => {
                  const ativo = it.valor === valor;
                  const Icone = it.icone;
                  return (
                    <button key={it.valor} type="button" aria-current={ativo ? "page" : undefined}
                      onClick={() => { setMaisAberto(false); if (!ativo) onChange(it.valor); }}
                      className={cn("flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm", FOCO,
                        ativo ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground")}>
                      <Icone size={17} className={cn("shrink-0", ativo && "text-lone-brand-soft")} aria-hidden />
                      {it.rotulo}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="mx-auto flex max-w-lg">
            {naBarra.map((it) => {
              const ativo = it.valor === valor;
              const Icone = it.icone;
              return (
                <button key={it.valor} type="button" aria-label={it.rotulo} aria-current={ativo ? "page" : undefined}
                  onClick={() => { setMaisAberto(false); if (!ativo) onChange(it.valor); }}
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
            {emMais.length > 0 && (
              <button type="button" aria-label="Mais áreas" aria-expanded={maisAberto} aria-controls="portal-mais"
                onClick={() => setMaisAberto((v) => !v)}
                className={cn("flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors duration-200", FOCO,
                  ativoEmMais || maisAberto ? "text-foreground" : "text-muted-foreground")}>
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", (ativoEmMais || maisAberto) && "bg-primary/15 text-lone-brand-soft")}>
                  <MoreHorizontal size={18} aria-hidden />
                </span>
                <span className={cn("max-w-full truncate text-[11px] leading-none", ativoEmMais && "font-medium")}>Mais</span>
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
