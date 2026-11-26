import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario, type Papel } from "@/lib/api/require-role";

// Guards para os endpoints /api/system/* que o middleware libera publicamente.
// Crons no VPS chamam com `Authorization: Bearer <CRON_SECRET>`; o front chama
// com o JWT do Supabase (via authedFetch). Cada rota escolhe o guard adequado.
// Testado em tests/cron-guard.test.ts.

const unauthorized = () => NextResponse.json({ error: "Não autorizado" }, { status: 401 });

/**
 * True se a request traz o CRON_SECRET no header Authorization: Bearer.
 * Tempo constante (Fase 0, leva 0D, 25/11/2026): com `===` a comparação para no primeiro caractere
 * diferente, e o tempo de resposta vaza quanto do segredo já está certo.
 */
export function isCronRequest(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  const veio = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!veio) return false;
  const a = Buffer.from(veio, "utf8");
  const b = Buffer.from(esperado, "utf8");
  // timingSafeEqual exige o mesmo tamanho; compara b com ele mesmo para não sair mais rápido.
  if (a.length !== b.length) { timingSafeEqual(b, b); return false; }
  return timingSafeEqual(a, b);
}

/** Cron-only: exige CRON_SECRET. Retorna Response 401 se faltar, senão null. */
export function requireCron(req: NextRequest): NextResponse | null {
  return isCronRequest(req) ? null : unauthorized();
}

/**
 * Cron OU usuário logado — para rotas chamadas tanto pelo cron quanto pelo front.
 * Qualquer pessoa da equipe passa (designer, comercial…). Rota que manda mensagem, mexe em conta de
 * anúncio, dinheiro ou cofre usa requireCronOrRole.
 */
export async function requireCronOrUser(req: NextRequest): Promise<NextResponse | null> {
  if (isCronRequest(req)) return null;
  const user = await getServerUser(req);
  return user ? null : unauthorized();
}

/** Cron OU logado com um destes papéis (401 sem login, 403 papel errado). Fase 0, leva 0D. */
export async function requireCronOrRole(req: NextRequest, papeis: Papel[]): Promise<NextResponse | null> {
  if (isCronRequest(req)) return null;
  const user = await getServerUser(req);
  if (!user) return unauthorized();
  const papel = await papelDoUsuario(user);
  if (!papel || !papeis.includes(papel)) return NextResponse.json({ error: "Sem permissão para esta área." }, { status: 403 });
  return null;
}
