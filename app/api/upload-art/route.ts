export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const BUCKET = "arts";
const MAX_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "video/mp4",
  "video/webm",
]);

const ALLOWED_EXT_PER_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * POST /api/upload-art
 *
 * FormData:
 *   - file: File (PNG/JPEG/WebP/GIF/PDF/MP4/WebM, até 25MB)
 *   - cardId: string (id do content_card — usado pra organizar storage path)
 *
 * Retorna { url: string } com a public URL do bucket.
 *
 * Auth: aceita Supabase session OU LocalSession (fallback do app). Sem auth → 401.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida ou ausente" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Form data inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  const cardId = (formData.get("cardId") as string | null)?.trim() || "misc";

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  }
  const blob = file as File;

  // Validações
  if (blob.size === 0) {
    return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
  }
  if (blob.size > MAX_SIZE) {
    return NextResponse.json({
      error: `Arquivo muito grande (${(blob.size / 1024 / 1024).toFixed(1)}MB). Máximo: 25MB`,
    }, { status: 413 });
  }
  if (!ALLOWED_MIMES.has(blob.type)) {
    return NextResponse.json({
      error: `Tipo de arquivo não suportado (${blob.type}). Aceitos: PNG, JPEG, WebP, GIF, PDF, MP4, WebM`,
    }, { status: 415 });
  }

  // Upload
  const ext = ALLOWED_EXT_PER_MIME[blob.type] || "bin";
  const ts = Date.now();
  const safeCardId = cardId.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${safeCardId}/${ts}.${ext}`;

  try {
    const buffer = Buffer.from(await blob.arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: blob.type,
        upsert: true,
      });

    if (uploadErr) {
      console.error("[upload-art] storage error:", uploadErr);
      return NextResponse.json({ error: `Falha no upload: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: pub.publicUrl, path, size: blob.size, type: blob.type });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[upload-art] unhandled:", err);
    return NextResponse.json({ error: `Erro no upload: ${msg}` }, { status: 500 });
  }
}
