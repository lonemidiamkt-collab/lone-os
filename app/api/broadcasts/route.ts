export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { broadcastEmail } from "@/lib/email/templates";
import { getServerUser } from "@/lib/supabase/auth-server";
import { renderMonthCalendarHtml } from "@/lib/holidays/email-html";

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
  nicho?: string | null;
  city?: string | null;
  uf?: string | null;
}

async function resolveAudience(audience: string): Promise<Recipient[]> {
  // audience values:
  //   "all_active"           — todos com status good/average/onboarding (exclui drafts e at_risk)
  //   "industry:<name>"      — legado: filtro pela coluna `industry` (preenchido em todos os clientes)
  //   "nicho:<name>"         — novo: filtro pela coluna `nicho` (014_nicho_field)
  //   "sector:<name>"        — alias inteligente: bate em industry OU nicho (recomendado)
  //   "custom:<emails>"      — lista direta de emails
  if (audience.startsWith("custom:")) {
    const emails = audience.slice("custom:".length).split(",").map((e) => e.trim()).filter(Boolean);
    return emails.map((email) => ({ clientId: null, email, contactName: email.split("@")[0], companyName: "" }));
  }

  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia, contact_name, email, email_corporativo, industry, nicho, endereco_cidade, endereco_estado");

  if (audience.startsWith("industry:")) {
    q = q.eq("industry", audience.slice("industry:".length));
  } else if (audience.startsWith("nicho:")) {
    q = q.eq("nicho", audience.slice("nicho:".length));
  } else if (audience.startsWith("sector:")) {
    // Bate em industry OU nicho — pega clientes legados E novos
    const sector = audience.slice("sector:".length);
    q = q.or(`industry.eq.${sector},nicho.eq.${sector}`);
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
        nicho: (c.nicho as string) || null,
        city: (c.endereco_cidade as string) || null,
        uf: (c.endereco_estado as string) || null,
      } as Recipient;
    })
    .filter((r): r is Recipient => r !== null);
}

// ─── GET: list broadcasts ──────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida ou ausente" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

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
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida ou ausente" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  const adminEmail = user.email;

  const body = await req.json().catch(() => ({}));
  const { action, subject, content_html, target_audience, test_to, attach_calendar_pdf, calendar_year, calendar_month } = body as {
    action?: string;
    subject?: string;
    content_html?: string;
    target_audience?: string;
    test_to?: string;
    attach_calendar_pdf?: boolean;
    calendar_year?: number;
    calendar_month?: number;  // 1-12
  };

  if (!subject?.trim() || !content_html?.trim()) {
    return NextResponse.json({ error: "subject e content_html sao obrigatorios" }, { status: 400 });
  }

  // Mês/ano do calendário a anexar — default: mês atual (timezone do servidor)
  const now = new Date();
  const calYear = calendar_year ?? now.getFullYear();
  const calMonth = calendar_month ?? (now.getMonth() + 1);

  // Logo URL absoluta (server precisa pra carregar a imagem no PDF)
  const logoUrl = `${req.nextUrl.origin}/logo.png`;

  // ── Action: TEST — send single email to admin (or custom test_to) ──
  if (action === "test") {
    try {
      const testRecipient = (test_to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(test_to)) ? test_to.trim() : adminEmail;

      // Calendário HTML inline (substituiu o anexo PDF — @react-pdf não funciona em Next.js 15 SSR)
      let calendarHtml = "";
      let calendarIncluded = false;
      if (attach_calendar_pdf) {
        try {
          calendarHtml = await renderMonthCalendarHtml({ year: calYear, month: calMonth, region: "BRASIL" });
          calendarIncluded = calendarHtml.length > 0;
        } catch (calErr) {
          console.error("[broadcasts/test] calendar HTML render failed, sending without it:", calErr);
        }
      }

      const finalHtml = content_html + calendarHtml;
      const template = broadcastEmail(subject, finalHtml, testRecipient.split("@")[0], "Teste");

      const result = await sendEmail({
        to: testRecipient,
        subject: `[TESTE] ${template.subject}`,
        html: template.html,
        templateName: "broadcast_test",
      });

      if (!result.success) {
        console.error("[broadcasts/test] sendEmail failed:", result.error);
        return NextResponse.json({
          success: false,
          error: result.error || "Falha no envio do email",
          sentTo: testRecipient,
        }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        sentTo: testRecipient,
        calendarIncluded,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[broadcasts/test] Unhandled error:", err);
      return NextResponse.json({ error: `Falha no teste: ${msg}` }, { status: 500 });
    }
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

    // 2.5. Pré-gera HTML do calendário por (nicho + cidade + UF) único — quando
    //      flag de anexo está ligada. Cada combo única é gerada 1x e reusada.
    const calendarHtmlCache = new Map<string, string>();
    async function getCalendarHtmlFor(r: Recipient): Promise<string> {
      if (!attach_calendar_pdf) return "";
      const key = `${r.nicho ?? ""}|${r.city ?? ""}|${r.uf ?? ""}`;
      if (calendarHtmlCache.has(key)) return calendarHtmlCache.get(key)!;
      const region = r.city
        ? `${r.city.toUpperCase()}${r.uf ? ` · ${r.uf.toUpperCase()}` : ""}`
        : (r.uf ? r.uf.toUpperCase() : "BRASIL");
      let html = "";
      try {
        html = await renderMonthCalendarHtml({
          year: calYear,
          month: calMonth,
          region,
          nichos: r.nicho ? [r.nicho] : undefined,
          uf: r.uf || undefined,
          city: r.city || undefined,
        });
      } catch (err) {
        console.error("[broadcasts/send] calendar HTML render failed:", err);
        html = "";
      }
      calendarHtmlCache.set(key, html);
      return html;
    }

    // 3. Send in batches
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (r) => {
          try {
            const calendarHtml = await getCalendarHtmlFor(r);
            const finalHtml = content_html + calendarHtml;
            const template = broadcastEmail(subject, finalHtml, r.contactName, r.companyName);
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
