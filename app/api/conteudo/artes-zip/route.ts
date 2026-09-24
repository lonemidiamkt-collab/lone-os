export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/conteudo/artes-zip { cardIds: string[] } — as artes prontas para agendar no mLabs
// (Leva 7B, N14). Um .zip com uma pasta por card ("2026-09-26-cliente-titulo"), as artes na ordem
// do carrossel (arte-01, arte-02…) e a legenda completa em legenda.txt.
//
// Só vão as ENTREGAS do designer — a referência do social nunca (lib/conteudo/previa.ts →
// artesParaAgendar). Arquivo do bucket "arts" é lido pelo Storage (não depende de URL pública);
// link externo é baixado; o que não der para baixar vira uma linha em LEIA-ME.txt, sem derrubar o resto.

import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { artesParaAgendar, extensaoDaArte, legendaCompleta, nomeDaArte, pastaDoCard } from "@/lib/conteudo/previa";

const BUCKET = "arts";
const MAX_CARDS = 30;
const MAX_BYTES = 150 * 1024 * 1024; // teto do zip inteiro — o VPS tem 4 GB de RAM

async function baixar(a: { url: string; path: string | null }): Promise<{ bytes: Uint8Array; mime: string | null } | null> {
  if (a.path) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(a.path);
    if (!error && data) return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || null };
  }
  try {
    const r = await fetch(a.url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const mime = r.headers.get("content-type");
    if (mime && !/^(image|video)\//.test(mime)) return null; // página do Drive, HTML de erro
    return { bytes: new Uint8Array(await r.arrayBuffer()), mime };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social", "designer"]);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => null) as { cardIds?: unknown } | null;
  const lista: unknown = body?.cardIds;
  const ids = Array.isArray(lista)
    ? [...new Set(lista.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))]
    : [];
  if (!ids.length) return NextResponse.json({ error: "Nenhum card escolhido." }, { status: 400 });
  if (ids.length > MAX_CARDS) return NextResponse.json({ error: `No máximo ${MAX_CARDS} cards por vez.` }, { status: 400 });

  const [{ data: cards, error }, { data: anexos }] = await Promise.all([
    supabaseAdmin.from("content_cards").select("id, title, client_name, due_date, due_time, caption, hashtags, image_url").in("id", ids),
    supabaseAdmin.from("card_attachments").select("card_id, url, path, position, tipo").in("card_id", ids),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cards?.length) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });

  const zip = new JSZip();
  const avisos: string[] = [];
  let total = 0;
  let artes = 0;
  const ordenados = [...cards].sort((a, b) => ((a.due_date as string) ?? "9999").localeCompare((b.due_date as string) ?? "9999"));

  for (const c of ordenados) {
    const pasta = pastaDoCard({ title: (c.title as string) ?? "", clientName: c.client_name as string, dueDate: c.due_date as string | null });
    const dir = ordenados.length > 1 ? zip.folder(pasta)! : zip;
    const legenda = legendaCompleta(c.caption as string | null, c.hashtags as string | null);
    if (legenda) dir.file("legenda.txt", legenda);
    else avisos.push(`${pasta}: sem legenda no card.`);

    const artesDoCard = artesParaAgendar((anexos ?? []).filter((a) => a.card_id === c.id) as { url: string; path: string | null; position: number; tipo: string | null }[], c.image_url as string | null);
    if (!artesDoCard.length) { avisos.push(`${pasta}: nenhuma arte entregue.`); continue; }
    for (const [i, a] of artesDoCard.entries()) {
      const arq = await baixar(a);
      if (!arq) { avisos.push(`${pasta}: não consegui baixar a arte ${i + 1} (${a.url}).`); continue; }
      total += arq.bytes.byteLength;
      if (total > MAX_BYTES) {
        return NextResponse.json({ error: "As artes passam de 150 MB — baixe menos cards por vez." }, { status: 413 });
      }
      dir.file(nomeDaArte(i, extensaoDaArte(a.url, arq.mime)), arq.bytes);
      artes++;
    }
  }

  if (artes === 0) return NextResponse.json({ error: avisos[0] ?? "Nenhuma arte para baixar." }, { status: 404 });
  if (avisos.length) zip.file("LEIA-ME.txt", `Faltou no pacote:\n${avisos.map((a) => `- ${a}`).join("\n")}\n`);

  const conteudo = await zip.generateAsync({ type: "uint8array", compression: "STORE" }); // imagem já é comprimida
  const nome = ordenados.length === 1
    ? `${pastaDoCard({ title: (ordenados[0].title as string) ?? "", clientName: ordenados[0].client_name as string, dueDate: ordenados[0].due_date as string | null })}.zip`
    : `artes-${ordenados.length}-cards.zip`;
  return new NextResponse(Buffer.from(conteudo), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
