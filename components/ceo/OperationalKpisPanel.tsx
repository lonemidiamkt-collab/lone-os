"use client";

import { useMemo } from "react";
import type { ContentCard } from "@/lib/types";
import { computeOperationalKpis, stageLabel } from "@/lib/kpis/operational";

// Painel "Operação" do /ceo — transforma dados que já existem no content_cards
// (columnEnteredAt, dueDate, total_time_spent_ms, non_delivery_reason) em indicadores.

function Tile({ label, value, caption, tone }: { label: string; value: string | number; caption?: string; tone?: "good" | "bad" }) {
  const valueCls = tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueCls}`}>{value}</div>
      {caption && <div className="mt-1 text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}

export function OperationalKpisPanel({ cards }: { cards: ContentCard[] }) {
  const k = useMemo(() => computeOperationalKpis(cards), [cards]);
  const fmt = (v: number | null, suf = "") => (v == null ? "—" : `${v}${suf}`);
  const maxStage = Math.max(1, ...k.stages.map((s) => s.avgDays));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Indicadores de produção, calculados do que a equipe já registra no Kanban (entrada em cada coluna,
        data de postagem, tempo ativo). Base: {k.sampleSize} card{k.sampleSize === 1 ? "" : "s"} publicado{k.sampleSize === 1 ? "" : "s"}.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Lead time (ideia → publicado)" value={fmt(k.leadTimeDays, "d")} caption="mediana" />
        <Tile
          label="Publicado no prazo"
          value={fmt(k.onTimeRate, "%")}
          caption={k.onTimeRate == null ? "sem data definida" : "do que tinha data"}
          tone={k.onTimeRate == null ? undefined : k.onTimeRate >= 80 ? "good" : "bad"}
        />
        <Tile
          label="Publicações atrasadas"
          value={k.latePublishCount}
          caption={k.avgLateDays != null ? `atraso médio ${k.avgLateDays}d` : "nenhuma"}
          tone={k.latePublishCount > 0 ? "bad" : "good"}
        />
        <Tile label="Tempo ativo médio / card" value={fmt(k.avgWorkHours, "h")} caption="em produção" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Tempo médio por etapa</h3>
          {k.bottleneck && (
            <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
              Gargalo: {stageLabel(k.bottleneck.stage)} ({k.bottleneck.avgDays}d)
            </span>
          )}
        </div>
        {k.stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem transições registradas ainda.</p>
        ) : (
          <div className="space-y-2.5">
            {k.stages.map((s) => (
              <div key={s.stage} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-xs text-muted-foreground">{stageLabel(s.stage)}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(s.avgDays / maxStage) * 100}%` }} />
                </div>
                <div className="w-20 shrink-0 text-right text-xs font-medium text-foreground">
                  {s.avgDays}d <span className="text-muted-foreground">({s.samples})</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {k.nonDeliveryReasons.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Motivos de não-entrega</h3>
          <div className="space-y-2">
            {k.nonDeliveryReasons.map((r) => (
              <div key={r.reason} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{r.reason}</span>
                <span className="font-medium text-foreground">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {k.sampleSize === 0 && (
        <p className="text-xs text-muted-foreground">
          Ainda não há cards publicados o suficiente pra calcular lead time e prazo — os números aparecem conforme a equipe publica.
        </p>
      )}
    </div>
  );
}
