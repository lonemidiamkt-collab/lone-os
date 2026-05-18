export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const BUCKET = "legal-docs";
const PATH_PREFIX = "contracts-legacy";

const VALID_SERVICE_TYPES = new Set(["assessoria_trafego", "assessoria_social", "lone_growth"]);

function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * POST /api/contracts/upload-legacy
 *
 * Anexa contrato JÁ ASSINADO que NÃO foi gerado pelo sistema (papel, D4Sign feito antes,
 * contrato herdado de outra agência etc). Pula a etapa de gerar DOCX/PDF preliminar.
 *
 * Multipart fields:
 *   file (PDF)            — o documento assinado
 *   clientId              — UUID do cliente
 *   serviceType           — assessoria_trafego | assessoria_social | lone_growth
 *   startDate             — ISO YYYY-MM-DD (data de início da vigência)
 *   durationMonths        — número (calcula end_date)
 *   paymentDay            — 1-31
 *   signedAt              — opcional ISO; default = startDate (data de assinatura)
 *   signatureMethod       — opcional (default: "legado")
 *   notes                 — opcional, texto livre que vai no timeline
 *
 * Cria registro `contracts` com status='active', signed_at, signed_pdf_path.
 * Não chama generateDocx — admin trouxe o PDF pronto.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Content-Type deve ser multipart/form-data" }, { status: 400 });

  const file = form.get("file") as File | null;
  const clientId = (form.get("clientId") as string) || "";
  const serviceType = (form.get("serviceType") as string) || "";
  const startDate = (form.get("startDate") as string) || "";
  const durationMonths = parseInt((form.get("durationMonths") as string) || "0", 10);
  const paymentDay = parseInt((form.get("paymentDay") as string) || "10", 10);
  // Valor mensal não é capturado pra contrato legado — fica registrado só no PDF anexado.
  const signedAtRaw = (form.get("signedAt") as string) || startDate;
  const signatureMethod = ((form.get("signatureMethod") as string) || "legado").toLowerCase();
  const notes = (form.get("notes") as string) || "";

  // Validações
  if (!file) return NextResponse.json({ error: "PDF assinado é obrigatório" }, { status: 400 });
  if (!clientId) return NextResponse.json({ error: "clientId é obrigatório" }, { status: 400 });
  if (!VALID_SERVICE_TYPES.has(serviceType)) {
    return NextResponse.json({ error: "serviceType inválido" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "startDate inválido (use YYYY-MM-DD)" }, { status: 400 });
  }
  if (!Number.isFinite(durationMonths) || durationMonths < 1 || durationMonths > 60) {
    return NextResponse.json({ error: "durationMonths deve ser entre 1 e 60" }, { status: 400 });
  }
  if (!Number.isFinite(paymentDay) || paymentDay < 1 || paymentDay > 31) {
    return NextResponse.json({ error: "paymentDay deve ser entre 1 e 31" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedAtRaw)) {
    return NextResponse.json({ error: "signedAt inválido (use YYYY-MM-DD)" }, { status: 400 });
  }

  const isValidPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isValidPdf) return NextResponse.json({ error: "Formato inválido. Envie um PDF." }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Arquivo muito grande. Máximo ${MAX_SIZE / 1024 / 1024}MB.` }, { status: 400 });
  }

  // Cliente existe?
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Calcula próxima versão
  const { data: maxVersionRow } = await supabaseAdmin
    .from("contracts")
    .select("version")
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = maxVersionRow ? Number(maxVersionRow.version) + 1 : 1;

  const endDate = addMonthsIso(startDate, durationMonths);
  const signedAt = `${signedAtRaw}T12:00:00.000Z`; // meio-dia UTC, evita TZ surprises

  // 1. Upload PDF
  const timestamp = Date.now();
  const storagePath = `${PATH_PREFIX}/${clientId}/v${nextVersion}-legacy-${timestamp}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadErr) {
    console.error("[upload-legacy] storage error:", uploadErr);
    return NextResponse.json({ error: `Falha no upload: ${uploadErr.message}` }, { status: 500 });
  }

  const refPath = `legal://${storagePath}`;

  // 2. Insert contrato (já active, já signed)
  const { data: inserted, error: insErr } = await supabaseAdmin.from("contracts").insert({
    client_id: clientId,
    version: nextVersion,
    service_type: serviceType,
    monthly_value: 0, // legado — valor real fica no PDF anexado, não no sistema
    start_date: startDate,
    end_date: endDate,
    duration_months: durationMonths,
    payment_day: paymentDay,
    status: "active",
    signed_at: signedAt,
    signed_pdf_path: refPath,
    signed_uploaded_by: user.email,
    signature_method: signatureMethod,
    generated_by: "Importado (legado)",
    has_renewal: false,
  }).select("id").maybeSingle();

  if (insErr || !inserted) {
    console.error("[upload-legacy] DB insert error:", insErr);
    // tenta limpar o arquivo recém-uploadado pra não deixar lixo
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: insErr?.message ?? "Falha ao salvar contrato" }, { status: 500 });
  }

  const clientName = (client as { nome_fantasia?: string; name?: string }).nome_fantasia
    || (client as { nome_fantasia?: string; name?: string }).name
    || "Cliente";

  // 3. Timeline + audit (não-bloqueante)
  const desc = notes
    ? `Contrato V${nextVersion} importado (legado) — ${signatureMethod}. Vigência ${startDate} → ${endDate}. ${notes}`
    : `Contrato V${nextVersion} importado (legado) — ${signatureMethod}. Vigência ${startDate} → ${endDate}.`;

  supabaseAdmin.from("timeline_entries").insert({
    client_id: clientId,
    type: "manual",
    actor: user.email,
    description: desc,
    timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  }).then(({ error }) => { if (error) console.warn("[upload-legacy] timeline failed:", error.message); });

  supabaseAdmin.from("vault_access_log").insert({
    user_id: user.id,
    user_email: user.email,
    client_id: clientId,
    resource_type: "contract_legacy",
    resource_path: storagePath,
    action: "upload",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  }).then(({ error }) => { if (error) console.warn("[upload-legacy] audit failed:", error.message); });

  return NextResponse.json({
    ok: true,
    contractId: (inserted as { id: string }).id,
    version: nextVersion,
    clientName,
    endDate,
    signedPdfPath: refPath,
  });
}
