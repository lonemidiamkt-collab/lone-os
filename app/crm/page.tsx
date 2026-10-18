"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import KanbanBoard, { type KanbanColumn } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/button";
import { CRM_ESTAGIOS, type CrmEstagio, type CrmLead, type CrmLeadActivity, type CrmAtividadeTipo } from "@/lib/types";
import Link from "next/link";
import { Plus, X, Search, Trophy, CalendarClock, AlertCircle, MessageCircle, Phone, Mail, StickyNote, ArrowRight, Send, LayoutDashboard, Columns3, CalendarDays, BarChart3, Sun, FileText, Download, MapPin, Upload, Target, SkipForward } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ExtrasLead } from "@/lib/crm/extras";
import { proximoToque, rotuloToque, TIPOS_TOQUE, type ProximoToque } from "@/lib/crm/cadencia";
import { montarFilaHoje, inicioDaCadencia } from "@/lib/crm/hoje";
import { waComTexto } from "@/lib/crm/modelos";
import { PORTES, type QualificacaoLead } from "@/lib/crm/nota";
import { PACOTES_VENDA } from "@/lib/clients/conversao";
import { ROTULO_NICHO } from "@/lib/cs/nicho";
import { PACOTES_PROPOSTA } from "@/lib/crm/proposta";
import { ETAPAS_ABERTAS, MOTIVOS_PERDA, ROTULO_ETAPA, CRITERIO_SAIDA, chanceDe, rotuloMotivo } from "@/lib/crm/etapas";
import { brl, calcularEsforco, calcularMeta, hojeSP, mesSP, type ResumoMeta } from "@/lib/crm/meta";
import { podeVerComercial } from "@/lib/crm/acesso";
import DashboardComercial, { type FiltroFunil } from "@/components/crm/DashboardComercial";
import HojeComercial from "@/components/crm/HojeComercial";
import { eventosDaAgenda, ROTULO_EVENTO, type Evento } from "@/lib/crm/agenda";
import MarcarReuniao from "@/components/crm/MarcarReuniao";
import ConectarGoogle from "@/components/crm/ConectarGoogle";
import { motivoLegivel } from "@/lib/google/credencial";
import { diaCurto, horaCurta, inicioDe, duracaoMin, mensagemVesperaLead, type ReuniaoBase, type Formato } from "@/lib/crm/reunioes";
import { Anel } from "@/components/crm/graficos";
import { useCascoComercial } from "@/lib/navegacao/use-casco";
import type { CrmMeta } from "@/lib/types";

// ─── Metadados do funil ──────────────────────────────────────────────
// Cores = tokens do design system (sóbrio, sem neon). Sem emoji.
// Rótulos e etapas abertas: fonte única em lib/crm/etapas.ts.
const COR_ETAPA: Record<CrmEstagio, string> = {
  novo: "bg-muted-foreground", contato: "bg-chart-2", diagnostico: "bg-lone-warning",
  proposta: "bg-lone-info", negociacao: "bg-primary", ganho: "bg-lone-success", perdido: "bg-lone-danger",
};
const ESTAGIO_META = Object.fromEntries(CRM_ESTAGIOS.map((e) => [e, { title: ROTULO_ETAPA[e], color: COR_ETAPA[e] }])) as Record<CrmEstagio, { title: string; color: string }>;
const ABERTOS: readonly CrmEstagio[] = ETAPAS_ABERTAS;

// Canais de venda (origem do lead) — padroniza o campo pra relatórios limpos por canal.
const CANAIS = ["Site", "Anúncio → site", "Visita — Rota Lagos", "Indicação", "Tráfego pago", "Instagram", "Prospecção ativa", "WhatsApp", "Evento / networking", "Parceria", "Pipeline de outubro", "Outro"];

// Título de cada aba no endereço do comercial (lá o casco já diz "Lone Comercial").
const TITULO_ABA: Record<"hoje" | "dashboard" | "funil" | "agenda" | "relatorios", { titulo: string; apoio: string }> = {
  hoje: { titulo: "Hoje", apoio: "O que fazer agora, na ordem que vende" },
  dashboard: { titulo: "Dashboard", apoio: "" },
  funil: { titulo: "Funil", apoio: "Todos os negócios, por etapa" },
  agenda: { titulo: "Agenda", apoio: "Reuniões e contatos marcados" },
  relatorios: { titulo: "Relatórios", apoio: "Ganhos, entrada de leads e motivos de perda" },
};

// ─── Formatação ──────────────────────────────────────────────────────
const fmtData = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null);
const hojeYmd = () => hojeSP();
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

// Cadência de follow-up (Leva 7C, N28): o toque do dia 2/5/12 contado pelas atividades do lead.
const toqueDo = (l: Partial<ExtrasLead> & { estagio: string; createdAt: string; retomarEm?: string | null; etapaDesde?: string | null }, hoje: string): ProximoToque | null =>
  l.createdAt ? proximoToque({ estagio: l.estagio, inicio: inicioDaCadencia({ ...l, id: "", contatoNome: "", empresa: null, telefone: null, origem: null }), toques: l.avancos ?? l.toques ?? [], hoje, retomarEm: l.retomarEm }) : null;
