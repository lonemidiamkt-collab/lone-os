"use client";

// components/trafego/criativos/RankingCriativos.tsx — Ranking de criativos por cliente e por nicho
// (Leva 7A, N5), dentro de Tráfego › Criativos.
//
// Estilo Motion: grade de miniaturas do resultado mais barato para o mais caro. Cada cartão diz o que
// decide o criativo — custo por resultado (e quanto isso fica da mediana do grupo), frequência de 7
// dias (acima de 3, o público já viu demais) e há quantos dias está no ar. Embaixo, os que gastaram e
// não trouxeram nada. Com um nicho escolhido, a faixa de cima mostra a mediana ANÔNIMA do nicho.
// Regras em lib/traffic/ranking-criativos.ts e lib/traffic/referencia-nicho.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2, RefreshCw, Trophy } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { ROTULO_RESULTADO } from "@/lib/meta/resultado";
import type { ItemRanking, RespostaRanking } from "@/lib/traffic/ranking-criativos";
import type { RespostaReferencias } from "@/lib/traffic/referencia-nicho";

const brl = (n: number | null | undefined, casas = 2) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const n1 = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** Frequência de 7 dias: até 2 tranquilo, até 3 atenção, acima de 3 cansando. */
function tomFrequencia(f: number | null): string {
  if (f == null) return "text-muted-foreground";
  return f > 3 ? "text-lone-danger" : f > 2 ? "text-lone-warning" : "text-foreground";
}

