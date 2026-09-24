"use client";

// Público (gênero, faixa etária e cidades) — o MESMO componente para "Quem está vendo seus
// anúncios" (aba Anúncios) e "Público do perfil" (aba Crescimento nas redes). Antes eram dois
// desenhos diferentes, e a faixa etária dos anúncios era um gráfico de barras sem nenhum número.

import type { ReactNode } from "react";
import Skeleton from "@/components/ui/Skeleton";
// clsx (não cn) onde o tamanho de fonte "lone" encontra uma cor de texto: o twMerge acha que os dois são cor
// e apaga o tamanho.
import { clsx } from "clsx";
import { cn } from "@/lib/utils";
import { formatarPct, ordenarFaixas } from "@/lib/portal/formatos";
import { Cartao, CabecalhoSecao } from "./ui";

export interface PublicoCardProps {
  titulo: string;
  descricao?: string;
  genero?: { mulheres: number | null; homens: number | null } | null;
  idades?: { faixa: string; pct: number }[];
  cidades?: { nome: string; pct: number }[];
  carregando?: boolean;
  nota?: ReactNode;
  className?: string;
}

function Subtitulo({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-lone-eyebrow uppercase text-muted-foreground">{children}</p>;
}

export default function PublicoCard({ titulo, descricao, genero, idades = [], cidades = [], carregando = false, nota, className }: PublicoCardProps) {
  const temGenero = !!genero && (genero.mulheres != null || genero.homens != null);
  const faixas = ordenarFaixas(idades.filter((i) => i.pct > 0));
  const maiorFaixa = Math.max(1, ...faixas.map((f) => f.pct));
  const blocos = [temGenero, faixas.length > 0, cidades.length > 0].filter(Boolean).length;

  return (
    <Cartao as="section" className={cn("p-4 sm:p-5", className)}>
      <CabecalhoSecao titulo={titulo} descricao={descricao} />

      {carregando ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2" aria-busy="true">
          <Skeleton className="h-16" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className={cn("mt-4 grid gap-6", blocos >= 2 && "sm:grid-cols-2", blocos >= 3 && "lg:grid-cols-3")}>
          {temGenero && (
            <div className="min-w-0">
              <Subtitulo>Gênero</Subtitulo>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img"
                aria-label={`Mulheres ${formatarPct(genero!.mulheres ?? 0)}, homens ${formatarPct(genero!.homens ?? 0)}`}>
                <div className="h-full bg-chart-4" style={{ width: `${Math.max(0, Math.min(100, genero!.mulheres ?? 0))}%` }} />
                <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, genero!.homens ?? 0))}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {([["Mulheres", genero!.mulheres, "bg-chart-4"], ["Homens", genero!.homens, "bg-primary"]] as const).map(([rotulo, pct, cor]) => (
                  <div key={rotulo} className="min-w-0">
                    <p className="flex items-center gap-1.5 text-lone-caption text-muted-foreground">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", cor)} aria-hidden />{rotulo}
                    </p>
                    <p className="mt-0.5 text-lone-h1 font-semibold tabular-nums tracking-tight text-foreground">
                      {pct == null ? "—" : formatarPct(pct)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {faixas.length > 0 && (
            <div className="min-w-0">
              <Subtitulo>Faixa etária</Subtitulo>
              <ul className="space-y-2">
                {faixas.map((f) => {
                  const maior = f.pct === maiorFaixa;
                  return (
                    <li key={f.faixa} className="flex items-center gap-3">
                      <span className="w-11 shrink-0 text-lone-caption tabular-nums text-muted-foreground">{f.faixa}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className={cn("block h-full rounded-full", maior ? "bg-primary" : "bg-primary/40")}
                          style={{ width: `${Math.max(3, (f.pct / maiorFaixa) * 100)}%` }} />
                      </span>
                      <span className={clsx("w-11 shrink-0 text-right text-lone-caption tabular-nums", maior ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {formatarPct(f.pct)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {cidades.length > 0 && (
            <div className="min-w-0">
              <Subtitulo>Principais cidades</Subtitulo>
              <ol className="space-y-2">
                {cidades.map((c, i) => (
                  <li key={c.nome} className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-lone-body text-foreground">{c.nome}</span>
                    <span className="shrink-0 text-lone-caption tabular-nums text-muted-foreground">{formatarPct(c.pct)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {nota && !carregando && <p className="mt-4 text-lone-caption text-muted-foreground">{nota}</p>}
    </Cartao>
  );
}
