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

export async function POST(req: NextRequest) {
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

  // Public bucket: return usable public URL.
  // Private bucket: return the storage path (prefixed) — frontend must request a signed URL to access.
  if (bucket === "brand-assets") {
    const publicUrl = `/storage/v1/object/public/${bucket}/${path}`;
    return NextResponse.json({ url: publicUrl, path, bucket });
  }

  // Private: we save a prefixed path in the DB so downstream code can distinguish
  // legacy public URLs from private-paths that need signing.
  const privateRef = `legal://${path}`;
  return NextResponse.json({ url: privateRef, path, bucket });
}
