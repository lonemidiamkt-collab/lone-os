// POST /api/system/check-meta-token
//
// Cron endpoint — verificar diariamente se o token Meta está prestes a expirar.
// Sugestão de crontab (adicionar em /etc/cron.d/loneos ou crontab -e no VPS):
//   0 8 * * * curl -s -X POST https://painel.lonemidia.com/api/system/check-meta-token \
//     -H "Authorization: Bearer $CRON_SECRET" >> /var/log/loneos-crons.log 2>&1
//
// Comportamento por janela de expiração:
//   ≤14 dias → notification priority=high
//   ≤7 dias  → notification priority=urgent + email para admin
//   ≤1 dia ou expirado → notification priority=urgent + email + flag meta_token_critical=true
//
// Idempotente: não cria notificação duplicada no mesmo dia (checa created_at).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";

function daysUntil(expiresAtMs: number): number {
  return Math.floor((expiresAtMs - Date.now()) / 86_400_000);
}

export async function POST() {
  try {
    // 1. Ler token e data de expiração
    const { data: settings } = await supabaseAdmin
      .from("agency_settings")
      .select("key, value")
      .in("key", ["meta_token", "meta_token_expires_at"]);

    const map = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const token = map.get("meta_token");
    const expiresAtRaw = map.get("meta_token_expires_at");

    if (!token) {
      return NextResponse.json({ ok: false, message: "Token Meta não configurado" });
    }

    if (!expiresAtRaw) {
      return NextResponse.json({ ok: true, message: "Token sem data de expiração registrada" });
    }

    const expiresAtMs = parseInt(expiresAtRaw, 10);
    const days = daysUntil(expiresAtMs);

    // Sem urgência
    if (days > 14) {
      // Limpar flag crítica se existia
      await supabaseAdmin
        .from("agency_settings")
        .upsert({ key: "meta_token_critical", value: "false" }, { onConflict: "key" });
      return NextResponse.json({ ok: true, days, message: "Token OK" });
    }

    // 2. Verificar se já criamos notificação hoje (idempotência)
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("type", "system")
      .ilike("title", "%token Meta%")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);

    const alreadyNotified = (existing?.length ?? 0) > 0;

    // 3. Determinar severidade e ações
    const isCritical = days <= 1;
    const isUrgent   = days <= 7;
    const priority   = isCritical || isUrgent ? "urgent" : "high";

    const expiresLabel = days < 0
      ? "expirado"
      : days === 0
      ? "expira hoje"
      : `expira em ${days} dia${days === 1 ? "" : "s"}`;

    const title = `Token Meta ${expiresLabel}`;
    const body  = `O token de integração com o Meta Ads ${expiresLabel}. Acesse /integrations para renovar antes que as sincronizações parem.`;

    // 4. Criar notificação (se não existir hoje)
    if (!alreadyNotified) {
      const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString(); // notificação some em 7 dias
      await supabaseAdmin.from("notifications").insert({
        type:       "system",
        title,
        body,
        priority,
        expires_at: expiresAt,
        read:       false,
      });
    }

    // 5. Email para admin (≤7 dias, 1 vez por dia)
    if (isUrgent && !alreadyNotified) {
      await sendEmail({
        to:           ADMIN_EMAIL,
        subject:      `[Lone OS] ⚠️ Token Meta ${expiresLabel}`,
        html: `<p>Olá,</p>
               <p>O token de integração com o Meta Ads <strong>${expiresLabel}</strong>.</p>
               <p>Acesse <a href="https://painel.lonemidia.com/integrations">painel.lonemidia.com/integrations</a> para renovar.</p>
               <p>Se o token expirar, todas as sincronizações de saldo e relatórios de tráfego pararão de funcionar.</p>`,
        templateName: "meta-token-alert",
        toName:       "Roberto Lino",
      }).catch((e) => console.error("[check-meta-token] email error:", e));
    }

    // 6. Marcar flag crítica no DB (≤1 dia ou expirado)
    if (isCritical) {
      await supabaseAdmin
        .from("agency_settings")
        .upsert({ key: "meta_token_critical", value: "true" }, { onConflict: "key" });
    } else {
      await supabaseAdmin
        .from("agency_settings")
        .upsert({ key: "meta_token_critical", value: "false" }, { onConflict: "key" });
    }

    return NextResponse.json({
      ok:       true,
      days,
      priority,
      critical: isCritical,
      notified: !alreadyNotified,
    });
  } catch (err) {
    console.error("[check-meta-token] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
