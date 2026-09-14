// lib/traffic/estilo-visual.ts — ESTILO VISUAL do cliente lido de prints (item 12 do brief 14/09).
// A equipe sobe 1–4 prints do Instagram/feed do cliente; a visão descreve paleta, tipografia,
// composição e elementos recorrentes. Isso vira parte do DNA e entra no briefing de toda replicação.
// Fato ≠ gosto: o modelo descreve o que VÊ; quem decide se aquilo é "a cara da marca" é a equipe.

import { chatJson } from "@/lib/ai/openai";

export interface EstiloVisual {
  paleta: { hex: string; papel: string }[];
  tipografia: string;
  composicao: string;
  elementos_recorrentes: string[];
  tom_visual: string;
  o_que_evitar: string[];
  resumo: string;
}

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    paleta: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, properties: { hex: { type: "string" }, papel: { type: "string" } }, required: ["hex", "papel"] } },
    tipografia: { type: "string" },
    composicao: { type: "string" },
    elementos_recorrentes: { type: "array", maxItems: 8, items: { type: "string" } },
    tom_visual: { type: "string" },
    o_que_evitar: { type: "array", maxItems: 5, items: { type: "string" } },
    resumo: { type: "string" },
  },
  required: ["paleta", "tipografia", "composicao", "elementos_recorrentes", "tom_visual", "o_que_evitar", "resumo"],
};

const SYSTEM = `Você é diretor de arte de uma agência que atende comércio local no Brasil. Vai receber prints do Instagram (feed, posts ou anúncios) de UM cliente.
Descreva o ESTILO VISUAL que está de fato nas imagens — não invente o que não vê, não elogie, não sugira mudança.
- paleta: até 6 cores em hex aproximado, cada uma com o papel (fundo, destaque, texto, preço…).
- tipografia: famílias/pesos aparentes (ex.: "sans grossa condensada em caixa alta para títulos; script leve em apoio").
- composicao: como as peças são montadas (grade, posição de logo/preço/CTA, densidade, fotos vs. ilustração).
- elementos_recorrentes: o que se repete (selo de preço, bolinha de desconto, foto de produto em fundo branco, pessoa real, faixa no rodapé…).
- tom_visual: 1 frase (ex.: "promocional, colorido e denso" ou "limpo, premium, fotos grandes").
- o_que_evitar: o que claramente NÃO combina com o que está ali (só quando for evidente pelas imagens).
- resumo: 2–3 frases em português, para o designer ler antes de abrir a peça.`;

export async function analisarEstiloVisual(p: { imagens: string[]; cliente: string; nicho?: string | null }) {
  const user = [`Cliente: ${p.cliente}${p.nicho ? ` · ramo: ${p.nicho}` : ""}`, `${p.imagens.length} print(s) anexado(s).`].join("\n");
  return chatJson<EstiloVisual>({
    model: "gpt-4o", schemaName: "estilo_visual", schema: SCHEMA, maxTokens: 900, temperature: 0.2,
    system: SYSTEM, user, imagens: p.imagens, origem: "cliente:estilo-visual",
  });
}

/** Linha curta e factual para entrar num briefing (pura). */
export function linhaEstilo(e: EstiloVisual | null | undefined): string | null {
  if (!e) return null;
  const cores = e.paleta.slice(0, 4).map((c) => `${c.hex} (${c.papel})`).join(", ");
  const partes = [e.resumo, cores ? `Cores: ${cores}.` : "", e.tipografia ? `Tipografia: ${e.tipografia}.` : "", e.elementos_recorrentes.length ? `Recorrente: ${e.elementos_recorrentes.slice(0, 4).join("; ")}.` : ""];
  const txt = partes.filter(Boolean).join(" ");
  if (txt.length <= 900) return txt;
  const corte = txt.lastIndexOf(" ", 900); // corta em palavra, não no meio de "sans ser…"
  return txt.slice(0, corte > 600 ? corte : 900).replace(/[,;:]$/, "") + "…";
}

/** Último estilo lido do cliente (ou null). Usado pela replicação e pelas variações de imagem. */
export async function estiloVisualDoCliente(clientId: string): Promise<EstiloVisual | null> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data } = await supabaseAdmin.from("client_visual_style").select("analise").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.analise as EstiloVisual) ?? null;
}
