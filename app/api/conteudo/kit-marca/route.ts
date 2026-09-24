export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/conteudo/kit-marca?clientId=&cardId= — o KIT DA MARCA ao lado da tarefa de arte (Leva 7B,
// N16): logo, paleta, tipografia, tom, o que não usar e as últimas 6 peças aprovadas do cliente.
// Cada pedaço vem de onde já mora (ver lib/conteudo/kit-marca.ts); falta de uma fonte não derruba
// as outras — o painel mostra o que existe e diz o que falta.

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { statusDasEtapas } from "@/lib/conteudo/etapas";
import {
  listaNaoUsar, paletaDaMarca, tomDaMarca, ultimasAprovadas, type CardAprovavel, type KitDaMarca, type LogoDaMarca,
} from "@/lib/conteudo/kit-marca";

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social", "designer", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  const cardId = req.nextUrl.searchParams.get("cardId");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });

  const [cli, ativos, briefing, estilo, regras, cards] = await Promise.all([
    supabaseAdmin.from("clients").select("name, nome_fantasia, logo, doc_logo, tone_of_voice").eq("id", clientId).maybeSingle(),
    supabaseAdmin.from("client_brand_assets").select("tipo, nome, url").eq("client_id", clientId).in("tipo", ["logo", "logo_variante", "marca_dagua"]).order("created_at", { ascending: false }).limit(8),
    supabaseAdmin.from("client_briefings").select("paleta_cores, tipografia, logo_url, tom_voz, pessoa_verbal, usa_emoji, palavras_proibidas, elementos_evitar").eq("client_id", clientId).eq("is_current", true).maybeSingle(),
    supabaseAdmin.from("client_visual_style").select("analise, resumo").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("cs_client_rules").select("texto").eq("client_id", clientId).eq("ativo", true).in("escopo", ["arte", "sempre"])
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).limit(15),
    supabaseAdmin.from("content_cards")
      .select("id, title, status, client_approved_at, publish_verified_at, scheduled_at, status_changed_at, designer_delivered_at, image_url")
      .eq("client_id", clientId).is("archived_at", null)
      .or(`client_approved_at.not.is.null,status.in.(${statusDasEtapas("agendado", "no_ar").join(",")})`)
      .order("updated_at", { ascending: false }).limit(40),
  ]);
  if (cli.error) return NextResponse.json({ error: cli.error.message }, { status: 500 });
  if (!cli.data) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  // A 1ª ENTREGA de cada card aprovado (referência do social não é peça aprovada).
  const idsAprovados = (cards.data ?? []).map((c) => c.id as string);
  const artes = new Map<string, string>();
  if (idsAprovados.length) {
    const { data: anexos } = await supabaseAdmin.from("card_attachments").select("card_id, url, position, tipo")
      .in("card_id", idsAprovados).order("position", { ascending: true });
    for (const a of anexos ?? []) {
      if (a.tipo === "referencia" || artes.has(a.card_id as string)) continue;
      artes.set(a.card_id as string, a.url as string);
    }
  }

  const b = briefing.data as Record<string, unknown> | null;
  const analise = estilo.data?.analise as { tipografia?: string; o_que_evitar?: unknown } | null | undefined;
  const logos: LogoDaMarca[] = [];
  const vistos = new Set<string>();
  const addLogo = (url: unknown, nome: string) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url) || vistos.has(url)) return;
    vistos.add(url);
    logos.push({ url, nome });
  };
  for (const a of ativos.data ?? []) addLogo(a.url, (a.nome as string) || "Logo");
  addLogo(b?.logo_url, "Logo do briefing");
  addLogo(cli.data.doc_logo, "Logo do cadastro");
  addLogo(cli.data.logo, "Logo");

  const kit: KitDaMarca = {
    clientId,
    cliente: (cli.data.nome_fantasia as string) || (cli.data.name as string) || "",
    logos: logos.slice(0, 4),
    paleta: paletaDaMarca(b?.paleta_cores, analise),
    tipografia: ((b?.tipografia as string) || analise?.tipografia || "").trim() || null,
    tom: tomDaMarca(b as { tom_voz?: string | null; pessoa_verbal?: string | null; usa_emoji?: boolean | null } | null, cli.data.tone_of_voice as string | null),
    naoUsar: listaNaoUsar(b?.palavras_proibidas, b?.elementos_evitar, analise?.o_que_evitar),
    regrasDeArte: (regras.data ?? []).map((r) => (r.texto as string) ?? "").filter(Boolean),
    resumoVisual: (estilo.data?.resumo as string) || null,
    aprovadas: ultimasAprovadas((cards.data ?? []) as CardAprovavel[], artes, { excluir: cardId }),
  };
  return NextResponse.json(kit);
}
