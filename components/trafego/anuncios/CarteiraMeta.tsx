"use client";

// Visão "Carteira" da aba Anúncios Meta (repaginada em 19/11/2026). Substitui o "Resumo da carteira", que só somava
// quem alguém tinha aberto (51 de 53 clientes apareciam "sem leitura"). Agora vem do que o servidor grava todo dia
// (GET /api/trafego/meta-carteira): todos os clientes, o período contra o anterior, ritmo do mês, saldo, frequência e
// os sinais do que precisa do gestor — os piores primeiro. Clicar na linha abre o cliente (campanhas, IA, PDF).

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownUp, Loader2, MessageCircle, RefreshCw, Users, Wallet, Zap } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { pior, type Gravidade } from "@/lib/google/carteira";
import { foraDoRitmo } from "@/lib/trafego/contas-verba";
import type { Client } from "@/lib/types";
import type { ItemCarteiraMeta, RespostaCarteiraMeta } from "@/app/api/trafego/meta-carteira/route";
import CelulaRitmo from "@/components/trafego/contas/CelulaRitmo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Aviso, CartaoNumero, ChipSinal, GRAVIDADE, SemSinais, Variacao, brl0, brl2, inteiro } from "@/components/trafego/google/ui";

type Filtro = "todos" | "precisam" | "saldo" | "fadiga" | "ritmo";
type Ordem = "prioridade" | "gasto" | "custo" | "resultados";

const ordemG: Record<Gravidade | "ok", number> = { critico: 0, atencao: 1, info: 2, ok: 3 };
const variacao = (a: number | null, b: number | null) => (a == null || b == null || b <= 0 ? null : ((a - b) / b) * 100);

/** Linha fina de gasto por dia — o desenho do período, sem eixo. */
function Faisca({ serie }: { serie: { gasto: number }[] }) {
  const max = Math.max(...serie.map((s) => s.gasto), 0);
  if (!serie.length || max <= 0) return <span className="text-[11px] text-muted-foreground">sem gasto</span>;
  const w = 84, h = 24, passo = serie.length > 1 ? w / (serie.length - 1) : w;
  const pts = serie.map((s, i) => `${(i * passo).toFixed(1)},${(h - 2 - (s.gasto / max) * (h - 4)).toFixed(1)}`).join(" ");
  const ultimo = serie[serie.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <circle cx={(serie.length - 1) * passo} cy={h - 2 - (ultimo.gasto / max) * (h - 4)} r="2.2" fill={ultimo.gasto === 0 ? "var(--destructive)" : "var(--primary)"} />
    </svg>
  );
}

