"use client";

// Tráfego › Google Ads (19/11/2026). A carteira do Google numa tela, como Contas & Verba faz com a Meta:
// uma linha por cliente, com o que precisa do gestor primeiro.
//   · Ritmo do mês contra a verba do Google (a mesma barra de Contas & Verba — CelulaRitmo).
//   · Últimos 7 dias: gasto, conversões, custo por conversão e a variação contra a semana anterior.
//   · Buscas perdidas por VERBA × por CLASSIFICAÇÃO (só campanhas de Pesquisa: PMax não tem esse número).
//   · Sinais: leitura falhou/atrasada, anúncio reprovado, campanha ativa sem impressão, fora do ritmo, sem conversão,
//     custo por conversão subindo, oportunidade de pedir verba. Regras em lib/google/carteira.ts.
// O sistema só LÊ o Google: pausar, orçamento e lance mudam no Google Ads. A verba do mês se edita aqui.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Gauge, Loader2, MousePointerClick, Phone,
  RefreshCw, Search, Target, Wallet, Settings2, PlugZap, Users,
} from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { lerCampoReais, paraCampo, foraDoRitmo } from "@/lib/trafego/contas-verba";
import { previaDoValor } from "@/lib/trafego/vendas";
import { ROTULO_CATEGORIA } from "@/lib/google/relatorio";
import { variacao, pior, type Gravidade } from "@/lib/google/carteira";
import type { ClienteGoogleAds, RespostaGoogleAds } from "@/app/api/trafego/google-ads/route";
import CelulaRitmo from "@/components/trafego/contas/CelulaRitmo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Aviso, BarraParcela, CartaoNumero, ChipSinal, GRAVIDADE, SemSinais, Variacao, brl0, brl2, inteiro, quando } from "./ui";

type Filtro = "todos" | "precisam" | "ritmo" | "verba";

const ordem: Record<Gravidade | "ok", number> = { critico: 0, atencao: 1, info: 2, ok: 3 };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const STATUS_PRINCIPAL: Record<string, string> = {
  ELIGIBLE: "Qualificada", LIMITED: "Limitada", NOT_ELIGIBLE: "Não qualificada", LEARNING: "Aprendendo",
  PAUSED: "Pausada", PENDING: "Pendente", MISCONFIGURED: "Configuração incompleta", ENDED: "Encerrada", REMOVED: "Removida",
};
const MOTIVO: Record<string, string> = {
  BUDGET_CONSTRAINED: "limitada pelo orçamento", HAS_ADS_DISAPPROVED: "anúncio reprovado", HAS_ADS_LIMITED_BY_POLICY: "anúncio limitado pela política",
  BIDDING_STRATEGY_LEARNING: "lance aprendendo", BIDDING_STRATEGY_LIMITED: "lance limitado", BIDDING_STRATEGY_MISCONFIGURED: "lance mal configurado",
  CAMPAIGN_PAUSED: "pausada", NO_ADS: "sem anúncio", NO_KEYWORDS: "sem palavra-chave", MISSING_LOCATION_TARGETING: "sem região",
  HAS_ADS_PENDING_REVIEW: "anúncio em análise", ACCOUNT_SUSPENDED: "conta suspensa", BILLING_NOT_SET_UP: "sem forma de pagamento",
};

