// app/api/system/team-weekly/route.ts
//
// Relatório INTERNO da produção do time (PDF branded), toda SEXTA no grupo interno.
// Página 1 = entregas por designer + publicações/demandas por social + não-entregas.
// Página 2 = trabalho do Julio (rotina registrada + variação de verba por cliente).
// Backstage — o cliente NUNCA vê. Crontab (VPS), sexta 17h BRT = 20h UTC:
//   0 20 * * 5 /opt/loneos/scripts/cron-call.sh team-weekly POST >> /var/log/loneos-team-weekly.log 2>&1
//
//   POST                → gera o PDF e envia ao grupo interno (CS_INTERNAL_GROUP_JID).
//   POST ?preview=1     → gera o PDF, salva no Storage e devolve a URL (não envia no grupo).
//   POST ?force=1       → ignora a idempotência do dia.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { sendMediaDocument } from "@/lib/whatsapp/evolution";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { buildTeamWeeklyData, buildTeamWeeklyHtml } from "@/lib/reports/teamWeekly";

const REPORTS_BUCKET = "reports";
function todayKeyBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") !== null;
  const force = url.searchParams.get("force") === "1";
  const dateKey = `team:${todayKeyBRT()}`;

  try {
    // Idempotência do dia (salvo preview/force)
    if (!preview && !force) {
      const { data: já } = await supabaseAdmin
        .from("weekly_report_log").select("id").eq("week_key", dateKey).eq("status", "sent").limit(1);
      if (já && já.length > 0) {
        return NextResponse.json({ ok: true, status: "skipped", message: "Relatório do time já enviado hoje" });
      }
    }

    const data = await buildTeamWeeklyData();
    const html = buildTeamWeeklyHtml(data);
    const pdf = await htmlToPdf(html);
    if (!pdf.ok || !pdf.buffer) {
      return NextResponse.json({ ok: false, status: "failed", error: pdf.error ?? "falha no render" }, { status: 200 });
    }

    // Preview → salva no Storage e devolve URL
    if (preview) {
      const path = `preview/time-${todayKeyBRT()}.pdf`;
      const up = await supabaseAdmin.storage.from(REPORTS_BUCKET).upload(path, pdf.buffer, { contentType: "application/pdf", upsert: true });
      if (up.error) return NextResponse.json({ ok: false, status: "failed", error: `Storage: ${up.error.message}` }, { status: 200 });
      const pub = supabaseAdmin.storage.from(REPORTS_BUCKET).getPublicUrl(path);
      return NextResponse.json({ ok: true, status: "preview", bytes: pdf.buffer.length, url: pub.data.publicUrl, resumo: { entregues: data.totalEntregues, publicados: data.publicados, designers: data.designers.length, socials: data.socials.length, rotina: data.rotina.length, verba: data.verba.length } });
    }

    // Envio real → grupo interno
    const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
    if (!internalJid) {
      return NextResponse.json({ ok: false, status: "failed", error: "CS_INTERNAL_GROUP_JID não configurado" }, { status: 200 });
    }
    const caption = `📋 *Produção do time — ${data.periodoLabel}*\nEntregas do social/designer + trabalho do Julio no tráfego. Uso interno.`;
    const fileName = `producao-time-${todayKeyBRT()}.pdf`;
    const res = await sendMediaDocument(internalJid, pdf.buffer.toString("base64"), fileName, caption);

    await supabaseAdmin.from("weekly_report_log").insert({
      week_key: dateKey, status: res.ok ? "sent" : "failed",
      message: `entregues ${data.totalEntregues} · pub ${data.publicados} · verba ${data.verba.length}`,
      error: res.ok ? null : res.error,
    }).then(() => {}, () => {});

    return NextResponse.json({ ok: res.ok, status: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[team-weekly] erro:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
