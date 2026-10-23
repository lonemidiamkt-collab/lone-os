// GET /api/clients/contas-meta — de quem é cada conta de anúncio (21/10/2026).
//
// A lista "Vincular conta de anúncio" da ficha mostra todas as contas do Gerenciador; sem isto, a
// conta de outro cliente aparecia igual a uma livre e ia embora num clique. Junta a ficha
// (clients.meta_ad_account_id) e a carteira de tráfego (ad_accounts). Só nomes e ids — nada sensível.
// Quem decide de verdade é /api/clients/update (409 sem confirmação); esta lista é para quem clica ver antes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { lerDonosDasContas } from "@/lib/clients/conta-meta-server";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  try {
    const mapa = await lerDonosDasContas();
    const donos: Record<string, { clientId: string; nome: string; ativo: boolean; naFicha: boolean; noEspelho: boolean }[]> = {};
    for (const [conta, lista] of mapa) {
      donos[conta] = lista.map(({ clientId, nome, ativo, naFicha, noEspelho }) => ({ clientId, nome, ativo, naFicha, noEspelho }));
    }
    return NextResponse.json({ donos });
  } catch (e) {
    console.error("[clients/contas-meta]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui ver de quem é cada conta agora." }, { status: 500 });
  }
}
