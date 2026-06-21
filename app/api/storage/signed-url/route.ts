export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const SIGNED_URL_TTL_SECONDS = 300; // 5 min

// Cofre: buckets PRIVADOS que este endpoint pode assinar (admin-only + log LGPD).
// Mantém a porta fechada — só estes podem virar URL assinada.
const ALLOWED_BUCKETS = new Set(["legal-docs", "contracts", "onboarding-docs", "reports"]);

/**
 * Resolve a ref salva → { bucket, path }. Aceita:
 *   - "legal://<path>"                                   → legal-docs
 *   - ".../storage/v1/object/public|sign/<bucket>/<p>"   → <bucket> (URLs legadas)
 *   - "<bucket>://<path>"                                → <bucket>
 *   - "<path>" cru (sem prefixo)                         → bucketHint ou legal-docs (compat)
 */
function resolveRef(raw: string, bucketHint?: string): { bucket: string; path: string } {
  if (raw.startsWith("legal://")) return { bucket: "legal-docs", path: raw.slice("legal://".length) };
  const urlMatch = raw.match(/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
  if (urlMatch) return { bucket: urlMatch[1], path: decodeURIComponent(urlMatch[2]) };
  const protoMatch = raw.match(/^([a-z0-9][a-z0-9-]*):\/\/(.+)$/i);
  if (protoMatch) return { bucket: protoMatch[1] === "legal" ? "legal-docs" : protoMatch[1], path: protoMatch[2] };
  return { bucket: bucketHint || "legal-docs", path: raw };
}

// Admin-only: gera URL assinada de curta duração pros buckets do cofre.
// Body: { path: string (ref/url), bucket?: string, download?: boolean }
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const rawPath = typeof body.path === "string" ? body.path : "";
  const bucketHint = typeof body.bucket === "string" ? body.bucket : undefined;
  const download = body.download === true;
  if (!rawPath) return NextResponse.json({ error: "path obrigatorio" }, { status: 400 });

  const { bucket, path } = resolveRef(rawPath, bucketHint);
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "bucket nao permitido" }, { status: 400 });
  }
  if (path.includes("..")) {
    return NextResponse.json({ error: "path invalido" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, download ? { download: true } : undefined);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Falha ao gerar URL" }, { status: 500 });
  }

  // Reescreve o hostname interno do Docker pro público (o browser precisa resolver).
  const internalBase = process.env.SUPABASE_INTERNAL_URL ?? "";
  const publicBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let signedUrl = data.signedUrl;
  if (internalBase && publicBase && signedUrl.startsWith(internalBase)) {
    signedUrl = publicBase + signedUrl.slice(internalBase.length);
  }

  // Log de acesso (LGPD). Fire-and-forget. path: "{clientId}/{docType}-{ts}.{ext}".
  const [clientIdFromPath, fileName] = path.split("/", 2);
  const docTypeMatch = fileName?.match(/^([a-z_]+)-/);
  const resourceType = docTypeMatch?.[1] ?? bucket;
  supabaseAdmin.from("vault_access_log").insert({
    user_id: user.id,
    user_email: user.email,
    client_id: clientIdFromPath || null,
    resource_type: resourceType,
    resource_path: `${bucket}/${path}`,
    action: download ? "download" : "signed_url_issued",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  }).then(({ error: logErr }) => {
    if (logErr) console.error("[signed-url] vault_access_log insert failed:", logErr);
  });

  return NextResponse.json({ url: signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}
