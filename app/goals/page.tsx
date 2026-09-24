"use client";

// /goals — Metas & OKRs (N33, Leva 7D).
//
// Cada meta é uma MÉTRICA REAL calculada no SERVIDOR sobre o MÊS FECHADO (/api/goals), com o
// histórico gravado mês a mês (goal_results, job metas-fechamento no dia 1º) e o mês corrente só
// como parcial. Saiu daqui o cálculo no navegador (useOKRMetrics lia mockAdCampaigns para ROAS,
// investimento e leads) e o "snapshot" em localStorage com baseline escrito no código.
// Nenhuma meta de faturamento da agência — regra do CEO. Catálogo em lib/goals/catalogo.ts.

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Target, TrendingUp, Users, Instagram, Palette, BarChart2, ArrowUp, ArrowDown,
  Download, Monitor, Minimize2, AlertTriangle, FileText, Pencil, RefreshCcw, Check,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { exportReportAsPdf } from "@/lib/exportPdf";
import { useCollaboratorScores } from "@/lib/hooks/useCollaboratorScores";
import FechamentoMensal from "@/components/FechamentoMensal";
import CartaoMeta from "@/components/goals/CartaoMeta";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/context/RoleContext";
import { useCockpit, valorOu, variacaoBoa } from "@/lib/hooks/useCockpit";
import { nomeDoMes, type Equipe } from "@/lib/goals/catalogo";
import type { PainelMetas } from "@/lib/goals/metas-server";

const ICONE_EQUIPE: Record<Equipe, LucideIcon> = { empresa: BarChart2, trafego: TrendingUp, social: Instagram, design: Palette };

