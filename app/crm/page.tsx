"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import KanbanBoard, { type KanbanColumn } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/button";
import { CRM_ESTAGIOS, type CrmEstagio, type CrmLead, type CrmLeadActivity, type CrmAtividadeTipo } from "@/lib/types";
import { Plus, X, Search, TrendingUp, Trophy, Percent, CalendarClock, AlertCircle, MessageCircle, Phone, Mail, StickyNote, ArrowRight, Send, LayoutDashboard, Columns3, CalendarDays, BarChart3, Sun, FileText, Download } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ExtrasLead } from "@/lib/crm/extras";
import { proximoToque, rotuloToque, type ProximoToque } from "@/lib/crm/cadencia";
import { PORTES, type QualificacaoLead } from "@/lib/crm/nota";
import { PACOTES_VENDA } from "@/lib/clients/conversao";
import { ROTULO_NICHO } from "@/lib/cs/nicho";
import { PACOTES_PROPOSTA } from "@/lib/crm/proposta";

// ─── Metadados do funil ──────────────────────────────────────────────
// Cores = tokens do design system (sóbrio, sem neon). Sem emoji.
const ESTAGIO_META: Record<CrmEstagio, { title: string; color: string }> = {
  lead:      { title: "Novo lead", color: "bg-muted-foreground" },
  orcamento: { title: "Orçamento", color: "bg-lone-warning" },
  proposta:  { title: "Proposta",  color: "bg-lone-info" },
  reuniao:   { title: "Reunião",   color: "bg-primary" },
  ganho:     { title: "Ganho",     color: "bg-lone-success" },
  perdido:   { title: "Perdido",   color: "bg-lone-danger" },
};
const ABERTOS: CrmEstagio[] = ["lead", "orcamento", "proposta", "reuniao"];

// Canais de venda (origem do lead) — padroniza o campo pra relatórios limpos por canal.
const CANAIS = ["Indicação", "Tráfego pago", "Instagram", "Prospecção ativa", "Site / formulário", "WhatsApp", "Evento / networking", "Parceria", "Outro"];

// ─── Formatação ──────────────────────────────────────────────────────
const fmtData = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null);
const hojeYmd = () => new Date().toLocaleDateString("en-CA");
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

// Cadência de follow-up (Leva 7C, N28): o toque do dia 2/5/12 contado pelas atividades do lead.
const toqueDo = (l: Partial<ExtrasLead> & { estagio: string; createdAt: string }, hoje: string): ProximoToque | null =>
  l.createdAt ? proximoToque({ estagio: l.estagio, inicio: l.cadenciaInicio ?? l.createdAt, toques: l.toques ?? [], hoje }) : null;
