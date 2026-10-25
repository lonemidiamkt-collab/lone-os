// app/api/system/alarmes-trafego/route.ts — os dois alarmes de tráfego, de 2 em 2 h (cron-only).
//
//   • "Gastou sem conversa": campanhas de mensagem gastando sem receber conversa (o caso da Reformar, 22–25/10/2026:
//     R$ 497 sem uma conversa, número errado no encarte, ninguém avisado).
//   • Verba do mês acabando em até 3 dias, ou já acabada.
// Regras e calibragem: lib/traffic/alarmes/sem-conversa.ts e ritmo-verba.ts. A rodada: lib/traffic/alarmes/servidor.ts.
// Só grupo de tráfego (interno) e a voz de quem cuida da conta. Nunca grupo de cliente.
//
//   ?dry=1 → lê a Meta e devolve o que sairia (textos e contas), sem gravar nem enviar.
//
// Cron: `5 11-23/2 * * *` (8h05 às 20h05 BRT, 5 min depois da leitura de saldo).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { rodarAlarmes } from "@/lib/traffic/alarmes/servidor";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  try {
    const r = await rodarAlarmes({ dry });
    console.log(`[alarmes-trafego] contas=${r.contas} lidas=${r.lidas} sem_conversa=${r.semConversa.length} ritmo=${r.ritmo.length} fechados=${r.fechados.length} dry=${dry} erros=${r.erros.length}`);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (err) {
    console.error("[alarmes-trafego] falhou:", String(err));
    return NextResponse.json({ ok: false, dry, error: String(err).slice(0, 300) }, { status: 500 });
  }
}
