// lib/prospeccao/score.ts — ICP em números (§10), puro e determinístico. Sem IA aqui.
//
// A regra que mais importa está no faturamento: a BrasilAPI não diz quanto a loja fatura, e a
// web menos ainda. O que existe são SINAIS (porte, capital, avaliações, seguidores, lojas, anos
// de mercado). Eles viram uma FAIXA com confiança e `is_estimate: true` — nunca "fatura R$ 180 mil".
// O score usa a faixa; a mensagem ao prospect nunca menciona nada disso (§3).

import type { Classe, FaturamentoSinal, ProspectRow } from "./tipos";
import type { PesosScore, ProspectConfig, SegmentoIcp } from "./config";

export interface ItemScore { pontos: number; max: number; motivo: string }
export type DetalheScore = Record<keyof PesosScore, ItemScore>;

export function classeDe(score: number): Classe {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "NP";
}

const CLASSE_LABEL: Record<Classe, string> = { A: "Lead A", B: "Lead B", C: "Lead C", NP: "Não prioritário" };
export const rotuloClasse = (c: Classe | null | undefined) => (c ? CLASSE_LABEL[c] : "—");

/** Anos desde a abertura (null se não souber). */
export function anosDeMercado(abertura: string | null | undefined, agora = new Date()): number | null {
  if (!abertura) return null;
  const d = new Date(abertura.length === 10 ? `${abertura}T12:00:00Z` : abertura);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / (365.25 * 86_400_000)));
}

/**
 * Faixa de faturamento a partir de sinais. Cada sinal soma pontos a favor de "≥ R$100 mil/mês";
 * a confiança cresce com a QUANTIDADE de sinais disponíveis (3 sinais fracos dizem menos que
 * 1 forte, e nenhum sinal diz nada).
 */
export function faturamentoSinal(p: Pick<ProspectRow, "porte" | "capital_social" | "google_avaliacoes" | "presenca" | "unidades" | "abertura">, agora = new Date()): FaturamentoSinal {
  const sinais: string[] = [];
  let a_favor = 0, contra = 0, peso_total = 0;
  const conta = (cond: boolean | null, peso: number, seFavor: string, seContra: string) => {
    if (cond === null) return;
    peso_total += peso;
    if (cond) { a_favor += peso; sinais.push(seFavor); } else { contra += peso; sinais.push(seContra); }
  };

  const porte = (p.porte ?? "").toUpperCase();
  if (porte) {
    if (/MEI/.test(porte)) conta(false, 3, "", "porte MEI");
    else if (/^ME$|MICRO/.test(porte)) conta(false, 2, "", "porte ME (microempresa)");
    else if (/EPP|PEQUENO/.test(porte)) conta(true, 2, "porte EPP", "");
    else if (/DEMAIS|MEDIO|MÉDIO|GRANDE/.test(porte)) conta(true, 3, "porte acima de EPP", "");
  }
  if (typeof p.capital_social === "number") {
    if (p.capital_social >= 300_000) conta(true, 2, `capital social R$ ${Math.round(p.capital_social / 1000)} mil`, "");
    else if (p.capital_social >= 50_000) conta(true, 1, `capital social R$ ${Math.round(p.capital_social / 1000)} mil`, "");
    else conta(false, 1, "", `capital social baixo (R$ ${Math.round(p.capital_social / 1000)} mil)`);
  }
  if (typeof p.google_avaliacoes === "number") {
    if (p.google_avaliacoes >= 300) conta(true, 2, `${p.google_avaliacoes} avaliações no Google`, "");
    else if (p.google_avaliacoes >= 80) conta(true, 1, `${p.google_avaliacoes} avaliações no Google`, "");
    else conta(false, 1, "", `poucas avaliações no Google (${p.google_avaliacoes})`);
  }
  const seg = p.presenca?.instagram_followers;
  if (typeof seg === "number") {
    if (seg >= 10_000) conta(true, 2, `${seg.toLocaleString("pt-BR")} seguidores`, "");
    else if (seg >= 3_000) conta(true, 1, `${seg.toLocaleString("pt-BR")} seguidores`, "");
    else conta(false, 1, "", `Instagram pequeno (${seg} seguidores)`);
  }
  if (typeof p.unidades === "number" && p.unidades >= 2) conta(true, 2, `${p.unidades} unidades`, "");
  const anos = anosDeMercado(p.abertura, agora);
  if (anos !== null) {
    if (anos >= 10) conta(true, 1, `${anos} anos de mercado`, "");
    else if (anos < 2) conta(false, 1, "", `empresa recente (${anos} ano${anos === 1 ? "" : "s"})`);
  }
  if (p.presenca?.anuncia === true) conta(true, 1, "anuncia na Meta", "");

  const limpos = sinais.filter(Boolean);
  if (peso_total === 0) return { faixa: "indeterminado", confianca: 0, is_estimate: true, sinais: [] };
  const razao = a_favor / peso_total;
  // Confiança: quantos sinais tivemos (satura em ~8 de peso) × quão unânimes foram.
  const cobertura = Math.min(1, peso_total / 8);
  const unanimidade = Math.abs(razao - 0.5) * 2;
  const confianca = Math.round(cobertura * (0.4 + 0.6 * unanimidade) * 100) / 100;
  let faixa: FaturamentoSinal["faixa"];
  if (razao >= 0.75 && a_favor >= 5) faixa = "acima_300k";
  else if (razao >= 0.5) faixa = "100k_300k";
  else faixa = "abaixo_100k";
  void contra;
  return { faixa, confianca, is_estimate: true, sinais: limpos };
}

