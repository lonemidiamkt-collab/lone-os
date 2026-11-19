// lib/google/analytics-api.ts — leitura do GOOGLE ANALYTICS 4 do site do cliente. Só servidor, só leitura.
//
// Duas APIs do Google, na conexão de marketing (escopo analytics.readonly — lib/google/marketing-auth.ts):
//   · Analytics Admin API (analyticsadmin.googleapis.com/v1beta/accountSummaries) — as propriedades que a conta da Lone
//     enxerga (para vincular na ficha e para o vínculo automático);
//   · Analytics Data API  (analyticsdata.googleapis.com/v1beta/{propriedade}:runReport) — os números do dia.
//
// Três relatórios por leitura (cada um é UMA chamada):
//   1) dia × canal: visitas, visitas engajadas, páginas vistas, pessoas novas;
//   2) dia × evento: os eventos do site (generate_lead, form_submit, eventos próprios como "clique_whatsapp"),
//      sem o ruído que todo site tem (page_view, scroll...);
//   3) dia × link clicado: só cliques em link de WhatsApp (wa.me, api.whatsapp.com) e de telefone (tel:). O GA4 grava
//      sozinho o clique em link para outro site ("medição otimizada" › cliques de saída) — é assim que o clique no
//      botão do WhatsApp aparece mesmo sem ninguém ter criado um evento para ele.
//
// Formato da resposta: rows[].dimensionValues[].value (data em "AAAAMMDD") e rows[].metricValues[].value (texto).
// Tudo aqui devolve { ok, dados } ou { ok:false, erro } e NUNCA lança.

import { tokenMarketing, fraseSemToken } from "./marketing-auth";

export type Leitura<T> = { ok: true; dados: T } | { ok: false; erro: string };

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DADOS = "https://analyticsdata.googleapis.com/v1beta";

export const PROPRIEDADE_VALIDA = /^properties\/\d+$/;

/** Eventos automáticos que não dizem nada ao dono (toda visita tem). Não são gravados. */
export const EVENTOS_RUIDO = ["page_view", "session_start", "user_engagement", "first_visit", "scroll", "form_start", "video_progress", "video_start", "file_download_start"];

// ── Erros ────────────────────────────────────────────────────────────────────────────────────────────

/** O erro das APIs do Analytics em frase que o time entende. Pura (testada). */
export function fraseDoErroAnalytics(status: number, corpo: unknown): string {
  const e = (corpo as { error?: { message?: string; status?: string; details?: { reason?: string }[] } } | null)?.error;
  const tudo = `${e?.status ?? ""} ${e?.message ?? ""} ${(e?.details ?? []).map((d) => d.reason ?? "").join(" ")}`;
  if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(tudo)) {
    return "As APIs do Google Analytics estão desligadas no projeto do Google Cloud da Lone. Ative a Google Analytics Data API e a Google Analytics Admin API em console.cloud.google.com.";
  }
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(tudo)) {
    return "A conexão do Google foi feita sem a permissão do Google Analytics. Reconecte em Sistema › Integrações e marque a permissão do Analytics.";
  }
  if (status === 401 || /UNAUTHENTICATED/i.test(tudo)) return "O acesso ao Google Analytics venceu. Reconecte em Sistema › Integrações.";
  if (status === 403 || /PERMISSION_DENIED/i.test(tudo)) {
    return "A conta Google conectada não tem acesso a esta propriedade do Google Analytics. Peça ao cliente para adicionar a Lone como Leitor na propriedade e escolha de novo na ficha.";
  }
  if (status === 404 || /NOT_FOUND/i.test(tudo)) return "O Google não achou esta propriedade do Google Analytics (foi apagada ou trocou de conta). Escolha de novo na ficha.";
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(tudo)) return "O Google Analytics pediu para esperar (limite de leituras da propriedade). A próxima rodada tenta de novo.";
  if (status >= 500) return "O Google Analytics não respondeu agora. A próxima rodada tenta de novo.";
  return `O Google Analytics recusou a leitura: ${(e?.message || `HTTP ${status}`).slice(0, 180)}`;
}

