// lib/traffic/hoje/carregar.ts — a LEITURA da aba "Hoje" do Tráfego, num lote só. Server-only.
//
// Só lê o que o servidor já sincronizou: ad_accounts (sync-saldos, de 2 em 2h), anomaly_alerts e
// metric_snapshots (defense-scan, a cada 15 min), client_alert_config, o diagnóstico diário e os
// vistos. Nenhuma chamada à Meta daqui — nem do navegador.
//
// Cada fonte que falhar vira um nome em `falhas` (a tela avisa) — nunca um zero silencioso. Sem
// clientes não há Hoje: essa falha sobe como erro.

import { supabaseAdmin } from "@/lib/supabase/server";
import { canonizador } from "@/lib/inicio/dados";
import { montarDiagnostico } from "@/lib/traffic/diagnostico";
import { hojeSP } from "@/lib/clients/pausa";
import type { RespostaHoje } from "./tipos";
import {
  AJUSTES_PADRAO, montarLinhas, ontemSP, somarDias,
  type AnomaliaHojeRow, type ClienteHojeRow, type ConfigHojeRow, type ContaHojeRow, type ItemDiagnosticoHoje, type MetricaDiaRow,
} from "./montar";
import { carregarVistos } from "./vistos";
import { carregarReferencias, type ReferenciasCarregadas } from "@/lib/traffic/referencia-nicho-server";
import { faltaNoBanco } from "@/lib/trafego/anuncios-server";

const COLS_CLIENTE = "id, name, nome_fantasia, logo, doc_logo, active, churned_at, draft_status, paused_at, paused_until, service_type, assigned_traffic, meta_ad_account_id";
const COLS_CONTA = "id, client_id, meta_account_id, account_status, sync_error, last_balance, is_prepaid, monthly_budget, current_month_spend, last_3d_avg_spend, last_synced_at";

type Resultado<T> = { data: T[] | null; error: { message: string } | null };

// O diagnóstico lê 7 dias de anúncios de todas as contas: é o mais pesado daqui. Muda devagar (dias
// fechados), então vale guardar por alguns minutos em vez de refazer a cada abertura da aba.
const DIAG_TTL_MS = 10 * 60_000;
let cacheDiagnostico: { em: number; dia: string; itens: ItemDiagnosticoHoje[] } | null = null;

async function diagnosticoDoDia(agora: Date): Promise<ItemDiagnosticoHoje[]> {
  const dia = hojeSP(agora);
  if (cacheDiagnostico && cacheDiagnostico.dia === dia && agora.getTime() - cacheDiagnostico.em < DIAG_TTL_MS) {
    return cacheDiagnostico.itens;
  }
  const d = await montarDiagnostico(agora);
  const itens = d.funcoes.flatMap((f) => f.itens.map((i) => ({
    clientId: i.clientId, funcao: f.nome, achado: i.achado, acao: i.acao, prioridade: i.prioridade,
  })));
  cacheDiagnostico = { em: agora.getTime(), dia, itens };
  return itens;
}

/**
 * metric_snapshots com o resultado pelo objetivo (results/result_kind, Leva 7A). Antes da migração
 * dessas colunas, lê só as de sempre — o Hoje continua funcionando, contando conversas.
 */
export async function lerMetricasDiarias(desde: string, ate: string): Promise<Resultado<MetricaDiaRow>> {
  const consulta = (cols: string) => supabaseAdmin.from("metric_snapshots").select(cols)
    .gte("metric_date", desde).lte("metric_date", ate).limit(5000);
  const r = await consulta("client_id, metric_date, spend, conversions, results, result_kind");
  if (r.error && faltaNoBanco(r.error)) {
    return (await consulta("client_id, metric_date, spend, conversions")) as unknown as Resultado<MetricaDiaRow>;
  }
  return r as unknown as Resultado<MetricaDiaRow>;
}

// A referência muda devagar (30 dias fechados): guarda por 30 min em vez de reler a cada abertura.
const REF_TTL_MS = 30 * 60_000;
let cacheReferencias: { em: number; ontem: string; dados: ReferenciasCarregadas } | null = null;
async function referenciasDoDia(ontem: string): Promise<ReferenciasCarregadas> {
  if (cacheReferencias && cacheReferencias.ontem === ontem && Date.now() - cacheReferencias.em < REF_TTL_MS) return cacheReferencias.dados;
  const dados = await carregarReferencias(ontem);
  cacheReferencias = { em: Date.now(), ontem, dados };
  return dados;
}

