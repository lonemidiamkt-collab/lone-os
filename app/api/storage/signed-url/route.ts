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

  // Rewrite internal Docker hostname to public-facing URL so the browser can resolve it.
  // supabaseAdmin uses SUPABASE_INTERNAL_URL (http://supabase-kong-1:8000) server-side,
  // so signed URLs contain that hostname. Next.js proxies /supabase/storage/* → internal Kong.
  const internalBase = process.env.SUPABASE_INTERNAL_URL ?? "";
  const publicBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let signedUrl = data.signedUrl;
  if (internalBase && publicBase && signedUrl.startsWith(internalBase)) {
    signedUrl = publicBase + signedUrl.slice(internalBase.length);
  }

  // Audit log (LGPD). Fire-and-forget — não bloquear resposta se log falhar.
  // `path` formato: "{clientId}/{docType}-{timestamp}.{ext}" → extrai clientId/docType.
  const [clientIdFromPath, fileName] = path.split("/", 2);
  const docTypeMatch = fileName?.match(/^([a-z_]+)-/);
  const resourceType = docTypeMatch?.[1] ?? "unknown";
  supabaseAdmin.from("vault_access_log").insert({
    user_id: user.id,
    user_email: user.email,
    client_id: clientIdFromPath || null,
    resource_type: resourceType,
    resource_path: path,
    action: download ? "download" : "signed_url_issued",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  }).then(({ error: logErr }) => {
    if (logErr) console.error("[signed-url] vault_access_log insert failed:", logErr);
  });

  return NextResponse.json({ url: signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}
