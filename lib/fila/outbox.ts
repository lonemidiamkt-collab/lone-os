// lib/fila/outbox.ts — OUTBOX TRANSACIONAL. O evento nasce na MESMA transação da escrita.
//
// "Criei a demanda e avisei o grupo" não era atômico: o webhook inseria o card e depois mandava
// a mensagem; se morresse no meio (timeout, deploy, OpenAI travada), o card existia e ninguém
// sabia. Agora um trigger em content_cards/design_requests grava uma linha em `outbox` na mesma
// transação do INSERT — se o card existe, o evento existe. Este relay leva a linha para a fila
// (pg-boss), que cuida de retry, backoff e dead-letter.
//
// Idempotência do relay: singletonKey = id do outbox. Se cair entre o send e o "processado", a
// próxima volta manda de novo e o pg-boss ignora a duplicata enquanto o job vive; o consumidor
// é idempotente de qualquer jeito (checa antes de agir).

import type PgBoss from "pg-boss";
import type { Pool } from "pg";
import { FILAS, type NomeFila } from "./boss";

export interface LinhaOutbox {
  id: string;
  evento: string;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  criado_em: string;
  tentativas: number;
}

const MAX_TENTATIVAS_RELAY = 10;

/** Uma volta do relay: pega até `lote` linhas pendentes (com lock), publica, marca. Devolve quantas publicou. */
export interface OpcoesRelay {
  lote?: number;
  /** Segundos até o job ficar disponível. 120 em produção: quem escreveu o card ainda está confirmando no grupo. */
  atrasoSegundos?: number;
}

export async function relayOutbox(pool: Pool, boss: PgBoss, o: OpcoesRelay = {}): Promise<{ publicadas: number; falhas: number }> {
  const lote = o.lote ?? 50;
  const atraso = o.atrasoSegundos ?? 120;
  const cli = await pool.connect();
  let publicadas = 0, falhas = 0;
  try {
    await cli.query("begin");
    const { rows } = await cli.query<LinhaOutbox>(
      `select id, evento, payload, correlation_id, criado_em, tentativas
         from public.outbox
        where processado_em is null and tentativas < $1
        order by criado_em
        limit $2
        for update skip locked`, [MAX_TENTATIVAS_RELAY, lote]);
    for (const l of rows) {
      if (!(l.evento in FILAS)) {
        // Evento sem fila declarada: marca como processado com erro, para não travar o relay.
        await cli.query(`update public.outbox set processado_em = now(), erro = $2 where id = $1`, [l.id, `fila desconhecida: ${l.evento}`]);
        falhas++;
        continue;
      }
      try {
        await boss.send(l.evento as NomeFila, { outboxId: l.id, correlationId: l.correlation_id, ...l.payload }, {
          singletonKey: l.id,
          startAfter: atraso,
        });
        await cli.query(`update public.outbox set processado_em = now(), erro = null where id = $1`, [l.id]);
        publicadas++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await cli.query(`update public.outbox set tentativas = tentativas + 1, erro = $2 where id = $1`, [l.id, msg.slice(0, 500)]);
        falhas++;
      }
    }
    await cli.query("commit");
  } catch (err) {
    await cli.query("rollback").catch(() => {});
    throw err;
  } finally {
    cli.release();
  }
  return { publicadas, falhas };
}

/** Situação do outbox para o painel: pendentes, presas (tentativas esgotadas), última publicação. */
export async function estadoOutbox(pool: Pool): Promise<{ pendentes: number; presas: number; ultimaPublicacao: string | null }> {
  const { rows } = await pool.query<{ pendentes: string; presas: string; ultima: string | null }>(
    `select count(*) filter (where processado_em is null and tentativas < $1) as pendentes,
            count(*) filter (where processado_em is null and tentativas >= $1) as presas,
            max(processado_em)::text as ultima
       from public.outbox`, [MAX_TENTATIVAS_RELAY]);
  const r = rows[0];
  return { pendentes: Number(r?.pendentes ?? 0), presas: Number(r?.presas ?? 0), ultimaPublicacao: r?.ultima ?? null };
}
