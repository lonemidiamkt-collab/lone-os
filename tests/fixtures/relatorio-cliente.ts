// tests/fixtures/relatorio-cliente.ts — respostas da Graph API no formato em que a Meta devolve
// (/act_X/insights com level=campaign|adset|ad, time_increment=1 e breakdowns=age,gender), usadas pelo
// teste do relatório do cliente e pelo render local do PDF.
//
// Os números do Horto Naenc seguem o PDF real de 14–20/09/2026 (R$ 252,45 investidos; público só de
// mulheres de 25+, com as faixas 11,7 / 24,8 / 28,1 / 22,4 / 13,0%). Nomes de campanha, conjunto e
// anúncio são ilustrativos.

import type { LinhaCampanhaDia, LinhaConjunto, LinhaAnuncio, LinhaDemografia } from "@/lib/reports/relatorioCliente";
import type { IgSnapshot } from "@/lib/meta/igSnapshot";

type Acao = { action_type: string; value: string };

/** As ações como a Meta manda numa campanha de mensagem: o "conversation_started" vem junto do
 *  total_messaging_connection (maior, com reconexões) e de outras ações que não são resultado. */
export function acoesDeMensagem(conversas: number, cliques: number): Acao[] {
  const out: Acao[] = [
    { action_type: "link_click", value: String(cliques) },
    { action_type: "post_engagement", value: String(cliques + 40) },
    { action_type: "page_engagement", value: String(cliques + 42) },
  ];
  if (conversas > 0) {
    out.push(
      { action_type: "onsite_conversion.messaging_first_reply", value: String(Math.max(0, conversas - 1)) },
      { action_type: "onsite_conversion.total_messaging_connection", value: String(conversas + 3) },
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(conversas) },
    );
  }
  return out;
}

function acoesDeEngajamento(interacoes: number): Acao[] {
  return [
    { action_type: "post_engagement", value: String(interacoes) },
    { action_type: "page_engagement", value: String(interacoes) },
    { action_type: "post_reaction", value: String(Math.round(interacoes * 0.6)) },
    { action_type: "video_view", value: String(interacoes * 3) },
  ];
}

interface CampanhaFixture { id: string; nome: string; objetivo: string; gasto: number[]; conversas: number[]; impressoes: number[]; cliques: number[] }

function linhas(camps: CampanhaFixture[], dias: string[]): LinhaCampanhaDia[] {
  const out: LinhaCampanhaDia[] = [];
  for (const c of camps) {
    dias.forEach((d, i) => {
      const gasto = c.gasto[i] ?? 0;
      if (gasto === 0 && (c.impressoes[i] ?? 0) === 0) return; // a Meta omite dia sem veiculação
      out.push({
        campaign_id: c.id,
        campaign_name: c.nome,
        objective: c.objetivo,
        date_start: d,
        // date_stop, account_currency etc. também vêm — ficam de fora do tipo por não serem usados.
        spend: gasto.toFixed(2),
        impressions: String(c.impressoes[i]),
        clicks: String(c.cliques[i] + 12),
        inline_link_clicks: String(c.cliques[i]),
        actions: c.conversas.some((v) => v > 0) ? acoesDeMensagem(c.conversas[i], c.cliques[i]) : acoesDeEngajamento(c.cliques[i] * 4),
      });
    });
  }
  return out;
}

const SEMANA = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
const SEMANA_ANT = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];

export const HORTO_SEMANA: LinhaCampanhaDia[] = linhas([
  { id: "120210000000000001", nome: "ENGAJAMENTO - MENSAGEM - F", objetivo: "OUTCOME_ENGAGEMENT",
    gasto: [21.4, 22.1, 20.9, 21.3, 20.8, 19.6, 18.05], conversas: [3, 6, 4, 4, 5, 2, 3],
    impressoes: [1850, 1920, 1790, 1810, 1760, 1650, 1540], cliques: [98, 112, 101, 96, 93, 88, 81] },
  { id: "120210000000000002", nome: "MENSAGEM - ORQUÍDEAS", objetivo: "OUTCOME_ENGAGEMENT",
    gasto: [6.2, 7.9, 8.4, 8.1, 8.0, 8.6, 8.6], conversas: [1, 2, 1, 1, 1, 1, 4],
    impressoes: [520, 640, 690, 660, 650, 700, 705], cliques: [22, 31, 30, 29, 27, 33, 35] },
  { id: "120210000000000003", nome: "Post do Instagram: Nosso cantinho aconchegante🥰❤️...", objetivo: "OUTCOME_ENGAGEMENT",
    gasto: [7.5, 7.8, 7.6, 7.4, 7.2, 7.0, 8.0], conversas: [0, 0, 0, 0, 0, 0, 0],
    impressoes: [700, 715, 690, 680, 660, 650, 728], cliques: [5, 6, 4, 5, 4, 3, 6] },
], SEMANA);

