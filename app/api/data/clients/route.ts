export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { dispararLinkDoPortal } from "@/lib/portal/link-automatico";
import { descreverDono, normalizarContaMeta, type DonoConta } from "@/lib/clients/conta-meta";
import { donosDaConta } from "@/lib/clients/conta-meta-server";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [clients, clientChats] = await Promise.all([
    db.fetchClients(),
    db.fetchClientChats(),
  ]);

  return NextResponse.json({ clients, clientChats });
}

// Cadastro manual de cliente (Clientes → Novo cliente). Só gestão — é quem vê o botão; estar logado
// não bastava (e agora o cadastro também avisa o grupo de cadastro).
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json();
  // Conta de anúncio de outro cliente não entra pelo cadastro (21/10/2026): o gatilho passaria o
  // alerta de verba e os números dela para o cliente novo em silêncio. Transferir é na ficha, com confirmação.
  const conta = normalizarContaMeta(typeof body?.metaAdAccountId === "string" ? body.metaAdAccountId : null);
  if (conta) {
    let donos: DonoConta[];
    try {
      donos = await donosDaConta(conta);
    } catch {
      return NextResponse.json({ error: "Não consegui conferir de quem é a conta de anúncio. O cliente não foi cadastrado — tente de novo." }, { status: 503 });
    }
    if (donos.length) {
      return NextResponse.json({
        error: `A conta de anúncio ${conta} ${donos.map((d) => descreverDono(d)).join("; ")}. Cadastre sem a conta e, se ela for mesmo deste cliente, transfira na ficha (Admin › Conta Meta Ads).`,
        codigo: "conta_de_outro_cliente",
      }, { status: 409 });
    }
    body.metaAdAccountId = conta;
  }
  const { id } = await db.insertClient(body);
  // Cliente novo já nasce com o link do portal, e o grupo de cadastro recebe (uma vez).
  if (!body?.draftStatus) dispararLinkDoPortal(id, "cadastro");
  return NextResponse.json({ id }, { status: 201 });
}
