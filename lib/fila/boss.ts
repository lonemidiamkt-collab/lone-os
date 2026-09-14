// lib/fila/boss.ts — a fila. pg-boss no Postgres que já existe (schema `pgboss`), sem Redis nem
// serviço novo. Fase 0B do Lone Agent V2.
//
// Toda fila é declarada AQUI, com retry, backoff, expiração e dead-letter. Consumidor que não
// está nesta lista não existe. Job que estoura o retryLimit vai para a fila `<nome>.dlq` — visível
// em /api/system/fila e no painel do agente, não num log que ninguém lê.

import PgBoss from "pg-boss";

export const FILAS = {
  /** Um card nasceu (trigger em content_cards → outbox). Consumidor: aviso-demanda. */
  "content_card.created": { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 120 },
  /** Uma demanda de design nasceu (trigger em design_requests → outbox). Sem consumidor ainda. */
  "design_request.created": { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 120 },
} as const;

export type NomeFila = keyof typeof FILAS;

export const dlqDe = (fila: string) => `${fila}.dlq`;

let boss: PgBoss | null = null;

export async function iniciarBoss(connectionString: string): Promise<PgBoss> {
  if (boss) return boss;
  const b = new PgBoss({
    connectionString,
    schema: "pgboss",
    max: 2,
    // Manutenção do próprio pg-boss (arquivar concluídos, apagar velhos): 7 dias de histórico bastam
    // para "o que aconteceu com isto?"; o resto é o audit_log.
    archiveCompletedAfterSeconds: 24 * 3600,
    deleteAfterDays: 7,
    monitorStateIntervalSeconds: 60,
  });
  b.on("error", (err) => console.error("[fila] pg-boss:", err instanceof Error ? err.message : err));
  await b.start();
  for (const [nome, opts] of Object.entries(FILAS)) {
    await b.createQueue(dlqDe(nome));
    // policy "stately": UM job por singletonKey enquanto estiver created/retry/active. É o que faz
    // o relay ser idempotente (singletonKey = id do outbox) — na policy padrão a chave é ignorada.
    const cfg = { name: nome, policy: "stately" as const, ...opts, deadLetter: dlqDe(nome) };
    await b.createQueue(nome, cfg);
    // createQueue não altera fila que já existe; updateQueue garante que o que está em FILAS é o
    // que vale — mudou o retry aqui, muda no banco na próxima subida. (Atenção: updateQueue sem
    // `policy` volta para "standard" e a idempotência some — por isso passa a config inteira.)
    await b.updateQueue(nome, cfg);
  }
  boss = b;
  return b;
}

export function bossAtual(): PgBoss | null { return boss; }

export async function pararBoss(): Promise<void> {
  if (!boss) return;
  const b = boss; boss = null;
  await b.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
}
