// app/api/cs/ler-pdf/route.ts — extrai o TEXTO de um PDF que o social colou/subiu.
//
// PRA QUE (Roberto, 05/08): o social recebe o material do cliente em PDF — tabela de preço,
// catálogo, apresentação da loja. Hoje ele lê e redigita à mão no briefing, ou não redigita, e o
// agente monta roteiro e planejamento sem saber o que a loja vende.
//
// O texto extraído vai pro campo de material do briefing. Dali o motor de conteúdo já usa: é o
// mesmo caminho do que é digitado (lib/cs/estrategista.ts).
//
// LIMITES DE PROPÓSITO — PDF é entrada de arquivo, o lugar clássico de derrubar servidor:
//   · 12 MB: catálogo de loja não passa disso; acima é quase sempre PDF-imagem que não tem texto
//   · 60 páginas: além disso a extração fica cara e ninguém lê um briefing com 60 páginas
//   · 40 mil caracteres no retorno: o resto seria cortado no prompt de qualquer jeito

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PAGINAS = 60;
const MAX_CHARS = 40_000;

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo no campo 'file'." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `PDF muito grande (${(file.size / 1048576).toFixed(1)} MB). O limite é 12 MB.` }, { status: 413 });
  }
  const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!ehPdf) return NextResponse.json({ error: "Só leio PDF por aqui." }, { status: 415 });

  try {
    // Import dinâmico: a lib lê o disco no topo do módulo e quebraria o build do Next se
    // carregada estaticamente.
    const pdfParse = (await import("pdf-parse")).default as (b: Buffer, o?: Record<string, unknown>) => Promise<{ text: string; numpages: number }>;
    const buf = Buffer.from(await file.arrayBuffer());
    const r = await pdfParse(buf, { max: MAX_PAGINAS });

    const texto = (r.text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")   // PDF vira um monte de linha vazia; compacta
      .trim();

    if (!texto) {
      // PDF de imagem (foto de catálogo, print escaneado) não tem texto embutido. Dizer isso é
      // melhor que devolver vazio e deixar a pessoa achando que o sistema engoliu o arquivo.
      return NextResponse.json({
        ok: false,
        error: "Esse PDF não tem texto — parece ser imagem escaneada. Copie o texto e cole no campo, ou me mande o arquivo original.",
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      paginas: r.numpages,
      cortado: texto.length > MAX_CHARS,
      texto: texto.slice(0, MAX_CHARS),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Não consegui ler o PDF: ${e instanceof Error ? e.message : "erro"}`,
    }, { status: 500 });
  }
}
