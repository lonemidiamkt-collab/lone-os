export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { gerarParaCache } from "@/lib/portal/snapshotCache";
import type { PeriodKind } from "@/lib/portal/types";

const PERIODS: PeriodKind[] = ["last_week", "last_2_weeks", "this_month", "last_month"];

// Mesmas regras da visita (lib/portal/snapshotCache.ts → gerarParaCache): o que sai pela metade é
// tentado de novo e não apaga um painel completo. Antes daqui saía gravado tudo que não fosse
// "indisponível" — em 29/10/2026, 18 painéis pela metade valeram o dia inteiro.
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const { data: clients, error } = await supabaseAdmin
    .from("clients")
    .select("id, nome_fantasia, name")
    .eq("public_report_enabled", true)
    .is("public_report_token_revoked_at", null);
  if (error) return NextResponse.json({ ok: false, error: `Não consegui ler os clientes (${error.message}).` }, { status: 500 });

  if (!clients || clients.length === 0) {
    return NextResponse.json({ clients_processed: 0, snapshots_generated: 0, errors: [] });
  }

  const lista = (clients as Array<{ id: string; nome_fantasia?: string; name: string }>).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.name }));
  const itens = await gerarParaCache(lista, () => PERIODS, new Date());

  for (const i of itens) {
    if (i.resultado === "erro") console.error(`[warmup-snapshots] ${i.cliente} / ${i.periodo}: ${i.erro}`);
  }
  const conta = (r: string) => itens.filter((i) => i.resultado === r).length;

  return NextResponse.json({
    clients_processed: lista.length,
    snapshots_generated: itens.filter((i) => i.gravado).length,
    snapshots_failed: conta("indisponivel") + conta("erro"),
    completos: conta("completo"),
    incompletos: conta("incompleto"),
    repetidos: itens.filter((i) => i.tentativas > 1).length,
    log: itens.filter((i) => i.resultado !== "completo").map((i) => ({
      client: i.cliente, period: i.periodo, status: i.resultado, tentativas: i.tentativas, gravado: i.gravado, error: i.erro,
    })),
  });
}
