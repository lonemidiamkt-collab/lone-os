// app/api/cs/texto-pdf/route.ts — transforma texto colado em PDF com a marca da Lone.
//
// PRA QUE (Roberto, 10/08): "loninho, transforma esse roteiro em pdf pra eu enviar ao cliente
// varejão". Ele cola o roteiro no grupo e quer o documento pronto. O PDF de roteiro que existia só
// funcionava quando a IA GERAVA o roteiro — o caminho inverso, que é o mais usado no dia a dia,
// não existia.
//
// POST { texto, cliente?, clientId?, tipo?, groupJid? }
//   sem groupJid → devolve o PDF na resposta
//   com groupJid → manda o arquivo no grupo
//
// A IA NÃO ENCOSTA NO TEXTO. Isto é diagramação, não redação: sai exatamente o que entrou. Se a
// fala fosse "melhorada" no caminho, o roteiro que chega no cliente não seria o aprovado — e
// ninguém perceberia, porque o PDF sai bonito de qualquer jeito.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { lerBlocos, blocosPdfHtml } from "@/lib/cs/texto-para-pdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { csSendGroupDocument } from "@/lib/cs/notify";
import { spNow } from "@/lib/cs/vigilancia";

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "documento";

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const texto = (body?.texto as string ?? "").trim();
  const cliente = (body?.cliente as string ?? "").trim() || "Lone Mídia";
  const tipo = (body?.tipo as string ?? "").trim() || "Roteiro de Vídeo";
  const groupJid = (body?.groupJid as string) || "";

  if (texto.length < 30) {
    return NextResponse.json({ error: "texto muito curto pra virar documento" }, { status: 400 });
  }

  const blocos = lerBlocos(texto);
  if (!blocos.length) return NextResponse.json({ error: "não encontrei conteúdo no texto" }, { status: 400 });

  const now = spNow();
  const dataLabel = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  // Logo é enfeite: se falhar, o cabeçalho cai pro nome escrito e o documento sai igual. Não vale
  // segurar um PDF de cliente por causa de uma imagem.
  const logo = await loadLoneLogo().catch(() => "");

  const pdf = await htmlToPdf(blocosPdfHtml(cliente, blocos, logo, dataLabel, tipo));
  if (!pdf.ok || !pdf.buffer) {
    return NextResponse.json({ error: pdf.error ?? "falha ao renderizar o PDF" }, { status: 502 });
  }

  const nomeArquivo = `${slug(tipo)}-${slug(cliente)}.pdf`;

  if (!groupJid) {
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nomeArquivo}"` },
    });
  }

  const legenda = `📄 *${tipo} — ${cliente}*\n${blocos.length} ${blocos.length === 1 ? "bloco" : "blocos"} · ${dataLabel}`;
  const env = await csSendGroupDocument(groupJid, pdf.buffer.toString("base64"), nomeArquivo, legenda);
  return NextResponse.json({
    ok: env.ok, cliente, blocos: blocos.length, arquivo: nomeArquivo,
    ...(env.ok ? {} : { error: env.error }),
  });
}
