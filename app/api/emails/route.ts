export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, logEmail } from "@/lib/email/emailService";
import { contractSignedEmail, monthlyReportEmail } from "@/lib/email/templates";
import { enviarBoasVindas } from "@/lib/email/boas-vindas";
import { getServerUser } from "@/lib/supabase/auth-server";

function getSupabase() {
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  // Dispara e-mails pros clientes — restrito a usuário logado (o middleware
  // libera /api/emails publicamente, então a proteção vive aqui).
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const supabase = getSupabase();

  // ─── Send Welcome Email ───
  // A regra mora em lib/email/boas-vindas.ts (24/10/2026): a ativação do cadastro chama a mesma
  // função direto — antes ela fazia fetch aqui sem login, levava 401 e a tela dizia que tinha ido.
  if (body.action === "send_welcome") {
    const { clientId } = body;
    const r = await enviarBoasVindas(supabase, clientId, { forcar: body.force === true });
    if (r.jaEnviado) return NextResponse.json({ success: true, skipped: true, message: "E-mail ja enviado anteriormente" });
    if (r.codigo === "sem_cliente") {
      return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
    }
    if (r.codigo === "sem_email") {
      return NextResponse.json({ error: "E-mail do cliente nao cadastrado. Preencha na aba Dados." }, { status: 400 });
    }
    return NextResponse.json({ success: r.enviado, messageId: r.messageId, error: r.enviado ? undefined : r.motivo });
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
