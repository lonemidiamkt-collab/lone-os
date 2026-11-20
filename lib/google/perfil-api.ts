// lib/google/perfil-api.ts — leitura do PERFIL DA EMPRESA no Google (o antigo Google Meu Negócio). Só servidor, só leitura.
//
// Três APIs do Google, todas na conexão de marketing (escopo business.manage):
//   · Account Management   (mybusinessaccountmanagement.googleapis.com/v1/accounts)        — contas que a Lone gerencia;
//   · Business Information (mybusinessbusinessinformation.googleapis.com/v1/{conta}/locations) — os perfis de cada conta;
//   · Performance          (businessprofileperformance.googleapis.com/v1/{local}:fetchMultiDailyMetricsTimeSeries)
//     — os números do dia: ligações, rotas, cliques no site, conversas, reservas e as visualizações (busca × mapas).
//
// ATENÇÃO (setup): as APIs do Perfil da Empresa começam com cota ZERO. O projeto do Google Cloud precisa pedir
// acesso no formulário do Google (support.google.com/business/contact/api_default). Sem isso, toda chamada volta
// 429/403 — a frase abaixo diz isso ao time em vez de "erro desconhecido".
//
// O Google NÃO devolve o dia zerado (o datedValue vem sem `value`), e libera os números com 2–5 dias de atraso.
// Por isso a leitura devolve também o ÚLTIMO DIA COM NÚMERO: a camada do relatório não mostra zero onde o Google
// ainda não entregou.

import { tokenMarketing, fraseSemToken } from "./marketing-auth";

export type Leitura<T> = { ok: true; dados: T } | { ok: false; erro: string };

const CONTAS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const DESEMPENHO = "https://businessprofileperformance.googleapis.com/v1";

/** Métrica do Google → coluna de google_perfil_dia. */
export const METRICAS_PERFIL = {
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "impressoes_busca_celular",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "impressoes_busca_computador",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "impressoes_mapas_celular",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "impressoes_mapas_computador",
  CALL_CLICKS: "ligacoes",
  BUSINESS_DIRECTION_REQUESTS: "rotas",
  WEBSITE_CLICKS: "cliques_site",
  BUSINESS_CONVERSATIONS: "conversas",
  BUSINESS_BOOKINGS: "reservas",
  BUSINESS_FOOD_MENU_CLICKS: "cardapio",
} as const;

export type ColunaPerfil = (typeof METRICAS_PERFIL)[keyof typeof METRICAS_PERFIL];
export type LinhaPerfilDia = { dia: string } & Record<ColunaPerfil, number>;

const COLUNAS = Object.values(METRICAS_PERFIL) as ColunaPerfil[];

// ── Erros ────────────────────────────────────────────────────────────────────────────────────────────

/** O erro das APIs do Perfil em frase que o time entende. Pura (testada). */
export function fraseDoErroPerfil(status: number, corpo: unknown): string {
  const e = (corpo as { error?: { message?: string; status?: string } } | null)?.error;
  const tudo = `${e?.status ?? ""} ${e?.message ?? ""}`;
  if (/has not been used in project|SERVICE_DISABLED|is disabled/i.test(tudo)) {
    return "As APIs do Perfil da Empresa estão desligadas no projeto do Google Cloud da Lone (Business Profile Performance, Business Information e Account Management). Ative as três em console.cloud.google.com.";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(tudo)) {
    return "O Google ainda não liberou cota das APIs do Perfil da Empresa para o projeto da Lone (começa em zero). Peça o acesso em support.google.com/business/contact/api_default — ou, se já foi liberado, a próxima rodada tenta de novo.";
  }
  if (status === 401 || /UNAUTHENTICATED/i.test(tudo)) return "O acesso ao Perfil da Empresa venceu. Reconecte em Sistema › Integrações.";
  if (status === 403 || /PERMISSION_DENIED/i.test(tudo)) return "A conta Google conectada não gerencia este Perfil da Empresa. Peça ao cliente para adicionar a Lone como gerente do perfil e escolha o perfil de novo na ficha.";
  if (status === 404 || /NOT_FOUND/i.test(tudo)) return "O Google não achou este Perfil da Empresa (foi removido ou trocou de dono). Escolha o perfil de novo na ficha.";
  if (status >= 500) return "O Perfil da Empresa não respondeu agora. A próxima rodada tenta de novo.";
  return `O Google recusou a leitura do Perfil da Empresa: ${(e?.message || `HTTP ${status}`).slice(0, 180)}`;
}

