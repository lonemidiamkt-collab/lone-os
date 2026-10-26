export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { carregarMesa } from "@/lib/priority/mesa";

// GET /api/trafego/mesa?gestor=Nome|todos — a Mesa do Gestor de tráfego (lib/priority/mesa.ts).
// Gestor de tráfego vê a própria (o parâmetro é ignorado); gestão e sócios escolhem o gestor ou "todos".
// As decisões usam POST /api/priority/decidir (executada, ignorada, incorreta, adiar, reabrir).

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  const { user, papel } = gate;
  const { data: eu } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
  const meuNome = ((eu?.name as string) ?? "").trim() || null;

  const pedido = (req.nextUrl.searchParams.get("gestor") ?? "").trim();
  let gestor: string | null;
  if (papel === "traffic") gestor = meuNome;
  else gestor = pedido && pedido !== "todos" ? pedido : pedido === "todos" ? null : meuNome;
  // Gestão sem itens no próprio nome cai em "todos" na primeira abertura (o sócio não tem carteira de tráfego).
  try {
    let mesa = await carregarMesa(gestor);
    if (!pedido && papel !== "traffic" && gestor && !mesa.itens.length && !mesa.feitos.length) mesa = await carregarMesa(null);
    return NextResponse.json({ ...mesa, eu: { nome: meuNome, papel } });
  } catch (e) {
    console.error("[trafego/mesa]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui carregar a Mesa agora. Tente de novo em instantes." }, { status: 500 });
  }
}
