// lib/pulse/fetch.ts — coleta os sinais de TODOS os clientes e devolve o pulso de cada um.
// Queries AGREGADAS (não uma por cliente): o compute-health faz 7 queries × 46 clientes = 322
// round-trips; aqui são ~7 queries no total.

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { calcularPulso, type SinaisPulso, type Pulso } from "@/lib/pulse/compute";

export interface PulsoCliente extends Pulso {
  clientId: string;
  nome: string;
}

const diasDesde = (iso?: string | null): number | null => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d >= 0 ? d : 0;
};
const diasDesdeData = (ymdStr?: string | null): number | null => {
  if (!ymdStr) return null;
  const d = Math.floor((Date.now() - new Date(`${ymdStr}T12:00:00-03:00`).getTime()) / 86400000);
  return d >= 0 ? d : 0;
};
/** Maior valor por chave (o "mais recente"). */
function maxPor<T>(linhas: T[] | null, chave: (t: T) => string | null, valor: (t: T) => string | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of linhas ?? []) {
    const k = chave(l), v = valor(l);
    if (!k || !v) continue;
    const atual = m.get(k);
    if (!atual || v > atual) m.set(k, v);
  }
  return m;
}

export async function pulsoDeTodos(): Promise<PulsoCliente[]> {
  const hoje = ymd(spNow());
  const h30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const h14 = new Date(Date.now() - 14 * 86400000).toISOString();

  const [
    { data: clients }, { data: publicados }, { data: cards }, { data: demandas }, { data: spend },
  ] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, assigned_social, meta_ad_account_id, whatsapp_group_jid, last_client_msg_at, status")
      .is("draft_status", null).neq("active", false),
    // Último post por cliente (fonte: histórico de transições — inclui arquivados).
    supabaseAdmin.from("content_card_transitions")
      .select("transitioned_at, content_cards!inner(client_id)").eq("to_status", "published"),
    // Cards vivos: atraso, entrega do designer parada, aprovação do cliente.
    supabaseAdmin.from("content_cards")
      .select("client_id, status, due_date, designer_delivered_at, client_approved_at")
      .is("archived_at", null),
    supabaseAdmin.from("cs_demandas").select("client_id, tipo, created_at").gte("created_at", h30),
    supabaseAdmin.from("metric_snapshots").select("client_id, metric_date, spend").gt("spend", 0)
      .gte("metric_date", ymd(new Date(Date.now() - 30 * 86400000))),
  ]);

  const ultimoPost = maxPor(
    (publicados ?? []) as unknown as { transitioned_at: string; content_cards: { client_id: string } | null }[],
    (r) => r.content_cards?.client_id ?? null, (r) => r.transitioned_at,
  );
  const ultimoSpend = maxPor(spend ?? [], (r) => r.client_id as string, (r) => r.metric_date as string);
  const ultimaDemanda = maxPor(demandas ?? [], (r) => r.client_id as string, (r) => r.created_at as string);
  const ultimaEntrega = maxPor(cards ?? [], (r) => r.client_id as string, (r) => (r.designer_delivered_at as string) ?? null);
  const ultimaAprovacao = maxPor(cards ?? [], (r) => r.client_id as string, (r) => (r.client_approved_at as string) ?? null);

  // Atrasos e artes paradas por cliente.
  const vencidos = new Map<string, number>();
  const arteParadaDesde = new Map<string, string>(); // entrega mais ANTIGA ainda não publicada
  for (const c of cards ?? []) {
    const cid = c.client_id as string;
    if (!cid) continue;
    const st = c.status as string;
    if (st !== "published" && c.due_date && (c.due_date as string) < hoje) {
      vencidos.set(cid, (vencidos.get(cid) ?? 0) + 1);
    }
    if (st !== "published" && c.designer_delivered_at) {
      const at = c.designer_delivered_at as string;
      const atual = arteParadaDesde.get(cid);
      if (!atual || at < atual) arteParadaDesde.set(cid, at);
    }
  }

  const elogios = new Map<string, number>(), reclamacoes = new Map<string, number>();
  for (const d of demandas ?? []) {
    const cid = d.client_id as string;
    if (!cid) continue;
    if (d.tipo === "elogio") elogios.set(cid, (elogios.get(cid) ?? 0) + 1);
    if (d.tipo === "reclamacao" && (d.created_at as string) >= h14) {
      reclamacoes.set(cid, (reclamacoes.get(cid) ?? 0) + 1);
    }
  }

  return (clients ?? []).map((c) => {
    const id = c.id as string;
    const sinais: SinaisPulso = {
      diasSemPostNosso: diasDesde(ultimoPost.get(id)),
      diasDesdeUltimaEntregaDesigner: diasDesde(ultimaEntrega.get(id)),
      cardsVencidos: vencidos.get(id) ?? 0,
      artesParadasDias: diasDesde(arteParadaDesde.get(id)),
      diasSemSpend: c.meta_ad_account_id ? (diasDesdeData(ultimoSpend.get(id)) ?? 99) : null,
      temTrafego: !!c.meta_ad_account_id,
      temSocial: !!(c.assigned_social as string)?.trim(),
      // Sem grupo mapeado = não dá pra saber se o cliente sumiu (invariante do "não sei").
      diasSemFalar: c.whatsapp_group_jid ? diasDesde(c.last_client_msg_at as string) : null,
      diasDesdeUltimaDemanda: diasDesde(ultimaDemanda.get(id)),
      diasDesdeAprovacaoCliente: diasDesde(ultimaAprovacao.get(id)),
      elogios30d: elogios.get(id) ?? 0,
      reclamacoes14d: reclamacoes.get(id) ?? 0,
    };
    return {
      clientId: id,
      nome: (c.nome_fantasia as string) || (c.name as string) || "—",
      ...calcularPulso(sinais),
    };
  });
}