async function pedir(url: string): Promise<Leitura<unknown>> {
  const t = await tokenMarketing();
  if (!t.token) return { ok: false, erro: fraseSemToken(t.motivo, t.detalhe) };
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const txt = await res.text();
    let j: unknown = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) return { ok: false, erro: fraseDoErroPerfil(res.status, j ?? { error: { message: txt.slice(0, 200) } }) };
    return { ok: true, dados: j ?? {} };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return { ok: false, erro: nome === "TimeoutError" || nome === "AbortError" ? "O Perfil da Empresa não respondeu em 30 s. A próxima rodada tenta de novo." : `Não consegui falar com o Perfil da Empresa: ${e instanceof Error ? e.message : "rede"}` };
  }
}

// ── Datas ────────────────────────────────────────────────────────────────────────────────────────────

type DataG = { year?: number; month?: number; day?: number };
const doisDig = (x: number) => String(x).padStart(2, "0");
const deDataG = (d: DataG | undefined): string | null =>
  d?.year && d.month && d.day ? `${d.year}-${doisDig(d.month)}-${doisDig(d.day)}` : null;
const partes = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return { y, m, d }; };
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// ── Métricas diárias ─────────────────────────────────────────────────────────────────────────────────

interface CruaMulti {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: { dailyMetric?: string; timeSeries?: { datedValues?: { date?: DataG; value?: string }[] } }[];
  }[];
}

/**
 * Resposta de fetchMultiDailyMetricsTimeSeries → uma linha por dia do intervalo (dia sem valor = 0) e o último
 * dia em que o Google já tem número (alguma visualização > 0 — perfil ativo sempre aparece em alguma busca).
 * Pura (testada).
 */
export function lerSerieDiaria(cru: CruaMulti, de: string, ate: string): { linhas: LinhaPerfilDia[]; ultimoDia: string | null } {
  const porDia = new Map<string, LinhaPerfilDia>();
  for (const dia of diasEntre(de, ate)) {
    porDia.set(dia, { dia, ...Object.fromEntries(COLUNAS.map((c) => [c, 0])) } as LinhaPerfilDia);
  }
  for (const grupo of cru.multiDailyMetricTimeSeries ?? []) {
    for (const serie of grupo.dailyMetricTimeSeries ?? []) {
      const coluna = METRICAS_PERFIL[serie.dailyMetric as keyof typeof METRICAS_PERFIL];
      if (!coluna) continue;
      for (const v of serie.timeSeries?.datedValues ?? []) {
        const dia = deDataG(v.date);
        const linha = dia ? porDia.get(dia) : undefined;
        const n = Number(v.value ?? 0);
        if (linha && Number.isFinite(n)) linha[coluna] += n;
      }
    }
  }
  const linhas = [...porDia.values()];
  let ultimoDia: string | null = null;
  for (const l of linhas) if (COLUNAS.some((c) => l[c] > 0)) ultimoDia = l.dia;
  return { linhas, ultimoDia };
}

/** Os números do perfil dia a dia, de `de` até `ate` (inclusive). */
export async function lerMetricasDiarias(local: string, de: string, ate: string): Promise<Leitura<{ linhas: LinhaPerfilDia[]; ultimoDia: string | null }>> {
  if (!/^locations\/\d+$/.test(local)) return { ok: false, erro: "Perfil da Empresa inválido na ficha (esperado locations/<número>)." };
  if (!dataValida(de) || !dataValida(ate) || de > ate) return { ok: false, erro: "intervalo inválido" };
  const a = partes(de), b = partes(ate);
  const q = new URLSearchParams();
  for (const m of Object.keys(METRICAS_PERFIL)) q.append("dailyMetrics", m);
  q.set("dailyRange.startDate.year", String(a.y)); q.set("dailyRange.startDate.month", String(a.m)); q.set("dailyRange.startDate.day", String(a.d));
  q.set("dailyRange.endDate.year", String(b.y)); q.set("dailyRange.endDate.month", String(b.m)); q.set("dailyRange.endDate.day", String(b.d));
  const r = await pedir(`${DESEMPENHO}/${local}:fetchMultiDailyMetricsTimeSeries?${q.toString()}`);
  return r.ok ? { ok: true, dados: lerSerieDiaria(r.dados as CruaMulti, de, ate) } : r;
}

