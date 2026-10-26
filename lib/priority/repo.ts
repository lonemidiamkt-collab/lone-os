// lib/priority/repo.ts — persistência das recomendações. Recalcular = ranquear + reconciliar.

import { supabaseAdmin } from "@/lib/supabase/server";
import { anotar, idCorrelacao } from "@/lib/obs/correlacao";
import { coletarTudo } from "./fontes";
import { ranquear, reconciliar } from "./motor";
import { emSilencio, SILENCIO_HORAS, type Decidida } from "./silencio";
import { proximaConferencia, type ResultadoConferencia } from "./conferencia";
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
  coletados: number; validos: number; inseridas: number; atualizadas: number; resolvidas: number; conferidas: number;
  porFonte: Record<string, number>; erros: string[];
}

export async function recalcular(): Promise<ResultadoRecalculo> {
  const { itens, ctx, porFonte, erros } = await coletarTudo();
  const novas = ranquear(itens, ctx);
  const { data: abertas, error } = await supabaseAdmin.from("recommendations").select("id, fingerprint").in("estado", ABERTAS);
  if (error) throw new Error(`recommendations: ${error.message}`);
  const r = reconciliar((abertas ?? []) as { id: string; fingerprint: string }[], novas);
  const { atualizar, resolver } = r;
  let { inserir } = r;

  // Decidido há pouco não renasce como "nova" na rodada seguinte (lib/priority/silencio.ts).
  if (inserir.length) {
    const desde = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const { data: decididas, error: eDec } = await supabaseAdmin.from("recommendations")
      .select("fingerprint, estado, decidido_em").in("fingerprint", inserir.map((i) => i.fingerprint))
      .in("estado", Object.keys(SILENCIO_HORAS)).gte("decidido_em", desde);
    if (eDec) erros.push(`silêncio: ${eDec.message}`); // sem ler, segue como antes (avisar a mais é melhor que calar)
    else {
      const calados = emSilencio((decididas ?? []) as Decidida[]);
      inserir = inserir.filter((i) => !calados.has(i.fingerprint));
    }
  }

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
  const conferidas = await conferirFeitas(new Set(novas.map((n) => n.fingerprint)), erros);
  anotar(`priority: ${inseridas} novas, ${atualizadas} atualizadas, ${resolvidas} resolvidas, ${conferidas} conferidas`);
  return { coletados: itens.length, validos: novas.length, inseridas, atualizadas, resolvidas, conferidas, porFonte, erros };
}

export interface FiltroFeed { papel: string | null; nome: string | null; admin: boolean; escopo: "meu" | "todos"; limite?: number }

/** O feed de uma pessoa: o que é dela pelo nome, ou do papel dela sem dono nomeado. Admin/gestão com escopo=todos vê tudo. */
export type LinhaRecomendacao = Record<string, unknown> & { id: string; fonte: string; cliente: string; titulo: string; fato: string[]; recomendacao: string; score: number; owner: string | null; owner_role: string; exposicao_rs: number | null };

export async function feed(f: FiltroFeed): Promise<LinhaRecomendacao[] & { total: number }> {
  // Limite por pessoa: o plano é "no máximo N por pessoa"; o resto existe e aparece em "mostrar
  // mais", mas a primeira tela é o que cabe na atenção de alguém.
  let q = supabaseAdmin.from("recommendations").select("*", { count: "exact" }).in("estado", ABERTAS)
    .or(`adiada_ate.is.null,adiada_ate.lte.${new Date().toISOString()}`) // "Adiar até" (Mesa do Gestor)
    .order("score", { ascending: false }).limit(f.limite ?? 12);
  if (!(f.escopo === "todos" && (f.admin || f.papel === "manager"))) {
    const partes: string[] = [];
    if (f.nome) partes.push(`owner.ilike.${f.nome.replace(/[,.()]/g, " ").trim()}`);
    if (f.papel) partes.push(`and(owner.is.null,owner_role.eq.${f.papel})`);
    if (!partes.length) return Object.assign([] as LinhaRecomendacao[], { total: 0 });
    q = q.or(partes.join(","));
  }
  const { data, error, count } = await q;
  if (error) throw new Error(`recommendations: ${error.message}`);
  return Object.assign((data ?? []) as LinhaRecomendacao[], { total: count ?? (data?.length ?? 0) });
}

export type Decisao = "vista" | "aceita" | "ignorada" | "incorreta" | "executada";

/** Estados em que a recomendação está no feed. */
export const ESTADOS_ABERTOS = ["nova", "vista", "aceita"] as const;
export type EstadoAberto = (typeof ESTADOS_ABERTOS)[number];

