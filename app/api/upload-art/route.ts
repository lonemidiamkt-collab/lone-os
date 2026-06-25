export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const BUCKET = "arts";
const MAX_CARD_SIZE = 10 * 1024 * 1024; // 10MB para card attachments
const MAX_MISC_SIZE = 25 * 1024 * 1024; // 25MB para uploads avulsos
const MAX_CARD_ATTACHMENTS = 5;

const CARD_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MISC_MIMES = new Set([...CARD_MIMES, "application/pdf", "video/mp4", "video/webm"]);

const EXT_MAP: Record<string, string> = {
  "image/png":     "png",
  "image/jpeg":    "jpg",
  "image/jpg":     "jpg",
  "image/webp":    "webp",
  "image/gif":     "gif",
  "application/pdf": "pdf",
  "video/mp4":     "mp4",
  "video/webm":    "webm",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detecta MIME real pelos primeiros bytes do arquivo.
 * Rejeita arquivos com content-type adulterado (ex: PDF renomeado para .png).
 */
function detectMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  // GIF87a ou GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  // PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  // MP4: ftyp box em offset 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "video/mp4";
  return null;
}

/** Converte URL interna do Docker (supabase-kong-1) para URL pública acessível pelo browser. */
function resolvePublicUrl(path: string): string {
  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  let url = pub.publicUrl;
  const internalBase = process.env.SUPABASE_INTERNAL_URL ?? "";
  const publicBase   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (internalBase && publicBase && url.startsWith(internalBase)) {
    url = publicBase + url.slice(internalBase.length);
  }
  return url;
}

/** Extrai o path relativo dentro do bucket a partir de uma URL pública. */
function extractStoragePath(imageUrl: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  try {
    const { pathname } = new URL(imageUrl);
    const idx = pathname.indexOf(marker);
    if (idx !== -1) return pathname.slice(idx + marker.length);
  } catch { /* URL inválida, tenta no string cru */ }
  const idx = imageUrl.indexOf(marker);
  return idx !== -1 ? imageUrl.slice(idx + marker.length) : imageUrl;
}

/**
 * POST /api/upload-art
 *
 * Dois modos de operação:
 *
 * CARD MODE (cardId é UUID válido):
 *   - Aceita 1–5 arquivos via FormData (campo "file", repetível)
 *   - Tipos aceitos: PNG, JPEG, WebP, GIF — validação real por magic number
 *   - Limite: 10MB por arquivo, 5 attachments por card no total
 *   - Migração silenciosa: se o card tem image_url e 0 card_attachments,
 *     chama RPC migrate_image_url_to_attachment antes de inserir os novos arquivos
 *   - Retorna: { attachments: CardAttachment[] }
 *
 * MISC MODE (cardId ausente, "misc" ou não-UUID):
 *   - Comportamento original: aceita 1 arquivo, tipos amplos (incluindo PDF/vídeo)
 *   - Limite: 25MB
 *   - NÃO insere em card_attachments
 *   - Retorna: { url, path, size, type }
 *
 * Auth: qualquer usuário autenticado (admin, manager, staff). Sem auth → 401.
 */
