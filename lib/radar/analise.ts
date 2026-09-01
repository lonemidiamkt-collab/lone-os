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

/**
 * Os mecanismos que se repetem no varejo — lista fechada, de propósito.
 *
 * A primeira versão pedia o mecanismo em texto livre e recebeu descrições longas e únicas: "ensino
 * direto de um look completo", "lista de novidades curadas por necessidade", "transforma uma dúvida
 * comum em regra prática". Os três são tutorial, mas não compartilham uma palavra — e o agrupamento
 * por semelhança nunca encontrava nada. Padrão que não se nomeia igual não se agrupa.
 *
 * A lista fechada é a chave do agrupamento; a descrição livre continua existindo ao lado, para a
 * pauta ter o detalhe.
 */
export const MECANISMOS = [
  "legado_historia",        // "90 anos construindo o Brasil"
  "erros_antes_da_compra",  // "3 erros ao escolher porcelanato"
  "antes_depois",           // transformação visível
  "demonstracao_produto",   // mostra funcionando
  "comparacao",             // barato x correto, A x B
  "bastidores",             // como é feito, quem faz
  "tutorial_ensino",        // ensina a fazer/escolher
  "lista_curadoria",        // seleção comentada
  "prova_social_cliente",   // cliente reagindo, depoimento
  "oferta_urgencia",        // promoção, últimos dias
  "identificacao_humor",    // "todo mundo que tem obra sabe"
  "pergunta_escolha",       // "qual você levaria?"
  "mito_verdade",           // desmente crença comum
  "outro",
] as const;

export type Mecanismo = typeof MECANISMOS[number];

export interface SaidaAnalise {
  tema: string;
  /**
   * O MECANISMO: por que aquilo prende, dito como ideia, não como formato.
   *
   * É a diferença entre "institucional" e "storytelling de legado". Formato é o recipiente —
   * carrossel, Reel, institucional; mecanismo é o que faz funcionar, e é isso que se replica num
   * negócio diferente. Agrupar por formato produzia tendência falsa: quatro conteúdos que só têm
   * em comum serem institucionais não são um movimento de mercado.
   */
  /** Um dos MECANISMOS. É a chave do agrupamento — precisa ser comparável entre conteúdos. */
  mecanismo: Mecanismo;
  /** O mesmo mecanismo dito com as palavras deste conteúdo. Enriquece a pauta, não agrupa. */
  mecanismoDetalhe: string;
  angulo: string;
  hook: string;
  hookTipo: string;
  formato: string;
  estrutura: string;
  cta: string;
  motivoPerformance: string;
  replicavel: string;
  tags: string[];
  /** O quanto dá pra confiar nisto, dado o material que chegou. Ver `NivelAnalise`. */
  confianca: "alta" | "media" | "baixa";
}

export const SCHEMA_ANALISE: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["tema", "mecanismo", "mecanismoDetalhe", "angulo", "hook", "hookTipo", "formato", "estrutura", "cta", "motivoPerformance", "replicavel", "tags", "confianca"],
  properties: {
    tema: { type: "string", description: "assunto do conteúdo, em poucas palavras" },
    mecanismo: {
      type: "string", enum: [...MECANISMOS],
      description: "O padrão que faz o conteúdo funcionar. Escolha o mais próximo; use 'outro' só se nenhum servir.",
    },
    mecanismoDetalhe: {
      type: "string",
      description: "O mesmo mecanismo dito com as palavras deste conteúdo, em uma linha. Nunca o formato.",
    },
    angulo: { type: "string", description: "o ponto de vista: educar, provocar, emocionar, provar, vender" },
    hook: { type: "string", description: "a primeira frase ou o que prende nos primeiros segundos; '' se não der pra saber" },
    hookTipo: { type: "string", enum: ["pergunta", "erro/alerta", "curiosidade", "promessa", "numero/lista", "transformacao", "bastidor", "institucional", "oferta", "indefinido"] },
    formato: { type: "string", enum: ["antes_depois", "lista", "tutorial", "demonstracao", "depoimento", "bastidor", "oferta", "storytelling", "institucional", "outro"] },
    estrutura: { type: "string", description: "como o conteúdo se organiza, em uma linha" },
    cta: { type: "string", description: "a chamada final; '' se não houver" },
    motivoPerformance: { type: "string", description: "hipótese do porquê performou acima do normal DESTE perfil" },
    replicavel: { type: "string", description: "o que outro negócio poderia repetir — o mecanismo, nunca o texto" },
    tags: { type: "array", items: { type: "string" }, maxItems: 6 },
    confianca: {
      type: "string", enum: ["alta", "media", "baixa"],
      description: "quanto dá pra confiar nesta leitura considerando o material recebido",
    },
  },
};

/** O que cada nível permite afirmar — e o que não permite. */
export const LIMITE_DO_NIVEL: Record<NivelAnalise, string> = {
  texto: "Você recebeu APENAS legenda e métricas. NÃO afirme nada sobre imagem, corte, edição, ritmo ou áudio. Confiança no máximo 'media'.",
  imagem: "Você recebeu legenda, métricas e a IMAGEM do post. Pode descrever o que se vê. NÃO afirme nada sobre ritmo, corte, movimento ou áudio.",
  video: "Você recebeu legenda, métricas e a MINIATURA de um vídeo — não o vídeo. Pode descrever o que a miniatura mostra (produto, pessoa, texto na tela, ambiente, se parece antes/depois). NÃO afirme nada sobre os primeiros segundos, ritmo, cortes, trilha ou áudio: você não assistiu. Confiança no máximo 'media'.",
};

export function promptAnalise(e: EntradaAnalise, nivel: NivelAnalise): { system: string; user: string } {
  const system = [
    "Você analisa conteúdo de redes sociais para uma agência que atende comércio varejista.",
    "Seu trabalho é explicar POR QUE um conteúdo performou acima do normal do próprio perfil e o que",
    "outro negócio poderia repetir. Extraia o MECANISMO, nunca o texto para ser copiado.",
    "",
    "REGRAS:",
    "- Não invente o que não está no material. Sem saber o hook, devolva string vazia.",
    `- ${LIMITE_DO_NIVEL[nivel]}`,
    "- MECANISMO é a parte mais importante: diga a IDEIA que faz o conteúdo funcionar, de um jeito que",
    "  outro negócio conseguiria repetir. 'Institucional' e 'carrossel' são formatos, não mecanismos.",
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
