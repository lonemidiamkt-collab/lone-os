export const runtime = "nodejs"; // fs + docxtemplater precisam de Node, não Edge

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { generateContractDocx, type ContractMergeData } from "@/lib/contracts/generateDocx";

/**
 * POST /api/contracts/download-docx
 *
 * Gera o .docx preenchido com os dados do cliente + campos comerciais
 * e devolve como download. Admin sobe manualmente no D4Sign depois.
 *
 * Body:
 *   {
 *     clientId: string,
 *     serviceType: "assessoria_social" | "assessoria_trafego" | "lone_growth",
 *     valorMensal: number,
 *     duracaoMeses: number,
 *     diaPagamento: number
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    // Admin-only. Contratos expõem CNPJ/CPF/valor/endereço do cliente → LGPD.
    // /api/contracts está em PUBLIC_PATHS no middleware, então gating é aqui.
    const user = await getServerUser(req);
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

    const body = await req.json();
    const { clientId, serviceType, valorMensal, duracaoMeses, diaPagamento, version, hasRenewal, renewalValue, signerEmail } = body;

    if (!clientId || !serviceType) {
      return NextResponse.json({ error: "clientId e serviceType são obrigatórios" }, { status: 400 });
    }
    if (!valorMensal || !duracaoMeses || !diaPagamento) {
      return NextResponse.json({ error: "valorMensal, duracaoMeses e diaPagamento são obrigatórios" }, { status: 400 });
    }
    const dia = Number(diaPagamento);
    const duracao = Number(duracaoMeses);
    if (dia < 1 || dia > 31 || !Number.isInteger(dia)) {
      return NextResponse.json({ error: "diaPagamento deve ser entre 1 e 31" }, { status: 400 });
    }
    if (duracao < 1 || duracao > 60 || !Number.isInteger(duracao)) {
      return NextResponse.json({ error: "duracaoMeses deve ser entre 1 e 60" }, { status: 400 });
    }
    if (Number(valorMensal) <= 0) {
      return NextResponse.json({ error: "valorMensal deve ser maior que zero" }, { status: 400 });
    }
    if (hasRenewal && (!renewalValue || Number(renewalValue) <= 0)) {
      return NextResponse.json({ error: "renewalValue é obrigatório quando hasRenewal=true" }, { status: 400 });
    }

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();

    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const c = client as Record<string, unknown>;
    const missing: string[] = [];
    if (!c.nome_fantasia && !c.name) missing.push("Nome da empresa");
    if (!c.cnpj) missing.push("CNPJ");
    if (!c.contact_name) missing.push("Representante legal");
    if (!c.cpf_cnpj && !c.cpf) missing.push("CPF do representante");
    if (!c.email && !c.email_corporativo) missing.push("E-mail");
    if (!c.endereco_rua && !c.endereco) missing.push("Endereço");
    if ((serviceType === "assessoria_trafego" || serviceType === "lone_growth") && !c.nicho && !c.segmento) {
      missing.push("Nicho/segmento");
    }
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Cliente incompleto. Preencha: ${missing.join(", ")}.`,
      }, { status: 400 });
    }

    const mergeData: ContractMergeData = {
      cliente_razao_social: (c.nome_fantasia as string) || (c.name as string),
      cliente_cnpj: c.cnpj as string,
      cliente_endereco: (c.endereco_rua as string) || (c.endereco as string) || "",
      cliente_numero: (c.endereco_numero as string) || "",
      cliente_bairro: (c.endereco_bairro as string) || "",
      cliente_cidade: (c.endereco_cidade as string) || "",
      cliente_cep: (c.endereco_cep as string) || "",
      cliente_representante_nome: c.contact_name as string,
      cliente_representante_cpf: (c.cpf_cnpj as string) || (c.cpf as string) || "",
      // Admin pode passar signerEmail no body pra sobrescrever o email do cadastro
      // (caso o signatário seja diferente do contato principal do cliente).
      cliente_email: (signerEmail as string)?.trim() || (c.email as string) || (c.email_corporativo as string),
      cliente_nicho: (c.nicho as string) || (c.segmento as string) || "",

      valor_mensal_numero: Number(valorMensal),
      duracao_meses_numero: Number(duracaoMeses),
      dia_pagamento_numero: Number(diaPagamento),

      has_renewal: Boolean(hasRenewal),
      renewal_value: hasRenewal && renewalValue ? Number(renewalValue) : null,

      service_type: serviceType,
      version: version ? Number(version) : undefined,
      data_assinatura: new Date(),
    };

    const { buffer, filename } = generateContractDocx(mergeData);

    // RFC 5987: filename="<ASCII>"; filename*=UTF-8''<percent-encoded> — browser escolhe o melhor.
    // Sem acentos, todo espaço vira "_" para rodar em downloads antigos.
    const asciiFilename = filename
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^\x20-\x7E]/g, "") // só ASCII imprimível
      .replace(/"/g, "") // aspas bagunçariam o header
      .trim();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    console.error("[contracts/download-docx]", err);
    return NextResponse.json({
      error: `Erro ao gerar contrato: ${err instanceof Error ? err.message : "desconhecido"}`,
    }, { status: 500 });
  }
}
