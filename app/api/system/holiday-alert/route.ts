export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getHolidays, holidaysInMonth, weekdayPtBr } from "@/lib/holidays/brasil-api";
import { sendEmail, logEmail } from "@/lib/email/emailService";
import { holidayAlertEmail } from "@/lib/email/templates";

/**
 * POST /api/system/holiday-alert
 *
 * Cron endpoint. Roda dia 20 de cada mês (10 dias antes do próximo mês).
 * Fluxo:
 *   1. Busca feriados do mês seguinte (Brasil API + cache + fallback estático).
 *   2. Pra cada usuário com role designer/social/manager:
 *      a. Cria notification in-app (1 só, listando todos os feriados).
 *      b. Envia email com a lista (template Sober Premium).
 *   3. Idempotente por dia: usa marker em agency_settings pra não disparar 2x se cron rodar repetido.
 *
 * Pode ser chamado manualmente (botão "Recalcular agora" futuramente).
 */

const ROLES_TO_NOTIFY = new Set(["designer", "social", "manager", "admin"]);

function monthLabelPtBr(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1, 12));
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
}

export async function POST(_req: NextRequest) {
  try {
    const now = new Date();
    const nowSP = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    // Mês "alvo" do alerta = mês seguinte ao corrente em BRT
    const targetYear = nowSP.getMonth() === 11 ? nowSP.getFullYear() + 1 : nowSP.getFullYear();
    const targetMonth = nowSP.getMonth() === 11 ? 1 : nowSP.getMonth() + 2; // +2 porque getMonth é 0-based

    const holidays = await getHolidays(targetYear);
    const monthHolidays = holidaysInMonth(holidays, targetYear, targetMonth);
    const monthLabel = monthLabelPtBr(targetYear, targetMonth);

    // Idempotência: se já alertamos pra esse (year-month) este mês, pular email re-disparo
    const markerKey = `holiday_alert_sent_${targetYear}_${String(targetMonth).padStart(2, "0")}`;
    const { data: marker } = await supabaseAdmin
      .from("agency_settings")
      .select("value, updated_at")
      .eq("key", markerKey)
      .maybeSingle();

    const alreadySentRecently = marker?.updated_at &&
      Date.now() - new Date(marker.updated_at as string).getTime() < 25 * 24 * 3600 * 1000; // 25 dias

    // Time pra notificar
    const { data: members, error: mErr } = await supabaseAdmin
      .from("team_members")
      .select("id, name, email, role")
      .eq("is_active", true);
    if (mErr) {
      console.error("[holiday-alert] team_members query failed:", mErr);
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }

    const recipients = (members ?? []).filter((m) => ROLES_TO_NOTIFY.has((m.role as string)?.toLowerCase()));

    // Notification in-app sempre (mesmo se idempotente — cria nova entry no bell)
    // Email só se não foi enviado recentemente
    const enrichedHolidays = monthHolidays.map((h) => ({
      date: h.date,
      name: h.name,
      weekday: weekdayPtBr(h.date),
    }));

    let notificationsCreated = 0;
    let emailsSent = 0;
    let emailsFailed = 0;
    const emailResults: Array<{ to: string; ok: boolean; error?: string }> = [];

    // 1. Notification in-app — uma pra cada user, com mesma mensagem
    const notifTitle = `📌 Feriados de ${monthLabel}`;
    const notifBody = monthHolidays.length === 0
      ? `Nenhum feriado nacional em ${monthLabel}. Mês "limpo" — aproveite pra rodar campanhas sem disputa.`
      : `${monthHolidays.length} feriado${monthHolidays.length > 1 ? "s" : ""}: ${monthHolidays.map((h) => `${h.date.slice(8, 10)}/${h.date.slice(5, 7)} ${h.name}`).join(" · ")}`;

    for (const r of recipients) {
      await supabaseAdmin.from("notifications").insert({
        type: "system",
        title: notifTitle,
        body: notifBody,
        user_id: r.id,
      });
      notificationsCreated++;
    }

    // 2. Email (se não foi enviado recentemente)
    if (!alreadySentRecently) {
      for (const r of recipients) {
        const email = (r.email as string)?.trim();
        const name = (r.name as string) || "time";
        if (!email) continue;
        const { subject, html } = holidayAlertEmail(name, monthLabel, enrichedHolidays);
        const result = await sendEmail({ to: email, toName: name, subject, html, templateName: "holiday_alert" });
        await logEmail(supabaseAdmin, {
          templateName: "holiday_alert",
          recipientEmail: email,
          recipientName: name,
          status: result.success ? "sent" : "failed",
          errorMessage: result.error,
        });
        if (result.success) emailsSent++; else emailsFailed++;
        emailResults.push({ to: email, ok: result.success, error: result.error });
      }

      // Marker pra evitar re-disparo
      await supabaseAdmin.from("agency_settings").upsert({
        key: markerKey,
        value: JSON.stringify({ count: monthHolidays.length, sent_to: emailsSent }),
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
    }

    return NextResponse.json({
      success: true,
      target_month: monthLabel,
      holidays_count: monthHolidays.length,
      holidays: enrichedHolidays,
      recipients_count: recipients.length,
      notifications_created: notificationsCreated,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      email_skipped_idempotent: alreadySentRecently,
      email_results: emailResults,
    });
  } catch (err) {
    console.error("[holiday-alert] unexpected:", err);
    return NextResponse.json({
      error: `Erro inesperado: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  }
}
