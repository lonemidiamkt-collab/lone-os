// O que separa conteúdo que merece olhar do resto — antes de qualquer chamada de IA.
//
// A proposta original está certa no ponto principal: NÃO classificar por número absoluto. Um perfil
// de 2 milhões de seguidores com 100 mil views é rotina; um de 15 mil com 75 mil é um fenômeno. O
// que interessa é o desempenho contra a própria média do perfil.
//
// ADAPTAÇÃO NECESSÁRIA: a proposta baseia o outlier em VIEWS, e a API oficial não entrega views de
// Reel de terceiro — só curtidas e comentários. Ter views exigiria scraper, com custo por resultado
// e discussão de termos de uso. O sinal é o mesmo medido por ENGAJAMENTO: um post com 8x o
// engajamento mediano daquele perfil é tão anômalo quanto um com 8x as views.

export interface MidiaParaScore {
  likes: number;
  comments: number;
  followers: number;
  postedAt?: string;
  mediaType?: string;
}

/** Comentário pesa mais que curtida: custa mais ao público e sinaliza conversa, não só passagem. */
export const engajamento = (m: { likes: number; comments: number }) => m.likes + m.comments * 2;

/** Engajamento por seguidor. Sem isso, perfil grande ganha sempre. */
export function taxaEngajamento(m: MidiaParaScore): number | null {
  if (!m.followers || m.followers <= 0) return null;
  return engajamento(m) / m.followers;
}

/**
 * Mediana, não média.
 *
 * A média é puxada pelo próprio outlier que estamos procurando: um perfil com posts de 5, 7, 4, 8 e
 * um de 78 tem média 20, e o post excepcional passa a parecer só 4x acima do "normal". Com mediana
 * (6,5) ele aparece como 12x — que é a leitura correta.
 */
export function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Quantas vezes acima do normal daquele perfil.
 *
 * `null` quando não há base para comparar: perfil com menos de 5 posts, ou cuja mediana é zero.
 * Devolver 1 ou 0 nesses casos faria conteúdo sem base competir com conteúdo medido — o mesmo erro
 * de tratar ausência de dado como dado, que já custou caro em outros pontos do sistema.
 */
export function outlierRatio(m: MidiaParaScore, historico: MidiaParaScore[]): number | null {
  const base = historico.filter((h) => h.likes + h.comments > 0);
  if (base.length < 5) return null;
  const med = mediana(base.map(engajamento));
  if (med <= 0) return null;
  return engajamento(m) / med;
}

/** Post recente vale mais: tendência de 3 meses atrás já passou. Cai de 1 a 0 em 21 dias. */
export function frescor(postedAt?: string, agora = new Date()): number {
  if (!postedAt) return 0;
  const dias = (agora.getTime() - new Date(postedAt).getTime()) / 864e5;
  if (!Number.isFinite(dias) || dias < 0) return 0;
  return Math.max(0, Math.min(1, 1 - dias / 21));
}

export interface Score {
  valor: number;                 // 0–100
  outlierRatio: number | null;
  taxaEngajamento: number | null;
  temBase: boolean;              // false = não dá pra afirmar nada sobre este post
}

/**
 * Nota 0–100.
 *
 * Pesos próximos aos propostos, com uma diferença: sem outlier calculável o post NÃO recebe nota
 * cheia por taxa de engajamento. Ele é marcado como sem base e fica fora da seleção — perfil novo
 * ou recém-cadastrado tem taxas erráticas, e deixá-lo competir encheria o relatório de ruído logo
 * na primeira semana, que é justamente quando a confiança na ferramenta se decide.
 */
export function calcularScore(m: MidiaParaScore, historico: MidiaParaScore[], agora = new Date()): Score {
  const ratio = outlierRatio(m, historico);
  const taxa = taxaEngajamento(m);
  if (ratio === null) return { valor: 0, outlierRatio: null, taxaEngajamento: taxa, temBase: false };

  // 1x = normal → 0. 10x ou mais → 1. Log porque a diferença entre 1x e 3x importa muito mais que
  // entre 20x e 30x; linear faria um viral gigante achatar todo o resto da lista.
  const nOutlier = Math.max(0, Math.min(1, Math.log10(Math.max(1, ratio)) / Math.log10(10)));
  // 5% de engajamento sobre seguidores já é excelente no Instagram; acima disso satura.
  const nTaxa = taxa === null ? 0 : Math.max(0, Math.min(1, taxa / 0.05));
  const nFrescor = frescor(m.postedAt, agora);

  const valor = 100 * (0.55 * nOutlier + 0.25 * nTaxa + 0.20 * nFrescor);
  return {
    valor: Math.round(valor * 10) / 10,
    outlierRatio: Math.round(ratio * 100) / 100,
    taxaEngajamento: taxa === null ? null : Math.round(taxa * 10000) / 10000,
    temBase: true,
  };
}


