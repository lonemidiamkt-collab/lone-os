// app/api/clients/[id]/logo-pdf/route.ts
//
// Gera um PDF A4 com a logo do cliente centralizada (download dentro da plataforma).
// Acessível a qualquer usuário logado (social/designer/admin) — logo não é sensível.
// A imagem é baixada server-side e embutida como data URI (o browserless da rede
// interna não resolve o host do app), depois renderizada via htmlToPdf.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { htmlToPdf } from "@/lib/traffic/renderPdf";

function mimeFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const { id } = await params;
  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("name, nome_fantasia, doc_logo")
    .eq("id", id)
    .single();
  if (error || !client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!client.doc_logo) return NextResponse.json({ error: "Cliente sem logo cadastrada" }, { status: 400 });

  const name = (client.nome_fantasia || client.name || "Cliente") as string;
  const docLogo = client.doc_logo as string;

  // Baixa a logo e embute como data URI.
  let dataUri: string;
  try {
    const marker = "/brand-assets/";
    let bytes: ArrayBuffer;
    let mime: string;
    if (docLogo.includes(marker)) {
      const objectPath = decodeURIComponent(docLogo.slice(docLogo.indexOf(marker) + marker.length));
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("brand-assets").download(objectPath);
      if (dlErr || !blob) throw new Error(dlErr?.message || "download falhou");
      bytes = await blob.arrayBuffer();
      mime = blob.type || mimeFromPath(objectPath);
    } else if (/^https?:\/\//.test(docLogo)) {
      const r = await fetch(docLogo);
      if (!r.ok) throw new Error(`fetch logo HTTP ${r.status}`);
      bytes = await r.arrayBuffer();
      mime = r.headers.get("content-type") || mimeFromPath(docLogo);
    } else {
      throw new Error("formato de logo não reconhecido");
    }
    dataUri = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao carregar logo: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Inter, Arial, sans-serif; }
    .page { width: 210mm; height: 297mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; background: #ffffff; }
    .logo { max-width: 150mm; max-height: 170mm; object-fit: contain; }
    .name { font-size: 22px; font-weight: 600; color: #111111; }
    .tag { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #9aa0a6; }
  </style></head><body>
    <div class="page">
      <img class="logo" src="${dataUri}" />
      <div class="name">${escapeHtml(name)}</div>
      <div class="tag">Lone Mídia</div>
    </div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) {
    return NextResponse.json({ error: pdf.error || "Falha ao gerar PDF" }, { status: 500 });
  }

  const safe = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "cliente";
  return new NextResponse(new Uint8Array(pdf.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="logo-${safe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
