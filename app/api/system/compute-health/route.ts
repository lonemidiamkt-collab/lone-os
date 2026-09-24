export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";

/**
 * POST /api/system/compute-health — DESLIGADO.
 *
 * Gravava client_health_scores e clients.current_health_* com a escala INVERTIDA (100 = risco), nas
 * mesmas linhas que /api/scores?gravar=1 grava às 06:20 com 100 = saudável. Quem lia de manhã via
 * uma escala, quem lia à tarde via a outra. O escritor único agora é /api/scores (lib/scores/health.ts).
 * Fica respondendo ok para a linha do crontab não virar erro até ser removida.
 */
export async function POST(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, skipped: "substituído por /api/scores" });
}
