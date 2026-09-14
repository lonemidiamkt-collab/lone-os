// lib/fila/worker.ts — o processo que consome a fila. Fase 0B.
//
// Roda DENTRO do servidor Next (instrumentation.ts) quando WORKER_ENABLED=true — mesmo código,
// mesmo .env, sem container novo para manter. Se um dia precisar isolar, scripts/worker.ts sobe
// a mesma função sozinha. Rollback: WORKER_ENABLED vazio → nada liga; os crons seguem como estão.
//
// O que ele faz, em ordem: conecta no Postgres direto → sobe o pg-boss (cria o schema `pgboss` na
// primeira vez) → declara filas + dead-letters → registra consumidores → a cada 5s leva o outbox
// para a fila (relay). Cada consumidor é idempotente e roda numa execução própria (agent_runs).

import { bancoDireto, fecharBanco, temBanco } from "./db";
import { iniciarBoss, pararBoss } from "./boss";
import { relayOutbox } from "./outbox";
import { consumirContentCardCreated } from "./consumidores/aviso-demanda";

let ligadoDesde: number | null = null;
let relayTimer: NodeJS.Timeout | null = null;
let relayRodando = false;

export function estadoWorker(): { ligado: boolean; desde: string | null } {
  return { ligado: ligadoDesde !== null, desde: ligadoDesde ? new Date(ligadoDesde).toISOString() : null };
}

export async function iniciarWorker(): Promise<{ ok: boolean; motivo?: string }> {
  if (ligadoDesde) return { ok: true, motivo: "já ligado" };
  if (!temBanco()) return { ok: false, motivo: "DATABASE_URL ausente — fila desligada" };
  const url = process.env.DATABASE_URL as string;
  try {
    const pool = bancoDireto();
    await pool.query("select 1"); // falha aqui, falha cedo, com a mensagem certa
    const boss = await iniciarBoss(url);

    await boss.work("content_card.created", { batchSize: 1, pollingIntervalSeconds: 5 }, consumirContentCardCreated);

    const volta = async () => {
      if (relayRodando) return;
      relayRodando = true;
      try {
        const r = await relayOutbox(pool, boss);
        if (r.publicadas || r.falhas) console.log(`[fila] relay: ${r.publicadas} publicadas, ${r.falhas} falhas`);
      } catch (err) {
        console.error("[fila] relay falhou:", err instanceof Error ? err.message : err);
      } finally {
        relayRodando = false;
      }
    };
    relayTimer = setInterval(() => { void volta(); }, 5_000);
    relayTimer.unref?.();
    void volta();

    ligadoDesde = Date.now();
    console.log("[fila] worker ligado (pg-boss + relay do outbox)");
    return { ok: true };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error("[fila] worker NÃO ligou:", motivo);
    await pararWorker().catch(() => {});
    return { ok: false, motivo };
  }
}

export async function pararWorker(): Promise<void> {
  if (relayTimer) { clearInterval(relayTimer); relayTimer = null; }
  await pararBoss();
  await fecharBanco();
  ligadoDesde = null;
}
