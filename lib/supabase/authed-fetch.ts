/**
 * fetch wrapper que injeta o access_token do Supabase no header Authorization.
 *
 * Use em todas as chamadas pra rotas Next.js que fazem `getServerUser(req)` —
 * sem isso, o server não recebe o token (Supabase JS default guarda em
 * localStorage, não em cookies).
 *
 * Uso:
 *   import { authedFetch } from "@/lib/supabase/authed-fetch";
 *   const res = await authedFetch("/api/broadcasts", { method: "POST", body: ... });
 */

import { supabase } from "./client";

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch {
    // sessão indisponível — segue sem token, server retornará 401
  }
  return fetch(input, { ...init, headers });
}
