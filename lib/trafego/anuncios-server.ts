// lib/trafego/anuncios-server.ts — o servidor lê a Meta pela aba "Anúncios Meta" e guarda.
//
// Uma leitura = `fetchCampaignInsights` + `fetchAccountDemographics` de lib/meta/insights-server.ts
// (as MESMAS funções do relatório semanal: janela de atribuição 7d_click, paginação de campanhas,
// lotes de 6). O resultado vai para `meta_campaign_cache` (cliente+período). A aba só lê de lá.
//
// Regras:
//  - Falha NÃO apaga a última leitura boa: grava só o erro e a hora da tentativa.
//  - Duas pessoas pedindo o mesmo cliente+período ao mesmo tempo esperam a MESMA leitura.
//  - No máximo MAX_SIMULTANEAS leituras diferentes rodando no servidor (cada uma são ~3 chamadas
//    por campanha na Graph API).
//  - Antes da migração 20260924160000 existir, guarda em memória do processo (some no deploy) — a
//    aba funciona, só não sobrevive a um restart.

import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchCampaignInsights, fetchAccountDemographics, TokenExpiredError } from "@/lib/meta/insights-server";
import {
  argumentosMeta, chavePeriodo, estadoDoToken, mensagemConexao, ERRO_TOKEN,
  type EstadoConexao, type Periodo,
} from "@/lib/trafego/anuncios";

const TABELA = "meta_campaign_cache";
export const MAX_SIMULTANEAS = 4;

export interface LinhaCache {
  client_id: string;
  period: string;
  meta_ad_account_id: string | null;
  campaigns: unknown[];
  demographics: unknown | null;
  synced_at: string | null;
  attempted_at: string | null;
  error: string | null;
}

export type ResultadoSync =
  | { ok: true; linha: LinhaCache }
  | { ok: false; erro: string; linha: LinhaCache | null; conexao?: EstadoConexao };

// Estado do processo (sobrevive a recarga do módulo no dev; em produção é um processo só).
interface EstadoProcesso {
  memoria: Map<string, LinhaCache>;
  emAndamento: Map<string, Promise<ResultadoSync>>;
}
const G = globalThis as unknown as { __loneAnunciosMeta?: EstadoProcesso };
function proc(): EstadoProcesso {
  if (!G.__loneAnunciosMeta) G.__loneAnunciosMeta = { memoria: new Map(), emAndamento: new Map() };
  return G.__loneAnunciosMeta;
}

const chaveLinha = (clientId: string, period: string) => `${clientId}|${period}`;

/** A tabela (ou a coluna) ainda não existe — a migração não foi aplicada. */
export function faltaNoBanco(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "42P01" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST204"
    || /does not exist|schema cache/i.test(e.message ?? "");
}

// ─── Conexão ────────────────────────────────────────────────────────────────

export interface ConexaoMeta {
  estado: EstadoConexao;
  /** ms desde epoch; null = sem data registrada. */
  expiraEm: number | null;
  tipo: "short" | "long" | null;
}

/** Estado do token da agência, SEM devolver o token. */
export async function lerConexao(): Promise<ConexaoMeta & { token: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("agency_settings").select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at", "meta_token_type"]);
  if (error) throw new Error(error.message);
  const m = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = m.get("meta_token") || null;
  const exp = m.get("meta_token_expires_at") ? parseInt(m.get("meta_token_expires_at")!, 10) : null;
  const expiraEm = exp != null && Number.isFinite(exp) ? exp : null;
  const tipo = m.get("meta_token_type") === "long" ? "long" : m.get("meta_token_type") === "short" ? "short" : null;
  return { estado: estadoDoToken(token, expiraEm, Date.now()), expiraEm, tipo, token };
}

// ─── Cache ──────────────────────────────────────────────────────────────────

/** Linhas guardadas do período para esses clientes. `persistente` = veio do banco (migração aplicada). */
export async function lerCache(clientIds: string[], period: string): Promise<{ linhas: LinhaCache[]; persistente: boolean }> {
  if (clientIds.length === 0) return { linhas: [], persistente: true };
  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .select("client_id, period, meta_ad_account_id, campaigns, demographics, synced_at, attempted_at, error")
    .eq("period", period)
    .in("client_id", clientIds);
  if (error) {
    if (!faltaNoBanco(error)) throw new Error(error.message);
    const mem = proc().memoria;
    return {
      linhas: clientIds.map((id) => mem.get(chaveLinha(id, period))).filter((l): l is LinhaCache => !!l),
      persistente: false,
    };
  }
  return { linhas: (data ?? []) as LinhaCache[], persistente: true };
}

async function lerLinha(clientId: string, period: string): Promise<LinhaCache | null> {
  const { linhas } = await lerCache([clientId], period);
  return linhas[0] ?? null;
}

