export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado, loadBriefingForClient } from "@/lib/cs/load-briefing";
import { gerarBriefingDesign, formatBriefingDesign } from "@/lib/cs/briefing-design";

// POST /api/cs/briefing-design { cardId } — gera o BRIEFING DA ARTE pro designer a partir do card
// (não salva; a UI mostra num textarea editável e o social revisa antes de mandar no pedido de
// design). Autossuficiente: o designer executa sem perguntar nada.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, briefing, observations, format, due_date, client_id, client_name")
    .eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing")
    .eq("id", card.client_id as string).maybeSingle();
  const clienteNome = (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente";
  const [briefing, estruturado, csRules, reworkRes] = await Promise.all([
    loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string)),
    loadBriefingForClient({ clientId: card.client_id as string, nome: clienteNome, nicho: (cli?.nicho as string) || undefined }),
    fetchClientCsRules(card.client_id as string),
    // Reprovações anteriores deste cliente → o designer já evita repetir (menos retrabalho).
    supabaseAdmin.from("cs_rework_events").select("reason")
      .eq("client_id", card.client_id as string).not("reason", "is", null)
      .order("created_at", { ascending: false }).limit(20),
  ]);
  const regras = csRules.filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
  // Dedup (motivos parecidos repetem) e teto de 8 pra não inchar o prompt.
  const reprovacoesRecentes = [
    ...new Set((reworkRes.data ?? []).map((r) => (r.reason as string)?.trim()).filter(Boolean)),
  ].slice(0, 8);
  const b = estruturado.briefing;

  const r = await gerarBriefingDesign({
    clienteNome,
    clienteNicho: (cli?.nicho as string) || (cli?.industry as string) || undefined,
    titulo: (card.title as string) || "post",
    briefingCard: [card.briefing as string, card.observations as string].filter(Boolean).join("\n") || undefined,
    formato: (card.format as string) || undefined,
    dataPost: (card.due_date as string) || undefined,
    briefing,
    tomVoz: b.tomVoz, produtosDestaque: b.produtosDestaque,
    palavrasProibidas: b.palavrasProibidas, publicoAlvo: b.publicoAlvo,
    regras,
    reprovacoesRecentes,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha ao gerar" }, { status: 500 });
  return NextResponse.json({
    briefing: formatBriefingDesign(r.data, clienteNome, (card.format as string) || undefined, (card.due_date as string) || undefined),
  });
}
