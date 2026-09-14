// lib/traffic/atributos.ts — CADA CRIATIVO VIRA UM OBJETO. Brief do Roberto (14/09): "hoje uma arte é
// imagem.jpg; para o Lone OS ela deveria ser: produto, oferta, formato, headline, CTA, layout,
// pessoa na imagem, cor predominante, elemento de destaque". Extraído por visão para TODOS os
// anúncios (gpt-4o-mini: centavos), uma vez por versão. É a base do Creative Pattern e da memória
// em três níveis (cliente · segmento · Lone).

import { chatJson } from "@/lib/ai/openai";

export interface AtributosCriativo {
  produto: string | null;
  oferta: string | null;
  preco_visivel: boolean;
  headline: string | null;
  cta: string | null;
  layout: string;              // ex.: "produto centralizado com preço", "pessoa falando", "carrossel de ambientes"
  pessoa: boolean;
  cor_predominante: string;
  elemento_destaque: string;   // o que o olho vê primeiro
  texto_na_imagem: string | null;
  tags: string[];              // 3-6 palavras curtas: "preco", "fundo-escuro", "produto-isolado"…
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["produto", "oferta", "preco_visivel", "headline", "cta", "layout", "pessoa", "cor_predominante", "elemento_destaque", "texto_na_imagem", "tags"],
  properties: {
    produto: { type: ["string", "null"] }, oferta: { type: ["string", "null"] }, preco_visivel: { type: "boolean" },
    headline: { type: ["string", "null"] }, cta: { type: ["string", "null"] }, layout: { type: "string" }, pessoa: { type: "boolean" },
    cor_predominante: { type: "string" }, elemento_destaque: { type: "string" }, texto_na_imagem: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `Você descreve um anúncio de loja/comércio local como um OBJETO de dados. Só o que você VÊ na imagem e LÊ no texto — nada de interpretar por que funciona.
- produto: o produto/serviço anunciado (ou null). oferta: a condição comercial visível ("exame por R$ 50", "10% no PIX") ou null. preco_visivel: há preço na imagem?
- headline: a frase principal da imagem (ou null). cta: a chamada ("chame no WhatsApp") ou null.
- layout: 4-8 palavras. pessoa: há pessoa/rosto na imagem? cor_predominante: uma cor. elemento_destaque: o que se vê primeiro.
- texto_na_imagem: todo o texto legível na imagem (ou null). tags: 3-6 palavras curtas em minúsculas com hífen (ex.: "preco", "fundo-escuro", "produto-isolado", "pessoa", "promocao", "antes-depois").
Sem miniatura, preencha pelo texto e ponha layout = "sem imagem".`;

export async function extrairAtributos(p: { thumbUrl?: string | null; body?: string | null; title?: string | null; tipo?: string | null; cliente: string }) {
  const user = [
    `Cliente: ${p.cliente} · formato do anúncio: ${p.tipo ?? "?"}`,
    `Texto do anúncio: """${(p.body ?? "").slice(0, 1000)}"""`,
    p.title ? `Título: ${p.title}` : "",
    p.thumbUrl ? "A miniatura está anexada." : "Sem miniatura.",
  ].filter(Boolean).join("\n");
  return chatJson<AtributosCriativo>({
    model: "gpt-4o-mini", schemaName: "criativo_atributos", schema: SCHEMA, maxTokens: 500, temperature: 0.1,
    system: SYSTEM, user, imagens: p.thumbUrl ? [p.thumbUrl] : undefined, origem: "trafego:atributos",
  });
}
