// lib/inicio/dados.ts — as linhas que o Início lê do banco e o contexto comum às regras.
// PURO: nenhum I/O aqui. `carregar.ts` busca; regras e resumos só recebem.

import type { Papel } from "@/lib/api/require-role";
import { canonizarDono } from "@/lib/cs/cobranca-nominal";
import { estaPausado, hojeSP } from "@/lib/clients/pausa";
import { logoDoCliente } from "@/lib/notificacoes/visual";
import type { ClienteRefItem } from "./tipos";

export interface ClienteRow {
  id: string;
  name: string | null;
  nome_fantasia: string | null;
  logo: string | null;
  doc_logo: string | null;
  status: string | null;
  active: boolean | null;
  churned_at: string | null;
  draft_status: string | null;
  paused_at: string | null;
  paused_until: string | null;
  created_at: string | null;
  assigned_social: string | null;
  assigned_traffic: string | null;
  assigned_designer: string | null;
  service_type: string | null;
  current_health_level: string | null;
  current_health_score: number | null;
  last_client_msg_at: string | null;
  agente_ativo: boolean | null;
  meta_ad_account_id: string | null;
  public_report_enabled: boolean | null;
  instagram_user: string | null;
  last_post_date: string | null;
}

export interface CardRow {
  id: string;
  client_id: string | null;
  title: string | null;
  status: string | null;
  due_date: string | null;
  social_media: string | null;
  designer_delivered_at: string | null;
  social_confirmed_at: string | null;
  client_approved_at: string | null;
  status_changed_at: string | null;
  column_entered_at: Record<string, string> | null;
  publish_verified_at: string | null;
  /** Leva 5b: alteração pedida e ainda não reentregue (a transição de design grava). */
  alteracao_pendente_em?: string | null;
}

export interface DemandaRow {
  codigo: string | null;
  client_id: string | null;
  cliente_nome: string | null;
  tipo: string | null;
  resumo: string | null;
  created_at: string | null;
  responsavel: string | null;
}

export interface PedidoArteRow {
  id: string;
  title: string | null;
  client_id: string | null;
  status: string | null;
  assigned_designer: string | null;
  deadline: string | null;
  content_card_id: string | null;
}

export interface RejeicaoRow { card_id: string; reviewed_at: string | null }

export interface TarefaRow {
  id: string;
  title: string | null;
  client_id: string | null;
  client_name: string | null;
  assigned_to: string | null;
  role: string | null;
  due_date: string | null;
  priority: string | null;
  status: string | null;
}

/** ad_accounts — `monthly_budget` só entra na conta do alerta de saldo; nunca sai no payload. */
export interface ContaRow {
  id: string;
  client_id: string | null;
  meta_account_id: string | null;
  account_status: number | null;
  sync_error: string | null;
  last_balance: number | null;
  is_prepaid: boolean | null;
  monthly_budget: number | null;
  current_month_spend: number | null;
  last_3d_avg_spend: number | null;
}

export interface ConfigAlertaRow {
  client_id: string;
  verba_minima: number | null;
  alert_verba_baixa: boolean | null;
  alert_verba_zerada: boolean | null;
  alert_erro_conta: boolean | null;
  alert_sem_gasto: boolean | null;
}

export interface AnomaliaRow {
  client_id: string | null;
  metric: string | null;
  severity: string | null;
  percent_change: number | null;
}

export interface ContratoRow { client_id: string | null; end_date: string | null }

/** crm_leads — sem valor_orcamento de propósito (é dinheiro da agência). */
export interface LeadRow {
  id: string;
  contato_nome: string | null;
  empresa: string | null;
  estagio: string | null;
  responsavel: string | null;
  proximo_contato: string | null;
  reuniao_data: string | null;
  fechado_em: string | null;
}

export interface EventoRow { client_id: string | null; titulo: string | null; event_date: string | null }

export interface MembroRow { nome: string; papel: Papel | null }

export interface Ajustes {
  warningPct: number;
  criticalPct: number;
  /** meta_account_id (ou id) das contas ocultas na tela de Tráfego. */
  contasOcultas: string[];
  tokenMetaCritico: boolean;
}

