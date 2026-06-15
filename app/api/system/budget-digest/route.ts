// app/api/system/budget-digest/route.ts
//
// Digest de saldos Meta Ads enviado ao grupo do gestor de tráfego via Evolution.
// Agendado seg/qua/sex 08:00 BRT (crontab no VPS — ver docs/budget-alerts-evolution.md):
//   0 8 * * 1,3,5 curl -s -X POST https://painel.lonemidia.com/api/system/budget-digest \
//     -H "Authorization: Bearer $CRON_SECRET" >> /var/log/loneos-crons.log 2>&1
//
//   POST            → roda sync, monta relatório completo, envia ao grupo, loga.
//   POST ?dryRun=1  → monta a mensagem com dados reais mas NÃO envia (verificação).
//   POST ?force=1   → ignora a idempotência do dia (reenvia).
//   GET             → health/status (conexão Evolution, grupo, idade do sync, último digest).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { requireCron } from "@/lib/api/cron-guard";
import { runBalanceSync, getAlertSettings } from "@/lib/traffic/sync-core";
import {
  buildDigestMessage, countBySeverity, buildRunHeader, buildAccountMessage, sortBySeverity,
} from "@/lib/budgets/alert-engine";
import { isEvolutionConfigured, checkInstance, sendGroupText } from "@/lib/whatsapp/evolution";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Intervalo entre mensagens no modo conta-a-conta (evita flood/rate-limit).
const PER_ACCOUNT_DELAY_MS = 1200;

