// lib/conteudo/entrega-anexos.ts — QUAIS anexos do card vão numa entrega de arte. Regra pura
// (tests/entrega-anexos.test.ts); quem chama é o "Entregar arte" (components/conteudo/EntregarArteModal.tsx).
//
// Por que existe (21/10/2026, auditoria de erro recuperável, item 2.1): o "Entregar arte" mandava
// os ids de TODOS os anexos do card — inclusive o print de REFERÊNCIA do social e a VERSÃO ANTERIOR.
// A função do banco marcava tudo como "entrega", e o "Enviar pro cliente" mandava ao grupo do
// cliente o print copiado de outra marca junto com a arte. O Modo foco já fazia o certo: entrega só
// o que o designer acabou de subir e tira a versão anterior do card. Esta regra é a mesma, por escrito.

export type TipoDoAnexo = "referencia" | "entrega" | null | undefined;

export interface AnexoParaEntrega {
  id: string;
  tipo?: TipoDoAnexo;
  /** Versão (creative_deliveries) em que este anexo já foi entregue. null = ainda não entregue. */
  delivery_id?: string | null;
}

export interface PlanoDeEntrega {
  /** Ids que vão nesta entrega. */
  entregar: string[];
  /** Versão anterior que sai do card depois da entrega (o arquivo fica guardado para comparar). */
  remover: string[];
  /** Artes de entrega ainda não entregues (subidas agora ou antes, sem ter clicado em "Entregar"). */
  novas: number;
  /** Artes da versão anterior presentes no card. */
  anteriores: number;
  /** Nenhuma arte nova: a entrega repete a versão anterior (escolha consciente, dita na tela). */
  repeteAnterior: boolean;
  /** Referências do social — nunca entram numa entrega. */
  referencias: number;
  /** Anexos antigos sem classificação — ficam de fora até alguém marcar "entrega" neles. */
  semClassificacao: number;
}

/**
 * Separa o que vai na entrega.
 *
 * - referência: nunca;
 * - sem classificação (legado de antes de 09/08): nunca por palpite — o designer marca na própria arte;
 * - entrega ainda não entregue: vai (é a versão nova);
 * - entrega de uma versão anterior: com versão nova, sai do card se `substituirAnterior` (padrão do
 *   Modo foco) ou fica lá sem ir junto; sem versão nova, a entrega repete a anterior.
 */
export function planejarEntrega(
  anexos: readonly AnexoParaEntrega[],
  opcoes: { substituirAnterior: boolean },
): PlanoDeEntrega {
  const reais = anexos.filter((a) => a.id && a.id !== "legacy");
  const referencias = reais.filter((a) => a.tipo === "referencia");
  const semClassificacao = reais.filter((a) => !a.tipo);
  const entregas = reais.filter((a) => a.tipo === "entrega");
  const novas = entregas.filter((a) => !a.delivery_id);
  const anteriores = entregas.filter((a) => !!a.delivery_id);

  const temNova = novas.length > 0;
  return {
    entregar: (temNova ? novas : anteriores).map((a) => a.id),
    remover: temNova && opcoes.substituirAnterior ? anteriores.map((a) => a.id) : [],
    novas: novas.length,
    anteriores: anteriores.length,
    repeteAnterior: !temNova && anteriores.length > 0,
    referencias: referencias.length,
    semClassificacao: semClassificacao.length,
  };
}

const artes = (n: number) => `${n} arte${n === 1 ? "" : "s"}`;

/** O que a tela diz antes do clique: o que vai, o que sai do card e o que fica de fora. */
export function resumoDaEntrega(p: PlanoDeEntrega, link?: string | null): string[] {
  const linhas: string[] = [];
  if (p.entregar.length) {
    linhas.push(p.repeteAnterior
      ? `Nenhuma arte nova: vai entregar de novo a versão anterior (${artes(p.entregar.length)}).`
      : `Vai na entrega: ${artes(p.entregar.length)} nova${p.entregar.length === 1 ? "" : "s"}.`);
  } else if (link?.trim()) {
    linhas.push("Vai na entrega: o link colado.");
  }
  if (p.remover.length) linhas.push(`A versão anterior (${artes(p.remover.length)}) sai do card — continua guardada para comparar.`);
  else if (!p.repeteAnterior && p.anteriores > 0 && p.entregar.length) linhas.push(`A versão anterior (${artes(p.anteriores)}) fica no card, mas não vai nesta entrega.`);
  if (p.referencias) linhas.push(`${p.referencias === 1 ? "1 referência do social fica" : `${p.referencias} referências do social ficam`} de fora.`);
  if (p.semClassificacao) linhas.push(`${artes(p.semClassificacao)} sem classificação fica${p.semClassificacao === 1 ? "" : "m"} de fora — se for a arte final, marque "entrega" nela.`);
  return linhas;
}

/** Por que não dá pra entregar (nada a entregar). null = dá. */
export function faltaParaEntregar(p: PlanoDeEntrega, link?: string | null): string | null {
  if (p.entregar.length || link?.trim()) return null;
  if (p.semClassificacao) return `Há ${artes(p.semClassificacao)} sem classificação no card. Se for a arte final, clique em "entrega" nela (ou anexe a arte de novo).`;
  if (p.referencias) return "O card só tem referência do social. Anexe a arte final (ou cole o link) para entregar.";
  return "Anexe pelo menos uma arte ou cole o link da arte.";
}
