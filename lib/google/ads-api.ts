// lib/google/ads-api.ts — leitura do Google Ads pela API REST (GoogleAdsService.SearchStream). Só servidor, só leitura.
//
// Documentação seguida (developers.google.com/google-ads/api, lida em 18/11/2026):
//   · versão v26 (lançada em 14/10/2026, desliga em nov/2027) — UM lugar só, como a Graph API da Meta;
//   · desde 09/09/2026 o "developer token" foi aposentado: o nível de acesso (Test, Explorer, Basic…) é do PROJETO
//     do Google Cloud. "Test" só lê conta de teste (erro CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION); "Explorer" já
//     lê conta real, até 2.880 operações por dia. Cada cliente gasta 4 por dia nesta leitura.
//   · login-customer-id: o ID (sem hífen) da conta de administrador (MCC) por onde o acesso chega. Obrigatório
//     quando a conta Google conectada só enxerga o cliente através do MCC.
//
// Formato da resposta REST: SearchStream devolve uma LISTA de lotes { results: [...] }. Campo int64 vem como TEXTO
// ("costMicros": "1230000"), double vem como número, e campo zerado NÃO vem (proto3) — ausente = 0.
// Tudo aqui devolve { ok, dados } ou { ok:false, erro } e NUNCA lança.

import { tokenMarketing, fraseSemToken, normalizarIdAds } from "./marketing-auth";

export const VERSAO_GOOGLE_ADS = "v26";
const BASE = `https://googleads.googleapis.com/${VERSAO_GOOGLE_ADS}`;

export type Leitura<T> = { ok: true; dados: T } | { ok: false; erro: string };

// ── Erros ────────────────────────────────────────────────────────────────────────────────────────────

interface CorpoErro {
  error?: {
    code?: number; message?: string; status?: string;
    details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[];
  };
}

/** O erro do Google Ads em frase que o time entende. Pura (testada). */
export function fraseDoErroAds(status: number, corpo: unknown): string {
  const e = (corpo as CorpoErro | null)?.error;
  const primeiro = e?.details?.flatMap((d) => d.errors ?? [])[0];
  const codigo = primeiro?.errorCode ? Object.values(primeiro.errorCode)[0] : "";
  const msg = primeiro?.message || e?.message || "";
  const tudo = `${codigo} ${msg} ${e?.status ?? ""}`;
  if (/CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION|DEVELOPER_TOKEN_NOT_APPROVED|ACTION_NOT_PERMITTED/i.test(tudo)) {
    return "O projeto do Google Cloud da Lone ainda só tem acesso de TESTE à API do Google Ads. Peça o acesso Explorer em console.cloud.google.com (Google Ads API › Visão geral).";
  }
  if (/SERVICE_DISABLED|has not been used in project|it is disabled/i.test(tudo)) {
    return "A Google Ads API está desligada no projeto do Google Cloud da Lone. Ative em console.cloud.google.com/apis/library/googleads.googleapis.com.";
  }
  if (/USER_PERMISSION_DENIED|CUSTOMER_NOT_ENABLED|PERMISSION_DENIED/i.test(tudo)) {
    return "A conta Google conectada não tem acesso a esta conta de anúncios (ou a conta está desativada). Confira o acesso no Google Ads e escolha a conta de novo na ficha.";
  }
  if (/CUSTOMER_NOT_FOUND|NOT_FOUND/i.test(tudo)) return "O Google Ads não achou esta conta. Escolha a conta de novo na ficha do cliente.";
  if (status === 401 || /UNAUTHENTICATED|invalid_grant/i.test(tudo)) return "O acesso ao Google Ads venceu. Reconecte em Sistema › Integrações.";
  if (status === 429 || /RESOURCE_EXHAUSTED|RESOURCE_TEMPORARILY_EXHAUSTED/i.test(tudo)) return "O Google Ads pediu para esperar (limite de chamadas). A próxima rodada tenta de novo.";
  if (status >= 500) return "O Google Ads não respondeu agora. A próxima rodada tenta de novo.";
  return `O Google Ads recusou: ${(msg || `HTTP ${status}`).slice(0, 180)}`;
}

// ── Chamada ──────────────────────────────────────────────────────────────────────────────────────────

