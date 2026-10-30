export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { gerarParaCache } from "@/lib/portal/snapshotCache";
import type { PeriodKind } from "@/lib/portal/types";

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
  const periodos: PeriodKind[] = isFirstOfMonth ? ["last_week", "last_month"] : ["last_week"];

  // A Meta não respondeu: NÃO grava. Antes o zero era gravado por cima do dado bom do dia anterior —
  // em 19/07 e 10/08 isso apagou o painel dos 22/25 clientes de uma vez, e o cron ainda respondeu
  // "errors: 0". Painel pela metade também não apaga um completo (29/10/2026). As regras moram em
  // gerarParaCache, as mesmas da visita e do warmup-snapshots.
  Sentry.setTag("cron_endpoint", "true");
  const lista = (clients as Array<{ id: string; nome_fantasia?: string; name: string }>).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.name }));
  const itens = await gerarParaCache(lista, () => periodos, now);

  const generated = itens.filter((i) => i.gravado).length;
  const rotulo = (i: { cliente: string; periodo: PeriodKind }) => (i.periodo === "last_month" ? `${i.cliente} (mês passado)` : i.cliente);
  const indisponiveis = itens.filter((i) => i.resultado === "indisponivel").map(rotulo);
  const errors = itens.filter((i) => i.resultado === "erro").map((i) => `${rotulo(i)}: ${i.erro}`);
  for (const e of errors) console.error("[generate-snapshots]", e);

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
    incompletos: itens.filter((i) => i.resultado === "incompleto").length,
    details: [...errors, ...indisponiveis.map((n) => `${n}: Meta indisponível`)],
  });
}
