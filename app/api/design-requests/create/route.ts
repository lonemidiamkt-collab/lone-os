export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * POST /api/design-requests/create
 *
 * Cria uma design_request via service_role (bypassa RLS).
 * Aceita LocalSession — não exige Supabase auth real.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.clientId || !body.title) {
    return NextResponse.json({ error: "clientId e title são obrigatórios" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.from("design_requests").insert({
      title: body.title,
      client_id: body.clientId,
      client_name: body.clientName ?? "",
      requested_by: body.requestedBy ?? user.email,
      priority: body.priority ?? "medium",
      status: body.status ?? "queued",
      format: body.format ?? null,
      briefing: body.briefing ?? null,
      attachments: body.attachments ?? [],
      content_card_id: body.contentCardId ?? null,
      deadline: body.deadline ?? null,
    }).select("id").single();

    if (error) {
      console.error("[design-requests/create]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Grava o link reverso (content_cards.design_request_id) no servidor, atômico com a
    // criação. Antes isso era um 2º fetch do cliente que, se falhasse, deixava a demanda
    // ÓRFÃ (sem vínculo nos 2 sentidos) — a entrega do designer não voltava pro card.
    if (body.contentCardId) {
      const { error: linkErr } = await supabaseAdmin
        .from("content_cards")
        .update({ design_request_id: data.id })
        .eq("id", body.contentCardId);
      if (linkErr) console.error("[design-requests/create] link reverso falhou:", linkErr.message);
    }

    // BRIEFING DA ARTE, SEM BOTÃO. O pedido segue na hora; o briefing enriquecido (regras visuais
    // do cliente + motivos das reprovações anteriores) entra segundos depois, antes de o designer
    // abrir. Era um botão dentro do card e foi usado em 9% dos 510 cards — enquanto 27% das artes
    // voltavam por "não seguiu o padrão do cliente".
    // Não bloqueia e não sobrescreve nada: escreve num campo próprio, ao lado do que o social pediu.
    if (body.contentCardId) {
      void import("@/lib/cs/briefing-design-card")
        .then(({ briefingDesignDoCard }) => briefingDesignDoCard(body.contentCardId as string))
        .then(async (texto) => {
          if (!texto) return;
          const { error } = await supabaseAdmin.from("design_requests")
            .update({ briefing_ia: texto }).eq("id", data.id);
          if (error) console.error("[design-requests/create] briefing IA não salvou:", error.message);
          else console.log(`[design-requests/create] briefing da arte gerado (${data.id})`);
        })
        .catch((e) => console.error("[design-requests/create] briefing IA falhou (ignorado):", e));
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[design-requests/create] unhandled:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