/** Grava (merge). Sem a tabela, guarda em memória. Devolve a linha como ficou. */
async function gravar(parcial: Partial<LinhaCache> & { client_id: string; period: string }): Promise<LinhaCache> {
  const chave = chaveLinha(parcial.client_id, parcial.period);
  const mem = proc().memoria;
  const anterior = mem.get(chave);
  const base: LinhaCache = anterior ?? {
    client_id: parcial.client_id, period: parcial.period, meta_ad_account_id: null,
    campaigns: [], demographics: null, synced_at: null, attempted_at: null, error: null,
  };

  const { data, error } = await supabaseAdmin.from(TABELA)
    .upsert(parcial, { onConflict: "client_id,period" })
    .select("client_id, period, meta_ad_account_id, campaigns, demographics, synced_at, attempted_at, error")
    .maybeSingle();
  if (!error && data) {
    mem.delete(chave); // o banco é a verdade; memória só serve enquanto a tabela não existe
    return data as LinhaCache;
  }
  if (error && !faltaNoBanco(error)) console.error(`[anuncios] gravar ${chave}:`, error.message);
  const linha = { ...base, ...parcial } as LinhaCache;
  mem.set(chave, linha);
  return linha;
}

/** A última tentativa (boa ou não) deste cliente+período — base do intervalo mínimo. */
export async function ultimaTentativa(clientId: string, period: string): Promise<string | null> {
  return (await lerLinha(clientId, period))?.attempted_at ?? null;
}

// ─── Sincronização ──────────────────────────────────────────────────────────

export function emAndamento(clientId: string, period: string): boolean {
  return proc().emAndamento.has(chaveLinha(clientId, period));
}

export function simultaneas(): number {
  return proc().emAndamento.size;
}

function contaGraph(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return s.startsWith("act_") ? s : `act_${s}`;
}

async function executar(clientId: string, periodo: Periodo): Promise<ResultadoSync> {
  const period = chavePeriodo(periodo);
  const { data: cli, error: cErr } = await supabaseAdmin
    .from("clients").select("id, meta_ad_account_id").eq("id", clientId).maybeSingle();
  if (cErr) return { ok: false, erro: cErr.message, linha: null };
  if (!cli) return { ok: false, erro: "Cliente não encontrado.", linha: null };
  const conta = contaGraph(cli.meta_ad_account_id as string | null);
  if (!conta) return { ok: false, erro: "Cliente sem conta de anúncio Meta vinculada.", linha: null };

  const conexao = await lerConexao();
  if (conexao.estado !== "ok" || !conexao.token) {
    return { ok: false, erro: mensagemConexao(conexao.estado) ?? "Sem conexão com a Meta.", linha: await lerLinha(clientId, period), conexao: conexao.estado };
  }

  const agora = new Date().toISOString();
  const { dias, de, ate } = argumentosMeta(periodo);
  try {
    const [campanhas, demografia] = await Promise.all([
      fetchCampaignInsights(conexao.token, conta, dias, de, ate),
      fetchAccountDemographics(conexao.token, conta, dias, de, ate).catch(() => null),
    ]);
    const linha = await gravar({
      client_id: clientId, period, meta_ad_account_id: conta,
      campaigns: campanhas as unknown[], demographics: demografia,
      synced_at: agora, attempted_at: agora, error: null,
    });
    return { ok: true, linha };
  } catch (e) {
    const tokenRecusado = e instanceof TokenExpiredError;
    const erro = tokenRecusado ? ERRO_TOKEN : (e instanceof Error ? e.message : String(e)).slice(0, 300);
    // Só o erro e a hora: a última leitura boa continua de pé (nunca vira zero).
    const linha = await gravar({ client_id: clientId, period, meta_ad_account_id: conta, attempted_at: agora, error: erro });
    return { ok: false, erro, linha, ...(tokenRecusado ? { conexao: "expirada" as const } : {}) };
  }
}

/**
 * Lê a Meta para um cliente+período e guarda. Quem pedir o mesmo par enquanto roda recebe a MESMA
 * promessa. `null` = servidor ocupado (MAX_SIMULTANEAS leituras diferentes já rodando).
 */
export function sincronizarAnuncios(clientId: string, periodo: Periodo): Promise<ResultadoSync> | null {
  const chave = chaveLinha(clientId, chavePeriodo(periodo));
  const { emAndamento: rodando } = proc();
  const ja = rodando.get(chave);
  if (ja) return ja;
  if (rodando.size >= MAX_SIMULTANEAS) return null;
  const p = executar(clientId, periodo)
    .catch((e): ResultadoSync => ({ ok: false, erro: e instanceof Error ? e.message : String(e), linha: null }))
    .finally(() => rodando.delete(chave));
  rodando.set(chave, p);
  return p;
}