async function pedir(caminho: string, init: { metodo?: "GET" | "POST"; corpo?: unknown; loginId?: string | null } = {}): Promise<Leitura<unknown>> {
  const t = await tokenMarketing();
  if (!t.token) return { ok: false, erro: fraseSemToken(t.motivo, t.detalhe) };
  const login = normalizarIdAds(init.loginId);
  try {
    const res = await fetch(`${BASE}${caminho}`, {
      method: init.metodo ?? "GET",
      headers: {
        Authorization: `Bearer ${t.token}`,
        ...(login ? { "login-customer-id": login } : {}),
        ...(init.corpo ? { "Content-Type": "application/json" } : {}),
      },
      body: init.corpo ? JSON.stringify(init.corpo) : undefined,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    const txt = await res.text();
    let j: unknown = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) return { ok: false, erro: fraseDoErroAds(res.status, j ?? { error: { message: txt.slice(0, 200) } }) };
    return { ok: true, dados: j };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return { ok: false, erro: nome === "TimeoutError" || nome === "AbortError" ? "O Google Ads não respondeu em 45 s. A próxima rodada tenta de novo." : `Não consegui falar com o Google Ads: ${e instanceof Error ? e.message : "rede"}` };
  }
}

/** As linhas de um SearchStream (lista de lotes) numa lista só. Pura. */
export function linhasDoStream<T>(resposta: unknown): T[] {
  const lotes = Array.isArray(resposta) ? resposta : resposta ? [resposta] : [];
  return lotes.flatMap((l) => ((l as { results?: T[] }).results ?? []));
}

async function consultar<T>(customerId: string, gaql: string, loginId: string | null): Promise<Leitura<T[]>> {
  const r = await pedir(`/customers/${customerId}/googleAds:searchStream`, { metodo: "POST", corpo: { query: gaql }, loginId });
  return r.ok ? { ok: true, dados: linhasDoStream<T>(r.dados) } : r;
}

// ── Números ──────────────────────────────────────────────────────────────────────────────────────────

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(x) ? x : 0;
};
const dinheiro = (micros: unknown) => Math.round(n(micros) / 10_000) / 100; // micros → 2 casas
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export interface LinhaAdsCampanhaDia {
  campaign_id: string;
  dia: string;
  campanha: string | null;
  canal: string | null;
  impressoes: number;
  cliques: number;
  custo: number;
  conversoes: number;
  valor_conversoes: number;
  ligacoes: number | null;
}

export interface LinhaAdsAcaoDia {
  dia: string;
  categoria: string;
  acao: string;
  conversoes: number;
  todas_conversoes: number;
}

interface CruaCampanha {
  campaign?: { id?: string; name?: string; advertisingChannelType?: string };
  segments?: { date?: string; conversionActionCategory?: string; conversionActionName?: string };
  metrics?: Record<string, unknown>;
}

/** Linhas cruas de campanha × dia → linhas da tabela. Pura (testada). */
export function lerLinhasCampanha(cruas: readonly CruaCampanha[], ligacoes: Map<string, number> | null): LinhaAdsCampanhaDia[] {
  const out: LinhaAdsCampanhaDia[] = [];
  for (const c of cruas) {
    const id = c.campaign?.id, dia = c.segments?.date ?? "";
    if (!id || !dataValida(dia)) continue;
    const m = c.metrics ?? {};
    out.push({
      campaign_id: String(id), dia, campanha: c.campaign?.name ?? null, canal: c.campaign?.advertisingChannelType ?? null,
      impressoes: n(m.impressions), cliques: n(m.clicks), custo: dinheiro(m.costMicros),
      conversoes: Math.round(n(m.conversions) * 100) / 100, valor_conversoes: Math.round(n(m.conversionsValue) * 100) / 100,
      ligacoes: ligacoes ? (ligacoes.get(`${id}|${dia}`) ?? 0) : null,
    });
  }
  return out;
}

/** Linhas cruas de ação de conversão × dia → somadas por (dia, categoria, ação). Pura (testada). */
export function lerLinhasAcao(cruas: readonly CruaCampanha[]): LinhaAdsAcaoDia[] {
  const soma = new Map<string, LinhaAdsAcaoDia>();
  for (const c of cruas) {
    const dia = c.segments?.date ?? "";
    if (!dataValida(dia)) continue;
    const categoria = c.segments?.conversionActionCategory || "DEFAULT";
    const acao = c.segments?.conversionActionName || "(sem nome)";
    const k = `${dia}|${categoria}|${acao}`;
    const atual = soma.get(k) ?? { dia, categoria, acao, conversoes: 0, todas_conversoes: 0 };
    atual.conversoes += n(c.metrics?.conversions);
    atual.todas_conversoes += n(c.metrics?.allConversions);
    soma.set(k, atual);
  }
  return [...soma.values()]
    .map((l) => ({ ...l, conversoes: Math.round(l.conversoes * 100) / 100, todas_conversoes: Math.round(l.todas_conversoes * 100) / 100 }))
    .filter((l) => l.conversoes > 0 || l.todas_conversoes > 0);
}

const entre = (de: string, ate: string) => `segments.date BETWEEN '${de}' AND '${ate}'`;

/**
 * Tudo que o relatório precisa de UMA conta num intervalo. Ligações (phone_calls) é leitura à parte: se o Google
 * recusar só ela, o resto entra e a ligação fica "não informada" (null), nunca zero.
 */
