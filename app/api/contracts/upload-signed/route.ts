export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB — contrato PDF raramente passa disso
const BUCKET = "legal-docs";
const PATH_PREFIX = "contracts-signed";

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Content-Type deve ser multipart/form-data" }, { status: 400 });

  const file = form.get("file") as File | null;
  const contractId = form.get("contractId") as string | null;
  const method = ((form.get("method") as string) || "d4sign_manual").toLowerCase();

  if (!file || !contractId) {
    return NextResponse.json({ error: "file e contractId são obrigatórios" }, { status: 400 });
  }

  // Valida PDF
  const name = file.name || "signed.pdf";
  const isValidPdf = file.type === "application/pdf" || /\.pdf$/i.test(name);
  if (!isValidPdf) {
    return NextResponse.json({ error: "Formato inválido. Envie um PDF." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo muito grande. Máximo ${MAX_SIZE / 1024 / 1024}MB.` }, { status: 400 });
  }
  if (!["d4sign_manual", "outros", "presencial"].includes(method)) {
    return NextResponse.json({ error: "signature_method inválido" }, { status: 400 });
  }

  // Busca o contrato pra pegar clientId + version
  const { data: contract } = await supabaseAdmin.from("contracts").select("id, client_id, version").eq("id", contractId).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });

  const clientId = (contract as Record<string, unknown>).client_id as string;
  const version = (contract as Record<string, unknown>).version as number | undefined;

  // Path: contracts-signed/{clientId}/{contractId}-v{N}-signed-{timestamp}.pdf
  // Timestamp pra permitir re-upload sem sobrescrever (rastreabilidade).
  const timestamp = Date.now();
  const storagePath = `${PATH_PREFIX}/${clientId}/${contractId}-v${version ?? 1}-signed-${timestamp}.pdf`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadErr) {
    console.error("[upload-signed] storage error:", uploadErr);
    return NextResponse.json({ error: `Falha no upload: ${uploadErr.message}` }, { status: 500 });
  }

  const refPath = `legal://${storagePath}`;
  const { error: updateErr } = await supabaseAdmin.from("contracts").update({
    signed_pdf_path: refPath,
    signed_at: new Date().toISOString(),
    signed_uploaded_by: user.email,
    signature_method: method,
    status: "active",
  }).eq("id", contractId);

  if (updateErr) {
    console.error("[upload-signed] DB update error:", updateErr);
    // Cleanup: remove arquivo órfão do storage pra não acumular
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch((cleanupErr) => {
      console.warn("[upload-signed] orphan cleanup failed:", cleanupErr);
    });
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Timeline + audit
  supabaseAdmin.from("timeline_entries").insert({
    client_id: clientId,
    type: "manual",
    actor: user.email,
    description: `Contrato V${version ?? 1} marcado como assinado (${method === "d4sign_manual" ? "D4Sign" : method}).`,
    timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  }).then(({ error }) => {
    if (error) console.warn("[upload-signed] timeline log failed:", error.message);
  });

  supabaseAdmin.from("vault_access_log").insert({
    user_id: user.id,
    user_email: user.email,
    client_id: clientId,
    resource_type: "contract_signed",
    resource_path: storagePath,
    action: "upload",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  }).then(({ error }) => {
    if (error) console.warn("[upload-signed] audit log failed:", error.message);
  });

  return NextResponse.json({
    ok: true,
    signedPdfPath: refPath,
    signedAt: new Date().toISOString(),
  });
}
