// app/api/cs/legendas-em-lote/route.ts — escreve a legenda dos cards que estão sem nenhuma.
//
// PRA QUE (09/08). As 16 artes de Dia dos Pais estavam prontas e TODAS sem legenda. Post sem texto
// não é post publicável — e escrever 16 na mão, num domingo, é o que trava a operação.
//
// SÓ PREENCHE VAZIO. Nunca sobrescreve legenda existente: texto que alguém escreveu vale mais que
// texto que a IA escreveu, e apagar trabalho alheio em lote é irreversível.
//
// NÃO PUBLICA NADA. Salva no card e devolve o que escreveu, pra revisão antes de qualquer post.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { gerarLegenda } from "@/lib/cs/legenda";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const cardIds: string[] = Array.isArray(body?.cardIds) ? body.cardIds : [];
  const tema = (body?.tema as string) || "";
  if (!cardIds.length) return NextResponse.json({ error: "cardIds obrigatório" }, { status: 400 });
  if (cardIds.length > 30) return NextResponse.json({ error: "no máximo 30 por vez" }, { status: 400 });

  const { data: cards } = await supabaseAdmin
    .from("content_cards").select("id, title, caption, client_id").in("id", cardIds);
  if (!cards?.length) return NextResponse.json({ error: "nenhum card encontrado" }, { status: 404 });

  const resultados: Array<Record<string, unknown>> = [];

  for (const card of cards) {
    const nome = card.title as string;
    if ((card.caption as string | null)?.trim()) {
      resultados.push({ cardId: card.id, pulou: "já tinha legenda" });
      continue;
    }

    const { data: cli } = await supabaseAdmin
      .from("clients").select("name, nome_fantasia, nicho, fixed_briefing").eq("id", card.client_id).maybeSingle();
    if (!cli) { resultados.push({ cardId: card.id, erro: "cliente não encontrado" }); continue; }
    const cliente = (cli.nome_fantasia as string) || (cli.name as string);

    const { data: regras } = await supabaseAdmin
      .from("cs_client_rules").select("regra").eq("client_id", card.client_id).limit(20);

    const r = await gerarLegenda({
      clienteNome: cliente,
      clienteNicho: (cli.nicho as string) ?? undefined,
      briefing: (cli.fixed_briefing as string) ?? undefined,
      regras: (regras ?? []).map((x) => x.regra as string).filter(Boolean),
      titulo: tema ? `${nome} — ${tema}` : nome,
      formato: "Post",
    });

    if (!r.ok || !r.data?.legenda) {
      resultados.push({ cardId: card.id, cliente, erro: r.error ?? "IA não devolveu legenda" });
      continue;
    }

    const texto = [r.data.legenda.trim(), r.data.hashtags?.trim()].filter(Boolean).join("\n\n");
    const { error } = await supabaseAdmin
      .from("content_cards").update({ caption: texto }).eq("id", card.id);
    if (error) { resultados.push({ cardId: card.id, cliente, erro: `não salvou: ${error.message}` }); continue; }

    resultados.push({ cardId: card.id, cliente, legenda: texto });
  }

  return NextResponse.json({
    ok: true,
    escritas: resultados.filter((x) => x.legenda).length,
    pulados: resultados.filter((x) => x.pulou).length,
    erros: resultados.filter((x) => x.erro).length,
    resultados,
  });
}