export const HORTO_SEMANA_ANTERIOR: LinhaCampanhaDia[] = linhas([
  { id: "120210000000000001", nome: "ENGAJAMENTO - MENSAGEM - F", objetivo: "OUTCOME_ENGAGEMENT",
    gasto: [21.0, 21.2, 21.1, 21.0, 20.9, 21.0, 21.0], conversas: [2, 5, 4, 5, 3, 4, 3],
    impressoes: [1800, 1830, 1810, 1790, 1770, 1760, 1750], cliques: [90, 101, 95, 99, 88, 92, 85] },
  { id: "120210000000000002", nome: "MENSAGEM - ORQUÍDEAS", objetivo: "OUTCOME_ENGAGEMENT",
    gasto: [7.0, 7.0, 7.0, 6.9, 7.0, 7.0, 7.0], conversas: [1, 1, 2, 1, 1, 1, 1],
    impressoes: [600, 610, 590, 580, 600, 610, 600], cliques: [24, 25, 26, 22, 24, 25, 23] },
  { id: "120210000000000003", nome: "Post do Instagram: Nosso cantinho aconchegante🥰❤️...", objetivo: "OUTCOME_ENGAGEMENT",
    gasto: [6.3, 6.3, 6.3, 6.3, 6.3, 6.2, 6.3], conversas: [0, 0, 0, 0, 0, 0, 0],
    impressoes: [610, 600, 605, 590, 600, 580, 600], cliques: [4, 4, 3, 5, 4, 3, 4] },
], SEMANA_ANT);

export const HORTO_CONJUNTOS: LinhaConjunto[] = [
  { adset_id: "120210000000000011", adset_name: "Mulheres 25+ | Araruama e região", campaign_name: "ENGAJAMENTO - MENSAGEM - F", objective: "OUTCOME_ENGAGEMENT", spend: "111.60", actions: acoesDeMensagem(20, 560) },
  { adset_id: "120210000000000012", adset_name: "Público quente | engajou nos últimos 90 dias", campaign_name: "ENGAJAMENTO - MENSAGEM - F", objective: "OUTCOME_ENGAGEMENT", spend: "32.55", actions: acoesDeMensagem(7, 109) },
  { adset_id: "120210000000000021", adset_name: "Mulheres 30-65 | jardinagem e paisagismo", campaign_name: "MENSAGEM - ORQUÍDEAS", objective: "OUTCOME_ENGAGEMENT", spend: "55.80", actions: acoesDeMensagem(11, 207) },
  { adset_id: "120210000000000031", adset_name: "Novo conjunto de anúncios de Engajamento", campaign_name: "Post do Instagram: Nosso cantinho aconchegante🥰❤️...", objective: "OUTCOME_ENGAGEMENT", spend: "52.50", actions: acoesDeEngajamento(130) },
];

export const HORTO_ANUNCIOS: LinhaAnuncio[] = [
  { ad_id: "120210000000000101", ad_name: "Vídeo | Tour pelo horto", campaign_name: "ENGAJAMENTO - MENSAGEM - F", objective: "OUTCOME_ENGAGEMENT", spend: "70.20", impressions: "6120", actions: acoesDeMensagem(14, 370) },
  { ad_id: "120210000000000102", ad_name: "Carrossel | Promoção de vasos & cachepôs", campaign_name: "ENGAJAMENTO - MENSAGEM - F", objective: "OUTCOME_ENGAGEMENT", spend: "41.40", impressions: "3420", actions: acoesDeMensagem(6, 190) },
  { ad_id: "120210000000000103", ad_name: "Reels | 3 erros com suculentas", campaign_name: "ENGAJAMENTO - MENSAGEM - F", objective: "OUTCOME_ENGAGEMENT", spend: "32.55", impressions: "2820", actions: acoesDeMensagem(7, 109) },
  { ad_id: "120210000000000201", ad_name: "Foto | As orquídeas chegaram", campaign_name: "MENSAGEM - ORQUÍDEAS", objective: "OUTCOME_ENGAGEMENT", spend: "55.80", impressions: "4565", actions: acoesDeMensagem(11, 207) },
  { ad_id: "120210000000000301", ad_name: "Post do Instagram: Nosso cantinho aconchegante🥰❤️...", campaign_name: "Post do Instagram: Nosso cantinho aconchegante🥰❤️...", objective: "OUTCOME_ENGAGEMENT", spend: "52.50", impressions: "4823", actions: acoesDeEngajamento(130) },
];

/**
 * O público REAL do Horto em 14–20/09: só mulheres, só de 25 anos pra cima. É assim que a Meta
 * devolve (sem linha pra quem não foi alcançado — não existe "18-24" nem "male"), com a sobra de
 * gênero/idade desconhecidos numa linha "Unknown"/"unknown".
 */
export const HORTO_DEMOGRAFIA: LinhaDemografia[] = [
  { age: "25-34", gender: "female", reach: "1557", impressions: "2261" },
  { age: "35-44", gender: "female", reach: "3300", impressions: "4792" },
  { age: "45-54", gender: "female", reach: "3739", impressions: "5430" },
  { age: "55-64", gender: "female", reach: "2981", impressions: "4328" },
  { age: "65+", gender: "female", reach: "1730", impressions: "2512" },
  { age: "Unknown", gender: "unknown", reach: "41", impressions: "58" },
];

