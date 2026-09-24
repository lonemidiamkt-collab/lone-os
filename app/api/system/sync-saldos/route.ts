// app/api/system/sync-saldos/route.ts — conferência de saldo a cada 2h (cron-only).
//
// Faz o MESMO que o POST /api/traffic/sync-balances (lib/traffic/sync-core.ts): lê saldos e gasto na
// Meta, grava em ad_accounts e dispara o alerta em tempo real de conta que cruzou o limite. O
// anti-spam já mora lá: no máximo UM aviso por (conta, severidade, dia BRT) — rodar de 2 em 2h só
// antecipa o aviso, não o repete. Cliente pausado não sincroniza nem alerta.
//
//   ?dry=1 → sincroniza (grava saldos) mas NÃO envia alerta; devolve os que sairiam agora.
//
// Cron: `0 11-23/2 * * *` (8h às 20h BRT, de 2 em 2h).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { runBalanceSync, getAlertSettings, alertasPendentes } from "@/lib/traffic/sync-core";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  try {
    const settings = await getAlertSettings();
    const r = await runBalanceSync({ settings, dispatchRealtimeAlerts: !dry });
    if (r.tokenMissing) {
      return NextResponse.json({ ok: false, dry, error: "Meta token não configurado ou expirado" }, { status: 400 });
    }

    const emAlerta = r.accounts
      .filter((a) => a.alert.severity === "critical" || a.alert.severity === "warning")
      .map((a) => ({
        cliente: a.clientName, severidade: a.alert.severity, motivo: a.alert.reason,
        dias: a.daysRemaining != null ? Number(a.daysRemaining.toFixed(1)) : null,
      }));
    const comErro = r.accounts.filter((a) => a.alert.severity === "error").map((a) => a.clientName);

    // No dry, os alertas que o envio real mandaria agora (já descontado o que foi avisado hoje).
    const sairiam = dry
      ? (await alertasPendentes(r.accounts, settings, r.syncedAt)).map((a) => ({
          cliente: a.snap.clientName, severidade: a.severidade, texto: a.texto,
        }))
      : undefined;

    console.log(`[sync-saldos] synced=${r.synced}/${r.total} erros=${r.errors} em_alerta=${emAlerta.length} enviados=${r.alertsDispatched} dry=${dry}`);
    return NextResponse.json({
      ok: true, dry,
      synced: r.synced, errors: r.errors, total: r.total, synced_at: r.syncedAt,
      alertas_ligados: settings.enabled && !!settings.groupJid,
      alertas_enviados: r.alertsDispatched,
      em_alerta: emAlerta,
      com_erro: comErro,
      ...(sairiam ? { alertas_que_sairiam: sairiam } : {}),
    });
  } catch (err) {
    console.error("[sync-saldos] falhou:", String(err));
    return NextResponse.json({ ok: false, dry, error: String(err).slice(0, 300) }, { status: 500 });
  }
}
