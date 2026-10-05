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
  // ?tipo=arte → aviso de arte entregue (quem ouve: social e designer); padrão → aviso de tráfego.
  const arte = q.get("tipo") === "arte";
  const titulo = q.get("titulo") ?? (arte ? "Teste de aviso falado: arte entregue" : "Um aviso rápido de tráfego, só de teste");
  const corpo = q.get("corpo") ?? (arte
    ? "O designer entregou a arte de exemplo da Veneza Estofados. Isto é só um teste."
    : "O custo por conversa da Engetec subiu na semana passada: estava em R$ 3,53, foi pra R$ 5,06. E as conversas caíram, de 69 pra 50. Vale dar uma olhada nos anúncios dela hoje.");
  const { error } = await supabaseAdmin.from("notifications").insert(
    // falar: true — no aviso de tráfego quem decide a voz é o servidor (lib/avisos/regras.ts); o teste
    // pula teto e horário de propósito. Arte dirigida à pessoa fala pra ela (lib/avisos/fala.ts).
    validos.map((p) => ({ type: arte ? "content" : "trafego", title: titulo, body: corpo, target_user: p, read: false, falar: !arte })),
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, para: validos, titulo, aviso: "o painel de cada um busca avisos a cada 45 s; com a aba aberta e um clique feito, ele fala" });
}