export const rotuloFaixa: Record<FaturamentoSinal["faixa"], string> = {
  indeterminado: "sem sinais suficientes",
  abaixo_100k: "provável abaixo de R$ 100 mil/mês",
  "100k_300k": "provável R$ 100–300 mil/mês",
  acima_300k: "provável acima de R$ 300 mil/mês",
};

/** O segmento do ICP que casa com o CNAE ou com o segmento anotado. */
export function segmentoAderente(p: Pick<ProspectRow, "cnae" | "segmento">, segmentos: SegmentoIcp[]): SegmentoIcp | null {
  const cnae = (p.cnae ?? "").replace(/\D/g, "");
  if (cnae) {
    const porCnae = segmentos.find((s) => s.cnaes.includes(cnae));
    if (porCnae) return porCnae;
  }
  const seg = (p.segmento ?? "").trim().toLowerCase();
  if (seg) {
    const porNome = segmentos.find((s) => s.nome.toLowerCase() === seg || s.termos.some((t) => t.toLowerCase() === seg));
    if (porNome) return porNome;
  }
  return null;
}

export function calcularScore(p: ProspectRow, cfg: ProspectConfig, agora = new Date()): { score: number; classe: Classe; detalhe: DetalheScore; faturamento: FaturamentoSinal } {
  const w = cfg.score.pesos;
  const d = {} as DetalheScore;
  const item = (k: keyof PesosScore, pontos: number, motivo: string) => { d[k] = { pontos: Math.min(pontos, w[k]), max: w[k], motivo }; };

  const seg = segmentoAderente(p, cfg.segmentos);
  item("segmento_aderente", seg ? w.segmento_aderente : 0, seg ? `segmento ${seg.nome}` : "segmento fora do ICP / não confirmado");

  const porte = (p.porte ?? "").toUpperCase();
  if (!porte) item("porte_adequado", 0, "porte não confirmado");
  else if (/MEI/.test(porte)) item("porte_adequado", 0, "MEI");
  else if (/^ME$|MICRO/.test(porte)) item("porte_adequado", Math.round(w.porte_adequado / 3), "microempresa");
  else item("porte_adequado", w.porte_adequado, `porte ${p.porte}`);

  const fat = faturamentoSinal(p, agora);
  if (fat.faixa === "indeterminado") item("faturamento_compativel", 0, "sem sinais de faturamento");
  else if (fat.faixa === "abaixo_100k") item("faturamento_compativel", 0, `${rotuloFaixa[fat.faixa]} (estimativa)`);
  else item("faturamento_compativel", fat.confianca >= 0.5 ? w.faturamento_compativel : Math.round(w.faturamento_compativel / 2), `${rotuloFaixa[fat.faixa]} (estimativa, confiança ${Math.round(fat.confianca * 100)}%)`);

  const pr = p.presenca;
  const seguidores = pr?.instagram_followers ?? null;
  const freq = pr?.posts_por_semana ?? null;
  if (!p.instagram) item("presenca_digital", 0, "sem Instagram identificado");
  else if (seguidores === null) item("presenca_digital", Math.round(w.presenca_digital * 0.3), "Instagram não lido (perfil não comercial ou API indisponível)");
  else if (seguidores >= 3000 && (freq ?? 0) >= 1) item("presenca_digital", w.presenca_digital, `${seguidores.toLocaleString("pt-BR")} seguidores, ${freq} posts/semana`);
  else if (seguidores >= 1000) item("presenca_digital", Math.round(w.presenca_digital * 0.6), `${seguidores.toLocaleString("pt-BR")} seguidores`);
  else item("presenca_digital", Math.round(w.presenca_digital * 0.3), `Instagram pequeno (${seguidores})`);

  if (p.google_avaliacoes === null || p.google_avaliacoes === undefined) item("google_estruturado", 0, "Google não confirmado");
  else if ((p.google_nota ?? 0) >= 4.3 && p.google_avaliacoes >= 100) item("google_estruturado", w.google_estruturado, `${p.google_nota} estrelas, ${p.google_avaliacoes} avaliações`);
  else if (p.google_avaliacoes >= 30) item("google_estruturado", Math.round(w.google_estruturado * 0.6), `${p.google_nota ?? "?"} estrelas, ${p.google_avaliacoes} avaliações`);
  else item("google_estruturado", Math.round(w.google_estruturado * 0.3), `poucas avaliações (${p.google_avaliacoes})`);

  if (pr?.anuncia === true) item("anuncios_ativos", w.anuncios_ativos, `anuncia (${pr.anuncia_fonte ?? "fonte não registrada"})`);
  else if (pr?.anuncia === false) item("anuncios_ativos", 0, "sem anúncios identificados");
  else item("anuncios_ativos", 0, "anúncios não verificados");

  item("mais_de_uma_unidade", (p.unidades ?? 0) >= 2 ? w.mais_de_uma_unidade : 0, (p.unidades ?? 0) >= 2 ? `${p.unidades} unidades` : "1 unidade ou não confirmado");
  item("decisor_identificado", p.decisor_nome && (p.decisor_confianca ?? 0) >= 0.6 ? w.decisor_identificado : 0, p.decisor_nome ? `${p.decisor_nome} (${Math.round((p.decisor_confianca ?? 0) * 100)}%)` : "decisor não identificado");
  item("site", p.site ? w.site : 0, p.site ? "tem site" : "sem site");

  const km = p.distancia_km;
  const ufOk = !p.uf || cfg.uf_permitidas.map((u) => u.toUpperCase()).includes(p.uf.toUpperCase());
  if (!ufOk) item("localizacao_estrategica", 0, `fora de ${cfg.uf_permitidas.join("/")}`);
  else if (km !== null && km <= cfg.raio_visita_km) item("localizacao_estrategica", w.localizacao_estrategica, `${km} km — raio de visita`);
  else if (km !== null && km <= cfg.raio_visita_km * 2) item("localizacao_estrategica", Math.round(w.localizacao_estrategica * 0.6), `${km} km`);
  else item("localizacao_estrategica", Math.round(w.localizacao_estrategica * 0.2), km === null ? "distância não calculada" : `${km} km`);

  const score = Object.values(d).reduce((s, i) => s + i.pontos, 0);
  return { score, classe: classeDe(score), detalhe: d, faturamento: fat };
}
