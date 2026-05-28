import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Emails com flag isAdmin=true. Usado pelo caminho Bearer JWT para derivar
// permissões de admin sem consulta extra ao banco.
const ADMIN_EMAILS = new Set([
  "lonemidiamkt@gmail.com", // Roberto (admin)
  "lucas@lonemidia.com",    // Lucas  (admin)
  "julio@lonemidia.com",    // Julio  (manager)
]);

export interface ServerUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Extracts and validates the user from the request.
 *
 * Aceita auth de DUAS fontes (em ordem de preferência):
 *   1. Authorization: Bearer <access_token> — Supabase session real
 *   2. Cookies sb-<ref>-auth-token — Supabase session via cookie storage
 *
 * Retorna o user autenticado + flag de admin, ou null.
 *
 * NOTA: o caminho "LocalSession <email>" foi removido em 28/Mai/2026
 * (INCIDENTE #7 — aceitava auth só por email sem validação de senha ou token).
 */
export async function getServerUser(req: NextRequest): Promise<ServerUser | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");

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
