export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao } from "@/lib/obs/correlacao";
import { executarReplicacao } from "@/lib/traffic/replicar-executar";

// POST /api/traffic/criativos/replicar { adId, variacao: {nome, muda, mantem, testa}, formato?, prazo? }
// Gestor escolhe a hipótese → nasce a demanda no quadro do designer do cliente (núcleo em
// lib/traffic/replicar-executar.ts — o mesmo que o "pode" no WhatsApp usa).
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin", "manager", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  const adId = String(body?.adId ?? "");
  const v = body?.variacao as { nome?: string; muda?: string; mantem?: string; testa?: string } | undefined;
  if (!adId || !v?.nome || !v?.muda) return NextResponse.json({ error: "adId e variacao {nome, muda} são obrigatórios" }, { status: 400 });
  const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", gate.user.email).maybeSingle();
  return comExecucao({ origem: "api:replicar-vencedor", ator: gate.user.email, papel: gate.papel }, async () => {
    const r = await executarReplicacao({ adId, variacao: { nome: String(v.nome), muda: String(v.muda), mantem: String(v.mantem ?? ""), testa: String(v.testa ?? "") }, formato: body?.formato ? String(body.formato) : undefined, prazo: body?.prazo ? String(body.prazo) : undefined, pedidoPor: (tm?.name as string) ?? gate.user.email });
    if (!r.ok) return NextResponse.json({ error: r.erro, demandaId: r.demandaId }, { status: r.status });
    return NextResponse.json(r);
  });
}
