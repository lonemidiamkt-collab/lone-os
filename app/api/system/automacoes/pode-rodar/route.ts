export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { podeRodarJob } from "@/lib/automacoes/painel";

// GET /api/system/automacoes/pode-rodar?job=<id> — o portão do cron-call.sh.
// Sem linha em automation_settings = pode. Erro de banco também = pode: a Central fora do ar
// nunca pode parar os jobs (o cron-call.sh também segue rodando se esta rota não responder).
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const job = (req.nextUrl.searchParams.get("job") || "").trim();
  if (!job) return NextResponse.json({ error: "job obrigatório" }, { status: 400 });
  try {
    return NextResponse.json(await podeRodarJob(job));
  } catch (e) {
    console.error("[automacoes/pode-rodar]", job, e instanceof Error ? e.message : e);
    return NextResponse.json({ rodar: true, motivo: "configuração indisponível — rodando por segurança" });
  }
}