function Cartao({ c, mostrarCliente }: { c: ItemRanking; mostrarCliente: boolean }) {
  const rot = ROTULO_RESULTADO[c.tipoResultado];
  const vs = c.vsMediana;
  const vsTexto = vs == null ? null : vs < 0.95 ? `${Math.round((1 - vs) * 100)}% abaixo da mediana` : vs > 1.05 ? `${Math.round((vs - 1) * 100)}% acima da mediana` : "na mediana";
  const top = c.posicao != null && c.posicao <= 3;
  return (
    <li className="group overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square bg-muted">
        {c.thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={c.thumb} alt={c.nome ?? "Criativo"} loading="lazy" className="h-full w-full object-cover" />
          : <div className="grid h-full w-full place-items-center text-muted-foreground"><ImageOff size={20} aria-hidden="true" /></div>}
        {c.posicao != null && (
          <span className={cn(
            "absolute left-2 top-2 inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums shadow-sm",
            top ? "bg-primary text-primary-foreground" : "bg-card text-foreground ring-1 ring-border",
          )}>
            {top && <Trophy size={12} aria-hidden="true" />}{c.posicao}
          </span>
        )}
        {c.tipo && <span className="absolute right-2 top-2 rounded-md bg-card/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-border">{c.tipo.toLowerCase()}</span>}
      </div>
      <div className="space-y-2 p-3">
        <div className="min-w-0">
          {mostrarCliente && <p className="truncate text-[11px] font-medium text-muted-foreground">{c.cliente}</p>}
          <p className="truncate text-xs text-foreground" title={c.nome ?? ""}>{c.nome ?? c.adId}</p>
        </div>
        <div>
          <p className="text-lone-h2 tabular-nums text-foreground">
            {c.custo != null ? brl(c.custo) : "—"}
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">por {rot.um}</span>
          </p>
          {vsTexto && (
            <p className={cn("text-[11px] font-medium", vs! < 0.95 ? "text-lone-success" : vs! > 1.05 ? "text-lone-warning" : "text-muted-foreground")}>{vsTexto}</p>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-border pt-2 text-[11px]">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Freq. 7d</dt>
            <dd className={cn("font-medium tabular-nums", tomFrequencia(c.frequencia7d))} title="Quantas vezes, em média, a mesma pessoa viu o anúncio nos últimos 7 dias">{n1(c.frequencia7d)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">No ar</dt>
            <dd className="font-medium tabular-nums text-foreground">{c.diasNoAr != null ? `${c.diasNoAr} d` : "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">CTR</dt>
            <dd className="font-medium tabular-nums text-foreground">{c.ctr != null ? `${n1(c.ctr)}%` : "—"}</dd>
          </div>
        </dl>
        <p className="truncate text-[11px] tabular-nums text-muted-foreground">
          {brl(c.gasto, 0)} · {c.resultados.toLocaleString("pt-BR")} {c.resultados === 1 ? rot.um : rot.varios}
        </p>
      </div>
    </li>
  );
}

export default function RankingCriativos() {
  const [dias, setDias] = useState<7 | 14 | 30>(7);
  const [escopo, setEscopo] = useState<{ tipo: "todos" | "cliente" | "nicho"; valor: string }>({ tipo: "todos", valor: "" });
  const [dados, setDados] = useState<RespostaRanking | null>(null);
  const [refs, setRefs] = useState<RespostaReferencias | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const q = new URLSearchParams({ dias: String(dias) });
    if (escopo.tipo === "cliente" && escopo.valor) q.set("clientId", escopo.valor);
    if (escopo.tipo === "nicho" && escopo.valor) q.set("nicho", escopo.valor);
    const r = await chamar<RespostaRanking>(`/api/traffic/criativos/ranking?${q}`);
    if (r.ok && r.data) {
      // Os filtros vêm da primeira leitura (todos): filtrar por um cliente não esvazia a lista.
      setDados((antes) => ({ ...r.data!, clientes: r.data!.clientes.length ? r.data!.clientes : antes?.clientes ?? [], nichos: r.data!.nichos.length ? r.data!.nichos : antes?.nichos ?? [] }));
      setErro(null);
    } else setErro(r.erro ?? "Não consegui carregar o ranking.");
    setCarregando(false);
  }, [dias, escopo]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    chamar<RespostaReferencias>("/api/trafego/referencia-nicho").then((r) => { if (r.ok && r.data) setRefs(r.data); });
  }, []);

  const refNicho = useMemo(() => {
    if (escopo.tipo !== "nicho" || !refs) return null;
    return refs.nichos.find((n) => n.chave === escopo.valor) ?? null;
  }, [escopo, refs]);

  const valorSelect = escopo.tipo === "todos" ? "todos" : `${escopo.tipo}:${escopo.valor}`;

  return (
    <section className="space-y-4" aria-labelledby="titulo-ranking">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-ranking" className="text-lone-h2 text-foreground">Ranking de criativos</h2>
          <p className="mt-0.5 text-lone-caption text-muted-foreground">
            Do resultado mais barato ao mais caro{dados ? `, de ${ddmm(dados.desde)} a ${ddmm(dados.ate)}` : ""}. Entra quem gastou {dias >= 14 ? "R$ 50" : "R$ 30"}+ e trouxe 2+ resultados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="ranking-escopo">Filtrar por cliente ou nicho</label>
          <select
            id="ranking-escopo"
            value={valorSelect}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "todos") setEscopo({ tipo: "todos", valor: "" });
              else { const i = v.indexOf(":"); setEscopo({ tipo: v.slice(0, i) as "cliente" | "nicho", valor: v.slice(i + 1) }); }
            }}
            className="h-8 max-w-[240px] rounded-lg border border-input bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="todos">Todos os clientes</option>
            {!!dados?.nichos.length && (
              <optgroup label="Por nicho">
                {dados.nichos.map((n) => <option key={n.chave} value={`nicho:${n.chave}`}>{n.rotulo}</option>)}
              </optgroup>
            )}
            {!!dados?.clientes.length && (
              <optgroup label="Por cliente">
                {dados.clientes.map((c) => <option key={c.id} value={`cliente:${c.id}`}>{c.nome}</option>)}
              </optgroup>
            )}
          </select>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Janela">
            {([7, 14, 30] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDias(d)} aria-pressed={dias === d}
                className={cn("h-7 rounded-md px-2.5 text-xs font-medium tabular-nums", dias === d ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {d} dias
              </button>
            ))}
          </div>
          <button type="button" onClick={carregar} disabled={carregando} aria-label="Recarregar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
            {carregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {refNicho && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-xs">
          <span className="font-medium text-foreground">Mediana de {refNicho.rotulo}</span>
          <span className="text-muted-foreground">{refNicho.clientes} clientes · 30 dias · anônima</span>
          {refNicho.custo.mensagens && <span className="tabular-nums text-foreground">{brl(refNicho.custo.mensagens.valor)} <span className="text-muted-foreground">por conversa</span></span>}
          {refNicho.custo.leads && <span className="tabular-nums text-foreground">{brl(refNicho.custo.leads.valor)} <span className="text-muted-foreground">por lead</span></span>}
          {refNicho.custo.compras && <span className="tabular-nums text-foreground">{brl(refNicho.custo.compras.valor)} <span className="text-muted-foreground">por compra</span></span>}
          <span className="tabular-nums text-foreground">CTR {n1(refNicho.ctr)}%</span>
          <span className="tabular-nums text-foreground">CPM {brl(refNicho.cpm)}</span>
        </div>
      )}
      {escopo.tipo === "nicho" && refs && !refNicho && (
        <p className="text-lone-caption text-muted-foreground">Este nicho ainda não tem clientes suficientes (3+) para uma mediana anônima.</p>
      )}

      {erro && <p role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">{erro}</p>}

      {carregando && !dados ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true">
          {Array.from({ length: 10 }, (_, i) => <li key={i}><Skeleton className="aspect-[3/4] rounded-xl" /></li>)}
        </ul>
      ) : dados && dados.ranqueados.length === 0 && dados.semResultado.length === 0 ? (
        <EmptyState tone="muted" icon={<Trophy size={20} />} title="Sem criativos para ranquear"
          subtitle="Nenhum anúncio gastou o suficiente nessa janela, ou a coleta por anúncio (7h, dias úteis) ainda não rodou." />
      ) : dados ? (
        <>
          <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", carregando && "opacity-60")}>
            {dados.ranqueados.map((c) => <Cartao key={c.adId} c={c} mostrarCliente={escopo.tipo !== "cliente"} />)}
          </ul>
          {dados.semResultado.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Gastaram e não trouxeram resultado</h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {dados.semResultado.map((c) => (
                  <li key={c.adId} className="flex items-center gap-3 px-3 py-2">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {c.thumb ? <img src={c.thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-foreground">{c.nome ?? c.adId}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.cliente}{c.diasNoAr != null ? ` · no ar há ${c.diasNoAr} d` : ""}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-lone-danger">{brl(c.gasto, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {dados.poucoGasto > 0 && <p className="text-lone-caption text-muted-foreground">{dados.poucoGasto} anúncio(s) com gasto baixo ficaram de fora — amostra pequena demais para ranquear.</p>}
        </>
      ) : null}
    </section>
  );
}