export async function lerContaAds(customerId: string, loginId: string | null, de: string, ate: string): Promise<Leitura<{
  campanhas: LinhaAdsCampanhaDia[]; acoes: LinhaAdsAcaoDia[] | null; moeda: string | null; avisos: string[];
}>> {
  if (!dataValida(de) || !dataValida(ate) || de > ate) return { ok: false, erro: "intervalo inválido" };
  const avisos: string[] = [];
  const [camp, lig, acoes, cliente] = await Promise.all([
    consultar<CruaCampanha>(customerId, `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE ${entre(de, ate)}`, loginId),
    consultar<CruaCampanha>(customerId, `SELECT campaign.id, segments.date, metrics.phone_calls FROM campaign WHERE ${entre(de, ate)}`, loginId),
    consultar<CruaCampanha>(customerId, `SELECT segments.date, segments.conversion_action_category, segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM campaign WHERE ${entre(de, ate)}`, loginId),
    consultar<{ customer?: { currencyCode?: string } }>(customerId, "SELECT customer.currency_code FROM customer", loginId),
  ]);
  if (!camp.ok) return camp;
  let mapaLig: Map<string, number> | null = null;
  if (lig.ok) {
    mapaLig = new Map();
    for (const l of lig.dados) {
      const k = `${l.campaign?.id}|${l.segments?.date}`;
      mapaLig.set(k, (mapaLig.get(k) ?? 0) + n(l.metrics?.phoneCalls));
    }
  } else avisos.push(`ligações pelo anúncio: ${lig.erro}`);
  if (!acoes.ok) avisos.push(`ações de conversão: ${acoes.erro}`);
  return {
    ok: true,
    dados: {
      campanhas: lerLinhasCampanha(camp.dados, mapaLig),
      // null = não li (a tabela de ações não é mexida); [] = li e não houve conversão.
      acoes: acoes.ok ? lerLinhasAcao(acoes.dados) : null,
      moeda: cliente.ok ? (cliente.dados[0]?.customer?.currencyCode ?? null) : null,
      avisos,
    },
  };
}

// ── Contas que a conexão enxerga (para vincular na ficha) ────────────────────────────────────────────

export interface ContaAds {
  id: string;
  nome: string;
  moeda: string | null;
  /** O MCC por onde o acesso chega (vai no login-customer-id). null = acesso direto. */
  loginId: string | null;
}

interface CruaCliente { customerClient?: { id?: string; descriptiveName?: string; manager?: boolean; status?: string; currencyCode?: string; level?: string | number } }

/** Junta as contas achadas em cada raiz: conta direta ganha de conta via MCC; sem repetição. Pura (testada). */
export function juntarContas(porRaiz: { raiz: string; linhas: CruaCliente[] }[]): ContaAds[] {
  const contas = new Map<string, ContaAds>();
  for (const { raiz, linhas } of porRaiz) {
    for (const l of linhas) {
      const c = l.customerClient;
      const id = normalizarIdAds(c?.id);
      if (!id || c?.manager || (c?.status && c.status !== "ENABLED")) continue;
      const direta = id === raiz;
      const ja = contas.get(id);
      if (ja && (ja.loginId === null || !direta)) continue;
      contas.set(id, { id, nome: c?.descriptiveName || id, moeda: c?.currencyCode ?? null, loginId: direta ? null : raiz });
    }
  }
  return [...contas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Todas as contas de anúncio (não-administradoras, ativas) que a conta Google conectada enxerga, direto ou via MCC. */
export async function listarContasAds(): Promise<Leitura<ContaAds[]>> {
  const r = await pedir("/customers:listAccessibleCustomers");
  if (!r.ok) return r;
  const raizes = ((r.dados as { resourceNames?: string[] } | null)?.resourceNames ?? [])
    .map((s) => normalizarIdAds(s.replace("customers/", ""))).filter((x): x is string => !!x).slice(0, 25);
  if (!raizes.length) return { ok: true, dados: [] };
  const lidas = await Promise.all(raizes.map(async (raiz) => {
    const q = await consultar<CruaCliente>(raiz,
      "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status, customer_client.currency_code, customer_client.level FROM customer_client",
      raiz);
    return { raiz, q };
  }));
  const boas = lidas.filter((x) => x.q.ok).map((x) => ({ raiz: x.raiz, linhas: (x.q as { ok: true; dados: CruaCliente[] }).dados }));
  if (!boas.length) {
    const primeiro = lidas.find((x) => !x.q.ok)?.q as { ok: false; erro: string } | undefined;
    return { ok: false, erro: primeiro?.erro ?? "Não consegui ler as contas do Google Ads." };
  }
  return { ok: true, dados: juntarContas(boas) };
}

/** Teste da tela de Integrações: 1 operação. */
export async function testarAds(): Promise<Leitura<number>> {
  const r = await pedir("/customers:listAccessibleCustomers");
  if (!r.ok) return r;
  return { ok: true, dados: ((r.dados as { resourceNames?: string[] } | null)?.resourceNames ?? []).length };
}
