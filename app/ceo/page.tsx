"use client";

import Header from "@/components/Header";
import { ETAPAS, ETAPAS_COMPROMETIDAS, ETAPAS_FINAIS, statusNaEtapa } from "@/lib/conteudo/etapas";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import ErroCargaCards from "@/components/conteudo/ErroCargaCards";
import ErroCargaTarefas from "@/components/tarefas/ErroCargaTarefas";
import { situacaoDaFonte, valorDaFonte, legendaDaFonte } from "@/lib/ceo/fontes";
import { OperationalKpisPanel } from "@/components/ceo/OperationalKpisPanel";
import CoberturaReunioes from "@/components/CoberturaReunioes";
import CargaPorPessoa from "@/components/equipe/CargaPorPessoa";
import GestaoEquipe from "@/components/equipe/GestaoEquipe";
import { useOperationalStore, selectTarefasProntas } from "@/stores/useOperationalStore";
import { useTrafficStore } from "@/stores/useTrafficStore";
import { getAttentionColor, getAttentionLabel, getStatusColor, getStatusLabel, todaySP, spDateStr } from "@/lib/utils";
import {
  Lock, BarChart2, TrendingUp, AlertTriangle,
  Users, CheckCircle, Target,
  Instagram, Palette, Zap,
  UserCog, ShieldCheck,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/context/RoleContext";

import { authedFetch } from "@/lib/supabase/authed-fetch";
import type { Client } from "@/lib/types";
import { emRisco, scoreDoCliente } from "@/lib/saude/carteira";

// Mês corrente em SP ("YYYY-MM") — "este mês" é o mês de verdade, não o acumulado.
const mesSP = () => todaySP().slice(0, 7);
const noMesSP = (iso?: string | null) => !!iso && spDateStr(iso).slice(0, 7) === mesSP();

// Risco de churn = saúde em risco (lib/saude/carteira.ts). A pontuação local que morava aqui (status do
// anúncio + kanban + posts) era a 9ª resposta diferente para "este cliente está em risco?".

export default function CEOPage() {
  const { profiles, role, hydrated } = useRole();   // equipe do banco, não lista em arquivo
  const router = useRouter();
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
  const trafficRoutineChecks = useTrafficStore((s) => s.trafficRoutineChecks);
  // 25/10/2026 (auditoria 6.5): número só com a fonte carregada. Antes "Total de Clientes 0", "Risco de Churn 0",
  // "Taxa Geral 0%" e "Publicações atrasadas 0 — nenhuma" (em verde) apareciam carregando e quando a leitura falhava.
  const clientesCarregados = useClientsStore((s) => s.initialized);
  const clientesErro = useClientsStore((s) => s.erro);
  const initClientes = useClientsStore((s) => s.init);
  const fClientes = situacaoDaFonte({ carregada: clientesCarregados, erro: clientesErro });
  const fTarefas = situacaoDaFonte({ carregada: useOperationalStore(selectTarefasProntas), erro: useOperationalStore((s) => s.tarefasErro) });
  const fCards = situacaoDaFonte({ carregada: useContentStore((s) => s.initialized), erro: useContentStore((s) => s.loadError) });
  const [tentandoClientes, setTentandoClientes] = useState(false);


  // O acesso vem do papel da sessão (o PIN antigo estava escrito no bundle e não protegia nada).
  const permitido = hydrated && (role === "admin" || role === "manager");
  const [activeSection, setActiveSection] = useState<"overview" | "operacao" | "team" | "manage" | "workload">("overview");

  // Cockpit: anomalias de Meta abertas. (Sem financeiro da agência — regra da casa.)
  const [openAnomalies, setOpenAnomalies] = useState<number | null>(null);
  useEffect(() => {
    if (!permitido) return;
    authedFetch("/api/defense/alerts").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.summary) setOpenAnomalies(d.summary.open ?? d.summary.total ?? (Array.isArray(d.alerts) ? d.alerts.length : 0));
      else if (Array.isArray(d?.alerts)) setOpenAnomalies(d.alerts.length);
    }).catch(() => {});
  }, [permitido]);

  const novosNoMes = useMemo(() => clients.filter((c) => noMesSP(c.createdAt)).length, [clients]);

  // Employee delivery metrics
  const teamMetrics = useMemo(() => {
    const employees = profiles.filter((p) => p.role !== "admin");

    return employees.map((profile) => {
      const memberTasks = tasks.filter((t) => t.assignedTo === profile.name);
      const totalTasks = memberTasks.length;
      const doneTasks = memberTasks.filter((t) => t.status === "done").length;
      const pendingTasks = memberTasks.filter((t) => t.status === "pending").length;
      const inProgressTasks = memberTasks.filter((t) => t.status === "in_progress").length;
      // Sem tarefa atribuída não é 0%: é "sem dado" — ninguém fica vermelho por lacuna do sistema.
      const taskRate: number | null = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : null;

      let published = 0;
      let totalCards = 0;
      let designDone = 0;
      let designTotal = 0;
      let supportDone = 0;
      let supportTotal = 0;

      if (profile.role === "social") {
        const memberCards = contentCards.filter((c) => c.socialMedia === profile.name);
        totalCards = memberCards.length;
        published = memberCards.filter((c) => statusNaEtapa(c.status, "no_ar")).length;
      }

      if (profile.role === "designer") {
        const myClientIds = new Set(clients.filter((c) => c.assignedDesigner === profile.name).map((c) => c.id));
        const myReqs = designRequests.filter((r) => myClientIds.has(r.clientId));
        designTotal = myReqs.length;
        designDone = myReqs.filter((r) => r.status === "done").length;
      }

      if (profile.role === "traffic") {
        const today = todaySP();
        const memberClients = clients.filter((c) => c.assignedTraffic === profile.name && c.status !== "onboarding");
        supportTotal = memberClients.length;
        supportDone = trafficRoutineChecks.filter((c) => c.date === today && c.completedBy === profile.name && c.type === "support").length;
      }

      // Nota = média só do que existe. "Publicado" no board não entra: o board não registra a
      // maioria dos posts reais, então puniria quem postou sem arrastar o card.
      const partes: number[] = [];
      if (taskRate !== null) partes.push(taskRate);
      if (profile.role === "traffic" && supportTotal > 0) partes.push(Math.round((supportDone / supportTotal) * 100));
      const overallScore: number | null = partes.length ? Math.round(partes.reduce((a, b) => a + b, 0) / partes.length) : null;

      const level = overallScore === null ? "none" : overallScore >= 80 ? "excellent" : overallScore >= 60 ? "good" : overallScore >= 40 ? "warning" : "critical";

      return {
        ...profile,
        totalTasks,
        doneTasks,
        pendingTasks,
        inProgressTasks,
        taskRate,
        published,
        totalCards,
        designDone,
        designTotal,
        supportDone,
        supportTotal,
        overallScore,
        level,
      };
    });
  }, [tasks, contentCards, designRequests, trafficRoutineChecks, clients]);

  // Gestão da Equipe saiu daqui para components/equipe/GestaoEquipe.tsx (25/10/2026, onda 6 da auditoria
  // de erro recuperável): lista do GET /api/team com desativados e removidos, confirmação com o nome e Desfazer.

  if (!hydrated) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Área CEO" subtitle="Carregando…" />
      </div>
    );
  }
  if (!permitido) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <Header title="Área CEO" subtitle="Acesso restrito" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-xs w-full text-center">
            <Lock size={20} className="text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lone-h2 text-foreground">Área da diretoria</h2>
            <p className="text-lone-caption text-muted-foreground mt-1">Disponível para CEO e gerência.</p>
          </div>
        </div>
      </div>
    );
  }

  const LEVEL_CONFIG: Record<string, { color: string; badge: string; ring: string; label: string }> = {
    excellent: { color: "text-lone-success", badge: "bg-lone-success-bg border-lone-success-border", ring: "var(--lone-success)", label: "Excelente" },
    good:      { color: "text-primary",      badge: "bg-primary/10 border-primary/20",               ring: "var(--primary)",      label: "Bom" },
    warning:   { color: "text-lone-warning", badge: "bg-lone-warning-bg border-lone-warning-border", ring: "var(--lone-warning)", label: "Atenção" },
    critical:  { color: "text-lone-danger",  badge: "bg-lone-danger-bg border-lone-danger-border",   ring: "var(--lone-danger)",  label: "Crítico" },
    none:      { color: "text-muted-foreground", badge: "bg-muted border-border",                    ring: "var(--muted)",        label: "Sem tarefas" },
  };

  const ROLE_ICON: Record<string, typeof Users> = {
    manager: Users,
    traffic: TrendingUp,
    social: Instagram,
    designer: Palette,
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Área CEO" subtitle="Visão confidencial da operação" />

      <div className="p-6 space-y-6 animate-fade-in">
        {/* Operação, desempenho e carga contam os cards: se não carregaram, avisa em vez de mostrar zero (25/10/2026). */}
        <ErroCargaCards variante="faixa" />
        {/* Tarefas e clientes idem (25/10/2026, 6.5). */}
        <ErroCargaTarefas variante="faixa" />
        {clientesErro && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3">
            <p className="text-sm text-lone-danger">Não consegui carregar os clientes ({clientesErro}) — os números da carteira aparecem como &quot;—&quot;.</p>
            <button type="button" disabled={tentandoClientes}
              onClick={async () => { setTentandoClientes(true); try { await initClientes(); } finally { setTentandoClientes(false); } }}
              className="rounded-lg border border-lone-danger-border bg-card px-3 py-1.5 text-xs font-medium text-lone-danger hover:opacity-90 disabled:opacity-60">
              {tentandoClientes ? "Tentando…" : "Tentar de novo"}
            </button>
          </div>
        )}
        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-xs text-muted-foreground">Total de Clientes</p>
            <p className="text-2xl font-bold text-primary mt-1">{valorDaFonte(clients.length, fClientes)}</p>
            <p className="text-xs text-muted-foreground mt-1">{legendaDaFonte("na carteira", fClientes)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-muted-foreground">Clientes Ativos</p>
            <p className="text-2xl font-bold text-primary mt-1">{valorDaFonte(clients.filter((c) => c.status !== "onboarding").length, fClientes)}</p>
            <p className="text-xs text-muted-foreground mt-1">{legendaDaFonte("em operação", fClientes)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-muted-foreground">Bons Resultados</p>
            <p className="text-2xl font-bold text-primary mt-1">{valorDaFonte(clients.filter((c) => c.status === "good").length, fClientes)}</p>
            <p className="text-xs text-muted-foreground mt-1">{legendaDaFonte("clientes satisfeitos", fClientes)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-muted-foreground">Risco de Churn</p>
            <p className="text-2xl font-bold text-destructive mt-1">
              {fClientes === "pronta" ? `${clients.filter((c) => c.active !== false && emRisco(c)).length} clientes` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{legendaDaFonte("precisam de atenção", fClientes)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
            {(["overview", "operacao", "team", "manage", "workload"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                  activeSection === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "manage" && <UserCog size={14} />}
                {tab === "workload" && <BarChart2 size={14} />}
                {tab === "overview" ? "Visão Geral" : tab === "operacao" ? "Operação" : tab === "team" ? "Desempenho" : tab === "manage" ? "Gestão da Equipe" : "Carga de Trabalho"}
              </button>
            ))}
          </div>

          {activeSection === "operacao" && (
            <div className="space-y-4 animate-fade-in">
              {/* Reunião com cliente é entrega operacional, não agenda — por isso fica aqui, ao
                  lado dos KPIs de entrega, e não numa tela própria que ninguém abriria. */}
              <CoberturaReunioes />
              <OperationalKpisPanel cards={contentCards} indisponivel={fCards !== "pronta" ? legendaDaFonte("", fCards) : undefined} />
            </div>
          )}

          {activeSection === "overview" && (
            <div className="space-y-4 animate-fade-in">
              {/* ── COCKPIT: resumo do dia (dinheiro + sinais críticos, tudo num lugar) ── */}
              {(() => {
                const stuckCount = contentCards.filter((c) => {
                  if (statusNaEtapa(c.status, ...ETAPAS_FINAIS)) return false;
                  const enteredAt = c.columnEnteredAt?.[c.status] ?? c.statusChangedAt;
                  if (!enteredAt) return false;
                  return (Date.now() - new Date(enteredAt).getTime()) / 86400000 >= 3;
                }).length;
                // Os 3 piores em saúde (100 = saudável), pela mesma régua da Saúde da carteira.
                const topRisk = clients
                  .filter((c) => c.active !== false && emRisco(c))
                  .map((c) => ({ c, score: scoreDoCliente(c) }))
                  .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
                  .slice(0, 3);
                return (
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-foreground">Resumo do dia</h3>
                      <span className="text-[11px] text-muted-foreground">Atualizado agora</span>
                    </div>
                    {/* Tiles da carteira (sem financeiro da agência — removido a pedido) */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-border bg-background p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Novos no mês</p>
                        <p className="text-lg font-bold text-primary tabular-nums mt-0.5">{valorDaFonte(novosNoMes, fClientes)}</p>
                      </div>
                      <button onClick={() => router.push("/defesa")} className="rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/40">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Anomalias Meta</p>
                        <p className={`text-lg font-bold tabular-nums mt-0.5 ${openAnomalies ? "text-destructive" : "text-foreground"}`}>{openAnomalies ?? "—"}</p>
                      </button>
                    </div>
                    {/* Ação: quem está em risco agora */}
                    {topRisk.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Precisa de atenção agora</p>
                        <div className="flex flex-wrap gap-2">
                          {topRisk.map(({ c, score }) => (
                            <button
                              key={c.id}
                              onClick={() => router.push(`/clients/${c.id}`)}
                              className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-1.5 text-xs transition-colors hover:border-destructive/50"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                              <span className="font-medium text-foreground">{c.name}</span>
                              {score !== null && <span className="text-destructive font-semibold tabular-nums">{Math.round(score)}/100</span>}
                            </button>
                          ))}
                          {stuckCount > 0 && (
                            <span className="flex items-center gap-2 rounded-lg border border-lone-warning-border bg-lone-warning-bg px-3 py-1.5 text-xs text-lone-warning">
                              {stuckCount} card(s) parado(s) +3 dias
                            </span>
                          )}
                          <button
                            onClick={() => router.push("/saude?nivel=risco&resp=all")}
                            className="px-2 py-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            Ver na Saúde da carteira
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {["Cliente", "Segmento", "Status", "Atenção", "Tags", "Tráfego", "Social"].map((h) => (
                        <th key={h} className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr
                        key={client.id}
                        onClick={() => router.push(`/clients/${client.id}`)}
                        className="border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-3 font-medium text-foreground">{client.name}</td>
                        <td className="py-3 px-3 text-muted-foreground text-xs">{client.industry}</td>
                        <td className="py-3 px-3">
                          <span className={`badge border text-xs ${getStatusColor(client.status)}`}>
                            {getStatusLabel(client.status)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`badge border text-xs ${getAttentionColor(client.attentionLevel)}`}>
                            {getAttentionLabel(client.attentionLevel)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex gap-1 flex-wrap">
                            {client.tags.map((tag) => (
                              <span key={tag} className={`badge border text-xs ${tag === "Premium" ? "tag-premium" : tag === "Risco de Churn" ? "tag-risk" : "tag-matcon"}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-muted-foreground text-xs">{client.assignedTraffic}</td>
                        <td className="py-3 px-3 text-muted-foreground text-xs">{client.assignedSocial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── BOTTLENECK ANALYZER ── */}
              <div className="space-y-4 mt-6">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Target size={16} className="text-primary" /> Análise de Gargalos
                </h3>

                {/* Pipeline funnel */}
                {(() => {
                  // As seis etapas do quadro de produção (lib/conteudo/etapas.ts).
                  const pipeline = ETAPAS.map((e) => ({
                    key: e.id, label: e.rotulo, count: contentCards.filter((c) => statusNaEtapa(c.status, e.id)).length,
                  }));
                  const maxCount = Math.max(...pipeline.map((p) => p.count), 1);
                  const bottleneck = pipeline.filter((p) => !(ETAPAS_FINAIS as readonly string[]).includes(p.key)).sort((a, b) => b.count - a.count)[0];

                  const designPending = designRequests.filter((r) => r.status !== "done").length;
                  const designDone = designRequests.filter((r) => r.status === "done").length;
                  const cardsWithoutArt = contentCards.filter((c) => !c.imageUrl && statusNaEtapa(c.status, ...ETAPAS_COMPROMETIDAS)).length;

                  // SLA: cards stuck > 3 days
                  const stuckCards = contentCards.filter((c) => {
                    if (statusNaEtapa(c.status, ...ETAPAS_FINAIS)) return false;
                    const enteredAt = c.columnEnteredAt?.[c.status] ?? c.statusChangedAt;
                    if (!enteredAt) return false;
                    const daysInColumn = (Date.now() - new Date(enteredAt).getTime()) / 86400000;
                    return daysInColumn > 3;
                  });

                  // Workload per person
                  const workload = [...new Set(contentCards.map((c) => c.socialMedia))].map((person) => {
                    const cards = contentCards.filter((c) => c.socialMedia === person);
                    const active = cards.filter((c) => !statusNaEtapa(c.status, "no_ar")).length;
                    const published = cards.filter((c) => statusNaEtapa(c.status, "no_ar")).length;
                    return { person, active, published, total: cards.length };
                  }).sort((a, b) => b.active - a.active);

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Pipeline funnel */}
                      <div className="card space-y-3">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pipeline de Conteúdo</p>
                        {pipeline.map((stage) => (
                          <div key={stage.key} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{stage.label}</span>
                            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  stage.key === bottleneck?.key ? "bg-destructive" : "bg-primary"
                                }`}
                                style={{ width: `${(stage.count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold w-8 ${stage.key === bottleneck?.key ? "text-destructive" : "text-foreground"}`}>
                              {stage.count}
                            </span>
                          </div>
                        ))}
                        {bottleneck && bottleneck.count > 0 && (
                          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mt-2">
                            Gargalo: <strong>{bottleneck.count} cards</strong> acumulados em &ldquo;{bottleneck.label}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Design vs. Content stats */}
                      <div className="card space-y-3">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Design vs. Demanda</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-foreground">{designPending}</p>
                            <p className="text-[10px] text-muted-foreground">Designs pendentes</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-primary">{designDone}</p>
                            <p className="text-[10px] text-muted-foreground">Designs concluídos</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-primary">{cardsWithoutArt}</p>
                            <p className="text-[10px] text-muted-foreground">Cards sem arte</p>
                          </div>
                          <div className="bg-muted rounded-lg p-3 text-center">
                            <p className={`text-2xl font-bold ${stuckCards.length > 0 ? "text-destructive" : "text-foreground"}`}>{stuckCards.length}</p>
                            <p className="text-[10px] text-muted-foreground">Cards parados +3 dias</p>
                          </div>
                        </div>
                      </div>

                      {/* Workload distribution */}
                      <div className="card space-y-3 lg:col-span-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Carga de Trabalho — Social Media</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {workload.map((w) => {
                            const isOverloaded = w.active >= 6;
                            const isIdle = w.active === 0;
                            return (
                              <div key={w.person} className={`bg-muted rounded-lg p-3 border ${
                                isOverloaded ? "border-destructive/30" : isIdle ? "border-primary/30" : "border-border"
                              }`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-foreground">{w.person}</span>
                                  {isOverloaded && <span className="text-[10px] text-destructive bg-destructive/10 px-2 py-0.5 rounded">Sobrecarregado</span>}
                                  {isIdle && <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded">Ocioso</span>}
                                </div>
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span>{w.active} ativos</span>
                                  <span>{w.published} publicados</span>
                                  <span>{w.total} total</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── POST VERIFICATION METRICS + CALENDAR ── */}
                      {(() => {
                        const monthStr = new Date().toLocaleString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
                        // Só o mês corrente (SP). Calendário por dia saiu: pintava de vermelho todo dia
                        // sem card "publicado" no board, e o board não registra a maioria dos posts reais.
                        const publishedCards = contentCards.filter((c) => statusNaEtapa(c.status, "no_ar") && noMesSP(c.publishVerifiedAt ?? c.statusChangedAt));
                        const scheduledCards = contentCards.filter((c) => statusNaEtapa(c.status, "agendado"));
                        const scheduledNoMes = scheduledCards.filter((c) => noMesSP(c.dueDate));
                        const unverifiedScheduled = scheduledCards.filter((c) => !c.publishVerifiedAt);
                        const verifiedCount = publishedCards.filter((c) => c.publishVerifiedAt).length;
                        const publishedWithoutVerify = publishedCards.filter((c) => !c.publishVerifiedAt).length;

                        return (
                          <>
                            {/* Verification KPIs */}
                            <div className="card space-y-3 lg:col-span-2">
                              <div className="flex items-center gap-2 mb-1">
                                <ShieldCheck size={14} className="text-primary" />
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Verificação de Publicações — {monthStr}</p>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-muted rounded-lg p-3 text-center">
                                  <p className="text-2xl font-bold text-primary">{verifiedCount}</p>
                                  <p className="text-[10px] text-muted-foreground">Verificados ✓</p>
                                </div>
                                <div className={`bg-muted rounded-lg p-3 text-center ${publishedWithoutVerify > 0 ? "border border-lone-warning-border" : ""}`}>
                                  <p className={`text-2xl font-bold ${publishedWithoutVerify > 0 ? "text-lone-warning" : "text-foreground"}`}>{publishedWithoutVerify}</p>
                                  <p className="text-[10px] text-muted-foreground">Sem verificação</p>
                                </div>
                                <div className={`bg-muted rounded-lg p-3 text-center ${unverifiedScheduled.length > 0 ? "border border-destructive/30" : ""}`}>
                                  <p className={`text-2xl font-bold ${unverifiedScheduled.length > 0 ? "text-destructive" : "text-foreground"}`}>{unverifiedScheduled.length}</p>
                                  <p className="text-[10px] text-muted-foreground">Agendados pendentes</p>
                                </div>
                                <div className="bg-muted rounded-lg p-3 text-center">
                                  <p className="text-2xl font-bold text-foreground">{publishedCards.length + scheduledNoMes.length}</p>
                                  <p className="text-[10px] text-muted-foreground">Total posts mês</p>
                                </div>
                              </div>

                              {/* Per-member verification */}
                              {(() => {
                                const members = [...new Set(contentCards.map((c) => c.socialMedia))];
                                return (
                                  <div className="space-y-1.5 mt-2">
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Por membro</p>
                                    {members.map((name) => {
                                      const pubCards = publishedCards.filter((c) => c.socialMedia === name);
                                      const pub = pubCards.length;
                                      const verified = pubCards.filter((c) => c.publishVerifiedAt).length;
                                      const sched = unverifiedScheduled.filter((c) => c.socialMedia === name).length;
                                      const rate = pub > 0 ? Math.round((verified / pub) * 100) : 100;
                                      return (
                                        <div key={name} className="flex items-center gap-3 bg-muted/50 rounded-lg p-2.5">
                                          <span className="text-xs font-medium text-foreground w-32 shrink-0">{name}</span>
                                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${rate >= 80 ? "bg-primary" : rate >= 50 ? "bg-lone-warning" : "bg-destructive"}`} style={{ width: `${rate}%` }} />
                                          </div>
                                          <span className={`text-xs font-bold w-10 text-right ${rate >= 80 ? "text-primary" : rate >= 50 ? "text-lone-warning" : "text-destructive"}`}>{rate}%</span>
                                          <span className="text-[10px] text-muted-foreground w-20 text-right">{pub} pub · {sched} pend</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

                          </>
                        );
                      })()}

                      {/* Stuck cards detail */}
                      {stuckCards.length > 0 && (
                        <div className="card space-y-3 lg:col-span-2">
                          <p className="text-xs text-destructive font-medium uppercase tracking-wider">Cards Parados (+3 dias no mesmo status)</p>
                          <div className="space-y-2">
                            {stuckCards.slice(0, 8).map((card) => {
                              const enteredAt = card.columnEnteredAt?.[card.status] ?? card.statusChangedAt!;
                              const days = Math.round((Date.now() - new Date(enteredAt).getTime()) / 86400000);
                              return (
                                <div
                                  key={card.id}
                                  onClick={() => router.push(`/social?card=${card.id}`)}
                                  className="flex items-center gap-3 bg-muted rounded-lg p-2.5 cursor-pointer transition-colors hover:bg-muted/70"
                                >
                                  <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{card.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{card.clientName} · {card.socialMedia}</p>
                                  </div>
                                  <span className="text-xs text-destructive font-medium shrink-0">{days}d em &ldquo;{card.status}&rdquo;</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── TEAM PERFORMANCE TAB ── */}
          {activeSection === "team" && (
            <div className="space-y-6 animate-fade-in">
              <p className="text-muted-foreground text-sm">
                Medidor de entregas e desempenho de cada colaborador, baseado em tarefas concluídas e entregas específicas do cargo.
              </p>

              {/* Team overview cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Tarefas</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{valorDaFonte(tasks.length, fTarefas)}</p>
                  <p className="text-xs text-muted-foreground">{legendaDaFonte(`${tasks.filter((t) => t.status === "done").length} concluídas`, fTarefas)}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Taxa Geral</p>
                  <p className="text-2xl font-bold text-primary mt-1">
                    {/* Sem tarefa nenhuma não é 0% de conclusão: é "—" (e falha de carga também). */}
                    {fTarefas === "pronta" && tasks.length > 0 ? `${Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100)}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">{legendaDaFonte(tasks.length > 0 ? "de conclusão" : "sem tarefas", fTarefas)}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Posts Publicados</p>
                  <p className="text-2xl font-bold text-primary mt-1">{valorDaFonte(contentCards.filter((c) => statusNaEtapa(c.status, "no_ar") && noMesSP(c.publishVerifiedAt ?? c.statusChangedAt)).length, fCards)}</p>
                  <p className="text-xs text-muted-foreground">{legendaDaFonte("este mês", fCards)}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Colaboradores</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{teamMetrics.length}</p>
                  <p className="text-xs text-muted-foreground">ativos</p>
                </div>
              </div>

              {/* Individual employee cards */}
              <div className="space-y-4">
                {teamMetrics.map((member) => {
                  const levelConfig = LEVEL_CONFIG[member.level];
                  const RoleIcon = ROLE_ICON[member.role] ?? Users;
                  const roleLabel = member.role === "manager" ? "Gerente" : member.role === "traffic" ? "Tráfego" : member.role === "social" ? "Social" : "Designer";

                  return (
                    <div key={member.id} className="card border border-border">
                      <div className="flex items-start gap-4">
                        {/* Avatar + score ring */}
                        <div className="relative shrink-0">
                          <div className="w-16 h-16 relative">
                            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--muted)" strokeWidth="6" />
                              <circle
                                cx="50" cy="50" r="42" fill="none"
                                stroke={levelConfig.ring}
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${(member.overallScore ?? 0) * 2.64} 264`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className={`text-lg font-semibold ${levelConfig.color}`}>{member.overallScore ?? "—"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-foreground">{member.name}</h4>
                            <div className="flex items-center gap-1.5">
                              <RoleIcon size={12} className="text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{roleLabel}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${levelConfig.color} ${levelConfig.badge}`}>
                              {levelConfig.label}
                            </span>
                          </div>

                          {/* Progress bars */}
                          <div className="space-y-2.5">
                            {/* Tasks */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                  <CheckCircle size={11} />
                                  Tarefas
                                </span>
                                <span className="text-foreground font-medium">
                                  {member.taskRate === null ? "sem tarefas atribuídas" : `${member.doneTasks}/${member.totalTasks} concluídas (${member.taskRate}%)`}
                                </span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    (member.taskRate ?? 100) >= 50 ? "bg-primary" : "bg-destructive"
                                  }`}
                                  style={{ width: `${member.taskRate ?? 0}%` }}
                                />
                              </div>
                              <div className="flex gap-3 mt-1">
                                <span className="text-[10px] text-muted-foreground">{member.pendingTasks} pendentes</span>
                                <span className="text-[10px] text-primary">{member.inProgressTasks} em progresso</span>
                              </div>
                            </div>

                            {/* Role-specific metrics */}
                            {member.role === "social" && (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Instagram size={11} />
                                    Conteúdo Publicado
                                  </span>
                                  <span className="text-foreground font-medium">
                                    {member.published}/{member.totalCards} ({member.totalCards > 0 ? Math.round((member.published / member.totalCards) * 100) : 0}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${member.totalCards > 0 ? Math.round((member.published / member.totalCards) * 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {member.role === "traffic" && (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Zap size={11} />
                                    Suporte Diário
                                  </span>
                                  <span className="text-foreground font-medium">
                                    {member.supportDone}/{member.supportTotal} clientes atendidos
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      member.supportDone >= member.supportTotal ? "bg-primary" : "bg-primary"
                                    }`}
                                    style={{ width: `${member.supportTotal > 0 ? Math.round((member.supportDone / member.supportTotal) * 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {member.role === "designer" && (
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Palette size={11} />
                                    Design Entregues
                                  </span>
                                  <span className="text-foreground font-medium">
                                    {member.designDone}/{member.designTotal} pedidos
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${member.designTotal > 0 ? Math.round((member.designDone / member.designTotal) * 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── TEAM MANAGEMENT TAB ── (components/equipe/GestaoEquipe.tsx) */}
          {activeSection === "manage" && <GestaoEquipe />}

          {activeSection === "workload" && (
            <div className="space-y-6 animate-fade-in">
              <p className="text-muted-foreground text-sm">Carga real de cada pessoa: o que está aberto agora, contra o limite do papel.</p>

              {/* Leva 7C (N30): itens abertos por pessoa contra o limite do PAPEL — saiu a capacidade
                  fixa de 8/semana para todo mundo (lib/carga/por-pessoa.ts). */}
              <CargaPorPessoa />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
