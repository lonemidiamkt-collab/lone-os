export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/contracts/gerar — registra um contrato novo (ou a renovação de um) com o PDF de prévia.
//
// 21/10/2026 (auditoria de erro recuperável, 3.6): antes a aba Contratos subia o PDF e inseria a
// linha direto pelo navegador, sem olhar o erro de nenhum dos dois — a tela fechava como "salvo" com
// nada gravado. E a versão era "contratos na tela + 1": com a lista falhando, saía V1 de novo.
// Agora: só gestão; a versão vem do banco (maior + 1); se a linha não grava, o PDF enviado é apagado
// e a resposta diz o que houve. A tela só fecha com `ok`.
//
// Multipart: file (PDF gerado na tela) + clientId, serviceType, monthlyValue, startDate,
// durationMonths, paymentDay, previousContractId?, hasRenewal?, renewalValue?

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { validarNovoContrato, proximaVersao } from "@/lib/contracts/registro";
import { SERVICE_LABELS } from "@/lib/contracts/types";

const MAX_PDF = 20 * 1024 * 1024;
const BUCKET = "contracts";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envio inválido (esperava o PDF do contrato)." }, { status: 400 });

  const campos: Record<string, unknown> = {};
  for (const k of ["clientId", "serviceType", "monthlyValue", "startDate", "durationMonths", "paymentDay", "previousContractId", "hasRenewal", "renewalValue"]) {
    campos[k] = form.get(k);
  }
  const v = validarNovoContrato(campos);
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
  const c = v.dados;

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "O PDF do contrato não chegou. Gere de novo." }, { status: 400 });
  }
  if (file.size > MAX_PDF) return NextResponse.json({ error: "PDF do contrato maior que 20 MB." }, { status: 400 });

  const { data: cliente, error: eCli } = await supabaseAdmin.from("clients").select("id").eq("id", c.clientId).maybeSingle();
  if (eCli) return NextResponse.json({ error: "Não consegui conferir o cliente agora. Tente de novo." }, { status: 503 });
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  // Versão pelo BANCO. Leitura que falha não pode virar "nenhum contrato" → V1 repetida.
  const { data: maior, error: eVer } = await supabaseAdmin.from("contracts")
    .select("version").eq("client_id", c.clientId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (eVer) return NextResponse.json({ error: "Não consegui ler os contratos deste cliente para numerar a versão. Nada foi gravado — tente de novo." }, { status: 503 });
  const version = proximaVersao(maior?.version as number | undefined);

  let renovaVersao: number | null = null;
  if (c.previousContractId) {
    const { data: ant, error: eAnt } = await supabaseAdmin.from("contracts")
      .select("version, client_id").eq("id", c.previousContractId).maybeSingle();
    if (eAnt) return NextResponse.json({ error: "Não consegui ler o contrato que está sendo renovado. Tente de novo." }, { status: 503 });
    if (!ant || ant.client_id !== c.clientId) return NextResponse.json({ error: "O contrato renovado não é deste cliente." }, { status: 400 });
    renovaVersao = ant.version as number;
  }

  const { data: membro } = await supabaseAdmin.from("team_members").select("name").eq("email", (user.email || "").toLowerCase()).maybeSingle();
  const autor = (membro?.name as string) || user.email || "Equipe";

  // 1) PDF
  const caminho = `${c.clientId}/contrato-v${version}-${Date.now()}.pdf`;
  const { error: eUp } = await supabaseAdmin.storage.from(BUCKET)
    .upload(caminho, Buffer.from(await file.arrayBuffer()), { contentType: "application/pdf", upsert: false });
  if (eUp) {
    console.error("[contracts/gerar] upload:", eUp.message);
    return NextResponse.json({ error: `Não consegui guardar o PDF do contrato: ${eUp.message}. Nada foi gravado.` }, { status: 500 });
  }
  // Mesmo formato de pdf_url que a tela gravava (os contratos antigos estão assim).
  const pdfUrl = `/storage/v1/object/public/${BUCKET}/${caminho}`;

  // 2) Linha do contrato
  const { data: criado, error: eIns } = await supabaseAdmin.from("contracts").insert({
    client_id: c.clientId, version, service_type: c.serviceType,
    monthly_value: c.monthlyValue, start_date: c.startDate, end_date: c.endDate,
    duration_months: c.durationMonths, status: "draft", pdf_url: pdfUrl, generated_by: autor,
    payment_day: c.paymentDay, previous_contract_id: c.previousContractId,
    has_renewal: c.hasRenewal, renewal_value: c.renewalValue,
  }).select("id, version").single();
  if (eIns || !criado) {
    console.error("[contracts/gerar] insert:", eIns?.message);
    await supabaseAdmin.storage.from(BUCKET).remove([caminho]).then(() => {}, () => {});
    return NextResponse.json({ error: `Não consegui gravar o contrato: ${eIns?.message ?? "sem resposta do banco"}. Nada foi salvo — tente de novo.` }, { status: 500 });
  }

  // 3) Rastro (histórico do contrato + linha do tempo do cliente). O contrato JÁ está gravado: se o
  //    rastro falhar, a resposta continua ok mas diz o que ficou faltando.
  const avisos: string[] = [];
  const servico = SERVICE_LABELS[c.serviceType] ?? c.serviceType;
  const auditoria = [
    { contract_id: criado.id, action: "generated", actor: autor, details: `Contrato V${version} gerado — ${servico} — ${brl(c.monthlyValue)}/mes` },
    ...(renovaVersao != null ? [{ contract_id: criado.id, action: "renewal", actor: autor, details: `Renovacao do Contrato V${renovaVersao}` }] : []),
  ];
  const { error: eAud } = await supabaseAdmin.from("contract_audit_log").insert(auditoria);
  if (eAud) avisos.push("o histórico do contrato não registrou a geração");
  const { error: eTl } = await supabaseAdmin.from("timeline_entries").insert({
    client_id: c.clientId, type: "manual", actor: autor,
    description: `Contrato V${version} (${servico}) ${renovaVersao != null ? "renovado" : "gerado"} — ${brl(c.monthlyValue)}/mes`,
    timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
  if (eTl) avisos.push("a linha do tempo do cliente não registrou");

  return NextResponse.json({ ok: true, id: criado.id, version: criado.version, avisos });
}
