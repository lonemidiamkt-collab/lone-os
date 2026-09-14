export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { isCronRequest } from "@/lib/api/cron-guard";
import { temBanco, bancoDireto } from "@/lib/fila/db";
import { estadoOutbox } from "@/lib/fila/outbox";
import { estadoWorker } from "@/lib/fila/worker";
import { FILAS, dlqDe } from "@/lib/fila/boss";

// GET /api/system/fila — a fila vista de fora: worker ligado?, outbox pendente/preso, jobs por
// estado em cada fila, e as últimas falhas (com erro) — inclusive o que caiu na dead-letter.
// "Retry e dead-letter visíveis" é critério de aceite da Fase 0B; log de container não conta.

interface LinhaFila { name: string; state: string; n: string }
interface Falha { id: string; name: string; state: string; retry_count: number; created_on: string; completed_on: string | null; erro: string | null; data: Record<string, unknown> }

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    const gate = await requireRole(req, GESTAO);
    if (gate instanceof NextResponse) return gate;
  }
  const worker = estadoWorker();
  if (!temBanco()) return NextResponse.json({ worker, banco: false, motivo: "DATABASE_URL ausente — fila desligada" });

  try {
    const pool = bancoDireto();
    const outbox = await estadoOutbox(pool);
    const { rows: existe } = await pool.query(`select 1 from pg_namespace where nspname = 'pgboss'`);
    if (!existe.length) return NextResponse.json({ worker, banco: true, outbox, filas: [], motivo: "schema pgboss ainda não criado (worker nunca subiu)" });

    // O worker vive no bundle do instrumentation.ts; esta rota é outro bundle, com outra cópia do
    // módulo — estadoWorker() daqui não vê o de lá. A prova de vida vem do banco: o pg-boss carimba
    // monitored_on a cada monitorStateIntervalSeconds (60s) enquanto está de pé.
    const { rows: [vida] } = await pool.query<{ monitored_on: string | null; maintained_on: string | null; vivo: boolean }>(
      `select monitored_on::text, maintained_on::text, coalesce(greatest(monitored_on, maintained_on) > now() - interval '3 minutes', false) as vivo from pgboss.version limit 1`);
    const workerVivo = { ligado: worker.ligado || !!vida?.vivo, ultimoSinal: vida?.monitored_on ?? vida?.maintained_on ?? null, desde: worker.desde };

    const { rows } = await pool.query<LinhaFila>(`select name, state, count(*)::text as n from pgboss.job group by 1, 2`);
    const porFila: Record<string, Record<string, number>> = {};
    for (const nome of Object.keys(FILAS)) { porFila[nome] = {}; porFila[dlqDe(nome)] = {}; }
    for (const r of rows) { porFila[r.name] ??= {}; porFila[r.name][r.state] = Number(r.n); }
    const filas = Object.entries(porFila).map(([nome, estados]) => ({
      nome, dlq: nome.endsWith(".dlq"),
      created: estados.created ?? 0, retry: estados.retry ?? 0, active: estados.active ?? 0,
      completed: estados.completed ?? 0, failed: estados.failed ?? 0, cancelled: estados.cancelled ?? 0,
    }));

    const { rows: falhas } = await pool.query<Falha>(
      `select id, name, state, retry_count, created_on::text, completed_on::text,
              coalesce(output->>'message', output::text) as erro, data
         from pgboss.job
        where state in ('failed','retry') or name like '%.dlq'
        order by coalesce(completed_on, created_on) desc
        limit 20`);

    return NextResponse.json({ worker: workerVivo, banco: true, outbox, filas, ultimasFalhas: falhas });
  } catch (err) {
    return NextResponse.json({ worker, banco: true, erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