// Teto do content-length: 5 arquivos × 10MB + 1MB de overhead multipart.
// Primeira camada de defesa — rejeita bodies absurdos antes de gastar parse.
const CARD_BODY_HARD_LIMIT = MAX_CARD_ATTACHMENTS * MAX_CARD_SIZE + 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida ou ausente" }, { status: 401 });
  }

  // Camada 1: content-length como teto generoso (cobre overhead multipart).
  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength > CARD_BODY_HARD_LIMIT) {
    return NextResponse.json(
      { error: `Upload excede o tamanho máximo permitido (${MAX_CARD_ATTACHMENTS} artes × ${MAX_CARD_SIZE / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    // Se o body ainda estourar o parser do Next.js (ex: arquivo entre 51MB e content-length válido),
    // tenta distinguir erro de tamanho pelo message para retornar 413 em vez de 400 genérico.
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("size") || msg.includes("limit") || msg.includes("large") || msg.includes("maxbody")) {
      return NextResponse.json({ error: "Upload excede o tamanho máximo permitido" }, { status: 413 });
    }
    return NextResponse.json({ error: "Form data inválido" }, { status: 400 });
  }

  const rawCardId = (formData.get("cardId") as string | null)?.trim() ?? "misc";
  const isCardMode = UUID_RE.test(rawCardId);
  const cardId = rawCardId.replace(/[^a-zA-Z0-9_-]/g, "");

  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
  }

  if (isCardMode) {
    // Um UUID pode ser um content_card OU uma demanda (design_request). Demandas sobem
    // como upload avulso (o modal de briefing faz o vínculo e usa a URL retornada);
    // content_cards seguem o fluxo de anexos. Evita o falso "Card não encontrado".
    const { data: contentCard } = await supabaseAdmin
      .from("content_cards").select("id").eq("id", cardId).maybeSingle();
    if (contentCard) return handleCardUpload(cardId, files);
    const { data: designReq } = await supabaseAdmin
      .from("design_requests").select("id").eq("id", cardId).maybeSingle();
    if (designReq) return handleMiscUpload(cardId, files[0]);
    return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
  }
  return handleMiscUpload(cardId, files[0]);
}

// ── CARD MODE ─────────────────────────────────────────────────────────────────

async function handleCardUpload(cardId: string, files: File[]): Promise<NextResponse> {
  if (files.length > MAX_CARD_ATTACHMENTS) {
    return NextResponse.json({
      error: `Máximo ${MAX_CARD_ATTACHMENTS} arquivos por upload`,
    }, { status: 400 });
  }

  // Valida todos os arquivos antes de qualquer I/O
  const buffers: Buffer[] = [];
  for (const file of files) {
    if (file.size === 0) {
      return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
    }
    if (file.size > MAX_CARD_SIZE) {
      return NextResponse.json({
        error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 10MB`,
      }, { status: 413 });
    }
    if (!CARD_MIMES.has(file.type)) {
      return NextResponse.json({
        error: `Tipo não suportado (${file.type}). Aceitos: PNG, JPEG, WebP, GIF`,
      }, { status: 415 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const detected = detectMime(buf);
    // Rejeita se magic number não confirmar um tipo de imagem aceito
    if (!detected || !CARD_MIMES.has(detected)) {
      return NextResponse.json({
        error: `Conteúdo do arquivo não corresponde ao tipo declarado (${file.type})`,
      }, { status: 415 });
    }
    buffers.push(buf);
  }

  // Estado atual do card: count de attachments existentes + image_url legado
  const [{ data: cardData }, { count: existingCount }] = await Promise.all([
    supabaseAdmin.from("content_cards").select("image_url").eq("id", cardId).maybeSingle(),
    supabaseAdmin.from("card_attachments").select("id", { count: "exact", head: true }).eq("card_id", cardId),
  ]);

  if (!cardData) {
    return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
  }

  const hasImageUrl  = Boolean(cardData.image_url);
  const currentCount = existingCount ?? 0;
  // Se há image_url e 0 attachments, a migração silenciosa criará 1 attachment (position 0)
  const effectiveCount = currentCount + (hasImageUrl && currentCount === 0 ? 1 : 0);

  if (effectiveCount + files.length > MAX_CARD_ATTACHMENTS) {
    return NextResponse.json({
      error: `Limite de ${MAX_CARD_ATTACHMENTS} artes por card atingido (existentes: ${effectiveCount}, tentando adicionar: ${files.length})`,
    }, { status: 400 });
  }

  // Migração silenciosa via RPC (INSERT + UPDATE atômicos no banco)
  // Pré-condição verificada aqui: hasImageUrl && currentCount === 0
  if (hasImageUrl && currentCount === 0) {
    const imageUrl     = cardData.image_url as string;
    const migrationPath = extractStoragePath(imageUrl);

    const { error: rpcErr } = await supabaseAdmin.rpc("migrate_image_url_to_attachment", {
      p_card_id: cardId,
      p_url:     imageUrl,
      p_path:    migrationPath,
    });
    if (rpcErr) {
      console.error("[upload-art] silent migration failed:", rpcErr);
      return NextResponse.json({ error: `Falha na migração silenciosa: ${rpcErr.message}` }, { status: 500 });
    }
  }

  // Posição de início = max(position) + 1 após possível migração
  const { data: maxPos } = await supabaseAdmin
    .from("card_attachments")
    .select("position")
    .eq("card_id", cardId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startPosition = maxPos ? (maxPos.position as number) + 1 : 0;
  const ts = Date.now();
  const createdAttachments: unknown[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const buf  = buffers[i];
    const ext  = EXT_MAP[file.type] ?? "bin";
    const path = `${cardId}/${ts}_${i}.${ext}`;
    const position = startPosition + i;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.error("[upload-art] storage error:", uploadErr);
      return NextResponse.json({ error: `Falha no upload: ${uploadErr.message}` }, { status: 500 });
    }

    const url = resolvePublicUrl(path);

    const { data: attachment, error: dbErr } = await supabaseAdmin
      .from("card_attachments")
      .insert({ card_id: cardId, url, path, position })
      .select()
      .single();

    if (dbErr) {
      // Ação compensatória: remove arquivo do Storage para evitar órfão
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      console.error("[upload-art] db insert failed, storage rolled back:", dbErr);
      return NextResponse.json({ error: `Falha ao salvar attachment: ${dbErr.message}` }, { status: 500 });
    }

    createdAttachments.push(attachment);
  }

  return NextResponse.json({ attachments: createdAttachments });
}

// ── MISC MODE (comportamento original) ────────────────────────────────────────

async function handleMiscUpload(cardId: string, file: File): Promise<NextResponse> {
  if (file.size === 0) {
    return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
  }
  if (file.size > MAX_MISC_SIZE) {
    return NextResponse.json({
      error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: 25MB`,
    }, { status: 413 });
  }
  if (!MISC_MIMES.has(file.type)) {
    return NextResponse.json({
      error: `Tipo não suportado (${file.type}). Aceitos: PNG, JPEG, WebP, GIF, PDF, MP4, WebM`,
    }, { status: 415 });
  }

  const ext  = EXT_MAP[file.type] ?? "bin";
  const path = `${cardId}/${Date.now()}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadErr) {
      console.error("[upload-art] storage error:", uploadErr);
      return NextResponse.json({ error: `Falha no upload: ${uploadErr.message}` }, { status: 500 });
    }

    const url = resolvePublicUrl(path);
    return NextResponse.json({ url, path, size: file.size, type: file.type });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[upload-art] unhandled:", err);
    return NextResponse.json({ error: `Erro no upload: ${msg}` }, { status: 500 });
  }
}
