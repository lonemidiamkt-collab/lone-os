export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { broadcastEmail } from "@/lib/email/templates";

// Admin emails allowed to trigger broadcasts.
// The client sends admin_email in the body; we validate it against this list.
// Keep in sync with lib/context/RoleContext.tsx USER_PROFILES (admin + manager roles).
const ADMIN_EMAILS = new Set([
  "lonemidiamkt@gmail.com", // Roberto (admin)
  "lucas@lonemidia.com",
  "julio@lonemidia.com",
]);

// Lotes de 10 emails com 300ms de delay entre lotes.
// Resend free tier aceita ~100/s; deixamos margem de segurança.
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Recipient {
  clientId: string | null;
  email: string;
  contactName: string;
  companyName: string;
}

async function resolveAudience(audience: string): Promise<Recipient[]> {
  // audience values: "all_active" | "industry:<name>" | "custom:<comma-separated emails>"
  if (audience.startsWith("custom:")) {
    const emails = audience.slice("custom:".length).split(",").map((e) => e.trim()).filter(Boolean);
    return emails.map((email) => ({ clientId: null, email, contactName: email.split("@")[0], companyName: "" }));
  }

  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia, contact_name, email, email_corporativo, industry");

  if (audience.startsWith("industry:")) {
    q = q.eq("industry", audience.slice("industry:".length));
  } else {
    // all_active: status in ('good', 'average', 'onboarding'), exclude at_risk and drafts
    q = q.in("status", ["good", "average", "onboarding"]).is("draft_status", null);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  return data
    .map((c: Record<string, unknown>) => {
      const email = ((c.email_corporativo as string) || (c.email as string) || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
      return {
        clientId: c.id as string,
        email,
        contactName: (c.contact_name as string) || (c.name as string) || "Cliente",
        companyName: (c.nome_fantasia as string) || (c.name as string) || "",
      } as Recipient;
    })
    .filter((r): r is Recipient => r !== null);
}

// Validate admin from request body. Returns { ok, email } or an error response.
function validateAdmin(body: Record<string, unknown>): { ok: true; email: string } | { ok: false; response: NextResponse } {
  const adminEmail = ((body.admin_email as string) || "").trim().toLowerCase();
  if (!adminEmail || !ADMIN_EMAILS.has(adminEmail)) {
    return { ok: false, response: NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 }) };
  }
  return { ok: true, email: adminEmail };
}

// ─── GET: list broadcasts ──────────────────────────────────
export async function GET(req: NextRequest) {
  const adminEmail = (req.nextUrl.searchParams.get("admin_email") || "").trim().toLowerCase();
  if (!adminEmail || !ADMIN_EMAILS.has(adminEmail)) {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("broadcasts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ broadcasts: data });
}

// ─── POST: test send OR real send ──────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = validateAdmin(body);
  if (!auth.ok) return auth.response;
  const adminEmail = auth.email;

  const { action, subject, content_html, target_audience, test_to } = body as {
    action?: string; subject?: string; content_html?: string; target_audience?: string; test_to?: string;
  };

  if (!subject?.trim() || !content_html?.trim()) {
    return NextResponse.json({ error: "subject e content_html sao obrigatorios" }, { status: 400 });
  }

  // ── Action: TEST — send single email to admin (or custom test_to) ──
  if (action === "test") {
    const testRecipient = (test_to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(test_to)) ? test_to.trim() : adminEmail;
    const template = broadcastEmail(subject, content_html, testRecipient.split("@")[0], "Teste");
    const result = await sendEmail({
      to: testRecipient,
      subject: `[TESTE] ${template.subject}`,
      html: template.html,
      templateName: "broadcast_test",
    });
    return NextResponse.json({
      success: result.success,
      error: result.error,
      sentTo: testRecipient,
    });
  }

  // ── Action: SEND — full broadcast ──
  if (action === "send") {
    const audience = target_audience || "all_active";
    const recipients = await resolveAudience(audience);

    if (recipients.length === 0) {
      return NextResponse.json({ error: "Nenhum destinatario valido encontrado para a audiencia" }, { status: 400 });
    }

    // 1. Create broadcast record (status: sending)
    const { data: broadcast, error: bErr } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        subject,
        content_html,
        target_audience: audience,
        status: "sending",
        sent_by: adminEmail,
        recipients_total: recipients.length,
      })
      .select("id")
      .maybeSingle();

    if (bErr || !broadcast) {
      return NextResponse.json({ error: bErr?.message ?? "Falha ao criar broadcast" }, { status: 500 });
    }
    const broadcastId = broadcast.id as string;

    // 2. Pre-create recipient records (status: pending)
    await supabaseAdmin.from("broadcast_recipients").insert(
      recipients.map((r) => ({
        broadcast_id: broadcastId,
        client_id: r.clientId,
        email: r.email,
        contact_name: r.contactName,
        company_name: r.companyName,
        status: "pending",
      }))
    );

    // 3. Send in batches
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (r) => {
          try {
            const template = broadcastEmail(subject, content_html, r.contactName, r.companyName);
            const result = await sendEmail({
              to: r.email,
              toName: r.contactName,
              subject: template.subject,
              html: template.html,
              templateName: "broadcast",
            });
            return { r, result };
          } catch (e) {
            return { r, result: { success: false, error: e instanceof Error ? e.message : "unknown" } };
          }
        })
      );

      // Update per-recipient status
      for (const { r, result } of results) {
        if (result.success) successCount++;
        else failCount++;
        await supabaseAdmin
          .from("broadcast_recipients")
          .update({
            status: result.success ? "sent" : "failed",
            error_message: result.error ?? null,
            resend_message_id: (result as { messageId?: string }).messageId ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq("broadcast_id", broadcastId)
          .eq("email", r.email);
      }

      if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
    }

    // 4. Finalize broadcast
    await supabaseAdmin
      .from("broadcasts")
      .update({
        status: failCount > 0 && successCount === 0 ? "failed" : "sent",
        recipients_success: successCount,
        recipients_failed: failCount,
        sent_at: new Date().toISOString(),
      })
      .eq("id", broadcastId);

    return NextResponse.json({
      success: true,
      broadcastId,
      total: recipients.length,
      sent: successCount,
      failed: failCount,
    });
  }

  return NextResponse.json({ error: "action invalido (use 'test' ou 'send')" }, { status: 400 });
}
