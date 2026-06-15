// app/api/system/client-messages/route.ts
//
// Mensagens nos GRUPOS DOS CLIENTES (seg/qua/sex 08:50 BRT):
//   ?kind=support  → só a mensagem de suporte (qua/sex, e parte da segunda)
//   ?kind=monday   → suporte + PDF de 7 dias (segunda)
// Crontab (VPS) via scripts/client-messages.sh:
//   50 11 * * 1   client-messages.sh monday
//   50 11 * * 3,5 client-messages.sh support
//
// Segurança: só envia para clientes COM whatsapp_group_jid confirmado; pula e
// reporta os sem grupo. Trava global traffic_client_msgs_enabled (default false).
//   ?dryRun=1   → lista quem receberia / quem está sem grupo (não envia)
//   ?clientId=X → testa 1 cliente (ignora a trava global, p/ validar 1 grupo)
//   ?force=1    → ignora a idempotência do dia

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { requireCron } from "@/lib/api/cron-guard";
import { getMetaToken } from "@/lib/traffic/sync-core";
import {
  buildClientPdf, selectActiveMetaClients, periodLabel7d, slug, clientDisplayName,
  type ReportClientRow,
} from "@/lib/traffic/weekly-report";
import { SUPPORT_MESSAGE, reportCaption } from "@/lib/traffic/support-message";
import { sendGroupText, sendMediaDocument } from "@/lib/whatsapp/evolution";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function todayKeyBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function clientMsgsEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("agency_settings").select("value").eq("key", "traffic_client_msgs_enabled").maybeSingle();
  return (data?.value ?? "false") === "true";
}

async function notifyAdminFailure(subject: string, detail: string) {
  try {
    await sendEmail({
      to: ADMIN_EMAIL, subject: `[Lone OS] ${subject}`,
      html: `<p>${subject}</p><pre>${detail.replace(/[<>]/g, "")}</pre>`,
      templateName: "client_messages_alert",
    });
  } catch (e) { console.error("[client-messages] fallback e-mail falhou:", e); }
}

/** Já foi enviada (sent) essa mensagem hoje p/ esse cliente? (idempotência) */
async function alreadySent(clientId: string, dateKey: string, kind: "report" | "support"): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("client_group_message_log")
    .select("id").eq("client_id", clientId).eq("date_key", dateKey).eq("kind", kind).eq("status", "sent").limit(1);
  return !!(data && data.length > 0);
}

async function logMsg(clientId: string, dateKey: string, kind: "report" | "support", status: string, error?: string | null) {
  await supabaseAdmin.from("client_group_message_log").insert({ client_id: clientId, date_key: dateKey, kind, status, error: error ?? null });
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "monday" ? "monday" : "support";
  const withReport = kind === "monday";
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyClientId = url.searchParams.get("clientId");
  const dateKey = todayKeyBRT();

  try {
    // Trava global (a menos que seja teste de 1 cliente)
    if (!onlyClientId && !dryRun && !(await clientMsgsEnabled())) {
      return NextResponse.json({ ok: true, status: "disabled", message: "traffic_client_msgs_enabled=false" });
    }

    const clients = await selectActiveMetaClients(onlyClientId);
    const withGroup = clients.filter((c) => c.whatsapp_group_jid);
    const withoutGroup = clients.filter((c) => !c.whatsapp_group_jid).map(clientDisplayName);

    if (dryRun) {
      return NextResponse.json({
        ok: true, status: "dry_run", kind,
        withGroup: withGroup.map((c) => clientDisplayName(c)),
        withoutGroup,
        counts: { eligible: withGroup.length, semGrupo: withoutGroup.length },
      });
    }

    if (withGroup.length === 0) {
      return NextResponse.json({ ok: true, status: "skipped", message: "Nenhum cliente com grupo confirmado", withoutGroup });
    }

    const token = withReport ? await getMetaToken() : null;
    if (withReport && !token) {
      return NextResponse.json({ ok: false, status: "failed", error: "Token Meta ausente/expirado" }, { status: 200 });
    }

    const period = periodLabel7d();
    let supportSent = 0, supportFail = 0, reportSent = 0, reportFail = 0;
    const errors: string[] = [];

    for (let i = 0; i < withGroup.length; i++) {
      const c: ReportClientRow = withGroup[i];
      const name = clientDisplayName(c);
      const jid = c.whatsapp_group_jid!;

      // 1) Suporte (sempre) — segunda manda suporte ANTES do relatório
      if (force || !(await alreadySent(c.id, dateKey, "support"))) {
        const res = await sendGroupText(jid, SUPPORT_MESSAGE);
        if (res.ok) { supportSent++; await logMsg(c.id, dateKey, "support", "sent"); }
        else { supportFail++; errors.push(`${name} (suporte): ${res.error}`); await logMsg(c.id, dateKey, "support", "failed", res.error); }
      }

      // 2) Relatório (só segunda)
      if (withReport && (force || !(await alreadySent(c.id, dateKey, "report")))) {
        await sleep(1500);
        const pdf = await buildClientPdf(token!, c);
        if (!pdf.ok || !pdf.buffer) {
          reportFail++; errors.push(`${name} (relatório): ${pdf.error}`); await logMsg(c.id, dateKey, "report", "failed", pdf.error);
        } else {
          const fileName = `relatorio-${slug(name)}-${dateKey}.pdf`;
          const res = await sendMediaDocument(jid, pdf.buffer.toString("base64"), fileName, reportCaption(name, period));
          if (res.ok) { reportSent++; await logMsg(c.id, dateKey, "report", "sent"); }
          else { reportFail++; errors.push(`${name} (relatório): ${res.error}`); await logMsg(c.id, dateKey, "report", "failed", res.error); }
        }
      }

      if (i < withGroup.length - 1) await sleep(2500);
    }

    const totalSent = supportSent + reportSent;
    if (totalSent === 0 && !onlyClientId) {
      await notifyAdminFailure(`Mensagens aos clientes (${kind}) falharam`, errors.join("\n") || "0 enviadas");
    }

    return NextResponse.json({
      ok: totalSent > 0, status: totalSent > 0 ? "sent" : "failed", kind,
      support: { sent: supportSent, failed: supportFail },
      report: { sent: reportSent, failed: reportFail },
      semGrupo: withoutGroup,
      errors: errors.slice(0, 15),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[client-messages] erro:", msg);
    await notifyAdminFailure("Mensagens aos clientes — exceção", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
