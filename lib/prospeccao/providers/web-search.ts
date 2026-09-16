// lib/prospeccao/providers/web-search.ts — descoberta pela busca web da OpenAI (Responses API +
// `web_search`), o mesmo mecanismo do Radar. A IA pesquisa "loja de tintas em Cabo Frio RJ" e
// devolve empresas em JSON. Só o que a busca MOSTROU: nome, site, Instagram, telefone, CNPJ se
// estiver visível. Nada de estimar — quem mede é o enriquecimento.

import { registrarChamadaLlm } from "@/lib/obs/llm";
import type { DiscoveryProvider, ConsultaDescoberta } from "./tipos";
import type { Candidato } from "../tipos";

const MODELO = "gpt-5.4-mini";

interface EmpresaBruta {
  nome?: string; cidade?: string; site?: string; instagram?: string; telefone?: string; whatsapp?: string; cnpj?: string;
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

/**
 * "4.4" → 4.4 · "4,4" → 4.4 · "1.240" → 1240 · "1,240" → 1240 · "382 avaliações" → 382.
 * A IA devolve tanto formato americano quanto brasileiro; o ponto só é milhar quando vem em grupos de 3.
 */
export function numeroBr(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Nota do Google é 0–5; "44" ou "4.4/5" viram 4.4. */
export function notaGoogle(v: unknown): number | null {
  const n = numeroBr(typeof v === "string" ? v.replace(/\/\s*5.*$/, "") : v);
  if (n === null) return null;
  // "44" = 4,4 sem a vírgula; "7" não é nota de nada.
  if (n >= 10 && n <= 50 && Number.isInteger(n)) return n / 10;
  if (n < 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

/** "Araruama/RJ", "Araruama - RJ", "Araruama, RJ" → "Araruama". */
export function cidadeLimpa(v: unknown, padrao: string): string {
  const s = String(v ?? "").replace(/\s*[\/,-]\s*[A-Z]{2}\s*$/i, "").replace(/\s+RJ$/i, "").trim();
  return s || padrao;
}

export function paraCandidatos(brutas: unknown[], q: ConsultaDescoberta, query: string): Candidato[] {
  const num = (v: unknown) => numeroBr(v);
  const nomeRuim = (n: string) => /^(null|undefined|n\/a|-+|sem nome|desconhecid[oa])$/i.test(n.trim());
  return (brutas as EmpresaBruta[])
    .filter((e) => e && typeof e.nome === "string" && e.nome.trim().length >= 3 && !nomeRuim(e.nome))
    .map((e) => ({
      nome: e.nome!.trim().replace(/\s*[-–|]\s*(material|materiais|loja|casa|depósito|deposito|distribuidora)\b.*$/i, "").trim() || e.nome!.trim(),
      cidade: cidadeLimpa(e.cidade, q.cidade),
      uf: q.uf,
      segmento: q.segmento.nome,
      cnpj: e.cnpj ?? null,
      site: e.site ?? null,
      instagram: e.instagram ?? null,
      // Celular/WhatsApp vale mais que o fixo: é o que a Rafaela consegue chamar.
      telefone: e.whatsapp ?? e.telefone ?? null,
      endereco: e.endereco ?? null,
      google_maps_url: e.google_maps_url ?? null,
      google_nota: notaGoogle(e.google_nota),
      google_avaliacoes: num(e.google_avaliacoes) === null ? null : Math.round(num(e.google_avaliacoes)!),
      sinais: Array.isArray(e.sinais) ? e.sinais.map(String).slice(0, 6) : [],
      fonte: "web_search",
      query,
    }));
}

/** Tenta o 1º termo do segmento; se a busca volta vazia, tenta o 2º ("depósito de material…"). */
export async function buscarEmpresas(q: ConsultaDescoberta, apiKey: string): Promise<Candidato[]> {
  const termos = q.segmento.termos.length ? q.segmento.termos : [q.segmento.nome];
  for (const termo of termos.slice(0, 2)) {
    const achados = await buscarEmpresasComTermo(q, termo, apiKey);
    if (achados.length) return achados;
  }
  return [];
}

async function buscarEmpresasComTermo(q: ConsultaDescoberta, termo: string, apiKey: string): Promise<Candidato[]> {
  // "Unamar (Cabo Frio)" → "Unamar, Cabo Frio": distrito com o município junto ajuda a busca.
  const lugar = q.cidade.replace(/\s*\(([^)]+)\)\s*$/, ", $1");
  const query = `${termo} em ${lugar} ${q.uf}`;
  const limite = q.limite ?? 12;
  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      // "low": menos texto de busca injetado no prompt — era o que inflava 7 mil tokens por chamada.
      tools: [{ type: "web_search", search_context_size: "low" }],
      input:
        `Pesquise na web: ${query}\n\n` +
        `Liste até ${limite} EMPRESAS REAIS desse tipo ("${q.segmento.nome}") sediadas em ${lugar}/${q.uf} ou muito próximas. ` +
        `SÓ empresas estabelecidas, com pelo menos UM destes sinais: Instagram com posts recentes, site próprio, ou 30+ avaliações no Google, ou mais de uma unidade. ` +
        `NÃO liste: MEI, lojinha de bairro sem presença digital, prestador autônomo, marketplace, lista genérica, prefeitura/órgão público, nem grandes redes nacionais (Leroy Merlin, Telhanorte, C&C, Obramax). Menos empresas e melhores é melhor que muitas fracas.\n` +
        `Para cada empresa, informe SOMENTE o que a busca mostrou (não invente): nome (o nome fantasia CURTO, como a loja se chama — sem cidade, sem "material de construção" colado), cidade (só o município, sem UF), site, instagram (só o @ ou a URL), telefone (fixo, com DDD), whatsapp (o CELULAR/WhatsApp da loja com DDD e 9 dígitos, se aparecer no site, Instagram, Google ou anúncio — procure especificamente por isso; é o dado mais importante), cnpj (se aparecer no site/rodapé ou em cadastros públicos), endereco, google_maps_url, google_nota (número de 0 a 5, ex.: 4.6), google_avaliacoes (número inteiro), e "sinais" (até 4 frases curtas com fatos observados: "2 lojas", "anuncia no Instagram", "18 anos de mercado").\n` +
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
  whatsapp?: string | null;
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
      // UMA busca por empresa: medido 12,9k → 8,7k tokens de entrada (−33%) sem perder o que o score usa.
      max_tool_calls: 1,
      tools: [{ type: "web_search", search_context_size: "low" }],
      input:
        `Pesquise na web sobre a empresa: ${ident}\n\n` +
        `Quero SÓ FATOS VERIFICÁVEIS que a busca mostrar (nunca deduza, nunca invente; use null quando não encontrar):\n` +
        `- google_nota e google_avaliacoes (Google Maps/Business), google_maps_url\n` +
        `- unidades: quantas lojas/filiais a empresa tem (número)\n` +
        `- anuncia: true se houver evidência de anúncios pagos (Biblioteca de Anúncios da Meta, "patrocinado", Google Ads); false só se você encontrou a empresa na Biblioteca de Anúncios sem anúncios ativos; senão null. anuncia_fonte: onde viu.\n` +
        `- proprietario: nome do dono/sócio/diretor citado em site, Instagram, LinkedIn, matéria ou cadastro público; proprietario_cargo; proprietario_fonte (URL ou nome da fonte)\n` +
        `- whatsapp: o CELULAR/WhatsApp da loja (DDD + 9 dígitos) se aparecer no site, Instagram, Google ou anúncio — procure especificamente; instagram (@), site, telefone fixo (com DDD), cnpj (se visível), endereco\n` +
        `- fatos: até 3 frases curtas com fatos observados e úteis para uma conversa comercial (ex.: "inaugurou 2ª loja em 2025", "faz lives de ofertas toda sexta")\n` +
        `- fontes: até 3 URLs consultadas\n` +
        `Responda APENAS com um objeto JSON com essas chaves.`,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json().catch(() => null) as Record<string, unknown> | null;
  const usage = (json?.usage ?? null) as { input_tokens?: number; output_tokens?: number } | null;
  const erroApi = (json?.error as { message?: string } | undefined)?.message ?? (!json ? "sem resposta" : null);
  registrarChamadaLlm({ modelo: MODELO, ms: Date.now() - t0, ok: !!json && res.ok && !json.error, origem: "prospeccao:pesquisa-empresa", tipo: "responses",
    usage: usage ? { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens } : null, erro: erroApi });
  // Erro da API (sem crédito, limite, 5xx) NÃO é "não achei nada": quem chama deixa o prospect
  // para a próxima rodada em vez de carimbar como pesquisado.
  if (erroApi || !json) throw new Error(`OpenAI: ${erroApi ?? "sem resposta"}`);
  const texto = textoDaResposta(json).replace(/```(?:json)?/gi, "").trim();
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(texto.slice(ini, fim + 1)) as AchadoEmpresa; } catch { return null; }
}
