export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const SIGNED_URL_TTL_SECONDS = 300; // 5 min

// Admin-only endpoint that mints short-lived signed URLs for the legal-docs bucket.
// Body: { path: string, download?: boolean }
// - path accepts either a raw storage path ("clientId/contrato_social-123.pdf")
//   or the prefixed ref saved in the DB ("legal://clientId/contrato_social-123.pdf").
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawPath = typeof body.path === "string" ? body.path : "";
  const download = body.download === true;

  if (!rawPath) {
    return NextResponse.json({ error: "path obrigatorio" }, { status: 400 });
  }

  const path = rawPath.startsWith("legal://") ? rawPath.slice("legal://".length) : rawPath;
  // Prevent directory traversal
  if (path.includes("..")) {
    return NextResponse.json({ error: "path invalido" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from("legal-docs")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, download ? { download: true } : undefined);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Falha ao gerar URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}
