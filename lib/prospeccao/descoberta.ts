// lib/prospeccao/descoberta.ts — encontrar empresas (§7). Roda os providers ativos em combinações
// segmento × cidade, em rodízio (a combinação que rodou há mais tempo vai primeiro), e grava cada
// achado como `descoberto` — o "candidate" da V2: nada aqui é prospect ainda.
//
// Antes de gravar: dedup (CNPJ, Instagram, telefone, nome+cidade), exclui quem já é cliente da
// Lone e quem pediu para não ser contatado.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { Candidato, ProspectRow } from "./tipos";
import type { ProspectConfig, SegmentoIcp } from "./config";
import type { DiscoveryProvider } from "./providers/tipos";
import { webSearchProvider } from "./providers/web-search";
import { drivaProvider } from "./providers/driva";
import { chavesDedup, cnpjLimpo, instagramHandle, siteNormalizado, telefoneDigitos } from "./normalizar";
import { acharDuplicado, ehClienteAtual } from "./db";
import { registrarEvento, etapaPipeline, proximaAcaoPadrao } from "./maquina";

export function providersAtivos(cfg: ProspectConfig): DiscoveryProvider[] {
  const lista: DiscoveryProvider[] = [];
  if (cfg.providers.web_search && webSearchProvider.disponivel()) lista.push(webSearchProvider);
  if (cfg.providers.driva && drivaProvider.disponivel()) lista.push(drivaProvider);
  return lista;
}

export interface Combo { segmento: SegmentoIcp; cidade: string }

/** Combinações em rodízio: as que nunca rodaram primeiro, depois as mais antigas. */
export async function escolherCombos(cfg: ProspectConfig, quantas: number): Promise<Combo[]> {
  const { data } = await supabaseAdmin.from("prospect_discovery_runs").select("segmento, cidade, created_at")
    .order("created_at", { ascending: false }).limit(2000);
  const ultima = new Map<string, string>();
  for (const r of (data ?? []) as { segmento: string; cidade: string; created_at: string }[]) {
    const k = `${r.segmento}|${r.cidade}`;
    if (!ultima.has(k)) ultima.set(k, r.created_at);
  }
  const todos: Combo[] = [];
  // Cidades mais perto da base vêm antes na lista de config → em rodízio novo elas saem primeiro.
  for (const cidade of cfg.cidades) for (const segmento of cfg.segmentos) todos.push({ segmento, cidade });
  todos.sort((a, b) => {
    const ua = ultima.get(`${a.segmento.nome}|${a.cidade}`) ?? "", ub = ultima.get(`${b.segmento.nome}|${b.cidade}`) ?? "";
    if (ua === ub) return 0;
    if (!ua) return -1;
    if (!ub) return 1;
    return ua < ub ? -1 : 1;
  });
  return todos.slice(0, quantas);
}

export interface ResumoInsercao { novos: number; duplicados: number; excluidos: number; ids: string[]; motivos: string[] }

