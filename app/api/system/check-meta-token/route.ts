// POST /api/system/check-meta-token
//
// Cron diário — confere se o token da Meta FUNCIONA (chamada real à Graph API) e se está perto de vencer.
// Sugestão de crontab (adicionar em /etc/cron.d/loneos ou crontab -e no VPS):
//   0 8 * * * curl -s -X POST https://painel.lonemidia.com/api/system/check-meta-token \
//     -H "Authorization: Bearer $CRON_SECRET" >> /var/log/loneos-crons.log 2>&1
//
// 24/10/2026 (auditoria 5.14): antes só olhava a data gravada e respondia `ok: true` com token vencido, revogado ou
// sem data. A decisão agora mora em lib/meta/conferir-token.ts:
//   token funcionando e longe de vencer → ok
//   funcionando e vence em ≤14 dias → ok + aviso (≤7 dias: urgente + e-mail; ≤1 dia: banner crítico)
//   vencido, recusado pela Meta ou sem token → ok:false + aviso urgente + e-mail + banner crítico
//   não deu para conferir (Meta fora, rede) → ok:false com o motivo (o banner só liga se a data já está no fim)
//
// Idempotente: não cria notificação duplicada no mesmo dia (checa created_at).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { requireCron } from "@/lib/api/cron-guard";
import { avaliarToken, perguntarAGraph } from "@/lib/meta/conferir-token";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    // 1. Ler token e data de expiração. Leitura que falha não é "sem token": é falha da rotina.
    const { data: settings, error: errSettings } = await supabaseAdmin
      .from("agency_settings")
      .select("key, value")
      .in("key", ["meta_token", "meta_token_expires_at"]);
    if (errSettings) return NextResponse.json({ ok: false, error: `não li o token: ${errSettings.message}` }, { status: 500 });

    const map = new Map((settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const token = map.get("meta_token");
    const expiresAtRaw = map.get("meta_token_expires_at");
    const expiraEmMs = expiresAtRaw ? parseInt(expiresAtRaw, 10) : null;

    // 2. A pergunta de verdade: a Meta aceita este token?
    const graph = token ? await perguntarAGraph(token) : null;
    const av = avaliarToken({ temToken: !!token, expiraEmMs, graph, agoraMs: Date.now() });

    // 3. Banner crítico do painel (SystemAlertBanner lê meta_token_critical).
    const { error: errFlag } = await supabaseAdmin
      .from("agency_settings")
      .upsert({ key: "meta_token_critical", value: av.critico ? "true" : "false" }, { onConflict: "key" });
    if (errFlag) console.error("[check-meta-token] flag crítica não gravada:", errFlag.message);

    let notified = false;
    if (av.avisar) {
      // 4. Uma notificação por dia (idempotência).
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("type", "system")
        .ilike("title", "%token Meta%")
        .gte("created_at", `${today}T00:00:00Z`)
        .limit(1);
      const alreadyNotified = (existing?.length ?? 0) > 0;
      const body = `${av.motivo} Renove em Sistema › Conexão Meta (/conexao-meta) antes que as sincronizações parem.`;

      if (!alreadyNotified) {
        // `priority` e `expires_at` não existem em notifications (24/10/2026): o insert falhava calado e o
        // aviso de token vencendo nunca chegou ao sino. A prioridade vai no título; o aviso some ao ser lido.
        const { error: errNotif } = await supabaseAdmin.from("notifications").insert({
          type: "system", title: av.prioridade === "urgent" ? `⚠️ ${av.titulo}` : av.titulo, body, read: false,
        });
        if (errNotif) console.error("[check-meta-token] aviso não gravado:", errNotif.message);
        notified = !errNotif;
      }

      // 5. E-mail para o admin (urgente, 1 vez por dia).
      if (av.prioridade === "urgent" && !alreadyNotified) {
        await sendEmail({
          to:           ADMIN_EMAIL,
          subject:      `[Lone OS] ⚠️ ${av.titulo}`,
          html: `<p>Olá,</p>
                 <p>${av.motivo}</p>
                 <p>Renove em Sistema › Conexão Meta: <a href="https://painel.lonemidia.com/conexao-meta">painel.lonemidia.com/conexao-meta</a>.</p>
                 <p>Sem um token válido, as sincronizações de saldo e os relatórios de tráfego param de funcionar.</p>`,
          templateName: "meta-token-alert",
          toName:       "Roberto Lino",
        }).catch((e) => console.error("[check-meta-token] email error:", e));
      }
    }

    return NextResponse.json({
      ok:       av.ok,
      ...(av.ok ? {} : { error: av.motivo }),
      message:  av.motivo,
      days:     av.dias,
      graph:    graph?.tipo ?? "sem_token",
      priority: av.prioridade,
      critical: av.critico,
      notified,
    });
  } catch (err) {
    console.error("[check-meta-token] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
