// lib/fila/db.ts — conexão DIRETA ao Postgres (não passa pelo PostgREST). Só a fila usa.
//
// O app inteiro fala com o banco via supabase-js/PostgREST. A fila (pg-boss) e o relay do outbox
// precisam de SQL de verdade — FOR UPDATE SKIP LOCKED, transação, LISTEN. DATABASE_URL aponta
// para o container supabase-db-1 na rede interna; sem ela, a fila simplesmente não liga.

import { Pool } from "pg";

let pool: Pool | null = null;

export function temBanco(): boolean {
  return !!process.env.DATABASE_URL;
}

export function bancoDireto(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada — a fila precisa de conexão direta ao Postgres");
  pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000, application_name: "loneos-fila" });
  pool.on("error", (err) => console.error("[fila/db] erro no pool:", err.message));
  return pool;
}

export async function fecharBanco(): Promise<void> {
  if (pool) { const p = pool; pool = null; await p.end().catch(() => {}); }
}