/** Grava candidatos como prospects `descoberto` (com dedup e exclusões). Usado pela descoberta e pela importação. */
export async function inserirCandidatos(cands: Candidato[], o: { campanhaId?: string | null; ufPadrao: string; dry?: boolean }): Promise<ResumoInsercao> {
  const r: ResumoInsercao = { novos: 0, duplicados: 0, excluidos: 0, ids: [], motivos: [] };
  const vistos: ReturnType<typeof chavesDedup>[] = [];
  for (const c of cands) {
    const chaves = chavesDedup({ cnpj: c.cnpj, instagram: c.instagram, telefone: c.telefone, nome: c.nome, cidade: c.cidade ?? o.ufPadrao });
    if (vistos.some((v) => (v.cnpj && v.cnpj === chaves.cnpj) || (v.instagram && v.instagram === chaves.instagram) || (v.telefone && v.telefone === chaves.telefone) || (v.nomeCidade && v.nomeCidade === chaves.nomeCidade))) { r.duplicados++; continue; }
    vistos.push(chaves);
    const dup = await acharDuplicado(chaves);
    if (dup) { r.duplicados++; continue; }
    const cli = await ehClienteAtual({ nome: c.nome, instagram: c.instagram, telefone: c.telefone, cidade: c.cidade });
    if (cli.sim) { r.excluidos++; r.motivos.push(`${c.nome}: já é cliente (${cli.cliente})`); continue; }
    if (o.dry) { r.novos++; continue; }

    const fontes: Record<string, string> = {};
    for (const k of ["nome", "cidade", "cnpj", "site", "instagram", "telefone", "endereco", "google_nota", "google_avaliacoes"] as const) {
      if (c[k] !== null && c[k] !== undefined && c[k] !== "") fontes[k] = c.fonte;
    }
    const acao = proximaAcaoPadrao("descoberto");
    const tel = telefoneDigitos(c.telefone);
    const { data, error } = await supabaseAdmin.from("prospects").insert({
      campanha_id: o.campanhaId ?? null,
      nome: c.nome.trim().slice(0, 200), cidade: c.cidade?.trim() || null, uf: (c.uf ?? o.ufPadrao).toUpperCase().slice(0, 2),
      segmento: c.segmento ?? null, cnpj: cnpjLimpo(c.cnpj), site: siteNormalizado(c.site), instagram: instagramHandle(c.instagram),
      telefone: tel, whatsapp_jid: tel ? `${tel}@s.whatsapp.net` : null, endereco: c.endereco ?? null,
      google_maps_url: c.google_maps_url ?? null, google_nota: c.google_nota ?? null, google_avaliacoes: c.google_avaliacoes ?? null,
      fontes, presenca: c.sinais?.length ? { sinais_descoberta: c.sinais } : null,
      estagio: "descoberto", etapa_pipeline: etapaPipeline("descoberto"),
      next_action_type: acao?.type, next_action_at: acao?.at, next_action_owner: acao?.owner, next_action_reason: acao?.reason,
      origem: c.fonte, origem_query: c.query ?? null,
    }).select("id").single();
    if (error) {
      if (error.code === "23505") { r.duplicados++; continue; }
      r.motivos.push(`${c.nome}: ${error.message}`); continue;
    }
    r.novos++;
    r.ids.push((data as { id: string }).id);
    await registrarEvento((data as { id: string }).id, { tipo: "descoberto", para: "descoberto", motivo: `via ${c.fonte}${c.query ? ` ("${c.query}")` : ""}`, responsavel: "SDR_AI" });
  }
  return r;
}

export interface ResumoDescoberta { combos: number; achados: number; novos: number; duplicados: number; excluidos: number; erros: string[]; detalhes: { query: string; achados: number; novos: number }[] }

export async function rodarDescoberta(cfg: ProspectConfig, o: { campanhaId?: string | null; quantas?: number; dry?: boolean; combos?: Combo[] }): Promise<ResumoDescoberta> {
  const providers = providersAtivos(cfg);
  const out: ResumoDescoberta = { combos: 0, achados: 0, novos: 0, duplicados: 0, excluidos: 0, erros: [], detalhes: [] };
  if (!providers.length) { out.erros.push("nenhum provider disponível (OPENAI_API_KEY?)"); return out; }
  const combos = o.combos ?? await escolherCombos(cfg, o.quantas ?? cfg.queries_por_dia);
  for (const combo of combos) {
    out.combos++;
    for (const prov of providers) {
      const query = `${combo.segmento.termos[0] ?? combo.segmento.nome} em ${combo.cidade} ${cfg.base.uf}`;
      let cands: Candidato[] = [];
      let erro: string | null = null;
      try {
        cands = await prov.descobrir({ segmento: combo.segmento, cidade: combo.cidade, uf: cfg.base.uf });
      } catch (err) {
        erro = err instanceof Error ? err.message : String(err);
        out.erros.push(`${prov.nome} ${query}: ${erro}`);
      }
      const ins = cands.length ? await inserirCandidatos(cands, { campanhaId: o.campanhaId, ufPadrao: cfg.base.uf, dry: o.dry }) : { novos: 0, duplicados: 0, excluidos: 0, ids: [], motivos: [] };
      out.achados += cands.length; out.novos += ins.novos; out.duplicados += ins.duplicados; out.excluidos += ins.excluidos;
      out.detalhes.push({ query, achados: cands.length, novos: ins.novos });
      if (!o.dry) {
        await supabaseAdmin.from("prospect_discovery_runs").insert({
          campanha_id: o.campanhaId ?? null, provider: prov.nome, query, segmento: combo.segmento.nome, cidade: combo.cidade,
          achados: cands.length, novos: ins.novos, duplicados: ins.duplicados, excluidos: ins.excluidos, erro,
        });
      }
    }
  }
  return out;
}

export type { ProspectRow };
