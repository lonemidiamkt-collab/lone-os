// app/api/system/monthly-calendar/route.ts
//
// Planejamento mensal nos GRUPOS DOS CLIENTES — "qual a promoção do próximo mês?"
// + calendário (feriados/datas comemorativas) do mês SEGUINTE em PDF, pra equipe
// já desenvolver as artes e entregar o planejamento ao cliente.
//
// Regra de data: dispara no DIA 20; se 20 cair em fim de semana, envia no próximo
// dia útil (segunda). O cron cobre os dias 20,21,22 às 08:00 BRT e a rota só envia
// no "dia efetivo" do mês — idempotente por cliente/dia (não duplica).
//   0 11 20,21,22 * * cron-call.sh monthly-calendar POST
//
// Trava global: traffic_monthly_calendar_enabled (default false).
// Texto da legenda: agency_settings.monthly_calendar_message (placeholders
// {cliente} {mes} {Mes}); cai no DEFAULT_MESSAGE se vazio.
//   ?dryRun=1   → gera o PDF (preview no Storage) + lista quem receberia (NÃO envia)
//   ?force=1    → ignora a checagem de dia efetivo e a idempotência
//   ?clientId=X → só esse cliente (ignora a trava) — teste pontual
//   ?testJid=X  → envia o PDF+msg real p/ esse grupo (ex.: grupo interno) e retorna

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { requireCron } from "@/lib/api/cron-guard";
import {
  selectActiveClientsWithGroup, clientDisplayName,
} from "@/lib/traffic/weekly-report";
import { renderMonthHolidaysPdfBuffer, holidaysPdfFilename } from "@/lib/holidays/pdf-server";
import { sendMediaDocument } from "@/lib/whatsapp/evolution";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";
const REPORTS_BUCKET = "reports";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MONTH_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const DEFAULT_MESSAGE =
  "Oi, {cliente}! 👋 {Mes} tá chegando!\n\n" +
  "Pra gente já adiantar as *artes* e montar o *planejamento do mês*, " +
  "qual vai ser a sua *promoção/oferta de {mes}*? 🎯\n\n" +
  "Mandei junto o *calendário de {mes}* com os feriados e datas comemorativas — " +
  "dá uma olhada que tem oportunidades boas. Assim que você passar a promo, " +
  "a gente desenvolve tudo e te entrega o planejamento. 🚀";

// ── Datas (tudo em BRT, sem depender do TZ do servidor) ──────────
/** Data de hoje em São Paulo como "YYYY-MM-DD". */
function dateKeyBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
/** Primeiro dia útil >= 20 do mês (sáb→seg, dom→seg). */
function effectiveSendDay(year: number, month1to12: number): number {
  const dow20 = new Date(Date.UTC(year, month1to12 - 1, 20)).getUTCDay(); // 0=Dom..6=Sáb
  if (dow20 === 6) return 22; // sábado → segunda
  if (dow20 === 0) return 21; // domingo → segunda
  return 20;
}

