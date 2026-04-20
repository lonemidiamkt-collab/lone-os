import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://supabase-kong-1:8000";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

const D4SIGN_BASE = process.env.D4SIGN_API_URL || "https://sandbox.d4sign.com.br/api/v1";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // ─── Send contract to D4Sign ───
  if (body.action === "send_to_d4sign") {
    const { contractId, clientId, signerEmail } = body;

    // 1. Get agency settings (D4Sign credentials)
    const { data: agency } = await supabase
      .from("agency_settings")
      .select("*")
      .eq("key", "main")
      .maybeSingle();

    if (!agency?.d4sign_token || !agency?.d4sign_crypt_key) {
      return NextResponse.json({ error: "D4Sign nao configurado. Va em Configuracoes > Juridico." }, { status: 400 });
    }

    // 2. Get contract + client data
    const { data: contract } = await supabase.from("contracts").select("*").eq("id", contractId).maybeSingle();
    if (!contract) return NextResponse.json({ error: "Contrato nao encontrado" }, { status: 404 });

    const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
    if (!client) return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });

    // ── Integrity gate: re-validate client has all data needed for the contract ──
    const clientEmail = client.email || client.email_corporativo;
    const clientAddress = [client.endereco_rua, client.endereco_bairro, client.endereco_cidade, client.endereco_estado, client.endereco_cep]
      .filter(Boolean).join(", ") || client.endereco || "";
    const contractMissing: string[] = [];
    if (!client.nome_fantasia && !client.name) contractMissing.push("Nome da Empresa");
    if (!client.cnpj) contractMissing.push("CNPJ");
    if (!client.contact_name) contractMissing.push("Nome do Responsavel");
    if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) contractMissing.push("E-mail do cliente");
    if (!client.phone) contractMissing.push("WhatsApp");
    if (!clientAddress) contractMissing.push("Endereco");
    if (!client.doc_logo) contractMissing.push("Logotipo");
    if (!client.doc_contrato_social) contractMissing.push("Contrato Social");
    if (contractMissing.length > 0) {
      return NextResponse.json({
        error: `Nao e possivel gerar o contrato. Campos ausentes: ${contractMissing.join(", ")}. Peca ao cliente para completar o onboarding.`,
      }, { status: 400 });
    }

    // 3. Get template config
    const { data: template } = await supabase
      .from("contract_templates")
      .select("*")
      .eq("service_type", contract.service_type)
      .maybeSingle();

    if (!template?.d4sign_template_id || !template?.d4sign_safe_id) {
      return NextResponse.json({
        error: `Template D4Sign nao configurado para ${contract.service_type}. Va em Configuracoes > Juridico.`,
      }, { status: 400 });
    }

    const token = agency.d4sign_token;
    const cryptKey = agency.d4sign_crypt_key;
    const address = [client.endereco_rua, client.endereco_bairro, client.endereco_cidade, client.endereco_estado, client.endereco_cep]
      .filter(Boolean).join(", ") || client.endereco || "";

    try {
      // 4. Create document from template
      const createRes = await fetch(
        `${D4SIGN_BASE}/documents/${template.d4sign_safe_id}/makedocumentbytemplate?tokenAPI=${token}&cryptKey=${cryptKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uuid_template: template.d4sign_template_id,
            name_document: `Contrato - ${client.nome_fantasia || client.name} - V${contract.version}`,
            templates: {
              empresa_nome: client.nome_fantasia || client.name || "",
              empresa_cnpj: client.cnpj || "",
              empresa_endereco: address,
              empresa_responsavel: client.contact_name || "",
              empresa_cpf: client.cpf_cnpj || "",
              empresa_telefone: client.phone || "",
              contratada_nome: agency.razao_social || "",
              contratada_cnpj: agency.cnpj || "",
              contratada_endereco: agency.endereco || "",
              contratada_responsavel: agency.signatario_nome || "",
              data_inicio: contract.start_date || "",
              data_fim: contract.end_date || "",
              duracao_meses: String(contract.duration_months || 3),
              valor_mensal: `R$ ${Number(contract.monthly_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              valor_total: `R$ ${(Number(contract.monthly_value) * (contract.duration_months || 3)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            },
          }),
        }
      );

      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("[D4Sign] Create error:", err);
        return NextResponse.json({ error: `D4Sign: ${err}` }, { status: 500 });
      }

      const createData = await createRes.json();
      const documentId = createData.uuid;

      if (!documentId) {
        return NextResponse.json({ error: "D4Sign nao retornou UUID do documento" }, { status: 500 });
      }

      // 5. Add signers — client email is guaranteed to exist by the integrity gate above
      const resolvedSignerEmail = signerEmail || clientEmail;
      const signers = [
        { email: agency.signatario_email || agency.email, act: "1", foreign: "0", certificadoDigital: "0", assinaturaPresencial: "0" },
        { email: resolvedSignerEmail, act: "1", foreign: "0", certificadoDigital: "0", assinaturaPresencial: "0" },
      ];

      await fetch(
        `${D4SIGN_BASE}/documents/${documentId}/createlist?tokenAPI=${token}&cryptKey=${cryptKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signers }),
        }
      );

      // 6. Send for signature
      const sendRes = await fetch(
        `${D4SIGN_BASE}/documents/${documentId}/sendtosigner?tokenAPI=${token}&cryptKey=${cryptKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Contrato de prestacao de servicos - ${agency.nome_fantasia || "Lone Midia"}`,
            skip_email: "0",
            workflow: "0",
          }),
        }
      );

      if (!sendRes.ok) {
        const err = await sendRes.text();
        console.error("[D4Sign] Send error:", err);
      }

      // 7. Update contract record
      await supabase.from("contracts").update({
        d4sign_document_id: documentId,
        d4sign_status: "1",
        status: "active",
      }).eq("id", contractId);

      // 8. Update client contract_status
      await supabase.from("clients").update({
        contract_end: contract.end_date,
      }).eq("id", clientId);

      // 9. Timeline entry
      await supabase.from("timeline_entries").insert({
        client_id: clientId,
        type: "manual",
        actor: body.actor || "Sistema",
        description: `Contrato enviado para assinatura digital via D4Sign.`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });

      return NextResponse.json({
        success: true,
        documentId,
        url: `https://sandbox.d4sign.com.br/desk/viewblob/${documentId}`,
      });

    } catch (err) {
      console.error("[D4Sign] Error:", err);
      return NextResponse.json({ error: `Erro de conexao com D4Sign: ${err instanceof Error ? err.message : "desconhecido"}` }, { status: 500 });
    }
  }

  // ─── Check D4Sign document status ───
  if (body.action === "check_status") {
    const { data: agency } = await supabase.from("agency_settings").select("d4sign_token, d4sign_crypt_key").eq("key", "main").maybeSingle();
    if (!agency?.d4sign_token) return NextResponse.json({ error: "D4Sign nao configurado" }, { status: 400 });

    const { documentId } = body;
    try {
      const res = await fetch(
        `${D4SIGN_BASE}/documents/${documentId}?tokenAPI=${agency.d4sign_token}&cryptKey=${agency.d4sign_crypt_key}`
      );
      const data = await res.json();
      return NextResponse.json(data);
    } catch {
      return NextResponse.json({ error: "Falha ao consultar D4Sign" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
