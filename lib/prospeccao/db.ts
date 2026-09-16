// lib/prospeccao/db.ts — leituras e escritas simples em prospects/mensagens/eventos.
// Mudança de estágio NÃO passa por aqui (é lib/prospeccao/maquina.ts).

import { supabaseAdmin } from "@/lib/supabase/server";
import type { Estagio, IntentLida, ProspectEventRow, ProspectMessageRow, ProspectRow } from "./tipos";
import { ymdSP } from "./tempo";
import { chavesDedup, mesmaEmpresa, type ChavesDedup, telefoneDigitos, instagramHandle } from "./normalizar";

export async function buscarProspect(id: string): Promise<ProspectRow | null> {
  const { data } = await supabaseAdmin.from("prospects").select("*").eq("id", id).maybeSingle();
  return (data as ProspectRow | null) ?? null;
}

/** Acha o prospect de uma DM: pelo JID do telefone ou pelo LID (id interno do WhatsApp). */
export async function buscarProspectPorJid(jids: string[]): Promise<ProspectRow | null> {
  const lista = jids.filter(Boolean);
  if (!lista.length) return null;
  const telefones = lista.map((j) => j.split("@")[0].split(":")[0]).filter((d) => /^\d{10,15}$/.test(d));
  // Valor com "@" e "." vai entre aspas (sintaxe do PostgREST para caracteres reservados).
  const ors = [
    ...lista.map((j) => `whatsapp_jid.eq."${j}"`),
    ...lista.map((j) => `whatsapp_lid.eq."${j}"`),
    ...telefones.map((t) => `telefone.eq.${t}`),
    ...telefones.map((t) => `decisor_telefone.eq.${t}`),
  ];
  const { data } = await supabaseAdmin.from("prospects").select("*").or(ors.join(",")).order("updated_at", { ascending: false }).limit(1);
  return ((data ?? [])[0] as ProspectRow | undefined) ?? null;
}

export async function atualizarProspect(id: string, patch: Record<string, unknown>): Promise<ProspectRow> {
  const { data, error } = await supabaseAdmin.from("prospects")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw new Error(`prospects.update: ${error.message}`);
  return data as ProspectRow;
}

export async function listarPorEstagio(estagios: Estagio[], limite = 200): Promise<ProspectRow[]> {
  const { data, error } = await supabaseAdmin.from("prospects").select("*").in("estagio", estagios)
    .order("score", { ascending: false, nullsFirst: false }).limit(limite);
  if (error) { console.error("[prospeccao/db] listarPorEstagio:", error.message); return []; }
  return (data ?? []) as ProspectRow[];
}

export async function mensagensDoProspect(id: string, limite = 200): Promise<ProspectMessageRow[]> {
  const { data } = await supabaseAdmin.from("prospect_messages").select("*").eq("prospect_id", id)
    .order("created_at", { ascending: true }).limit(limite);
  return (data ?? []) as ProspectMessageRow[];
}

export async function eventosDoProspect(id: string, limite = 200): Promise<ProspectEventRow[]> {
  const { data } = await supabaseAdmin.from("prospect_events").select("*").eq("prospect_id", id)
    .order("created_at", { ascending: true }).limit(limite);
  return (data ?? []) as ProspectEventRow[];
}