// ── Config / idempotência ────────────────────────────────────────
async function calendarEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("agency_settings").select("value").eq("key", "traffic_monthly_calendar_enabled").maybeSingle();
  return (data?.value ?? "false") === "true";
}
async function loadMessageTemplate(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("agency_settings").select("value").eq("key", "monthly_calendar_message").maybeSingle();
  return (data?.value ?? "").trim() || DEFAULT_MESSAGE;
}
function renderCaption(tpl: string, cliente: string, mes: string): string {
  const Mes = mes.charAt(0).toUpperCase() + mes.slice(1);
  return tpl.replace(/\{cliente\}/g, cliente).replace(/\{Mes\}/g, Mes).replace(/\{mes\}/g, mes);
}
async function alreadySent(clientId: string, dateKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("client_group_message_log")
    .select("id").eq("client_id", clientId).eq("date_key", dateKey).eq("kind", "calendar").eq("status", "sent").limit(1);
  return !!(data && data.length > 0);
}
async function logMsg(clientId: string, dateKey: string, status: string, error?: string | null) {
  await supabaseAdmin.from("client_group_message_log")
    .insert({ client_id: clientId, date_key: dateKey, kind: "calendar", status, error: error ?? null });
}
async function notifyAdminFailure(subject: string, detail: string) {
  try {
    await sendEmail({
      to: ADMIN_EMAIL, subject: `[Lone OS] ${subject}`,
      html: `<p>${subject}</p><pre>${detail.replace(/[<>]/g, "")}</pre>`,
      templateName: "monthly_calendar_alert",
    });
  } catch (e) { console.error("[monthly-calendar] fallback e-mail falhou:", e); }
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyClientId = url.searchParams.get("clientId");
  const testJid = url.searchParams.get("testJid");

  // Datas em BRT
  const dateKey = dateKeyBRT();
  const [y, mo, day] = dateKey.split("-").map(Number);
  const sendDay = effectiveSendDay(y, mo);
  const isSendDay = day === sendDay;
  // Mês ALVO do calendário = mês seguinte ao corrente
  const target = mo === 12 ? { year: y + 1, month: 1 } : { year: y, month: mo + 1 };
  const mesNome = MONTH_PT[target.month - 1];

  try {
    // Trava global (exceto dryRun / teste de 1 cliente / testJid)
    if (!dryRun && !onlyClientId && !testJid && !(await calendarEnabled())) {
      return NextResponse.json({ ok: true, status: "disabled", message: "traffic_monthly_calendar_enabled=false" });
    }

    // Só envia no dia efetivo (a menos de force/teste/dryRun)
    if (!force && !dryRun && !onlyClientId && !testJid && !isSendDay) {
      return NextResponse.json({
        ok: true, status: "skipped",
        message: `Hoje (${dateKey}) não é o dia de envio deste mês — dia efetivo = ${sendDay}.`,
      });
    }

    // Gera o calendário do mês alvo UMA vez (reusado por todos)
    const pdf = await renderMonthHolidaysPdfBuffer({ year: target.year, month: target.month, region: "BRASIL" });
    if (!pdf) {
      await notifyAdminFailure("Calendário mensal não gerado", `Falha ao renderizar o PDF de ${mesNome}/${target.year}.`);
      return NextResponse.json({ ok: false, status: "failed", error: "PDF não gerado" }, { status: 200 });
    }
    const fileName = holidaysPdfFilename(target.year, target.month);

    // dryRun: salva preview no Storage e lista elegíveis (não envia nada)
    if (dryRun) {
      const path = `preview/${fileName}`;
      const up = await supabaseAdmin.storage.from(REPORTS_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
      const pub = up.error ? null : supabaseAdmin.storage.from(REPORTS_BUCKET).getPublicUrl(path).data.publicUrl;
      const clients = await selectActiveClientsWithGroup(onlyClientId);
      const withGroup = clients.filter((c) => c.whatsapp_group_jid);
      return NextResponse.json({
        ok: true, status: "dry_run", mes: `${mesNome}/${target.year}`,
        isSendDay, sendDay, dateKey, pdfBytes: pdf.length, previewUrl: pub,
        eligible: withGroup.length,
        withGroup: withGroup.map(clientDisplayName),
        semGrupo: clients.filter((c) => !c.whatsapp_group_jid).map(clientDisplayName),
      });
    }

    const template = await loadMessageTemplate();

    // testJid: 1 envio real p/ um grupo (ex.: interno) — valida msg+PDF sem tocar clientes
    if (testJid) {
      const res = await sendMediaDocument(testJid, pdf.toString("base64"), fileName, renderCaption(template, "equipe", mesNome));
      return NextResponse.json({ ok: res.ok, status: res.ok ? "test_sent" : "failed", testJid, error: res.error ?? null });
    }

    // Envio real aos grupos dos clientes
    const clients = await selectActiveClientsWithGroup(onlyClientId);
    const withGroup = clients.filter((c) => c.whatsapp_group_jid);
    const semGrupo = clients.filter((c) => !c.whatsapp_group_jid).map(clientDisplayName);
    if (withGroup.length === 0) {
      return NextResponse.json({ ok: true, status: "skipped", message: "Nenhum cliente com grupo confirmado", semGrupo });
    }

    let sent = 0, failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < withGroup.length; i++) {
      const c = withGroup[i];
      const name = clientDisplayName(c);
      const jid = c.whatsapp_group_jid!;
      if (!force && (await alreadySent(c.id, dateKey))) continue;
      const res = await sendMediaDocument(jid, pdf.toString("base64"), fileName, renderCaption(template, name, mesNome));
      if (res.ok) { sent++; await logMsg(c.id, dateKey, "sent"); }
      else { failed++; errors.push(`${name}: ${res.error}`); await logMsg(c.id, dateKey, "failed", res.error); }
      if (i < withGroup.length - 1) await sleep(2500);
    }

    if (failed > 0) await notifyAdminFailure(`Calendário mensal (${mesNome}): ${failed} falha(s)`, errors.join("\n") || "—");
    return NextResponse.json({
      ok: sent > 0, status: sent > 0 ? "sent" : "failed",
      mes: `${mesNome}/${target.year}`, sent, failed, semGrupo, errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[monthly-calendar] erro:", msg);
    await notifyAdminFailure("Calendário mensal — erro inesperado", msg);
    return NextResponse.json({ ok: false, status: "error", error: msg }, { status: 200 });
  }
}
