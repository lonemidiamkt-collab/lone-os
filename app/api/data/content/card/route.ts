export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { snakeToContentCard } from "@/lib/supabase/queries";

/**
 * UM card pelo id, inclusive arquivado.
 *
 * Existe por causa do clique na notificação. O board carrega só os cards ATIVOS, e 2.632 avisos no
 * banco apontam para cards que depois foram arquivados — clicar neles não fazia absolutamente nada:
 * `contentCards.find(...)` voltava undefined e o código seguia em silêncio. Sem erro, sem mensagem,
 * sem nem limpar o `?card=` da URL. Carregar a lista inteira de arquivadas pra achar um só seria
 * caro; buscar o card específico resolve, e o `archived` que volta diz para onde mandar a pessoa.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe o id do card." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("content_cards").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });

  const card = snakeToContentCard(data as Record<string, unknown>);
  return NextResponse.json({ card, archived: !!(data as Record<string, unknown>).archived_at });
}