export async function gravarMensagem(m: {
  prospect_id: string; direcao: "in" | "out"; autor: "prospect" | "agente" | "humano"; texto: string;
  message_id?: string | null; intent?: IntentLida | null; estagio_antes?: string | null; estagio_depois?: string | null;
  enviado?: boolean; erro?: string | null; correlation_id?: string | null; eh_primeira_abordagem?: boolean;
}): Promise<ProspectMessageRow | null> {
  const { data, error } = await supabaseAdmin.from("prospect_messages").insert({
    prospect_id: m.prospect_id, direcao: m.direcao, autor: m.autor, texto: m.texto.slice(0, 8000),
    message_id: m.message_id ?? null, intent: m.intent ?? null,
    estagio_antes: m.estagio_antes ?? null, estagio_depois: m.estagio_depois ?? null,
    enviado: m.enviado ?? true, erro: m.erro ?? null, correlation_id: m.correlation_id ?? null,
    dia: ymdSP(), eh_primeira_abordagem: m.eh_primeira_abordagem ?? false,
  }).select("*").single();
  if (error) {
    // 23505 = message_id repetido (webhook reenviado). Não é erro de verdade.
    if (error.code !== "23505") console.error("[prospeccao/db] gravarMensagem:", error.message);
    return null;
  }
  await supabaseAdmin.from("prospects").update({
    ultima_interacao_em: new Date().toISOString(), ultima_msg_de: m.autor, updated_at: new Date().toISOString(),
  }).eq("id", m.prospect_id);
  return data as ProspectMessageRow;
}

/** Já existe alguém com essas chaves? Devolve a linha ou null. */
export async function acharDuplicado(chaves: ChavesDedup): Promise<ProspectRow | null> {
  const ors: string[] = [];
  if (chaves.cnpj) ors.push(`cnpj.eq.${chaves.cnpj}`);
  if (chaves.instagram) ors.push(`instagram.eq."${chaves.instagram}"`);
  if (chaves.telefone) ors.push(`telefone.eq.${chaves.telefone}`);
  if (!ors.length && !chaves.nomeCidade) return null;
  if (ors.length) {
    const { data } = await supabaseAdmin.from("prospects").select("*").or(ors.join(",")).limit(5);
    for (const r of (data ?? []) as ProspectRow[]) {
      if (mesmaEmpresa(chaves, chavesDedup(r))) return r;
    }
  }
  if (chaves.nomeCidade) {
    // Nome+cidade não indexa bem; busca por prefixo do nome canônico e compara em memória.
    const [nome] = chaves.nomeCidade.split("|");
    const primeira = nome.split(" ")[0];
    if (primeira && primeira.length >= 3) {
      const { data } = await supabaseAdmin.from("prospects").select("*").ilike("nome", `%${primeira}%`).limit(50);
      for (const r of (data ?? []) as ProspectRow[]) {
        if (mesmaEmpresa(chaves, chavesDedup(r))) return r;
      }
    }
  }
  return null;
}

/**
 * A empresa já é cliente da Lone? Compara com `clients` por nome canônico, Instagram e telefone.
 * Prospectar o próprio cliente seria o erro mais constrangedor possível — a checagem é generosa.
 */
export async function ehClienteAtual(c: { nome?: string | null; instagram?: string | null; telefone?: string | null; cidade?: string | null }): Promise<{ sim: boolean; cliente?: string }> {
  const { data } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, instagram_user, company_phone, contact_phone")
    .limit(500);
  const ig = instagramHandle(c.instagram);
  const tel = telefoneDigitos(c.telefone);
  const chaves = chavesDedup({ nome: c.nome, cidade: c.cidade ?? "x" });
  const nomeAlvo = chaves.nomeCidade?.split("|")[0] ?? "";
  for (const cl of (data ?? []) as Array<Record<string, unknown>>) {
    const nomes = [cl.name, cl.nome_fantasia].filter(Boolean) as string[];
    if (ig && instagramHandle(cl.instagram_user as string) === ig) return { sim: true, cliente: nomes[0] };
    if (tel && [cl.company_phone, cl.contact_phone].some((t) => telefoneDigitos(t as string) === tel)) return { sim: true, cliente: nomes[0] };
    if (nomeAlvo && nomes.some((n) => chavesDedup({ nome: n, cidade: "x" }).nomeCidade?.split("|")[0] === nomeAlvo)) return { sim: true, cliente: nomes[0] };
  }
  return { sim: false };
}

export async function contarPorEstagio(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin.from("prospects").select("estagio");
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { estagio: string }[]) out[r.estagio] = (out[r.estagio] ?? 0) + 1;
  return out;
}
