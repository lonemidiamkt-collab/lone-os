export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow } from "@/lib/cs/vigilancia";

// POST /api/system/cs-risco — CLIENTE EM RISCO DE CHURN. Cruza sinais que já temos: cliente
// sumido do grupo (esfriando) + reclamação recente + Instagram parado (sem crescer / sem postar).
// Alerta o gestor no grupo interno + notificação. Cron semanal (ex.: segunda de manhã).

const DIAS_SILENCIO = 12;

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;
  const now = spNow();
  const d14 = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: clients } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, assigned_social, last_client_msg_at, agente_ativo")
    .in("status", ["good", "average", "onboarding"]).is("draft_status", null)
    .or("active.is.null,active.eq.true");

  // Reclamações recentes (14d) → set de client_id.
  const { data: reclamacoes } = await supabaseAdmin
    .from("cs_demandas").select("client_id").eq("tipo", "reclamacao").gte("created_at", d14);
  const reclamou = new Set((reclamacoes ?? []).map((r) => r.client_id as string));

  // Instagram parado (snapshot de 30d): sem crescer ou sem postar.
  const { data: snaps } = await supabaseAdmin
    .from("client_ig_snapshots").select("client_id, data").eq("period_kind", "30d");
  const igMap = new Map<string, { ganhos: number | null; posts: number | null }>();
  for (const s of snaps ?? []) {
    const d = s.data as { resumo?: { seguidoresGanhos?: number | null; postsNoPeriodo?: number | null } };
    igMap.set(s.client_id as string, { ganhos: d?.resumo?.seguidoresGanhos ?? null, posts: d?.resumo?.postsNoPeriodo ?? null });
  }

  type Risco = { nome: string; social: string | null; score: number; motivos: string[]; clientId: string };
  const riscos: Risco[] = [];
  for (const c of clients ?? []) {
    if (c.agente_ativo === false) continue;
    const nome = (c.nome_fantasia as string) || (c.name as string);
    let score = 0; const motivos: string[] = [];

    const lastMsg = c.last_client_msg_at as string | null;
    const diasSilencio = lastMsg ? Math.floor((Date.now() - new Date(lastMsg).getTime()) / 86400000) : null;
    if (diasSilencio != null && diasSilencio >= DIAS_SILENCIO) { score += 2; motivos.push(`sumido há ${diasSilencio}d`); }

    if (reclamou.has(c.id as string)) { score += 2; motivos.push("reclamou (14d)"); }

    const ig = igMap.get(c.id as string);
    if (ig) {
      if (ig.posts === 0) { score += 1; motivos.push("0 posts no mês"); }
      else if (ig.ganhos != null && ig.ganhos <= 0) { score += 1; motivos.push("IG sem crescer"); }
    }

    if (score >= 3) riscos.push({ nome, social: (c.assigned_social as string) || null, score, motivos, clientId: c.id as string });
  }
  riscos.sort((a, b) => b.score - a.score);

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (riscos.length > 0 && internalJid && !previewOnly) {
    const linhas = riscos.slice(0, 12).map((r) => `• *${r.nome}*${r.social ? ` (${r.social})` : ""} — ${r.motivos.join(", ")}`);
    const msg = `🚨 *Clientes em risco* — vale um contato antes de perder:\n\n${linhas.join("\n")}\n\n_Sinais cruzados: sumiço do grupo + reclamação + Instagram parado._`;
    const r = await csSendGroupText(internalJid, msg);
    postada = r.ok;
    // Notificação por cliente pro social responsável.
    for (const risco of riscos.slice(0, 12)) {
      await supabaseAdmin.from("notifications").insert({
        type: "content", title: `🚨 ${risco.nome} em risco`,
        body: `Sinais: ${risco.motivos.join(", ")}. Vale um contato/atenção.`,
        client_id: risco.clientId,
      }).then(() => {}, () => {});
    }
  }

  console.log(`[cs-risco] ${riscos.length} em risco; postada=${postada}`);
  return NextResponse.json({ ok: true, em_risco: riscos.length, postada, detalhe: riscos.map((r) => ({ cliente: r.nome, score: r.score, motivos: r.motivos })) });
}