function todayKeyBRT(): string {
  // en-CA => "YYYY-MM-DD"
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function notifyAdminFailure(subject: string, detail: string) {
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Lone OS] ${subject}`,
      html: `<p>${subject}</p><pre>${detail.replace(/[<>]/g, "")}</pre>`,
      templateName: "budget_digest_alert",
    });
  } catch (e) {
    console.error("[budget-digest] Falha ao enviar e-mail de fallback:", e);
  }
}

// ── POST: monta e envia o digest ─────────────────────────────

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const dateKey = todayKeyBRT();

  try {
    const settings = await getAlertSettings();

    if (!settings.enabled) {
      return NextResponse.json({ ok: true, status: "disabled", message: "Alertas desativados em agency_settings" });
    }

    // Idempotência: 1 digest por dia (salvo dryRun/force).
    if (!dryRun && !force) {
      const { data: already } = await supabaseAdmin
        .from("budget_digest_log")
        .select("id")
        .eq("date_key", dateKey)
        .eq("status", "sent")
        .limit(1);
      if (already && already.length > 0) {
        return NextResponse.json({ ok: true, status: "skipped", message: "Digest já enviado hoje" });
      }
    }

    // Sync fresco (sem disparo em tempo real — o digest já cobre tudo).
    const sync = await runBalanceSync({ settings, dispatchRealtimeAlerts: false });

    if (sync.tokenMissing) {
      if (!dryRun) {
        await supabaseAdmin.from("budget_digest_log").insert({
          date_key: dateKey, status: "failed", error: "Token Meta ausente/expirado",
        });
        await notifyAdminFailure("Digest de saldos falhou", "Token Meta ausente ou expirado — sync não rodou.");
      }
      return NextResponse.json({ ok: false, status: "failed", error: "Token Meta ausente/expirado" }, { status: 200 });
    }

    const counts = countBySeverity(sync.accounts);

    // Modo de entrega: ?mode= sobrescreve o setting (útil p/ preview/dry-run).
    const modeParam = url.searchParams.get("mode");
    const mode = modeParam === "per_account" || modeParam === "digest" ? modeParam : settings.mode;

    // Lista de mensagens a enviar:
    //   digest      → 1 mensagem consolidada
    //   per_account → cabeçalho + 1 mensagem por conta (crítico primeiro)
    const messages = mode === "per_account"
      ? [buildRunHeader(sync.accounts), ...sortBySeverity(sync.accounts).map(buildAccountMessage)]
      : [buildDigestMessage(sync.accounts)];

    if (dryRun) {
      await supabaseAdmin.from("budget_digest_log").insert({
        date_key: dateKey, status: "dry_run", severity_counts: counts,
        message: `[${mode}] ${messages.length} mensagem(ns)`,
      });
      return NextResponse.json({ ok: true, status: "dry_run", mode, counts, messageCount: messages.length, messages });
    }

    if (!settings.groupJid) {
      await supabaseAdmin.from("budget_digest_log").insert({
        date_key: dateKey, status: "failed", severity_counts: counts,
        message: `[${mode}]`, error: "Grupo (traffic_alert_group_jid) não configurado",
      });
      await notifyAdminFailure("Digest de saldos não enviado", "traffic_alert_group_jid vazio em agency_settings.");
      return NextResponse.json({ ok: false, status: "failed", error: "Grupo não configurado", counts }, { status: 200 });
    }

    // Envia 1 (digest) ou N (per_account) mensagens, com delay entre elas.
    let sent = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (let i = 0; i < messages.length; i++) {
      const res = await sendGroupText(settings.groupJid, messages[i]);
      if (res.ok) sent++;
      else { failed++; firstError ??= res.error ?? "erro desconhecido"; }
      if (i < messages.length - 1) await sleep(PER_ACCOUNT_DELAY_MS);
    }

    if (sent === 0) {
      await supabaseAdmin.from("budget_digest_log").insert({
        date_key: dateKey, status: "failed", severity_counts: counts,
        message: `[${mode}] 0/${messages.length} enviadas`,
        error: firstError ?? "Falha no envio Evolution",
      });
      await notifyAdminFailure(
        "Digest de saldos falhou no envio",
        `Evolution retornou erro: ${firstError ?? "desconhecido"} (modo ${mode}).`,
      );
      return NextResponse.json({ ok: false, status: "failed", mode, error: firstError, counts }, { status: 200 });
    }

    await supabaseAdmin.from("budget_digest_log").insert({
      date_key: dateKey, status: "sent", severity_counts: counts,
      message: `[${mode}] enviadas ${sent}/${messages.length}`,
      error: failed > 0 ? `${failed} falharam (${firstError})` : null,
    });

    return NextResponse.json({ ok: true, status: "sent", mode, counts, sent, failed, total: messages.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[budget-digest] erro:", msg);
    if (!dryRun) {
      await supabaseAdmin.from("budget_digest_log").insert({ date_key: dateKey, status: "failed", error: msg });
      await notifyAdminFailure("Digest de saldos — exceção", msg);
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// ── GET: health/status (verificar esses erros num lugar só) ──

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const settings = await getAlertSettings();

  // Conexão Evolution
  let evolution: { configured: boolean; connected: boolean; state?: string; error?: string };
  if (!isEvolutionConfigured()) {
    evolution = { configured: false, connected: false, error: "env EVOLUTION_* ausente" };
  } else {
    const check = await checkInstance();
    evolution = check.ok
      ? { configured: true, connected: !!check.data?.connected, state: check.data?.state }
      : { configured: true, connected: false, error: check.error };
  }

  // Idade do último sync
  const { data: lastSync } = await supabaseAdmin
    .from("ad_accounts")
    .select("last_synced_at")
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const lastSyncedAt = lastSync?.last_synced_at ?? null;
  const syncAgeMin = lastSyncedAt
    ? Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000)
    : null;

  // Último digest
  const { data: lastDigest } = await supabaseAdmin
    .from("budget_digest_log")
    .select("date_key, status, severity_counts, sent_at, error")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Contas em alerta agora (a partir do último sync salvo)
  const { count: criticalCount } = await supabaseAdmin
    .from("ad_accounts")
    .select("id", { count: "exact", head: true })
    .eq("account_status", 1)
    .lte("last_balance", 0);

  const ready =
    settings.enabled && !!settings.groupJid && evolution.configured && evolution.connected;

  return NextResponse.json({
    ready,
    settings: {
      enabled: settings.enabled,
      groupConfigured: !!settings.groupJid,
      warningPct: settings.warningPct,
      criticalPct: settings.criticalPct,
    },
    evolution,
    lastSync: { at: lastSyncedAt, ageMinutes: syncAgeMin },
    accountsZeroedNow: criticalCount ?? 0,
    lastDigest: lastDigest ?? null,
  });
}
