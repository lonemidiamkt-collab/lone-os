export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";

// O designer diz se a proposta da IA serviu — é o dado que mostra, por cliente, se o kit está certo
// (logo/estilo/textos) e o que ajustar nas instruções fixas. POST { feedback: 'serviu'|'nao_serviu', motivo? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as { feedback?: string; motivo?: string } | null;
  if (body?.feedback !== "serviu" && body?.feedback !== "nao_serviu") return NextResponse.json({ error: "feedback deve ser serviu ou nao_serviu" }, { status: 400 });
  const { error } = await supabaseAdmin.from("ia_geracoes").update({ feedback: body.feedback, feedback_motivo: (body.motivo ?? "").slice(0, 400) || null, feedback_por: user.email, feedback_em: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
