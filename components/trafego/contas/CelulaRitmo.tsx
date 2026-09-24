"use client";

// Célula "Ritmo do mês" de Contas & Verba (Leva 7A — redesenhada).
//
// O CEO não conseguia ler a versão anterior: barra azul fina, um tracinho branco minúsculo para
// "hoje" e um texto pequeno em azul. Agora a célula responde de relance, na ordem em que se lê:
//   1. quanto saiu de quanto (e o %, em peso legível);
//   2. a barra — cheia = gasto; fantasma = onde o mês fecha no ritmo dos últimos 3 dias;
//      traço vertical = onde o gasto deveria estar HOJE num mês linear;
//   3. o status com cor e ícone: No ritmo · Acima (estoura dia X) · Abaixo · Travada.
// As regras moram em lib/trafego/contas-verba.ts (lerRitmo), testadas.

import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert, TrendingDown, type LucideIcon } from "lucide-react";
import type { LeituraRitmo, RitmoMes, TomRitmo } from "@/lib/trafego/contas-verba";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Cor por tom. `cor` vai em CSS var porque a projeção usa a MESMA cor em transparência
 *  (color-mix) — os lone-* não aceitam /opacidade do Tailwind. */
export const TOM_RITMO: Record<TomRitmo, { texto: string; barra: string; cor: string; icone: LucideIcon }> = {
  no_ritmo:  { texto: "text-lone-success",     barra: "bg-lone-success",     cor: "var(--lone-success)",     icone: CheckCircle2 },
  acima:     { texto: "text-lone-warning",     barra: "bg-lone-warning",     cor: "var(--lone-warning)",     icone: AlertTriangle },
  abaixo:    { texto: "text-lone-info",        barra: "bg-lone-info",        cor: "var(--lone-info)",        icone: TrendingDown },
  travada:   { texto: "text-lone-danger",      barra: "bg-destructive",      cor: "var(--destructive)",      icone: OctagonAlert },
  sem_dados: { texto: "text-muted-foreground", barra: "bg-muted-foreground", cor: "var(--muted-foreground)", icone: CircleDashed },
  sem_verba: { texto: "text-muted-foreground", barra: "bg-muted-foreground", cor: "var(--muted-foreground)", icone: CircleDashed },
};

const limitar = (n: number) => Math.max(0, Math.min(100, n));

/** A barra sozinha (também usada na legenda). */
export function BarraRitmo({ leitura, className }: { leitura: Pick<LeituraRitmo, "tom" | "pctGasto" | "pctProjetado" | "pctHoje">; className?: string }) {
  const ui = TOM_RITMO[leitura.tom];
  const gasto = limitar(leitura.pctGasto ?? 0);
  const proj = leitura.pctProjetado != null ? limitar(leitura.pctProjetado) : gasto;
  const estoura = (leitura.pctProjetado ?? 0) > 100;
  return (
    <div className={cn("relative h-2.5 w-full rounded-full bg-muted", className)}>
      {/* Projeção (fantasma): do gasto até onde o mês fecha no ritmo recente. */}
      {proj > gasto && (
        <div
          className={cn("absolute inset-y-0 rounded-full", estoura && "rounded-r-none")}
          style={{ left: `${gasto}%`, width: `${proj - gasto}%`, background: `color-mix(in srgb, ${ui.cor} 30%, transparent)` }}
        />
      )}
      {/* Gasto até agora. */}
      <div className={cn("absolute inset-y-0 left-0 rounded-full", ui.barra)} style={{ width: `${gasto}%` }} />
      {/* Passa da verba: a ponta direita ganha um corte na cor do status. */}
      {estoura && <div className={cn("absolute -right-0.5 -top-1 h-[18px] w-1 rounded-full", ui.barra)} />}
      {/* Hoje: onde o gasto deveria estar num mês linear. Anel da cor do card separa do preenchimento. */}
      <div
        className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card"
        style={{ left: `${limitar(leitura.pctHoje)}%` }}
      />
    </div>
  );
}

