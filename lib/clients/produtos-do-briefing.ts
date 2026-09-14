// lib/clients/produtos-do-briefing.ts — PRODUTOS a partir do que já sabemos do cliente (Roberto,
// 14/09: "se temos o briefing, já sabemos o que eles vendem"). A semente inicial usou só o campo
// `produtos` do briefing; aqui a IA lê o resto (resumo estratégico, destaques, briefing fixo e de
// campanha, regras ativas com produto/preço) e devolve o que falta no catálogo. Fato, não invenção:
// só entra o que está NOMEADO no texto.

import { chatJson } from "@/lib/ai/openai";

export interface ProdutoExtraido { nome: string; categoria: string | null; marca: string | null; preco: number | null; descricao: string | null }

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    produtos: { type: "array", maxItems: 25, items: { type: "object", additionalProperties: false,
      properties: { nome: { type: "string" }, categoria: { type: ["string", "null"] }, marca: { type: ["string", "null"] }, preco: { type: ["number", "null"] }, descricao: { type: ["string", "null"] } },
      required: ["nome", "categoria", "marca", "preco", "descricao"] } },
  },
  required: ["produtos"],
};

const SYSTEM = `Você organiza o catálogo de um cliente de agência (comércio local no Brasil) a partir do briefing dele.
Liste APENAS produtos ou serviços NOMEADOS no texto — nada de inventar linha, marca ou preço. Preço só se estiver escrito (número em reais).
Nome curto e vendável (ex.: "Tinta Suvinil 18L", "Piso porcelanato 60x60", "Consulta veterinária"). Categoria em 1–2 palavras. Descrição em 1 frase só se o texto der detalhe.
Não repita os produtos que já estão no catálogo (lista fornecida). Se não houver nada novo nomeado, devolva lista vazia.`;

/** Normaliza para comparar nomes: sem acento, minúsculo, sem pontuação. */
export function chaveNome(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Tira do resultado o que já existe (por nome normalizado) e duplicatas internas. Pura. */
export function apenasNovos(extraidos: ProdutoExtraido[], existentes: string[]): ProdutoExtraido[] {
  const vistos = new Set(existentes.map(chaveNome));
  const out: ProdutoExtraido[] = [];
  for (const p of extraidos) {
    const k = chaveNome(p.nome);
    if (!k || k.length < 3 || vistos.has(k)) continue;
    vistos.add(k);
    out.push({ ...p, nome: p.nome.trim().slice(0, 120) });
  }
  return out;
}

export function montarTexto(p: { resumo?: string | null; destaques?: string[] | null; produtosBriefing?: string[] | null; fixo?: string | null; campanha?: string | null; regras?: string[] }): string {
  return [
    p.resumo ? `Resumo estratégico: ${p.resumo}` : "",
    p.produtosBriefing?.length ? `Produtos citados no briefing: ${p.produtosBriefing.join("; ")}` : "",
    p.destaques?.length ? `Destaques atuais: ${p.destaques.join("; ")}` : "",
    p.fixo ? `Briefing fixo: ${p.fixo}` : "",
    p.campanha ? `Briefing de campanha: ${p.campanha}` : "",
    p.regras?.length ? `Regras/observações ativas: ${p.regras.join(" | ")}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 9000);
}

export async function extrairProdutos(p: { cliente: string; nicho?: string | null; texto: string; existentes: string[] }) {
  const user = [`Cliente: ${p.cliente}${p.nicho ? ` · ramo: ${p.nicho}` : ""}`, `Já no catálogo: ${p.existentes.length ? p.existentes.join("; ") : "(vazio)"}`, `--- TEXTO ---`, p.texto].join("\n");
  const r = await chatJson<{ produtos: ProdutoExtraido[] }>({ model: "gpt-4o-mini", schemaName: "produtos_briefing", schema: SCHEMA, maxTokens: 1500, temperature: 0.1, system: SYSTEM, user, origem: "cliente:produtos-briefing" });
  if (!r.ok || !r.data) return { ok: false as const, erro: r.ok ? "resposta vazia" : r.error };
  return { ok: true as const, produtos: apenasNovos(r.data.produtos ?? [], p.existentes) };
}
