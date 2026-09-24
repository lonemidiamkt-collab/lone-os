export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { paraUrlPublica } from "@/lib/supabase/url-publica";
import { clienteDoToken } from "@/lib/portal/token";
import { criarLimite } from "@/lib/portal/limite";
import { montarMateriais, type LinhaUpload } from "@/lib/portal/materiais";
import type { LinhaCardAgenda } from "@/lib/portal/agenda";
import { temColunasIg } from "@/lib/conteudo/dados";

// GET /api/portal/[token]/materiais — o que o cliente mandou por "Enviar material" (N37): o arquivo,
// se o time já recebeu e onde foi usado (quando o time ligou o material a um post).
//
// Público via token. O bucket é PRIVADO: cada arquivo sai como link assinado de 1 hora. Quem do
// time abriu (visto_por) e o caminho no storage nunca saem — ver lib/portal/materiais.ts.

const LIMITE = criarLimite(30, 60_000);
const MAX = 30;
const COLS_CARD = "id, title, status, due_date, scheduled_at, publish_verified_at, client_approved_at, archived_at";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cliente = await clienteDoToken(token);
  if (!cliente) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  if (LIMITE.estourou(cliente.id)) return NextResponse.json({ error: "Muitas buscas seguidas. Tente em 1 minuto." }, { status: 429 });

  // select("*"): card_id vem da migration 20260926120000 — antes dela a coluna não existe, e pedir
  // coluna inexistente dá 400 (vira alerta no Sentry). O que sai para o cliente é filtrado em
  // lib/portal/materiais.ts, campo a campo.
  const { data, error } = await supabaseAdmin.from("client_uploads").select("*")
    .eq("client_id", cliente.id).order("created_at", { ascending: false }).limit(MAX);
  if (error) {
    console.error("[portal/materiais] falhou a leitura:", cliente.id, error.message);
    return NextResponse.json({ error: "Não consegui carregar seus envios agora." }, { status: 503 });
  }
  const uploads = (data ?? []) as unknown as LinhaUpload[];

  const idsCard = [...new Set(uploads.map((u) => u.card_id).filter((x): x is string => !!x))];
  const lerCards = async () => {
    if (!idsCard.length) return [] as LinhaCardAgenda[];
    const comIg = await temColunasIg().catch(() => false);
    // O card TEM que ser deste cliente: uma ligação errada não pode mostrar post de outro.
    const r = await supabaseAdmin.from("content_cards").select(comIg ? `${COLS_CARD}, ig_media_id` : COLS_CARD)
      .eq("client_id", cliente.id).in("id", idsCard);
    return ((r.data ?? []) as unknown as LinhaCardAgenda[]);
  };
  const caminhos = uploads.map((u) => u.storage_path).filter((p): p is string => !!p);
  const [cardsLidos, assinadas] = await Promise.all([
    lerCards(),
    caminhos.length
      ? supabaseAdmin.storage.from("client-uploads").createSignedUrls(caminhos, 3600)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);

  const cards = new Map(cardsLidos.map((c) => [c.id, c]));
  const midias = [...new Set(cardsLidos.map((c) => c.ig_media_id).filter((x): x is string => !!x))];
  const links = new Map<string, string>();
  if (midias.length) {
    const { data: posts } = await supabaseAdmin.from("client_ig_posts").select("media_id, permalink")
      .eq("client_id", cliente.id).in("media_id", midias);
    for (const p of posts ?? []) {
      if ((p.permalink as string)?.startsWith("https://")) links.set(p.media_id as string, p.permalink as string);
    }
  }

  const urlPorCaminho = new Map<string, string>();
  for (const s of (assinadas.data ?? []) as { path: string | null; signedUrl: string }[]) {
    const url = paraUrlPublica(s.signedUrl);
    if (s.path && url) urlPorCaminho.set(s.path, url);
  }
  const urls = new Map<string, string>();
  for (const u of uploads) {
    const url = u.storage_path ? urlPorCaminho.get(u.storage_path) : undefined;
    if (url) urls.set(u.id, url);
  }

  return NextResponse.json({ itens: montarMateriais({ uploads, cards, links, urls }) });
}
