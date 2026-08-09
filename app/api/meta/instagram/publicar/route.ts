// app/api/meta/instagram/publicar/route.ts — publica UM card no Instagram do cliente.
//
// UM CARD POR CHAMADA, SEMPRE PEDIDO POR UMA PESSOA. Não existe laço, não existe cron, não existe
// "publicar todos". Publicar não tem desfazer: sai no perfil do cliente e quem viu, viu.
//
// GET  ?cardId=...            → o que ACONTECERIA (dry-run): conta, artes, legenda, proporção.
//                               Serve pra conferir antes, e não toca na Meta.
// POST { cardId, confirmar }  → publica. Sem `confirmar: true` devolve o dry-run e não publica.
//
// Só gestão. O social pede, a gestão confirma — mesma regra do resto do sistema.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { publicarNoInstagram, urlJpeg, conferirProporcao } from "@/lib/meta/igPublicar";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://painel.lonemidia.com";

interface Preparo {
  ok: boolean;
  cliente?: string;
  igUserId?: string;
  legenda?: string;
  artes?: string[];
  jpegs?: string[];
  avisos?: string[];
  erro?: string;
}

async function preparar(cardId: string): Promise<Preparo> {
  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, caption, image_url, client_id, status")
    .eq("id", cardId).maybeSingle();
  if (!card) return { ok: false, erro: "card não encontrado" };

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, ig_business_account_id, active")
    .eq("id", card.client_id).maybeSingle();
  if (!cli) return { ok: false, erro: "cliente não encontrado" };
  const cliente = (cli.nome_fantasia as string) || (cli.name as string);
  if (cli.active === false) return { ok: false, cliente, erro: "cliente inativo" };
  if (!cli.ig_business_account_id) {
    return { ok: false, cliente, erro: "cliente sem Instagram vinculado no cadastro" };
  }

  const { data: anexos } = await supabaseAdmin
    .from("card_attachments").select("url, created_at").eq("card_id", cardId)
    .order("created_at", { ascending: true });

  const artes = [
    ...(card.image_url ? [card.image_url as string] : []),
    ...((anexos ?? []).map((a) => a.url as string)),
  ].filter((u, i, arr) => u && arr.indexOf(u) === i);

  if (!artes.length) return { ok: false, cliente, erro: "card sem nenhuma arte" };

  const legenda = ((card.caption as string) || "").trim();
  const avisos: string[] = [];
  // Legenda vazia não impede o post, mas quem confirma precisa saber que vai sair sem texto.
  if (!legenda) avisos.push("card SEM legenda — o post sairia sem texto");
  if (artes.length > 10) avisos.push(`card tem ${artes.length} artes; o carrossel só aceita 10 — as demais ficariam de fora`);

  const usadas = artes.slice(0, 10);
  const jpegs = usadas.map((u) => urlJpeg(BASE, u));

  // Confere proporção de cada uma ANTES de falar com a Meta: descobrir no meio do carrossel
  // deixaria containers órfãos e um post pela metade.
  for (let i = 0; i < jpegs.length; i++) {
    const p = await conferirProporcao(jpegs[i]);
    if (!p.ok) return { ok: false, cliente, erro: `arte ${i + 1}: ${p.erro}` };
  }

  return {
    ok: true, cliente, igUserId: cli.ig_business_account_id as string,
    legenda, artes: usadas, jpegs, avisos,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const cardId = req.nextUrl.searchParams.get("cardId") ?? "";
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });
  const p = await preparar(cardId);
  return NextResponse.json({ ...p, publicado: false, nota: "isto é uma prévia — nada foi publicado" });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const cardId = body?.cardId as string;
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const p = await preparar(cardId);
  if (!p.ok) return NextResponse.json({ ...p, publicado: false }, { status: 422 });

  if (body?.confirmar !== true) {
    return NextResponse.json({ ...p, publicado: false, nota: "prévia — mande confirmar: true pra publicar de verdade" });
  }

  const r = await publicarNoInstagram(p.igUserId!, p.jpegs!, p.legenda!);
  if (!r.ok) return NextResponse.json({ ok: false, cliente: p.cliente, publicado: false, erro: r.erro }, { status: 502 });

  // Registra o que foi ao ar. Post publicado que o sistema não sabe que existe vira relatório errado.
  await supabaseAdmin.from("content_cards")
    .update({ status: "published", status_changed_at: new Date().toISOString() })
    .eq("id", cardId);

  return NextResponse.json({
    ok: true, publicado: true, cliente: p.cliente,
    postId: r.postId, permalink: r.permalink, artes: p.jpegs!.length,
  });
}
