"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useRole } from "@/lib/context/RoleContext";
import KanbanBoard, { type KanbanColumn } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/button";
import { CRM_ESTAGIOS, type CrmEstagio, type CrmLead } from "@/lib/types";
import { Plus, X, Search, TrendingUp, Wallet, Trophy, Percent, Receipt, CalendarClock, AlertCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Metadados do funil ──────────────────────────────────────────────
const ESTAGIO_META: Record<CrmEstagio, { title: string; color: string }> = {
  lead:      { title: "🆕 Novo lead", color: "bg-blue-500" },
  orcamento: { title: "💰 Orçamento",  color: "bg-amber-500" },
  proposta:  { title: "📄 Proposta",   color: "bg-violet-500" },
  reuniao:   { title: "📅 Reunião",    color: "bg-cyan-500" },
  ganho:     { title: "✅ Ganho",      color: "bg-emerald-500" },
  perdido:   { title: "❌ Perdido",    color: "bg-rose-500" },
};
const ABERTOS: CrmEstagio[] = ["lead", "orcamento", "proposta", "reuniao"];

// ─── Formatação ──────────────────────────────────────────────────────
const brl = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const brlCompact = (v: number) =>
  v >= 1000 ? `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v / 1000)}k` : brl(v);
const fmtData = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null);
const hojeYmd = () => new Date().toLocaleDateString("en-CA");
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

// Mês YYYY-MM de um ISO; rótulo pt-BR curto.
const mesDe = (iso: string) => iso.slice(0, 7);
const mesLabel = (ym: string) => {
  const d = new Date(`${ym}-15T12:00:00`);
  return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
};

type Draft = Partial<CrmLead> & { estagio: CrmEstagio };
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

