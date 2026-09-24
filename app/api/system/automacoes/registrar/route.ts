export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { gravarExecucao, podeRodarJob } from "@/lib/automacoes/painel";
import { okDaResposta } from "@/lib/automacoes/saude";

const JOB_VALIDO = /^[a-z0-9][a-z0-9/_-]{0,79}$/;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const data = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

// POST /api/system/automacoes/registrar — o cron-call.sh conta como foi cada execução.
// Body: {job, started_at, duration_ms, http_status, resumo, corpo_ok?, skipped?}
// ok = HTTP 2xx e corpo sem {"ok":false} (corpo_ok vem do corpo inteiro, lido no shell).
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const job = typeof b.job === "string" ? b.job.trim() : "";
  if (!JOB_VALIDO.test(job)) return NextResponse.json({ error: "job inválido" }, { status: 400 });

  const skipped = b.skipped === true;
  const httpStatus = num(b.http_status);
  let resumo = typeof b.resumo === "string" ? b.resumo.slice(0, 300) : null;
  if (skipped && !resumo) {
    const p = await podeRodarJob(job).catch(() => null);
    resumo = `pulado: ${p?.motivo ?? "desligado na Central de Automações"}`;
  }
  const corpoOk = typeof b.corpo_ok === "boolean" ? b.corpo_ok : null;

  try {
    await gravarExecucao({
      job,
      started_at: data(b.started_at),
      duration_ms: num(b.duration_ms),
      http_status: httpStatus,
      ok: skipped ? null : okDaResposta(httpStatus, resumo, corpoOk),
      skipped,
      resumo,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[automacoes/registrar]", job, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
