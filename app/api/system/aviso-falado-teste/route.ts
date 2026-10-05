export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/system/aviso-falado-teste?para=Julio,Roberto%20Lino — manda um aviso de tráfego de
// TESTE pra essas pessoas, pra conferir se o painel delas fala (lib/avisos/fala.ts). O título diz
// que é teste, pra ninguém sair agindo em cima dele. Opcional: titulo= e corpo=.

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const q = req.nextUrl.searchParams;
  const para = (q.get("para") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!para.length) return NextResponse.json({ error: "informe ?para= (nomes do time, separados por vírgula)" }, { status: 400 });
  const { data: time } = await supabaseAdmin.from("team_members").select("name").in("name", para).eq("is_active", true);
  const validos = (time ?? []).map((t) => t.name as string);
  if (!validos.length) return NextResponse.json({ error: "nenhum nome bate com o time ativo", para }, { status: 400 });
  const titulo = q.get("titulo") ?? "Teste de aviso falado: o resultado do Bruno Tintas Iguaba caiu";
  const corpo = q.get("corpo") ?? "Na semana passada o custo por conversa subiu 26 por cento, de R$ 6,79 para R$ 8,59. Isto é só um teste.";
  const { error } = await supabaseAdmin.from("notifications").insert(
    validos.map((p) => ({ type: "trafego", title: titulo, body: corpo, target_user: p, read: false })),
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, para: validos, titulo, aviso: "o painel de cada um busca avisos a cada 45 s; com a aba aberta e um clique feito, ele fala" });
}
