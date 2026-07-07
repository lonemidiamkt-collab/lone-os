// app/api/clients/[id]/ficha-viva/analise/route.ts — salva a estrutura comercial EDITADA pelo
// time (o time revisa/corrige o que a IA gerou). Admin apenas. Atualiza a análise do diagnóstico
// mais recente do cliente.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const asArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id: clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const a = body?.analise;
  if (!a || typeof a !== "object") return NextResponse.json({ error: "Estrutura inválida" }, { status: 422 });

  // Normaliza pro shape esperado (não confia no cliente)
  const analise = {
    diagnostico: typeof a.diagnostico === "string" ? a.diagnostico.trim() : "",
    swot: {
      forcas: asArr(a?.swot?.forcas),
      fraquezas: asArr(a?.swot?.fraquezas),
      oportunidades: asArr(a?.swot?.oportunidades),
      ameacas: asArr(a?.swot?.ameacas),
    },
    prioridades: asArr(a.prioridades),
    scripts: asArr(a.scripts),
  };

  const { data: diag } = await supabaseAdmin
    .from("client_diagnostics").select("id")
    .eq("client_id", clientId).order("answered_at", { ascending: false }).limit(1).single();
  if (!diag) return NextResponse.json({ error: "Sem diagnóstico pra editar" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("client_diagnostics")
    .update({ analise, status: "analisado", analyzed_at: new Date().toISOString() })
    .eq("id", diag.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, analise });
}
