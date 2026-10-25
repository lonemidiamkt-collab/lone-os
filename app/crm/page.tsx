"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { proximoToque, rotuloToque, TIPOS_AVANCO, TIPOS_TOQUE, type ProximoToque } from "@/lib/crm/cadencia";
import type { DesfazerRegistro } from "@/lib/crm/desfazer-registro";
import { anotarEnvio, textoWhatsappDoHoje, tirarEnvio, TEXTO_WHATSAPP_PAINEL, type EnvioPendente } from "@/lib/crm/enviou";
import PerguntaEnvio from "@/components/crm/PerguntaEnvio";
import { montarFilaHoje, inicioDaCadencia } from "@/lib/crm/hoje";
import { waComTexto } from "@/lib/crm/modelos";
import { PORTES, type QualificacaoLead } from "@/lib/crm/nota";
import { PACOTES_VENDA } from "@/lib/clients/conversao";
import { ROTULO_NICHO, normalizarNicho } from "@/lib/cs/nicho";
import { linkDoCliente, separarFechados } from "@/lib/crm/fechados";
import { coortePorMes, porGrupo, textoFracao, type EtapaHist } from "@/lib/crm/taxas";
import { nomeDoMes } from "@/lib/crm/painel";
import { ABAS_DA_PAGINA_CRM } from "@/lib/navegacao/casco";
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
import { diaCurto, horaCurta, inicioDe, duracaoMin, mensagemVesperaLead, textoExcluirComReuniao, type ReuniaoBase, type Formato } from "@/lib/crm/reunioes";
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
type AbaCrm = "hoje" | "dashboard" | "funil" | "fechados" | "agenda" | "relatorios";
const TITULO_ABA: Record<AbaCrm, { titulo: string; apoio: string }> = {
  hoje: { titulo: "Hoje", apoio: "O que fazer agora, na ordem que vende" },
  dashboard: { titulo: "Dashboard", apoio: "" },
  funil: { titulo: "Funil", apoio: "Todos os negócios, por etapa" },
  fechados: { titulo: "Fechados", apoio: "Vendas ganhas para virar cliente, clientes novos e o que se perdeu" },
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
  // Histórico de etapa (taxa de fechamento). null = não carregou — as telas dizem "indisponível", nunca "0".
  const [historico, setHistorico] = useState<EtapaHist[] | null>(null);
  const [historicoErro, setHistoricoErro] = useState<string | null>(null);
  const [tab, setTab] = useState<AbaCrm>("hoje");
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
  // Histórico que não carregou não é "sem histórico ainda" (24/10/2026); e o texto digitado só some depois de gravar.
  const [atividadesErro, setAtividadesErro] = useState<string | null>(null);
  const [recargaAtiv, setRecargaAtiv] = useState(0);
  const [enviandoNota, setEnviandoNota] = useState(false);
  // WhatsApp aberto esperando o "Enviou?" (24/10/2026, auditoria 4.5): abrir não conta mais como contato.
  const [enviosPendentes, setEnviosPendentes] = useState<EnvioPendente<Lead>[]>([]);
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
  // Meta que NÃO CARREGOU (24/10/2026, auditoria 4.11): antes virava "sem meta" e R$ 0 — e o "Definir meta" abria vazio
  // e gravava por cima da meta que existia. Agora a tela diz que não leu e oferece tentar de novo.
  const [metasErro, setMetasErro] = useState<Record<string, string>>({});
  const meta = metas[mesSP()] ?? null;
  const setMeta = (m: CrmMeta | null) => setMetas((prev) => ({ ...prev, [mesSP()]: m }));
  const carregarMeta = useCallback((mes: string) => {
    setMetas((prev) => (mes in prev ? prev : { ...prev, [mes]: null }));
    setMetasErro((prev) => { if (!(mes in prev)) return prev; const resto = { ...prev }; delete resto[mes]; return resto; });
    chamar<{ meta: CrmMeta | null }>(`/api/crm/metas?mes=${mes}`).then((r) => {
      if (r.ok) setMetas((prev) => ({ ...prev, [mes]: r.data?.meta ?? null }));
      else setMetasErro((prev) => ({ ...prev, [mes]: r.erro ?? "Não consegui carregar a meta." }));
    });
  }, []);
  // Relatórios: a linha da meta precisa da meta de cada um dos 6 meses.
  useEffect(() => {
    if (tab !== "relatorios") return;
    for (const ym of relatorio.meses) carregarMeta(ym);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Filtro que vem do dashboard ("Negócios parados", uma fatia da rosca…) para o Funil.
  const [filtroFunil, setFiltroFunil] = useState<FiltroFunil | null>(null);
  const [verTodosFechados, setVerTodosFechados] = useState(false);
  // Funil no celular: uma etapa por vez com seletor (23/10/2026 — eram 1.344px de rolagem lateral e o arrastar brigava com ela).
  const [ehCelular, setEhCelular] = useState(false);
  const [etapaCelular, setEtapaCelular] = useState<string | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const atualizar = () => setEhCelular(mq.matches);
    atualizar();
    mq.addEventListener("change", atualizar);
    return () => mq.removeEventListener("change", atualizar);
  }, []);
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
    chamar<{ leads?: Lead[]; segmentosIcp?: string[]; historico?: EtapaHist[] | null; historicoErro?: string | null }>("/api/crm/leads").then((r) => {
      // Falha não vira funil vazio: mostra o erro no lugar dos números.
      if (!r.ok) { console.error("[crm] carga dos leads falhou:", r.erro); setErroCarga(r.erro ?? "erro"); }
      else {
        setLeads(r.data?.leads ?? []); setSegmentosIcp(r.data?.segmentosIcp ?? []);
        setHistorico(r.data?.historico ?? null); setHistoricoErro(r.data?.historicoErro ?? (r.data?.historico ? null : "O histórico de etapas não veio do servidor."));
      }
      setLoading(false);
    });
  }, [podeVer]);

  // Endereço com ?aba= (abas do casco do comercial) e ?lead= (a Rota abre o lead direto no funil).
  useEffect(() => {
    if (loading) return;
    const q = new URLSearchParams(window.location.search);
    const aba = q.get("aba");
    if (aba && ABAS_DA_PAGINA_CRM.includes(aba)) setTab(aba as typeof tab);
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
    if (ABAS_DA_PAGINA_CRM.includes(pendingTab)) {
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
    // Começa no mês do primeiro lead (23/10/2026: a tela mostrava maio a setembro vazios antes do Comercial existir).
    const primeiroMes = leads.reduce<string | null>((m, l) => { const ym = (l.createdAt || "").slice(0, 7); return ym && (!m || ym < m) ? ym : m; }, null);
    const meses: string[] = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 15);
      const ym = d.toLocaleDateString("en-CA").slice(0, 7);
      if (!primeiroMes || ym >= primeiroMes || i === 0) meses.push(ym);
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

    const motivos = new Map<string, number>();
    for (const l of leads.filter((x) => x.estagio === "perdido")) {
      const m = rotuloMotivo(l.motivoPerdaCodigo) ?? ((l.motivoPerda || "").trim() || "(não informado)");
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
    }
    return {
      porMes, maxQtd, meses, leadsPorMes, maxLeadsMes,
      porOrigem: porGrupo(leads, historico ?? [], null, (l) => l.origem, "Sem origem"),
      porResponsavel: porGrupo(leads, historico ?? [], null, (l) => l.responsavel, "Sem responsável"),
      coorte: coortePorMes(leads, historico ?? [], meses),
      motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [leads, historico]);

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
    setAtividadesErro(null);
    if (!draft?.id) { setAtividades([]); return; }
    let vivo = true;
    setLoadingAtiv(true);
    chamar<{ atividades: CrmLeadActivity[] }>(`/api/crm/activities?leadId=${draft.id}`).then((r) => {
      if (!vivo) return;
      if (r.ok) setAtividades(r.data?.atividades ?? []);
      else { setAtividades([]); setAtividadesErro(r.erro ?? "Não consegui carregar o histórico."); }
      setLoadingAtiv(false);
    });
    return () => { vivo = false; };
  }, [draft?.id, recargaAtiv]);

  // ─── Ações ─────────────────────────────────────────────────────────
  // ─── Registros (histórico, toques do Hoje) — todos com Desfazer (24/10/2026, auditoria 4.6) ───────
  /** Grava o registro e atualiza a tela; não mostra aviso (quem chama decide). */
  async function gravarRegistro(l: Pick<Lead, "id">, tipo: CrmAtividadeTipo, texto: string): Promise<{ ok: true; desfazer: DesfazerRegistro; movido: Lead | null } | { ok: false; erro: string }> {
    const r = await chamar<{ atividade: CrmLeadActivity; lead: Lead | null; desfazer: DesfazerRegistro }>("/api/crm/activities", { leadId: l.id, tipo, texto: texto.trim(), autor: currentUser ?? null });
    if (!r.ok || !r.data) return { ok: false, erro: r.erro ?? "Não consegui registrar." };
    const { atividade, lead: movido, desfazer } = r.data;
    const quando = atividade?.createdAt || new Date().toISOString();
    const contato = TIPOS_TOQUE.has(tipo);
    setLeads((prev) => prev.map((x) => x.id !== l.id ? x : {
      ...x, ...(movido ?? {}),
      toques: contato ? [...(x.toques ?? []), quando] : x.toques,
      avancos: TIPOS_AVANCO.has(tipo) ? [...(x.avancos ?? []), quando] : x.avancos,
      primeiroContatoEm: x.primeiroContatoEm ?? (contato ? quando : null),
    }));
    if (atividade && l.id === draftAtual.current?.id) setAtividades((prev) => [atividade, ...prev]);
    return { ok: true, desfazer, movido };
  }

  /** O "Desfazer": apaga o registro e volta o lead (o servidor confere o que ainda dá para voltar). */
  async function desfazerNaTela(d: DesfazerRegistro): Promise<boolean> {
    const r = await chamar<{ lead: Lead | null; aviso: string | null }>("/api/crm/activities", { desfazer: d }, { method: "DELETE" });
    if (!r.ok) { toast.error(r.erro ?? "Não consegui desfazer. Tente de novo.", { duration: 12000 }); return false; }
    const lead = r.data?.lead;
    if (lead) setLeads((prev) => prev.map((x) => (x.id === lead.id ? { ...x, ...lead } : x)));
    setAtividades((prev) => prev.filter((a) => !d.atividadeIds.includes(a.id)));
    if (r.data?.aviso) toast.warning(r.data.aviso);
    return true;
  }

  /** Registro com aviso e Desfazer. Devolve se gravou. */
  async function registrarToque(l: Lead, tipo: CrmAtividadeTipo, texto: string): Promise<boolean> {
    setAcaoBusy(l.id);
    const r = await gravarRegistro(l, tipo, texto);
    setAcaoBusy(null);
    if (!r.ok) { toast.error(r.erro); return false; }
    const msg = tipo === "pulado" ? "Toque pulado — a régua seguiu." : r.movido?.estagio === "contato" && l.estagio === "novo" ? "Registrado. O lead foi para Contato feito." : "Registrado.";
    const d = r.desfazer;
    toast.success(msg, {
      duration: 8000,
      action: { label: "Desfazer", onClick: async () => { if (await desfazerNaTela(d)) toast.success("Desfeito: o registro saiu do histórico."); } },
    });
    return true;
  }

  // WhatsApp: abrir a conversa só ANOTA; o "Enviou?" na volta decide se conta (lib/crm/enviou.ts).
  function anotarWhatsApp(l: Lead, texto: string) {
    setEnviosPendentes((prev) => anotarEnvio(prev, { lead: l, tipo: "whatsapp", texto, abertoEm: new Date().toISOString() }));
  }
  function abrirWhatsApp(telefone: string | null | undefined, leadId?: string) {
    const link = waLink(telefone);
    if (!link) return;
    window.open(link, "_blank");
    const l = leadId ? leads.find((x) => x.id === leadId) : null;
    if (l) anotarWhatsApp(l, TEXTO_WHATSAPP_PAINEL);
  }
  async function responderEnvio(p: EnvioPendente<Lead>, enviou: boolean) {
    setEnviosPendentes((prev) => tirarEnvio(prev, p.lead.id));
    if (!enviou) { toast("Nada registrado — o contato não contou."); return; }
    const atual = leads.find((x) => x.id === p.lead.id) ?? p.lead;
    // Não gravou: volta a pergunta para tentar de novo (nada some em silêncio).
    if (!(await registrarToque(atual, p.tipo, p.texto))) setEnviosPendentes((prev) => anotarEnvio(prev, p));
  }

  async function moverEstagio(id: string, _from: string, to: string) {
    const snapshot = leads; // pra reverter se o banco recusar
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, estagio: to as CrmEstagio } : l)));
    // `chamar` traz o motivo do servidor (24/10/2026, auditoria 4.15) em vez de "Não foi possível".
    const r = await chamar<{ lead: Lead }>("/api/crm/leads", { id, estagio: to }, { method: "PATCH" });
    if (!r.ok || !r.data?.lead) {
      setLeads(snapshot); // reverte: o card não muda de coluna se o banco não confirmou
      toast.error(`Não movi o lead: ${r.erro ?? "sem resposta do servidor"}`);
      return;
    }
    const lead = r.data.lead;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
    // Caiu em "perdido" sem motivo → abre o modal pra registrar o porquê (alimenta o relatório).
    if (to === "perdido" && !lead.motivoPerda) setDraft({ ...lead });
    if (to === "ganho" && !lead.clienteId) avisarGanho(lead);
  }

  // LEAD COM REUNIÃO MARCADA (21/10/2026): a confirmação diz qual reunião vai ser cancelada, e o
  // servidor cancela no Google ANTES de excluir — se o Google não confirmar, o lead fica e a tela diz
  // por quê. Se o servidor achar reunião que esta tela não tinha (409), pergunta de novo com a lista dele.
  async function excluir(id: string) {
    const marcadas = reunioes.filter((r) => r.leadId === id && r.estado === "agendada" && Date.parse(r.fim) >= Date.now());
    const sobreReuniao = marcadas.length ? `\n\n${textoExcluirComReuniao(marcadas)}` : "";
    if (!confirm(`Excluir este lead? Essa ação não tem volta.${sobreReuniao}`)) return;
    const url = (cancelar: boolean) =>
      `/api/crm/leads?id=${encodeURIComponent(id)}${cancelar ? `&cancelarReunioes=1&autor=${encodeURIComponent(currentUser ?? "")}` : ""}`;
    const aviso = toast.loading(marcadas.length ? "Cancelando a reunião e excluindo…" : "Excluindo…");
    let r = await chamar<{ ok: boolean; reunioesCanceladas?: number }>(url(marcadas.length > 0), undefined, { method: "DELETE" });
    if (r.status === 409) {
      toast.dismiss(aviso);
      if (!confirm(`${r.erro}\n\nExcluir o lead e cancelar?`)) return;
      toast.loading("Cancelando a reunião e excluindo…", { id: aviso });
      r = await chamar<{ ok: boolean; reunioesCanceladas?: number }>(url(true), undefined, { method: "DELETE" });
    }
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível excluir. Tente de novo.", { id: aviso, duration: 12000 });
      carregarReunioes(); // alguma pode ter sido cancelada antes da que falhou
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const n = r.data?.reunioesCanceladas ?? 0;
    toast.success(n ? `Lead excluído e ${n === 1 ? "reunião cancelada" : `${n} reuniões canceladas`}.` : "Lead excluído.", { id: aviso });
    if (n) carregarReunioes();
  }

  async function salvar() {
    if (!draft?.contatoNome?.trim()) { toast.error("Informe o nome do contato."); return; }
    // Motivo da perda é obrigatório ao fechar como perdido (senão o relatório de perda esvazia).
    // Mensalidade baixa demais costuma ser zero faltando ("R$ 2/mês" apareceu num lead em Diagnóstico).
    const mensalidade = Number(draft.valorOrcamento ?? 0);
    if (mensalidade > 0 && mensalidade < 300 && !confirm(`Mensalidade de ${brl(mensalidade)}? Parece baixa — confira se não faltou um zero.`)) return;
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
    // `chamar` nunca lança e traz o motivo do servidor (24/10/2026, auditoria 4.15). O que foi digitado fica na ficha.
    const r = await chamar<{ lead: Lead; aviso?: string | null }>("/api/crm/leads", payload, { method: editando ? "PATCH" : "POST" });
    setSaving(false); // sempre libera o botão — antes, um erro deixava preso em 'Salvando…'
    if (!r.ok || !r.data?.lead) { toast.error(`Não salvei o lead: ${r.erro ?? "sem resposta do servidor"}. O que você digitou continua na ficha.`, { duration: 12000 }); return; }
    const { lead, aviso } = r.data;
    const virouGanho = lead.estagio === "ganho" && !lead.clienteId && leads.find((l) => l.id === lead.id)?.estagio !== "ganho";
    setLeads((prev) => (editando ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev]));
    setDraft(null);
    if (aviso) toast.warning(aviso);
    else if (virouGanho) avisarGanho(lead);
    else toast.success(editando ? "Lead atualizado." : "Lead criado.");
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
    const nota = await gravarRegistro({ id: draft.id }, "nota", "Convertido em cliente — link de onboarding gerado, checklist e tarefas do grupo criados.");
    if (!nota.ok) console.warn("[crm] nota de conversão não gravada:", nota.erro);
    setLeads((prev) => prev.map((l) => (l.id === draft.id ? { ...l, clienteId, cadastroPendente: true } : l)));
    const url = `${window.location.origin}${corpo.url ?? ""}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    toast.success("Link de cadastro copiado. Quando o cliente preencher, ele entra no sistema sozinho.");
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
    // O servidor já gravou a etapa: ela não conta como "alteração não salva" ao fechar a ficha.
    if (fichaBase.current?.id === draft.id) fichaBase.current = { ...fichaBase.current, estagio, propostaEnviadaEm: draft.propostaEnviadaEm ?? em };
    if (r.data.avisos.length) toast.warning(r.data.avisos.join(" · "));
    else toast.success("Proposta registrada como enviada.");
  }

  // ─── Ações da lista do Hoje ─────────────────────────────────────────
  // Abrir a mensagem pronta no WhatsApp não registra mais nada: o "Enviou?" na volta decide (24/10/2026, 4.5).
  async function enviarWhatsApp(l: Lead, texto: string) {
    const link = waComTexto(l.telefone, texto);
    if (!link) { toast.error("Este lead não tem WhatsApp no cadastro."); return; }
    window.open(link, "_blank");
    anotarWhatsApp(l, textoWhatsappDoHoje(texto));
  }

  /** Grava um PATCH do Hoje e devolve o que havia antes nos campos mexidos (é o que o Desfazer volta). */
  async function gravarPatch(l: Lead, patch: Record<string, unknown>): Promise<{ ok: true; antes: Record<string, unknown>; aviso: string | null } | { ok: false; erro: string }> {
    const r = await chamar<{ lead: Lead; aviso?: string | null }>("/api/crm/leads", { id: l.id, ...patch }, { method: "PATCH" });
    if (!r.ok || !r.data?.lead) return { ok: false, erro: r.erro ?? "Não consegui salvar." };
    const lead = r.data.lead;
    setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...lead } : x)));
    // Mudar a etapa mexe também no motivo, na chance e na retomada (o servidor carimba): volta os quatro juntos.
    const campos = new Set(Object.keys(patch).filter((k) => k !== "origemEtapa"));
    if (campos.has("estagio")) ["motivoPerdaCodigo", "motivoPerda", "probabilidade", "retomarEm"].forEach((k) => campos.add(k));
    const antes = Object.fromEntries([...campos].map((k) => [k, (l as unknown as Record<string, unknown>)[k] ?? null]));
    return { ok: true, antes, aviso: r.data.aviso ?? null };
  }
  async function voltarPatch(l: Lead, antes: Record<string, unknown>): Promise<boolean> {
    const r = await chamar<{ lead: Lead }>("/api/crm/leads", { id: l.id, ...antes }, { method: "PATCH" });
    if (!r.ok || !r.data?.lead) { toast.error(`Não consegui desfazer em ${l.empresa || l.contatoNome}: ${r.erro ?? "sem resposta"}`, { duration: 12000 }); return false; }
    const lead = r.data.lead;
    setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...lead } : x)));
    return true;
  }

  async function patchLead(l: Lead, patch: Record<string, unknown>, ok: string): Promise<boolean> {
    setAcaoBusy(l.id);
    const r = await gravarPatch(l, patch);
    setAcaoBusy(null);
    if (!r.ok) { toast.error(r.erro); return false; }
    if (r.aviso) toast.warning(r.aviso);
    const antes = r.antes;
    toast.success(ok, {
      duration: 8000,
      action: { label: "Desfazer", onClick: async () => { if (await voltarPatch(l, antes)) toast.success("Desfeito."); } },
    });
    return true;
  }

  /**
   * Marcar vários de uma vez (24/10/2026, auditoria 4.6): conta SÓ os que gravaram, diz quais falharam e por quê,
   * e o Desfazer volta todos os que gravaram. Antes o "adiar" contava todo mundo como adiado, mesmo com erro.
   */
  async function emLote(acao: "feito" | "adiar" | "perder", lista: Lead[]): Promise<void> {
    const desfazeres: (() => Promise<boolean>)[] = [];
    const falhas: string[] = [];
    for (const l of lista) {
      const nome = l.empresa || l.contatoNome;
      if (acao === "feito") {
        const r = await gravarRegistro(l, "whatsapp", "Contato feito por outro caminho (marcado em lote no Hoje)");
        if (r.ok) { const d = r.desfazer; desfazeres.push(() => desfazerNaTela(d)); } else falhas.push(`${nome} (${r.erro})`);
      } else {
        const patch = acao === "adiar" ? { retomarEm: somaDias(hojeYmd(), 1) } : { estagio: "perdido", motivoPerdaCodigo: "sem_resposta", origemEtapa: "lote" };
        const r = await gravarPatch(l, patch);
        if (r.ok) { const antes = r.antes; desfazeres.push(() => voltarPatch(l, antes)); } else falhas.push(`${nome} (${r.erro})`);
      }
    }
    const n = desfazeres.length;
    const feito = acao === "feito" ? (n === 1 ? "marcado como feito" : "marcados como feito")
      : acao === "adiar" ? (n === 1 ? "adiado para amanhã" : "adiados para amanhã")
      : (n === 1 ? "marcado como perdido (sem resposta)" : "marcados como perdido (sem resposta)");
    if (n) {
      toast.success(`${n} ${feito}.`, {
        duration: 10000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            let voltou = 0;
            for (const d of desfazeres) if (await d()) voltou++;
            if (voltou === n) toast.success(n === 1 ? "Desfeito." : `Desfeito nos ${n}.`);
            else toast.error(`Desfiz ${voltou} de ${n}. Confira os que ficaram.`, { duration: 12000 });
          },
        },
      });
    }
    if (falhas.length) toast.error(`${falhas.length === 1 ? "Não gravou" : `${falhas.length} não gravaram`}: ${falhas.join("; ")}. Tente de novo.`, { duration: 15000 });
  }

  // Depois de marcar/remarcar/cancelar, o servidor mexe no lead (etapa, data da reunião): recarrega.
  function recarregarLeads() {
    chamar<{ leads?: Lead[] }>("/api/crm/leads").then((r) => { if (r.ok && r.data?.leads) setLeads(r.data.leads); });
  }
  async function reuniaoAcao(id: string, acao: "remarcar" | "cancelar" | "realizada" | "nao_veio", extra: Record<string, unknown> = {}) {
    if (acao === "cancelar" && !window.confirm("Cancelar esta reunião? O convite é cancelado no Google Agenda e o grupo é avisado.")) return false;
    const r = await chamar("/api/crm/reunioes", { id, acao, autor: currentUser ?? null, ...extra }, { method: "PATCH" });
    // Cancelar que o Google não confirmou volta com o porquê e a reunião fica marcada: tempo de ler.
    if (!r.ok) { toast.error(r.erro ?? "Não consegui atualizar a reunião.", acao === "cancelar" ? { duration: 12000 } : undefined); return false; }
    carregarReunioes(); recarregarLeads();
    if (acao === "realizada" || acao === "nao_veio") {
      // "Aconteceu" / "Não veio" ganham Desfazer (24/10/2026, auditoria 4.6): a reunião volta a agendada e o registro sai.
      const desfazer = (r.data as { desfazer?: DesfazerRegistro } | null)?.desfazer ?? null;
      toast.success(acao === "realizada" ? "Registrado: a reunião aconteceu." : "Registrado: não compareceu.", {
        duration: 8000,
        action: {
          label: "Desfazer",
          onClick: async () => {
            const d = await chamar("/api/crm/reunioes", { id, acao: "desfazer_resultado", desfazer }, { method: "PATCH" });
            if (!d.ok) { toast.error(d.erro ?? "Não consegui desfazer.", { duration: 12000 }); return; }
            toast.success("Desfeito: a reunião voltou para marcada.");
            carregarReunioes(); recarregarLeads();
          },
        },
      });
    } else {
      toast.success(acao === "remarcar" ? "Reunião remarcada e avisada no grupo." : "Reunião cancelada.");
    }
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
  // Meta que não carregou não abre a edição vazia: salvar por cima apagaria a meta que existe (24/10/2026).
  const metaNaoCarregou = () => {
    if (!metasErro[mesSP()]) return false;
    toast.error("A meta do mês não carregou — tente de novo antes de editar, para não gravar por cima.", { action: { label: "Tentar de novo", onClick: () => carregarMeta(mesSP()) } });
    return true;
  };
  const abrirMetas = () => {
    if (metaNaoCarregou()) return;
    setEditMeta({
      metaValor: meta?.metaValor != null ? String(meta.metaValor) : "",
      metaContatosSemana: meta?.metaContatosSemana != null ? String(meta.metaContatosSemana) : "",
      metaPropostasMes: meta?.metaPropostasMes != null ? String(meta.metaPropostasMes) : "",
    });
  };

  // Trocar de lead fecha os painéis do anterior.
  // "Transformar em cliente" de fora da ficha (aba Fechados, aviso do ganho, Hoje): abre a ficha JÁ com a conversão.
  // Sem a marca, o efeito abaixo zerava a conversão logo que a ficha trocava de lead.
  const converterAoAbrir = useRef<string | null>(null);
  const caixaConversao = useRef<HTMLDivElement | null>(null);
  const conversaoInicial = (l: Partial<Lead>) => ({ pacote: "", nicho: normalizarNicho(l.segmento ?? null) ?? "" });
  useEffect(() => {
    setQualificando(null);
    setAbaFicha("resumo");
    if (draft?.id && converterAoAbrir.current === draft.id) { converterAoAbrir.current = null; setConversao(conversaoInicial(draft)); }
    else setConversao(null);
  }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // A caixa de conversão mora no Resumo da ficha: ao abrir, ela aparece e rola até ficar à vista.
  useEffect(() => { if (conversao) requestAnimationFrame(() => caixaConversao.current?.scrollIntoView({ behavior: "smooth", block: "center" })); }, [conversao !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  // Já é cliente? Antes de criar, a conversão lista os clientes do Lone OS sem lead ligado (os de nome parecido primeiro)
  // para LIGAR — os dois primeiros ganhos da aba Fechados já existiam lá e "Converter" criaria duplicado.
  type ClienteLivre = { id: string; nome: string };
  const [ligacao, setLigacao] = useState<{ carregando: boolean; parecidos: ClienteLivre[]; outros: ClienteLivre[]; escolhido: string; erro?: string } | null>(null);
  const [ligando, setLigando] = useState(false);
  useEffect(() => {
    if (!conversao || !draft?.id) { setLigacao(null); return; }
    let vivo = true;
    setLigacao({ carregando: true, parecidos: [], outros: [], escolhido: "" });
    chamar<{ parecidos: ClienteLivre[]; outros: ClienteLivre[] }>(`/api/crm/leads/cliente?leadId=${encodeURIComponent(draft.id)}`).then((r) => {
      if (!vivo) return;
      setLigacao(r.ok && r.data
        ? { carregando: false, parecidos: r.data.parecidos, outros: r.data.outros, escolhido: "" }
        : { carregando: false, parecidos: [], outros: [], escolhido: "", erro: r.erro ?? "Não consegui conferir se já é cliente." });
    });
    return () => { vivo = false; };
  }, [conversao !== null, draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function ligarCliente(c: ClienteLivre) {
    if (!draft?.id || ligando) return;
    setLigando(true);
    const r = await chamar<{ clienteId: string }>("/api/crm/leads/cliente", { leadId: draft.id, clientId: c.id, autor: currentUser ?? null });
    setLigando(false);
    if (!r.ok || !r.data?.clienteId) { toast.error(r.erro ?? "Não consegui ligar ao cliente."); return; }
    const clienteId = r.data.clienteId;
    setLeads((prev) => prev.map((l) => (l.id === draft.id ? { ...l, clienteId } : l)));
    setDraft({ ...draft, clienteId });
    setConversao(null);
    toast.success(`Ligado a ${c.nome}. Nenhum cliente novo foi criado.`);
  }

  function abrirConversao(l: Lead) {
    if (draft?.id === l.id) { setAbaFicha("resumo"); setConversao(conversaoInicial(l)); return; }
    converterAoAbrir.current = l.id;
    setDraft({ ...l });
  }
  /** Venda fechada sem cliente: o aviso já leva ao próximo passo (antes o lead sumia do Funil sem dizer para onde). */
  function avisarGanho(l: Lead) {
    abrirConversao(l);
    toast.success(`Venda fechada: ${l.empresa || l.contatoNome}`, {
      description: "Agora envie o link de cadastro (a ficha já abriu nisso). Até lá ela fica na aba Fechados.",
      duration: 10000,
    });
  }
  // Esc fecha a ficha — sem jogar fora o que foi digitado (23/10/2026: o Esc de um seletor ou calendário dentro da
  // ficha fechava a ficha inteira e descartava a edição em silêncio). Esc num campo só tira o foco do campo; com
  // alteração não salva, pergunta antes de descartar.
  const fichaAberta = !!draft;
  // O lead como estava ao abrir (ou depois do que o servidor já gravou): é a base do "tem alteração não salva?".
  const fichaBase = useRef<Draft | null>(null);
  const assinaturaFicha = (d: Draft | null) => (d ? JSON.stringify([d.empresa, d.contatoNome, d.telefone, d.email, d.cidade, d.endereco, d.segmento, d.origem, d.responsavel, d.estagio, d.valorOrcamento, d.valorImplantacao, d.probabilidade, d.previsaoFechamento, d.reuniaoData, d.retomarEm, d.observacoes, d.motivoPerda, d.motivoPerdaCodigo]) : null);
  useEffect(() => { fichaBase.current = draft; }, [fichaAberta, draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftAtual = useRef<Draft | null>(null);
  draftAtual.current = draft;
  const novoTextoAtual = useRef("");
  novoTextoAtual.current = novoTexto;
  /**
   * Fechar a ficha por QUALQUER caminho — Esc, clique fora, X ou Cancelar — pergunta antes de descartar o que não
   * foi salvo (24/10/2026, auditoria 4.13). A leva V1 de 23/10 tinha resolvido só o Esc; o clique fora, o X e o
   * Cancelar ainda jogavam fora a edição (e o texto do histórico ainda não enviado) sem perguntar.
   */
  const pedirFecharFicha = () => {
    const mudou = assinaturaFicha(draftAtual.current) !== assinaturaFicha(fichaBase.current);
    const digitando = !!novoTextoAtual.current.trim();
    if ((mudou || digitando) && !confirm(mudou ? "Descartar as alterações desta ficha?" : "Descartar o que você digitou no histórico (ainda não registrado)?")) return;
    setNovoTexto("");
    setDraft(null);
  };
  useEffect(() => {
    if (!fichaAberta) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const alvo = e.target as HTMLElement | null;
      // Menu, lista ou calendário aberto por cima da ficha: o Esc é deles.
      if (alvo?.closest("[data-radix-popper-content-wrapper], [role=menu], [role=listbox]")) return;
      if (alvo?.closest("input, textarea, select, [contenteditable=true]")) { alvo.blur(); return; }
      // A janela de marcar reunião (por cima da ficha) cuida do próprio Esc.
      if (document.querySelector("[aria-label='Marcar reunião'][role=dialog]")) return;
      pedirFecharFicha();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [fichaAberta]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Histórico do lead: o campo só limpa DEPOIS que gravou (24/10/2026, auditoria 4.12) — antes o texto sumia na falha. */
  async function registrarNoHistorico() {
    if (!draft?.id || !novoTexto.trim() || enviandoNota) return;
    setEnviandoNota(true);
    const ok = await registrarToque(draft as Lead, novaTipo, novoTexto.trim());
    setEnviandoNota(false);
    if (ok) setNovoTexto("");
  }

  if (!podeVer) return <div className="p-8 text-sm text-destructive">Esta área é do time comercial.</div>;
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando o funil…</div>;
  if (erroCarga) return (
    <div className="m-6 flex flex-col items-start gap-3 rounded-2xl border border-lone-danger-border bg-lone-danger-bg p-5">
      <p className="text-lone-body font-medium text-foreground">Não consegui carregar os leads agora.</p>
      <p className="text-lone-caption text-muted-foreground">Pode ser a conexão ou o servidor reiniciando. Nada foi perdido.</p>
      <Button size="sm" onClick={() => window.location.reload()}>Tentar de novo</Button>
    </div>
  );

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
            {([["hoje", "Hoje", Sun], ["dashboard", "Dashboard", LayoutDashboard], ["funil", "Funil", Columns3], ["fechados", "Fechados", Trophy], ["agenda", "Agenda", CalendarDays], ["relatorios", "Relatórios", BarChart3]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-lone-body font-medium transition-colors ${tab === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>}

      {tab === "hoje" && (() => {
        const paraConverter = separarFechados(leads, null).converter;
        return paraConverter.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-lone-warning-border bg-lone-warning-bg px-5 py-3">
            <Trophy size={16} className="text-lone-warning" aria-hidden="true" />
            <span className="text-lone-body text-foreground">
              {paraConverter.length === 1
                ? <><strong className="font-medium">{paraConverter[0].empresa || paraConverter[0].contatoNome}</strong> fechou e ainda não virou cliente.</>
                : <><strong className="font-medium">{paraConverter.length} vendas fechadas</strong> ainda não viraram cliente.</>}
            </span>
            <div className="ml-auto flex gap-2">
              {paraConverter.length === 1 && <Button size="sm" onClick={() => abrirConversao(paraConverter[0])}>Enviar link de cadastro</Button>}
              <Button size="sm" variant="outline" onClick={() => setTab("fechados")}>Ver fechados</Button>
            </div>
          </div>
        ) : null;
      })()}

      {tab === "hoje" && (
        <HojeComercial
          fila={fila}
          leads={leads}
          hoje={hoje}
          resumoMeta={resumoMeta}
          ocupado={acaoBusy}
          onAbrir={(l) => setDraft({ ...l })}
          onEnviarWhatsApp={enviarWhatsApp}
          onAbriuWhatsApp={anotarWhatsApp}
          onRegistrar={registrarToque}
          onPatch={patchLead}
          onLote={emLote}
          onDefinirMeta={abrirMetas}
          erroMeta={metasErro[mesSP()] ?? null}
          onTentarMeta={() => carregarMeta(mesSP())}
          onVerDashboard={() => setTab("dashboard")}
          reunioes={reunioes}
          onReuniao={reuniaoAcao}
          onMarcarReuniao={(l) => setMarcando({ lead: l })}
        />
      )}

      {tab === "dashboard" && (
        <DashboardComercial
          leads={leads}
          historico={historico}
          historicoErro={historicoErro}
          metas={metas}
          metasErro={metasErro}
          carregarMeta={carregarMeta}
          metaContatosSemana={meta?.metaContatosSemana ?? null}
          nome={currentUser ?? ""}
          proximoPasso={proximoPasso}
          onAbrirLead={(l) => setDraft({ ...l })}
          onDefinirMeta={(sugestao) => { if (!metaNaoCarregou()) setEditMeta({
            metaValor: meta?.metaValor != null ? String(meta.metaValor) : String(sugestao),
            metaContatosSemana: meta?.metaContatosSemana != null ? String(meta.metaContatosSemana) : "",
            metaPropostasMes: meta?.metaPropostasMes != null ? String(meta.metaPropostasMes) : "",
          }); }}
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
        const fechadosFunil = separarFechados(filtrados, hoje.slice(0, 7));
        const colunaCelular = etapaCelular && columns.some((c) => c.id === etapaCelular) ? etapaCelular : (columns.find((c) => c.items.length > 0) ?? columns[0])?.id ?? "";
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
            <span className="ml-auto text-lone-caption text-muted-foreground">{filtrados.filter((l) => ABERTOS.includes(l.estagio)).length} abertos · {ehCelular ? "toque no cartão para abrir; “…” → Mover para" : "arraste o cartão para mudar de etapa"}</span>
            <Link href="/crm/importar" className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm text-foreground hover:bg-accent">Importar planilha</Link>
          </div>
          {ehCelular && (
            <div className="flex items-center gap-2">
              <label htmlFor="etapa-celular" className="text-lone-caption text-muted-foreground">Etapa</label>
              <select id="etapa-celular" className={`${campo} flex-1`} value={colunaCelular} onChange={(e) => setEtapaCelular(e.target.value)}>
                {columns.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.items.length}</option>)}
              </select>
            </div>
          )}

          <KanbanBoard<Lead>
            columns={ehCelular ? columns.filter((c) => c.id === colunaCelular) : columns}
            classeColuna="w-64 shrink-0 xl:w-auto xl:min-w-0 xl:flex-1"
            destinosExtras={[{ id: "ganho", title: ESTAGIO_META.ganho.title, color: ESTAGIO_META.ganho.color }, { id: "perdido", title: ESTAGIO_META.perdido.title, color: ESTAGIO_META.perdido.color }]}
            cabecalhoExtra={(col) => {
              const soma = col.items.reduce((s2, l) => s2 + (l.valorOrcamento ?? 0), 0);
              const atrasados = col.items.filter((l) => toqueDo(l, hoje)?.situacao === "atrasado").length;
              return (
                <span className="ml-auto mr-1 flex items-center gap-2">
                  {atrasados > 0 && <span className="rounded-full bg-lone-warning-bg px-2 py-0.5 text-lone-caption font-medium tabular-nums text-lone-warning">{atrasados} {atrasados === 1 ? "atrasado" : "atrasados"}</span>}
                  {soma > 0 && <span className="text-lone-caption font-medium tabular-nums text-muted-foreground">{brl(soma)}</span>}
                </span>
              );
            }}
            onMove={moverEstagio}
            onAdd={(colId) => setDraft({ estagio: colId as CrmEstagio, responsavel: currentUser ?? undefined })}
            onEdit={(lead) => setDraft({ ...lead })}
            onDelete={excluir}
            renderCard={(l) => {
              const passo = proximoPasso(l);
              const toque = toqueDo(l, hoje);
              const atrasoForte = !!toque && toque.situacao === "atrasado" && toque.diasAtraso >= 7;
              const atrasoLeve = !!toque && toque.situacao === "atrasado" && !atrasoForte;
              const corPasso = atrasoForte ? "bg-lone-danger-bg text-lone-danger" : atrasoLeve || passo.alerta ? "bg-lone-warning-bg text-lone-warning" : "bg-muted text-muted-foreground";
              const reuniaoPassou = l.reuniaoData && l.reuniaoData < hoje;
              return (
                <div onClick={() => setDraft({ ...l })} role="button" tabIndex={0} aria-label={`Abrir ${l.empresa || l.contatoNome}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDraft({ ...l }); } }}
                  className="cursor-pointer rounded-xl border border-border bg-background p-3 shadow-sm outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring dark:shadow-none">
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
                  {l.clienteId && (
                    <div className={`ml-1 mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-lone-caption ${l.cadastroPendente ? "bg-muted text-muted-foreground" : "bg-lone-success-bg text-lone-success"}`}>
                      <Trophy size={11} className="shrink-0" aria-hidden="true" /> {l.cadastroPendente ? "Cadastro enviado" : "Cadastrado"}
                    </div>
                  )}
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

          {/* Fechados moram na aba própria (out/2026): aqui só o atalho, com a pendência de conversão em destaque. */}
          <button onClick={() => setTab("fechados")}
            className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3.5 text-left shadow-sm transition-colors hover:border-primary/40 dark:shadow-none">
            <Trophy size={16} className="text-lone-success" aria-hidden="true" />
            <span className="text-lone-body font-medium text-foreground">Fechados</span>
            {fechadosFunil.converter.length > 0 && (
              <span className="rounded-full bg-lone-warning-bg px-2 py-0.5 text-lone-caption font-medium text-lone-warning">
                {fechadosFunil.converter.length} {fechadosFunil.converter.length === 1 ? "venda falta" : "vendas faltam"} virar cliente
              </span>
            )}
            <span className="text-lone-caption text-muted-foreground">
              {fechadosFunil.clientes.length + fechadosFunil.converter.filter((l) => (l.fechadoEm ?? "").slice(0, 7) === hoje.slice(0, 7)).length} ganhos · {fechadosFunil.perdidos.length} perdidos este mês
            </span>
            <span className="ml-auto text-lone-caption font-medium text-primary">Ver fechados →</span>
          </button>
        </>
        );
      })()}

      {tab === "fechados" && (() => {
        const f = separarFechados(leads, verTodosFechados ? null : hoje.slice(0, 7));
        const host = typeof window !== "undefined" ? window.location.host : null;
        const linha = (l: Lead, acoes: React.ReactNode, detalhe: React.ReactNode) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-lone-body font-medium text-foreground">{l.empresa || l.contatoNome}</div>
              <div className="truncate text-lone-caption text-muted-foreground">{detalhe}</div>
            </div>
            {l.valorOrcamento != null && l.valorOrcamento > 0 && <span className="shrink-0 text-lone-body tabular-nums text-foreground">{brl(l.valorOrcamento)}<span className="text-lone-caption text-muted-foreground">/mês</span></span>}
            <div className="flex shrink-0 gap-2">{acoes}</div>
          </li>
        );
        const secao = (titulo: string, apoio: string, lista: Lead[], vazio: string, render: (l: Lead) => React.ReactNode, destaque = false) => (
          <section className={`rounded-2xl border bg-card shadow-sm dark:shadow-none ${destaque && lista.length ? "border-lone-warning-border" : "border-border"}`}>
            <div className="flex flex-wrap items-baseline gap-2 px-5 py-3.5">
              <h2 className="text-lone-h2 text-foreground">{titulo}</h2>
              <span className="text-lone-caption text-muted-foreground">{lista.length} · {apoio}</span>
            </div>
            {lista.length === 0
              ? <p className="border-t border-border px-5 py-4 text-lone-caption text-muted-foreground">{vazio}</p>
              : <ul className="divide-y divide-border border-t border-border">{lista.map(render)}</ul>}
          </section>
        );
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lone-caption text-muted-foreground">Clientes novos e perdidos de</span>
              {([[false, "Este mês"], [true, "Todos"]] as const).map(([todos, rotulo]) => (
                <button key={rotulo} onClick={() => setVerTodosFechados(todos)}
                  className={`h-8 rounded-full border px-3 text-sm transition-colors ${verTodosFechados === todos ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {rotulo}
                </button>
              ))}
            </div>
            {secao("Falta enviar o cadastro", "venda fechada sem cadastro no Lone OS — fica aqui até enviar o link, de qualquer mês", f.converter,
              "Nenhuma venda esperando. Quando marcar um negócio como Ganho, ele aparece aqui.",
              (l) => linha(l, <>
                <Button size="sm" onClick={() => abrirConversao(l)} className="gap-1.5"><Trophy size={14} /> Enviar link de cadastro</Button>
                <Button size="sm" variant="outline" onClick={() => setDraft({ ...l })}>Abrir</Button>
              </>, `Ganho em ${fmtData(l.fechadoEm)}${l.contatoNome && l.contatoNome !== l.empresa ? ` · ${l.contatoNome}` : ""}`), true)}
            {secao("Cadastro enviado", "o link foi enviado e o cliente ainda não preencheu — quando preencher, entra no Lone OS sozinho", f.aguardando,
              "Nenhum cadastro esperando o cliente.",
              (l) => linha(l, <>
                <a href={linkDoCliente(l.clienteId!, host)} target={casco ? "_blank" : undefined} rel={casco ? "noreferrer" : undefined}
                  className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent">Ver o cadastro</a>
                <Button size="sm" variant="outline" onClick={() => setDraft({ ...l })}>Abrir</Button>
              </>, `Ganho em ${fmtData(l.fechadoEm)} · esperando o cliente preencher`))}
            {secao("Cadastrados", verTodosFechados ? "todos" : "este mês", f.clientes,
              verTodosFechados ? "Nenhuma venda virou cliente ainda." : "Nenhuma venda virou cliente este mês.",
              (l) => linha(l, <>
                <a href={linkDoCliente(l.clienteId!, host)} target={casco ? "_blank" : undefined} rel={casco ? "noreferrer" : undefined}
                  className="inline-flex h-8 items-center rounded-md border border-lone-success-border px-3 text-sm text-lone-success hover:bg-lone-success-bg">Ver no Lone OS</a>
                <Button size="sm" variant="outline" onClick={() => setDraft({ ...l })}>Abrir</Button>
              </>, `Ganho em ${fmtData(l.fechadoEm)}`))}
            {secao("Perdidos", verTodosFechados ? "todos" : "este mês", f.perdidos,
              verTodosFechados ? "Nenhum negócio perdido." : "Nenhum negócio perdido este mês.",
              (l) => linha(l, <Button size="sm" variant="outline" onClick={() => setDraft({ ...l })}>Abrir</Button>,
                `Perdido em ${fmtData(l.fechadoEm)}${rotuloMotivo(l.motivoPerdaCodigo) ? ` · ${rotuloMotivo(l.motivoPerdaCodigo)}` : l.motivoPerda ? ` · ${l.motivoPerda}` : ""}`))}
          </div>
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
                        className={`flex min-h-[78px] flex-col gap-0.5 rounded-xl border p-1.5 text-left transition-colors ${isHoje ? "border-primary bg-primary/5" : "border-border"} ${passado ? "cursor-default bg-muted/40" : "hover:border-primary/50"}`}>
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

          {/* Conversão por origem (lib/crm/taxas.ts): leads → oportunidades (chegaram a Proposta) → contratos.
              A fração é sobre as oportunidades; com menos de 5, "1 de 2" e sem barra cheia. */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
            <h2 className="text-lone-h2 text-foreground">Conversão por origem</h2>
            <p className="mb-4 text-lone-caption text-muted-foreground">Desde o início: quantos leads cada canal trouxe, quantos chegaram a proposta e quantos fecharam</p>
            {relatorio.porOrigem.length === 0 ? <p className="text-lone-caption text-muted-foreground">Sem leads ainda.</p> : (
              <div className="space-y-3">
                {relatorio.porOrigem.map((g) => {
                  const larg = (n: number) => `${g.leads ? (n / g.leads) * 100 : 0}%`;
                  return (
                    <div key={g.chave}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-lone-caption">
                        <span className="min-w-0 truncate text-foreground">{g.chave}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {g.leads} {g.leads === 1 ? "lead" : "leads"} · {g.oportunidades} {g.oportunidades === 1 ? "oportunidade" : "oportunidades"} · <span className="font-semibold text-foreground">{g.ganhos} {g.ganhos === 1 ? "contrato" : "contratos"}</span>
                          {g.fracao.pct !== null ? ` (${g.fracao.pct}% das oportunidades)` : ""}
                        </span>
                      </div>
                      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-muted-foreground/15" role="img" aria-label={`${g.chave}: ${g.leads} leads, ${g.oportunidades} oportunidades, ${g.ganhos} contratos`}>
                        {g.ganhos > 0 && <div className="h-full bg-lone-success" style={{ width: larg(g.ganhos) }} />}
                        {g.oportunidades - g.ganhos > 0 && <div className="h-full bg-primary" style={{ width: larg(g.oportunidades - g.ganhos) }} />}
                      </div>
                    </div>
                  );
                })}
                <p className="flex flex-wrap gap-x-3 pt-1 text-lone-caption text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-lone-success" aria-hidden="true" />contrato</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />oportunidade em aberto ou perdida</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" aria-hidden="true" />lead que não chegou a proposta</span>
                </p>
              </div>
            )}
          </section>

          {/* Por responsável */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none">
            <h2 className="text-lone-h2 text-foreground">Por responsável</h2>
            <p className="mb-3 text-lone-caption text-muted-foreground">Desde o início</p>
            {relatorio.porResponsavel.length === 0 ? <p className="text-lone-caption text-muted-foreground">Sem leads ainda.</p> : (
              <table className="w-full text-lone-body">
                <thead><tr className="text-left text-lone-caption text-muted-foreground"><th className="py-1 font-medium">Responsável</th><th className="py-1 text-right font-medium">Leads</th><th className="py-1 text-right font-medium">Oportunidades</th><th className="py-1 text-right font-medium">Contratos</th></tr></thead>
                <tbody>
                  {relatorio.porResponsavel.map((g) => (
                    <tr key={g.chave} className="border-t border-border text-foreground">
                      <td className="py-1.5">{g.chave}</td>
                      <td className="py-1.5 text-right tabular-nums">{g.leads}</td>
                      <td className="py-1.5 text-right tabular-nums">{g.oportunidades}</td>
                      <td className="py-1.5 text-right tabular-nums">{g.ganhos}{g.oportunidades ? <span className="text-muted-foreground"> · {textoFracao(g.fracao)}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Coorte por mês de entrada: dos leads que entraram em cada mês, onde estão hoje */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:shadow-none lg:col-span-2">
            <h2 className="text-lone-h2 text-foreground">Onde estão os leads de cada mês</h2>
            <p className="mb-4 text-lone-caption text-muted-foreground">Dos que entraram no mês: quantos chegaram a proposta, fecharam, se perderam ou seguem em aberto</p>
            {historico === null ? <p className="text-lone-caption text-lone-warning">{historicoErro ?? "Histórico de etapas indisponível agora."}</p> : (
              <div className="space-y-3">
                {relatorio.coorte.map((c) => (
                  <div key={c.ym}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-lone-caption">
                      <span className="font-medium capitalize text-foreground">{nomeDoMes(c.ym)}</span>
                      <span className="tabular-nums text-muted-foreground">{c.entraram} entraram · {c.oportunidade} chegaram a proposta · <span className="text-lone-success">{c.ganharam} fecharam</span> · {c.perderam} perdidos · {c.abertos} em aberto</span>
                    </div>
                    <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-muted-foreground/15" role="img" aria-label={`${nomeDoMes(c.ym)}: ${c.ganharam} fecharam, ${c.perderam} perdidos, ${c.abertos} em aberto de ${c.entraram}`}>
                      {c.entraram > 0 && [
                        { n: c.ganharam, cor: "bg-lone-success" },
                        { n: c.perderam, cor: "bg-lone-danger" },
                        { n: c.abertos, cor: "bg-primary/50" },
                      ].filter((x) => x.n > 0).map((x, i) => <div key={i} className={`h-full ${x.cor}`} style={{ flexGrow: x.n }} />)}
                    </div>
                  </div>
                ))}
                <p className="flex flex-wrap gap-x-3 pt-1 text-lone-caption text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-lone-success" aria-hidden="true" />fecharam</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-lone-danger" aria-hidden="true" />perdidos</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/50" aria-hidden="true" />em aberto</span>
                </p>
              </div>
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

      <PerguntaEnvio pendentes={enviosPendentes} onSim={(p) => responderEnvio(p, true)} onNao={(p) => responderEnvio(p, false)} />

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
          <div className="fixed inset-0 z-50 flex justify-end bg-overlay" onClick={pedirFecharFicha}>
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
                  <button onClick={pedirFecharFicha} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar (Esc)"><X size={18} /></button>
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
              <div ref={caixaConversao} className="mt-4 space-y-2 rounded-lg border border-lone-success-border bg-lone-success-bg p-3">
                {ligacao?.carregando && <p className="text-lone-caption text-muted-foreground">Conferindo se já é cliente no Lone OS…</p>}
                {ligacao?.erro && <p className="text-lone-caption text-lone-danger">{ligacao.erro}</p>}
                {ligacao && !ligacao.carregando && (ligacao.parecidos.length > 0 || ligacao.outros.length > 0) && (
                  <div className="space-y-2 rounded-md border border-border bg-background/70 p-2.5">
                    {ligacao.parecidos.length > 0 ? (
                      <>
                        <p className="text-lone-caption font-medium text-foreground">Parece que já é cliente no Lone OS:</p>
                        {ligacao.parecidos.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-lone-body text-foreground">{c.nome}</span>
                            <Button size="sm" disabled={ligando} onClick={() => ligarCliente(c)}>{ligando ? "Ligando…" : "Ligar a este cadastro"}</Button>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-lone-caption text-muted-foreground">Já é cliente no Lone OS? Ligue ao cadastro em vez de criar outro.</p>
                    )}
                    <div className="flex gap-2">
                      <select className={inputCls} aria-label="Outro cliente que já existe" value={ligacao.escolhido} onChange={(e) => setLigacao({ ...ligacao, escolhido: e.target.value })}>
                        <option value="">{ligacao.parecidos.length ? "É outro cliente que já existe…" : "Escolher o cliente que já existe…"}</option>
                        {ligacao.outros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                      <Button size="sm" variant="outline" disabled={!ligacao.escolhido || ligando}
                        onClick={() => { const c = ligacao.outros.find((x) => x.id === ligacao.escolhido); if (c) ligarCliente(c); }}>Ligar</Button>
                    </div>
                  </div>
                )}
                <p className="text-lone-caption font-medium text-foreground">{ligacao?.parecidos.length ? "Não é nenhum desses? Crie o cliente novo — o que ele contratou?" : "O que o cliente contratou?"}</p>
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
                    {convertendo ? "Criando…" : "Criar cadastro e enviar link"}
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
                      onKeyDown={(e) => { if (e.key === "Enter" && novoTexto.trim()) registrarNoHistorico(); }}
                      disabled={enviandoNota}
                    />
                    <Button size="sm" disabled={!novoTexto.trim() || enviandoNota} onClick={registrarNoHistorico} aria-label="Registrar">
                      <Send size={14} />
                    </Button>
                  </div>
                  <div className="mt-5 space-y-0">
                    {loadingAtiv ? (
                      <p className="text-xs text-muted-foreground">Carregando…</p>
                    ) : atividadesErro ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2" role="alert">
                        <p className="min-w-0 flex-1 text-lone-caption text-lone-danger">Não consegui carregar o histórico ({atividadesErro}). Nada foi apagado.</p>
                        <Button size="sm" variant="outline" onClick={() => setRecargaAtiv((n) => n + 1)}>Tentar de novo</Button>
                      </div>
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
              {draft.id && (draft.clienteId ? (
                // Cadastro ligado (criado aqui ou ligado pelo nome): em qualquer etapa mostra em que pé está.
                <a href={linkDoCliente(draft.clienteId, typeof window !== "undefined" ? window.location.host : null)}
                  target={casco ? "_blank" : undefined} rel={casco ? "noreferrer" : undefined}
                  className={`mr-auto inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm ${draft.cadastroPendente ? "border-border text-foreground hover:bg-accent" : "border-lone-success-border text-lone-success hover:bg-lone-success-bg"}`}>
                  <Trophy size={14} /> {draft.cadastroPendente ? "Cadastro enviado — ver" : "Já é cliente — abrir ficha"}
                </a>
              ) : draft.estagio === "ganho" && (
                <Button
                  variant="outline"
                  onClick={() => abrirConversao(draft as Lead)}
                  disabled={convertendo}
                  className="mr-auto flex items-center gap-1.5 border-lone-success-border text-lone-success hover:bg-lone-success-bg"
                >
                  <Trophy size={14} /> {convertendo ? "Criando…" : "Enviar link de cadastro"}
                </Button>
              ))}
              <Button variant="ghost" onClick={pedirFecharFicha}>Cancelar</Button>
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
