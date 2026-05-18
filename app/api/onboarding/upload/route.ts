import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://supabase-kong-1:8000";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Route uploads to the correct bucket by document type.
// - logo          → brand-assets (public, served via publicUrl)
// - contrato_social, identidade → legal-docs (private, served via signed URL from /api/storage/signed-url)
const BUCKET_BY_DOC_TYPE: Record<string, "brand-assets" | "legal-docs"> = {
  logo: "brand-assets",
  contrato_social: "legal-docs",
  identidade: "legal-docs",
};

// ─── Rate limit (in-memory, single-instance) ─────────────────
// Evita spam de uploads que pode entupir o bucket com arquivos grandes.
// Limite: 1 upload por IP a cada 5 segundos. Suficiente pra onboarding
// legítimo (usuário leva >5s entre uploads manuais) e bloqueia automação hostil.
const uploadWindow = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 5_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const last = uploadWindow.get(ip);
  if (last && now - last < RATE_LIMIT_WINDOW_MS) return true;
  uploadWindow.set(ip, now);
  // GC: em vez de janela deslizante perfeita, limpamos entradas velhas a cada 100 uploads
  // pra evitar vazamento de memória com muitos IPs distintos.
  if (uploadWindow.size > 100) {
    for (const [k, t] of uploadWindow) {
      if (now - t > RATE_LIMIT_WINDOW_MS) uploadWindow.delete(k);
    }
  }
  return false;
}

function getClientIp(req: NextRequest): string {
  // Cloudflare → Nginx → Next: o IP real vem em x-forwarded-for (primeiro IP da lista).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Muitos uploads em pouco tempo. Aguarde 5 segundos e tente novamente." },
      { status: 429 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("clientId") as string;
  const docType = formData.get("docType") as string;

  if (!file || !clientId || !docType) {
    return NextResponse.json({ error: "file, clientId and docType required" }, { status: 400 });
  }

  const bucket = BUCKET_BY_DOC_TYPE[docType];
  if (!bucket) {
    return NextResponse.json({ error: `docType invalido: ${docType}` }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
  const allowedExts = /\.(jpg|jpeg|png|webp|heic|heif|pdf)$/i;
  if (!allowedTypes.includes(file.type) && !allowedExts.test(file.name)) {
    return NextResponse.json({ error: "Formato nao suportado. Use JPG, PNG ou PDF." }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Arquivo muito grande. Maximo 10MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${clientId}/${docType}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    console.error("[Upload]", bucket, "error:", error);
    return NextResponse.json({ error: "Falha no upload: " + error.message }, { status: 500 });
  }

  // Map docType → clients table column
  const DOC_COLUMN: Record<string, string> = {
    contrato_social: "doc_contrato_social",
    identidade: "doc_identidade",
    logo: "doc_logo",
  };

  const dbColumn = DOC_COLUMN[docType];

  // Public bucket: return usable public URL.
  // Private bucket: return the storage path (prefixed) — frontend must request a signed URL to access.
  if (bucket === "brand-assets") {
    const publicUrl = `/storage/v1/object/public/${bucket}/${path}`;
    // Persist URL to clients table server-side (service role bypasses RLS, no client-side auth needed)
    if (dbColumn) {
      await supabase.from("clients").update({ [dbColumn]: publicUrl }).eq("id", clientId);
    }
    return NextResponse.json({ url: publicUrl, path, bucket });
  }

  // Private: save prefixed path so frontend can distinguish it from legacy public URLs
  const privateRef = `legal://${path}`;
  // Persist URL to clients table server-side (service role bypasses RLS)
  if (dbColumn) {
    const { error: dbErr } = await supabase.from("clients").update({ [dbColumn]: privateRef }).eq("id", clientId);
    if (dbErr) console.error("[Upload] DB update failed:", dbErr);
  }
  return NextResponse.json({ url: privateRef, path, bucket });
}
