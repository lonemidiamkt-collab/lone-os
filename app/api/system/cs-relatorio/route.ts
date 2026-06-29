export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, addDays, spDateKeyOf } from "@/lib/cs/vigilancia";
import { buildDeliveryReport, type EntregaItem } from "@/lib/cs/relatorio";

// POST /api/system/cs-relatorio — A5: relatório SEMANAL de entregas no grupo interno.
// Backstage (o cliente nunca vê). Cron sugerido: sexta 17h BRT = `0 20 * * 5` (UTC = BRT+3).
const RELATORIO_LIVE = true; // false = calcula e devolve o preview, mas NÃO posta no WhatsApp.

/** DD/MM de um Date "SP-local". */
function dm(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  // ?preview=1 → calcula e devolve o texto, mas NÃO posta (pra validar com dados reais sem spammar).
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  // Semana corrente: de segunda 00:00 (SP) até agora.
  const offsetSeg = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=dom vira 6 dias desde segunda
  const segunda = addDays(now, -offsetSeg);
  const segKey = ymd(segunda);
  const hojeKey = ymd(now);
  const periodoLabel = `${dm(segunda)} a ${dm(now)}`;

  // Designer por cliente + quais clientes estão com o agente ligado (S8).
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients").select("id, assigned_designer, active, agente_ativo")
    .or("active.is.null,active.eq.true");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const designerByClient = new Map<string, string | null>(
    (clientsData ?? []).map((c) => [c.id as string, (c.assigned_designer as string) || null]),
  );
  const ativos = new Set((clientsData ?? []).filter((c) => c.agente_ativo !== false).map((c) => c.id as string));

  // Entregas da semana: designer_delivered_at não nulo (limito a ~9 dias no banco; filtro fino no fuso SP).
  const desde = new Date(Date.now() - 9 * 86400000).toISOString();
  const { data: entreguesData } = await supabaseAdmin
    .from("content_cards")
    .select("client_id, due_date, designer_delivered_at")
    .not("designer_delivered_at", "is", null)
    .is("archived_at", null)
    .gte("designer_delivered_at", desde);

  const entregas: EntregaItem[] = [];
  for (const k of entreguesData ?? []) {
    const dKey = spDateKeyOf(k.designer_delivered_at as string);
    if (!dKey || dKey < segKey || dKey > hojeKey) continue; // só a semana corrente
    if (!ativos.has(k.client_id as string)) continue;
    const due = (k.due_date as string) || null;
    entregas.push({
      designer: designerByClient.get(k.client_id as string) ?? null,
      onTime: !due || dKey <= due, // entregou até a data de postagem
    });
  }

  // Em produção agora (snapshot).
  const { count: emProducao } = await supabaseAdmin
    .from("content_cards").select("id", { count: "exact", head: true })
    .eq("status", "in_production").is("archived_at", null).is("designer_delivered_at", null);

  // Publicados na semana (best-effort: status published + status_changed_at na semana).
  const { data: pubData } = await supabaseAdmin
    .from("content_cards").select("status_changed_at")
    .eq("status", "published").is("archived_at", null)
    .not("status_changed_at", "is", null)
    .gte("status_changed_at", desde);
  const publicados = (pubData ?? []).filter((p) => {
    const key = spDateKeyOf(p.status_changed_at as string);
    return key !== null && key >= segKey && key <= hojeKey;
  }).length;

  const msg = buildDeliveryReport({ periodoLabel, entregas, emProducao: emProducao ?? 0, publicados });

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (RELATORIO_LIVE && internalJid && !previewOnly) {
    const r = await csSendGroupText(internalJid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-relatorio] post falhou:", r.error);
  }

  console.log(`[cs-relatorio] semana ${segKey}..${hojeKey} entregas=${entregas.length} producao=${emProducao ?? 0} pub=${publicados} postada=${postada}`);
  return NextResponse.json({
    ok: true, live: RELATORIO_LIVE, periodo: periodoLabel,
    entregas: entregas.length, em_producao: emProducao ?? 0, publicados, postada, preview: msg,
  });
}
