// lib/traffic/hoje/vistos.ts — leitura e gravação do "visto" (traffic_alert_acks). Server-only.
//
// A regra mora em ./visto (pura, com testes). Aqui só o banco — e a tolerância: a tabela nasce por
// migração manual (supabase/migrations/20260924140000_traffic_alert_acks.sql). Até lá, ou se a
// leitura falhar, ninguém está "visto" e todo alerta continua saindo. Na dúvida, avisar.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { AlertaRef } from "./tipos";
import { chaveVisto, mapaDeVistos, prazoDoVisto, type MapaVistos, type VistoRow } from "./visto";

const TABELA = "traffic_alert_acks";

export interface LeituraVistos {
  /** false = tabela ausente ou leitura falhou. */
  disponivel: boolean;
  mapa: MapaVistos;
}

/** A tabela ainda não existe (migração não aplicada). */
export function tabelaAusente(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "PGRST205" || err.code === "42P01" || /does not exist|schema cache/i.test(err.message ?? "");
}

export async function carregarVistos(): Promise<LeituraVistos> {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .select("client_id, tipo, nivel, seen_by, seen_by_name, seen_at, until");
    if (error) {
      if (!tabelaAusente(error)) console.error("[vistos] leitura falhou:", error.message);
      return { disponivel: false, mapa: new Map() };
    }
    return { disponivel: true, mapa: mapaDeVistos((data ?? []) as VistoRow[]) };
  } catch (err) {
    console.error("[vistos] leitura falhou:", err instanceof Error ? err.message : err);
    return { disponivel: false, mapa: new Map() };
  }
}

export interface ResultadoVisto { ok: boolean; disponivel: boolean; erro?: string }

/** Marca (ou remarca) como visto agora. Um registro por (cliente, tipo): o novo substitui o antigo. */
export async function marcarVistos(
  alertas: AlertaRef[], quem: { email: string; nome: string | null }, horas?: number | null, agora: Date = new Date(),
): Promise<ResultadoVisto> {
  if (!alertas.length) return { ok: true, disponivel: true };
  const ate = prazoDoVisto(agora, horas);
  const linhas = alertas.map((a) => ({
    chave: chaveVisto(a.clientId, a.tipo),
    client_id: a.clientId,
    tipo: a.tipo,
    nivel: a.nivel,
    seen_by: quem.email,
    seen_by_name: quem.nome,
    seen_at: agora.toISOString(),
    until: ate,
  }));
  const { error } = await supabaseAdmin.from(TABELA).upsert(linhas, { onConflict: "chave" });
  if (error) {
    if (tabelaAusente(error)) return { ok: false, disponivel: false, erro: "O \"visto\" ainda não está ligado no banco." };
    return { ok: false, disponivel: true, erro: error.message };
  }
  return { ok: true, disponivel: true };
}

/** Desfaz o visto: o alerta volta a aparecer e a sair nos canais. */
export async function desmarcarVistos(alertas: Pick<AlertaRef, "clientId" | "tipo">[]): Promise<ResultadoVisto> {
  if (!alertas.length) return { ok: true, disponivel: true };
  const { error } = await supabaseAdmin.from(TABELA).delete().in("chave", alertas.map((a) => chaveVisto(a.clientId, a.tipo)));
  if (error) {
    if (tabelaAusente(error)) return { ok: false, disponivel: false, erro: "O \"visto\" ainda não está ligado no banco." };
    return { ok: false, disponivel: true, erro: error.message };
  }
  return { ok: true, disponivel: true };
}
