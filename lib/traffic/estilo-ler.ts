// lib/traffic/estilo-ler.ts — lê o estilo visual de UM cliente a partir das artes entregues
// (usado pelo cron creative-estilo e pelo botão "Reler das artes" na ficha).

import { supabaseAdmin } from "@/lib/supabase/server";
import { analisarEstiloVisual } from "@/lib/traffic/estilo-visual";
import { escolherArtes, decidirReleitura, type ArteCandidata, type Motivo } from "@/lib/traffic/estilo-automatico";

export interface ResultadoLeitura { clientId: string; cliente: string; lido: boolean; motivo: Motivo | "forcado" | "erro"; artes: number; erro?: string }

export async function candidatasDoCliente(clientId: string): Promise<{ cands: ArteCandidata[]; novasDesde: (iso: string | null) => number }> {
  const { data: cards } = await supabaseAdmin.from("content_cards").select("id, status").eq("client_id", clientId).in("status", ["published", "scheduled", "client_approval", "approval"]).limit(400);
  const ids = (cards ?? []).map((c) => c.id as string);
  if (!ids.length) return { cands: [], novasDesde: () => 0 };
  const status = new Map((cards ?? []).map((c) => [c.id as string, c.status as string]));
  const { data: an } = await supabaseAdmin.from("card_attachments").select("card_id, url, tipo, position, created_at").in("card_id", ids).order("created_at", { ascending: false }).limit(300);
  const cands: ArteCandidata[] = (an ?? []).map((a) => ({ url: a.url as string, tipo: (a.tipo as string) ?? null, status: status.get(a.card_id as string) ?? "", criadoEm: a.created_at as string, posicao: (a.position as number) ?? null }));
  return { cands, novasDesde: (iso) => (iso ? cands.filter((c) => c.tipo !== "referencia" && c.criadoEm > iso).length : cands.length) };
}

export async function lerEstiloDasArtes(p: { clientId: string; por: string; forcar?: boolean }): Promise<ResultadoLeitura> {
  const { data: cli } = await supabaseAdmin.from("clients").select("name, nome_fantasia, nicho").eq("id", p.clientId).maybeSingle();
  const cliente = (cli?.nome_fantasia as string) || (cli?.name as string) || p.clientId;
  try {
    const [{ cands, novasDesde }, { data: ult }] = await Promise.all([
      candidatasDoCliente(p.clientId),
      supabaseAdmin.from("client_visual_style").select("fonte, created_at, imagens").eq("client_id", p.clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const artes = escolherArtes(cands);
    const ultima = ult ? { fonte: ult.fonte as string, criadoEm: ult.created_at as string, imagens: (ult.imagens as string[]) ?? [] } : null;
    const d = p.forcar ? { reler: artes.length >= 2, motivo: "forcado" as const } : decidirReleitura({ ultima, artesNovasDesde: novasDesde(ultima?.criadoEm ?? null), totalArtes: artes.length, agora: new Date() });
    if (!d.reler) return { clientId: p.clientId, cliente, lido: false, motivo: artes.length < 2 ? "poucas_artes" : d.motivo, artes: artes.length };
    const r = await analisarEstiloVisual({ imagens: artes, cliente, nicho: (cli?.nicho as string) ?? null });
    if (!r.ok || !r.data) return { clientId: p.clientId, cliente, lido: false, motivo: "erro", artes: artes.length, erro: r.ok ? "resposta vazia" : r.error };
    const { error } = await supabaseAdmin.from("client_visual_style").insert({ client_id: p.clientId, fonte: "artes", imagens: artes, analise: r.data, resumo: r.data.resumo, modelo: "gpt-4o", created_by: p.por });
    if (error) return { clientId: p.clientId, cliente, lido: false, motivo: "erro", artes: artes.length, erro: error.message };
    return { clientId: p.clientId, cliente, lido: true, motivo: d.motivo, artes: artes.length };
  } catch (err) {
    return { clientId: p.clientId, cliente, lido: false, motivo: "erro", artes: 0, erro: err instanceof Error ? err.message : String(err) };
  }
}
