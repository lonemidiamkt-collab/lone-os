import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// Guards para os endpoints /api/system/* que o middleware libera publicamente.
// Crons no VPS chamam com `Authorization: Bearer <CRON_SECRET>`; o front chama
// com o JWT do Supabase (via authedFetch). Cada rota escolhe o guard adequado.

const unauthorized = () => NextResponse.json({ error: "Não autorizado" }, { status: 401 });

/** True se a request traz o CRON_SECRET no header Authorization: Bearer. */
export function isCronRequest(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
}

/** Cron-only: exige CRON_SECRET. Retorna Response 401 se faltar, senão null. */
export function requireCron(req: NextRequest): NextResponse | null {
  return isCronRequest(req) ? null : unauthorized();
}

/** Cron OU usuário logado — para rotas chamadas tanto pelo cron quanto pelo front. */
export async function requireCronOrUser(req: NextRequest): Promise<NextResponse | null> {
  if (isCronRequest(req)) return null;
  const user = await getServerUser(req);
  return user ? null : unauthorized();
}