// ── Termos de busca (por mês) ────────────────────────────────────────────────────────────────────────

export interface TermoBusca { termo: string; valor: number | null; limiar: number | null }

interface CruaTermos { searchKeywordsCounts?: { searchKeyword?: string; insightsValue?: { value?: string; threshold?: string } }[]; nextPageToken?: string }

/** Pura (testada). O Google esconde termo com pouca busca: vem `threshold` ("menos de N") no lugar de `value`. */
export function lerTermos(cru: CruaTermos): TermoBusca[] {
  return (cru.searchKeywordsCounts ?? []).flatMap((k) => {
    const termo = (k.searchKeyword ?? "").trim().toLowerCase();
    if (!termo) return [];
    const v = k.insightsValue?.value, t = k.insightsValue?.threshold;
    return [{ termo, valor: v != null && Number.isFinite(Number(v)) ? Number(v) : null, limiar: t != null && Number.isFinite(Number(t)) ? Number(t) : null }];
  });
}

/** Termos que mostraram o perfil num MÊS (o Google soma o intervalo inteiro — por isso um mês por chamada). */
export async function lerBuscasDoMes(local: string, ano: number, mes: number): Promise<Leitura<TermoBusca[]>> {
  if (!/^locations\/\d+$/.test(local)) return { ok: false, erro: "Perfil da Empresa inválido na ficha." };
  const termos: TermoBusca[] = [];
  let pagina: string | undefined;
  for (let i = 0; i < 5; i++) { // até 500 termos: o relatório mostra os 10 maiores
    const q = new URLSearchParams({
      "monthlyRange.startMonth.year": String(ano), "monthlyRange.startMonth.month": String(mes),
      "monthlyRange.endMonth.year": String(ano), "monthlyRange.endMonth.month": String(mes),
      pageSize: "100",
    });
    if (pagina) q.set("pageToken", pagina);
    const r = await pedir(`${DESEMPENHO}/${local}/searchkeywords/impressions/monthly?${q.toString()}`);
    if (!r.ok) return i === 0 ? r : { ok: true, dados: termos };
    const cru = r.dados as CruaTermos;
    termos.push(...lerTermos(cru));
    pagina = cru.nextPageToken;
    if (!pagina) break;
  }
  return { ok: true, dados: termos };
}

// ── Perfis que a conexão gerencia (para vincular na ficha) ───────────────────────────────────────────

export interface PerfilEmpresa { local: string; nome: string; endereco: string | null; conta: string; telefone: string | null; site: string | null }

interface CruaLocal { name?: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string }; phoneNumbers?: { primaryPhone?: string }; websiteUri?: string }

/** Pura (testada). */
export function lerPerfis(conta: string, locais: readonly CruaLocal[]): PerfilEmpresa[] {
  return locais.flatMap((l) => {
    if (!l.name || !/^locations\/\d+$/.test(l.name)) return [];
    const a = l.storefrontAddress;
    const endereco = a ? [a.addressLines?.join(", "), a.locality, a.administrativeArea].filter(Boolean).join(" · ") || null : null;
    return [{ local: l.name, nome: l.title || l.name, endereco, conta, telefone: l.phoneNumbers?.primaryPhone ?? null, site: l.websiteUri ?? null }];
  });
}

/** Todos os perfis de todas as contas que a conta Google conectada gerencia. */
export async function listarPerfis(): Promise<Leitura<PerfilEmpresa[]>> {
  const contas: string[] = [];
  let pagina: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await pedir(`${CONTAS}/accounts?pageSize=20${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ""}`);
    if (!r.ok) return r;
    const d = r.dados as { accounts?: { name?: string }[]; nextPageToken?: string };
    contas.push(...(d.accounts ?? []).map((a) => a.name).filter((x): x is string => !!x && /^accounts\/\d+$/.test(x)));
    pagina = d.nextPageToken;
    if (!pagina) break;
  }
  const perfis = new Map<string, PerfilEmpresa>();
  let primeiroErro: string | null = null;
  for (const conta of contas.slice(0, 40)) {
    let pag: string | undefined;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({ readMask: "name,title,storefrontAddress,phoneNumbers,websiteUri", pageSize: "100" });
      if (pag) q.set("pageToken", pag);
      const r = await pedir(`${INFO}/${conta}/locations?${q.toString()}`);
      if (!r.ok) { primeiroErro ??= r.erro; break; }
      const d = r.dados as { locations?: CruaLocal[]; nextPageToken?: string };
      for (const p of lerPerfis(conta, d.locations ?? [])) if (!perfis.has(p.local)) perfis.set(p.local, p);
      pag = d.nextPageToken;
      if (!pag) break;
    }
  }
  if (!perfis.size && primeiroErro) return { ok: false, erro: primeiroErro };
  return { ok: true, dados: [...perfis.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) };
}

