export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { comExecucao } from "@/lib/obs/correlacao";
import { recalcular } from "@/lib/priority/repo";

// Recalcula o feed de recomendações (Fase 1): lê as fontes, ranqueia, reconcilia com o que está
// aberto. Cron de hora em hora + botão em /agente. Idempotente: rodar duas vezes seguidas muda nada.
export async function POST(req: NextRequest) {
  const gate = await requireCronOrUser(req);
  if (gate) return gate;
  return comExecucao({ origem: "cron:priority-recalcular", ator: "cron" }, async () => {
    try {
      const r = await recalcular();
      console.log(`[priority] coletados=${r.coletados} válidos=${r.validos} +${r.inseridas} ~${r.atualizadas} ✓${r.resolvidas}${r.erros.length ? ` erros=${r.erros.length}` : ""}`);
      return NextResponse.json({ ok: true, ...r });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[priority] recalcular falhou:", msg);
      return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
    }
  });
}

export const GET = POST;
