export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/conteudo/versoes?cardId= — as versões entregues da arte de um card, com os arquivos de
// cada uma e o motivo da alteração que a gerou (Leva 7B, N17: comparar versões na revisão).
// Regra em lib/conteudo/versoes.ts; os arquivos vêm do recibo da entrega (ops_log "entregar_arte").

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { montarVersoes, type LinhaAnexoVersao, type LinhaEntrega, type LinhaReciboEntrega } from "@/lib/conteudo/versoes";

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social", "designer", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const cardId = req.nextUrl.searchParams.get("cardId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return NextResponse.json({ error: "Card inválido." }, { status: 400 });

  const [entregas, recibos, anexos] = await Promise.all([
    supabaseAdmin.from("creative_deliveries").select("id, version, delivered_by, delivered_at, status, revision_reason")
      .eq("card_id", cardId).order("version", { ascending: false }).limit(20),
    supabaseAdmin.from("ops_log").select("after").eq("card_id", cardId).eq("action", "entregar_arte")
      .order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("card_attachments").select("url, delivery_id, position").eq("card_id", cardId).not("delivery_id", "is", null),
  ]);
  if (entregas.error) return NextResponse.json({ error: entregas.error.message }, { status: 500 });

  return NextResponse.json({
    versoes: montarVersoes(
      (entregas.data ?? []) as LinhaEntrega[],
      (recibos.data ?? []) as LinhaReciboEntrega[],
      (anexos.data ?? []) as LinhaAnexoVersao[],
    ),
  });
}