export default function GoalsPage() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "manager";
  const { members: teamMembers } = useTeamMembers();
  const collaborators = useCollaboratorScores(teamMembers);
  // Cockpit do servidor: compara com o mês anterior REALMENTE fechado (ver lib/hooks/useCockpit).
  const cockpit = useCockpit();
  const pageRef = useRef<HTMLDivElement>(null);

  // ── As metas, do servidor ──────────────────────────────────────────────────
  const [painel, setPainel] = useState<PainelMetas | null>(null);
  const [erroMetas, setErroMetas] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    chamar<PainelMetas>("/api/goals").then((r) => {
      if (!vivo) return;
      setCarregando(false);
      // Falha vira aviso na tela — nunca número de outro lugar no lugar do que não veio.
      if (!r.ok || !r.data) { setErroMetas(r.erro ?? "Não consegui calcular as metas agora."); return; }
      setErroMetas(null);
      setPainel(r.data);
    });
    return () => { vivo = false; };
  }, [recarga]);

  const salvarAlvo = useCallback(async (chave: string, alvo: number) => {
    if (!Number.isFinite(alvo) || alvo < 0) { toast.error("Informe um número válido."); return; }
    setSalvando(true);
    const r = await chamar("/api/goals", { chave, alvo }, { method: "PUT" });
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui salvar a meta."); return; }
    toast.success("Meta atualizada.");
    setRecarga((n) => n + 1);
  }, []);

  const voltarPadrao = useCallback(async (chave: string) => {
    setSalvando(true);
    const r = await chamar(`/api/goals?chave=${encodeURIComponent(chave)}`, undefined, { method: "DELETE" });
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui voltar ao padrão."); return; }
    toast.success("Meta de volta ao padrão.");
    setRecarga((n) => n + 1);
  }, []);

  // ── Indicadores ao vivo do mês corrente (qualidade de tráfego + relacionamento) ─
  type RealTraffic = {
    investmentExecutedPct: number; isReal: boolean; accountsWithinBudgetPct: number; accountsCounted: number;
    ctrPct: number; impressionsMonth: number; trafficQualIsReal: boolean;
    activeClients: number; staleContacts: number;
  };
  const [realTraffic, setRealTraffic] = useState<RealTraffic | null>(null);
  useEffect(() => {
    let alive = true;
    chamar<RealTraffic>("/api/okr/traffic-metrics").then((r) => { if (alive && r.ok && r.data) setRealTraffic(r.data); });
    return () => { alive = false; };
  }, []);

  const resumo = useMemo(() => {
    if (!painel) return null;
    const comDado = painel.metas.filter((m) => m.fechado.status !== "sem_dado");
    const batidas = comDado.filter((m) => m.fechado.status === "batida").length;
    const progresso = comDado.length ? Math.round(comDado.reduce((s, m) => s + (m.fechado.progresso ?? 0), 0) / comDado.length) : null;
    return { batidas, comDado: comDado.length, total: painel.metas.length, progresso };
  }, [painel]);

  const nomeFechado = painel ? nomeDoMes(painel.mesFechado) : "";
  const nomeAtual = painel ? nomeDoMes(painel.mesAtual).split(" ")[0] : "";

  // ── Relatório (PDF da tela) e modo apresentação ────────────────────────────
  const [presentationMode, setPresentationMode] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    setShowExportMenu(false);
    try {
      const el = pageRef.current;
      if (!el) { setExporting(false); return; }
      const h2cModule = await import("html2canvas");
      const html2canvas = h2cModule.default ?? h2cModule;
      const jspdfModule = await import("jspdf");
      const JsPDF = jspdfModule.jsPDF ?? jspdfModule.default;
      const canvas = await html2canvas(el, { backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || null, scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/png");
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const pdf = new JsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h] });
      pdf.addImage(imgData, "PNG", 0, 0, w, h);
      pdf.save(`Metas_${(painel?.mesFechado ?? "mes").replace("-", "_")}.pdf`);
    } catch (err) {
      console.error("[Lone OS] PDF export failed:", err);
      toast.error("Erro ao gerar PDF: " + (err instanceof Error ? err.message : "erro desconhecido"));
    } finally {
      setExporting(false);
    }
  }, [painel]);

  const togglePresentation = useCallback(() => {
    setPresentationMode((prev) => {
      const next = !prev;
      if (next) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
      return next;
    });
    setShowExportMenu(false);
  }, []);

  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setPresentationMode(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div ref={pageRef} className={cn("animate-fade-in", presentationMode ? "fixed inset-0 z-[9999] overflow-auto bg-background p-8" : "p-6")}>
      <div className="mx-auto max-w-[1400px] space-y-6">
        {/* ─── Cabeçalho ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {!presentationMode && (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Target size={20} className="text-primary" />
              </div>
            )}
            <div>
              <h1 className={cn("font-semibold tracking-tight text-foreground", presentationMode ? "text-3xl" : "text-lone-h1")}>Metas & OKRs</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {painel ? <>Mês fechado: <span className="font-medium text-foreground">{nomeFechado}</span> · {nomeAtual} até agora como parcial</> : "Calculando…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && painel && (
              <button type="button" onClick={() => setEditando((v) => !v)} aria-pressed={editando}
                className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  editando ? "border-primary/20 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                {editando ? <><Check size={12} /> Pronto</> : <><Pencil size={12} /> Editar metas</>}
              </button>
            )}
            <div className="relative">
              <button type="button" onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
                <Download size={13} /> Relatório
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 animate-fade-in rounded-xl border border-border bg-card p-1.5 shadow-sm">
                  <button type="button" onClick={handleExportPDF} disabled={exporting}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
                    <Download size={13} className="text-primary" /> {exporting ? "Gerando…" : "Exportar PDF"}
                  </button>
                  <button type="button" onClick={togglePresentation}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <Monitor size={13} className="text-primary" /> Modo apresentação
                  </button>
                </div>
              )}
            </div>
            {presentationMode && (
              <button type="button" onClick={togglePresentation}
                className="flex items-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20">
                <Minimize2 size={13} /> Sair
              </button>
            )}
          </div>
        </div>

        {/* ─── Avisos: de onde vêm os números ─────────────────────── */}
        {erroMetas && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger" role="alert">
            <AlertTriangle size={13} className="shrink-0" />
            <span className="flex-1">{erroMetas}</span>
            <button type="button" onClick={() => setRecarga((n) => n + 1)} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
              <RefreshCcw size={12} /> Tentar de novo
            </button>
          </div>
        )}
        {painel && !painel.fechadoGravado && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            {painel.historicoExiste
              ? <>O fechamento de <span className="capitalize">{nomeFechado}</span> ainda não foi gravado (o job roda no dia 1º, 7h). Os números abaixo foram calculados agora, da mesma fonte.</>
              : <>O histórico mês a mês começa quando a migration das metas for aplicada e o fechamento rodar. Por enquanto, <span className="capitalize">{nomeFechado}</span> é calculado na hora, da fonte.</>}
          </p>
        )}

        {/* ─── Resumo do mês fechado ──────────────────────────────── */}
        {carregando && !painel ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : resumo && (
          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold capitalize text-foreground">{nomeFechado}</h2>
                <p className="text-xs text-muted-foreground">
                  {resumo.batidas} de {resumo.comDado} {resumo.comDado === 1 ? "meta medida batida" : "metas medidas batidas"}
                  {resumo.total > resumo.comDado ? ` · ${resumo.total - resumo.comDado} sem dado` : ""}
                </p>
              </div>
              <span className="text-lone-hero tabular-nums text-primary">{resumo.progresso == null ? "—" : `${resumo.progresso}%`}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${resumo.progresso ?? 0}%` }} />
            </div>
          </div>
        )}

        {/* ─── As metas, por equipe ───────────────────────────────── */}
        {painel && painel.equipes.map((eq) => {
          const metas = painel.metas.filter((m) => m.equipe === eq.id);
          if (!metas.length) return null;
          const Icone = ICONE_EQUIPE[eq.id];
          return (
            <section key={eq.id} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icone size={14} className="text-primary" /> {eq.rotulo}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metas.map((m) => (
                  <CartaoMeta key={`${m.chave}-${m.alvo}`} m={m} nomeMesAtual={nomeAtual} editando={editando}
                    onSalvar={salvarAlvo} onPadrao={voltarPadrao} salvando={salvando} />
                ))}
              </div>
            </section>
          );
        })}
        {painel && editando && (
          <p className="text-[11px] text-muted-foreground">
            As metas editadas valem para o trimestre {painel.trimestreAtual.replace("-", " ")}. O fechamento de cada mês guarda a meta daquele trimestre — mudar agora não reescreve o passado.
          </p>
        )}

        {/* ─── Indicadores ao vivo do mês corrente ────────────────── */}
        {realTraffic && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(() => {
              const staleRatio = realTraffic.activeClients > 0 ? realTraffic.staleContacts / realTraffic.activeClients : 0;
              const staleTone = staleRatio >= 0.5 ? "text-destructive" : staleRatio >= 0.25 ? "text-lone-warning" : "text-lone-success";
              const budgetTone = realTraffic.accountsWithinBudgetPct >= 90 ? "text-lone-success" : realTraffic.accountsWithinBudgetPct >= 70 ? "text-lone-warning" : "text-destructive";
              const tiles = [
                { label: "CTR médio", value: realTraffic.trafficQualIsReal ? `${realTraffic.ctrPct.toLocaleString("pt-BR")}%` : "—", sub: "cliques ÷ impressões · mês corrente", tone: "text-foreground" },
                { label: "Impressões", value: realTraffic.trafficQualIsReal ? realTraffic.impressionsMonth.toLocaleString("pt-BR") : "—", sub: "mês corrente, sem repetir captura", tone: "text-foreground" },
                { label: "Contas no orçamento", value: `${realTraffic.accountsWithinBudgetPct}%`, sub: `${realTraffic.accountsCounted} contas ativas`, tone: budgetTone },
                { label: "Sem contato +15d", value: String(realTraffic.staleContacts), sub: `de ${realTraffic.activeClients} clientes ativos`, tone: staleTone },
              ];
              return tiles.map((t) => (
                <div key={t.label} className="rounded-xl border border-border bg-card p-3.5">
                  <p className="mb-1 text-[10px] text-muted-foreground">{t.label}</p>
                  <p className={cn("text-xl font-semibold tabular-nums", t.tone)}>{t.value}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{t.sub}</p>
                </div>
              ));
            })()}
          </div>
        )}

        {/* ─── Fechamento do mês: os números concretos, com nome ───
            Roberto (02/09): "tem que mostrar se teve um cliente que não recebeu artes, quantos
            clientes teve arte, quantos não teve, quanto foi tempo de atraso". */}
        <FechamentoMensal />

        {/* ─── Produção dos Colaboradores (real, por pessoa) ─── */}
        {collaborators.length > 0 && (
          <div className="card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users size={14} className="text-primary" /> Produção dos colaboradores
                <span className="text-[10px] font-normal text-muted-foreground">· mês atual</span>
              </h3>
              <span className="text-[10px] text-muted-foreground">Score = desempenho real</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {collaborators.map((p) => {
                const ring = p.tone === "success" ? "text-lone-success" : p.tone === "warning" ? "text-lone-warning" : p.tone === "danger" ? "text-destructive" : "text-muted-foreground";
                const barBg = p.tone === "success" ? "bg-lone-success" : p.tone === "warning" ? "bg-lone-warning" : p.tone === "danger" ? "bg-destructive" : "bg-muted";
                return (
                  <div key={p.id} className="rounded-xl border border-border bg-card p-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                        <span className="text-[10px] text-muted-foreground">{p.roleLabel}</span>
                      </div>
                      <div className="ml-2 shrink-0 text-right" title={`Score: ${p.scoreBasis}`}>
                        <span className={cn("text-2xl font-semibold tabular-nums", ring)}>{p.score == null ? "—" : p.score}</span>
                        {p.score != null && <span className="text-[10px] text-muted-foreground">/100</span>}
                      </div>
                    </div>
                    {p.score != null && (
                      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full transition-all duration-500", barBg)} style={{ width: `${Math.min(100, p.score)}%` }} />
                      </div>
                    )}
                    <div className="space-y-1">
                      {p.stats.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">{s.label}</span>
                          <span className="font-medium tabular-nums text-foreground">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Design: score = % de entregas no prazo. Social/Tráfego: score = saúde média da carteira —
              é uma leitura da CARTEIRA, não da pessoa: a satisfação do cliente também depende de tráfego,
              aprovação e do produto dele. Para desempenho por pessoa, use o Fechamento do mês acima.
            </p>
          </div>
        )}

        {isAdmin && <RelatoriosQuinzenais />}

        {/* ─── Como estamos — cockpit do servidor, contra o mês REALMENTE fechado ─── */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <TrendingUp size={12} className="text-primary" />
            Como estamos{cockpit.data?.atual?.periodo ? ` — ${cockpit.data.atual.periodo}` : ""}
          </h3>
          {cockpit.loading && <p className="text-xs text-muted-foreground">Calculando…</p>}
          {cockpit.erro && <p className="text-xs text-destructive">Não consegui carregar os números: {cockpit.erro}</p>}
          {cockpit.data && !cockpit.data.temComparacao && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">{cockpit.data.motivoSemComparacao}</p>
          )}
          {cockpit.data && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {cockpit.data.deltas.map((d) => {
                const boa = variacaoBoa(d);
                return (
                  <div key={d.chave} className="card p-4">
                    <p className="mb-1 text-[10px] text-muted-foreground">{d.rotulo}</p>
                    <div className="flex items-end gap-2">
                      <span className="text-lg font-semibold tabular-nums text-foreground">{valorOu(d.atual)}</span>
                      {d.variacaoPct !== null && (
                        <span className={cn("mb-0.5 flex items-center gap-0.5 text-[11px] font-medium", boa ? "text-lone-success" : "text-lone-warning")}>
                          {d.variacaoPct > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                          {Math.abs(d.variacaoPct).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    {d.semFonte && <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">{d.semFonte}</p>}
                    {d.variacaoPct === null && !d.semFonte && d.anterior === null && (
                      <p className="mt-1 text-[10px] text-muted-foreground/60">sem mês anterior pra comparar</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showExportMenu && <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />}
    </div>
  );
}

// Relatórios quinzenais da equipe (vieram da Área CEO). Visão da diretoria.
function RelatoriosQuinzenais() {
  const quinzReports = useOperationalStore((s) => s.quinzReports);
  const pronto = useOperationalStore((s) => s.initialized);
  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <FileText size={14} className="text-primary" /> Relatórios quinzenais
      </h3>
      {!pronto ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : quinzReports.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum relatório quinzenal preenchido ainda.</p>
      ) : quinzReports.map((report) => {
        const isGood = report.communicationHealth >= 4;
        const isBad = report.communicationHealth <= 2;
        return (
          <div key={report.id} className={`rounded-xl border p-4 ${isBad ? "border-lone-danger-border" : isGood ? "border-primary/20" : "border-border"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div>
                <h4 className="font-semibold text-foreground">{report.clientName}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Período: {report.period} · por {report.createdBy}</p>
              </div>
              <div className="flex items-start gap-4 text-center">
                <button
                  onClick={() => exportReportAsPdf({
                    title: "Relatório Quinzenal",
                    subtitle: report.period,
                    clientName: report.clientName,
                    period: report.period,
                    createdBy: report.createdBy,
                    createdAt: report.createdAt,
                    sections: [
                      { label: "Saúde da Comunicação", value: report.communicationHealth, type: "score" },
                      { label: "Engajamento do Cliente", value: report.clientEngagement, type: "score" },
                      { label: "Destaques", value: report.highlights, type: "text" },
                      { label: "Desafios", value: report.challenges, type: "text" },
                      { label: "Próximos Passos", value: report.nextSteps, type: "text" },
                    ],
                  })}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Exportar PDF"
                  aria-label="Exportar PDF"
                >
                  <Download size={14} />
                </button>
                <div>
                  <div className="flex gap-1 justify-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`w-4 h-4 rounded-sm ${n <= report.communicationHealth ? (isBad ? "bg-destructive" : "bg-primary") : "bg-muted"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Saúde da Comunicação</p>
                </div>
                <div>
                  <div className="flex gap-1 justify-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`w-4 h-4 rounded-sm ${n <= report.clientEngagement ? "bg-primary" : "bg-muted"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Engajamento do Cliente</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-primary font-medium mb-1">Destaques</p>
                <p className="text-muted-foreground leading-relaxed">{report.highlights}</p>
              </div>
              <div>
                <p className="text-xs text-lone-danger font-medium mb-1">Desafios</p>
                <p className="text-muted-foreground leading-relaxed">{report.challenges}</p>
              </div>
              <div>
                <p className="text-xs text-primary font-medium mb-1">Próximos Passos</p>
                <p className="text-muted-foreground leading-relaxed">{report.nextSteps}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
