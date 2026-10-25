export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { anterioresDepoisDaTroca, decidirEnvioAssinado, textoDaTroca } from "@/lib/contracts/pdf-assinado";

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

  // Busca o contrato inteiro: clientId + version, e o PDF assinado que já existe (para a troca).
  // `*` e não a lista de colunas: a coluna de anteriores pode ainda não existir (migration 20261024120000).
  const { data: contract, error: errContrato } = await supabaseAdmin.from("contracts").select("*").eq("id", contractId).maybeSingle();
  if (errContrato) return NextResponse.json({ error: `Não consegui ler o contrato (${errContrato.message}). Nada foi enviado.` }, { status: 503 });
  if (!contract) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const contrato = contract as Record<string, unknown>;

  // 24/10/2026 (auditoria 3.13): já assinado só se troca com `substituir=1` (botão "Trocar PDF
  // assinado", com confirmação) — e a referência do anterior é guardada, nunca apagada.
  const decisao = decidirEnvioAssinado(contrato, form.get("substituir") === "1");
  if (!decisao.ok) return NextResponse.json({ error: decisao.erro }, { status: decisao.status });

  const clientId = contrato.client_id as string;
  const version = contrato.version as number | undefined;

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
  const agora = new Date().toISOString();
  const anteriores = decisao.troca ? anterioresDepoisDaTroca(contrato, user.email || "equipe", agora) : null;
  // O update só vale se o PDF ainda é o que foi lido: duas trocas ao mesmo tempo não podem fazer a
  // segunda apagar a referência que a primeira acabou de guardar.
  const base = supabaseAdmin.from("contracts").update({
    signed_pdf_path: refPath,
    signed_at: agora,
    signed_uploaded_by: user.email,
    signature_method: method,
    status: "active",
    ...(anteriores ? { signed_pdf_anteriores: anteriores } : {}),
  }).eq("id", contractId);
  const lido = (contrato.signed_pdf_path as string | null | undefined) ?? null;
  const { data: gravado, error: updateErr } = await (lido === null ? base.is("signed_pdf_path", null) : base.eq("signed_pdf_path", lido))
    .select("id").maybeSingle();

  if (updateErr || !gravado) {
    console.error("[upload-signed] DB update error:", updateErr ?? "nenhuma linha (PDF mudou no meio)");
    // Cleanup: remove SÓ o arquivo novo, que ficou órfão. O anterior não é tocado.
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch((cleanupErr) => {
      console.warn("[upload-signed] orphan cleanup failed:", cleanupErr);
    });
    if (!updateErr) {
      return NextResponse.json({ error: "Alguém enviou outro PDF assinado para este contrato agora há pouco. Recarregue e confira antes de trocar." }, { status: 409 });
    }
    return NextResponse.json({ error: `Não consegui gravar o PDF assinado: ${updateErr.message}. O contrato ficou como estava.` }, { status: 500 });
  }

  // A troca entra no histórico do contrato (o que a tela mostra em "Histórico").
  const avisos: string[] = [];
  if (anteriores) {
    const { error: eAud } = await supabaseAdmin.from("contract_audit_log").insert({
      contract_id: contractId, action: "signed_replaced", actor: user.email, details: textoDaTroca(anteriores[0]),
    });
    if (eAud) avisos.push("o histórico do contrato não registrou a troca (o PDF anterior continua guardado)");
  }

  // Timeline + audit
  supabaseAdmin.from("timeline_entries").insert({
    client_id: clientId,
    type: "manual",
    actor: user.email,
    description: decisao.troca
      ? `PDF assinado do Contrato V${version ?? 1} trocado (o anterior ficou guardado).`
      : `Contrato V${version ?? 1} marcado como assinado (${method === "d4sign_manual" ? "D4Sign" : method}).`,
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
    troca: decisao.troca,
    signedPdfPath: refPath,
    signedAt: agora,
    avisos,
  });
}