/** Conta comum: homens e mulheres, 13-17 aparecendo (anúncio sem restrição de idade), gênero e
 *  idade desconhecidos. Ordem da Meta: por idade, depois gênero. */
export const DEMOGRAFIA_MISTA: LinhaDemografia[] = [
  { age: "13-17", gender: "female", reach: "40", impressions: "52" },
  { age: "13-17", gender: "male", reach: "60", impressions: "70" },
  { age: "18-24", gender: "female", reach: "900", impressions: "1300" },
  { age: "18-24", gender: "male", reach: "700", impressions: "990" },
  { age: "18-24", gender: "unknown", reach: "25", impressions: "30" },
  { age: "25-34", gender: "female", reach: "1600", impressions: "2400" },
  { age: "25-34", gender: "male", reach: "1400", impressions: "2100" },
  { age: "35-44", gender: "female", reach: "1100", impressions: "1600" },
  { age: "35-44", gender: "male", reach: "1200", impressions: "1750" },
  { age: "45-54", gender: "female", reach: "500", impressions: "700" },
  { age: "45-54", gender: "male", reach: "450", impressions: "640" },
  { age: "55-64", gender: "female", reach: "200", impressions: "260" },
  { age: "55-64", gender: "male", reach: "180", impressions: "230" },
  { age: "65+", gender: "female", reach: "60", impressions: "80" },
  { age: "65+", gender: "male", reach: "90", impressions: "110" },
  { age: "Unknown", gender: "unknown", reach: "300", impressions: "420" },
];

// ── Miniaturas e Instagram (só pro render local — no servidor vêm da Meta) ────

function svgUri(cor1: string, cor2: string, rotulo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor1}"/><stop offset="1" stop-color="${cor2}"/></linearGradient></defs><rect width="240" height="240" fill="url(#g)"/><circle cx="170" cy="70" r="38" fill="#ffffff" fill-opacity=".18"/><path d="M0 190 Q60 140 120 175 T240 160 V240 H0Z" fill="#000" fill-opacity=".22"/><text x="18" y="222" font-family="Arial" font-size="22" font-weight="700" fill="#fff" fill-opacity=".85">${rotulo}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const MINIATURAS: Record<string, string> = {
  "120210000000000101": svgUri("#2f6b3a", "#a3c77a", "TOUR"),
  "120210000000000201": svgUri("#6d3b7d", "#e7a6c9", "ORQUÍDEAS"),
  "120210000000000103": svgUri("#3c5a2a", "#d9c07a", "REELS"),
};

export const HORTO_IG: IgSnapshot = {
  mapped: true,
  periodo: "7d",
  periodoLabel: "7 dias",
  fonte: "owned",
  conta: { username: "hortonaencplantas", seguidores: 4210, posts: 612 },
  resumo: { alcance: 5120, alcanceJanelaDias: 7, seguidoresGanhos: 38, curtidas: 486, comentarios: 57, engajamento: 543, postsNoPeriodo: 5 },
  audiencia: {
    generoMascPct: 21.4, generoFemPct: 78.6,
    idades: [{ faixa: "35-44", pct: 31.2 }, { faixa: "45-54", pct: 26.5 }, { faixa: "25-34", pct: 19.8 }, { faixa: "55-64", pct: 13.1 }, { faixa: "65+", pct: 6.2 }, { faixa: "18-24", pct: 3.2 }],
    cidades: [{ nome: "Araruama, Rio de Janeiro", pct: 41.3 }, { nome: "Iguaba Grande, Rio de Janeiro", pct: 12.8 }, { nome: "Cabo Frio, Rio de Janeiro", pct: 9.6 }],
  },
  posts: [
    { id: "1", tipo: "REELS", thumb: svgUri("#27543a", "#9cc46e", "REELS"), permalink: null, curtidas: 182, comentarios: 21, views: 3410, alcance: 2900, engajamento: 203, data: "2026-09-15T14:02:00+0000" },
    { id: "2", tipo: "CAROUSEL_ALBUM", thumb: svgUri("#6d3b7d", "#e7a6c9", "VASOS"), permalink: null, curtidas: 121, comentarios: 14, views: null, alcance: 1800, engajamento: 135, data: "2026-09-17T13:30:00+0000" },
    { id: "3", tipo: "IMAGE", thumb: svgUri("#7a5a2a", "#e8cf8f", "PROMO"), permalink: null, curtidas: 88, comentarios: 9, views: null, alcance: 1300, engajamento: 97, data: "2026-09-19T12:10:00+0000" },
    { id: "4", tipo: "VIDEO", thumb: svgUri("#2a4f5a", "#8ec5c9", "DICA"), permalink: null, curtidas: 61, comentarios: 8, views: 1220, alcance: 1000, engajamento: 69, data: "2026-09-14T18:45:00+0000" },
    { id: "5", tipo: "IMAGE", thumb: svgUri("#3a2f5a", "#b3a6e7", "BOM DIA"), permalink: null, curtidas: 34, comentarios: 5, views: null, alcance: 700, engajamento: 39, data: "2026-09-20T11:00:00+0000" },
  ],
};