// ── Anti-ruído e anti-monopólio ─────────────────────────────────────────────

export type Faixa = "micro" | "small" | "medium" | "large" | "enterprise";

export function faixaDePerfil(followers: number): Faixa {
  if (followers < 10_000) return "micro";
  if (followers < 50_000) return "small";
  if (followers < 250_000) return "medium";
  if (followers < 1_000_000) return "large";
  return "enterprise";
}

/**
 * Piso de engajamento absoluto por faixa.
 *
 * Ratio alto sozinho não significa nada em perfil minúsculo. Na primeira descoberta real apareceu
 * `revestimentosprime`: 9 seguidores, mediana 1 curtida, melhor post 3 — o cálculo diz "3x", e sem
 * este piso ele competiria com uma loja de 42 mil que fez 23x. Um post de 3 curtidas não é
 * tendência de mercado, é uma terça-feira.
 *
 * O piso sobe com o tamanho porque 30 interações num perfil de 200 mil também é ruído.
 */
const PISO_ENGAJAMENTO: Record<Faixa, number> = {
  micro: 40, small: 120, medium: 300, large: 800, enterprise: 2000,
};

/** Mínimo de posts para a mediana significar alguma coisa. Abaixo disso, não há régua. */
export const MIN_BASELINE = 8;

export interface Candidato {
  engajamento: number;
  followers: number;
  outlierRatio: number | null;
  postsNaBaseline: number;
}

export interface Veredito { aceito: boolean; motivo?: string }

/** O post merece entrar na fila de análise? */
export function avaliarCandidato(c: Candidato, ratioMinimo = 2.5): Veredito {
  if (c.postsNaBaseline < MIN_BASELINE) {
    return { aceito: false, motivo: `histórico curto demais (${c.postsNaBaseline} posts, mínimo ${MIN_BASELINE})` };
  }
  if (c.outlierRatio === null) return { aceito: false, motivo: "sem base de comparação" };
  if (c.outlierRatio < ratioMinimo) {
    return { aceito: false, motivo: `${c.outlierRatio.toFixed(1)}x — abaixo do mínimo de ${ratioMinimo}x` };
  }
  const piso = PISO_ENGAJAMENTO[faixaDePerfil(c.followers)];
  if (c.engajamento < piso) {
    return { aceito: false, motivo: `${c.engajamento} interações — abaixo do piso de ${piso} para o tamanho do perfil` };
  }
  return { aceito: true };
}

export interface ParaDiversificar<T> {
  item: T; perfil: string; followers: number; score: number;
}

/**
 * Diversifica a seleção final.
 *
 * Dois problemas que aparecem sozinhos e estragam o relatório:
 *   1. um perfil com dez posts bons ocupa dez lugares do Top 20 e some com todo mundo;
 *   2. contas gigantes dominam, e o valor do radar está justamente em achar a loja de 8 mil que
 *      acertou — quem quer saber o que a Leroy postou já sabe onde olhar.
 * O teto para grandes é proporcional, não proibitivo: marca grande entra quando fez algo
 * excepcional, só não pode ocupar a lista.
 */
export function diversificar<T>(
  itens: ParaDiversificar<T>[],
  { limite = 20, porPerfil = 2, tetoGrandes = 0.2 } = {},
): T[] {
  const ordenados = [...itens].sort((a, b) => b.score - a.score);
  const usadosPorPerfil = new Map<string, number>();
  const maxGrandes = Math.max(1, Math.floor(limite * tetoGrandes));
  let grandes = 0;
  const saida: T[] = [];

  for (const it of ordenados) {
    if (saida.length >= limite) break;
    const jaTem = usadosPorPerfil.get(it.perfil) ?? 0;
    if (jaTem >= porPerfil) continue;
    const ehGrande = it.followers >= 500_000;
    if (ehGrande && grandes >= maxGrandes) continue;
    usadosPorPerfil.set(it.perfil, jaTem + 1);
    if (ehGrande) grandes++;
    saida.push(it.item);
  }
  return saida;
}
