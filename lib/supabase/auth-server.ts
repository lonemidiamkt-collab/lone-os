import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Emails que tem acesso admin (pode tudo, incluindo rotas restritas).
// Kept in sync com RoleContext.tsx USER_PROFILES, role in {admin, manager}.
const ADMIN_EMAILS = new Set([
  "lonemidiamkt@gmail.com", // Roberto (admin)
  "lucas@lonemidia.com",    // Lucas  (admin)
  "julio@lonemidia.com",    // Julio  (manager)
]);

// Emails de staff (operadores) — autenticados, mas sem privilégios admin.
// Podem deletar/editar conteúdo do dia-a-dia (cards, demandas).
const STAFF_EMAILS = new Set([
  "carlos@lonemidia.com",  // Social
  "pedro@lonemidia.com",   // Social
  "rodrigo@lonemidia.com", // Designer
]);

export interface ServerUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Extracts and validates the user from the request.
 *
 * Aceita auth de TRÊS fontes (em ordem de preferência):
 *   1. Authorization: Bearer <access_token> — Supabase session real
 *   2. Cookies sb-<ref>-auth-token — Supabase session via cookie storage
 *   3. Authorization: LocalSession <email> — fallback pra app que usa
 *      sessionStorage.lone_local_session (RoleContext.tsx). Só aceita
 *      emails da whitelist ADMIN_EMAILS — se não for admin, retorna null.
 *
 * Retorna o user autenticado + flag de admin, ou null.
 */
export async function getServerUser(req: NextRequest): Promise<ServerUser | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");

  // 3. LocalSession fallback (verificado primeiro pra short-circuit em apps que
  //    nunca usam Supabase auth real — evita chamada desnecessária ao Supabase)
  if (authHeader && authHeader.toLowerCase().startsWith("localsession ")) {
    const email = authHeader.slice("localsession ".length).trim().toLowerCase();
    if (!email) return null;

    if (ADMIN_EMAILS.has(email)) {
      return { id: `local:${email}`, email, isAdmin: true };
    }
    if (STAFF_EMAILS.has(email)) {
      return { id: `local:${email}`, email, isAdmin: false };
    }
    return null; // email não está em nenhum whitelist → bloqueia
  }

  // 1. Authorization Bearer (Supabase real)
  let accessToken: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    accessToken = authHeader.slice(7).trim() || null;
  }

  // 2. Cookies sb-*-auth-token (Supabase via cookie storage)
  if (!accessToken) {
    const cookies = req.cookies.getAll();
    const tokenChunks = cookies
      .filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => c.value);

    if (tokenChunks.length > 0) {
      const raw = tokenChunks.join("");
      try {
        const cleaned = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString("utf8") : raw;
        const parsed = JSON.parse(cleaned);
        accessToken = parsed?.access_token ?? null;
      } catch { /* ignore — falls through to null check */ }
    }
  }

  if (!accessToken) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user?.email) return null;

  const email = data.user.email.toLowerCase();
  return {
    id: data.user.id,
    email,
    isAdmin: ADMIN_EMAILS.has(email),
  };
}