export default function CelulaRitmo({
  ritmo, leitura, onDefinirVerba, compacta = false,
}: {
  ritmo: RitmoMes;
  leitura: LeituraRitmo;
  onDefinirVerba?: () => void;
  /** Cartão do celular: mesma informação, sem a linha de projeção. */
  compacta?: boolean;
}) {
  const ui = TOM_RITMO[leitura.tom];
  const Icone = ui.icone;

  if (leitura.tom === "sem_verba") {
    return (
      <div className="min-w-0">
        <p className="text-sm tabular-nums text-foreground">
          {ritmo.gasto != null ? brl0(ritmo.gasto) : "—"}
          <span className="text-xs text-muted-foreground"> no mês</span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icone size={13} className="shrink-0" aria-hidden="true" />
          Sem verba definida
          {onDefinirVerba && (
            <button type="button" onClick={onDefinirVerba} className="font-medium text-primary hover:underline">
              Definir
            </button>
          )}
        </p>
      </div>
    );
  }

  const esperado = ritmo.esperado;
  const resumo = [
    `Dia ${ritmo.dia} de ${ritmo.diasNoMes}.`,
    ritmo.gasto != null && ritmo.verba != null ? `Gasto ${brl0(ritmo.gasto)} de ${brl0(ritmo.verba)}.` : null,
    esperado != null ? `Até hoje o esperado era ${brl0(esperado)}.` : null,
    leitura.titulo + ".",
  ].filter(Boolean).join(" ");

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">
          <span className="text-sm font-medium text-foreground">{ritmo.gasto != null ? brl0(ritmo.gasto) : "—"}</span>
          {ritmo.verba != null && <> de {brl0(ritmo.verba)}</>}
        </p>
        <span className={cn("shrink-0 text-sm font-semibold tabular-nums", ui.texto)}>
          {ritmo.gasto != null && ritmo.verba ? `${Math.round((ritmo.gasto / ritmo.verba) * 100)}%` : "—"}
        </span>
      </div>

      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <div role="img" aria-label={resumo} tabIndex={0} className="mt-1.5 cursor-help rounded-full py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BarraRitmo leitura={leitura} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] border border-border bg-popover p-3 text-popover-foreground shadow-sm">
          <p className="text-xs font-medium">Dia {ritmo.dia} de {ritmo.diasNoMes}</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] tabular-nums">
            <dt className="text-muted-foreground">Gasto</dt>
            <dd className="text-right">{ritmo.gasto != null ? brl0(ritmo.gasto) : "—"}</dd>
            <dt className="text-muted-foreground">Esperado até hoje</dt>
            <dd className="text-right">{esperado != null ? brl0(esperado) : "—"}</dd>
            {leitura.ritmoDia != null && <>
              <dt className="text-muted-foreground">Ritmo {leitura.fonteRitmo === "3d" ? "(3 dias)" : "(mês)"}</dt>
              <dd className="text-right">{brl0(leitura.ritmoDia)}/dia</dd>
            </>}
            {ritmo.diaIdeal != null && <>
              <dt className="text-muted-foreground">Ideal</dt>
              <dd className="text-right">{brl0(ritmo.diaIdeal)}/dia</dd>
            </>}
            {leitura.projetadoFim != null && <>
              <dt className="text-muted-foreground">Fim do mês</dt>
              <dd className="text-right">~{brl0(leitura.projetadoFim)}</dd>
            </>}
          </dl>
          <p className="mt-2 border-t border-border pt-2 text-[11px] leading-snug text-muted-foreground">
            Barra cheia = gasto · parte clara = projeção até o fim do mês · traço = onde o gasto deveria estar hoje.
          </p>
        </TooltipContent>
      </Tooltip>

      <p className={cn("mt-1 flex items-center gap-1.5 text-xs font-medium", ui.texto)}>
        <Icone size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{leitura.titulo}</span>
      </p>
      {!compacta && leitura.detalhe && (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={leitura.detalhe}>{leitura.detalhe}</p>
      )}
    </div>
  );
}
