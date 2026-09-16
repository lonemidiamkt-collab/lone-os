// lib/prospeccao/providers/web-search.ts — descoberta pela busca web da OpenAI (Responses API +
// `web_search`), o mesmo mecanismo do Radar. A IA pesquisa "loja de tintas em Cabo Frio RJ" e
// devolve empresas em JSON. Só o que a busca MOSTROU: nome, site, Instagram, telefone, CNPJ se
// estiver visível. Nada de estimar — quem mede é o enriquecimento.

import { registrarChamadaLlm } from "@/lib/obs/llm";
import type { DiscoveryProvider, ConsultaDescoberta } from "./tipos";
import type { Candidato } from "../tipos";

const MODELO = "gpt-5.4-mini";

interface EmpresaBruta {
  nome?: string; cidade?: string; site?: string; instagram?: string; telefone?: string; cnpj?: string;
  endereco?: string; google_maps_url?: string; google_nota?: number | string; google_avaliacoes?: number | string; sinais?: string[];
}

function reciboResponses(json: Record<string, unknown> | null, t0: number, ok: boolean): void {
  const u = (json?.usage ?? null) as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } | null;
  registrarChamadaLlm({
    modelo: MODELO, ms: Date.now() - t0, ok, origem: "prospeccao:descoberta", tipo: "responses",
    usage: u ? { prompt_tokens: u.input_tokens, completion_tokens: u.output_tokens, prompt_tokens_details: { cached_tokens: u.input_tokens_details?.cached_tokens } } : null,
    erro: ok ? null : "sem resposta",
  });
}

function textoDaResposta(json: Record<string, unknown>): string {
  if (typeof json.output_text === "string") return json.output_text;
  let texto = "";
  for (const o of (json.output as Array<Record<string, unknown>>) ?? []) {
    for (const c of (o.content as Array<Record<string, unknown>>) ?? []) if (typeof c.text === "string") texto += `\n${c.text}`;
  }
  return texto;
}