export interface Dados {
  clientes: ClienteRow[];
  cards: CardRow[];
  demandas: DemandaRow[];
  pedidosArte: PedidoArteRow[];
  rejeicoes: RejeicaoRow[];
  tarefas: TarefaRow[];
  contas: ContaRow[];
  configAlerta: ConfigAlertaRow[];
  anomalias: AnomaliaRow[];
  contratos: ContratoRow[];
  leads: LeadRow[];
  eventos: EventoRow[];
  /** client_id → breakdown.motivos da última nota gravada. */
  motivosSaude: Record<string, string[]>;
  time: MembroRow[];
  ajustes: Ajustes;
}

export const DADOS_VAZIOS: Dados = {
  clientes: [], cards: [], demandas: [], pedidosArte: [], rejeicoes: [], tarefas: [], contas: [],
  configAlerta: [], anomalias: [], contratos: [], leads: [], eventos: [], motivosSaude: {}, time: [],
  ajustes: { warningPct: 20, criticalPct: 5, contasOcultas: [], tokenMetaCritico: false },
};

// ── Contexto ────────────────────────────────────────────────────────────────

export const DIA_MS = 86_400_000;

export const ehTeste = (nome?: string | null) => /\(teste\)/i.test(nome || "");

export const nomeDoCliente = (c: Pick<ClienteRow, "name" | "nome_fantasia">) =>
  (c.nome_fantasia || c.name || "Cliente").trim();

export interface Contexto {
  agora: Date;
  agoraMs: number;
  /** YYYY-MM-DD em São Paulo. */
  hoje: string;
  /** Carteira do time: ativo, sem churn, sem rascunho, sem "(teste)". Pausado entra. */
  vivos: ClienteRow[];
  /** Os vivos que não estão pausados — só estes geram alerta (pausado não recebe nada). */
  ativos: ClienteRow[];
  porId: Map<string, ClienteRow>;
  /** Nome escrito de qualquer jeito → nome do cadastro do time (ou como veio). */
  canon: (nome: string | null | undefined) => string | null;
  /** Papel de alguém do time pelo nome do cadastro. */
  papelDe: (nome: string | null | undefined) => Papel | null;
  ref: (c: ClienteRow) => ClienteRefItem;
}

/** "Julio e Roberto" → "Julio"; depois casa contra o time (primeiro nome único, sucessão). */
export function canonizador(time: MembroRow[]): (nome: string | null | undefined) => string | null {
  const nomes = time.map((m) => m.nome).filter(Boolean);
  return (nome) => {
    const primeiro = (nome ?? "").split(/\s+e\s+|\s*[,/&]\s*/)[0]?.trim() ?? "";
    return canonizarDono(primeiro || null, nomes);
  };
}

export function montarContexto(d: Dados, agora: Date): Contexto {
  const vivos = d.clientes.filter((c) =>
    c.active !== false && !c.churned_at && !c.draft_status && !ehTeste(c.name) && !ehTeste(c.nome_fantasia));
  const ativos = vivos.filter((c) => !estaPausado(c, agora));
  return {
    agora,
    agoraMs: agora.getTime(),
    hoje: hojeSP(agora),
    vivos,
    ativos,
    porId: new Map(vivos.map((c) => [c.id, c])),
    canon: canonizador(d.time),
    papelDe: (nome) => d.time.find((m) => mesmaPessoa(m.nome, nome))?.papel ?? null,
    ref: (c) => ({ id: c.id, nome: nomeDoCliente(c), logo: logoDoCliente({ logo: c.logo, docLogo: c.doc_logo }) }),
  };
}

/** Dias de calendário entre duas datas YYYY-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / DIA_MS);
}

/** Dias inteiros desde um instante ISO. */
export function diasDesde(iso: string | null | undefined, agoraMs: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((agoraMs - t) / DIA_MS)) : 0;
}

export const mesmaPessoa = (a: string | null | undefined, b: string | null | undefined) => {
  const n = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return !!n(a) && n(a) === n(b);
};

export const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
export const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