// ─── KPI tile ────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: LucideIcon;
  label: string; value: string; sub?: string; tone?: "good" | "accent";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon size={13} /> {label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === "good" ? "text-emerald-500" : "text-foreground"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function CrmPage() {
  const { role, currentUser } = useRole();
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"funil" | "relatorios">("funil");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [fResp, setFResp] = useState("");
  const [fOrigem, setFOrigem] = useState("");

  const podeVer = role === "admin" || role === "manager" || role === "comercial";

  useEffect(() => {
    if (!podeVer) { setLoading(false); return; }
    authedFetch("/api/crm/leads")
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false));
  }, [podeVer]);

  // ─── KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const abertos = leads.filter((l) => ABERTOS.includes(l.estagio));
    const ganhos = leads.filter((l) => l.estagio === "ganho");
    const perdidos = leads.filter((l) => l.estagio === "perdido");
    const mesAtual = hojeYmd().slice(0, 7);
    const vendasMes = ganhos.filter((l) => l.fechadoEm && mesDe(l.fechadoEm) === mesAtual);
    const valorMes = vendasMes.reduce((s, l) => s + (l.valorOrcamento ?? 0), 0);
    const emJogo = abertos.reduce((s, l) => s + (l.valorOrcamento ?? 0), 0);
    const fechados = ganhos.length + perdidos.length;
    const conversao = fechados ? Math.round((ganhos.length / fechados) * 100) : null;
    const comValor = ganhos.filter((l) => l.valorOrcamento != null);
    const ticket = comValor.length ? comValor.reduce((s, l) => s + (l.valorOrcamento ?? 0), 0) / comValor.length : null;
    return { abertos: abertos.length, emJogo, vendasMes: vendasMes.length, valorMes, conversao, ticket };
  }, [leads]);

  // ─── Relatórios ────────────────────────────────────────────────────
  const relatorio = useMemo(() => {
    // Últimos 6 meses (YYYY-MM), do mais antigo pro atual.
    const meses: string[] = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 15);
      meses.push(d.toLocaleDateString("en-CA").slice(0, 7));
    }
    const ganhos = leads.filter((l) => l.estagio === "ganho" && l.fechadoEm);
    const porMes = meses.map((ym) => {
      const vs = ganhos.filter((l) => mesDe(l.fechadoEm!) === ym);
      return { ym, qtd: vs.length, valor: vs.reduce((s, l) => s + (l.valorOrcamento ?? 0), 0) };
    });
    const maxValor = Math.max(1, ...porMes.map((m) => m.valor));

    const agrupa = (chave: (l: CrmLead) => string | null) => {
      const grupos = new Map<string, { total: number; ganhos: number; valor: number }>();
      for (const l of leads) {
        const k = (chave(l) || "").trim() || "(sem)";
        const g = grupos.get(k) ?? { total: 0, ganhos: 0, valor: 0 };
        g.total++;
        if (l.estagio === "ganho") { g.ganhos++; g.valor += l.valorOrcamento ?? 0; }
        grupos.set(k, g);
      }
      return [...grupos.entries()].sort((a, b) => b[1].valor - a[1].valor || b[1].total - a[1].total);
    };
    const motivos = new Map<string, number>();
    for (const l of leads.filter((x) => x.estagio === "perdido")) {
      const m = (l.motivoPerda || "").trim() || "(não informado)";
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
    }
    return {
      porMes, maxValor,
      porOrigem: agrupa((l) => l.origem),
      porResponsavel: agrupa((l) => l.responsavel),
      motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [leads]);

  // ─── Funil filtrado ────────────────────────────────────────────────
  const responsaveis = useMemo(() => [...new Set(leads.map((l) => l.responsavel).filter(Boolean))] as string[], [leads]);
  const origens = useMemo(() => [...new Set(leads.map((l) => l.origem).filter(Boolean))] as string[], [leads]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return leads.filter((l) =>
      (!q || l.contatoNome.toLowerCase().includes(q) || (l.empresa ?? "").toLowerCase().includes(q)) &&
      (!fResp || l.responsavel === fResp) &&
      (!fOrigem || l.origem === fOrigem)
    );
  }, [leads, busca, fResp, fOrigem]);

  const columns: KanbanColumn<CrmLead>[] = useMemo(
    () =>
      CRM_ESTAGIOS.map((e) => {
        const items = filtrados.filter((l) => l.estagio === e);
        const valor = items.reduce((s, l) => s + (l.valorOrcamento ?? 0), 0);
        return {
          id: e,
          title: `${ESTAGIO_META[e].title}${valor > 0 ? ` · ${brlCompact(valor)}` : ""}`,
          color: ESTAGIO_META[e].color,
          items,
        };
      }),
    [filtrados]
  );

  // ─── Ações ─────────────────────────────────────────────────────────
  async function moverEstagio(id: string, _from: string, to: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estagio: to as CrmEstagio } : l)));
    const r = await authedFetch("/api/crm/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estagio: to }),
    }).catch(() => null);
    if (r?.ok) {
      const { lead } = await r.json();
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      // Caiu em "perdido" sem motivo → abre o modal pra registrar o porquê (alimenta o relatório).
      if (to === "perdido" && !lead.motivoPerda) setDraft({ ...lead });
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este lead? Essa ação não tem volta.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await authedFetch(`/api/crm/leads?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function salvar() {
    if (!draft?.contatoNome?.trim()) return;
    setSaving(true);
    const editando = !!draft.id;
    const payload = {
      ...(editando ? { id: draft.id } : {}),
      contatoNome: draft.contatoNome, empresa: draft.empresa ?? null, telefone: draft.telefone ?? null,
      email: draft.email ?? null, valorOrcamento: draft.valorOrcamento ?? null, estagio: draft.estagio,
      origem: draft.origem ?? null, responsavel: draft.responsavel ?? currentUser ?? null,
      reuniaoData: draft.reuniaoData ?? null, proximoContato: draft.proximoContato ?? null,
      observacoes: draft.observacoes ?? null, motivoPerda: draft.motivoPerda ?? null,
    };
    const r = await authedFetch("/api/crm/leads", {
      method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const { lead } = await r.json();
      setLeads((prev) => (editando ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]));
      setDraft(null);
    }
    setSaving(false);
  }

  if (!podeVer) return <div className="p-8 text-sm text-destructive">Esta área é do time comercial.</div>;
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando o funil…</div>;

  const hoje = hojeYmd();

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">🤝 Comercial</h1>
          <p className="text-sm text-muted-foreground">Funil de prospecção e relatório de vendas</p>
        </div>
        <Button onClick={() => setDraft({ estagio: "lead", responsavel: currentUser ?? undefined })}>
          <Plus size={16} className="mr-1" /> Novo lead
        </Button>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={TrendingUp} label="Leads ativos" value={String(kpis.abertos)} sub="no funil agora" />
        <Kpi icon={Wallet} label="Em jogo" value={brl(kpis.emJogo)} sub="orçamentos em aberto" />
        <Kpi icon={Trophy} label="Vendas no mês" value={brl(kpis.valorMes)} sub={`${kpis.vendasMes} ${kpis.vendasMes === 1 ? "venda fechada" : "vendas fechadas"}`} tone="good" />
        <Kpi icon={Percent} label="Conversão" value={kpis.conversao == null ? "—" : `${kpis.conversao}%`} sub="dos leads fechados" />
        <Kpi icon={Receipt} label="Ticket médio" value={brl(kpis.ticket)} sub="das vendas ganhas" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["funil", "Funil"], ["relatorios", "Relatórios"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === id ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "funil" && (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className={`${inputCls} w-56 pl-8`} placeholder="Buscar contato ou empresa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <select className={`${inputCls} w-auto`} value={fResp} onChange={(e) => setFResp(e.target.value)}>
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className={`${inputCls} w-auto`} value={fOrigem} onChange={(e) => setFOrigem(e.target.value)}>
              <option value="">Todas as origens</option>
              {origens.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {(busca || fResp || fOrigem) && (
              <button className="text-xs text-muted-foreground underline" onClick={() => { setBusca(""); setFResp(""); setFOrigem(""); }}>limpar</button>
            )}
          </div>

          <KanbanBoard<CrmLead>
            columns={columns}
            onMove={moverEstagio}
            onAdd={(colId) => setDraft({ estagio: colId as CrmEstagio, responsavel: currentUser ?? undefined })}
            onEdit={(lead) => setDraft({ ...lead })}
            onDelete={excluir}
            renderCard={(l) => {
              const reuniaoPassou = l.reuniaoData && l.reuniaoData < hoje && ABERTOS.includes(l.estagio);
              const followAtrasado = l.proximoContato && l.proximoContato < hoje && ABERTOS.includes(l.estagio);
              return (
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{l.contatoNome}</div>
                      {l.empresa && <div className="truncate text-xs text-muted-foreground">{l.empresa}</div>}
                    </div>
                    {l.valorOrcamento != null && (
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-500">{brlCompact(l.valorOrcamento)}</span>
                    )}
                  </div>
                  {(l.reuniaoData || l.proximoContato || l.origem) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {l.reuniaoData && (
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${reuniaoPassou ? "bg-rose-500/10 text-rose-500" : "bg-cyan-500/10 text-cyan-500"}`}>
                          <CalendarClock size={10} /> {fmtData(l.reuniaoData)}{reuniaoPassou ? " (passou)" : ""}
                        </span>
                      )}
                      {followAtrasado && (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-500">
                          <AlertCircle size={10} /> follow-up atrasado
                        </span>
                      )}
                      {l.origem && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{l.origem}</span>}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    {l.responsavel ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">{iniciais(l.responsavel)}</span>
                        {l.responsavel.split(" ")[0]}
                      </span>
                    ) : <span />}
                    <span className="text-[10px] text-muted-foreground" title="dias desde a última atualização">há {diasDesde(l.updatedAt)}d</span>
                  </div>
                  {l.estagio === "perdido" && l.motivoPerda && (
                    <div className="mt-1.5 truncate text-[10px] italic text-rose-500/80">✕ {l.motivoPerda}</div>
                  )}
                </div>
              );
            }}
          />
        </>
      )}

      {tab === "relatorios" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Vendas por mês — barras (valores rotulados; hover = detalhe) */}
          <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-foreground">Vendas por mês (R$)</h2>
            <p className="text-xs text-muted-foreground">Soma dos orçamentos dos leads GANHOS, pelo mês do fechamento — últimos 6 meses</p>
            <div className="mt-4 flex h-44 items-end gap-4 border-b border-border pb-px">
              {relatorio.porMes.map((m) => {
                const atual = m.ym === hoje.slice(0, 7);
                return (
                  <div key={m.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    title={`${mesLabel(m.ym)}/${m.ym.slice(0, 4)} — ${brl(m.valor)} · ${m.qtd} ${m.qtd === 1 ? "venda" : "vendas"}`}>
                    {m.valor > 0 && <span className={`text-[10px] ${atual ? "font-bold text-foreground" : "text-muted-foreground"}`}>{brlCompact(m.valor)}</span>}
                    <div
                      className={`w-full max-w-12 rounded-t ${m.valor > 0 ? "bg-primary" : "bg-muted"}`}
                      style={{ height: m.valor > 0 ? `${Math.max(4, (m.valor / relatorio.maxValor) * 100)}%` : "2px" }}
                    />
                    <span className={`text-[11px] ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{mesLabel(m.ym)}</span>
                  </div>
                );
              })}
            </div>
            {/* Tabela (visão acessível dos mesmos dados) */}
            <table className="mt-4 w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 font-medium">Mês</th><th className="py-1 font-medium">Vendas</th>
                  <th className="py-1 font-medium">Valor</th><th className="py-1 font-medium">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.porMes.map((m) => (
                  <tr key={m.ym} className="border-t border-border text-foreground">
                    <td className="py-1.5 capitalize">{mesLabel(m.ym)}/{m.ym.slice(2, 4)}</td>
                    <td className="py-1.5">{m.qtd}</td>
                    <td className="py-1.5 font-medium">{brl(m.valor)}</td>
                    <td className="py-1.5">{m.qtd ? brl(m.valor / m.qtd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Por origem */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Por origem</h2>
            {relatorio.porOrigem.length === 0 ? <p className="text-xs text-muted-foreground">Sem leads ainda.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Origem</th><th className="py-1 font-medium">Leads</th><th className="py-1 font-medium">Ganhos</th><th className="py-1 font-medium">Valor ganho</th></tr></thead>
                <tbody>
                  {relatorio.porOrigem.map(([k, g]) => (
                    <tr key={k} className="border-t border-border text-foreground">
                      <td className="py-1.5">{k}</td><td className="py-1.5">{g.total}</td>
                      <td className="py-1.5">{g.ganhos}{g.total ? ` (${Math.round((g.ganhos / g.total) * 100)}%)` : ""}</td>
                      <td className="py-1.5 font-medium">{brl(g.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Por responsável */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Por responsável</h2>
            {relatorio.porResponsavel.length === 0 ? <p className="text-xs text-muted-foreground">Sem leads ainda.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">SDR</th><th className="py-1 font-medium">Leads</th><th className="py-1 font-medium">Ganhos</th><th className="py-1 font-medium">Valor ganho</th></tr></thead>
                <tbody>
                  {relatorio.porResponsavel.map(([k, g]) => (
                    <tr key={k} className="border-t border-border text-foreground">
                      <td className="py-1.5">{k}</td><td className="py-1.5">{g.total}</td>
                      <td className="py-1.5">{g.ganhos}{g.total ? ` (${Math.round((g.ganhos / g.total) * 100)}%)` : ""}</td>
                      <td className="py-1.5 font-medium">{brl(g.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Motivos de perda */}
          <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Motivos de perda</h2>
            {relatorio.motivos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum lead perdido — bora manter assim. 🎯</p> : (
              <div className="flex flex-wrap gap-2">
                {relatorio.motivos.map(([m, n]) => (
                  <span key={m} className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground">
                    {m} <span className="ml-1 rounded bg-rose-500/10 px-1.5 text-[10px] font-semibold text-rose-500">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal add/editar */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDraft(null)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{draft.id ? "Editar lead" : "Novo lead"}</h2>
              <button onClick={() => setDraft(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Contato *</label>
                <input className={inputCls} value={draft.contatoNome ?? ""} onChange={(e) => setDraft({ ...draft, contatoNome: e.target.value })} placeholder="Nome de quem você falou" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Empresa</label>
                  <input className={inputCls} value={draft.empresa ?? ""} onChange={(e) => setDraft({ ...draft, empresa: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Valor do orçamento (R$)</label>
                  <input type="number" className={inputCls} value={draft.valorOrcamento ?? ""} onChange={(e) => setDraft({ ...draft, valorOrcamento: e.target.value === "" ? null : Number(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Telefone</label>
                  <input className={inputCls} value={draft.telefone ?? ""} onChange={(e) => setDraft({ ...draft, telefone: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">E-mail</label>
                  <input className={inputCls} value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Etapa</label>
                  <select className={inputCls} value={draft.estagio} onChange={(e) => setDraft({ ...draft, estagio: e.target.value as CrmEstagio })}>
                    {CRM_ESTAGIOS.map((e) => <option key={e} value={e}>{ESTAGIO_META[e].title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Origem</label>
                  <input className={inputCls} value={draft.origem ?? ""} onChange={(e) => setDraft({ ...draft, origem: e.target.value })} placeholder="indicação, tráfego…" list="crm-origens" />
                  <datalist id="crm-origens">{origens.map((o) => <option key={o} value={o} />)}</datalist>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Data da reunião</label>
                  <input type="date" className={inputCls} value={draft.reuniaoData ?? ""} onChange={(e) => setDraft({ ...draft, reuniaoData: e.target.value || null })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Próximo contato (follow-up)</label>
                  <input type="date" className={inputCls} value={draft.proximoContato ?? ""} onChange={(e) => setDraft({ ...draft, proximoContato: e.target.value || null })} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Responsável</label>
                <input className={inputCls} value={draft.responsavel ?? ""} onChange={(e) => setDraft({ ...draft, responsavel: e.target.value })} />
              </div>
              {draft.estagio === "perdido" && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Motivo da perda *</label>
                  <input className={inputCls} value={draft.motivoPerda ?? ""} onChange={(e) => setDraft({ ...draft, motivoPerda: e.target.value })} placeholder="preço, timing, concorrente…" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Observações</label>
                <textarea className={inputCls} rows={3} value={draft.observacoes ?? ""} onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })} />
              </div>
              {draft.fechadoEm && (
                <p className="text-[11px] text-muted-foreground">Fechado em {new Date(draft.fechadoEm).toLocaleDateString("pt-BR")} — conta no relatório desse mês.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={saving || !draft.contatoNome?.trim()}>{saving ? "Salvando…" : draft.id ? "Salvar" : "Criar lead"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
