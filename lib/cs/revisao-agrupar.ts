// lib/cs/revisao-agrupar.ts — o mesmo problema em três artes é UM problema.
//
// 01/10/2026, Reformar Construção: "Arte 1: Preços incluídos…", "Arte 2: Preços incluídos…",
// "Arte 3: O preço está incluído…" — 16 pontos numa mensagem de 1.009 caracteres, metade repetida.
// Aqui o texto igual vira uma linha só, dizendo em quais artes aparece.

const normalizar = (s: string) => s.trim().replace(/[.;\s]+$/, "").replace(/\s+/g, " ").toLowerCase();

/** "1" · "1 e 2" · "1, 2 e 3" */
function listaDeArtes(ns: number[]): string {
  if (ns.length === 1) return `Arte ${ns[0]}`;
  return `Artes ${ns.slice(0, -1).join(", ")} e ${ns[ns.length - 1]}`;
}

/**
 * `porArte[i]` são os problemas da arte i+1. Devolve as linhas prontas: com rótulo de arte quando
 * há mais de uma, e o problema repetido juntado numa linha só, na ordem em que apareceu primeiro.
 */
export function agruparProblemas(porArte: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const umaSo = porArte.length <= 1;
  const grupos = new Map<string, { texto: string; artes: number[] }>();
  porArte.forEach((lista, i) => {
    for (const p of lista) {
      const chave = normalizar(p);
      if (!chave) continue;
      const g = grupos.get(chave) ?? { texto: p.trim().replace(/[.;\s]+$/, ""), artes: [] };
      if (!g.artes.includes(i + 1)) g.artes.push(i + 1);
      grupos.set(chave, g);
    }
  });
  return [...grupos.values()].map((g) => (umaSo ? g.texto : `${listaDeArtes(g.artes)}: ${g.texto}`));
}

/**
 * O briefing vai à IA cortado num tamanho máximo. Cortar no meio da palavra fazia a IA acusar
 * "texto cortado" que era do BRIEFING, não da arte ("Contato (fechar a legenda com isto — endere").
 * Corta no fim de uma linha e diz que foi resumido.
 */
export function briefingResumido(briefing: string | null | undefined, max: number): string {
  const b = (briefing ?? "").trim();
  if (b.length <= max) return b;
  const corte = b.lastIndexOf("\n", max);
  const base = corte > max * 0.5 ? b.slice(0, corte) : b.slice(0, max).replace(/\s+\S*$/, "");
  return `${base.trimEnd()}\n[briefing resumido — o resto foi omitido; isto NÃO é texto da arte]`;
}

export interface ArteNaoVista { n: number; motivo: string }

/**
 * O comentário que a revisão deixa no card. null = nenhuma arte foi vista (o chamador avisa à parte).
 *
 * POR QUE (19/10/2026). Revisão que FALHOU contava como "sem problema": quando a imagem não baixava
 * (de 16 a 19/10 as artes deram 502 depois do reboot da VPS) ou a IA dava erro, o card ganhava
 * "✅ arte conferida, nenhum erro aparente" sem ninguém ter olhado nada — Contele e CIIL foram ao
 * cliente com esse selo. "Não consegui conferir" tem que ser dito, nunca virar aprovação.
 */
export function comentarioDaRevisao(problemas: string[], naoVistas: ArteNaoVista[], total: number): string | null {
  if (total > 0 && naoVistas.length >= total) return null;
  const parcial = naoVistas.length
    ? `\n\n⚠️ ${naoVistas.length} de ${total} artes NÃO foram conferidas (${naoVistas.map((a) => `arte ${a.n}`).join(", ")}: ${naoVistas[0].motivo}). Confira essas à mão.`
    : "";
  if (problemas.length === 0) {
    return naoVistas.length
      ? `✅ Revisão automática: as artes que consegui ver estão de acordo com o briefing.${parcial}`
      : "✅ Revisão automática: arte conferida contra o briefing, nenhum erro aparente.";
  }
  return `⚠️ Revisão automática encontrou pontos a conferir:\n${problemas.map((p) => `• ${p}`).join("\n")}${parcial}`;
}

/** Quando nenhuma arte pôde ser vista: o aviso que vai no card no lugar do selo. */
export function avisoSemConferencia(naoVistas: ArteNaoVista[]): string {
  const motivo = naoVistas[0]?.motivo ?? "erro desconhecido";
  return `⚠️ Revisão automática NÃO conseguiu ver a arte (${motivo}). Ninguém conferiu ainda: confira à mão antes de enviar ao cliente.`;
}
