export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/team-member — a linha da equipe de QUEM ESTÁ LOGADO: { id, nome, papel }.
//
// 25/10/2026 (onda 6, item 8.12): procurava por `team_members.auth_id`, coluna que não existe — o id
// voltava sempre nulo (e o erro do banco era engolido, também virando nulo). O elo é o e-mail do login,
// sem diferença de maiúsculas. Sem sessão: 401. Banco fora: 503 (não "você não está na equipe").
// O parâmetro antigo `?auth_id=` é ignorado: a rota só responde sobre a própria sessão.

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { buscarMembroPorEmail } from "@/lib/equipe/membro-server";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });

  const { membro, erro } = await buscarMembroPorEmail<{ id: string; name: string | null; role: string | null }>(user.email, "id, name, role, email");
  if (erro) {
    console.error("[auth/team-member] não consegui ler a equipe:", erro);
    return NextResponse.json({ error: "Não consegui consultar a equipe agora. Tente de novo em instantes." }, { status: 503 });
  }
  return NextResponse.json({ id: membro?.id ?? null, nome: membro?.name ?? null, papel: membro?.role ?? null });
}