async function pedir(url: string, corpo?: unknown): Promise<Leitura<unknown>> {
  const t = await tokenMarketing();
  if (!t.token) return { ok: false, erro: fraseSemToken(t.motivo, t.detalhe) };
  try {
    const res = await fetch(url, {
      method: corpo ? "POST" : "GET",
      headers: { Authorization: `Bearer ${t.token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    const txt = await res.text();
    let j: unknown = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) return { ok: false, erro: fraseDoErroAnalytics(res.status, j ?? { error: { message: txt.slice(0, 200) } }) };
    return { ok: true, dados: j ?? {} };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return { ok: false, erro: nome === "TimeoutError" || nome === "AbortError" ? "O Google Analytics não respondeu em 45 s. A próxima rodada tenta de novo." : `Não consegui falar com o Google Analytics: ${e instanceof Error ? e.message : "rede"}` };
  }
}

// ── Relatórios (runReport) ───────────────────────────────────────────────────────────────────────────

interface CruaRelatorio { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]; rowCount?: number }

/** "20261118" → "2026-11-18". Outra coisa → null. Pura. */
export function deDataGa(v: string | undefined): string | null {
  return v && /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null;
}

const inteiro = (v: string | undefined) => { const n = Math.round(Number(v ?? 0)); return Number.isFinite(n) ? n : 0; };

export interface LinhaAnalyticsDia { dia: string; canal: string; sessoes: number; sessoes_engajadas: number; visualizacoes: number; novos_usuarios: number }
export interface LinhaAnalyticsEvento { dia: string; evento: string; link: string; contagem: number }

/** Relatório dia × canal → linhas. Pura (testada). */
export function lerLinhasDia(cru: CruaRelatorio): LinhaAnalyticsDia[] {
  return (cru.rows ?? []).flatMap((r) => {
    const dia = deDataGa(r.dimensionValues?.[0]?.value);
    if (!dia) return [];
    const m = r.metricValues ?? [];
    return [{
      dia, canal: (r.dimensionValues?.[1]?.value || "(not set)").slice(0, 80),
      sessoes: inteiro(m[0]?.value), sessoes_engajadas: inteiro(m[1]?.value), visualizacoes: inteiro(m[2]?.value), novos_usuarios: inteiro(m[3]?.value),
    }];
  });
}

/** Relatório dia × evento (× link) → linhas. Junta linhas repetidas (o link é cortado em 300 letras). Pura (testada). */
export function lerLinhasEvento(cru: CruaRelatorio, comLink: boolean): LinhaAnalyticsEvento[] {
  const m = new Map<string, LinhaAnalyticsEvento>();
  for (const r of cru.rows ?? []) {
    const dia = deDataGa(r.dimensionValues?.[0]?.value);
    const evento = (r.dimensionValues?.[1]?.value ?? "").trim().slice(0, 100);
    if (!dia || !evento) continue;
    const link = comLink ? (r.dimensionValues?.[2]?.value ?? "").trim().slice(0, 300) : "";
    const n = inteiro(r.metricValues?.[0]?.value);
    const k = `${dia}|${evento}|${link}`;
    const atual = m.get(k);
    if (atual) atual.contagem += n;
    else m.set(k, { dia, evento, link, contagem: n });
  }
  return [...m.values()];
}

const LIMITE_LINHAS = 100_000;

/** Os números do site dia a dia, de `de` até `ate` (inclusive). As 3 leituras; falha em qualquer uma = falha. */
export async function lerPropriedade(propriedade: string, de: string, ate: string): Promise<Leitura<{ dias: LinhaAnalyticsDia[]; eventos: LinhaAnalyticsEvento[] }>> {
  if (!PROPRIEDADE_VALIDA.test(propriedade)) return { ok: false, erro: "Propriedade do Google Analytics inválida na ficha (esperado properties/<número>)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) return { ok: false, erro: "intervalo inválido" };
  const url = `${DADOS}/${propriedade}:runReport`;
  const dateRanges = [{ startDate: de, endDate: ate }];

  const r1 = await pedir(url, {
    dateRanges, limit: LIMITE_LINHAS,
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "engagedSessions" }, { name: "screenPageViews" }, { name: "newUsers" }],
  });
  if (!r1.ok) return r1;

  const r2 = await pedir(url, {
    dateRanges, limit: LIMITE_LINHAS,
    dimensions: [{ name: "date" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: { notExpression: { filter: { fieldName: "eventName", inListFilter: { values: EVENTOS_RUIDO } } } },
  });
  if (!r2.ok) return r2;

  const contem = (v: string) => ({ filter: { fieldName: "linkUrl", stringFilter: { matchType: "CONTAINS", value: v, caseSensitive: false } } });
  const r3 = await pedir(url, {
    dateRanges, limit: LIMITE_LINHAS,
    dimensions: [{ name: "date" }, { name: "eventName" }, { name: "linkUrl" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "click" } } },
          { orGroup: { expressions: [contem("wa.me"), contem("whatsapp"), { filter: { fieldName: "linkUrl", stringFilter: { matchType: "BEGINS_WITH", value: "tel:", caseSensitive: false } } }] } },
        ],
      },
    },
  });
  if (!r3.ok) return r3;

  // O "click" agregado (sem link) da leitura 2 é a soma de TODO clique de saída: fica de fora — o que importa vem
  // separado por link na leitura 3.
  const eventos = [
    ...lerLinhasEvento(r2.dados as CruaRelatorio, false).filter((l) => l.evento !== "click"),
    ...lerLinhasEvento(r3.dados as CruaRelatorio, true),
  ];
  return { ok: true, dados: { dias: lerLinhasDia(r1.dados as CruaRelatorio), eventos } };
}

// ── Propriedades que a conexão enxerga (para vincular na ficha) ──────────────────────────────────────

export interface PropriedadeAnalytics { propriedade: string; nome: string; conta: string; contaNome: string | null }

interface CruaResumo { accountSummaries?: { account?: string; displayName?: string; propertySummaries?: { property?: string; displayName?: string }[] }[]; nextPageToken?: string }

/** Pura (testada). */
export function lerPropriedades(cru: CruaResumo): PropriedadeAnalytics[] {
  return (cru.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).flatMap((p) =>
    p.property && PROPRIEDADE_VALIDA.test(p.property)
      ? [{ propriedade: p.property, nome: p.displayName || p.property, conta: a.account ?? "", contaNome: a.displayName ?? null }]
      : []));
}

/** Todas as propriedades GA4 a que a conta Google conectada tem acesso. */
export async function listarPropriedades(): Promise<Leitura<PropriedadeAnalytics[]>> {
  const todas = new Map<string, PropriedadeAnalytics>();
  let pagina: string | undefined;
  for (let i = 0; i < 10; i++) {
    const r = await pedir(`${ADMIN}/accountSummaries?pageSize=200${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}`);
    if (!r.ok) return r;
    const d = r.dados as CruaResumo;
    for (const p of lerPropriedades(d)) if (!todas.has(p.propriedade)) todas.set(p.propriedade, p);
    pagina = d.nextPageToken;
    if (!pagina) break;
  }
  return { ok: true, dados: [...todas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) };
}

/** Teste da tela de Integrações: 1 chamada. */
export async function testarAnalytics(): Promise<Leitura<number>> {
  const r = await pedir(`${ADMIN}/accountSummaries?pageSize=200`);
  return r.ok ? { ok: true, dados: lerPropriedades(r.dados as CruaResumo).length } : r;
}
