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
import { USER_PROFILES } from "@/lib/context/RoleContext";

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);

  // 1. Tenta Supabase session real
  let supabaseTokenSet = false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
      supabaseTokenSet = true;
    }
  } catch { /* ignore — tenta fallback */ }

  // 2. Fallback: LocalSession do sessionStorage (RoleContext.tsx)
  //    Só roda no browser e só se o Supabase token não foi setado
  if (!supabaseTokenSet && typeof window !== "undefined") {
    try {
      const localSessionId = sessionStorage.getItem("lone_local_session");
      if (localSessionId) {
        const profile = USER_PROFILES.find((p) => p.id === localSessionId);
        if (profile?.email) {
          headers.set("Authorization", `LocalSession ${profile.email}`);
        }
      }
    } catch { /* sessionStorage indisponível — segue sem auth */ }
  }

  return fetch(input, { ...init, headers });
}
