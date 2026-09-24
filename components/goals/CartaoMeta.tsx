"use client";

// Uma meta na tela Metas & OKRs (N33): o MÊS FECHADO contra o alvo, os últimos meses fechados e o
// parcial do mês corrente. Números prontos do servidor (/api/goals); aqui é só desenho.

import { useState } from "react";
import { Info, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_STATUS, formatarValorMeta, mesCurto, type StatusMeta } from "@/lib/goals/catalogo";
import type { MetaPainel } from "@/lib/goals/metas-server";

const ESTILO_STATUS: Record<StatusMeta, { selo: string; barra: string }> = {
  batida: { selo: "border-lone-success-border bg-lone-success-bg text-lone-success", barra: "bg-lone-success" },
  perto: { selo: "border-lone-warning-border bg-lone-warning-bg text-lone-warning", barra: "bg-lone-warning" },
  longe: { selo: "border-lone-danger-border bg-lone-danger-bg text-lone-danger", barra: "bg-lone-danger" },
  sem_dado: { selo: "border-border bg-muted text-muted-foreground", barra: "bg-muted-foreground" },
};

const UNIDADE_EXTENSO: Partial<Record<MetaPainel["unidade"], string>> = {
  clientes: "clientes", posts: "posts", artes: "artes", conversas: "conversas",
};

export function textoAlvo(m: Pick<MetaPainel, "unidade" | "casas" | "sentido">, alvo: number): string {
  const v = formatarValorMeta(m, alvo);
  const un = UNIDADE_EXTENSO[m.unidade] ? ` ${UNIDADE_EXTENSO[m.unidade]}` : "";
  return m.sentido === "menor" ? `meta: até ${v}${un}` : `meta: ${v}${un}`;
}

function Historico({ m }: { m: MetaPainel }) {
  const valores = m.historico.map((p) => p.valor).filter((v): v is number => v != null);
  const teto = Math.max(...valores, ...m.historico.map((p) => p.alvo ?? 0), 1);
  return (
    <div className="flex h-12 items-end gap-1.5" role="img"
      aria-label={`Últimos meses: ${m.historico.map((p) => `${mesCurto(p.periodo)} ${formatarValorMeta(m, p.valor)}`).join(", ")}`}>
      {m.historico.map((p) => {
        const altura = p.valor == null ? 8 : Math.max(8, Math.round((p.valor / teto) * 100));
        return (
          <div key={p.periodo} className="flex flex-1 flex-col items-center gap-1" title={`${mesCurto(p.periodo)}: ${formatarValorMeta(m, p.valor)}${p.alvo != null ? ` (${textoAlvo(m, p.alvo)})` : ""}`}>
            <div className="flex h-9 w-full items-end">
              <div className={cn("w-full rounded-sm", p.valor == null ? "bg-muted" : ESTILO_STATUS[p.status].barra)} style={{ height: `${altura}%` }} />
            </div>
            <span className="text-[9px] leading-none text-muted-foreground">{mesCurto(p.periodo).slice(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CartaoMeta({ m, nomeMesAtual, editando, onSalvar, onPadrao, salvando }: {
  m: MetaPainel;
  /** "setembro" — o rótulo do parcial. */
  nomeMesAtual: string;
  editando: boolean;
  onSalvar: (chave: string, alvo: number) => void;
  onPadrao: (chave: string) => void;
  salvando: boolean;
}) {
  const [rascunho, setRascunho] = useState(String(m.alvo));
  const f = m.fechado;
  const estilo = ESTILO_STATUS[f.status];

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-snug text-foreground">
          <span className="min-w-0">{m.titulo}</span>
          <span title={`Fonte: ${m.fonte}`} className="shrink-0 cursor-help text-muted-foreground" aria-label={`Fonte: ${m.fonte}`}>
            <Info size={13} aria-hidden />
          </span>
        </h3>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", estilo.selo)}>{ROTULO_STATUS[f.status]}</span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-lone-hero tabular-nums text-foreground">{formatarValorMeta(m, f.valor)}</span>
        {f.valor != null && UNIDADE_EXTENSO[m.unidade] && <span className="text-lone-caption text-muted-foreground">{UNIDADE_EXTENSO[m.unidade]}</span>}
      </div>
      <p className="mt-0.5 text-lone-caption text-muted-foreground">{textoAlvo(m, f.alvo)}</p>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-500", estilo.barra)} style={{ width: `${f.progresso ?? 0}%` }} />
      </div>
      <p className="mt-1.5 min-h-[16px] text-lone-caption text-muted-foreground">
        {f.valor == null ? f.semFonte ?? "sem dado" : f.detalhe ?? ""}
      </p>

      <div className="mt-3 border-t border-border pt-3">
        <Historico m={m} />
      </div>

      <p className="mt-3 text-lone-caption text-muted-foreground">
        <span className="capitalize">{nomeMesAtual}</span> até agora:{" "}
        <span className="font-medium text-foreground">{formatarValorMeta(m, m.parcial.valor)}</span>
        {m.parcial.valor == null && m.parcial.semFonte ? <span> · {m.parcial.semFonte}</span> : null}
      </p>

      {editando && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <label className="text-lone-caption text-muted-foreground" htmlFor={`alvo-${m.chave}`}>
            {m.sentido === "menor" ? "Meta (até)" : "Meta"}
          </label>
          <input id={`alvo-${m.chave}`} type="number" inputMode="decimal" min={0} step={m.casas ? 0.1 : 1}
            value={rascunho} onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSalvar(m.chave, Number(rascunho)); }}
            className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground outline-none focus:border-primary" />
          <button type="button" disabled={salvando || rascunho.trim() === "" || Number(rascunho) === m.alvo}
            onClick={() => onSalvar(m.chave, Number(rascunho))}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
            <Save size={12} aria-hidden /> Salvar
          </button>
          {m.alvoPersonalizado && (
            <button type="button" disabled={salvando} onClick={() => onPadrao(m.chave)}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
              <RotateCcw size={12} aria-hidden /> Padrão
            </button>
          )}
        </div>
      )}
    </div>
  );
}