/** A data do follow-up que vale: a marcada à mão, ou a do toque da cadência. */
const dataFollow = (l: { proximoContato: string | null; estagio: string; createdAt: string } & Partial<ExtrasLead>, hoje: string): string | null => {
  const t = toqueDo(l, hoje);
  if (l.proximoContato && (!t || l.proximoContato <= t.data)) return l.proximoContato;
  return t?.data ?? l.proximoContato;
};
const COR_NOTA: Record<string, string> = {
  A: "border-lone-success-border bg-lone-success-bg text-lone-success",
  B: "border-lone-info-border bg-lone-info-bg text-lone-info",
  C: "border-lone-warning-border bg-lone-warning-bg text-lone-warning",
  NP: "border-border bg-muted text-muted-foreground",
};
function ChipNota({ l }: { l: Partial<ExtrasLead> }) {
  if (!l.nota) return null;
  return (
    <span title={`${l.notaOrigem === "prospeccao" ? "Da prospecção" : "Da qualificação"}${l.notaScore != null ? ` · ${l.notaScore}/100` : ""}`}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${COR_NOTA[l.nota] ?? COR_NOTA.NP}`}>
      {l.nota === "NP" ? "NP" : `Nota ${l.nota}`}
    </span>
  );
}

// Abre a conversa direto no WhatsApp Web logado no PC (send?phone= já cai na conversa; o wa.me
// pedia um clique extra). Só dígitos; assume DDI Brasil se não vier.
const waLink = (telefone: string | null | undefined): string | null => {
  if (!telefone) return null;
  let d = telefone.replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55")) d = `55${d}`;
  return `https://web.whatsapp.com/send?phone=${d}`;
};

// Ícone + rótulo por tipo de atividade (timeline do lead).
const ATIVIDADE_META: Record<CrmAtividadeTipo, { label: string; icon: LucideIcon }> = {
  nota:     { label: "Nota",     icon: StickyNote },
  ligacao:  { label: "Ligação",  icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  email:    { label: "E-mail",   icon: Mail },
  reuniao:  { label: "Reunião",  icon: CalendarClock },
  etapa:    { label: "Etapa",    icon: ArrowRight },
};

// Mês YYYY-MM de um ISO; rótulo pt-BR curto.
const mesDe = (iso: string) => iso.slice(0, 7);
const mesLabel = (ym: string) => {
  const d = new Date(`${ym}-15T12:00:00`);
  return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
};

// O lead como a rota devolve: as colunas de sempre + nota, toques da cadência e o cliente (Leva 7C).
type Lead = CrmLead & Partial<ExtrasLead>;
type Draft = Partial<Lead> & { estagio: CrmEstagio };
const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none";

// ─── KPI tile ────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: LucideIcon;
  label: string; value: string; sub?: string; tone?: "good" | "accent";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-lone-caption text-muted-foreground"><Icon size={13} /> {label}</div>
      <div className={`mt-1.5 text-lone-hero tracking-tight ${tone === "good" ? "text-lone-success" : "text-foreground"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-lone-caption text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function CrmPage() {
  const { role, currentUser } = useRole();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [tab, setTab] = useState<"hoje" | "dashboard" | "funil" | "agenda" | "relatorios">("hoje");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [convertendo, setConvertendo] = useState(false);
  const [busca, setBusca] = useState("");
  const [fResp, setFResp] = useState("");
  const [fOrigem, setFOrigem] = useState("");
  // Timeline do lead aberto no modal (histórico do SDR).
  const [atividades, setAtividades] = useState<CrmLeadActivity[]>([]);
  const [loadingAtiv, setLoadingAtiv] = useState(false);
  const [novaTipo, setNovaTipo] = useState<CrmAtividadeTipo>("nota");
  const [novoTexto, setNovoTexto] = useState("");
  // Leva 7C: segmentos do ICP (qualificação → nota A/B/C), conversão com pacote e ramo, proposta.
  const [segmentosIcp, setSegmentosIcp] = useState<string[]>([]);
  const [conversao, setConversao] = useState<{ pacote: string; nicho: string } | null>(null);
  const [qualificando, setQualificando] = useState<QualificacaoLead | null>(null);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [pacoteProposta, setPacoteProposta] = useState("lone_growth");
  const [propostaBusy, setPropostaBusy] = useState<"pdf" | "enviada" | null>(null);

  const podeVer = role === "admin" || role === "manager" || role === "comercial";

  useEffect(() => {
    if (!podeVer) { setLoading(false); return; }
    chamar<{ leads?: Lead[]; segmentosIcp?: string[] }>("/api/crm/leads").then((r) => {
      // Falha não vira funil vazio: mostra o erro no lugar dos números.
      if (!r.ok) { setErroCarga(r.erro); toast.error(r.erro ?? "Não consegui carregar os leads."); }
      else { setLeads(r.data?.leads ?? []); setSegmentosIcp(r.data?.segmentosIcp ?? []); }
      setLoading(false);
    });
  }, [podeVer]);

  // Sidebar secundária nativa: clicar num item seta pendingTab → troca a aba aqui;
  // setCurrentTab mantém o item ativo destacado na sidebar.
  const { pendingTab, setPendingTab, setCurrentTab } = useNav();
  useEffect(() => { setCurrentTab(tab); }, [tab, setCurrentTab]);
  useEffect(() => {
    if (!pendingTab) return;
    if (["hoje", "dashboard", "funil", "agenda", "relatorios"].includes(pendingTab)) {
      setTab(pendingTab as typeof tab);
    }
    setPendingTab("");
  }, [pendingTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── KPIs ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const abertos = leads.filter((l) => ABERTOS.includes(l.estagio));
    const ganhos = leads.filter((l) => l.estagio === "ganho");
    const perdidos = leads.filter((l) => l.estagio === "perdido");
    const mesAtual = hojeYmd().slice(0, 7);
    const vendasMes = ganhos.filter((l) => l.fechadoEm && mesDe(l.fechadoEm) === mesAtual);
    const reunioesMes = leads.filter((l) => l.reuniaoData && mesDe(l.reuniaoData) === mesAtual);
    const fechados = ganhos.length + perdidos.length;
    const conversao = fechados ? Math.round((ganhos.length / fechados) * 100) : null;
    // Proposta conta pela DATA de envio — nunca pelo valor (Leva 7C, N29).
    const propostasMes = leads.filter((l) => l.propostaEnviadaEm && mesDe(l.propostaEnviadaEm) === mesAtual).length;
    return { abertos: abertos.length, vendasMes: vendasMes.length, reunioesMes: reunioesMes.length, conversao, propostasMes };
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
      return { ym, qtd: vs.length };
    });
    const maxQtd = Math.max(1, ...porMes.map((m) => m.qtd));

    // Leads que ENTRARAM em cada mês (por created_at) — captação mês a mês, relatório separado.
    const leadsPorMes = meses.map((ym) => ({ ym, qtd: leads.filter((l) => (l.createdAt || "").slice(0, 7) === ym).length }));
    const maxLeadsMes = Math.max(1, ...leadsPorMes.map((m) => m.qtd));

    const agrupa = (chave: (l: Lead) => string | null) => {
      const grupos = new Map<string, { total: number; ganhos: number }>();
      for (const l of leads) {
        const k = (chave(l) || "").trim() || "(sem)";
        const g = grupos.get(k) ?? { total: 0, ganhos: 0 };
        g.total++;
        if (l.estagio === "ganho") g.ganhos++;
        grupos.set(k, g);
      }
      return [...grupos.entries()].sort((a, b) => b[1].ganhos - a[1].ganhos || b[1].total - a[1].total);
    };
    const motivos = new Map<string, number>();
    for (const l of leads.filter((x) => x.estagio === "perdido")) {
      const m = (l.motivoPerda || "").trim() || "(não informado)";
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
    }
    return {
      porMes, maxQtd, leadsPorMes, maxLeadsMes,
      porOrigem: agrupa((l) => l.origem),
      porResponsavel: agrupa((l) => l.responsavel),
      motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [leads]);

  // ─── Dashboard ─────────────────────────────────────────────────────
  const dashboard = useMemo(() => {
    const funil = CRM_ESTAGIOS.map((e) => ({ estagio: e, n: leads.filter((l) => l.estagio === e).length }));
    const maxFunil = Math.max(1, ...funil.map((f) => f.n));
    const origemMap = new Map<string, number>();
    for (const l of leads) { const k = (l.origem || "").trim() || "Sem origem"; origemMap.set(k, (origemMap.get(k) ?? 0) + 1); }
    const origem = [...origemMap.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
    // Leads por dia (últimos 14 dias).
    const dias: { d: string; n: number }[] = [];
    const base = new Date();
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const ymd = dt.toLocaleDateString("en-CA");
      dias.push({ d: ymd, n: leads.filter((l) => (l.createdAt || "").slice(0, 10) === ymd).length });
    }
    const maxDia = Math.max(1, ...dias.map((d) => d.n));
    return { funil, maxFunil, origem, dias, maxDia, totalLeads: leads.length };
  }, [leads]);

  // ─── Agenda (reuniões + follow-ups) ────────────────────────────────
  const agenda = useMemo(() => {
    const hj = hojeYmd();
    type Ev = { lead: Lead; data: string; tipo: "reuniao" | "follow" };
    const evs: Ev[] = [];
    for (const l of leads) {
      if (l.reuniaoData) evs.push({ lead: l, data: l.reuniaoData, tipo: "reuniao" });
      if (l.proximoContato && ABERTOS.includes(l.estagio)) evs.push({ lead: l, data: l.proximoContato, tipo: "follow" });
    }
    evs.sort((a, b) => a.data.localeCompare(b.data));
    const proximos = evs.filter((e) => e.data >= hj);
    const atrasados = evs.filter((e) => e.data < hj && ABERTOS.includes(e.lead.estagio));
    const porDia = new Map<string, Ev[]>();
    for (const e of evs) { const arr = porDia.get(e.data) ?? []; arr.push(e); porDia.set(e.data, arr); }
    return { proximos, atrasados, porDia };
  }, [leads]);

  // ─── Meus leads de hoje (a "home" do SDR) ──────────────────────────
  const hojeData = useMemo(() => {
    const hj = hojeYmd();
    const reunioesHoje = leads.filter((l) => l.reuniaoData === hj);
    // Follow-up = o "próximo contato" marcado à mão OU o toque da cadência (dia 2/5/12) que venceu.
    const followsPendentes = leads
      .filter((l) => {
        if (!ABERTOS.includes(l.estagio)) return false;
        if (l.proximoContato && l.proximoContato <= hj) return true;
        const t = toqueDo(l, hj);
        return !!t && t.situacao !== "futuro";
      })
      .sort((a, b) => (dataFollow(a, hj) || "").localeCompare(dataFollow(b, hj) || ""));
    // Parados: em etapa aberta e sem atualização há 5+ dias.
    const parados = leads
      .filter((l) => ABERTOS.includes(l.estagio) && diasDesde(l.updatedAt) >= 5)
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
    return { reunioesHoje, followsPendentes, parados };
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

  const columns: KanbanColumn<Lead>[] = useMemo(
    () =>
      CRM_ESTAGIOS.map((e) => {
        const items = filtrados.filter((l) => l.estagio === e);
        return {
          id: e,
          title: ESTAGIO_META[e].title,
          color: ESTAGIO_META[e].color,
          items,
        };
      }),
    [filtrados]
  );

  // Carrega a timeline quando abre um lead EXISTENTE no modal (novo lead ainda não tem id).
  useEffect(() => {
    if (!draft?.id) { setAtividades([]); return; }
    setLoadingAtiv(true);
    authedFetch(`/api/crm/activities?leadId=${draft.id}`)
      .then((r) => (r.ok ? r.json() : { atividades: [] }))
      .then((d) => setAtividades(d.atividades ?? []))
      .finally(() => setLoadingAtiv(false));
  }, [draft?.id]);

  // ─── Ações ─────────────────────────────────────────────────────────
  async function registrarAtividade(tipo: CrmAtividadeTipo, texto: string, leadId?: string) {
    const id = leadId ?? draft?.id;
    if (!id || !texto.trim()) return;
    const r = await authedFetch("/api/crm/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id, tipo, texto: texto.trim(), autor: currentUser ?? null }),
    }).catch(() => null);
    if (r?.ok) {
      const { atividade } = await r.json();
      if (id === draft?.id) setAtividades((prev) => [atividade, ...prev]);
    }
  }

  function abrirWhatsApp(telefone: string | null | undefined, leadId?: string) {
    const link = waLink(telefone);
    if (!link) return;
    window.open(link, "_blank");
    if (leadId) registrarAtividade("whatsapp", "WhatsApp iniciado", leadId); // registra na timeline
  }

  async function moverEstagio(id: string, _from: string, to: string) {
    const snapshot = leads; // pra reverter se o banco recusar
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estagio: to as CrmEstagio } : l)));
    try {
      const r = await authedFetch("/api/crm/leads", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estagio: to }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { lead } = await r.json();
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
      // Caiu em "perdido" sem motivo → abre o modal pra registrar o porquê (alimenta o relatório).
      if (to === "perdido" && !lead.motivoPerda) setDraft({ ...lead });
    } catch {
      setLeads(snapshot); // reverte: o card não muda de coluna se o banco não confirmou
      toast.error("Não foi possível mover o lead. Tente de novo.");
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este lead? Essa ação não tem volta.")) return;
    const snapshot = leads;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    try {
      const r = await authedFetch(`/api/crm/leads?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("Lead excluído.");
    } catch {
      setLeads(snapshot); // volta o lead pra lista se o delete falhou
      toast.error("Não foi possível excluir. Tente de novo.");
    }
  }

  async function salvar() {
    if (!draft?.contatoNome?.trim()) { toast.error("Informe o nome do contato."); return; }
    // Motivo da perda é obrigatório ao fechar como perdido (senão o relatório de perda esvazia).
    if (draft.estagio === "perdido" && !draft.motivoPerda?.trim()) {
      toast.error("Informe o motivo da perda antes de salvar.");
      return;
    }
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
    try {
      const r = await authedFetch("/api/crm/leads", {
        method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { lead } = await r.json();
      setLeads((prev) => (editando ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]));
      setDraft(null);
      toast.success(editando ? "Lead atualizado." : "Lead criado.");
    } catch {
      toast.error("Não foi possível salvar o lead. Tente de novo.");
    } finally {
      setSaving(false); // sempre libera o botão — antes, um erro deixava preso em 'Salvando…'
    }
  }

  // Ganho → vira cliente: cria o cliente rascunho + link de onboarding a partir dos dados do lead,
  // registra na timeline e já abre o WhatsApp do lead com o link. Antes, ao ganhar, o SDR tinha que
  // recadastrar tudo do zero em outro lugar.
  async function converterEmCliente() {
    if (!draft?.id || convertendo || !conversao?.pacote || !conversao.nicho) return;
    setConvertendo(true);
    // authedFetch (não chamar): no 409 o corpo traz o cliente que já existe, e o chamar descarta corpo de erro.
    type RespConv = { clientId?: string; url?: string; jaConvertido?: boolean; avisos?: string[]; error?: string };
    let status = 0;
    let corpo: RespConv = {};
    try {
      const res = await authedFetch("/api/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_link_with_draft",
          name: (draft.empresa?.trim() || draft.contatoNome || "Cliente"),
          contactName: draft.contatoNome ?? null,
          industry: ROTULO_NICHO[conversao.nicho as keyof typeof ROTULO_NICHO] ?? "Outro",
          serviceType: conversao.pacote,
          nicho: conversao.nicho,
          leadId: draft.id, // handoff comercial→CS: o servidor re-lê o lead e carrega o contexto da venda
        }),
      });
      status = res.status;
      corpo = await res.json().catch(() => ({}));
    } catch { /* status 0: sem conexão */ }
    setConvertendo(false);
    if (status === 409) {
      // Conversão dupla barrada no servidor: o lead passa a apontar para o cliente que já existe.
      const clienteId = corpo.clientId ?? null;
      toast.error(corpo.error ?? "Este lead já virou cliente.");
      if (clienteId) {
        setLeads((prev) => prev.map((l) => (l.id === draft.id ? { ...l, clienteId } : l)));
        setDraft({ ...draft, clienteId });
      }
      setConversao(null);
      return;
    }
    if (status < 200 || status >= 300 || !corpo.clientId) { toast.error(corpo.error ?? (status ? "Não foi possível converter em cliente." : "Sem conexão com o servidor.")); return; }
    const clienteId = corpo.clientId;
    await registrarAtividade("nota", "Convertido em cliente — link de onboarding gerado, checklist e tarefas do grupo criados.", draft.id);
    setLeads((prev) => prev.map((l) => (l.id === draft.id ? { ...l, clienteId } : l)));
    const url = `${window.location.origin}${corpo.url ?? ""}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    toast.success("Cliente criado! Link de onboarding copiado.");
    if (corpo.avisos?.length) toast.warning(`Parte do setup falhou: ${corpo.avisos.join(" · ")}`);
    const wa = waLink(draft.telefone);
    if (wa) window.open(`${wa}${wa.includes("?") ? "&" : "?"}text=${encodeURIComponent("Boas-vindas! Pra começarmos, preencha seu onboarding: " + url)}`, "_blank");
    setConversao(null);
    setDraft(null);
  }

  // Qualificação → nota A/B/C pela régua da prospecção (o servidor calcula e guarda).
  async function salvarQualificacao() {
    if (!draft?.id || !qualificando) return;
    setSalvandoNota(true);
    const r = await chamar<{ lead: Lead; avisoNota?: string | null }>("/api/crm/leads", { id: draft.id, qualificacao: qualificando }, { method: "PATCH" });
    setSalvandoNota(false);
    if (!r.ok || !r.data?.lead) { toast.error(r.erro ?? "Não consegui calcular a nota."); return; }
    if (r.data.avisoNota) { toast.warning(r.data.avisoNota); return; }
    const lead = r.data.lead;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
    setDraft((d) => (d && d.id === lead.id ? { ...d, nota: lead.nota, notaScore: lead.notaScore, notaOrigem: lead.notaOrigem, qualificacao: lead.qualificacao } : d));
    setQualificando(null);
    toast.success(lead.nota ? `Nota ${lead.nota}${lead.notaScore != null ? ` (${lead.notaScore}/100)` : ""}.` : "Qualificação salva.");
  }

  async function baixarProposta() {
    if (!draft?.id) return;
    setPropostaBusy("pdf");
    try {
      const res = await authedFetch(`/api/crm/proposta?leadId=${draft.id}&pacote=${pacoteProposta}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `erro ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposta-${(draft.empresa || draft.contatoNome || "lead").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(`Não consegui gerar a proposta: ${e instanceof Error ? e.message : "erro"}`);
    } finally { setPropostaBusy(null); }
  }

  async function marcarPropostaEnviada() {
    if (!draft?.id) return;
    setPropostaBusy("enviada");
    const r = await chamar<{ propostaEnviadaEm: string; avisos: string[] }>("/api/crm/proposta", { leadId: draft.id });
    setPropostaBusy(null);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui registrar."); return; }
    const em = r.data.propostaEnviadaEm;
    const estagio: CrmEstagio = ["lead", "orcamento", "reuniao"].includes(draft.estagio) ? "proposta" : draft.estagio;
    setLeads((prev) => prev.map((l) => (l.id === draft.id ? { ...l, propostaEnviadaEm: l.propostaEnviadaEm ?? em, estagio } : l)));
    setDraft({ ...draft, propostaEnviadaEm: draft.propostaEnviadaEm ?? em, estagio });
    if (r.data.avisos.length) toast.warning(r.data.avisos.join(" · "));
    else toast.success("Proposta registrada como enviada.");
  }

  // Trocar de lead fecha os painéis do anterior.
  useEffect(() => { setQualificando(null); setConversao(null); }, [draft?.id]);

  if (!podeVer) return <div className="p-8 text-sm text-destructive">Esta área é do time comercial.</div>;
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando o funil…</div>;
  if (erroCarga) return <div className="p-8 text-sm text-lone-danger">Não consegui carregar os leads: {erroCarga}</div>;

  const hoje = hojeYmd();

  return (
    <div className="space-y-5 p-6">
      {/* Header — pr-12 reserva o canto superior direito pro sino de notificações (fixo no AppShell). */}
      <header className="flex flex-wrap items-center justify-between gap-4 pr-12">
        <div>
          <h1 className="text-lone-h1 tracking-tight text-foreground">Comercial</h1>
          <p className="text-lone-caption text-muted-foreground">Prospecção, agenda e vendas</p>
        </div>
        <Button onClick={() => setDraft({ estagio: "lead", responsavel: currentUser ?? undefined })}>
          <Plus size={16} className="mr-1" /> Novo lead
        </Button>
      </header>

      {/* No desktop, a sidebar secundária NATIVA (Sidebar.tsx → SECONDARY_NAV["/crm"]) cuida da
          navegação — fica colada no rail principal. No mobile, abas horizontais. */}
      <div className="flex gap-1 overflow-x-auto border-b border-border lg:hidden">
            {([["hoje", "Hoje", Sun], ["dashboard", "Dashboard", LayoutDashboard], ["funil", "Funil", Columns3], ["agenda", "Agenda", CalendarDays], ["relatorios", "Relatórios", BarChart3]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-lone-body font-medium transition-colors ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

      {tab === "hoje" && (() => {
        const leadRow = (l: Lead, meta: string) => (
          <button key={l.id} onClick={() => setDraft({ ...l })} className="card-interactive flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left hover:border-primary/40">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lone-caption font-semibold text-primary">{iniciais(l.contatoNome)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lone-body font-medium text-foreground">{l.contatoNome}</span>
              <span className="block truncate text-lone-caption text-muted-foreground">{[l.empresa, meta].filter(Boolean).join(" · ")}</span>
            </span>
            {waLink(l.telefone) && (
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); abrirWhatsApp(l.telefone, l.id); }} className="inline-flex shrink-0 items-center gap-1 rounded bg-lone-success-bg px-2 py-1 text-lone-caption font-medium text-lone-success transition-opacity hover:opacity-80">
                <MessageCircle size={12} /> WhatsApp
              </span>
            )}
          </button>
        );
        const cols: { titulo: string; lista: Lead[]; vazio: string; tone: string; meta: (l: Lead) => string }[] = [
          { titulo: "Reuniões de hoje", lista: hojeData.reunioesHoje, vazio: "Nenhuma reunião marcada pra hoje.", tone: "bg-primary/10 text-primary", meta: () => "Reunião hoje" },
          { titulo: "Follow-ups pra fazer", lista: hojeData.followsPendentes, vazio: "Nada pendente por agora.", tone: "bg-lone-warning-bg text-lone-warning", meta: (l) => {
            const t = toqueDo(l, hojeYmd());
            return l.proximoContato && l.proximoContato <= hojeYmd() ? `Contato ${fmtData(l.proximoContato)}` : t ? rotuloToque(t) : `Contato ${fmtData(l.proximoContato)}`;
          } },
          { titulo: "Leads parados", lista: hojeData.parados, vazio: "Nada parado — fluxo em dia.", tone: "bg-lone-danger-bg text-lone-danger", meta: (l) => `parado há ${diasDesde(l.updatedAt)}d` },
        ];
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            {cols.map((c) => (
              <section key={c.titulo} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lone-h2 text-foreground">{c.titulo}</h2>
                  {c.lista.length > 0 && <span className={`rounded-full px-2 py-0.5 text-lone-eyebrow font-semibold ${c.tone}`}>{c.lista.length}</span>}
                </div>
                {c.lista.length === 0 ? <p className="text-lone-caption text-muted-foreground">{c.vazio}</p> : <div className="space-y-2">{c.lista.map((l) => leadRow(l, c.meta(l)))}</div>}
              </section>
            ))}
          </div>
        );
      })()}

      {tab === "dashboard" && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icon={TrendingUp} label="Leads ativos" value={String(kpis.abertos)} sub="no funil agora" />
            <Kpi icon={CalendarClock} label="Reuniões no mês" value={String(kpis.reunioesMes)} sub="marcadas neste mês" />
            <Kpi icon={Trophy} label="Ganhos no mês" value={String(kpis.vendasMes)} sub={kpis.vendasMes === 1 ? "lead fechado" : "leads fechados"} tone="good" />
            <Kpi icon={Percent} label="Conversão" value={kpis.conversao == null ? "—" : `${kpis.conversao}%`} sub="dos leads fechados" />
            <Kpi icon={FileText} label="Propostas no mês" value={String(kpis.propostasMes)} sub={kpis.propostasMes === 1 ? "proposta enviada" : "propostas enviadas"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Funil de conversão */}
            <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <h2 className="text-lone-h2 text-foreground">Funil de conversão</h2>
              <p className="text-lone-caption text-muted-foreground">Distribuição dos {dashboard.totalLeads} leads pelas etapas</p>
              <div className="mt-5 space-y-3">
                {dashboard.funil.map((f) => (
                  <div key={f.estagio} className="flex items-center gap-3">
                    <span className="flex w-24 shrink-0 items-center gap-2 text-lone-caption text-muted-foreground">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ESTAGIO_META[f.estagio].color}`} />
                      <span className="truncate">{ESTAGIO_META[f.estagio].title}</span>
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${ESTAGIO_META[f.estagio].color}`} style={{ width: `${Math.max(2, (f.n / dashboard.maxFunil) * 100)}%` }} />
                    </div>
                    <span className="w-6 shrink-0 text-right text-lone-body font-medium text-foreground">{f.n}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Origem dos leads */}
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lone-h2 text-foreground">Origem dos leads</h2>
              <p className="text-lone-caption text-muted-foreground">De onde vieram</p>
              <div className="mt-5 space-y-3">
                {dashboard.origem.length === 0 ? <p className="text-lone-caption text-muted-foreground">Sem leads ainda.</p> :
                  dashboard.origem.slice(0, 6).map((o, i) => {
                    const pct = dashboard.totalLeads ? Math.round((o.n / dashboard.totalLeads) * 100) : 0;
                    const op = [1, 0.72, 0.54, 0.4, 0.3, 0.22][i] ?? 0.22;
                    return (
                      <div key={o.k}>
                        <div className="mb-1 flex items-center justify-between text-lone-caption">
                          <span className="min-w-0 truncate text-foreground">{o.k}</span>
                          <span className="shrink-0 text-muted-foreground">{o.n} · {pct}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%`, opacity: op }} /></div>
                      </div>
                    );
                  })}
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Leads por dia */}
            <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <h2 className="text-lone-h2 text-foreground">Leads por dia</h2>
              <p className="text-lone-caption text-muted-foreground">Últimos 14 dias</p>
              <div className="mt-5 flex h-28 items-end gap-1.5">
                {dashboard.dias.map((d) => (
                  <div key={d.d} className="flex flex-1 flex-col items-center justify-end" title={`${fmtData(d.d)} — ${d.n} lead(s)`}>
                    <div className={`w-full rounded-t ${d.n > 0 ? "bg-primary" : "bg-muted"}`} style={{ height: d.n > 0 ? `${Math.max(8, (d.n / dashboard.maxDia) * 100)}%` : "3px" }} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-lone-caption text-muted-foreground"><span>{fmtData(dashboard.dias[0].d)}</span><span>hoje</span></div>
            </section>

            {/* Próximas reuniões */}
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-lone-h2 text-foreground">Próximas reuniões</h2>
              <div className="mt-4 space-y-2">
                {agenda.proximos.filter((e) => e.tipo === "reuniao").length === 0 ? (
                  <p className="text-lone-caption text-muted-foreground">Nenhuma reunião marcada.</p>
                ) : agenda.proximos.filter((e) => e.tipo === "reuniao").slice(0, 5).map((e) => (
                  <button key={e.lead.id} onClick={() => setDraft({ ...e.lead })} className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-background p-2 text-left transition-colors hover:border-primary/40">
                    <span className="flex flex-col items-center rounded-md bg-primary/10 px-2 py-1 text-primary">
                      <span className="text-lone-body font-semibold leading-none">{e.data.slice(8, 10)}</span>
                      <span className="text-lone-eyebrow uppercase">{mesLabel(e.data.slice(0, 7))}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-lone-body font-medium text-foreground">{e.lead.contatoNome}</span>
                      {e.lead.empresa && <span className="block truncate text-lone-caption text-muted-foreground">{e.lead.empresa}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

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

          <KanbanBoard<Lead>
            columns={columns}
            onMove={moverEstagio}
            onAdd={(colId) => setDraft({ estagio: colId as CrmEstagio, responsavel: currentUser ?? undefined })}
            onEdit={(lead) => setDraft({ ...lead })}
            onDelete={excluir}
            renderCard={(l) => {
              const reuniaoPassou = l.reuniaoData && l.reuniaoData < hoje && ABERTOS.includes(l.estagio);
              const followAtrasado = l.proximoContato && l.proximoContato < hoje && ABERTOS.includes(l.estagio);
              const toque = toqueDo(l, hoje);
              return (
                <div
                  onClick={() => setDraft({ ...l })}
                  className="cursor-pointer rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-lone-body font-medium text-foreground">{l.contatoNome}</div>
                      {l.empresa && <div className="truncate text-xs text-muted-foreground">{l.empresa}</div>}
                    </div>
                    <ChipNota l={l} />
                  </div>
                  {toque && (
                    <div className={`mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-lone-caption ${toque.situacao === "atrasado" ? "bg-lone-danger-bg text-lone-danger" : toque.situacao === "hoje" ? "bg-lone-warning-bg text-lone-warning" : "bg-muted text-muted-foreground"}`}>
                      <Phone size={10} aria-hidden="true" /> {rotuloToque(toque)}
                    </div>
                  )}
                  {l.clienteId && l.estagio === "ganho" && (
                    <div className="mt-2 text-lone-caption text-lone-success">Já é cliente</div>
                  )}
                  {(l.reuniaoData || l.proximoContato || l.origem) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {l.reuniaoData && (
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-lone-caption ${reuniaoPassou ? "bg-lone-danger-bg text-lone-danger" : "bg-lone-info-bg text-lone-info"}`}>
                          <CalendarClock size={10} /> {fmtData(l.reuniaoData)}{reuniaoPassou ? " (passou)" : ""}
                        </span>
                      )}
                      {followAtrasado && (
                        <span className="inline-flex items-center gap-1 rounded bg-lone-danger-bg px-1.5 py-0.5 text-lone-caption text-lone-danger">
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
                    <div className="flex items-center gap-2">
                      {waLink(l.telefone) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirWhatsApp(l.telefone, l.id); }}
                          title="Abrir conversa no WhatsApp"
                          className="inline-flex items-center gap-1 rounded bg-lone-success-bg px-1.5 py-0.5 text-lone-caption font-medium text-lone-success transition-opacity hover:opacity-80">
                          <MessageCircle size={11} /> WhatsApp
                        </button>
                      )}
                      <span className="text-lone-caption text-muted-foreground" title="dias desde a última atualização">há {diasDesde(l.updatedAt)}d</span>
                    </div>
                  </div>
                  {l.estagio === "perdido" && l.motivoPerda && (
                    <div className="mt-1.5 truncate text-lone-caption italic text-lone-danger">✕ {l.motivoPerda}</div>
                  )}
                </div>
              );
            }}
          />
        </>
      )}

      {tab === "agenda" && (() => {
        const now = new Date();
        const ano = now.getFullYear(), mes = now.getMonth();
        const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        const celulas: (number | null)[] = [];
        for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
        for (let d = 1; d <= diasNoMes; d++) celulas.push(d);
        const ymdDe = (d: number) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const evRow = (e: { lead: Lead; data: string; tipo: "reuniao" | "follow" }, i: number) => (
          <button key={i} onClick={() => setDraft({ ...e.lead })} className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-background p-2 text-left transition-colors hover:border-primary/40">
            <span className={`flex flex-col items-center rounded-md px-2 py-1 ${e.tipo === "reuniao" ? "bg-primary/10 text-primary" : "bg-lone-warning-bg text-lone-warning"}`}>
              <span className="text-lone-body font-semibold leading-none">{e.data.slice(8, 10)}</span>
              <span className="text-lone-eyebrow uppercase">{mesLabel(e.data.slice(0, 7))}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lone-body font-medium text-foreground">{e.lead.contatoNome}</span>
              <span className="block truncate text-lone-caption text-muted-foreground">{e.tipo === "reuniao" ? "Reunião" : "Follow-up"}{e.lead.empresa ? ` · ${e.lead.empresa}` : ""}</span>
            </span>
          </button>
        );
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
              <h2 className="text-lone-h2 capitalize text-foreground">{now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
              <div className="mt-5 grid grid-cols-7 gap-1 text-center">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => <div key={i} className="py-1 text-lone-eyebrow uppercase text-muted-foreground">{d}</div>)}
                {celulas.map((d, i) => {
                  if (d === null) return <div key={i} />;
                  const ymd = ymdDe(d);
                  const evs = agenda.porDia.get(ymd) ?? [];
                  const isHoje = ymd === hoje;
                  return (
                    <div key={i} className={`aspect-square rounded-lg border p-1 ${isHoje ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className={`text-lone-caption ${isHoje ? "font-semibold text-primary" : "text-foreground"}`}>{d}</div>
                      <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                        {evs.slice(0, 3).map((e, j) => <span key={j} title={e.lead.contatoNome} className={`h-1.5 w-1.5 rounded-full ${e.tipo === "reuniao" ? "bg-primary" : "bg-lone-warning"}`} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-4 text-lone-caption text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Reunião</span>
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-lone-warning" /> Follow-up</span>
              </div>
              <p className="mt-3 text-lone-caption text-muted-foreground">Para marcar uma reunião, abra o lead e preencha &quot;Data da reunião&quot;.</p>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              {agenda.atrasados.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-lone-eyebrow uppercase text-lone-danger">Atrasados ({agenda.atrasados.length})</p>
                  <div className="space-y-1.5">{agenda.atrasados.slice(0, 6).map(evRow)}</div>
                </div>
              )}
              <p className="mb-2 text-lone-eyebrow uppercase text-muted-foreground">Próximos</p>
              <div className="space-y-1.5">
                {agenda.proximos.length === 0 ? <p className="text-xs text-muted-foreground">Nada agendado.</p> : agenda.proximos.slice(0, 10).map(evRow)}
              </div>
            </section>
          </div>
        );
      })()}

      {tab === "relatorios" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Ganhos por mês (quantidade, pelo mês do fechamento) */}
          <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="text-lone-h2 text-foreground">Ganhos por mês</h2>
            <p className="text-lone-caption text-muted-foreground">Leads fechados como ganho, pelo mês do fechamento — últimos 6 meses</p>
            <div className="mt-4 flex h-32 items-end gap-4 border-b border-border pb-px">
              {relatorio.porMes.map((m) => {
                const atual = m.ym === hoje.slice(0, 7);
                return (
                  <div key={m.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${mesLabel(m.ym)}/${m.ym.slice(0, 4)} — ${m.qtd} ganho(s)`}>
                    {m.qtd > 0 && <span className={`text-lone-caption ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{m.qtd}</span>}
                    <div className={`w-full max-w-12 rounded-t ${m.qtd > 0 ? "bg-lone-success" : "bg-muted"}`} style={{ height: m.qtd > 0 ? `${Math.max(6, (m.qtd / relatorio.maxQtd) * 100)}%` : "3px" }} />
                    <span className={`text-lone-caption capitalize ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{mesLabel(m.ym)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Leads por mês (captação) */}
          <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="text-lone-h2 text-foreground">Leads por mês</h2>
            <p className="text-lone-caption text-muted-foreground">Quantos leads entraram em cada mês (pela data de cadastro) — últimos 6 meses</p>
            <div className="mt-4 flex h-32 items-end gap-4 border-b border-border pb-px">
              {relatorio.leadsPorMes.map((m) => {
                const atual = m.ym === hoje.slice(0, 7);
                return (
                  <div key={m.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${mesLabel(m.ym)}/${m.ym.slice(0, 4)} — ${m.qtd} lead(s)`}>
                    {m.qtd > 0 && <span className={`text-lone-caption ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{m.qtd}</span>}
                    <div className={`w-full max-w-12 rounded-t ${m.qtd > 0 ? "bg-primary" : "bg-muted"}`} style={{ height: m.qtd > 0 ? `${Math.max(6, (m.qtd / relatorio.maxLeadsMes) * 100)}%` : "3px" }} />
                    <span className={`text-lone-caption capitalize ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{mesLabel(m.ym)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Por origem */}
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Por origem</h2>
            {relatorio.porOrigem.length === 0 ? <p className="text-xs text-muted-foreground">Sem leads ainda.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Origem</th><th className="py-1 font-medium">Leads</th><th className="py-1 font-medium">Ganhos</th></tr></thead>
                <tbody>
                  {relatorio.porOrigem.map(([k, g]) => (
                    <tr key={k} className="border-t border-border text-foreground">
                      <td className="py-1.5">{k}</td><td className="py-1.5">{g.total}</td>
                      <td className="py-1.5">{g.ganhos}{g.total ? ` (${Math.round((g.ganhos / g.total) * 100)}%)` : ""}</td>
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
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">SDR</th><th className="py-1 font-medium">Leads</th><th className="py-1 font-medium">Ganhos</th></tr></thead>
                <tbody>
                  {relatorio.porResponsavel.map(([k, g]) => (
                    <tr key={k} className="border-t border-border text-foreground">
                      <td className="py-1.5">{k}</td><td className="py-1.5">{g.total}</td>
                      <td className="py-1.5">{g.ganhos}{g.total ? ` (${Math.round((g.ganhos / g.total) * 100)}%)` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Motivos de perda */}
          <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Motivos de perda</h2>
            {relatorio.motivos.length === 0 ? <p className="text-lone-caption text-muted-foreground">Nenhum lead perdido — bora manter assim.</p> : (
              <div className="flex flex-wrap gap-2">
                {relatorio.motivos.map(([m, n]) => (
                  <span key={m} className="rounded-lg border border-border bg-background px-2.5 py-1 text-lone-caption text-foreground">
                    {m} <span className="ml-1 rounded bg-lone-danger-bg px-1.5 text-lone-eyebrow font-semibold text-lone-danger">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal add/editar */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={() => setDraft(null)}>
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
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Empresa</label>
                <input className={inputCls} value={draft.empresa ?? ""} onChange={(e) => setDraft({ ...draft, empresa: e.target.value })} />
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
                  <label className="mb-1 block text-xs text-muted-foreground">Canal de venda</label>
                  <select className={inputCls} value={draft.origem ?? ""} onChange={(e) => setDraft({ ...draft, origem: e.target.value || null })}>
                    <option value="">Selecione o canal…</option>
                    {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
                    {draft.origem && !CANAIS.includes(draft.origem) && <option value={draft.origem}>{draft.origem} (antigo)</option>}
                  </select>
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
              {draft.createdAt && (
                <p className="text-lone-caption text-muted-foreground">Entrou em {new Date(draft.createdAt).toLocaleDateString("pt-BR")} — usado no relatório de leads por mês.</p>
              )}
              {draft.fechadoEm && (
                <p className="text-lone-caption text-muted-foreground">Fechado em {new Date(draft.fechadoEm).toLocaleDateString("pt-BR")} — conta no relatório desse mês.</p>
              )}

              {/* WhatsApp + Histórico do lead (só quando já existe — novo lead ainda não tem id) */}
              {draft.id && (
                <div className="border-t border-border pt-3">
                  {waLink(draft.telefone) && (
                    <button
                      type="button"
                      onClick={() => abrirWhatsApp(draft.telefone, draft.id)}
                      className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-lone-success-bg px-3 py-1.5 text-lone-caption font-medium text-lone-success transition-opacity hover:opacity-80">
                      <MessageCircle size={14} /> Abrir WhatsApp
                    </button>
                  )}
                  <label className="mb-1.5 block text-lone-caption font-medium text-muted-foreground">Histórico</label>
                  <div className="flex gap-2">
                    <select className={`${inputCls} w-auto shrink-0`} value={novaTipo} onChange={(e) => setNovaTipo(e.target.value as CrmAtividadeTipo)}>
                      {(["nota", "ligacao", "whatsapp", "email", "reuniao"] as CrmAtividadeTipo[]).map((t) => (
                        <option key={t} value={t}>{ATIVIDADE_META[t].label}</option>
                      ))}
                    </select>
                    <input
                      className={inputCls}
                      placeholder="Registrar (ex: liguei, caixa postal)"
                      value={novoTexto}
                      onChange={(e) => setNovoTexto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && novoTexto.trim()) { registrarAtividade(novaTipo, novoTexto); setNovoTexto(""); } }}
                    />
                    <Button size="sm" disabled={!novoTexto.trim()} onClick={() => { registrarAtividade(novaTipo, novoTexto); setNovoTexto(""); }}>
                      <Send size={14} />
                    </Button>
                  </div>
                  <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                    {loadingAtiv ? (
                      <p className="text-xs text-muted-foreground">Carregando…</p>
                    ) : atividades.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem histórico ainda — registre a primeira interação.</p>
                    ) : (
                      atividades.map((a) => {
                        const Icon = ATIVIDADE_META[a.tipo]?.icon ?? StickyNote;
                        return (
                          <div key={a.id} className="flex gap-2 text-xs">
                            <Icon size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="text-foreground">{a.texto}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {new Date(a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                {a.autor ? ` · ${a.autor.split(" ")[0]}` : ""}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* ── Nota A/B/C (Leva 7C, N28): a régua da prospecção aplicada ao lead ── */}
            {draft.id && (
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lone-caption font-medium text-muted-foreground">Nota do lead</span>
                  <span className="flex items-center gap-2">
                    <ChipNota l={draft} />
                    {!draft.nota && <span className="text-lone-caption text-muted-foreground">sem nota</span>}
                    {draft.notaOrigem !== "prospeccao" && !qualificando && (
                      <button type="button" onClick={() => setQualificando({ ...((draft.qualificacao as QualificacaoLead | null) ?? {}) })}
                        className="text-lone-caption text-primary hover:underline">{draft.nota ? "Refazer qualificação" : "Qualificar"}</button>
                    )}
                  </span>
                </div>
                {draft.notaOrigem === "prospeccao" && <p className="text-lone-caption text-muted-foreground">Nota da prospecção (a leitura completa do Piloto SDR).</p>}
                {qualificando && (
                  <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                    <p className="text-lone-caption text-muted-foreground">A mesma régua da prospecção. Deixe em branco o que não sabe — conta como não confirmado.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select className={inputCls} aria-label="Segmento" value={qualificando.segmento ?? ""} onChange={(e) => setQualificando({ ...qualificando, segmento: e.target.value || null })}>
                        <option value="">Segmento…</option>
                        {segmentosIcp.map((x) => <option key={x} value={x}>{x}</option>)}
                        <option value="Fora do ICP">Fora do ICP</option>
                      </select>
                      <select className={inputCls} aria-label="Porte" value={qualificando.porte ?? ""} onChange={(e) => setQualificando({ ...qualificando, porte: (e.target.value || null) as QualificacaoLead["porte"] })}>
                        <option value="">Porte…</option>
                        {PORTES.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
                      </select>
                      <input className={inputCls} type="number" min={0} placeholder="Seguidores no Instagram" aria-label="Seguidores no Instagram" value={qualificando.seguidores ?? ""} onChange={(e) => setQualificando({ ...qualificando, seguidores: e.target.value === "" ? null : Number(e.target.value) })} />
                      <input className={inputCls} type="number" min={0} step="0.5" placeholder="Posts por semana" aria-label="Posts por semana" value={qualificando.postsPorSemana ?? ""} onChange={(e) => setQualificando({ ...qualificando, postsPorSemana: e.target.value === "" ? null : Number(e.target.value) })} />
                      <input className={inputCls} type="number" min={0} max={5} step="0.1" placeholder="Nota no Google" aria-label="Nota no Google" value={qualificando.googleNota ?? ""} onChange={(e) => setQualificando({ ...qualificando, googleNota: e.target.value === "" ? null : Number(e.target.value) })} />
                      <input className={inputCls} type="number" min={0} placeholder="Avaliações no Google" aria-label="Avaliações no Google" value={qualificando.googleAvaliacoes ?? ""} onChange={(e) => setQualificando({ ...qualificando, googleAvaliacoes: e.target.value === "" ? null : Number(e.target.value) })} />
                      <input className={inputCls} type="number" min={1} placeholder="Unidades (lojas)" aria-label="Unidades" value={qualificando.unidades ?? ""} onChange={(e) => setQualificando({ ...qualificando, unidades: e.target.value === "" ? null : Number(e.target.value) })} />
                      <input className={inputCls} type="number" min={0} placeholder="Distância (km)" aria-label="Distância em km" value={qualificando.distanciaKm ?? ""} onChange={(e) => setQualificando({ ...qualificando, distanciaKm: e.target.value === "" ? null : Number(e.target.value) })} />
                      {([["anuncia", "Anuncia no Meta?"], ["decisor", "Falamos com quem decide?"], ["site", "Tem site?"]] as const).map(([k, rot]) => (
                        <select key={k} className={inputCls} aria-label={rot} value={qualificando[k] == null ? "" : qualificando[k] ? "sim" : "nao"}
                          onChange={(e) => setQualificando({ ...qualificando, [k]: e.target.value === "" ? null : e.target.value === "sim" })}>
                          <option value="">{rot}</option><option value="sim">Sim</option><option value="nao">Não</option>
                        </select>
                      ))}
                      <input className={inputCls} maxLength={2} placeholder="UF" aria-label="UF" value={qualificando.uf ?? ""} onChange={(e) => setQualificando({ ...qualificando, uf: e.target.value.toUpperCase() || null })} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={salvandoNota} onClick={salvarQualificacao}>{salvandoNota ? "Calculando…" : "Calcular nota"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setQualificando(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Proposta (Leva 7C, N29): PDF do diagnóstico, sem R$; conta a DATA de envio ── */}
            {draft.id && ["reuniao", "proposta", "orcamento"].includes(draft.estagio) && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <span className="text-lone-caption font-medium text-muted-foreground">Proposta</span>
                <div className="flex flex-wrap items-center gap-2">
                  {draft.prospectId && (
                    <>
                      <select className={`${inputCls} w-auto`} aria-label="Pacote da proposta" value={pacoteProposta} onChange={(e) => setPacoteProposta(e.target.value)}>
                        {Object.entries(PACOTES_PROPOSTA).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
                      </select>
                      <Button size="sm" variant="outline" disabled={!!propostaBusy} onClick={baixarProposta}>
                        <Download size={14} className="mr-1" /> {propostaBusy === "pdf" ? "Gerando…" : "Gerar PDF"}
                      </Button>
                    </>
                  )}
                  {draft.propostaEnviadaEm ? (
                    <span className="text-lone-caption text-muted-foreground">Enviada em {fmtData(draft.propostaEnviadaEm)}</span>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={!!propostaBusy} onClick={marcarPropostaEnviada}>
                      {propostaBusy === "enviada" ? "Registrando…" : "Marcar proposta enviada"}
                    </Button>
                  )}
                </div>
                {!draft.prospectId && <p className="text-lone-caption text-muted-foreground">O PDF sai do diagnóstico da prospecção — este lead foi cadastrado à mão.</p>}
              </div>
            )}

            {/* ── Converter em cliente (Leva 7C, N27): pacote e ramo antes de criar ── */}
            {conversao && draft.id && (
              <div className="mt-4 space-y-2 rounded-lg border border-lone-success-border bg-lone-success-bg p-3">
                <p className="text-lone-caption font-medium text-foreground">O que o cliente contratou?</p>
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputCls} aria-label="Pacote" value={conversao.pacote} onChange={(e) => setConversao({ ...conversao, pacote: e.target.value })}>
                    <option value="">Pacote…</option>
                    {PACOTES_VENDA.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
                  </select>
                  <select className={inputCls} aria-label="Ramo" value={conversao.nicho} onChange={(e) => setConversao({ ...conversao, nicho: e.target.value })}>
                    <option value="">Ramo (nicho)…</option>
                    {Object.entries(ROTULO_NICHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <p className="text-lone-caption text-muted-foreground">Cria o cliente, o link de cadastro, o checklist de onboarding e as tarefas do grupo do WhatsApp.</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!conversao.pacote || !conversao.nicho || convertendo} onClick={converterEmCliente}>
                    {convertendo ? "Convertendo…" : "Converter"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConversao(null)}>Cancelar</Button>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {draft.id && draft.estagio === "ganho" && (draft.clienteId ? (
                <a href={`/clients/${draft.clienteId}`}
                  className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-lone-success-border px-3 text-sm text-lone-success hover:bg-lone-success-bg">
                  <Trophy size={14} /> Já é cliente — abrir ficha
                </a>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setConversao({ pacote: "", nicho: "" })}
                  disabled={convertendo}
                  className="mr-auto flex items-center gap-1.5 border-lone-success-border text-lone-success hover:bg-lone-success-bg"
                >
                  <Trophy size={14} /> {convertendo ? "Convertendo…" : "Converter em cliente"}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={saving || !draft.contatoNome?.trim()}>{saving ? "Salvando…" : draft.id ? "Salvar" : "Criar lead"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
