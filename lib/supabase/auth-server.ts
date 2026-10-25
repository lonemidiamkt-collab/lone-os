import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { payloadDoJwt } from "@/lib/obs/ator";
import { ehAdmin } from "@/lib/auth/admins-fixos";
import { buscarMembroPorEmail } from "@/lib/equipe/membro-server";

// QUEM É ADMIN (25/10/2026, onda 6, item 8.8): antes era só uma lista fixa de e-mails, qualquer que fosse
// a função na equipe. Agora vem da função em team_members (`role = "admin"`), com a lista fixa de
// lib/auth/admins-fixos.ts como rede de segurança dos sócios. A consulta é a mesma que já existia para
// barrar desativado/removido (cache de 60 s, limpo na hora por /api/team ao mudar alguém).

interface Situacao { bloqueia: boolean; papel: string | null; lida: boolean; ate: number }
const situacao = new Map<string, Situacao>();
async function situacaoNaEquipe(email: string): Promise<Situacao> {
  const c = situacao.get(email);
  if (c && c.ate > Date.now()) return c;
  let bloqueia = false;
  let papel: string | null = null;
  let lida = false;
  // E-mail sem diferença de maiúsculas (8.12): linha antiga com "Julio@..." não pode virar "fora da equipe".
  const { membro, erro } = await buscarMembroPorEmail<{ role?: string | null; is_active?: boolean | null; deleted_at?: string | null }>(
    email, "role, is_active, deleted_at, email",
  );
  // Sem linha na equipe: não bloqueia (login que não é da equipe é caso à parte — não trancar
  // ninguém por engano). Erro de consulta: idem, e fica no log — fail-open consciente: banco fora
  // derruba tudo de qualquer jeito. Sem leitura, o papel fica desconhecido (admin só pela lista fixa).
  if (erro) console.warn("[auth-server] não consegui consultar a equipe:", erro);
  else {
    lida = true;
    if (membro && (membro.is_active === false || membro.deleted_at)) bloqueia = true;
    else if (membro) papel = (membro.role as string) ?? null;
  }
  const s: Situacao = { bloqueia, papel, lida, ate: Date.now() + 60_000 };
  situacao.set(email, s);
  return s;
}
/** Esquece o que sabia da equipe: tudo (testes) ou só um e-mail (quem /api/team acabou de mudar). */
export function _limparCacheEquipe(email?: string) {
  if (email) situacao.delete(email.trim().toLowerCase());
  else situacao.clear();
}

export interface ServerUser {
  id: string;
  email: string;
  isAdmin: boolean;
  /** Nível da sessão: aal1 (só senha) ou aal2 (senha + código do autenticador). */
  aal: "aal1" | "aal2";
  /** A conta tem verificação em duas etapas ativa. */
  duasEtapas: boolean;
  /**
   * Função na equipe (team_members.role), lida junto com a checagem de desativado. `undefined` = não
   * consegui ler a equipe agora; `null` = o e-mail não está na equipe. require-role usa sem consultar de novo.
   */
  papel?: string | null;
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
  const eq = await situacaoNaEquipe(email);
  if (eq.bloqueia) return null;
  const duasEtapas = (data.user.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
  const aal = payloadDoJwt(accessToken)?.aal === "aal2" ? "aal2" : "aal1";
  // Quem ligou a verificação em duas etapas só é "logado" em aal2. Sessão aal1 de uma conta com
  // autenticador é uma senha sozinha — exatamente o que a segunda etapa existe para não bastar.
  // O front detecta e pede o código (RoleContext → LoginScreen); aqui é a porta que não abre.
  if (duasEtapas && aal !== "aal2") return null;

  return {
    id: data.user.id,
    email,
    isAdmin: ehAdmin(email, eq.papel),
    aal,
    duasEtapas,
    papel: eq.lida ? eq.papel : undefined,
  };
}
