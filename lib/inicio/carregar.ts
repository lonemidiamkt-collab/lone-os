// lib/inicio/carregar.ts — a LEITURA do Início, num lote só. Server-only.
//
// Uma onda de consultas em paralelo, e só as que o papel usa: o designer não lê conta de anúncio,
// o tráfego não lê pedido de arte, o comercial não lê carteira de conteúdo. Cada fonte que falhar
// vira um nome em `falhas` (a tela avisa) — nunca um zero silencioso. Sem clientes não há Início:
// essa falha sobe como erro.
//
// Colunas escolhidas a dedo: nada de valor de contrato, fee ou orçamento de proposta. A verba do
// cliente (`ad_accounts.monthly_budget`) entra só para o motor de saldo calcular "% da verba".

import { supabaseAdmin } from "@/lib/supabase/server";
import { GESTAO, type Papel } from "@/lib/api/require-role";
import { hojeSP } from "@/lib/clients/pausa";
import { DEFAULT_ALERT_CONFIG } from "@/lib/budgets/alert-engine";
import type {
  AnomaliaRow, CardRow, ClienteRow, ConfigAlertaRow, ContaRow, ContratoRow, Dados, DemandaRow, EventoRow,
  LeadRow, MembroRow, PedidoArteRow, RejeicaoRow, TarefaRow,
} from "./dados";
import { DADOS_VAZIOS, DIA_MS } from "./dados";
import { DIAS_EVENTO } from "./regras";

const COLS_CLIENTE = "id, name, nome_fantasia, logo, doc_logo, status, active, churned_at, draft_status, paused_at, paused_until, created_at, assigned_social, assigned_traffic, assigned_designer, service_type, current_health_level, current_health_score, last_client_msg_at, agente_ativo, meta_ad_account_id, public_report_enabled, instagram_user, last_post_date";
const COLS_CARD = "id, client_id, title, status, due_date, social_media, designer_delivered_at, social_confirmed_at, client_approved_at, status_changed_at, column_entered_at, publish_verified_at, alteracao_pendente_em";

type Resultado<T> = { data: T[] | null; error: { message: string } | null };

export interface Leitura { dados: Dados; falhas: string[]; nome: string | null }

/** Que fontes cada papel usa. Gestão lê tudo menos o CRM (tem tela própria). */
function fontesDo(papel: Papel) {
  const gestao = GESTAO.includes(papel);
  return {
    cards: gestao || papel === "social" || papel === "designer",
    demandas: gestao || papel === "social",
    design: gestao || papel === "designer",
    trafego: gestao || papel === "traffic",
    contratos: gestao,
    leads: papel === "comercial",
    eventos: gestao || papel === "social",
    saude: gestao || papel === "social" || papel === "traffic",
  };
}

