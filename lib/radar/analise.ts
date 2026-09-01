// O que o conteúdo TEM dentro — não só quanto engajou.
//
// Saber que um Reel fez 12x a mediana do perfil não ajuda ninguém a produzir nada. O social media
// precisa saber o que aquele conteúdo fez: qual foi a primeira frase, que formato, que estrutura,
// que chamada. É isso que se replica; o número só diz onde olhar.
//
// LIMITE MEDIDO, não suposto: o capability probe mostrou que a Meta entrega o arquivo de IMAGE e
// CAROUSEL de terceiros, mas NÃO o de VIDEO — só a miniatura. Então Reel de outra empresa é
// analisado por legenda + miniatura + métricas, e o nível fica registrado em cada análise. Nunca
// dizer que "analisou o vídeo" quando se viu uma imagem parada e um texto.

export type NivelAnalise = "texto" | "imagem" | "video";

export interface EntradaAnalise {
  caption?: string;
  mediaType: string;
  permalink?: string;
  followers: number;
  likes: number;
  comments: number;
  outlierRatio: number;
  imagemDataUri?: string;   // quando a Meta entregou o arquivo
}

export interface SaidaAnalise {
  tema: string;
  hook: string;
  hookTipo: string;
  formato: string;
  estrutura: string;
  cta: string;
  motivoPerformance: string;
  replicavel: string;
  tags: string[];
}

export const SCHEMA_ANALISE: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["tema", "hook", "hookTipo", "formato", "estrutura", "cta", "motivoPerformance", "replicavel", "tags"],
  properties: {
    tema: { type: "string", description: "assunto em poucas palavras" },
    hook: { type: "string", description: "a primeira frase ou o que prende nos primeiros segundos; '' se não der pra saber" },
    hookTipo: { type: "string", enum: ["pergunta", "erro/alerta", "curiosidade", "promessa", "numero/lista", "transformacao", "bastidor", "institucional", "oferta", "indefinido"] },
    formato: { type: "string", enum: ["antes_depois", "lista", "tutorial", "demonstracao", "depoimento", "bastidor", "oferta", "storytelling", "institucional", "outro"] },
    estrutura: { type: "string", description: "como o conteúdo se organiza, em uma linha" },
    cta: { type: "string", description: "a chamada final; '' se não houver" },
    motivoPerformance: { type: "string", description: "hipótese do porquê performou acima do normal DESTE perfil" },
    replicavel: { type: "string", description: "o que outro negócio poderia repetir — o mecanismo, nunca o texto" },
    tags: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
};

export function promptAnalise(e: EntradaAnalise, nivel: NivelAnalise): { system: string; user: string } {
  const system = [
    "Você analisa conteúdo de redes sociais para uma agência que atende comércio varejista.",
    "Seu trabalho é explicar POR QUE um conteúdo performou acima do normal do próprio perfil e o que",
    "outro negócio poderia repetir. Extraia o MECANISMO, nunca o texto para ser copiado.",
    "",
    "REGRAS:",
    "- Não invente o que não está no material. Sem saber o hook, devolva string vazia.",
    nivel === "texto"
      ? "- Você recebeu APENAS legenda e métricas: não afirme nada sobre imagem, corte ou edição."
      : nivel === "imagem"
      ? "- Você recebeu legenda, métricas e UMA imagem estática: não afirme nada sobre ritmo, corte ou áudio."
      : "- Você recebeu legenda, métricas e quadros do vídeo.",
    "- 'Performou acima do normal' é relativo AO PRÓPRIO PERFIL. Não comente tamanho de seguidores.",
    "- Escreva em português do Brasil, direto, sem jargão de marketing.",
  ].join("\n");

  const user = [
    `Tipo de mídia: ${e.mediaType}`,
    `Desempenho: ${e.outlierRatio.toFixed(1)}x o engajamento mediano deste perfil`,
    `Interações: ${e.likes} curtidas, ${e.comments} comentários`,
    e.caption ? `Legenda:\n"""${e.caption.slice(0, 1200)}"""` : "Legenda: (sem legenda)",
    "",
    "Explique o conteúdo no JSON pedido.",
  ].join("\n");

  return { system, user };
}
