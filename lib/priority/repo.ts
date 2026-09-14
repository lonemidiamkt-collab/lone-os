// lib/priority/repo.ts — persistência das recomendações. Recalcular = ranquear + reconciliar.

import { supabaseAdmin } from "@/lib/supabase/server";
import { anotar, idCorrelacao } from "@/lib/obs/correlacao";
import { coletarTudo } from "./fontes";
import { ranquear, reconciliar } from "./motor";
import type { Recomendacao, EstadoRecomendacao } from "./tipos";

const ABERTAS: EstadoRecomendacao[] = ["nova", "vista", "aceita"];

function linhaDe(r: Recomendacao) {
  return {
    fingerprint: r.fingerprint, fonte: r.fonte, client_id: r.clientId, cliente: r.cliente, entity_ref: r.entityRef, motivo: r.motivo,
    titulo: r.titulo, fato: r.fato, inferencia: r.inferencia ?? null, hipotese: r.hipotese ?? null, recomendacao: r.recomendacao,
    acao_proposta: r.acaoProposta ?? null, severidade: Math.round(r.severidade), urgencia: Math.round(r.urgencia),
    confianca: Number(r.confianca.toFixed(2)), exposicao_rs: r.exposicaoRs ?? null, reversivel: r.reversivel,
    score: r.score, explicacao_score: r.explicacaoScore, nivel_policy: r.nivelPolicy, owner_role: r.ownerRole, owner: r.owner,
    updated_at: new Date().toISOString(),
  };
}

export interface ResultadoRecalculo {
  coletados: number; validos: number; inseridas: number; atualizadas: number; resolvidas: number;
  porFonte: Record<string, number>; erros: string[];
}

export async function recalcular(): Promise<ResultadoRecalculo> {
  const { itens, ctx, porFonte, erros } = await coletarTudo();
  const novas = ranquear(itens, ctx);
  const { data: abertas, error } = await supabaseAdmin.from("recommendations").select("id, fingerprint").in("estado", ABERTAS);
  if (error) throw new Error(`recommendations: ${error.message}`);
  const { inserir, atualizar, resolver } = reconciliar((abertas ?? []) as { id: string; fingerprint: string }[], novas);

  let inseridas = 0, atualizadas = 0, resolvidas = 0;
  if (inserir.length) {
    const { error: e } = await supabaseAdmin.from("recommendations").insert(inserir.map((r) => ({ ...linhaDe(r), estado: "nova", correlation_id: idCorrelacao() })));
    if (e) erros.push(`inserir: ${e.message}`); else inseridas = inserir.length;
  }
  for (const { id, rec } of atualizar) {
    // Estado fica (se alguém já viu/aceitou, continua); score e fato seguem a rodada.
    const { error: e } = await supabaseAdmin.from("recommendations").update(linhaDe(rec)).eq("id", id);
    if (e) erros.push(`atualizar ${id}: ${e.message}`); else atualizadas++;
  }
  if (resolver.length) {
    const { error: e } = await supabaseAdmin.from("recommendations")
      .update({ estado: "resolvida", resolvida_em: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", resolver);
    if (e) erros.push(`resolver: ${e.message}`); else resolvidas = resolver.length;
  }
  anotar(`priority: ${inseridas} novas, ${atualizadas} atualizadas, ${resolvidas} resolvidas`);
  return { coletados: itens.length, validos: novas.length, inseridas, atualizadas, resolvidas, porFonte, erros };
}

export interface FiltroFeed { papel: string | null; nome: string | null; admin: boolean; escopo: "meu" | "todos"; limite?: number }

/** O feed de uma pessoa: o que é dela pelo nome, ou do papel dela sem dono nomeado. Admin/gestão com escopo=todos vê tudo. */
export async function feed(f: FiltroFeed) {
  let q = supabaseAdmin.from("recommendations").select("*").in("estado", ABERTAS).order("score", { ascending: false }).limit(f.limite ?? 60);
  if (!(f.escopo === "todos" && (f.admin || f.papel === "manager"))) {
    const partes: string[] = [];
    if (f.nome) partes.push(`owner.ilike.${f.nome.replace(/[,.()]/g, " ").trim()}`);
    if (f.papel) partes.push(`and(owner.is.null,owner_role.eq.${f.papel})`);
    if (!partes.length) return [];
    q = q.or(partes.join(","));
  }
  const { data, error } = await q;
  if (error) throw new Error(`recommendations: ${error.message}`);
  return data ?? [];
}

export type Decisao = "vista" | "aceita" | "ignorada" | "incorreta" | "executada";

export async function decidir(id: string, decisao: Decisao, quem: string, motivo?: string | null) {
  const patch: Record<string, unknown> = { estado: decisao, updated_at: new Date().toISOString() };
  if (decisao !== "vista") { patch.decidido_por = quem; patch.decidido_em = new Date().toISOString(); patch.motivo_decisao = motivo ?? null; }
  const { data, error } = await supabaseAdmin.from("recommendations").update(patch).eq("id", id).select("id, estado, titulo").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Taxa de decisão (aceita+ignorada+incorreta+executada ÷ criadas) — o número que a Fase 1 promete subir de 37% para >60%. */
export async function taxaDeDecisao(dias = 14) {
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const { data, error } = await supabaseAdmin.from("recommendations").select("estado").gte("created_at", desde);
  if (error) throw new Error(error.message);
  const total = data?.length ?? 0;
  const decididas = (data ?? []).filter((r) => ["aceita", "ignorada", "incorreta", "executada"].includes(r.estado as string)).length;
  const porEstado: Record<string, number> = {};
  for (const r of data ?? []) porEstado[r.estado as string] = (porEstado[r.estado as string] ?? 0) + 1;
  return { dias, total, decididas, taxa: total ? Math.round((decididas / total) * 100) : null, porEstado };
}