export async function carregarDados(papel: Papel, email: string, agora = new Date()): Promise<Leitura> {
  const f = fontesDo(papel);
  const hoje = hojeSP(agora);
  const mais = (n: number) => hojeSP(new Date(agora.getTime() + n * DIA_MS));
  // Publicado entra só se for recente: o mês corrente (contagem) e as duas últimas semanas (lacuna
  // da semana que cruza a virada do mês). O histórico inteiro de publicados não serve pra nada aqui.
  const desde = [`${hoje.slice(0, 7)}-01`, mais(-14)].sort()[0];
  const falhas: string[] = [];
  const ler = async <T,>(rotulo: string, q: PromiseLike<Resultado<T>>): Promise<T[]> => {
    try {
      const r = await q;
      if (r.error) { falhas.push(rotulo); return []; }
      return r.data ?? [];
    } catch {
      falhas.push(rotulo);
      return [];
    }
  };

  const db = supabaseAdmin;
  const [
    clientesRes, time, cards, demandas, pedidosArte, rejeicoes, tarefas, contas, configAlerta, anomalias,
    contratos, leads, eventos, ajustesRows, saudeRows,
  ] = await Promise.all([
    db.from("clients").select(COLS_CLIENTE).or("active.is.null,active.eq.true") as unknown as PromiseLike<Resultado<ClienteRow>>,
    ler<{ name: string; email: string | null; role: string | null; is_active: boolean | null; deleted_at: string | null }>("equipe",
      db.from("team_members").select("name, email, role, is_active, deleted_at") as never),
    f.cards
      ? ler<CardRow>("cards de conteúdo", db.from("content_cards").select(COLS_CARD).is("archived_at", null)
          .or(`status.neq.published,status_changed_at.gte.${desde},publish_verified_at.gte.${desde}`).limit(5000) as never)
      : Promise.resolve([] as CardRow[]),
    f.demandas
      ? ler<DemandaRow>("pedidos do grupo", db.from("cs_demandas").select("codigo, client_id, cliente_nome, tipo, resumo, created_at, responsavel")
          .eq("status", "pendente").limit(500) as never)
      : Promise.resolve([] as DemandaRow[]),
    f.design
      ? ler<PedidoArteRow>("pedidos de arte", db.from("design_requests").select("id, title, client_id, status, assigned_designer, deadline, content_card_id")
          .neq("status", "done").limit(2000) as never)
      : Promise.resolve([] as PedidoArteRow[]),
    f.design
      ? ler<RejeicaoRow>("alterações", db.from("content_approvals").select("card_id, reviewed_at").eq("status", "rejected")
          .order("reviewed_at", { ascending: false }).limit(300) as never)
      : Promise.resolve([] as RejeicaoRow[]),
    ler<TarefaRow>("tarefas", db.from("tasks").select("id, title, client_id, client_name, assigned_to, role, due_date, priority, status")
      .neq("status", "done").not("due_date", "is", null).lt("due_date", hoje).limit(2000) as never),
    f.trafego
      ? ler<ContaRow>("contas de anúncio", db.from("ad_accounts").select("id, client_id, meta_account_id, account_status, sync_error, last_balance, is_prepaid, monthly_budget, current_month_spend, last_3d_avg_spend") as never)
      : Promise.resolve([] as ContaRow[]),
    f.trafego
      ? ler<ConfigAlertaRow>("config de alertas", db.from("client_alert_config").select("client_id, verba_minima, alert_verba_baixa, alert_verba_zerada, alert_erro_conta, alert_sem_gasto") as never)
      : Promise.resolve([] as ConfigAlertaRow[]),
    f.trafego
      ? ler<AnomaliaRow>("quedas de resultado", db.from("anomaly_alerts").select("client_id, metric, severity, percent_change")
          .is("acknowledged_at", null).in("severity", ["critical", "high"])
          .gte("detected_at", new Date(agora.getTime() - 2 * DIA_MS).toISOString()).limit(500) as never)
      : Promise.resolve([] as AnomaliaRow[]),
    f.contratos
      ? ler<ContratoRow>("contratos", db.from("contracts").select("client_id, end_date").eq("status", "active")
          .gte("end_date", hoje).lte("end_date", mais(30)) as never)
      : Promise.resolve([] as ContratoRow[]),
    f.leads
      ? ler<LeadRow>("leads", db.from("crm_leads").select("id, contato_nome, empresa, estagio, responsavel, proximo_contato, reuniao_data, fechado_em").limit(3000) as never)
      : Promise.resolve([] as LeadRow[]),
    f.eventos
      ? ler<EventoRow>("datas dos clientes", db.from("cs_client_events").select("client_id, titulo, event_date").eq("status", "ativo")
          .gte("event_date", hoje).lte("event_date", mais(DIAS_EVENTO)).limit(200) as never)
      : Promise.resolve([] as EventoRow[]),
    ler<{ key: string; value: string | null }>("ajustes", db.from("agency_settings").select("key, value")
      .in("key", ["traffic_alert_warning_pct", "traffic_alert_critical_pct", "hidden_ad_accounts", "meta_token_critical"]) as never),
    // O porquê da saúde: breakdown das notas recentes em risco/atenção (a mais nova de cada cliente).
    f.saude
      ? ler<{ client_id: string; computed_for_date: string; breakdown: { motivos?: unknown } | null }>("motivos da saúde",
          db.from("client_health_scores").select("client_id, computed_for_date, breakdown").in("level", ["risco", "atencao"])
            .gte("computed_for_date", mais(-7)).order("computed_for_date", { ascending: false }).limit(1000) as never)
      : Promise.resolve([]),
  ]);

  if (clientesRes.error) throw new Error(`clients: ${clientesRes.error.message}`);

  const eu = time.find((m) => (m.email ?? "").toLowerCase() === email.toLowerCase());
  const membros: MembroRow[] = time
    .filter((m) => m.name && m.is_active !== false && !m.deleted_at)
    .map((m) => ({ nome: m.name, papel: (m.role as Papel) ?? null }));

  const ajuste = new Map(ajustesRows.map((r) => [r.key, r.value]));
  const num = (v: string | null | undefined, padrao: number) => { const n = v != null ? parseFloat(v) : NaN; return Number.isFinite(n) ? n : padrao; };
  let ocultas: string[] = [];
  try { const v = JSON.parse(ajuste.get("hidden_ad_accounts") ?? "[]"); ocultas = Array.isArray(v) ? v.map(String) : []; } catch { ocultas = []; }

  const motivosSaude: Record<string, string[]> = {};
  for (const h of saudeRows) {
    if (motivosSaude[h.client_id]) continue; // ordenado do mais novo: o primeiro vale
    const m = h.breakdown?.motivos;
    motivosSaude[h.client_id] = Array.isArray(m) ? m.map(String).filter(Boolean) : [];
  }

  return {
    nome: eu?.name ?? null,
    falhas,
    dados: {
      ...DADOS_VAZIOS,
      clientes: clientesRes.data ?? [],
      cards, demandas, pedidosArte, rejeicoes, tarefas, contas, configAlerta, anomalias, contratos, leads, eventos,
      motivosSaude,
      time: membros,
      ajustes: {
        warningPct: num(ajuste.get("traffic_alert_warning_pct"), DEFAULT_ALERT_CONFIG.warningPct),
        criticalPct: num(ajuste.get("traffic_alert_critical_pct"), DEFAULT_ALERT_CONFIG.criticalPct),
        contasOcultas: ocultas,
        tokenMetaCritico: f.trafego && ajuste.get("meta_token_critical") === "true",
      },
    },
  };
}