export default function GoogleAdsCarteira() {
  const [dados, setDados] = useState<RespostaGoogleAds | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [gestor, setGestor] = useState<string>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<ClienteGoogleAds | null>(null);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [mostrarSemConta, setMostrarSemConta] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<RespostaGoogleAds>("/api/trafego/google-ads");
    if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro);
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const atualizarAgora = async (c: ClienteGoogleAds) => {
    setAtualizando(c.clientId);
    const r = await chamar<{ resultado?: { ads?: { ok: boolean; erro?: string } | null } }>(`/api/clients/${c.clientId}/google`, { acao: "sincronizar" });
    setAtualizando(null);
    const ads = r.data?.resultado?.ads;
    if (!r.ok) { toast.error(r.erro ?? "Não consegui ler o Google agora."); return; }
    if (ads && !ads.ok) toast.error(`O Google Ads recusou: ${ads.erro ?? "erro"}`);
    else toast.success(`${c.nome}: Google Ads lido agora.`);
    carregar();
  };

  const clientes = dados?.clientes ?? [];
  const gestores = useMemo(() => [...new Set(clientes.map((c) => c.gestor).filter((g): g is string => !!g))].sort(), [clientes]);

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return clientes
      .filter((c) => gestor === "todos" || c.gestor === gestor)
      .filter((c) => !q || norm(`${c.nome} ${c.contaId} ${c.contaNome ?? ""}`).includes(q))
      .filter((c) => {
        if (filtro === "precisam") return c.linha.sinais.some((s) => s.gravidade !== "info");
        if (filtro === "ritmo") return foraDoRitmo(c.linha.leitura);
        if (filtro === "verba") return (c.linha.perdidaOrcamento ?? 0) >= 0.3;
        return true;
      })
      .sort((a, b) => ordem[pior(a.linha.sinais) ?? "ok"] - ordem[pior(b.linha.sinais) ?? "ok"] || b.linha.mes.custo - a.linha.mes.custo);
  }, [clientes, busca, filtro, gestor]);

  const totais = useMemo(() => {
    const base = clientes.filter((c) => gestor === "todos" || c.gestor === gestor);
    const gasto = base.reduce((s, c) => s + c.linha.mes.custo, 0);
    const verba = base.reduce((s, c) => s + (c.verba ?? 0), 0);
    const conv = base.reduce((s, c) => s + c.linha.mes.conversoes, 0);
    return {
      contas: base.length, gasto, verba, conv,
      precisam: base.filter((c) => c.linha.sinais.some((s) => s.gravidade !== "info")).length,
      ritmo: base.filter((c) => foraDoRitmo(c.linha.leitura)).length,
      verbaPerdida: base.filter((c) => (c.linha.perdidaOrcamento ?? 0) >= 0.3).length,
      semVerba: base.filter((c) => c.verba == null).length,
    };
  }, [clientes, gestor]);

  if (carregando && !dados) {
    return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Lendo a carteira do Google Ads…</div>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        {erro && <Aviso tom="perigo" acao={<button type="button" onClick={carregar} className="font-medium underline">Tentar de novo</button>}>{erro}</Aviso>}
        {dados && !dados.conexao.conectado && (
          <Aviso tom="aviso" acao={<Link href="/integracoes" className="font-medium underline">Abrir Integrações</Link>}>
            O Google não está conectado. Sem a conexão, a rotina das 7h não lê nenhuma conta e os números abaixo param no último dia lido.
          </Aviso>
        )}
        {dados && !dados.migracao && (
          <Aviso tom="info">
            Falta aplicar a migração <code>20261119150000_trafego_google.sql</code>: até lá a verba do Google não grava e as colunas de buscas perdidas e campanhas travadas ficam vazias.
          </Aviso>
        )}

        {/* Números do topo — cada um filtra a lista */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CartaoNumero rotulo="Contas" valor={String(totais.contas)} sub={`${totais.semVerba} sem verba definida`} icone={Users} ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
          <CartaoNumero rotulo="Investido no mês" valor={brl0(totais.gasto)} sub={totais.verba ? `de ${brl0(totais.verba)} em verba (${Math.round((totais.gasto / totais.verba) * 100)}%)` : "até ontem"} icone={Wallet} />
          <CartaoNumero rotulo="Precisam de você" valor={String(totais.precisam)} sub={`${totais.ritmo} fora do ritmo`} icone={AlertTriangle} tom={totais.precisam ? "perigo" : "neutro"} ativo={filtro === "precisam"} onClick={() => setFiltro(filtro === "precisam" ? "todos" : "precisam")} />
          <CartaoNumero rotulo="Perdendo buscas por verba" valor={String(totais.verbaPerdida)} sub="30%+ das buscas perdidas" icone={Gauge} tom="info" ativo={filtro === "verba"} onClick={() => setFiltro(filtro === "verba" ? "todos" : "verba")} />
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente ou ID da conta…"
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
            {(["todos", "precisam", "ritmo", "verba"] as Filtro[]).map((f) => (
              <button key={f} type="button" onClick={() => setFiltro(f)}
                className={cn("rounded-md px-3 py-1.5 text-xs transition-colors", filtro === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {f === "todos" ? "Todos" : f === "precisam" ? "Precisam de você" : f === "ritmo" ? "Fora do ritmo" : "Perdendo por verba"}
              </button>
            ))}
          </div>
          {gestores.length > 1 && (
            <select value={gestor} onChange={(e) => setGestor(e.target.value)} aria-label="Gestor"
              className="h-9 rounded-lg border border-border bg-card px-2 text-xs">
              <option value="todos">Todos os gestores</option>
              {gestores.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <button type="button" onClick={carregar} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted">
            <RefreshCw size={13} className={cn(carregando && "animate-spin")} /> Recarregar
          </button>
        </div>

        {/* Carteira */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(200px,1.4fr)_minmax(200px,1.2fr)_minmax(170px,1fr)_minmax(150px,0.9fr)_28px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Cliente</span><span>O que precisa de atenção</span><span>Ritmo do mês</span><span>Últimos 7 dias</span><span>Buscas perdidas</span><span />
          </div>
          {!lista.length && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {clientes.length ? "Nenhum cliente neste filtro." : "Nenhum cliente com conta do Google Ads vinculada. Vincule na ficha do cliente › Admin › Google."}
            </p>
          )}
          {lista.map((c) => (
            <LinhaCliente key={c.clientId} c={c} aberto={aberto === c.clientId}
              onAbrir={() => setAberto(aberto === c.clientId ? null : c.clientId)}
              onVerba={() => setEditando(c)} onAtualizar={() => atualizarAgora(c)} atualizando={atualizando === c.clientId} />
          ))}
        </div>

        {/* Clientes de tráfego sem conta do Google */}
        {!!dados?.semConta.length && (
          <div className="rounded-xl border border-border bg-card">
            <button type="button" onClick={() => setMostrarSemConta(!mostrarSemConta)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm">
              {mostrarSemConta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <PlugZap size={15} className="text-muted-foreground" />
              <span className="font-medium">{dados.semConta.length} clientes de tráfego sem Google Ads vinculado</span>
              {dados.semConta.some((s) => s.sugestao) && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{dados.semConta.filter((s) => s.sugestao).length} com sugestão para confirmar</span>
              )}
            </button>
            {mostrarSemConta && (
              <ul className="grid gap-1 border-t border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                {dados.semConta.map((s) => (
                  <li key={s.clientId}>
                    <Link href={`/clients/${s.clientId}?tab=admin`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block truncate">{s.nome}</span>
                        {s.sugestao && <span className="block truncate text-[11px] text-primary">Sugestão: {s.sugestao} — confirmar na ficha</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{s.gestor ?? ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Números lidos do Google Ads todo dia às 7h, até ontem. Ritmo: o Google pode gastar até 2× o orçamento num dia, mas no mês não passa de 30,4× o orçamento diário — por isso o ritmo é medido no mês.
          Buscas perdidas só existem em campanhas de Pesquisa; Performance Max não informa. O sistema só lê: pausar, orçamento e lance mudam no Google Ads.
        </p>

        {editando && <ModalVerba c={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />}
      </div>
    </TooltipProvider>
  );
}

function LinhaCliente({ c, aberto, onAbrir, onVerba, onAtualizar, atualizando }: {
  c: ClienteGoogleAds; aberto: boolean; onAbrir: () => void; onVerba: () => void; onAtualizar: () => void; atualizando: boolean;
}) {
  const l = c.linha;
  const g = pior(l.sinais);
  const visiveis = l.sinais.slice(0, 2);
  return (
    <div className={cn("relative border-b border-border last:border-b-0", g && g !== "info" && "before:absolute before:inset-y-0 before:left-0 before:w-[3px]", g && GRAVIDADE[g].borda)}>
      <div
        role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
        aria-expanded={aberto}
        className="grid cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(180px,1.3fr)_minmax(200px,1.4fr)_minmax(200px,1.2fr)_minmax(170px,1fr)_minmax(150px,0.9fr)_28px] lg:items-center lg:gap-4"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{c.nome}</p>
          <p className="truncate text-[11px] text-muted-foreground">{c.contaId}{c.gestor ? ` · ${c.gestor}` : ""} · {l.ativas} {l.ativas === 1 ? "campanha ativa" : "campanhas ativas"}</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-1">
          {visiveis.length ? visiveis.map((s, i) => <ChipSinal key={i} sinal={s} compacto />) : <SemSinais />}
          {l.sinais.length > 2 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">+{l.sinais.length - 2}</span>}
        </div>
        <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
          <CelulaRitmo ritmo={l.ritmo} leitura={l.leitura} onDefinirVerba={onVerba} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
          <div><p className="text-[10px] uppercase text-muted-foreground">Gasto</p><p className="font-medium">{brl0(l.semana.custo)}</p><Variacao valor={variacao(l.semana.custo, l.semanaAnterior.custo)} bomQuandoSobe /></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Conv.</p><p className="font-medium">{inteiro(l.semana.conversoes)}</p><Variacao valor={variacao(l.semana.conversoes, l.semanaAnterior.conversoes)} /></div>
          <div><p className="text-[10px] uppercase text-muted-foreground">Custo/conv.</p><p className="font-medium">{brl0(l.custoPorConversao7d)}</p>
            <Variacao valor={l.custoPorConversao7d != null && l.semanaAnterior.conversoes > 0 ? variacao(l.custoPorConversao7d, l.semanaAnterior.custo / l.semanaAnterior.conversoes) : null} bomQuandoSobe={false} /></div>
        </div>
        <div className="space-y-1.5">
          <BarraParcela rotulo="por verba" valor={l.perdidaOrcamento} cor="bg-lone-info" />
          <BarraParcela rotulo="por classificação" valor={l.perdidaClassificacao} cor="bg-lone-warning" />
        </div>
        <ChevronDown size={16} className={cn("hidden text-muted-foreground transition-transform lg:block", aberto && "rotate-180")} />
      </div>

      {aberto && <Detalhe c={c} onVerba={onVerba} onAtualizar={onAtualizar} atualizando={atualizando} />}
    </div>
  );
}

function Detalhe({ c, onVerba, onAtualizar, atualizando }: { c: ClienteGoogleAds; onVerba: () => void; onAtualizar: () => void; atualizando: boolean }) {
  const l = c.linha;
  const ctrMes = l.mes.impressoes > 0 ? (l.mes.cliques / l.mes.impressoes) * 100 : null;
  return (
    <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4">
      {/* Mês */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { r: "Gasto no mês", v: brl2(l.mes.custo), i: Wallet },
          { r: "Cliques", v: inteiro(l.mes.cliques), i: MousePointerClick },
          { r: "CTR", v: ctrMes == null ? "—" : `${ctrMes.toFixed(1).replace(".", ",")}%`, i: Target },
          { r: "Conversões", v: inteiro(l.mes.conversoes), i: Target },
          { r: "Custo/conv. (30 dias)", v: brl2(l.custoPorConversao30d), i: Gauge },
          { r: "Ligações pelo anúncio", v: l.mes.ligacoes == null ? "—" : inteiro(l.mes.ligacoes), i: Phone },
        ].map((k) => (
          <div key={k.r} className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><k.i size={11} />{k.r}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          {/* Sinais completos */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Sinais</p>
            {l.sinais.length ? (
              <ul className="space-y-1.5">
                {l.sinais.map((s, i) => {
                  const G = GRAVIDADE[s.gravidade];
                  return (
                    <li key={i} className={cn("rounded-lg border px-3 py-2 text-xs", G.cls)}>
                      <p className="flex items-center gap-1.5 font-medium"><G.icone size={13} />{s.titulo}</p>
                      {s.detalhe && <p className="mt-0.5 opacity-90">{s.detalhe}</p>}
                    </li>
                  );
                })}
              </ul>
            ) : <SemSinais />}
          </div>
          {/* O que gerou */}
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">O que os anúncios geraram no mês</p>
            {c.acoesMes.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {c.acoesMes.map((a) => (
                  <li key={a.categoria} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span>{ROTULO_CATEGORIA[a.categoria] ?? a.categoria}</span>
                    <span className="font-medium tabular-nums">{a.conversoes.toLocaleString("pt-BR")}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">Nenhuma conversão registrada no mês (ou a conta não mede ligação, rota e contato).</p>}
          </div>
        </div>

        {/* Campanhas */}
        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-foreground">Campanhas no mês</p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Campanha</th>
                  <th className="px-3 py-2 text-left font-medium">Situação</th>
                  <th className="px-3 py-2 text-right font-medium">Orç./dia</th>
                  <th className="px-3 py-2 text-right font-medium">Gasto</th>
                  <th className="px-3 py-2 text-right font-medium">Conv.</th>
                  <th className="px-3 py-2 text-right font-medium">Custo/conv.</th>
                  <th className="px-3 py-2 text-right font-medium">Perdida (verba / class.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {c.campanhas.map((k) => {
                  const travada = k.status === "ENABLED" && k.impressoes7d === 0;
                  const situacao = k.status === "PAUSED" ? "Pausada" : k.statusPrincipal ? STATUS_PRINCIPAL[k.statusPrincipal] ?? k.statusPrincipal : k.status ? "Ativa" : "—";
                  const motivos = k.motivos.map((m) => MOTIVO[m]).filter(Boolean);
                  return (
                    <tr key={k.id}>
                      <td className="max-w-[220px] px-3 py-2"><p className="truncate font-medium">{k.nome}</p><p className="text-[10px] text-muted-foreground">{k.canal}</p></td>
                      <td className="px-3 py-2">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          travada || k.motivos.some((m) => /DISAPPROVED|SUSPENDED|BILLING/.test(m)) ? "bg-lone-danger-bg text-lone-danger"
                            : k.statusPrincipal === "LIMITED" ? "bg-lone-warning-bg text-lone-warning"
                              : k.status === "PAUSED" ? "bg-muted text-muted-foreground" : "bg-lone-success-bg text-lone-success")}>
                          {travada ? "Sem impressão" : situacao}
                        </span>
                        {!!motivos.length && <p className="mt-0.5 text-[10px] text-muted-foreground">{motivos.join(", ")}</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl0(k.orcamentoDiario)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl2(k.custoMes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{inteiro(k.conversoesMes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl2(k.custoPorConversao)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{k.perdidaOrcamento == null && k.perdidaClassificacao == null ? "—" : `${k.perdidaOrcamento == null ? "—" : `${Math.round(k.perdidaOrcamento * 100)}%`} / ${k.perdidaClassificacao == null ? "—" : `${Math.round(k.perdidaClassificacao * 100)}%`}`}</td>
                    </tr>
                  );
                })}
                {!c.campanhas.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nenhuma campanha com gasto no mês.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={onVerba}><Settings2 size={13} className="mr-1.5" />{c.verba == null ? "Definir verba do mês" : `Verba: ${brl0(c.verba)}`}</Button>
        <Button size="sm" variant="outline" onClick={onAtualizar} disabled={atualizando}>
          {atualizando ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <RefreshCw size={13} className="mr-1.5" />}Ler o Google agora
        </Button>
        <Button size="sm" variant="ghost" asChild><Link href={`/clients/${c.clientId}?tab=admin`}>Ficha do cliente</Link></Button>
        <a href="https://ads.google.com/aw/overview" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Abrir o Google Ads <ExternalLink size={11} />
        </a>
        <span className="ml-auto text-[11px] text-muted-foreground">Lido em {quando(c.sincronizadoEm)}</span>
      </div>
    </div>
  );
}

function ModalVerba({ c, onFechar, onSalvo }: { c: ClienteGoogleAds; onFechar: () => void; onSalvo: () => void }) {
  const [texto, setTexto] = useState(paraCampo(c.verba));
  const [salvando, setSalvando] = useState(false);
  const previa = previaDoValor(texto);
  const valor = lerCampoReais(texto);
  const orc = c.linha.orcamentoDiarioAtivo;

  const salvar = async () => {
    if (valor === undefined) return;
    setSalvando(true);
    const r = await chamar("/api/trafego/google-ads", { acao: "verba", clientId: c.clientId, verba: valor });
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? "Não gravei a verba."); return; }
    toast.success(valor == null ? "Verba do Google apagada." : `Verba do Google: ${brl0(valor)} por mês.`);
    onSalvo();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verba do Google Ads — {c.nome}</DialogTitle>
          <DialogDescription>Quanto o cliente separou para o Google neste mês. É a referência do ritmo; não muda nada no Google Ads.</DialogDescription>
        </DialogHeader>
        <label className="block text-xs font-medium text-foreground">
          Verba mensal (R$)
          <input autoFocus inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }}
            placeholder="1.500,00" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <p className={cn("text-xs", previa && !previa.ok ? "text-lone-danger" : "text-muted-foreground")}>
          {previa ? previa.frase : "Deixe vazio para apagar a verba."}
        </p>
        {orc != null && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            As campanhas ativas somam {brl0(orc)}/dia no Google — no mês, até ~{brl0(orc * 30.4)}.
            {valor != null && valor > 0 && Math.abs(orc * 30.4 - valor) / valor > 0.15 && (
              <span className="mt-1 block font-medium text-lone-warning">
                {orc * 30.4 > valor ? "O orçamento do Google passa da verba: ajuste o orçamento diário para ~" : "O orçamento do Google não chega na verba: suba o orçamento diário para ~"}{brl0(valor / 30.4)}/dia.
              </span>
            )}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || valor === undefined}>{salvando && <Loader2 size={14} className="mr-1.5 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