const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "Retomar em" no futuro: o lead está estacionado de propósito — fora do Hoje até a data. */
const estacionado = (l: { retomarEm?: string | null }, hoje: string) => !!l.retomarEm && l.retomarEm > hoje;
/** A data do follow-up que vale: a marcada à mão, ou a do toque da cadência. */
const dataFollow = (l: { proximoContato: string | null; estagio: string; createdAt: string; retomarEm?: string | null } & Partial<ExtrasLead>, hoje: string): string | null => {
  if (l.retomarEm && l.retomarEm <= hoje) return l.retomarEm;
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
  visita:   { label: "Visita",   icon: MapPin },
  pulado:   { label: "Pulado",   icon: SkipForward },
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
  // Meta do mês (MRR novo) e a janela de editar metas.
  // Metas por mês ("2026-10" → meta): o dashboard também olha o mês passado.
  const [metas, setMetas] = useState<Record<string, CrmMeta | null>>({});
  const meta = metas[mesSP()] ?? null;
  const setMeta = (m: CrmMeta | null) => setMetas((prev) => ({ ...prev, [mesSP()]: m }));
  const carregarMeta = useCallback((mes: string) => {
    setMetas((prev) => (mes in prev ? prev : { ...prev, [mes]: null }));
    chamar<{ meta: CrmMeta | null }>(`/api/crm/metas?mes=${mes}`).then((r) => { if (r.ok) setMetas((prev) => ({ ...prev, [mes]: r.data?.meta ?? null })); });
  }, []);
  // Relatórios: a linha da meta precisa da meta de cada um dos 6 meses.
  useEffect(() => {
    if (tab !== "relatorios") return;
    for (const ym of relatorio.meses) carregarMeta(ym);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Filtro que vem do dashboard ("Negócios parados", uma fatia da rosca…) para o Funil.
  const [filtroFunil, setFiltroFunil] = useState<FiltroFunil | null>(null);
  const [verTodosFechados, setVerTodosFechados] = useState(false);
  const [abaFicha, setAbaFicha] = useState<"resumo" | "historico" | "dados">("resumo");
  // Reuniões de venda (lib/crm/reunioes.ts) + o resto do Google Agenda da Lone, e a janela de marcar.
  type ReuniaoTela = ReuniaoBase & { googleEventId: string | null; pauta: string | null };
  type EventoGoogle = { id: string; titulo: string; inicio: string; fim: string; diaInteiro: boolean; link: string | null };
  const [reunioes, setReunioes] = useState<ReuniaoTela[]>([]);
  const [agendaGoogle, setAgendaGoogle] = useState<{ conectado: boolean; email: string | null; eventos: EventoGoogle[] }>({ conectado: false, email: null, eventos: [] });
  const [marcando, setMarcando] = useState<{ lead?: Lead | null; dia?: string | null } | null>(null);
  const [remarcando, setRemarcando] = useState<{ id: string; dia: string; hora: string; duracao: number } | null>(null);
  const carregarReunioes = useCallback(() => {
    chamar<{ reunioes: ReuniaoTela[]; google: { conectado: boolean; email: string | null; eventos: EventoGoogle[] } }>("/api/crm/reunioes").then((r) => {
      if (!r.ok || !r.data) return;
      setReunioes(r.data.reunioes);
      setAgendaGoogle({ conectado: r.data.google.conectado, email: r.data.google.email, eventos: r.data.google.eventos });
    });
  }, []);
  const [editMeta, setEditMeta] = useState<{ metaValor: string; metaContatosSemana: string; metaPropostasMes: string } | null>(null);
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  // Qual lead do Hoje está com uma ação em andamento.
  const [acaoBusy, setAcaoBusy] = useState<string | null>(null);

  const podeVer = podeVerComercial(role);
  const casco = useCascoComercial(); // em comercial.lonemidia.com as abas moram no cabeçalho do casco

  useEffect(() => {
    if (!podeVer) { setLoading(false); return; }
    carregarMeta(mesSP());
    carregarReunioes();
    chamar<{ leads?: Lead[]; segmentosIcp?: string[] }>("/api/crm/leads").then((r) => {
      // Falha não vira funil vazio: mostra o erro no lugar dos números.
      if (!r.ok) { setErroCarga(r.erro); toast.error(r.erro ?? "Não consegui carregar os leads."); }
      else { setLeads(r.data?.leads ?? []); setSegmentosIcp(r.data?.segmentosIcp ?? []); }
      setLoading(false);
    });
  }, [podeVer]);

  // Endereço com ?aba= (abas do casco do comercial) e ?lead= (a Rota abre o lead direto no funil).
  useEffect(() => {
    if (loading) return;
    const q = new URLSearchParams(window.location.search);
    const aba = q.get("aba");
    if (aba && ["hoje", "dashboard", "funil", "agenda", "relatorios"].includes(aba)) setTab(aba as typeof tab);
    const leadId = q.get("lead");
    const lead = leadId ? leads.find((l) => l.id === leadId) : null;
    if (lead) { setTab("funil"); setDraft({ ...lead }); }
    const voltaGoogle = q.get("google");
    if (voltaGoogle === "ok") toast.success(`Google Agenda conectado${q.get("email") ? ` (${q.get("email")})` : ""}. As reuniões novas já saem com Meet.`);
    if (voltaGoogle === "erro") toast.error(`O Google não conectou: ${motivoLegivel(q.get("motivo"))}`, { duration: 15_000 });
    if (aba || leadId || voltaGoogle) window.history.replaceState(null, "", window.location.pathname);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Meta do mês ───────────────────────────────────────────────────
  const resumoMeta = useMemo(() => calcularMeta({ leads, metaValor: meta?.metaValor ?? null, hoje: hojeYmd() }), [leads, meta]);
  const esforco = useMemo(() => calcularEsforco({
    toques: leads.flatMap((l) => l.toques ?? []), propostasEnviadasEm: leads.map((l) => l.propostaEnviadaEm), hoje: hojeYmd(),
  }), [leads]);

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
      return { ym, qtd: vs.length, valor: vs.reduce((t, l) => t + (l.valorOrcamento ?? 0), 0) };
    });
    const maxQtd = Math.max(1, ...porMes.map((m) => m.qtd));

    // Leads que ENTRARAM em cada mês (por created_at) — captação mês a mês, relatório separado.
    const leadsPorMes = meses.map((ym) => ({ ym, qtd: leads.filter((l) => (l.createdAt || "").slice(0, 7) === ym).length }));
    const maxLeadsMes = Math.max(1, ...leadsPorMes.map((m) => m.qtd));

    const agrupa = (chave: (l: Lead) => string | null, semValor: string) => {
      const grupos = new Map<string, { total: number; ganhos: number }>();
      for (const l of leads) {
        const k = (chave(l) || "").trim() || semValor;
        const g = grupos.get(k) ?? { total: 0, ganhos: 0 };
        g.total++;
        if (l.estagio === "ganho") g.ganhos++;
        grupos.set(k, g);
      }
      return [...grupos.entries()].sort((a, b) => b[1].ganhos - a[1].ganhos || b[1].total - a[1].total);
    };
    const motivos = new Map<string, number>();
    for (const l of leads.filter((x) => x.estagio === "perdido")) {
      const m = rotuloMotivo(l.motivoPerdaCodigo) ?? ((l.motivoPerda || "").trim() || "(não informado)");
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
    }
    return {
      porMes, maxQtd, meses, leadsPorMes, maxLeadsMes,
      porOrigem: agrupa((l) => l.origem, "Sem origem"),
      porResponsavel: agrupa((l) => l.responsavel, "Sem responsável"),
      motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [leads]);

  // ─── Próximo passo de um lead (dashboard e lista de oportunidades) ─────
  const proximoPasso = (l: Lead): { texto: string; alerta: boolean } => {
    const hj = hojeYmd();
    if (l.reuniaoData && l.reuniaoData >= hj) return { texto: `Reunião ${fmtData(l.reuniaoData)}`, alerta: false };
    if (estacionado(l, hj)) return { texto: `Retomar ${fmtData(l.retomarEm)}`, alerta: false };
    const t = toqueDo(l, hj);
    if (t) return { texto: rotuloToque(t), alerta: t.situacao !== "futuro" };
    if (l.proximoContato) return { texto: `Contato ${fmtData(l.proximoContato)}`, alerta: l.proximoContato <= hj };
    return { texto: "Definir próximo passo", alerta: true };
  };

  // ─── Agenda (reuniões + follow-ups) ────────────────────────────────
  const agenda = useMemo(() => eventosDaAgenda(leads, hojeYmd()), [leads]);

  // ─── Lista de trabalho do Hoje (lib/crm/hoje.ts) ───────────────────
  const fila = useMemo(() => montarFilaHoje(leads, hojeYmd()), [leads]);

  // ─── Funil filtrado ────────────────────────────────────────────────
  const responsaveis = useMemo(() => [...new Set(leads.map((l) => l.responsavel).filter(Boolean))] as string[], [leads]);
  const origens = useMemo(() => [...new Set(leads.map((l) => l.origem).filter(Boolean))] as string[], [leads]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ids = filtroFunil ? new Set(filtroFunil.ids) : null;
    return leads.filter((l) =>
      (!ids || ids.has(l.id)) &&
      (!q || l.contatoNome.toLowerCase().includes(q) || (l.empresa ?? "").toLowerCase().includes(q)) &&
      (!fResp || l.responsavel === fResp) &&
      (!fOrigem || l.origem === fOrigem)
    );
  }, [leads, busca, fResp, fOrigem, filtroFunil]);

  // Funil (redesign D3): só as 5 etapas ABERTAS viram coluna — cabem na tela; Ganho e Perdido vão para a
  // seção "Fechados" embaixo (e continuam no "Mover para" do cartão).
  const columns: KanbanColumn<Lead>[] = useMemo(
    () =>
      ABERTOS.map((e) => {
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
    if (draft.estagio === "perdido" && !draft.motivoPerdaCodigo && !draft.motivoPerda?.trim()) {
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
      motivoPerdaCodigo: draft.motivoPerdaCodigo ?? null, valorImplantacao: draft.valorImplantacao ?? null,
      probabilidade: draft.probabilidade ?? null, previsaoFechamento: draft.previsaoFechamento ?? null,
      retomarEm: draft.retomarEm ?? null, segmento: draft.segmento ?? null, cidade: draft.cidade ?? null,
      instagram: draft.instagram ?? null,
    };
    try {
      const r = await authedFetch("/api/crm/leads", {
        method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { lead, aviso } = await r.json();
      setLeads((prev) => (editando ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]));
      setDraft(null);
      if (aviso) toast.warning(aviso);
      else toast.success(editando ? "Lead atualizado." : "Lead criado.");
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
    const estagio: CrmEstagio = ["novo", "contato", "diagnostico"].includes(draft.estagio) ? "proposta" : draft.estagio;
    setLeads((prev) => prev.map((l) => (l.id === draft.id ? { ...l, propostaEnviadaEm: l.propostaEnviadaEm ?? em, estagio } : l)));
    setDraft({ ...draft, propostaEnviadaEm: draft.propostaEnviadaEm ?? em, estagio });
    if (r.data.avisos.length) toast.warning(r.data.avisos.join(" · "));
    else toast.success("Proposta registrada como enviada.");
  }

  // ─── Ações da lista do Hoje ─────────────────────────────────────────
  async function registrarToque(l: Lead, tipo: CrmAtividadeTipo, texto: string): Promise<boolean> {
    setAcaoBusy(l.id);
    const r = await chamar<{ atividade: CrmLeadActivity; lead: Lead | null }>("/api/crm/activities", { leadId: l.id, tipo, texto, autor: currentUser ?? null });
    setAcaoBusy(null);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui registrar."); return false; }
    const quando = r.data.atividade?.createdAt || new Date().toISOString();
    const contato = TIPOS_TOQUE.has(tipo);
    const movido = r.data.lead;
    setLeads((prev) => prev.map((x) => x.id !== l.id ? x : {
      ...x, ...(movido ?? {}),
      toques: contato ? [...(x.toques ?? []), quando] : x.toques,
      avancos: [...(x.avancos ?? []), quando],
      primeiroContatoEm: x.primeiroContatoEm ?? (contato ? quando : null),
    }));
    toast.success(tipo === "pulado" ? "Toque pulado — a régua seguiu." : movido?.estagio === "contato" && l.estagio === "novo" ? "Registrado. O lead foi para Contato feito." : "Registrado.");
    return true;
  }

  async function enviarWhatsApp(l: Lead, texto: string) {
    const link = waComTexto(l.telefone, texto);
    if (!link) { toast.error("Este lead não tem WhatsApp no cadastro."); return; }
    window.open(link, "_blank");
    await registrarToque(l, "whatsapp", `WhatsApp enviado pelo Hoje: “${texto.length > 160 ? `${texto.slice(0, 157)}…` : texto}”`);
  }

  async function patchLead(l: Lead, patch: Record<string, unknown>, ok: string) {
    setAcaoBusy(l.id);
    const r = await chamar<{ lead: Lead; aviso?: string | null }>("/api/crm/leads", { id: l.id, ...patch }, { method: "PATCH" });
    setAcaoBusy(null);
    if (!r.ok || !r.data?.lead) { toast.error(r.erro ?? "Não consegui salvar."); return; }
    setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...r.data!.lead } : x)));
    if (r.data.aviso) toast.warning(r.data.aviso); else toast.success(ok);
  }

  // Depois de marcar/remarcar/cancelar, o servidor mexe no lead (etapa, data da reunião): recarrega.
  function recarregarLeads() {
    chamar<{ leads?: Lead[] }>("/api/crm/leads").then((r) => { if (r.ok && r.data?.leads) setLeads(r.data.leads); });
  }
  async function reuniaoAcao(id: string, acao: "remarcar" | "cancelar" | "realizada" | "nao_veio", extra: Record<string, unknown> = {}) {
    if (acao === "cancelar" && !window.confirm("Cancelar esta reunião? O convite é cancelado no Google Agenda e o grupo é avisado.")) return false;
    const r = await chamar("/api/crm/reunioes", { id, acao, autor: currentUser ?? null, ...extra }, { method: "PATCH" });
    if (!r.ok) { toast.error(r.erro ?? "Não consegui atualizar a reunião."); return false; }
    toast.success(acao === "remarcar" ? "Reunião remarcada e avisada no grupo." : acao === "cancelar" ? "Reunião cancelada." : acao === "realizada" ? "Registrado: a reunião aconteceu." : "Registrado: não compareceu.");
    carregarReunioes(); recarregarLeads();
    return true;
  }

  async function salvarMeta() {
    if (!editMeta) return;
    setSalvandoMeta(true);
    const r = await chamar<{ meta: CrmMeta }>("/api/crm/metas", {
      mes: mesSP(), metaValor: editMeta.metaValor, metaContatosSemana: editMeta.metaContatosSemana, metaPropostasMes: editMeta.metaPropostasMes,
    }, { method: "PUT" });
    setSalvandoMeta(false);
    if (!r.ok || !r.data) { toast.error(r.erro ?? "Não consegui salvar a meta."); return; }
    setMeta(r.data.meta);
    setEditMeta(null);
    toast.success("Metas do mês salvas.");
  }
  const abrirMetas = () => setEditMeta({
    metaValor: meta?.metaValor != null ? String(meta.metaValor) : "",
    metaContatosSemana: meta?.metaContatosSemana != null ? String(meta.metaContatosSemana) : "",
    metaPropostasMes: meta?.metaPropostasMes != null ? String(meta.metaPropostasMes) : "",
  });

  // Trocar de lead fecha os painéis do anterior.
  useEffect(() => { setQualificando(null); setConversao(null); setAbaFicha("resumo"); }, [draft?.id]);
  // Esc fecha a ficha.
  const fichaAberta = !!draft;
  useEffect(() => {
    if (!fichaAberta) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setDraft(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [fichaAberta]);

  if (!podeVer) return <div className="p-8 text-sm text-destructive">Esta área é do time comercial.</div>;
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando o funil…</div>;
  if (erroCarga) return <div className="p-8 text-sm text-lone-danger">Não consegui carregar os leads: {erroCarga}</div>;

  const hoje = hojeYmd();

  return (
    <div className="space-y-5 p-6">
      {/* Cabeçalho por aba (redesign D1): no endereço do comercial cada aba tem o próprio título — o casco já
          diz "Lone Comercial". O Dashboard tem a saudação dele; aqui fica só o "Novo lead". */}
      {tab !== "dashboard" && <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lone-h1 tracking-tight text-foreground">{casco ? TITULO_ABA[tab].titulo : "Comercial"}</h1>
          <p className="text-lone-caption text-muted-foreground">{casco ? TITULO_ABA[tab].apoio : "Funil, metas e follow-up — só para quem cuida das vendas"}</p>
        </div>
        <div className="flex items-center gap-2">
          {!casco && (
            <Link href="/crm/importar" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent">
              <Upload size={15} /> Importar
            </Link>
          )}
          <Button onClick={() => setDraft({ estagio: "novo", responsavel: currentUser ?? undefined })}>
            <Plus size={16} className="mr-1" /> Novo lead
          </Button>
        </div>
      </header>}

      {/* No desktop, a sidebar secundária NATIVA (Sidebar.tsx → SECONDARY_NAV["/crm"]) cuida da
          navegação — fica colada no rail principal. No mobile, abas horizontais. */}
      {!casco && <div className="flex gap-1 overflow-x-auto border-b border-border lg:hidden">
            {([["hoje", "Hoje", Sun], ["dashboard", "Dashboard", LayoutDashboard], ["funil", "Funil", Columns3], ["agenda", "Agenda", CalendarDays], ["relatorios", "Relatórios", BarChart3]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-lone-body font-medium transition-colors ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>}

      {tab === "hoje" && (
        <HojeComercial
          fila={fila}
          leads={leads}
          hoje={hoje}
          resumoMeta={resumoMeta}
          ocupado={acaoBusy}
          onAbrir={(l) => setDraft({ ...l })}
          onEnviarWhatsApp={enviarWhatsApp}
          onRegistrar={registrarToque}
          onPatch={patchLead}
          onDefinirMeta={abrirMetas}
          onVerDashboard={() => setTab("dashboard")}
          reunioes={reunioes}
          onReuniao={reuniaoAcao}
          onMarcarReuniao={(l) => setMarcando({ lead: l })}
        />
      )}

      {tab === "dashboard" && (
        <DashboardComercial
          leads={leads}
          metas={metas}
          carregarMeta={carregarMeta}
          metaContatosSemana={meta?.metaContatosSemana ?? null}
          nome={currentUser ?? ""}
          proximoPasso={proximoPasso}
          onAbrirLead={(l) => setDraft({ ...l })}
          onDefinirMeta={(sugestao) => setEditMeta({
            metaValor: meta?.metaValor != null ? String(meta.metaValor) : String(sugestao),
            metaContatosSemana: meta?.metaContatosSemana != null ? String(meta.metaContatosSemana) : "",
            metaPropostasMes: meta?.metaPropostasMes != null ? String(meta.metaPropostasMes) : "",
          })}
          onIrPara={({ aba, filtro }) => { setFiltroFunil(filtro ?? null); setTab(aba); window.scrollTo({ top: 0 }); }}
          acao={(
            <Button size="sm" onClick={() => setDraft({ estagio: "novo", responsavel: currentUser ?? undefined })}>
              <Plus size={15} className="mr-1" /> Novo lead
            </Button>
          )}
        />
      )}

      {tab === "funil" && (() => {
        const campo = "h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none";
        const mesAtual = hoje.slice(0, 7);
        const fechados = filtrados.filter((l) => l.estagio === "ganho" || l.estagio === "perdido");
        const fechadosDoMes = fechados.filter((l) => (l.fechadoEm ?? l.updatedAt ?? "").slice(0, 7) === mesAtual);
        const listaFechados = verTodosFechados ? fechados : fechadosDoMes;
        return (
        <>
          {/* Filtros numa linha só */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className={`${campo} w-64 pl-8`} placeholder="Buscar empresa ou contato…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <select className={campo} value={fResp} onChange={(e) => setFResp(e.target.value)} aria-label="Responsável">
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className={campo} value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} aria-label="Origem">
              <option value="">Todas as origens</option>
              {origens.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {filtroFunil && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-lone-caption font-medium text-primary">
                {filtroFunil.rotulo} · {filtroFunil.ids.length}
                <button onClick={() => setFiltroFunil(null)} aria-label="Tirar o filtro" className="rounded-full hover:opacity-70"><X size={12} /></button>
              </span>
            )}
            {(busca || fResp || fOrigem || filtroFunil) && (
              <button className="text-xs text-muted-foreground underline" onClick={() => { setBusca(""); setFResp(""); setFOrigem(""); setFiltroFunil(null); }}>limpar</button>
            )}
            <span className="ml-auto text-lone-caption text-muted-foreground">{filtrados.filter((l) => ABERTOS.includes(l.estagio)).length} abertos · arraste o cartão para mudar de etapa</span>
          </div>

          <KanbanBoard<Lead>
            columns={columns}
            classeColuna="w-64 shrink-0 xl:w-auto xl:min-w-0 xl:flex-1"
            destinosExtras={[{ id: "ganho", title: ESTAGIO_META.ganho.title, color: ESTAGIO_META.ganho.color }, { id: "perdido", title: ESTAGIO_META.perdido.title, color: ESTAGIO_META.perdido.color }]}
            cabecalhoExtra={(col) => {
              const soma = col.items.reduce((s2, l) => s2 + (l.valorOrcamento ?? 0), 0);
              return soma > 0 ? <span className="ml-auto mr-1 text-lone-caption font-medium tabular-nums text-muted-foreground">{brl(soma)}</span> : null;
            }}
            onMove={moverEstagio}
            onAdd={(colId) => setDraft({ estagio: colId as CrmEstagio, responsavel: currentUser ?? undefined })}
            onEdit={(lead) => setDraft({ ...lead })}
            onDelete={excluir}
            renderCard={(l) => {
              const passo = proximoPasso(l);
              const toque = toqueDo(l, hoje);
              const atrasoForte = !!toque && toque.situacao === "atrasado" && toque.diasAtraso > 3;
              const corPasso = atrasoForte ? "bg-lone-danger-bg text-lone-danger" : passo.alerta ? "bg-lone-warning-bg text-lone-warning" : "bg-muted text-muted-foreground";
              const reuniaoPassou = l.reuniaoData && l.reuniaoData < hoje;
              return (
                <div onClick={() => setDraft({ ...l })}
                  className="cursor-pointer rounded-xl border border-border bg-background p-3 shadow-sm transition-colors hover:border-primary/40 dark:shadow-none">
                  <div className="flex items-start justify-between gap-2 pr-5">
                    <div className="min-w-0">
                      <div className="truncate text-lone-body font-medium text-foreground">{l.empresa || l.contatoNome}</div>
                      {l.empresa && l.contatoNome !== l.empresa && <div className="truncate text-lone-caption text-muted-foreground">{l.contatoNome}</div>}
                    </div>
                    <ChipNota l={l} />
                  </div>
                  {l.valorOrcamento != null && l.valorOrcamento > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-lone-body font-semibold tabular-nums text-foreground">{brl(l.valorOrcamento)}<span className="text-lone-caption font-normal text-muted-foreground">/mês</span></span>
                      <span className="ml-auto flex items-center gap-1 text-lone-caption tabular-nums text-muted-foreground">
                        <Anel tamanho="xs" pct={chanceDe(l) * 100} tom="primary" rotuloAcessivel={`Chance de ${Math.round(chanceDe(l) * 100)}%`} />
                        {Math.round(chanceDe(l) * 100)}%
                      </span>
                    </div>
                  )}
                  <div className={`mt-2 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-lone-caption ${reuniaoPassou ? "bg-lone-danger-bg text-lone-danger" : corPasso}`}>
                    <CalendarClock size={11} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{reuniaoPassou ? `Reunião de ${fmtData(l.reuniaoData)} passou` : passo.texto}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {l.responsavel ? (
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground" title={l.responsavel}>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">{iniciais(l.responsavel)}</span>
                        <span className="truncate">{l.cidade || l.responsavel.split(" ")[0]}</span>
                      </span>
                    ) : <span className="truncate text-[10.5px] text-muted-foreground">{l.cidade}</span>}
                    {waLink(l.telefone) && (
                      <button onClick={(e) => { e.stopPropagation(); abrirWhatsApp(l.telefone, l.id); }} title="Abrir conversa no WhatsApp"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-lone-success-bg px-1.5 py-0.5 text-lone-caption font-medium text-lone-success transition-opacity hover:opacity-80">
                        <MessageCircle size={11} /> WhatsApp
                      </button>
                    )}
                  </div>
                </div>
              );
            }}
          />

          {/* Fechados: ganhos e perdidos (do mês, ou todos) */}
          <section className="rounded-2xl border border-border bg-card shadow-sm dark:shadow-none">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <h2 className="text-lone-h2 text-foreground">Fechados</h2>
              <span className="text-lone-caption text-muted-foreground">
                {listaFechados.filter((l) => l.estagio === "ganho").length} ganhos · {listaFechados.filter((l) => l.estagio === "perdido").length} perdidos {verTodosFechados ? "(todos)" : "este mês"}
              </span>
              <button onClick={() => setVerTodosFechados((v) => !v)} className="ml-auto text-lone-caption text-primary hover:underline">{verTodosFechados ? "Só este mês" : "Ver todos"}</button>
            </div>
            {listaFechados.length === 0 ? (
              <p className="border-t border-border px-5 py-4 text-lone-caption text-muted-foreground">Nenhum negócio fechado {verTodosFechados ? "ainda" : "este mês"}.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {listaFechados.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => setDraft({ ...l })} className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-accent/50">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${ESTAGIO_META[l.estagio].color}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-lone-body text-foreground">{l.empresa || l.contatoNome}</span>
                      <span className={`shrink-0 text-lone-caption ${l.estagio === "ganho" ? "text-lone-success" : "text-lone-danger"}`}>
                        {l.estagio === "ganho" ? (l.clienteId ? "Ganho · já é cliente" : "Ganho") : `Perdido${rotuloMotivo(l.motivoPerdaCodigo) ? ` · ${rotuloMotivo(l.motivoPerdaCodigo)}` : ""}`}
                      </span>
                      {l.valorOrcamento != null && l.valorOrcamento > 0 && <span className="w-24 shrink-0 text-right text-lone-caption tabular-nums text-muted-foreground">{brl(l.valorOrcamento)}/mês</span>}
                      <span className="w-12 shrink-0 text-right text-lone-caption text-muted-foreground">{fmtData(l.fechadoEm)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
        );
      })()}

      {tab === "agenda" && (() => {
        const now = new Date(`${hoje}T12:00:00Z`);
        const ano = now.getUTCFullYear(), mes = now.getUTCMonth();
        const primeiroDiaSemana = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
        const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
        const celulas: (number | null)[] = [];
        for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
        for (let d = 1; d <= diasNoMes; d++) celulas.push(d);
        const ymdDe = (d: number) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const nomeMes = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
        const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const leadPorId = new Map(leads.map((l) => [l.id, l]));
        const agendadas = reunioes.filter((r) => r.estado === "agendada");
        const proximas = agendadas.filter((r) => Date.parse(r.fim) > Date.now());
        const semRegistro = agendadas.filter((r) => Date.parse(r.fim) <= Date.now());
        const corEvento = (t: Evento<Lead>["tipo"]) => (t === "reuniao" ? "bg-primary" : t === "retomar" ? "bg-chart-4" : "bg-lone-warning");
        const evRow = (e: Evento<Lead>, i: number, atrasado = false) => (
          <button key={`${e.lead.id}-${e.tipo}-${i}`} onClick={() => setDraft({ ...e.lead })} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left transition-colors hover:border-primary/40">
            <span className={`flex w-11 shrink-0 flex-col items-center rounded-lg px-2 py-1 ${atrasado ? "bg-lone-danger-bg text-lone-danger" : "bg-muted text-foreground"}`}>
              <span className="text-lone-body font-semibold leading-none tabular-nums">{e.data.slice(8, 10)}</span>
              <span className="text-[10px] uppercase">{mesLabel(e.data.slice(0, 7))}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lone-body font-medium text-foreground">{e.lead.empresa || e.lead.contatoNome}</span>
              <span className="flex items-center gap-1.5 truncate text-lone-caption text-muted-foreground"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${corEvento(e.tipo)}`} />{e.rotulo}{e.lead.cidade ? ` · ${e.lead.cidade}` : ""}</span>
            </span>
          </button>
        );
        const reuniaoRow = (r: ReuniaoTela, passou: boolean) => {
          const l = leadPorId.get(r.leadId);
          const editando = remarcando?.id === r.id;
          return (
            <div key={r.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start gap-3">
                <span className={`flex w-12 shrink-0 flex-col items-center rounded-lg px-1.5 py-1 ${passou ? "bg-lone-warning-bg text-lone-warning" : "bg-primary/10 text-primary"}`}>
                  <span className="text-lone-body font-semibold leading-none tabular-nums">{horaCurta(r.inicio)}</span>
                  <span className="mt-0.5 text-[10px] uppercase">{diaDe(r.inicio).slice(8, 10)}/{diaDe(r.inicio).slice(5, 7)}</span>
                </span>
                <button onClick={() => l && setDraft({ ...l })} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-lone-body font-medium text-foreground">{l ? l.empresa || l.contatoNome : "Lead"}</span>
                  <span className="block truncate text-lone-caption text-muted-foreground">{r.formato === "meet" ? "Google Meet" : r.formato === "presencial" ? `Presencial${r.local ? ` · ${r.local}` : ""}` : "Ligação"} · {duracaoMin(r)} min</span>
                </button>
              </div>
              {editando ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <input type="date" value={remarcando.dia} min={hoje} onChange={(e) => setRemarcando({ ...remarcando, dia: e.target.value })} className="h-8 rounded-lg border border-border bg-card px-2 text-[13px]" aria-label="Novo dia" />
                  <input type="time" step={900} value={remarcando.hora} onChange={(e) => setRemarcando({ ...remarcando, hora: e.target.value })} className="h-8 rounded-lg border border-border bg-card px-2 text-[13px]" aria-label="Novo horário" />
                  <button onClick={async () => { if (await reuniaoAcao(r.id, "remarcar", { inicio: inicioDe(remarcando.dia, remarcando.hora), duracao: remarcando.duracao })) setRemarcando(null); }} className="h-8 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground">Salvar</button>
                  <button onClick={() => setRemarcando(null)} className="h-8 px-2 text-[13px] text-muted-foreground">Cancelar</button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {passou ? (
                    <>
                      <span className="mr-1 text-lone-caption text-muted-foreground">Como foi?</span>
                      <button onClick={() => reuniaoAcao(r.id, "realizada")} className="h-7 rounded-lg bg-lone-success-bg px-2.5 text-[12px] font-medium text-lone-success">Aconteceu</button>
                      <button onClick={() => reuniaoAcao(r.id, "nao_veio")} className="h-7 rounded-lg border border-border px-2.5 text-[12px] text-foreground hover:bg-accent">Não veio</button>
                    </>
                  ) : (
                    <>
                      {r.meetUrl && <a href={r.meetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center rounded-lg bg-primary/10 px-2.5 text-[12px] font-medium text-primary hover:opacity-80">Entrar no Meet</a>}
                      <button onClick={() => setRemarcando({ id: r.id, dia: diaDe(r.inicio), hora: new Date(r.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }), duracao: duracaoMin(r) })} className="h-7 rounded-lg border border-border px-2.5 text-[12px] text-foreground hover:bg-accent">Remarcar</button>
                      <button onClick={() => reuniaoAcao(r.id, "cancelar")} className="h-7 rounded-lg px-2 text-[12px] text-muted-foreground hover:text-lone-danger">Cancelar</button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        };
        return (
          <div className="space-y-4">
            {!agendaGoogle.conectado && <ConectarGoogle onMudou={carregarReunioes} />}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {agendaGoogle.conectado ? <ConectarGoogle onMudou={carregarReunioes} /> : <span />}
              <button onClick={() => setMarcando({ dia: hoje })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><CalendarClock size={15} /> Nova reunião</button>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none lg:col-span-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lone-h2 text-foreground">{nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}</h2>
                  <span className="text-lone-caption text-muted-foreground">Clique num dia para marcar uma reunião</span>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
                  {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => <div key={i} className="py-1 text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{d}</div>)}
                  {celulas.map((d, i) => {
                    if (d === null) return <div key={i} />;
                    const ymd = ymdDe(d);
                    const evs = agenda.porDia.get(ymd) ?? [];
                    const rDia = agendadas.filter((r) => diaDe(r.inicio) === ymd);
                    const gDia = agendaGoogle.eventos.filter((e) => diaDe(e.inicio) === ymd);
                    const isHoje = ymd === hoje;
                    const passado = ymd < hoje;
                    const chips = [
                      ...rDia.map((r) => ({ k: r.id, cls: "bg-primary/15 text-primary", txt: `${horaCurta(r.inicio)} ${leadPorId.get(r.leadId)?.empresa || leadPorId.get(r.leadId)?.contatoNome || ""}` })),
                      ...gDia.map((e) => ({ k: e.id, cls: "bg-muted text-muted-foreground", txt: `${e.diaInteiro ? "" : `${horaCurta(e.inicio)} `}${e.titulo}` })),
                    ];
                    return (
                      <button key={i} type="button" disabled={passado} onClick={() => setMarcando({ dia: ymd })}
                        title={[...chips.map((c) => c.txt), ...evs.map((e) => `${e.rotulo}: ${e.lead.empresa || e.lead.contatoNome}`)].join("\n") || (passado ? undefined : "Marcar reunião neste dia")}
                        className={`flex min-h-[78px] flex-col gap-0.5 rounded-xl border p-1.5 text-left transition-colors ${isHoje ? "border-primary bg-primary/5" : "border-border"} ${passado ? "cursor-default opacity-60" : "hover:border-primary/50"}`}>
                        <span className={`text-lone-caption tabular-nums ${isHoje ? "font-semibold text-primary" : "text-foreground"}`}>{d}</span>
                        {chips.slice(0, 2).map((c) => <span key={c.k} className={`truncate rounded px-1 py-px text-[10px] font-medium ${c.cls}`}>{c.txt}</span>)}
                        {chips.length > 2 && <span className="text-[10px] text-muted-foreground">+{chips.length - 2}</span>}
                        {evs.length > 0 && (
                          <span className="mt-auto flex flex-wrap items-center gap-1">
                            {evs.slice(0, 4).map((e, j) => <span key={j} className={`h-1.5 w-1.5 rounded-full ${corEvento(e.tipo)}`} />)}
                            {evs.length > 4 && <span className="text-[10px] font-medium text-muted-foreground">+{evs.length - 4}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-lone-caption text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary/15" /> Reunião de venda</span>
                  {agendaGoogle.conectado && <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-muted" /> Outros compromissos do Google Agenda</span>}
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-lone-warning" /> Follow-up</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-chart-4" /> {ROTULO_EVENTO.retomar}</span>
                </div>
              </section>

              <div className="space-y-4">
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Reuniões · {proximas.length}</p>
                  {semRegistro.length > 0 && <div className="mb-3 space-y-2">{semRegistro.map((r) => reuniaoRow(r, true))}</div>}
                  <div className="space-y-2">
                    {proximas.length === 0 ? <p className="text-lone-caption text-muted-foreground">Nenhuma reunião marcada. Use “Nova reunião” ou clique num dia.</p> : proximas.slice(0, 8).map((r) => reuniaoRow(r, false))}
                  </div>
                </section>
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
                  {agenda.atrasados.length > 0 && (
                    <div className="mb-5">
                      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-lone-danger">Follow-ups atrasados · {agenda.atrasados.length}</p>
                      <div className="space-y-1.5">{agenda.atrasados.slice(0, 5).map((e, i) => evRow(e, i, true))}</div>
                      {agenda.atrasados.length > 5 && <button onClick={() => setTab("hoje")} className="mt-2 text-lone-caption text-primary hover:underline">Ver todos no Hoje →</button>}
                    </div>
                  )}
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Próximos follow-ups</p>
                  <div className="space-y-1.5">
                    {agenda.proximos.filter((e) => e.tipo !== "reuniao").length === 0 ? <p className="text-lone-caption text-muted-foreground">Nada agendado.</p> : agenda.proximos.filter((e) => e.tipo !== "reuniao").slice(0, 8).map((e, i) => evRow(e, i))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        );
      })()}

      {tab === "relatorios" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Ganhos por mês: mensalidade vendida pelo mês do fechamento, com a meta de cada mês tracejada */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none lg:col-span-2">
            <h2 className="text-lone-h2 text-foreground">Ganhos por mês</h2>
            <p className="text-lone-caption text-muted-foreground">Mensalidade (MRR novo) vendida em cada mês, pela data do fechamento — a linha tracejada é a meta do mês</p>
            {(() => {
              const metasMes = relatorio.porMes.map((m) => metas[m.ym]?.metaValor ?? null);
              const teto = Math.max(1, ...relatorio.porMes.map((m) => m.valor), ...metasMes.map((v) => v ?? 0));
              if (relatorio.porMes.every((m) => m.valor === 0) && metasMes.every((v) => v == null)) {
                return <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-lone-body text-muted-foreground">Nenhum contrato fechado nos últimos 6 meses ainda. Quando um negócio for para Ganho, a mensalidade aparece aqui, mês a mês, ao lado da meta.</p>;
              }
              return (
                <div className="mt-5 flex h-44 items-end gap-4 border-b border-border pb-px">
                  {relatorio.porMes.map((m, i) => {
                    const atual = m.ym === hoje.slice(0, 7);
                    const metaM = metasMes[i];
                    return (
                      <div key={m.ym} className="relative flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${mesLabel(m.ym)}/${m.ym.slice(0, 4)}: ${brl(m.valor)} em ${m.qtd} ${m.qtd === 1 ? "contrato" : "contratos"}${metaM ? ` · meta ${brl(metaM)}` : ""}`}>
                        {metaM != null && <div className="pointer-events-none absolute inset-x-1 border-t-2 border-dashed border-lone-warning" style={{ bottom: `calc(${(metaM / teto) * 78}% + 1.25rem)` }} />}
                        {m.valor > 0 && <span className={`text-lone-caption tabular-nums ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{brl(m.valor)}</span>}
                        <div className={`w-full max-w-14 rounded-t-md ${m.valor > 0 ? "bg-lone-success" : "bg-muted-foreground/15"}`} style={{ height: m.valor > 0 ? `${Math.max(6, (m.valor / teto) * 78)}%` : "3px" }} />
                        <span className={`text-lone-caption capitalize ${atual ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{mesLabel(m.ym)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          {/* Leads por mês (captação) */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none lg:col-span-2">
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

          {/* Conversão por origem: qual canal fecha mais */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
            <h2 className="text-lone-h2 text-foreground">Conversão por origem</h2>
            <p className="mb-4 text-lone-caption text-muted-foreground">Quantos leads cada canal trouxe e quantos viraram contrato</p>
            {relatorio.porOrigem.length === 0 ? <p className="text-lone-caption text-muted-foreground">Sem leads ainda.</p> : (
              <div className="space-y-3">
                {relatorio.porOrigem.map(([k, g]) => {
                  const pct = g.total ? Math.round((g.ganhos / g.total) * 100) : 0;
                  return (
                    <div key={k}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-lone-caption">
                        <span className="min-w-0 truncate text-foreground">{k}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{g.ganhos} de {g.total} · <span className="font-semibold text-foreground">{pct}%</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted-foreground/15"><div className="h-full rounded-full bg-lone-success" style={{ width: `${Math.max(g.ganhos ? 3 : 0, pct)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Por responsável */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Por responsável</h2>
            {relatorio.porResponsavel.length === 0 ? <p className="text-xs text-muted-foreground">Sem leads ainda.</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Responsável</th><th className="py-1 font-medium">Leads</th><th className="py-1 font-medium">Ganhos</th></tr></thead>
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

          {/* Motivos de perda em ranking */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none lg:col-span-2">
            <h2 className="text-lone-h2 text-foreground">Motivos de perda</h2>
            <p className="mb-4 text-lone-caption text-muted-foreground">Por que os negócios não fecharam — o que mais aparece primeiro</p>
            {relatorio.motivos.length === 0 ? <p className="text-lone-caption text-muted-foreground">Nenhum lead perdido até agora.</p> : (() => {
              const maxM = Math.max(1, ...relatorio.motivos.map(([, n]) => n));
              return (
                <div className="space-y-2.5">
                  {relatorio.motivos.map(([m, n]) => (
                    <div key={m} className="flex items-center gap-3">
                      <span className="w-44 shrink-0 truncate text-lone-caption text-foreground">{m}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted-foreground/15"><div className="h-full rounded-full bg-lone-danger" style={{ width: `${(n / maxM) * 100}%` }} /></div>
                      <span className="w-6 shrink-0 text-right text-lone-caption font-semibold tabular-nums text-foreground">{n}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        </div>
      )}

      {/* Metas do mês */}
      {editMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={() => setEditMeta(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lone-h2 text-foreground">Metas de {new Date(`${mesSP()}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long" })}</h2>
              <button onClick={() => setEditMeta(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">MRR novo a vender no mês (R$/mês)</label>
                <input type="number" min={0} step="100" className={inputCls} value={editMeta.metaValor} onChange={(e) => setEditMeta({ ...editMeta, metaValor: e.target.value })} placeholder="soma das mensalidades fechadas" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Contatos por semana</label>
                  <input type="number" min={0} className={inputCls} value={editMeta.metaContatosSemana} onChange={(e) => setEditMeta({ ...editMeta, metaContatosSemana: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Propostas no mês</label>
                  <input type="number" min={0} className={inputCls} value={editMeta.metaPropostasMes} onChange={(e) => setEditMeta({ ...editMeta, metaPropostasMes: e.target.value })} />
                </div>
              </div>
              <p className="text-lone-caption text-muted-foreground">Só você vê. A barra conta as mensalidades dos negócios marcados como Ganho neste mês.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditMeta(null)}>Cancelar</Button>
              <Button onClick={salvarMeta} disabled={salvandoMeta}>{salvandoMeta ? "Salvando…" : "Salvar metas"}</Button>
            </div>
          </div>
        </div>
      )}

      {marcando && (
        <MarcarReuniao
          leads={leads}
          leadInicial={marcando.lead ?? null}
          diaInicial={marcando.dia ?? null}
          autor={currentUser ?? null}
          onFechar={() => setMarcando(null)}
          onMarcada={() => { carregarReunioes(); recarregarLeads(); }}
        />
      )}

      {/* Ficha do lead (redesign D3): painel lateral com o resumo fixo no topo e abas Resumo, Histórico e Dados.
          Antes era um formulário de 20 campos numa coluna estreita, sem resumo, que o Esc não fechava. */}
      {draft && (() => {
        const existente = !!draft.id;
        const passo = existente ? proximoPasso(draft as Lead) : null;
        const chancePct = Math.round(chanceDe({ estagio: draft.estagio, probabilidade: draft.probabilidade }) * 100);
        const nomeFicha = draft.empresa || draft.contatoNome || "Novo lead";
        const abaCls = (a: typeof abaFicha) => `-mb-px border-b-2 px-3 py-2.5 text-lone-body font-medium transition-colors ${abaFicha === a ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`;
        const resumo = (
          <div className="space-y-3">
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
              {CRITERIO_SAIDA[draft.estagio] && <p className="-mt-1 text-lone-caption text-muted-foreground">{CRITERIO_SAIDA[draft.estagio]}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Mensalidade (R$/mês)</label>
                  <input type="number" min={0} step="1" className={inputCls} value={draft.valorOrcamento ?? ""} placeholder="valor por mês"
                    onChange={(e) => setDraft({ ...draft, valorOrcamento: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Chance de fechar (%)</label>
                  <input type="number" min={0} max={100} step="5" className={inputCls}
                    value={draft.probabilidade != null ? Math.round(draft.probabilidade * 100) : ""}
                    placeholder={`padrão da etapa: ${Math.round(chanceDe({ estagio: draft.estagio }) * 100)}%`}
                    onChange={(e) => setDraft({ ...draft, probabilidade: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) / 100 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Previsão de fechamento</label>
                  <input type="date" className={inputCls} value={draft.previsaoFechamento ?? ""} onChange={(e) => setDraft({ ...draft, previsaoFechamento: e.target.value || null })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Retomar em (some do Hoje até lá)</label>
                  <input type="date" className={inputCls} value={draft.retomarEm ?? ""} onChange={(e) => setDraft({ ...draft, retomarEm: e.target.value || null })} />
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
              {draft.estagio === "perdido" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Motivo da perda *</label>
                    <select className={inputCls} value={draft.motivoPerdaCodigo ?? ""} onChange={(e) => setDraft({ ...draft, motivoPerdaCodigo: e.target.value || null })}>
                      <option value="">Escolha o motivo…</option>
                      {MOTIVOS_PERDA.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Detalhe (opcional)</label>
                    <input className={inputCls} value={draft.motivoPerda ?? ""} onChange={(e) => setDraft({ ...draft, motivoPerda: e.target.value })} placeholder="qual concorrente, o que pesou…" />
                  </div>
                  {draft.motivoPerdaCodigo === "sem_verba" && <p className="col-span-2 text-lone-caption text-muted-foreground">Volta sozinho para a lista em 90 dias (se você não marcar outra data em &quot;Retomar em&quot;).</p>}
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

          </div>
        );
        const dados = (
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
                  <label className="mb-1 block text-xs text-muted-foreground">Segmento</label>
                  <input className={inputCls} value={draft.segmento ?? ""} onChange={(e) => setDraft({ ...draft, segmento: e.target.value || null })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Cidade</label>
                  <input className={inputCls} value={draft.cidade ?? ""} onChange={(e) => setDraft({ ...draft, cidade: e.target.value || null })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Instagram</label>
                  <input className={inputCls} value={draft.instagram ?? ""} placeholder="@perfil" onChange={(e) => setDraft({ ...draft, instagram: e.target.value.replace(/^@/, "") || null })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Responsável</label>
                  <input className={inputCls} value={draft.responsavel ?? ""} onChange={(e) => setDraft({ ...draft, responsavel: e.target.value })} />
                </div>
              </div>
              {draft.endereco && (
                <p className="flex items-start gap-1.5 text-lone-caption text-muted-foreground"><MapPin size={12} className="mt-0.5 shrink-0" /> {draft.endereco}</p>
              )}
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-overlay" onClick={() => setDraft(null)}>
            <aside role="dialog" aria-modal="true" aria-label={existente ? `Ficha de ${nomeFicha}` : "Novo lead"}
              className="cc-gaveta flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
              <header className="border-b border-border px-5 pb-4 pt-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {existente && (
                      <p className="flex flex-wrap items-center gap-2 text-lone-caption text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                          <span className={`h-1.5 w-1.5 rounded-full ${ESTAGIO_META[draft.estagio].color}`} />{ESTAGIO_META[draft.estagio].title}
                        </span>
                        {draft.origem && <span>{draft.origem}</span>}
                        {draft.cidade && <span>· {draft.cidade}</span>}
                      </p>
                    )}
                    <h2 className="mt-1.5 truncate text-lone-h1 tracking-tight text-foreground">{existente ? nomeFicha : "Novo lead"}</h2>
                    {existente && draft.empresa && draft.contatoNome && draft.contatoNome !== draft.empresa && <p className="truncate text-lone-body text-muted-foreground">{draft.contatoNome}</p>}
                  </div>
                  <button onClick={() => setDraft(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar (Esc)"><X size={18} /></button>
                </div>
                {existente && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-border bg-background px-3 py-2">
                        <p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Mensalidade</p>
                        <p className="mt-0.5 text-lone-body font-semibold tabular-nums text-foreground">{draft.valorOrcamento ? brl(draft.valorOrcamento) : "—"}</p>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                        <Anel tamanho="xs" pct={chancePct} tom="primary" rotuloAcessivel={`Chance de ${chancePct}%`} />
                        <div><p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Chance</p><p className="text-lone-body font-semibold tabular-nums text-foreground">{chancePct}%</p></div>
                      </div>
                      <div className="rounded-xl border border-border bg-background px-3 py-2">
                        <p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Próximo passo</p>
                        <p className={`mt-0.5 truncate text-lone-caption font-medium ${passo?.alerta ? "text-lone-warning" : "text-foreground"}`} title={passo?.texto}>{passo?.texto ?? "—"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {waLink(draft.telefone) && (
                        <button type="button" onClick={() => abrirWhatsApp(draft.telefone, draft.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-lone-success-bg px-3 text-[13px] font-medium text-lone-success hover:opacity-80"><MessageCircle size={14} /> WhatsApp</button>
                      )}
                      {draft.telefone && (
                        <a href={`tel:${draft.telefone.replace(/\D/g, "")}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent"><Phone size={14} /> Ligar</a>
                      )}
                      <button type="button" onClick={() => setMarcando({ lead: draft as Lead })}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-[13px] font-medium text-primary hover:opacity-80"><CalendarClock size={14} /> Marcar reunião</button>
                      {draft.instagram && (
                        <a href={`https://instagram.com/${draft.instagram}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] text-foreground hover:bg-accent">@{draft.instagram}</a>
                      )}
                    </div>
                  </>
                )}
              </header>

              {existente && (() => {
                const prox = reunioes.filter((r) => r.leadId === draft.id && r.estado === "agendada").sort((a2, b2) => a2.inicio.localeCompare(b2.inicio))[0];
                return prox ? (
                  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-5 py-2.5 text-lone-caption">
                    <CalendarClock size={14} className="text-primary" aria-hidden="true" />
                    <span className="text-foreground">Reunião {diaCurto(prox.inicio)} às {horaCurta(prox.inicio)} · {prox.formato === "meet" ? "Google Meet" : prox.formato === "presencial" ? "presencial" : "ligação"}</span>
                    {prox.meetUrl && <a href={prox.meetUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">entrar</a>}
                  </div>
                ) : null;
              })()}
              {existente && (
                <nav className="flex gap-1 border-b border-border px-5" aria-label="Seções da ficha">
                  <button className={abaCls("resumo")} onClick={() => setAbaFicha("resumo")}>Resumo</button>
                  <button className={abaCls("historico")} onClick={() => setAbaFicha("historico")}>Histórico{atividades.length ? ` · ${atividades.length}` : ""}</button>
                  <button className={abaCls("dados")} onClick={() => setAbaFicha("dados")}>Dados</button>
                </nav>
              )}

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {!existente && <>{dados}{resumo}</>}
                {existente && abaFicha === "resumo" && (
                  <>
                    {resumo}
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
                {draft.notaOrigem === "prospeccao" && <p className="text-lone-caption text-muted-foreground">Nota que veio da prospecção.</p>}
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
            {draft.id && ["diagnostico", "proposta", "negociacao"].includes(draft.estagio) && (
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

                  </>
                )}
                {existente && abaFicha === "historico" && (
                  <div>
                  <label className="mb-1.5 block text-lone-caption font-medium text-muted-foreground">Registrar contato ou anotação</label>
                  <div className="flex gap-2">
                    <select className="h-9 shrink-0 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:border-primary focus:outline-none" aria-label="Tipo" value={novaTipo} onChange={(e) => setNovaTipo(e.target.value as CrmAtividadeTipo)}>
                      {(["nota", "ligacao", "whatsapp", "email", "reuniao", "visita"] as CrmAtividadeTipo[]).map((t) => (
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
                  <div className="mt-5 space-y-0">
                    {loadingAtiv ? (
                      <p className="text-xs text-muted-foreground">Carregando…</p>
                    ) : atividades.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem histórico ainda — registre a primeira interação.</p>
                    ) : (
                      atividades.map((a) => {
                        const Icon = ATIVIDADE_META[a.tipo]?.icon ?? StickyNote;
                        return (
                          <div key={a.id} className="relative flex gap-3 pb-4 before:absolute before:bottom-0 before:left-[13px] before:top-7 before:w-px before:bg-border last:before:hidden">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-background"><Icon size={13} className="text-muted-foreground" /></span>
                            <div className="min-w-0 pt-0.5">
                              <div className="text-lone-body text-foreground">{a.texto}</div>
                              <div className="mt-0.5 text-[10.5px] text-muted-foreground">{ATIVIDADE_META[a.tipo]?.label ?? a.tipo} · 
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
                {existente && abaFicha === "dados" && dados}
              </div>

              <footer className="border-t border-border px-5 py-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
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
              </footer>
            </aside>
          </div>
        );
      })()}
    </div>
  );
}
