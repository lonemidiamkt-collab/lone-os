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