export async function carregarHoje(email: string, agora = new Date()): Promise<RespostaHoje> {
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

  const ontem = ontemSP(agora);
  const db = supabaseAdmin;
  const [clientesRes, time, contas, configs, anomalias, metricas, ajustesRows, vistos, diagnostico, referencias] = await Promise.all([
    db.from("clients").select(COLS_CLIENTE).or("active.is.null,active.eq.true") as unknown as PromiseLike<Resultado<ClienteHojeRow>>,
    ler<{ name: string; email: string | null; role: string | null; is_active: boolean | null; deleted_at: string | null }>("equipe",
      db.from("team_members").select("name, email, role, is_active, deleted_at") as never),
    ler<ContaHojeRow>("contas de anúncio", db.from("ad_accounts").select(COLS_CONTA) as never),
    ler<ConfigHojeRow>("config de alertas", db.from("client_alert_config").select("*") as never),
    ler<AnomaliaHojeRow>("quedas de resultado", db.from("anomaly_alerts").select("client_id, metric, severity, percent_change")
      .is("acknowledged_at", null).in("severity", ["critical", "high"])
      .gte("detected_at", new Date(agora.getTime() - 2 * 86_400_000).toISOString()).limit(500) as never),
    ler<MetricaDiaRow>("resultados diários", lerMetricasDiarias(somarDias(ontem, -7), ontem) as never),
    ler<{ key: string; value: string | null }>("ajustes", db.from("agency_settings").select("key, value")
      .in("key", ["traffic_alert_warning_pct", "traffic_alert_critical_pct", "hidden_ad_accounts"]) as never),
    carregarVistos(),
    diagnosticoDoDia(agora).catch((err) => {
      console.error("[trafego/hoje] diagnóstico:", err instanceof Error ? err.message : err);
      falhas.push("diagnóstico diário");
      return [] as ItemDiagnosticoHoje[];
    }),
    // Leva 7A (N6): mediana anônima do nicho (30 dias) para pôr ao lado do custo de cada cliente.
    referenciasDoDia(ontem).catch((err) => {
      console.error("[trafego/hoje] referência por nicho:", err instanceof Error ? err.message : err);
      falhas.push("referência por nicho");
      return null;
    }),
  ]);

  if (clientesRes.error) throw new Error(`clients: ${clientesRes.error.message}`);

  const membros = time.filter((m) => m.name && m.is_active !== false && !m.deleted_at);
  const canon = canonizador(membros.map((m) => ({ nome: m.name, papel: null })));
  const eu = time.find((m) => (m.email ?? "").toLowerCase() === email.toLowerCase())?.name ?? null;

  const ajuste = new Map(ajustesRows.map((r) => [r.key, r.value]));
  const numero = (v: string | null | undefined, padrao: number) => { const n = v != null ? parseFloat(v) : NaN; return Number.isFinite(n) ? n : padrao; };
  let ocultas: string[] = [];
  try { const v = JSON.parse(ajuste.get("hidden_ad_accounts") ?? "[]"); ocultas = Array.isArray(v) ? v.map(String) : []; } catch { ocultas = []; }

  const linhas = montarLinhas({
    agora, ontem,
    clientes: clientesRes.data ?? [],
    contas, configs, anomalias, metricas, diagnostico,
    vistos: vistos.mapa,
    ajustes: {
      warningPct: numero(ajuste.get("traffic_alert_warning_pct"), AJUSTES_PADRAO.warningPct),
      criticalPct: numero(ajuste.get("traffic_alert_critical_pct"), AJUSTES_PADRAO.criticalPct),
      contasOcultas: ocultas,
    },
    eu: canon(eu) ?? eu,
    canon,
  });

  if (referencias) {
    for (const l of linhas) {
      const meu = referencias.porCliente.get(l.clientId);
      if (!meu) continue;
      l.numeros.proprio30d = { custo: meu.m.custo, ctr: meu.m.ctr, cpm: meu.m.cpm };
      const ref = meu.nicho ? referencias.porNicho.get(meu.nicho) : undefined;
      l.numeros.referenciaNicho = ref && meu.rotuloNicho
        ? { nicho: meu.rotuloNicho, custo: ref.custo[meu.m.tipo]?.valor ?? null, ctr: ref.ctr, cpm: ref.cpm, clientes: ref.clientes }
        : null;
    }
  }

  const sincronizadoEm = contas.map((a) => a.last_synced_at).filter((x): x is string => !!x).sort().pop() ?? null;

  return {
    geradoEm: agora.toISOString(),
    sincronizadoEm,
    ontem,
    eu: canon(eu) ?? eu,
    linhas,
    vistoDisponivel: vistos.disponivel,
    falhas,
  };
}
