export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, logEmail } from "@/lib/email/emailService";
import { welcomeEmail, contractSignedEmail, monthlyReportEmail } from "@/lib/email/templates";

function getSupabase() {
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = getSupabase();

  // ─── Send Welcome Email ───
  if (body.action === "send_welcome") {
    const { clientId } = body;

    // 1. Fetch client data
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, nome_fantasia, contact_name, email, email_corporativo, welcome_email_sent, service_type")
      .eq("id", clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
    }

    // 2. Duplicate check — skip if already sent (unless force=true)
    if (client.welcome_email_sent && !body.force) {
      await logEmail(supabase, {
        clientId, templateName: "welcome", recipientEmail: client.email || client.email_corporativo || "",
        status: "skipped", errorMessage: "E-mail de boas-vindas ja enviado anteriormente",
      });
      return NextResponse.json({ success: true, skipped: true, message: "E-mail ja enviado anteriormente" });
    }

    // 3. Resolve recipient email
    // Prefer email_corporativo: it's the field edited through the UI (aba Dados).
    // email is legacy/backup; email_corporativo reflects the most recent user intent.
    const recipientEmail = client.email_corporativo || client.email;
    const clientName = client.contact_name || client.name || "Cliente";
    const companyName = client.nome_fantasia || client.name || "Empresa";

    // 4. Sanity check
    if (!recipientEmail) {
      await logEmail(supabase, {
        clientId, templateName: "welcome", recipientEmail: "(vazio)",
        recipientName: clientName, status: "failed", errorMessage: "E-mail do cliente nao cadastrado",
      });
      return NextResponse.json({ error: "E-mail do cliente nao cadastrado. Preencha na aba Dados." }, { status: 400 });
    }

    // 5. Generate template with service type
    const serviceMap: Record<string, string> = {
      lone_growth: "marketing digital",
      assessoria_trafego: "trafego pago",
      assessoria_social: "social media",
      assessoria_design: "design",
    };
    const serviceLabel = serviceMap[(client as Record<string, unknown>).service_type as string || ""] || "marketing digital";
    const template = welcomeEmail(clientName, companyName, serviceLabel);

    // 6. Send (isolated — failure here does NOT affect client activation)
    const result = await sendEmail({
      to: recipientEmail,
      toName: clientName,
      subject: template.subject,
      html: template.html,
      clientId,
      templateName: "welcome",
    });

    // 7. Log the attempt
    await logEmail(supabase, {
      clientId, templateName: "welcome", recipientEmail,
      recipientName: clientName,
      status: result.success ? "sent" : "failed",
      errorMessage: result.error,
    });

    // 8. Mark as sent (only on success)
    if (result.success) {
      await supabase.from("clients").update({ welcome_email_sent: true }).eq("id", clientId);
    }

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  }

  // ─── Send Contract Signed Email ───
  if (body.action === "send_contract_signed") {
    const { clientId } = body;
    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("id, name, nome_fantasia, contact_name, email, email_corporativo")
      .eq("id", clientId)
      .maybeSingle();

    if (cErr || !client) return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });

    // Prefer email_corporativo: it's the field edited through the UI (aba Dados).
    // email is legacy/backup; email_corporativo reflects the most recent user intent.
    const recipientEmail = client.email_corporativo || client.email;
    if (!recipientEmail) return NextResponse.json({ error: "E-mail nao cadastrado" }, { status: 400 });

    const template = contractSignedEmail(client.contact_name || client.name, client.nome_fantasia || client.name);
    const result = await sendEmail({ to: recipientEmail, subject: template.subject, html: template.html, clientId, templateName: "contract_signed" });

    await logEmail(supabase, {
      clientId, templateName: "contract_signed", recipientEmail,
      status: result.success ? "sent" : "failed", errorMessage: result.error,
    });

    return NextResponse.json({ success: result.success, error: result.error });
  }

  // ─── Send Monthly Report Email ───
  if (body.action === "send_monthly_report") {
    const { clientId, month } = body;
    const { data: client, error: mErr } = await supabase
      .from("clients")
      .select("id, name, nome_fantasia, contact_name, email, email_corporativo")
      .eq("id", clientId)
      .maybeSingle();

    if (mErr || !client) return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });

    // Prefer email_corporativo: it's the field edited through the UI (aba Dados).
    // email is legacy/backup; email_corporativo reflects the most recent user intent.
    const recipientEmail = client.email_corporativo || client.email;
    if (!recipientEmail) return NextResponse.json({ error: "E-mail nao cadastrado" }, { status: 400 });

    const template = monthlyReportEmail(client.contact_name || client.name, client.nome_fantasia || client.name, month || new Date().toISOString().slice(0, 7));
    const result = await sendEmail({ to: recipientEmail, subject: template.subject, html: template.html, clientId, templateName: "monthly_report" });

    await logEmail(supabase, {
      clientId, templateName: "monthly_report", recipientEmail,
      status: result.success ? "sent" : "failed", errorMessage: result.error,
    });

    return NextResponse.json({ success: result.success, error: result.error });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
