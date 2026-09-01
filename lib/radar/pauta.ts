// De tendência de mercado para pauta de um cliente específico.
//
// É aqui que o radar deixa de ser relatório e vira trabalho pronto. O social media não precisa de
// "existe uma tendência de antes/depois no seu nicho" — ele precisa de "post de quarta pro Armazém
// do Ferro: antes/depois de piso, com esta abertura e esta chamada".
//
// NÃO COPIAR é regra dura: o que se aproveita é o mecanismo (o formato, o ângulo, a estrutura), com
// os produtos e o jeito de falar DO CLIENTE. Copiar o texto de outra empresa é o pior resultado
// possível — sai igual ao concorrente e o cliente percebe.

export interface EntradaPauta {
  cliente: string;
  nicho: string;
  briefing?: string;
  regras?: string[];
  produtos?: string;
  cidade?: string;
  /** O que o mercado mostrou: tendência + as referências que a sustentam. */
  tendencia: {
    nome: string;
    formato: string;
    estrutura: string;
    hookTipo: string;
    porqueFunciona: string;
    quantosPerfis: number;
    exemplos: { permalink?: string; outlier: number }[];
  };
  /** O que o cliente já publicou, pra não repetir tema. */
  jaPublicou?: string[];
}

export const SCHEMA_PAUTA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["ideia", "hook", "formato", "roteiro", "cta", "porqueVaiFuncionar"],
  properties: {
    ideia: { type: "string", description: "título da peça, curto" },
    hook: { type: "string", description: "a primeira frase, escrita para ESTE cliente" },
    formato: { type: "string", description: "Reel, carrossel, post estático…" },
    roteiro: { type: "array", items: { type: "string" }, maxItems: 8, description: "passo a passo do conteúdo" },
    cta: { type: "string" },
    porqueVaiFuncionar: { type: "string", description: "o mecanismo aproveitado, em uma frase" },
  },
};

export function promptPauta(e: EntradaPauta): { system: string; user: string } {
  const system = [
    "Você é o estrategista de conteúdo de uma agência que atende comércio varejista no interior e",
    "litoral do Rio de Janeiro. Recebe um padrão que está funcionando no mercado e adapta para um",
    "cliente específico.",
    "",
    "REGRAS INEGOCIÁVEIS:",
    "- NÃO copie o texto das referências. Aproveite o MECANISMO: formato, ângulo, estrutura.",
    "- Use os produtos e o jeito de falar DO CLIENTE, que estão no briefing.",
    "- NÃO invente preço, promoção, prazo, garantia ou número. Nada que não esteja no briefing.",
    "- NÃO invente prova social ('mais de mil clientes', 'anos de mercado'). É o CLIENTE que vai ao ar dizendo.",
    "- Roteiro para ser gravado com celular na loja: nada que exija produção.",
    "- Português do Brasil, linguagem de quem fala com o cliente final, sem jargão.",
  ].join("\n");

  const user = [
    `CLIENTE: ${e.cliente}${e.cidade ? ` — ${e.cidade}` : ""}`,
    `Ramo: ${e.nicho}`,
    e.produtos ? `Produtos: ${e.produtos}` : "",
    e.briefing ? `Briefing:\n"""${e.briefing.slice(0, 1200)}"""` : "Briefing: (não cadastrado — fique no genérico do ramo, sem inventar oferta)",
    e.regras?.length ? `Regras deste cliente:\n${e.regras.map((r) => `- ${r}`).join("\n")}` : "",
    e.jaPublicou?.length ? `Já publicou recentemente (NÃO repetir tema):\n${e.jaPublicou.slice(0, 10).map((t) => `- ${t}`).join("\n")}` : "",
    "",
    "PADRÃO QUE ESTÁ FUNCIONANDO NO MERCADO DELE:",
    `Nome: ${e.tendencia.nome}`,
    `Formato: ${e.tendencia.formato}`,
    `Estrutura: ${e.tendencia.estrutura}`,
    `Tipo de abertura: ${e.tendencia.hookTipo}`,
    `Por que funciona: ${e.tendencia.porqueFunciona}`,
    `Visto em ${e.tendencia.quantosPerfis} perfis diferentes, com desempenho de ${e.tendencia.exemplos.map((x) => `${x.outlier.toFixed(1)}x`).join(", ")} acima do normal de cada um.`,
    "",
    "Escreva a pauta para este cliente no JSON pedido.",
  ].filter(Boolean).join("\n");

  return { system, user };
}
