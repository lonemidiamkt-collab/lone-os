import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { payloadDoJwt } from "@/lib/obs/ator";

// Emails com flag isAdmin=true. Usado pelo caminho Bearer JWT para derivar
// permissões de admin sem consulta extra ao banco.
const ADMIN_EMAILS = new Set([
  "lonemidiamkt@gmail.com", // Roberto (admin)
  "lucas@lonemidia.com",    // Lucas  (admin)
  "julio@lonemidia.com",    // Julio  (manager)
]);

const situacao = new Map<string, { bloqueia: boolean; ate: number }>();
async function equipeBloqueia(email: string): Promise<boolean> {
  const c = situacao.get(email);
  if (c && c.ate > Date.now()) return c.bloqueia;
  let bloqueia = false;
  try {
    const { data, error } = await supabaseAdmin.from("team_members").select("is_active, deleted_at").eq("email", email).maybeSingle();
    // Sem linha na equipe: não bloqueia (login que não é da equipe é caso à parte — não trancar
    // ninguém por engano). Erro de consulta: idem, e fica no log.
    if (error) console.warn("[auth-server] não consegui consultar a equipe:", error.message);
    else if (data && (data.is_active === false || data.deleted_at)) bloqueia = true;
  } catch { /* fail-open consciente: DB fora derruba tudo de qualquer jeito */ }
  situacao.set(email, { bloqueia, ate: Date.now() + 60_000 });
  return bloqueia;
}
/** Só para testes. */
export function _limparCacheEquipe() { situacao.clear(); }

export interface ServerUser {
  id: string;
  email: string;
  isAdmin: boolean;
  /** Nível da sessão: aal1 (só senha) ou aal2 (senha + código do autenticador). */
  aal: "aal1" | "aal2";
  /** A conta tem verificação em duas etapas ativa. */
  duasEtapas: boolean;
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
  // DESATIVADO NÃO ENTRA. "Desativar" na Gestão da Equipe prometia bloquear o acesso, mas só o
  // login pela tela era barrado (roster não lista inativo) — uma sessão já aberta seguia usando
  // todas as rotas. Agora a equipe é consultada aqui (cache de 60s) e inativo/removido vira 401.
  if (await equipeBloqueia(email)) return null;
  const duasEtapas = (data.user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
  const aal = payloadDoJwt(accessToken)?.aal === "aal2" ? "aal2" : "aal1";
  // Quem ligou a verificação em duas etapas só é "logado" em aal2. Sessão aal1 de uma conta com
  // autenticador é uma senha sozinha — exatamente o que a segunda etapa existe para não bastar.
  // O front detecta e pede o código (RoleContext → LoginScreen); aqui é a porta que não abre.
  if (duasEtapas && aal !== "aal2") return null;

  return {
    id: data.user.id,
    email,
    isAdmin: ADMIN_EMAILS.has(email),
    aal,
    duasEtapas,
  };
}
