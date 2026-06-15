// app/api/system/weekly-reports/route.ts
//
// Relatório semanal (7 dias) por cliente em PDF, entregue toda segunda no grupo.
// Reusa o MESMO PDF "PDF Cliente" da página de Anúncios Meta (buildClientReportHtml),
// renderizado server-side via browserless. Crontab (VPS):
//   0 11 * * 1 /opt/loneos/scripts/cron-call.sh weekly-reports POST >> /var/log/loneos-weekly-reports.log 2>&1
//
//   POST                      → gera o PDF de cada cliente ativo-com-Meta e envia ao grupo.
//   POST ?dryRun=1            → apenas lista/conta os clientes elegíveis (não gera/envia).
//   POST ?clientId=<id>       → gera SÓ esse cliente. Com dryRun, salva no Storage e devolve a URL (preview).
//   POST ?force=1             → ignora a idempotência do dia.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { requireCron } from "@/lib/api/cron-guard";
import { getMetaToken, getAlertSettings } from "@/lib/traffic/sync-core";
import { sendMediaDocument } from "@/lib/whatsapp/evolution";
import {
  buildClientPdf, selectActiveMetaClients, periodLabel7d, slug,
} from "@/lib/traffic/weekly-report";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";
const REPORTS_BUCKET = "reports";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function todayKeyBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function notifyAdminFailure(subject: string, detail: string) {
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Lone OS] ${subject}`,
      html: `<p>${subject}</p><pre>${detail.replace(/[<>]/g, "")}</pre>`,
      templateName: "weekly_report_alert",
    });
  } catch (e) {
    console.error("[weekly-reports] fallback e-mail falhou:", e);
  }
}

// ── POST ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyClientId = url.searchParams.get("clientId");
  const dateKey = todayKeyBRT();

  try {
    const settings = await getAlertSettings();
    const token = await getMetaToken();
    if (!token) {
      return NextResponse.json({ ok: false, status: "failed", error: "Token Meta ausente/expirado" }, { status: 200 });
    }

    // Clientes ativos com Meta vinculada
    const clients = await selectActiveMetaClients(onlyClientId);

    if (clients.length === 0) {
      return NextResponse.json({ ok: true, status: "skipped", message: "Nenhum cliente ativo com Meta" });
    }

    // dryRun sem clientId: só lista/conta os elegíveis (não gera PDFs).
    if (dryRun && !onlyClientId) {
      return NextResponse.json({
        ok: true, status: "dry_run", eligible: clients.length,
        clients: clients.map((c) => c.nome_fantasia || c.name),
      });
    }

    // Preview de 1 cliente: gera o PDF e salva no Storage, devolve a URL (não envia no grupo).
    if (dryRun && onlyClientId) {
      const c = clients[0];
      const pdf = await buildClientPdf(token, c);
      if (!pdf.ok || !pdf.buffer) {
        return NextResponse.json({ ok: false, status: "failed", client: c.nome_fantasia || c.name, error: pdf.error }, { status: 200 });
      }
      const path = `preview/${slug(c.nome_fantasia || c.name)}-${dateKey}.pdf`;
      const up = await supabaseAdmin.storage.from(REPORTS_BUCKET).upload(path, pdf.buffer, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) {
        return NextResponse.json({ ok: false, status: "failed", error: `Storage: ${up.error.message}` }, { status: 200 });
      }
      const pub = supabaseAdmin.storage.from(REPORTS_BUCKET).getPublicUrl(path);
      return NextResponse.json({ ok: true, status: "preview", client: c.nome_fantasia || c.name, bytes: pdf.buffer.length, url: pub.data.publicUrl });
    }

    // Envio real → precisa do grupo
    if (!settings.enabled) {
      return NextResponse.json({ ok: true, status: "disabled", message: "Alertas desativados" });
    }
    if (!settings.groupJid) {
      await notifyAdminFailure("Relatório semanal não enviado", "traffic_alert_group_jid vazio.");
      return NextResponse.json({ ok: false, status: "failed", error: "Grupo não configurado" }, { status: 200 });
    }

    // Idempotência por dia (salvo force/clientId)
    if (!force && !onlyClientId) {
      const { data: already } = await supabaseAdmin
        .from("weekly_report_log")
        .select("id").eq("week_key", dateKey).eq("status", "sent").limit(1);
      if (already && already.length > 0) {
        return NextResponse.json({ ok: true, status: "skipped", message: "Relatórios já enviados hoje" });
      }
    }

    const period = periodLabel7d();
    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const clientName = c.nome_fantasia || c.name;
      try {
        const pdf = await buildClientPdf(token, c);
        if (!pdf.ok || !pdf.buffer) { failed++; errors.push(`${clientName}: ${pdf.error}`); continue; }

        const caption = `📊 *Relatório 7 dias — ${clientName}*\nPeríodo: ${period}`;
        const fileName = `relatorio-${slug(clientName)}-${dateKey}.pdf`;
        const res = await sendMediaDocument(settings.groupJid, pdf.buffer.toString("base64"), fileName, caption);
        if (res.ok) sent++; else { failed++; errors.push(`${clientName}: envio ${res.error}`); }
      } catch (e) {
        failed++; errors.push(`${clientName}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (i < clients.length - 1) await sleep(2000);
    }

    const status = sent > 0 ? "sent" : "failed";
    if (!onlyClientId) {
      await supabaseAdmin.from("weekly_report_log").insert({
        week_key: dateKey, status,
        message: `enviados ${sent}/${clients.length}`,
        error: errors.length > 0 ? errors.slice(0, 10).join(" | ") : null,
      });
    }
    if (sent === 0) {
      await notifyAdminFailure("Relatório semanal falhou", `0/${clients.length} enviados.\n${errors.join("\n")}`);
    }

    return NextResponse.json({ ok: sent > 0, status, total: clients.length, sent, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-reports] erro:", msg);
    await notifyAdminFailure("Relatório semanal — exceção", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
