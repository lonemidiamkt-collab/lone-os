import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import PgBoss from "pg-boss";

// INTEGRAÇÃO — Postgres de verdade (docker local ou CI). Sem FILA_TEST_DATABASE_URL, pula.
// Prova os critérios de aceite da Fase 0B:
//   1. o INSERT no card gera o evento na mesma transação (trigger → outbox)
//   2. o relay leva para a fila; evento publicado aparece processado
//   3. falha → retry com backoff; estourou → dead-letter visível
//   4. duplicata do relay (mesmo outbox id) não vira dois jobs
const URL = process.env.FILA_TEST_DATABASE_URL;
const so = URL ? describe : describe.skip;

const { iniciarBoss, pararBoss, dlqDe } = await import("@/lib/fila/boss");
const { relayOutbox, estadoOutbox } = await import("@/lib/fila/outbox");

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ate<T>(fn: () => Promise<T | null | undefined>, ms = 15_000): Promise<T> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { const v = await fn(); if (v) return v; await espera(250); }
  throw new Error("timeout esperando condição");
}

so("fila: outbox → pg-boss → consumidor", () => {
  let pool: Pool; let boss: PgBoss;
  beforeAll(async () => {
    pool = new Pool({ connectionString: URL, max: 3 });
    await pool.query(`drop schema if exists pgboss cascade; drop table if exists public.outbox; drop table if exists public.content_cards;`);
    await pool.query(`create table public.content_cards (id uuid primary key default gen_random_uuid(), client_id uuid, client_name text, title text, social_media text, requested_by_traffic text, due_date date, status text, created_at timestamptz default now())`);
    const mig = (await import("node:fs")).readFileSync("supabase/migrations/20260914090000_outbox_e_fila.sql", "utf8")
      .replace(/alter table public\.cs_outbound[^;]*;/g, "").replace(/create index if not exists idx_cs_outbound_idem[^;]*;/g, "")
      .replace(/drop trigger if exists outbox_design_requests[^;]*;/g, "").replace(/create trigger outbox_design_requests[\s\S]*?;/g, "")
      .replace(/notify pgrst[^;]*;/g, "");
    await pool.query(mig);
    boss = await iniciarBoss(URL!);
    // retry rápido no teste; em produção é 30s com backoff
    await boss.updateQueue("content_card.created", { name: "content_card.created", policy: "stately", retryLimit: 2, retryDelay: 1, retryBackoff: false, expireInSeconds: 60 });
  }, 60_000);
  afterAll(async () => { await pararBoss(); await pool.end(); });

  it("1. INSERT no card grava o evento na mesma transação, com o correlation_id do header", async () => {
    const cli = await pool.connect();
    try {
      await cli.query("begin");
      await cli.query(`select set_config('request.headers', '{"x-correlation-id":"22222222-2222-4222-8222-222222222222"}', true)`);
      await cli.query(`insert into content_cards (client_name, title, requested_by_traffic) values ('Quero Tintas', 'Post teste', '🤖 Agente CS')`);
      await cli.query("commit");
    } finally { cli.release(); }
    const { rows } = await pool.query(`select evento, payload, correlation_id from outbox`);
    expect(rows).toHaveLength(1);
    expect(rows[0].evento).toBe("content_card.created");
    expect(rows[0].payload.title).toBe("Post teste");
    expect(rows[0].correlation_id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("2. relay publica e marca; o job chega ao consumidor com o payload", async () => {
    const recebidos: Record<string, unknown>[] = [];
    await boss.work("content_card.created", { pollingIntervalSeconds: 0.5 }, async (jobs) => { for (const j of jobs) recebidos.push(j.data as Record<string, unknown>); });
    const r = await relayOutbox(pool, boss, { atrasoSegundos: 0 });
    expect(r).toEqual({ publicadas: 1, falhas: 0 });
    expect((await estadoOutbox(pool)).pendentes).toBe(0);
    const j = await ate(async () => recebidos[0]);
    expect(j.title).toBe("Post teste");
    expect(j.correlationId).toBe("22222222-2222-4222-8222-222222222222");
    expect(typeof j.outboxId).toBe("string");
    await boss.offWork("content_card.created");
  });

  it("3. consumidor que falha: retry, e depois dead-letter visível", async () => {
    let tentativas = 0;
    await boss.work("content_card.created", { pollingIntervalSeconds: 0.5 }, async () => { tentativas++; throw new Error("WhatsApp fora"); });
    await pool.query(`insert into content_cards (client_name, title, requested_by_traffic) values ('X', 'Vai falhar', '🤖 Agente CS')`);
    await relayOutbox(pool, boss, { atrasoSegundos: 0 });
    const naDlq = await ate(async () => {
      const { rows } = await pool.query(`select id, data from pgboss.job where name = $1 limit 1`, [dlqDe("content_card.created")]);
      return rows[0];
    }, 30_000);
    expect(tentativas).toBe(3); // 1 + retryLimit 2
    expect(naDlq.data.title).toBe("Vai falhar");
    const { rows: falhou } = await pool.query(`select state, retry_count, output from pgboss.job where name = 'content_card.created' and data->>'title' = 'Vai falhar'`);
    expect(falhou[0].state).toBe("failed");
    expect(falhou[0].retry_count).toBe(2);
    expect(String(falhou[0].output.message)).toContain("WhatsApp fora");
    await boss.offWork("content_card.created");
  });

  it("4. relay rodando duas vezes sobre o mesmo evento não gera dois jobs (singletonKey = outbox id)", async () => {
    await pool.query(`insert into content_cards (client_name, title, requested_by_traffic) values ('Y', 'Duplicata', '🤖 Agente CS')`);
    const { rows: [ob] } = await pool.query(`select id from outbox where payload->>'title' = 'Duplicata'`);
    await relayOutbox(pool, boss, { atrasoSegundos: 60 });
    // simula a queda entre o send e o "processado": volta a linha para pendente e roda de novo
    await pool.query(`update outbox set processado_em = null where id = $1`, [ob.id]);
    await relayOutbox(pool, boss, { atrasoSegundos: 60 });
    const { rows } = await pool.query(`select count(*)::int as n from pgboss.job where name = 'content_card.created' and singleton_key = $1`, [ob.id]);
    expect(rows[0].n).toBe(1);
  });
});
