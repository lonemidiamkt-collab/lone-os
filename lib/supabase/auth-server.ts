import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Emails that are allowed to access admin-only server endpoints.
// Kept in sync with lib/context/RoleContext.tsx USER_PROFILES where role in {admin, manager}.
const ADMIN_EMAILS = new Set([
  "lonemidiamkt@gmail.com", // Roberto (admin)
  "lucas@lonemidia.com",
  "julio@lonemidia.com",
]);

export interface ServerUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Extracts and validates the Supabase session from the request.
 * Aceita o token de duas fontes (em ordem de preferência):
 *   1. Authorization: Bearer <access_token> — usado pelo frontend que guarda
 *      session em localStorage (Supabase JS default storage)
 *   2. Cookies sb-<ref>-auth-token — usado por configs com cookie storage
 *
 * Retorna o user autenticado + flag de admin, ou null.
 */
export async function getServerUser(req: NextRequest): Promise<ServerUser | null> {
  let accessToken: string | null = null;

  // 1. Authorization header (preferido — Supabase default usa localStorage)
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    accessToken = authHeader.slice(7).trim() || null;
  }

  // 2. Fallback: cookies (caso config use cookie storage)
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
