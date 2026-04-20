import type { Client } from "@/lib/types";

export interface AgencySettings {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  endereco: string;
  email: string;
  telefone: string;
  signatarioNome: string;
  signatarioCpf: string;
  signatarioEmail: string;
  d4signToken: string;
  d4signCryptKey: string;
}

export interface D4SignPayload {
  templateId: string;
  safeId: string;
  signers: { email: string; act: string; foreign: string; certificadoDigital: string; assinaturaPresencial: string }[];
  mergeFields: Record<string, string>;
}

function buildAddress(client: Client): string {
  return [client.enderecoRua, client.enderecoBairro, client.enderecoCidade, client.enderecoEstado, client.enderecoCep]
    .filter(Boolean).join(", ") || client.endereco || "";
}

export function buildD4SignPayload(
  client: Client,
  agency: AgencySettings,
  templateId: string,
  safeId: string,
  valor: number,
  dataInicio: string,
  dataFim: string,
  duracao: number,
): D4SignPayload {
  return {
    templateId,
    safeId,
    signers: [
      {
        email: agency.signatarioEmail || agency.email,
        act: "1",
        foreign: "0",
        certificadoDigital: "0",
        assinaturaPresencial: "0",
      },
      {
        email: client.email || client.emailCorporativo || "",
        act: "1",
        foreign: "0",
        certificadoDigital: "0",
        assinaturaPresencial: "0",
      },
    ],
    mergeFields: {
      "empresa_nome": client.nomeFantasia || client.name,
      "empresa_cnpj": client.cnpj || "",
      "empresa_endereco": buildAddress(client),
      "empresa_responsavel": client.contactName || "",
      "empresa_cpf": client.cpfCnpj || "",
      "empresa_telefone": client.phone || "",
      "contratada_nome": agency.razaoSocial,
      "contratada_cnpj": agency.cnpj,
      "contratada_endereco": agency.endereco,
      "contratada_responsavel": agency.signatarioNome,
      "data_inicio": dataInicio,
      "data_fim": dataFim,
      "duracao_meses": String(duracao),
      "valor_mensal": `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      "valor_total": `R$ ${(valor * duracao).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    },
  };
}

export async function sendToD4Sign(
  payload: D4SignPayload,
  token: string,
  cryptKey: string,
): Promise<{ documentId: string; url: string } | { error: string }> {
  const baseUrl = "https://sandbox.d4sign.com.br/api/v1";

  // ── Integrity gate: block if required merge fields or signer email are missing ──
  const required: [string, string][] = [
    ["empresa_nome", payload.mergeFields.empresa_nome],
    ["empresa_cnpj", payload.mergeFields.empresa_cnpj],
    ["empresa_endereco", payload.mergeFields.empresa_endereco],
    ["empresa_responsavel", payload.mergeFields.empresa_responsavel],
  ];
  const missing = required.filter(([, v]) => !v?.trim()).map(([k]) => k);
  if (missing.length > 0) {
    return { error: `D4Sign abortado. Campos obrigatorios ausentes: ${missing.join(", ")}` };
  }
  const clientSigner = payload.signers[1];
  if (!clientSigner?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientSigner.email)) {
    return { error: "D4Sign abortado. E-mail do cliente ausente ou invalido." };
  }

  try {
    // 1. Create document from template
    const createRes = await fetch(`${baseUrl}/documents/${payload.safeId}/makedocumentbytemplate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenAPI: token,
        cryptKey,
        uuid_template: payload.templateId,
        name_document: `Contrato - ${payload.mergeFields.empresa_nome}`,
        templates: payload.mergeFields,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return { error: `D4Sign create failed: ${err}` };
    }

    const createData = await createRes.json();
    const documentId = createData.uuid;

    // 2. Add signers
    for (const signer of payload.signers) {
      if (!signer.email) continue;
      await fetch(`${baseUrl}/documents/${documentId}/createlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenAPI: token,
          cryptKey,
          signers: [signer],
        }),
      });
    }

    // 3. Send for signature
    const sendRes = await fetch(`${baseUrl}/documents/${documentId}/sendtosigner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenAPI: token,
        cryptKey,
        message: "Contrato de prestacao de servicos - Lone Midia",
        skip_email: "0",
      }),
    });

    if (!sendRes.ok) {
      return { error: "D4Sign send failed" };
    }

    return {
      documentId,
      url: `https://sandbox.d4sign.com.br/desk/viewblob/${documentId}`,
    };
  } catch (err) {
    return { error: `D4Sign error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}
