export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { podeRodarJob } from "@/lib/automacoes/painel";
import { automacaoPorId } from "@/lib/automacoes/registro";
import { reservarExecucao } from "@/lib/automacoes/trava-execucao";

// GET /api/system/automacoes/pode-rodar?job=<id> — o portão do cron-call.sh.
// Sem linha em automation_settings = pode.
//
// Resposta: { rodar, motivo?, ligado, cliente }
//   · `ligado` = o que está configurado na Central (o cron-call.sh guarda este último estado conhecido);
//   · `cliente` = o job fala com cliente.
//
// 25/10/2026 (auditoria de erro recuperável):
//   10.5 — erro de banco aqui devolvia `rodar: true`: um job de cliente DESLIGADO por incidente saía igual se o
//          banco piscasse. Agora devolve `rodar: null, indisponivel: true` e o cron-call.sh decide pelo último
//          estado que guardou (desligado continua desligado; ligado roda). Sem estado guardado, roda como antes.
//   10.3 — ligado, o portão RESERVA o job (a mesma trava do "Rodar agora" da Central): se já estiver rodando,
//          pula com o motivo. O registro do fim (automacoes/registrar) solta a reserva.
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const job = (req.nextUrl.searchParams.get("job") || "").trim();
  if (!job) return NextResponse.json({ error: "job obrigatório" }, { status: 400 });
  const cliente = automacaoPorId(job)?.enviaParaCliente === true;

  let p: Awaited<ReturnType<typeof podeRodarJob>>;
  try {
    p = await podeRodarJob(job);
  } catch (e) {
    console.error("[automacoes/pode-rodar]", job, e instanceof Error ? e.message : e);
    return NextResponse.json({
      rodar: null, indisponivel: true, ligado: null, cliente,
      motivo: "configuração indisponível — vale o último estado conhecido",
    });
  }
  if (!p.rodar) return NextResponse.json({ ...p, ligado: false, cliente });

  const reserva = await reservarExecucao(job);
  if (!reserva.conseguiu) {
    return NextResponse.json({ rodar: false, ligado: true, cliente, motivo: `já está rodando (${reserva.motivo ?? "outra execução em andamento"})` });
  }
  return NextResponse.json({ rodar: true, ligado: true, cliente });
}
