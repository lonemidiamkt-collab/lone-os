import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Emails that are allowed to access admin-only server endpoints.
// Kept in sync with lib/context/RoleContext.tsx USER_PROFILES where role in {admin, manager}.
const ADMIN_EMAILS = new Set([
  "roberto@lonemidia.com",
  "lucas@lonemidia.com",
  "julio@lonemidia.com",
]);

export interface ServerUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Extracts and validates the Supabase session from request cookies.
 * Returns the authenticated user + admin flag, or null if unauthenticated/invalid.
 *
 * The Supabase browser client stores sessions in cookies named sb-<ref>-auth-token
 * (sometimes split across -auth-token.0, -auth-token.1 for large tokens).
 */
export async function getServerUser(req: NextRequest): Promise<ServerUser | null> {
  // Collect all Supabase auth-token cookie chunks and reassemble
  const cookies = req.cookies.getAll();
  const tokenChunks = cookies
    .filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value);

  if (tokenChunks.length === 0) return null;

  const raw = tokenChunks.join("");
  let accessToken: string | null = null;

  try {
    // Cookie may be base64-prefixed JSON or raw JSON
    const cleaned = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64").toString("utf8") : raw;
    const parsed = JSON.parse(cleaned);
    accessToken = parsed?.access_token ?? null;
  } catch {
    return null;
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
