"use client";

// components/conteudo/Cronometro.tsx — cronômetro da etapa no card e carga diária dos designers
// (Leva 7B, N18). A conta mora em lib/conteudo/capacidade.ts.

import { AlertTriangle, Gauge, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEM_DONO } from "@/lib/design/dono";
import { LIMITE_ARTES_POR_DIA, type CargaDesigner, type Cronometro, type TomCronometro } from "@/lib/conteudo/capacidade";

const TOM_TEXTO: Record<TomCronometro, string> = {
  ok: "text-muted-foreground",
  neutro: "text-muted-foreground",
  atencao: "text-lone-warning",
  estourado: "text-destructive",
};
const TOM_BARRA: Record<TomCronometro, string> = {
  ok: "bg-primary",
  neutro: "bg-muted-foreground",
  atencao: "bg-lone-warning",
  estourado: "bg-destructive",
};

/** Linha fina "5h na etapa · faltam 2d" com a barra do tempo consumido até o prazo. */
export function CronometroDaEtapa({ cronometro: c, className }: { cronometro: Cronometro; className?: string }) {
  const pct = c.fracao === null ? null : Math.min(100, Math.max(4, Math.round(c.fracao * 100)));
  return (
    <div className={cn("space-y-1", className)} title={c.prazo ? `Prazo desta etapa: ${c.prazo.split("-").reverse().join("/")}` : "Sem prazo nesta etapa"}>
      <p className={cn("text-[10px] font-medium flex items-center gap-1 tabular-nums", TOM_TEXTO[c.tom])}>
        <Timer size={10} aria-hidden="true" /> {c.rotulo}
      </p>
      {pct !== null && (
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tempo consumido até o prazo">
          <div className={cn("h-full rounded-full", TOM_BARRA[c.tom])} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function rotuloDia(ymd: string, hoje: string): string {
  if (ymd === hoje) return "hoje";
  const [y, m, d] = ymd.split("-").map(Number);
  return DIA_CURTO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** A faixa de carga de UM designer: artes por dia útil, com o dia acima do limite em destaque. */
export function FaixaDeCarga({ carga, hoje, limite = LIMITE_ARTES_POR_DIA, className }: { carga: CargaDesigner; hoje: string; limite?: number; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${carga.dias.length}, minmax(0, 1fr))` }}>
        {carga.dias.map((d) => (
          <div key={d.data} title={`${d.artes} arte${d.artes === 1 ? "" : "s"} com prazo ${rotuloDia(d.data, hoje)}${d.acima ? ` — acima do limite de ${limite}` : ""}`}
            className={cn("rounded-md border px-1 py-0.5 text-center",
              d.acima ? "border-destructive/30 bg-destructive/10" : d.artes === 0 ? "border-border bg-card" : "border-border bg-muted")}>
            <p className="text-[9px] uppercase text-muted-foreground leading-tight">{rotuloDia(d.data, hoje)}</p>
            <p className={cn("text-[11px] font-medium tabular-nums leading-tight", d.acima ? "text-destructive" : "text-foreground")}>{d.artes}</p>
          </div>
        ))}
      </div>
      {(carga.vencidas > 0 || carga.semPrazo > 0) && (
        <p className="text-[10px] text-muted-foreground">
          {carga.vencidas > 0 && <span className="text-destructive font-medium">{carga.vencidas} vencida{carga.vencidas > 1 ? "s" : ""} (conta hoje)</span>}
          {carga.vencidas > 0 && carga.semPrazo > 0 ? " · " : ""}
          {carga.semPrazo > 0 && `${carga.semPrazo} sem prazo`}
        </p>
      )}
    </div>
  );
}

/** Painel "Capacidade do time": uma linha por designer, aviso de quem passou do limite. */
export function CargaDosDesigners({ cargas, hoje, limite = LIMITE_ARTES_POR_DIA, destaque, className }: {
  cargas: CargaDesigner[];
  hoje: string;
  limite?: number;
  /** Nome de quem está vendo (a linha dele fica marcada). */
  destaque?: string | null;
  className?: string;
}) {
  if (!cargas.length) return null;
  const acima = cargas.filter((c) => c.acima);
  return (
    <section aria-label="Carga dos designers" className={cn("rounded-xl border border-border bg-card p-4 space-y-3", className)}>
      <header className="flex flex-wrap items-center gap-2">
        <Gauge size={14} className="text-primary" aria-hidden="true" />
        <h3 className="text-sm font-medium text-foreground">Carga por dia</h3>
        <span className="text-[11px] text-muted-foreground">artes a entregar pelo prazo · limite {limite} por dia</span>
        {acima.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
            <AlertTriangle size={12} aria-hidden="true" /> {acima.map((c) => (c.designer === SEM_DONO ? "Sem designer" : c.designer.split(" ")[0])).join(", ")} acima do limite
          </span>
        )}
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cargas.map((c) => (
          <div key={c.designer} className={cn("rounded-lg border p-2.5 space-y-2", c.designer === destaque ? "border-primary/40" : "border-border")}>
            <p className="text-xs font-medium text-foreground truncate">
              {c.designer === SEM_DONO ? "Sem designer" : c.designer}{c.designer === destaque ? " (você)" : ""}
            </p>
            <FaixaDeCarga carga={c} hoje={hoje} limite={limite} />
          </div>
        ))}
      </div>
    </section>
  );
}
