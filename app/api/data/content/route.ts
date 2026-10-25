export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import * as db from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const socialMedia = url.searchParams.get("socialMedia") ?? undefined;

  // 25/10/2026 (onda 5): fetchContentCards LANÇA quando não lê. Antes devolvia [] e esta rota respondia 200 com
  // lista vazia: a tela abria "sem cards" e o polling de 20 s apagava o quadro de quem estava trabalhando. Agora
  // 503 com o motivo — o store marca loadError (tela diz "não consegui carregar") e o polling mantém o que já tinha.
  const falhou = (e: unknown) => {
    const motivo = e instanceof Error ? e.message : "Não consegui ler os cards.";
    console.error("[api/data/content]", motivo);
    return NextResponse.json({ error: `${motivo} Tente de novo em instantes.` }, { status: 503 });
  };

  // archived=1 → tela "Arquivadas": devolve só as demandas arquivadas (sem o resto do payload).
  if (url.searchParams.get("archived") === "1") {
    try {
      const contentCards = await db.fetchContentCards({ ...(socialMedia ? { socialMedia } : {}), archived: true });
      return NextResponse.json({ contentCards });
    } catch (e) { return falhou(e); }
  }

  // VERSÃO BARATA (16/09): o Social e o Design fazem polling a cada 20 s por aba. Antes cada tick
  // remontava e baixava 1,2 MB. Agora 5 agregados leves viram uma "versão"; se o cliente já tem
  // essa versão, 204 e nada trafega. Qualquer insert/update/delete nas 5 tabelas muda a versão.
  const versao = await versaoDoConteudo();
  if (versao && url.searchParams.get("v") === versao) return new NextResponse(null, { status: 204 });

  // `socialReports` saiu (Leva 5a): o relatório social manual nunca foi usado (0 na base); os
  // resultados de conteúdo são contados no Instagram (/api/conteudo/resultados).
  try {
    const [contentCards, designRequests, contentApprovals] = await Promise.all([
      db.fetchContentCards(socialMedia ? { socialMedia } : undefined),
      db.fetchDesignRequests(),
      db.fetchContentApprovals(),
    ]);
    return NextResponse.json({ contentCards, designRequests, contentApprovals, versao });
  } catch (e) { return falhou(e); }
}

async function versaoDoConteudo(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const [cc, dr, at, cm, ap] = await Promise.all([
      supabaseAdmin.from("content_cards").select("updated_at", { count: "exact", head: false }).order("updated_at", { ascending: false }).limit(1),
      supabaseAdmin.from("design_requests").select("updated_at", { count: "exact", head: false }).order("updated_at", { ascending: false }).limit(1),
      supabaseAdmin.from("card_attachments").select("created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(1),
      supabaseAdmin.from("card_comments").select("created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(1),
      supabaseAdmin.from("content_approvals").select("created_at", { count: "exact", head: false }).order("created_at", { ascending: false }).limit(1),
    ]);
    const partes = [cc, dr, at, cm, ap].map((r) => `${r.count ?? 0}:${(r.data?.[0] as Record<string, string> | undefined)?.updated_at ?? (r.data?.[0] as Record<string, string> | undefined)?.created_at ?? ""}`);
    return partes.join("|");
  } catch {
    return null; // sem versão, segue o caminho antigo (payload completo)
  }
}
