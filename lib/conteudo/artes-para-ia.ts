// lib/conteudo/artes-para-ia.ts — QUAIS imagens do card a IA olha quando revisa a arte ou escreve
// a legenda. Regra pura (tests/artes-para-ia.test.ts); quem lê o banco é artes-para-ia-server.ts.
//
// Por que existe (24/10/2026, auditoria de erro recuperável, itens 2.9, 2.10 e 2.11):
//  · a revisão automática revisava TODOS os anexos — inclusive o print de referência do social, que
//    não é a arte — e parava em 6 sem dizer;
//  · "Revisar arte" e "Revisão final" olhavam a capa do card ou o 1º anexo — em geral a referência;
//  · "Gerar legenda" descrevia só a capa: num carrossel, a legenda falava da 1ª arte.
// A resposta certa é a mesma do "Enviar pro cliente" (lib/cs/envio-aprovacao.ts): as artes da
// ENTREGA ATUAL, nunca a referência. E quando a IA olha menos do que existe, isso é dito.

import { escolherArtesParaCliente, type AnexoDoCard } from "@/lib/cs/envio-aprovacao";
import { agruparProblemas } from "@/lib/cs/revisao-agrupar";

export interface ArteParaIa {
  /** Posição na entrega (1, 2, 3…). */
  n: number;
  url: string;
}

export interface ArtesParaIa {
  /** As que a IA vai olhar, na ordem da entrega. */
  artes: ArteParaIa[];
  /** Quantas artes de imagem a entrega tem (pode ser mais que `artes`, pelo limite). */
  total: number;
  /** Artes da entrega que ficaram de fora pelo limite desta conferência. */
  foraDoLimite: number;
  /** Referências do social — não são arte, nunca entram. */
  referencias: number;
  /** Artes que são link (ex.: Drive) — a IA não abre. */
  semImagem: number;
  /** Card antigo sem marca de entrega: foram os anexos sem classificação. */
  legado: boolean;
  /** Por que não há o que olhar. null = há. */
  erro: string | null;
}

/**
 * As artes da entrega atual que a IA olha, até `max`.
 * `max` = Infinity para "todas" (a conferência manual); a automática usa um teto de custo.
 */
export function artesParaIa(
  anexos: readonly AnexoDoCard[],
  entregaAtualId: string | null,
  capaDoCard: string | null | undefined,
  max: number,
): ArtesParaIa {
  const e = escolherArtesParaCliente(anexos, entregaAtualId, capaDoCard);
  const todas = e.artes; // já sem referência, só imagem direta, na ordem
  const total = todas.length + e.fora.acimaDoLimite;
  const teto = Math.max(0, Number.isFinite(max) ? Math.floor(max) : todas.length);
  const artes = todas.slice(0, teto).map((a, i) => ({ n: i + 1, url: a.url }));
  return {
    artes,
    total,
    foraDoLimite: total - artes.length,
    referencias: e.fora.referencias,
    semImagem: e.fora.semImagem,
    legado: e.legado,
    erro: e.erro,
  };
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** "Conferi 3 de 3 artes da entrega." — e o que ficou de fora, para a pessoa não achar que viu tudo. */
export function notaDeCobertura(a: Pick<ArtesParaIa, "artes" | "total" | "foraDoLimite" | "referencias" | "semImagem" | "legado">, vistas = a.artes.length): string {
  const partes: string[] = [];
  partes.push(`Conferi ${vistas} de ${a.total} ${plural(a.total, "arte", "artes")} da entrega.`);
  if (a.foraDoLimite > 0) {
    const de = a.total - a.foraDoLimite + 1;
    partes.push(`${a.foraDoLimite === 1 ? `A arte ${de} ficou` : `As artes ${de} a ${a.total} ficaram`} de fora (limite de ${a.total - a.foraDoLimite} por conferência) — confira à mão.`);
  }
  if (a.referencias) partes.push(`${a.referencias} ${plural(a.referencias, "referência do social não entrou", "referências do social não entraram")} (não é arte).`);
  if (a.semImagem) partes.push(`${a.semImagem} ${plural(a.semImagem, "arte é link e não deu para abrir", "artes são link e não deu para abrir")}.`);
  if (a.legado) partes.push("Card antigo: as artes não estão marcadas como entrega — confira se nenhuma é referência.");
  return partes.join(" ");
}

/**
 * As descrições de cada arte (visão), juntas para a IA da legenda. Num carrossel ela precisa saber
 * que são várias peças, em ordem — com uma descrição só, a legenda falava da capa.
 * `descricoes[i]` null = não consegui ver aquela arte.
 */
export function descricaoDasArtes(descricoes: readonly (string | null | undefined)[], maxPorArte = 500): string | undefined {
  const vistas = descricoes.map((d, i) => ({ n: i + 1, d: (d ?? "").trim() })).filter((x) => x.d);
  if (!vistas.length) return undefined;
  if (descricoes.length === 1) return vistas[0].d.slice(0, maxPorArte * 2);
  const total = descricoes.length;
  return vistas.map((x) => `Arte ${x.n} de ${total}: ${x.d.slice(0, maxPorArte)}`).join("\n");
}

// ─── O resultado da conferência manual ("Revisar arte") ─────────────────────

export interface ConferenciaDaArte {
  n: number;
  url: string;
  /** A IA conseguiu ver esta arte. false = falhou (imagem não baixou, IA deu erro, tempo acabou). */
  vista: boolean;
  /** Por que não viu. */
  motivo?: string | null;
  problemas: string[];
}

export interface ResumoDaConferencia {
  /** true só quando TODAS as artes foram vistas e nenhuma tem problema. */
  ok: boolean;
  resumo: string;
  /** Problemas já agrupados ("Artes 1 e 3: …") e as artes que não foram vistas. */
  problemas: string[];
  nota: string;
}

/**
 * Junta a conferência arte a arte numa resposta para a tela. Falha nunca vira "sem problema": arte
 * não vista aparece na lista e tira o ok (lib/cs/revisao-agrupar.ts, 19/10/2026).
 */
export function resumoDaConferencia(
  resultados: readonly ConferenciaDaArte[],
  cobertura: Pick<ArtesParaIa, "artes" | "total" | "foraDoLimite" | "referencias" | "semImagem" | "legado">,
): ResumoDaConferencia {
  const vistas = resultados.filter((r) => r.vista);
  const naoVistas = resultados.filter((r) => !r.vista);
  const nota = notaDeCobertura(cobertura, vistas.length);
  const agrupados = agruparProblemas(resultados.map((r) => (r.vista ? r.problemas : [])));
  const linhasNaoVistas = naoVistas.map((r) => `Arte ${r.n} NÃO foi conferida (${r.motivo ?? "erro desconhecido"}) — confira à mão.`);
  const problemas = [...agrupados, ...linhasNaoVistas];
  const total = resultados.length;
  if (!vistas.length) {
    return { ok: false, resumo: total === 1 ? "Não consegui ver a arte" : `Não consegui ver nenhuma das ${total} artes`, problemas, nota };
  }
  if (agrupados.length) {
    return { ok: false, resumo: `${agrupados.length} ponto${agrupados.length > 1 ? "s" : ""} a conferir`, problemas, nota };
  }
  if (naoVistas.length) {
    return { ok: false, resumo: `Sem erro aparente nas ${vistas.length} artes que consegui ver — ${naoVistas.length} sem conferência`, problemas, nota };
  }
  return { ok: true, resumo: total === 1 ? "Sem erros aparentes na arte" : `Sem erros aparentes nas ${total} artes`, problemas, nota };
}
