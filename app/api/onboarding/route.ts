export const runtime = "nodejs"; // vault usa crypto nativo de Node

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptVault } from "@/lib/crypto/vault";

const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://supabase-kong-1:8000";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Encrypta senha antes de persistir. Se VAULT_KEY não estiver configurada (ambiente sem env),
// loga warning e deixa passar plaintext — não queremos bloquear onboarding por config errada.
function safeEncrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return encryptVault(value);
  } catch (err) {
    console.error("[onboarding] encryptVault failed, persisting plaintext:", err);
    return value;
  }
}

// GET — Fetch submission by token (public, used by onboarding page)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const { data, error } = await supabase
    .from("client_onboarding_submissions")
    .select("*, clients(name, industry, service_type)")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "Link invalido ou expirado" }, { status: 404 });
  if (data.status === "submitted") return NextResponse.json({ error: "already_submitted", submission: data });

  return NextResponse.json(data);
}

// POST — Handle all onboarding actions
export async function POST(req: NextRequest) {
  const body = await req.json();

  // ─── Generate link WITH draft client (main flow from modal) ───
  if (body.action === "generate_link_with_draft") {
    // 1. Create draft client (invisible to main app)
    const { data: client, error: clientErr } = await supabase.from("clients").insert({
      name: body.name,
      nome_fantasia: body.name,
      contact_name: body.contactName || null,
      industry: body.industry ?? "Outro",
      service_type: body.serviceType ?? "lone_growth",
      status: "onboarding",
      draft_status: "pending_invite",
      attention_level: "medium",
      monthly_budget: 0,
      payment_method: "pix",
    }).select("id").maybeSingle();

    if (clientErr || !client) {
      return NextResponse.json({ error: clientErr?.message ?? "Falha ao criar rascunho" }, { status: 500 });
    }

    // 2. Generate onboarding token
    const token = `ob-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { error: subErr } = await supabase.from("client_onboarding_submissions").insert({
      client_id: client.id,
      token,
      status: "pending",
    });

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
    return NextResponse.json({ token, url: `/onboarding/${token}`, clientId: client.id });
  }

  // ─── Generate link for an existing client ───
  if (body.action === "generate_link") {
    const token = `ob-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { error } = await supabase.from("client_onboarding_submissions").insert({
      client_id: body.clientId,
      token,
      status: "pending",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ token, url: `/onboarding/${token}` });
  }

  // ─── Auto-save draft (debounced from client) ───
  if (body.action === "auto_save") {
    const { token: t, ...fields } = body;
    if (!t) return NextResponse.json({ error: "Token required" }, { status: 400 });
    const { error: autoSaveErr } = await supabase.from("client_onboarding_submissions").update({
      contact_name: fields.contactName || null,
      contact_cpf: fields.contactCpf || null,
      contact_whatsapp: fields.contactWhatsapp || null,
      contact_email: fields.contactEmail || null,
      nome_fantasia: fields.nomeFantasia || null,
      razao_social: fields.razaoSocial || null,
      cnpj: fields.cnpj || null,
      nicho: fields.nicho || null,
      endereco_rua: fields.enderecoRua || null,
      endereco_bairro: fields.enderecoBairro || null,
      endereco_cidade: fields.enderecoCidade || null,
      endereco_estado: fields.enderecoEstado || null,
      endereco_cep: fields.enderecoCep || null,
      meta_login: fields.metaLogin || null,  // login em plaintext é ok (não é sensível)
      meta_password: safeEncrypt(fields.metaPassword),
      meta_status: fields.metaStatus || null,
      instagram_login: fields.instagramLogin || null,
      instagram_password: safeEncrypt(fields.instagramPassword),
      instagram_status: fields.instagramStatus || null,
      google_login: fields.googleLogin || null,
      google_password: safeEncrypt(fields.googlePassword),
      google_status: fields.googleStatus || null,
      doc_contrato_social: fields.docContratoSocial || null,
      doc_identidade: fields.docIdentidade || null,
      doc_logo: fields.docLogo || null,
      notes: fields.notes || null,
    }).eq("token", t);
    if (autoSaveErr) {
      console.error("[onboarding/auto_save] update failed:", autoSaveErr);
      return NextResponse.json({ error: autoSaveErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ─── Submit onboarding form (client action from external portal) ───
  if (body.action === "submit") {
    const { token, ...formData } = body;

    // ── Integrity gate: re-validate required fields server-side (defense vs DevTools bypass) ──
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail || "");
    const phoneDigits = (formData.contactWhatsapp || "").replace(/\D/g, "");
    const cnpjDigits = (formData.cnpj || "").replace(/\D/g, "");
    const cepDigits = (formData.enderecoCep || "").replace(/\D/g, "");
    const missing: string[] = [];
    if (!formData.nomeFantasia?.trim()) missing.push("Nome Fantasia");
    if (!formData.contactName?.trim()) missing.push("Nome do Responsavel");
    if (!emailOk) missing.push("E-mail");
    if (phoneDigits.length < 10) missing.push("WhatsApp");
    if (cnpjDigits.length !== 14) missing.push("CNPJ");
    if (cepDigits.length !== 8) missing.push("CEP");
    if (!formData.enderecoRua?.trim()) missing.push("Rua");
    if (!formData.enderecoBairro?.trim()) missing.push("Bairro");
    if (!formData.enderecoCidade?.trim()) missing.push("Cidade");
    if (!formData.docLogo) missing.push("Logotipo");
    if (!formData.docContratoSocial) missing.push("Contrato Social");
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Campos obrigatorios ausentes: ${missing.join(", ")}. Todos sao essenciais para a geracao do contrato e ativacao da conta.`,
      }, { status: 400 });
    }

    // Update the submission record
    const { error } = await supabase
      .from("client_onboarding_submissions")
      .update({
        contact_name: formData.contactName,
        contact_cpf: formData.contactCpf,
        contact_whatsapp: formData.contactWhatsapp,
        contact_email: formData.contactEmail || null,
        nome_fantasia: formData.nomeFantasia || null,
        razao_social: formData.razaoSocial || null,
        cnpj: formData.cnpj || null,
        nicho: formData.nicho || null,
        endereco_rua: formData.enderecoRua || null,
        endereco_bairro: formData.enderecoBairro || null,
        endereco_cidade: formData.enderecoCidade || null,
        endereco_estado: formData.enderecoEstado || null,
        endereco_cep: formData.enderecoCep || null,
        meta_login: formData.metaLogin || null,
        meta_password: safeEncrypt(formData.metaPassword),
        meta_status: formData.metaStatus || "pending",
        instagram_login: formData.instagramLogin || null,
        instagram_password: safeEncrypt(formData.instagramPassword),
        instagram_status: formData.instagramStatus || "pending",
        google_login: formData.googleLogin || null,
        google_password: safeEncrypt(formData.googlePassword),
        google_status: formData.googleStatus || "pending",
        doc_contrato_social: formData.docContratoSocial || null,
        doc_identidade: formData.docIdentidade || null,
        doc_logo: formData.docLogo || null,
        notes: formData.notes || null,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .eq("token", token);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Move draft client to awaiting_approval + sync ALL data to clients table
    if (formData.clientId) {
      const { data: clientRow } = await supabase.from("clients").select("name, nome_fantasia").eq("id", formData.clientId).maybeSingle();
      const clientName = formData.nomeFantasia || clientRow?.nome_fantasia || clientRow?.name || formData.contactName || "Cliente";

      await supabase.from("clients").update({
        draft_status: "awaiting_approval",
        nome_fantasia: formData.nomeFantasia || null,
        razao_social: formData.razaoSocial || null,
        cnpj: formData.cnpj || null,
        nicho: formData.nicho || null,
        contact_name: formData.contactName,
        cpf_cnpj: formData.contactCpf,
        phone: formData.contactWhatsapp,
        email: formData.contactEmail || null,
        email_corporativo: formData.contactEmail || null,
        endereco_rua: formData.enderecoRua || null,
        endereco_bairro: formData.enderecoBairro || null,
        endereco_cidade: formData.enderecoCidade || null,
        endereco_estado: formData.enderecoEstado || null,
        endereco_cep: formData.enderecoCep || null,
        facebook_login: formData.metaLogin || null,
        facebook_password: safeEncrypt(formData.metaPassword),
        instagram_login: formData.instagramLogin || null,
        instagram_password: safeEncrypt(formData.instagramPassword),
        google_ads_login: formData.googleLogin || null,
        google_ads_password: safeEncrypt(formData.googlePassword),
        doc_contrato_social: formData.docContratoSocial || null,
        doc_identidade: formData.docIdentidade || null,
        doc_logo: formData.docLogo || null,
        notes: formData.notes || null,
      }).eq("id", formData.clientId);

      // Send notification to admins
      await supabase.from("notifications").insert({
        type: "system",
        title: "Novo cadastro pendente",
        body: `${clientName} finalizou o formulario de onboarding e aguarda revisao.`,
        client_id: formData.clientId,
      });

      // Auto-create timeline entry
      await supabase.from("timeline_entries").insert({
        client_id: formData.clientId,
        type: "onboarding",
        actor: formData.contactName || "Cliente",
        description: `${clientName} preencheu o formulario de onboarding externo.`,
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
    }

    return NextResponse.json({ success: true });
  }

  // ─── Check duplicate CNPJ/phone ───
  if (body.action === "check_duplicate") {
    const checks: string[] = [];
    if (body.cnpj) {
      const { data } = await supabase.from("clients").select("id, name").eq("cnpj", body.cnpj).is("draft_status", null).limit(1);
      if (data && data.length > 0) checks.push(`CNPJ ja cadastrado (${data[0].name})`);
    }
    if (body.phone) {
      const { data } = await supabase.from("clients").select("id, name").eq("phone", body.phone).is("draft_status", null).limit(1);
      if (data && data.length > 0) checks.push(`WhatsApp ja cadastrado (${data[0].name})`);
    }
    return NextResponse.json({ duplicates: checks });
  }

  // ─── Approve client (admin action) ───
  if (body.action === "approve") {
    const { clientId } = body;

    // Get client data
    const { data: clientRow } = await supabase.from("clients").select("name, nome_fantasia, service_type, assigned_traffic, assigned_social, assigned_designer").eq("id", clientId).maybeSingle();
    const clientName = clientRow?.nome_fantasia || clientRow?.name || "Cliente";
    const serviceType = clientRow?.service_type ?? "lone_growth";

    // Fetch latest submission to sync any remaining data
    const { data: subRow } = await supabase
      .from("client_onboarding_submissions")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Clear draft_status + sync all submission data to client record
    const updatePayload: Record<string, unknown> = { draft_status: null };
    if (subRow) {
      if (subRow.nome_fantasia) updatePayload.nome_fantasia = subRow.nome_fantasia;
      if (subRow.razao_social) updatePayload.razao_social = subRow.razao_social;
      if (subRow.cnpj) updatePayload.cnpj = subRow.cnpj;
      if (subRow.nicho) updatePayload.nicho = subRow.nicho;
      if (subRow.contact_name) updatePayload.contact_name = subRow.contact_name;
      if (subRow.contact_cpf) updatePayload.cpf_cnpj = subRow.contact_cpf;
      if (subRow.contact_whatsapp) updatePayload.phone = subRow.contact_whatsapp;
      if (subRow.contact_email) {
        updatePayload.email = subRow.contact_email;
        updatePayload.email_corporativo = subRow.contact_email;
      }
      if (subRow.endereco_rua) updatePayload.endereco_rua = subRow.endereco_rua;
      if (subRow.endereco_bairro) updatePayload.endereco_bairro = subRow.endereco_bairro;
      if (subRow.endereco_cidade) updatePayload.endereco_cidade = subRow.endereco_cidade;
      if (subRow.endereco_estado) updatePayload.endereco_estado = subRow.endereco_estado;
      if (subRow.endereco_cep) updatePayload.endereco_cep = subRow.endereco_cep;
      if (subRow.meta_login) updatePayload.facebook_login = subRow.meta_login;
      if (subRow.meta_password) updatePayload.facebook_password = subRow.meta_password;
      if (subRow.instagram_login) updatePayload.instagram_login = subRow.instagram_login;
      if (subRow.instagram_password) updatePayload.instagram_password = subRow.instagram_password;
      if (subRow.google_login) updatePayload.google_ads_login = subRow.google_login;
      if (subRow.google_password) updatePayload.google_ads_password = subRow.google_password;
      if (subRow.doc_contrato_social) updatePayload.doc_contrato_social = subRow.doc_contrato_social;
      if (subRow.doc_identidade) updatePayload.doc_identidade = subRow.doc_identidade;
      if (subRow.doc_logo) updatePayload.doc_logo = subRow.doc_logo;
      if (subRow.notes) updatePayload.notes = subRow.notes;
    }

    const { error } = await supabase.from("clients").update(updatePayload).eq("id", clientId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Generate onboarding checklist items based on service type
    const allItems = [
      { label: "Pixel de rastreamento instalado", department: "traffic", sort_order: 0 },
      { label: "Contas de anuncios configuradas", department: "traffic", sort_order: 1 },
      { label: "Estrategia inicial de campanhas definida", department: "traffic", sort_order: 2 },
      { label: "Paleta de cores e fontes definidas", department: "design", sort_order: 3 },
      { label: "Briefing de marca preenchido", department: "design", sort_order: 4 },
      { label: "Assets organizados no Drive", department: "design", sort_order: 5 },
      { label: "Acessos as redes sociais recebidos", department: "social", sort_order: 6 },
      { label: "Tom de voz e persona definidos", department: "social", sort_order: 7 },
      { label: "Calendario inicial criado", department: "social", sort_order: 8 },
      { label: "Primeira reuniao de alinhamento realizada", department: "social", sort_order: 9 },
    ];

    const deptMap: Record<string, string[]> = {
      lone_growth: ["traffic", "design", "social"],
      assessoria_trafego: ["traffic"],
      assessoria_social: ["social"],
      assessoria_design: ["design"],
    };
    const allowedDepts = new Set(deptMap[serviceType] ?? ["traffic", "design", "social"]);
    const items = allItems.filter((i) => allowedDepts.has(i.department));

    // Check if onboarding items already exist
    const { data: existing } = await supabase.from("onboarding_items").select("id").eq("client_id", clientId).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("onboarding_items").insert(
        items.map((item) => ({ client_id: clientId, label: item.label, department: item.department, sort_order: item.sort_order, completed: false }))
      );
    }

    // Notify assigned team members
    const assigned = [clientRow?.assigned_traffic, clientRow?.assigned_social, clientRow?.assigned_designer].filter(Boolean);
    if (assigned.length > 0) {
      await supabase.from("notifications").insert({
        type: "system",
        title: "Novo Projeto",
        body: `Voce foi escalado para a conta ${clientName}. Verifique o onboarding e inicie o setup.`,
        client_id: clientId,
      });
    }

    // Send welcome email — gated: only dispatch if email was persisted (re-read from DB)
    try {
      const { data: verifyEmail } = await supabase
        .from("clients")
        .select("email, email_corporativo")
        .eq("id", clientId)
        .maybeSingle();
      const persistedEmail = verifyEmail?.email || verifyEmail?.email_corporativo;
      if (persistedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(persistedEmail)) {
        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/supabase", "") || "http://localhost:3000";
        await fetch(`${baseUrl.startsWith("http") ? "" : "https://"}${baseUrl}/api/emails`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send_welcome", clientId }),
        }).catch(() => {});
      } else {
        console.warn("[Onboarding] Welcome email skipped: client has no persisted email");
      }
    } catch {
      // Email failure is non-critical — client activation succeeded
      console.error("[Onboarding] Welcome email failed, but client was activated successfully");
    }

    return NextResponse.json({ success: true });
  }

  // ─── Reject/delete draft (admin action) ───
  if (body.action === "reject") {
    const { clientId } = body;
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