/**
 * Desfaz Feito/Ignorar/Incorreta (25/10/2026, auditoria 11.8): a recomendação volta para o estado em que
 * estava, sem a marca de quem decidiu (senão contaria na taxa de decisão). Se o motor já recriou uma igual
 * aberta (índice único por fingerprint), diz isso em vez de falhar calado.
 */
export async function reabrir(id: string, estado: EstadoAberto = "vista") {
  const { data, error } = await supabaseAdmin.from("recommendations")
    .update({ estado, decidido_por: null, decidido_em: null, motivo_decisao: null, resultado: null, conferencia: null, medido_em: null, updated_at: new Date().toISOString() })
    .eq("id", id).in("estado", ["ignorada", "incorreta", "executada"]).select("id, estado, titulo").maybeSingle();
  if (error) {
    if (error.code === "23505") throw new Error("o feed já recriou essa mesma recomendação — recarregue a lista");
    throw new Error(error.message);
  }
  return data;
}

export async function decidir(id: string, decisao: Decisao, quem: string, motivo?: string | null) {
  const patch: Record<string, unknown> = { estado: decisao, updated_at: new Date().toISOString() };
  if (decisao !== "vista") { patch.decidido_por = quem; patch.decidido_em = new Date().toISOString(); patch.motivo_decisao = motivo ?? null; }
  // "Já fiz" abre a conferência automática (1 e 3 dias depois, em conferirFeitas).
  if (decisao === "executada") { patch.resultado = "aguardando"; patch.conferencia = null; patch.medido_em = null; }
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

/**
 * "Adiar até" (Mesa do Gestor, 26/10/2026): some da fila até `ate` e volta sozinha. Não conta como decisão — o
 * problema continua lá; quem adiou só disse quando vai olhar. Máximo de 14 dias para ninguém enterrar um item.
 */
export async function adiar(id: string, ate: Date, quem: string) {
  const limite = Date.now() + 14 * 864e5;
  const quando = new Date(Math.min(ate.getTime(), limite)).toISOString();
  const { data, error } = await supabaseAdmin.from("recommendations")
    .update({ estado: "vista", adiada_ate: quando, motivo_decisao: `adiada por ${quem}`, updated_at: new Date().toISOString() })
    .eq("id", id).in("estado", ABERTAS).select("id, estado, titulo, adiada_ate").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Fonte que falhou nesta rodada não pode "resolver" o que ela não leu: o item sumiu por erro, não por conserto. */
export function fontesSemLeitura(erros: string[]): Set<string> {
  const out = new Set<string>();
  for (const e of erros) {
    const nome = e.split(":")[0].trim();
    // "alarmes" (verba e conversa) também gera itens de fonte "trafego".
    out.add(nome === "alarmes" ? "trafego" : nome);
  }
  return out;
}

/**
 * A conferência do "Já fiz": para cada recomendação feita nos últimos 10 dias que ainda não terminou, olha se a
 * rodada de agora reporta o mesmo fingerprint (lib/priority/conferencia.ts). Nunca lança.
 */
async function conferirFeitas(reportadosAgora: Set<string>, erros: string[]): Promise<number> {
  try {
    const semLeitura = fontesSemLeitura(erros);
    const desde = new Date(Date.now() - 10 * 864e5).toISOString();
    const { data, error } = await supabaseAdmin.from("recommendations")
      .select("id, fonte, fingerprint, decidido_em, resultado, conferencia")
      .eq("estado", "executada").gte("decidido_em", desde)
      .or("resultado.is.null,resultado.eq.aguardando,resultado.eq.confirmado_1d");
    if (error) { erros.push(`conferência: ${error.message}`); return 0; }
    let n = 0;
    const agora = new Date();
    for (const r of data ?? []) {
      if (semLeitura.has(r.fonte as string)) continue;
      const passo = proximaConferencia(
        { decidido_em: r.decidido_em as string, resultado: (r.resultado as ResultadoConferencia | null) ?? "aguardando" },
        reportadosAgora.has(r.fingerprint as string), agora,
      );
      if (!passo) continue;
      const conferencia = { ...((r.conferencia as Record<string, unknown> | null) ?? {}), [passo.etapa]: { em: agora.toISOString(), reportada: reportadosAgora.has(r.fingerprint as string) } };
      const { error: e } = await supabaseAdmin.from("recommendations")
        .update({ resultado: passo.resultado, medido_em: agora.toISOString(), conferencia }).eq("id", r.id as string);
      if (e) erros.push(`conferir ${r.id}: ${e.message}`); else n++;
    }
    return n;
  } catch (e) {
    erros.push(`conferência: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}
