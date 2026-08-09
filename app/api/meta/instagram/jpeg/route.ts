// app/api/meta/instagram/jpeg/route.ts — serve uma arte nossa convertida em JPEG.
//
// PRA QUE. Publicar no Instagram pela API não é upload: a Meta BAIXA a imagem de uma URL pública, e
// só aceita JPEG. Quase toda arte do time é PNG (com transparência). Esta rota fica no meio: recebe
// a URL da arte, devolve o mesmo conteúdo em JPEG, achatado sobre branco.
//
// POR QUE NÃO CONVERTER E SALVAR NO STORAGE. Daria o mesmo resultado com mais peças (escrita no
// bucket, nome de arquivo, limpeza depois). A arte JÁ é pública no mesmo domínio — converter na
// hora não expõe nada que não estivesse exposto.
//
// PRECISA SER PÚBLICA (a Meta não manda credencial nossa), e é justamente por isso que ela NÃO
// aceita URL de qualquer lugar: sem a trava de host abaixo, viraria um buscador de URLs internas
// operado por qualquer um de fora (SSRF). Só o nosso storage passa.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/** Único host de onde esta rota aceita baixar. */
const HOST_PERMITIDO = "painel.lonemidia.com";
const PREFIXO_STORAGE = "/supabase/storage/v1/object/public/";

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src") ?? "";
  let alvo: URL;
  try {
    alvo = new URL(src);
  } catch {
    return NextResponse.json({ error: "src inválido" }, { status: 400 });
  }
  if (alvo.protocol !== "https:" || alvo.hostname !== HOST_PERMITIDO || !alvo.pathname.startsWith(PREFIXO_STORAGE)) {
    return NextResponse.json({ error: "src fora do storage permitido" }, { status: 403 });
  }

  const resp = await fetch(alvo.toString(), { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!resp?.ok) return NextResponse.json({ error: `origem devolveu ${resp?.status ?? "erro"}` }, { status: 502 });

  const entrada = Buffer.from(await resp.arrayBuffer());
  // flatten sobre branco: PNG transparente vira preto no JPEG, e arte de cliente ficaria destruída.
  const jpeg = await sharp(entrada)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return new NextResponse(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