export default function CarteiraMeta({ clientes, de, ate, rotuloPeriodo, onAbrir }: {
  /** Clientes com conta Meta vinculada no workspace atual (já sem as contas ocultas). */
  clientes: Client[];
  de: string;
  ate: string;
  rotuloPeriodo: string;
  onAbrir: (clientId: string) => void;
}) {
  const [dados, setDados] = useState<RespostaCarteiraMeta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ordem, setOrdem] = useState<Ordem>("prioridade");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    chamar<RespostaCarteiraMeta>(`/api/trafego/meta-carteira?de=${de}&ate=${ate}`).then((r) => {
      if (!vivo) return;
      if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [de, ate, tentativa]);

  const ids = useMemo(() => new Set(clientes.map((c) => c.id)), [clientes]);
  const base = useMemo(() => (dados?.itens ?? []).filter((i) => ids.has(i.clientId)), [dados, ids]);

  const totais = useMemo(() => {
    const gasto = base.reduce((s, i) => s + i.linha.atual.gasto, 0);
    const gastoAnt = base.reduce((s, i) => s + i.linha.anterior.gasto, 0);
    const res = base.reduce((s, i) => s + i.linha.atual.resultados, 0);
    const resAnt = base.reduce((s, i) => s + i.linha.anterior.resultados, 0);
    return {
      gasto, gastoAnt, res, resAnt,
      custo: res > 0 ? gasto / res : null, custoAnt: resAnt > 0 ? gastoAnt / resAnt : null,
      precisam: base.filter((i) => i.linha.sinais.some((s) => s.gravidade === "critico")).length,
      atencao: base.filter((i) => i.linha.sinais.some((s) => s.gravidade === "atencao")).length,
      saldo: base.filter((i) => i.linha.diasDeSaldo != null && i.linha.diasDeSaldo < 3).length,
      fadiga: base.filter((i) => (i.linha.frequencia7d ?? 0) > 3).length,
      ritmo: base.filter((i) => foraDoRitmo(i.linha.leitura)).length,
      ativos: base.filter((i) => i.linha.atual.gasto > 0).length,
    };
  }, [base]);

  const lista = useMemo(() => {
    const f = base.filter((i) => {
      if (filtro === "precisam") return i.linha.sinais.some((s) => s.gravidade !== "info");
      if (filtro === "saldo") return i.linha.diasDeSaldo != null && i.linha.diasDeSaldo < 3;
      if (filtro === "fadiga") return (i.linha.frequencia7d ?? 0) > 3;
      if (filtro === "ritmo") return foraDoRitmo(i.linha.leitura);
      return true;
    });
    const p = (i: ItemCarteiraMeta) => ordemG[pior(i.linha.sinais) ?? "ok"];
    return f.sort((a, b) => {
      if (ordem === "gasto") return b.linha.atual.gasto - a.linha.atual.gasto;
      if (ordem === "resultados") return b.linha.atual.resultados - a.linha.atual.resultados;
      if (ordem === "custo") return (b.linha.custoPorResultado ?? -1) - (a.linha.custoPorResultado ?? -1);
      return p(a) - p(b) || b.linha.atual.gasto - a.linha.atual.gasto;
    });
  }, [base, filtro, ordem]);

  if (carregando && !dados) {
    return <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Montando a carteira com o que o servidor gravou…</div>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {erro && <Aviso tom="perigo" acao={<button type="button" onClick={() => setTentativa((t) => t + 1)} className="font-medium underline">Tentar de novo</button>}>{erro}</Aviso>}
        {!!dados?.falhas.length && <Aviso tom="aviso">Parte da carteira não carregou ({dados.falhas.join(", ")}). Os números abaixo podem estar incompletos.</Aviso>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CartaoNumero rotulo="Investido" valor={brl0(totais.gasto)} sub={`${totais.ativos} de ${base.length} contas gastaram · ${(() => { const v = variacao(totais.gasto, totais.gastoAnt); return v == null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v)}%`; })()} vs anterior`} icone={Wallet} ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
          <CartaoNumero rotulo="Resultados" valor={inteiro(totais.res)} sub={totais.custo != null ? `${brl2(totais.custo)} cada${totais.custoAnt ? ` (antes ${brl2(totais.custoAnt)})` : ""}` : "no período"} icone={MessageCircle} />
          <CartaoNumero rotulo="Críticos" valor={String(totais.precisam)} sub={`${totais.atencao} com atenção · ${totais.saldo} com saldo acabando`} icone={AlertTriangle} tom={totais.precisam ? "perigo" : "neutro"} ativo={filtro === "precisam"} onClick={() => setFiltro(filtro === "precisam" ? "todos" : "precisam")} />
          <CartaoNumero rotulo="Criativo cansando" valor={String(totais.fadiga)} sub="frequência acima de 3 na semana" icone={Zap} tom={totais.fadiga ? "aviso" : "neutro"} ativo={filtro === "fadiga"} onClick={() => setFiltro(filtro === "fadiga" ? "todos" : "fadiga")} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
            {([["todos", "Todos"], ["precisam", "Precisam de você"], ["saldo", "Saldo acabando"], ["ritmo", "Fora do ritmo"], ["fadiga", "Frequência alta"]] as [Filtro, string][]).map(([k, r]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)}
                className={cn("rounded-md px-2.5 py-1.5 text-xs transition-colors", filtro === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{r}</button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDownUp size={13} />
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground">
              <option value="prioridade">Prioridade</option>
              <option value="gasto">Maior gasto</option>
              <option value="resultados">Mais resultados</option>
              <option value="custo">Maior custo por resultado</option>
            </select>
          </label>
          <button type="button" onClick={() => setTentativa((t) => t + 1)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs hover:bg-muted">
            <RefreshCw size={12} className={cn(carregando && "animate-spin")} /> Recarregar
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(170px,1.2fr)_minmax(190px,1.3fr)_repeat(3,minmax(96px,0.6fr))_minmax(130px,0.8fr)_minmax(90px,0.5fr)_minmax(180px,1.1fr)] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground xl:grid">
            <span>Cliente</span><span>O que precisa de atenção</span><span className="text-right">Gasto</span><span className="text-right">Resultados</span><span className="text-right">Custo/result.</span><span>CTR · CPM · Freq.</span><span>Gasto por dia</span><span>Ritmo do mês</span>
          </div>
          {!lista.length && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{base.length ? "Nenhum cliente neste filtro." : "Nenhum cliente com conta Meta vinculada neste workspace."}</p>}
          {lista.map((i) => {
            const l = i.linha;
            const g = pior(l.sinais);
            return (
              <div key={i.clientId} role="button" tabIndex={0} onClick={() => onAbrir(i.clientId)} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(i.clientId); }}
                className={cn("relative grid cursor-pointer grid-cols-3 gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40 xl:grid-cols-[minmax(170px,1.2fr)_minmax(190px,1.3fr)_repeat(3,minmax(96px,0.6fr))_minmax(130px,0.8fr)_minmax(90px,0.5fr)_minmax(180px,1.1fr)] xl:items-center xl:gap-4",
                  g && g !== "info" && "before:absolute before:inset-y-0 before:left-0 before:w-[3px]", g && GRAVIDADE[g].borda)}>
                <div className="col-span-3 min-w-0 xl:col-span-1">
                  <p className="truncate text-sm font-medium text-foreground">{i.nome}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {i.gestor ?? "sem gestor"} · {l.diasComDado}/{l.diasNoPeriodo} dias com dado
                    {l.diasDeSaldo != null && <> · saldo p/ {l.diasDeSaldo < 10 ? l.diasDeSaldo.toFixed(1).replace(".", ",") : Math.round(l.diasDeSaldo)} dias</>}
                  </p>
                </div>
                <div className="col-span-3 flex min-w-0 flex-wrap gap-1 xl:col-span-1">
                  {l.sinais.length ? l.sinais.slice(0, 2).map((s, k) => <ChipSinal key={k} sinal={s} compacto />) : <SemSinais />}
                  {l.sinais.length > 2 && <span title={l.sinais.slice(2).map((s) => s.titulo).join(" · ")} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">+{l.sinais.length - 2}</span>}
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-[10px] uppercase text-muted-foreground xl:hidden">Gasto</p>
                  <p className="text-sm font-medium">{brl0(l.atual.gasto)}</p>
                  <Variacao valor={variacao(l.atual.gasto, l.anterior.gasto)} className="justify-end" />
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-[10px] uppercase text-muted-foreground xl:hidden">Resultados</p>
                  <p className="text-sm font-medium">{inteiro(l.atual.resultados)} <span className="text-[10px] font-normal text-muted-foreground">{l.tipoResultado}</span></p>
                  <Variacao valor={variacao(l.atual.resultados, l.anterior.resultados)} className="justify-end" />
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-[10px] uppercase text-muted-foreground xl:hidden">Custo/result.</p>
                  <p className="text-sm font-medium">{brl2(l.custoPorResultado)}</p>
                  <Variacao valor={variacao(l.custoPorResultado, l.custoPorResultadoAnterior)} bomQuandoSobe={false} className="justify-end" />
                </div>
                <div className="col-span-3 flex gap-3 text-xs tabular-nums xl:col-span-1 xl:block xl:space-y-0.5">
                  <p><span className="text-muted-foreground">CTR </span><span className={cn(l.ctr != null && l.ctr < 0.8 && "text-lone-warning")}>{l.ctr == null ? "—" : `${l.ctr.toFixed(2).replace(".", ",")}%`}</span></p>
                  <p><span className="text-muted-foreground">CPM </span>{brl2(l.cpm)}</p>
                  <p><span className="text-muted-foreground">Freq. </span><span className={cn((l.frequencia7d ?? 0) > 3 && "font-medium text-lone-warning")}>{l.frequencia7d == null ? "—" : l.frequencia7d.toFixed(1).replace(".", ",")}</span></p>
                </div>
                <div className="hidden xl:block"><Faisca serie={l.serie} /></div>
                <div className="col-span-3 min-w-0 xl:col-span-1" onClick={(e) => e.stopPropagation()}>
                  <CelulaRitmo ritmo={l.ritmo} leitura={l.leitura} compacta />
                </div>
              </div>
            );
          })}
        </div>
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Users size={12} className="mt-0.5 shrink-0" />
          {rotuloPeriodo} comparado com o mesmo número de dias antes. Números da conta gravados pelo servidor todo dia (nenhuma chamada à Meta ao abrir). Frequência = vezes que a mesma pessoa viu os anúncios na última semana.
          A verba do mês e o saldo se editam em Contas &amp; Verba. Clique no cliente para ver campanhas, análise e PDF.
        </p>
      </div>
    </TooltipProvider>
  );
}
