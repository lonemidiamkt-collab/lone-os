export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildSnapshot } from "@/lib/portal/buildSnapshot";

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, nome_fantasia, name")
    .eq("public_report_enabled", true)
    .is("public_report_token_revoked_at", null);

  if (!clients || clients.length === 0) {
    return NextResponse.json({ generated: 0, errors: 0 });
  }

  const now = new Date();
  const isFirstOfMonth = now.getDate() === 1;

  let generated = 0;
  const errors: string[] = [];
  const indisponiveis: string[] = [];

  for (const c of clients as Array<{ id: string; nome_fantasia?: string; name: string }>) {
    const clientName = c.nome_fantasia || c.name;
    try {
      Sentry.setContext("snapshot_client", { client_id: c.id, client_name: clientName });
      Sentry.setTag("cron_endpoint", "true");
      const snap = await buildSnapshot({ clientId: c.id, periodKind: "last_week", now });

      // A Meta não respondeu: PULA a gravação. Antes o zero era gravado por cima do dado bom do
      // dia anterior — em 19/07 e 10/08 isso apagou o painel dos 22/25 clientes de uma vez, e o
      // cron ainda respondeu "errors: 0". Preservar o dado velho é sempre melhor que zerar.
      if (snap.ads_status === "indisponivel") {
        indisponiveis.push(clientName);
        continue;
      }

      await supabaseAdmin
        .from("client_report_snapshots")
        .upsert(
          {
            client_id: c.id,
            period_kind: "last_week",
            period_start: snap.period.start,
            period_end: snap.period.end,
            data: snap,
            generated_at: now.toISOString(),
          },
          { onConflict: "client_id,period_kind,period_start" },
        );
      generated++;

      if (isFirstOfMonth) {
        const snapMonth = await buildSnapshot({ clientId: c.id, periodKind: "last_month", now });
        if (snapMonth.ads_status === "indisponivel") {
          indisponiveis.push(`${clientName} (mês passado)`);
          continue;
        }
        await supabaseAdmin
          .from("client_report_snapshots")
          .upsert(
            {
              client_id: c.id,
              period_kind: "last_month",
              period_start: snapMonth.period.start,
              period_end: snapMonth.period.end,
              data: snapMonth,
              generated_at: now.toISOString(),
            },
            { onConflict: "client_id,period_kind,period_start" },
          );
        generated++;
      }
    } catch (err) {
      const msg = `${clientName}: ${String(err)}`;
      errors.push(msg);
      console.error("[generate-snapshots]", msg);
    }
  }

  // Avisa o time. Sem isto a falha era invisível: o cron respondia HTTP 200 / "errors: 0" mesmo
  // tendo zerado todo mundo, e a gente só descobria quando um cliente reclamava do link.
  const falhou = indisponiveis.length + errors.length;
  if (falhou > 0) {
    try {
      const jid = process.env.CS_INTERNAL_GROUP_JID || "";
      if (jid) {
        const { sendText } = await import("@/lib/whatsapp/evolution");
        const nomes = [...indisponiveis, ...errors.map((e) => e.split(":")[0])].slice(0, 12);
        const total = clients.length;
        const linhas = [
          falhou >= total
            ? `🔴 *Painel de resultados: a Meta não respondeu pra NENHUM cliente* (${falhou}/${total}).`
            : `⚠️ *Painel de resultados: ${falhou} de ${total} clientes sem dado novo hoje.*`,
          "",
          `Clientes: ${nomes.join(", ")}${falhou > nomes.length ? ` e mais ${falhou - nomes.length}` : ""}`,
          "",
          "O link do cliente segue no ar com o último resultado bom — não zerou. Vou tentar de novo amanhã de manhã.",
        ];
        await sendText(jid, linhas.join("\n"));
      }
    } catch (err) {
      console.error("[generate-snapshots] falhou o aviso no grupo:", String(err));
    }
  }

  return NextResponse.json({
    generated,
    errors: errors.length,
    unavailable: indisponiveis.length,
    details: [...errors, ...indisponiveis.map((n) => `${n}: Meta indisponível`)],
  });
}
