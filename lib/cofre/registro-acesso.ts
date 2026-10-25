// lib/cofre/registro-acesso.ts — quem revelou ou alterou senha do cofre (vault_access_log). Server-only.
//
// Saiu de dentro de /api/client-vault em 25/10/2026 para a rota das senhas anteriores
// (/api/client-vault/anteriores) registrar o "Ver" do mesmo jeito que o revelar da senha atual — a
// trilha "Quem revelou ou alterou" da ficha lê esta tabela. Nunca recebe nem grava a senha: só quem,
// qual campo, o quê e de onde.

import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function registrarAcessoCofre(params: {
  user: { id: string; email: string };
  clientId?: string;
  field: string;
  action: "reveal" | "update";
  req: NextRequest;
  /** Onde estava o que foi lido (ex.: a versão anterior revelada). */
  caminho?: string | null;
}): Promise<void> {
  // Reaproveita a tabela vault_access_log criada em migration 018.
  // Fire-and-forget — log failure não bloqueia operação legítima.
  supabaseAdmin.from("vault_access_log").insert({
    user_id: params.user.id,
    user_email: params.user.email,
    client_id: params.clientId ?? null,
    resource_type: `credential:${params.field}`,
    resource_path: params.caminho ?? null,
    action: params.action,
    ip: params.req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? params.req.headers.get("x-real-ip") ?? null,
    user_agent: params.req.headers.get("user-agent") ?? null,
  }).then(({ error }) => {
    if (error) console.warn("[client-vault] log insert failed:", error.message);
  });
}
