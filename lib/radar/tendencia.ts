// Agrupar por MECANISMO, não por formato.
//
// "institucional", "carrossel" e "Reel" são recipientes. Quatro conteúdos que só têm em comum serem
// institucionais não são um movimento de mercado — "storytelling de legado da empresa" é. O que se
// replica num outro negócio é o mecanismo; o formato é só como ele foi embalado daquela vez.
//
// O agrupamento roda em dois passos, o barato antes do caro:
//   A. junta o que é obviamente parecido por palavras do mecanismo (sem IA);
//   B. um passo de IA lê os grupos e diz quais são a mesma ideia, e como se chama.

export interface ItemParaAgrupar {
  mediaId: string;
  perfil: string;
  nicho: string;
  mecanismo: string;
  tema: string;
  formato: string;
  hookTipo: string;
  outlier: number;
  permalink?: string;
  quando: string;
}

const VAZIAS = new Set([
  "de","da","do","das","dos","a","o","as","os","e","em","um","uma","para","por","com","que","no","na",
  "nos","nas","ao","aos","se","sua","seu","suas","seus","the","of","to","and","conteudo","conteúdo",
  "video","vídeo","post","publicacao","publicação","instagram","reel","reels","carrossel",
]);

export function palavrasChave(texto: string): Set<string> {
  return new Set(
    texto.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 3 && !VAZIAS.has(p)),
  );
}

/** Quanto dois mecanismos se parecem, de 0 a 1 (Jaccard sobre palavras que importam). */
export function semelhanca(a: string, b: string): number {
  const A = palavrasChave(a), B = palavrasChave(b);
  if (!A.size || !B.size) return 0;
  let comuns = 0;
  for (const p of A) if (B.has(p)) comuns++;
  return comuns / (A.size + B.size - comuns);
}

/** Passo A: junta o obviamente parecido, sem gastar IA. */
export function agruparPorSemelhanca(itens: ItemParaAgrupar[], limiar = 0.34): ItemParaAgrupar[][] {
  const grupos: ItemParaAgrupar[][] = [];
  for (const item of itens) {
    const alvo = grupos.find((g) =>
      g.some((x) =>
        x.nicho === item.nicho &&
        // Mecanismo canônico igual já basta: é uma lista fechada justamente para ser comparável.
        // A semelhança textual continua valendo para o detalhe, e para análises antigas que
        // guardaram o mecanismo em texto livre.
        (x.mecanismo === item.mecanismo || semelhanca(x.mecanismo, item.mecanismo) >= limiar)));
    if (alvo) alvo.push(item); else grupos.push([item]);
  }
  return grupos;
}

export interface TendenciaCandidata {
  nicho: string;
  itens: ItemParaAgrupar[];
  perfisDistintos: number;
  outlierMediano: number;
  maisRecente: string;
}

export function candidatas(grupos: ItemParaAgrupar[][]): TendenciaCandidata[] {
  return grupos.map((itens) => {
    const outliers = itens.map((i) => i.outlier).sort((a, b) => a - b);
    const meio = Math.floor(outliers.length / 2);
    return {
      nicho: itens[0].nicho,
      itens,
      perfisDistintos: new Set(itens.map((i) => i.perfil)).size,
      outlierMediano: outliers.length % 2 ? outliers[meio] : (outliers[meio - 1] + outliers[meio]) / 2,
      maisRecente: itens.map((i) => i.quando).sort().at(-1) ?? "",
    };
  });
}

export type StatusTendencia = "signal" | "emerging" | "growing" | "strong" | "declining" | "dead";

/**
 * Força e estágio da tendência.
 *
 * Recência pesa junto com tamanho: sem isso, dois conteúdos de 40 dias atrás mantinham uma
 * "tendência" viva para sempre, gerando a mesma pauta toda semana. Movimento de mercado que parou
 * de aparecer parou de ser movimento.
 */
export function avaliarForca(c: TendenciaCandidata, agora = new Date()): { forca: number; status: StatusTendencia } {
  const diasSemSinal = c.maisRecente
    ? (agora.getTime() - new Date(c.maisRecente).getTime()) / 864e5
    : 999;

  if (c.perfisDistintos < 2) return { forca: Math.min(25, c.itens.length * 10), status: "signal" };
  if (diasSemSinal > 30) return { forca: 10, status: "dead" };

  const nPerfis = Math.min(1, c.perfisDistintos / 6);          // 6 perfis distintos = saturado
  const nVolume = Math.min(1, c.itens.length / 10);
  const nOutlier = Math.min(1, Math.log10(Math.max(1, c.outlierMediano)) / Math.log10(10));
  const nRecencia = Math.max(0, 1 - diasSemSinal / 21);

  const forca = Math.round(100 * (0.35 * nPerfis + 0.2 * nVolume + 0.25 * nOutlier + 0.2 * nRecencia));

  const status: StatusTendencia =
    diasSemSinal > 14 ? "declining"
      : forca >= 70 ? "strong"
      : forca >= 45 ? "growing"
      : "emerging";
  return { forca, status };
}

/** Chave estável da tendência, para reencontrá-la entre execuções. */
export function assinatura(mecanismo: string): string {
  return [...palavrasChave(mecanismo)].sort().slice(0, 5).join("-") || "sem-mecanismo";
}