/** Extrai o primeiro array JSON do texto (a IA às vezes embrulha em ```json). */
export function extrairArrayJson(texto: string): unknown[] {
  const limpo = texto.replace(/```(?:json)?/gi, "").trim();
  const ini = limpo.indexOf("["), fim = limpo.lastIndexOf("]");
  if (ini < 0 || fim <= ini) return [];
  try { const v = JSON.parse(limpo.slice(ini, fim + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function paraCandidatos(brutas: unknown[], q: ConsultaDescoberta, query: string): Candidato[] {
  const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  return (brutas as EmpresaBruta[])
    .filter((e) => e && typeof e.nome === "string" && e.nome.trim().length >= 3)
    .map((e) => ({
      nome: e.nome!.trim(),
      cidade: (e.cidade ?? q.cidade).trim() || q.cidade,
      uf: q.uf,
      segmento: q.segmento.nome,
      cnpj: e.cnpj ?? null,
      site: e.site ?? null,
      instagram: e.instagram ?? null,
      telefone: e.telefone ?? null,
      endereco: e.endereco ?? null,
      google_maps_url: e.google_maps_url ?? null,
      google_nota: num(e.google_nota),
      google_avaliacoes: num(e.google_avaliacoes) === null ? null : Math.round(num(e.google_avaliacoes)!),
      sinais: Array.isArray(e.sinais) ? e.sinais.map(String).slice(0, 6) : [],
      fonte: "web_search",
      query,
    }));
}

export async function buscarEmpresas(q: ConsultaDescoberta, apiKey: string): Promise<Candidato[]> {
  const termo = q.segmento.termos[0] ?? q.segmento.nome;
  const query = `${termo} em ${q.cidade} ${q.uf}`;
  const limite = q.limite ?? 12;
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      tools: [{ type: "web_search" }],
      input:
        `Pesquise na web: ${query}\n\n` +
        `Liste até ${limite} EMPRESAS REAIS desse tipo ("${q.segmento.nome}") sediadas em ${q.cidade}/${q.uf} ou muito próximas. ` +
        `Priorize lojas estabelecidas (com endereço físico, avaliações no Google, Instagram ativo). Ignore marketplaces, listas genéricas e grandes redes nacionais (Leroy Merlin, Telhanorte, C&C, Obramax).\n` +
        `Para cada empresa, informe SOMENTE o que a busca mostrou (não invente): nome, cidade, site, instagram (só o @ ou a URL), telefone (com DDD), cnpj (se aparecer no site/rodapé ou em cadastros públicos), endereco, google_maps_url, google_nota, google_avaliacoes, e "sinais" (até 4 frases curtas com fatos observados: "2 lojas", "anuncia no Instagram", "18 anos de mercado").\n` +
        `Responda APENAS com um array JSON de objetos com essas chaves (use null quando não souber). Sem texto fora do JSON.`,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json().catch(() => null) as Record<string, unknown> | null;
  reciboResponses(json, t0, !!json && res.ok);
  if (!json) return [];
  if (json.error) throw new Error(String((json.error as Record<string, unknown>)?.message ?? "web_search falhou"));
  return paraCandidatos(extrairArrayJson(textoDaResposta(json)), q, query);
}

export const webSearchProvider: DiscoveryProvider = {
  nome: "web_search",
  disponivel: () => !!process.env.OPENAI_API_KEY,
  descobrir: (q) => buscarEmpresas(q, process.env.OPENAI_API_KEY as string),
};

/**
 * Pesquisa complementar sobre UMA empresa (enriquecimento): Google, nº de lojas, anúncios,
 * proprietário. Devolve só o que foi visto, com a fonte de cada item.
 */
export interface AchadoEmpresa {
  google_nota?: number | null; google_avaliacoes?: number | null; google_maps_url?: string | null;
  unidades?: number | null; anuncia?: boolean | null; anuncia_fonte?: string | null;
  proprietario?: string | null; proprietario_cargo?: string | null; proprietario_fonte?: string | null;
  instagram?: string | null; site?: string | null; telefone?: string | null; cnpj?: string | null;
  endereco?: string | null; fatos?: string[]; fontes?: string[];
}

export async function pesquisarEmpresa(p: { nome: string; cidade?: string | null; uf?: string | null; instagram?: string | null; site?: string | null }, apiKey: string): Promise<AchadoEmpresa | null> {
  const t0 = Date.now();
  const ident = `${p.nome}${p.cidade ? ` — ${p.cidade}/${p.uf ?? "RJ"}` : ""}${p.instagram ? ` (Instagram @${p.instagram})` : ""}${p.site ? ` (site ${p.site})` : ""}`;
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      tools: [{ type: "web_search" }],
      input:
        `Pesquise na web sobre a empresa: ${ident}\n\n` +
        `Quero SÓ FATOS VERIFICÁVEIS que a busca mostrar (nunca deduza, nunca invente; use null quando não encontrar):\n` +
        `- google_nota e google_avaliacoes (Google Maps/Business), google_maps_url\n` +
        `- unidades: quantas lojas/filiais a empresa tem (número)\n` +
        `- anuncia: true se houver evidência de anúncios pagos (Biblioteca de Anúncios da Meta, "patrocinado", Google Ads); false só se você encontrou a empresa na Biblioteca de Anúncios sem anúncios ativos; senão null. anuncia_fonte: onde viu.\n` +
        `- proprietario: nome do dono/sócio/diretor citado em site, Instagram, LinkedIn, matéria ou cadastro público; proprietario_cargo; proprietario_fonte (URL ou nome da fonte)\n` +
        `- instagram (@), site, telefone (com DDD), cnpj (se visível), endereco\n` +
        `- fatos: até 5 frases curtas com fatos observados e úteis para uma conversa comercial (ex.: "inaugurou 2ª loja em 2025", "faz lives de ofertas toda sexta")\n` +
        `- fontes: lista das URLs consultadas\n` +
        `Responda APENAS com um objeto JSON com essas chaves.`,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json().catch(() => null) as Record<string, unknown> | null;
  const usage = (json?.usage ?? null) as { input_tokens?: number; output_tokens?: number } | null;
  registrarChamadaLlm({ modelo: MODELO, ms: Date.now() - t0, ok: !!json && res.ok, origem: "prospeccao:pesquisa-empresa", tipo: "responses",
    usage: usage ? { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens } : null, erro: json && res.ok ? null : "sem resposta" });
  if (!json || json.error) return null;
  const texto = textoDaResposta(json).replace(/```(?:json)?/gi, "").trim();
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(texto.slice(ini, fim + 1)) as AchadoEmpresa; } catch { return null; }
}
