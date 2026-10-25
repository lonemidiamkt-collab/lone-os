export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/clients/[id]/observacao-cadastro — a observação que o CLIENTE escreveu no link de cadastro
// (client_onboarding_submissions.notes), para a aba Admin da ficha. Só leitura.
//
// 25/10/2026 (onda 5 da auditoria de erro recuperável): ela só aparecia na linha do tempo e em
// Pendentes. Quem vê a ficha já lê esse texto na linha do tempo (timeline_entries do envio), então a
// regra de acesso é a mesma: estar logado e ter papel na equipe. As notas internas (`clients.notes`)
// não passam por aqui. Falha de leitura vira erro (503), nunca "o cliente não escreveu nada".

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario } from "@/lib/api/require-role";
import { fetchObservacaoCadastro } from "@/lib/supabase/queries";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  if (!papel) return NextResponse.json({ error: "Sem permissão para esta área." }, { status: 403 });

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchObservacaoCadastro(id));
  } catch (e) {
    console.error("[observacao-cadastro] leitura falhou:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui ler o cadastro do cliente agora. Tente de novo." }, { status: 503 });
  }
}
