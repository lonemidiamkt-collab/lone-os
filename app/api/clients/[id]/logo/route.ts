// app/api/clients/[id]/logo/route.ts
//
// Baixa a LOGO crua do cliente (PNG/JPG/WebP/SVG) como anexo — para o social/designer
// usar nas artes. Acessível a qualquer usuário logado (logo não é dado sensível).
// A imagem é buscada server-side (supabaseAdmin) para evitar problemas de CORS no browser.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

function extFromMime(m: string): string {
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("svg")) return "svg";
  if (m.includes("gif")) return "gif";
  return "png";
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

  const docLogo = client.doc_logo as string;
  let bytes: ArrayBuffer;
  let mime: string;
  try {
    const marker = "/brand-assets/";
    if (docLogo.includes(marker)) {
      const objectPath = decodeURIComponent(docLogo.slice(docLogo.indexOf(marker) + marker.length));
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("brand-assets").download(objectPath);
      if (dlErr || !blob) throw new Error(dlErr?.message || "download falhou");
      bytes = await blob.arrayBuffer();
      mime = blob.type || "image/png";
    } else if (/^https?:\/\//.test(docLogo)) {
      const r = await fetch(docLogo);
      if (!r.ok) throw new Error(`fetch logo HTTP ${r.status}`);
      bytes = await r.arrayBuffer();
      mime = r.headers.get("content-type") || "image/png";
    } else {
      throw new Error("formato de logo não reconhecido");
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao carregar logo: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const name = (client.nome_fantasia || client.name || "cliente") as string;
  const safe = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "cliente";
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="logo-${safe}.${extFromMime(mime)}"`,
      "Cache-Control": "no-store",
    },
  });
}
