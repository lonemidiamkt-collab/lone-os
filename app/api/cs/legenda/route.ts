export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingTexto } from "@/lib/cs/load-briefing";
import { gerarLegenda } from "@/lib/cs/legenda";

// POST /api/cs/legenda { cardId } — gera a legenda pronta do post (não salva; a UI guarda no
// campo caption quando o social confirmar). Usa o briefing do cliente (o que acabamos de anexar).
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, briefing, format, client_id, client_name").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing").eq("id", card.client_id as string).maybeSingle();
  const briefing = ((cli?.fixed_briefing as string) || (cli?.campaign_briefing as string) || "").trim()
    || (await loadBriefingTexto(card.client_id as string));
  const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);

  const r = await gerarLegenda({
    clienteNome: (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente",
    clienteNicho: (cli?.nicho as string) || (cli?.industry as string) || undefined,
    briefing, regras: rules,
    titulo: (card.title as string) || "post",
    briefingCard: (card.briefing as string) || undefined,
    formato: (card.format as string) || undefined,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha ao gerar" }, { status: 500 });
  return NextResponse.json({ legenda: r.data.legenda, hashtags: r.data.hashtags });
}
