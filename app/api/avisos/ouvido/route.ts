export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/avisos/ouvido { notificationId } — o painel avisa que a voz COMEÇOU A TOCAR.
// É o que separa "o aviso foi criado" de "alguém ouviu": sem isto, um navegador bloqueando a fala
// (aba nunca clicada, painel fechado) passaria despercebido, como a v1 passou dias sem ninguém ouvir.

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { notificationId } = await req.json().catch(() => ({}));
  if (typeof notificationId !== "string" || !notificationId) return NextResponse.json({ error: "notificationId obrigatório" }, { status: 400 });

  const { data: n } = await supabaseAdmin.from("notifications").select("aviso_id, target_user").eq("id", notificationId).maybeSingle();
  const avisoId = (n as { aviso_id?: string | null } | null)?.aviso_id;
  if (!avisoId) return NextResponse.json({ ok: true, registrado: false }); // teste ou aviso de arte

  // Uma frase pode cobrir várias contas (lote da mesma rodada): ouvir a frase = ouvir todas.
  const { data: base } = await supabaseAdmin.from("avisos_trafego").select("lote").eq("id", avisoId).maybeSingle();
  if (!base) return NextResponse.json({ ok: true, registrado: false });
  let q = supabaseAdmin.from("avisos_trafego").select("id, ouvido_em, ouvido_por");
  q = base.lote ? q.eq("lote", base.lote as string) : q.eq("id", avisoId);
  const { data: evs } = await q;
  const quem = ((n as { target_user?: string | null }).target_user ?? user.email) as string;
  for (const ev of evs ?? []) {
    const por = (ev.ouvido_por as string[] | null) ?? [];
    const { error } = await supabaseAdmin.from("avisos_trafego").update({
      ouvido_em: ev.ouvido_em ?? new Date().toISOString(),
      ouvido_por: por.includes(quem) ? por : [...por, quem],
    }).eq("id", ev.id as string);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, registrado: true, eventos: (evs ?? []).length });
}
