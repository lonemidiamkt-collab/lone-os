// app/api/system/urgent-alerts/route.ts
//
// Alertas URGENTES (terça/quinta 08:00 BRT) ao grupo interno do gestor.
// Diferente do budget-digest (seg/qua/sex, resumo de saldo), aqui só sai mensagem
// se houver problema OPERACIONAL urgente: cartão/conta não ativa (erro_conta),
// verba zerada (verba_zerada) ou anúncios parados (campanha_parada). Sem nenhum → não envia.
//
//   crontab VPS:  0 11 * * 2,4 /opt/loneos/scripts/cron-call.sh urgent-alerts POST
//   POST ?dryRun=1 → monta com dados reais mas NÃO envia (preview/teste).
//   POST ?force=1  → ignora o dedup do dia.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { reservarAviso, devolverReserva } from "@/lib/traffic/aviso-reserva";
import { requireCron } from "@/lib/api/cron-guard";
import { runBalanceSync, getAlertSettings } from "@/lib/traffic/sync-core";
import { type OpAlertType } from "@/lib/budgets/operational-alerts";
import { sendGroupText } from "@/lib/whatsapp/evolution";

// Conjunto confirmado pelo CEO: cartão/conta, verba zerada, anúncios parados.
const URGENT_TYPES: OpAlertType[] = ["erro_conta", "verba_zerada", "campanha_parada"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function todayKeyBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function buildMessage(clientName: string, reasons: string[]): string {
  return `🚨 *${clientName}*\n${reasons.map((r) => `• ${r}`).join("\n")}`;
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const dateKey = todayKeyBRT();

  const settings = await getAlertSettings();
  if (!settings.enabled || !settings.groupJid) {
    return NextResponse.json({
      ok: true,
      status: "skipped",
      reason: !settings.enabled ? "alertas desativados" : "grupo (traffic_alert_group_jid) não configurado",
    });
  }

  // Sync fresco; NÃO dispara o realtime (esse é o caminho do dispatchRealtimeAlerts).
  const sync = await runBalanceSync({ settings, dispatchRealtimeAlerts: false });
  if (sync.tokenMissing) {
    return NextResponse.json({ ok: false, status: "failed", error: "Token Meta ausente/expirado" }, { status: 200 });
  }

  // Contas com algum opAlert URGENTE.
  const urgent = (sync.accounts ?? [])
    .map((a) => ({ account: a, reasons: (a.opAlerts ?? []).filter((h) => URGENT_TYPES.includes(h.type)).map((h) => h.reason) }))
    .filter((x) => x.reasons.length > 0);

  if (urgent.length === 0) {
    return NextResponse.json({ ok: true, status: "no_urgent", checked: sync.accounts?.length ?? 0 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      status: "dry_run",
      count: urgent.length,
      preview: urgent.map((x) => buildMessage(x.account.clientName, x.reasons)),
    });
  }

  // Envia 1 msg por conta urgente, com dedup por (conta, dia). A linha do log é a RESERVA, gravada antes
  // de enviar (auditoria 9.8): duas rodadas juntas não mandam em dobro, e insert que falhava depois do
  // envio não faz mais o aviso repetir. force=1 usa uma chave própria (reenvio consciente, mas registrado).
  let sent = 0, skipped = 0, failed = 0, incertos = 0;
  const erros: string[] = [];
  for (const { account, reasons } of urgent) {
    const cycleKey = `urgent|${account.metaAccountId}|${dateKey}${force ? `|forcado|${Date.now()}` : ""}`;
    const reserva = await reservarAviso({
      ad_account_id: account.adAccountId as string,
      balance_at_trigger: account.available ?? 0,
      channel: "whatsapp_group",
      cycle_key: cycleKey,
      sent_at: new Date().toISOString(),
    });
    if (reserva === "ja-avisado") { skipped++; continue; }
    if (reserva === "erro") { failed++; erros.push(`${account.clientName}: não consegui registrar o aviso (não enviei para não repetir)`); continue; }
    const res = await sendGroupText(settings.groupJid, buildMessage(account.clientName, reasons));
    if (res.ok) sent++;
    else if (res.incerto) { incertos++; erros.push(`${account.clientName}: ${res.error ?? "sem resposta"} — pode ter saído, não reenviei`); }
    else { failed++; erros.push(`${account.clientName}: ${res.error ?? "falhou"}`); await devolverReserva(cycleKey); }
    await sleep(1200);
  }

  // ok só quando tudo o que devia sair saiu (já avisado hoje não é falha).
  const ok = failed === 0 && incertos === 0;
  return NextResponse.json({
    ok, status: "sent", urgent: urgent.length, sent, skipped, failed, incertos,
    ...(erros.length ? { erro: erros.slice(0, 5).join("; "), erros } : {}),
  });
}
