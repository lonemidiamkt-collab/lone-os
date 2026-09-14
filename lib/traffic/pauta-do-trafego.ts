// lib/traffic/pauta-do-trafego.ts — O QUE O TRÁFEGO DESCOBRIU VIRA PAUTA ORGÂNICA. Fase 6 do brief.
//
// "O tráfego pode falar: este produto está chamando atenção. Mas isso não significa que o social
// deve repostar o anúncio." Anúncio: "porcelanato 90×90 por R$ 49,90". Orgânico: "3 ambientes onde
// o porcelanato 90×90 funciona", "porcelanato grande deixa o ambiente maior?", "3 erros ao escolher
// porcelanato". Mesma inteligência comercial, outra função. Cai no Radar de Oportunidades
// (radar_pautas) do /planejamento, onde o social já decide usar/guardar/descartar.

import { chatJson } from "@/lib/ai/openai";

export interface AnguloOrganico { titulo: string; hook: string; formato: string; roteiro: string[]; cta: string; angulo: "educativo" | "curiosidade" | "erros" | "bastidor" | "prova" }
export interface PautasDoVencedor { produto: string; angulos: AnguloOrganico[] }

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["produto", "angulos"],
  properties: {
    produto: { type: "string" },
    angulos: { type: "array", items: { type: "object", additionalProperties: false, required: ["titulo", "hook", "formato", "roteiro", "cta", "angulo"], properties: {
      titulo: { type: "string" }, hook: { type: "string" }, formato: { type: "string" }, roteiro: { type: "array", items: { type: "string" } }, cta: { type: "string" },
      angulo: { type: "string", enum: ["educativo", "curiosidade", "erros", "bastidor", "prova"] },
    } } },
  },
};

const SYSTEM = `Você é o estrategista de conteúdo de uma agência para lojas/comércios locais (Região dos Lagos, RJ).
O TRÁFEGO descobriu que um anúncio de certo produto está vencendo (o público responde a esse produto AGORA).
Sua tarefa: transformar isso em 3 pautas ORGÂNICAS para o Instagram do cliente — que NÃO são o anúncio.
Regras:
- Nunca repita a oferta/preço do anúncio como post. O orgânico educa, gera curiosidade, mostra bastidor, aponta erros ou dá prova — e deixa o produto na cabeça.
- Cada pauta: título curto (formato — assunto), hook de 1 frase (os 3 primeiros segundos / primeira linha), formato (Reels, Carrossel, Post estático, Story), roteiro em 4-6 linhas curtas, CTA leve (nada de "compre agora").
- Três ângulos DIFERENTES entre si (ex.: educativo, curiosidade, erros). Português de agência, sem "descubra", sem "imperdível".
- Use o tom de voz e as palavras proibidas do cliente quando informados. Não invente preço, prazo ou promessa.`;

export async function pautasDoVencedor(p: { cliente: string; nicho?: string | null; produto: string; oferta?: string | null; evidencia: string; tomVoz?: string | null; palavrasProibidas?: string[]; produtosDestaque?: string[] }) {
  const user = [
    `Cliente: ${p.cliente}${p.nicho ? ` (${p.nicho})` : ""}`,
    `Produto que está vencendo nos anúncios: ${p.produto}${p.oferta ? ` — oferta do anúncio (NÃO repetir no orgânico): ${p.oferta}` : ""}`,
    `Evidência do tráfego: ${p.evidencia}`,
    p.tomVoz ? `Tom de voz do cliente: ${p.tomVoz}` : "",
    p.palavrasProibidas?.length ? `Palavras proibidas: ${p.palavrasProibidas.join(", ")}` : "",
    p.produtosDestaque?.length ? `Outros produtos em destaque: ${p.produtosDestaque.join(", ")}` : "",
    `Gere 3 pautas orgânicas.`,
  ].filter(Boolean).join("\n");
  return chatJson<PautasDoVencedor>({ model: "gpt-4o-mini", schemaName: "pautas_do_trafego", schema: SCHEMA, maxTokens: 1200, temperature: 0.7, system: SYSTEM, user, origem: "social:pauta-do-trafego" });
}