/** Teste da tela de Integrações: 1 chamada. */
export async function testarPerfil(): Promise<Leitura<number>> {
  const r = await pedir(`${CONTAS}/accounts?pageSize=20`);
  return r.ok ? { ok: true, dados: ((r.dados as { accounts?: unknown[] }).accounts ?? []).length } : r;
}

// ── Avaliações (Tráfego › Google Meu Negócio) ────────────────────────────────────────────────────────
// My Business API v4 (accounts.locations.reviews.list) — continua sendo o único jeito oficial de ler as avaliações
// (a Q&A foi encerrada em 03/11/2025; as avaliações seguem na v4). O caminho pede a CONTA: accounts/<a>/locations/<l>.
// A resposta já traz a nota média e o total; a lista vem da mais recente para a mais antiga.

const V4 = "https://mybusiness.googleapis.com/v4";

export interface AvaliacaoPerfil {
  review_id: string;
  nota: number | null;
  comentario: string | null;
  autor: string | null;
  criada_em: string | null;
  atualizada_em: string | null;
  resposta: string | null;
  respondida_em: string | null;
}

interface CruaAvaliacoes {
  reviews?: {
    reviewId?: string; name?: string; starRating?: string; comment?: string;
    reviewer?: { displayName?: string; isAnonymous?: boolean };
    createTime?: string; updateTime?: string;
    reviewReply?: { comment?: string; updateTime?: string };
  }[];
  averageRating?: number;
  totalReviewCount?: number;
  nextPageToken?: string;
}

const NOTAS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** Uma página da v4 → avaliações. O Google acrescenta "(Translated by Google)" ao comentário traduzido: fica só o original. Pura (testada). */
export function lerAvaliacoes(cru: CruaAvaliacoes): AvaliacaoPerfil[] {
  return (cru.reviews ?? []).flatMap((r) => {
    const id = r.reviewId || r.name?.split("/").pop();
    if (!id) return [];
    const original = r.comment?.includes("(Original)") ? r.comment.split("(Original)").pop()!.trim() : r.comment?.split("(Translated by Google)")[0].trim();
    return [{
      review_id: id,
      nota: r.starRating ? NOTAS[r.starRating] ?? null : null,
      comentario: original || null,
      autor: r.reviewer?.isAnonymous ? "Anônimo" : r.reviewer?.displayName ?? null,
      criada_em: r.createTime ?? null,
      atualizada_em: r.updateTime ?? null,
      resposta: r.reviewReply?.comment ?? null,
      respondida_em: r.reviewReply?.updateTime ?? null,
    }];
  });
}

/** Nota, total e as avaliações mais recentes (até `maximo`). */
export async function lerAvaliacoesDoPerfil(conta: string, local: string, maximo = 100): Promise<Leitura<{ nota: number | null; total: number; avaliacoes: AvaliacaoPerfil[] }>> {
  if (!/^accounts\/\d+$/.test(conta) || !/^locations\/\d+$/.test(local)) return { ok: false, erro: "Perfil sem conta conhecida — escolha o perfil de novo na ficha." };
  const avaliacoes: AvaliacaoPerfil[] = [];
  let nota: number | null = null, total = 0, pagina: string | undefined;
  for (let i = 0; i < Math.ceil(maximo / 50); i++) {
    const q = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pagina) q.set("pageToken", pagina);
    const r = await pedir(`${V4}/${conta}/${local}/reviews?${q.toString()}`);
    if (!r.ok) {
      if (i === 0) return r;
      break; // a primeira página já deu nota e total; o resto fica para a próxima rodada
    }
    const d = r.dados as CruaAvaliacoes;
    if (i === 0) { nota = typeof d.averageRating === "number" ? Math.round(d.averageRating * 100) / 100 : null; total = d.totalReviewCount ?? 0; }
    avaliacoes.push(...lerAvaliacoes(d));
    pagina = d.nextPageToken;
    if (!pagina) break;
  }
  return { ok: true, dados: { nota, total, avaliacoes } };
}
