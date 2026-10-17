// lib/texto/mascarar-valores.ts — tira QUANTIA EM DINHEIRO de texto livre. Módulo PURO, testado.
//
// Por que existe: quando uma venda vira cliente, as observações e o histórico do comercial vão para
// a ficha do cliente (client_journey.notas, que a equipe e o agente leem) e para o grupo interno do
// WhatsApp. "Fechou por 1.234, desconto de 200" anotado no lead vazava o dinheiro da agência para
// quem não deve ver. A regra é simples e conservadora: some o NÚMERO, fica a frase.
//
// Mascara: "R$ 1.234", "R$1234,00", "R$ 2,5 mil", "1234 reais", "2 mil reais", "1,8 mil", "3,2k",
// "1.234/mês", "1234 por mês", "mensalidade de 1234", "fechou por 1.234", "desconto de 200".
// Não mexe: datas (17/10, 17/10/2026), telefone, CEP, horário (14h30), "3 lojas", "10 mil
// seguidores", anos.

const MARCA = "[valor]";

// Número monetário: 1234 · 1.234 · 1.234,00 · 2,5 · 1234.50 — com "mil"/"k" opcional depois.
const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const MILHAR = String.raw`(?:\s?(?:mil|k)\b)?`;
// Depois de "10 mil", palavras que dizem que não é dinheiro.
const NAO_DINHEIRO = String.raw`(?!\s*(?:seguidores|curtidas|visualiza\w*|views|pessoas|alcance|impress\w*|km|metros|m²|habitantes|clientes|lojas|posts?|unidades))`;

const REGRAS: RegExp[] = [
  // R$ 1.234 · R$1234,00 · R$ 2,5 mil · R$ 3k
  new RegExp(String.raw`R\$\s?(?:${NUM})${MILHAR}`, "gi"),
  // 1234 reais · 2 mil reais · 1.234,00 reais
  new RegExp(String.raw`\b(?:${NUM})${MILHAR}\s?reais\b`, "gi"),
  // 1.234/mês · 1234 por mês · 1234 mensais · 1234/mensal
  new RegExp(String.raw`\b(?:${NUM})${MILHAR}\s?(?:\/\s?m[eê]s|por\s+m[eê]s|mensa(?:is|l)\b|\/\s?mensal)`, "gi"),
  // 1,8 mil · 3,2k · 2 mil (sem "seguidores"/"lojas" depois)
  new RegExp(String.raw`\b\d+(?:[.,]\d{1,2})?\s?(?:mil|k)\b${NAO_DINHEIRO}`, "gi"),
];

// Palavra que anuncia dinheiro + número logo depois: mantém a palavra, mascara o número.
const GATILHO = new RegExp(
  String.raw`\b(mensalidade|valor|pre[cç]o|ticket|investimento|or[cç]amento|desconto|fechou(?:\s+(?:por|em))?|fechamos(?:\s+(?:por|em))?|cobrar|cobra|paga(?:r|ria)?)(\s+(?:de|em|por|a|da|do)?\s*)(${NUM})(?![\d/])`,
  "gi",
);

export function mascararValores(texto: string | null | undefined): string {
  if (!texto) return "";
  let out = texto;
  for (const r of REGRAS) out = out.replace(r, MARCA);
  out = out.replace(GATILHO, (_m, palavra: string, meio: string) => `${palavra}${meio}${MARCA}`);
  // "[valor] mil" quando a regra do R$ pegou o número e deixou o "mil".
  return out.replace(/\[valor\]\s?(?:mil|k)\b/gi, MARCA);
}
