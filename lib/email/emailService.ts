import { Resend } from "resend";

// ─── Config ─────────────────────────────────────────────────
// Lazy init: Resend throws if key is empty at construction time
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const FROM_EMAIL = process.env.EMAIL_FROM || "Lone Midia <noreply@lonemidia.com>";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TEST_EMAIL = "pedrohma1000@gmail.com";

// ─── Types ──────────────────────────────────────────────────
export interface EmailPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  clientId?: string;
  templateName: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ─── Sanity Check ───────────────────────────────────────────
// Validates email format and recipient name before sending
function cleanEmail(raw: string): string {
  // Handle markdown-formatted emails: [email](mailto:email)
  const match = raw.match(/mailto:([^\s)]+)/);
  if (match) return match[1].trim();
  // Handle [email] or plain email
  const bracket = raw.match(/\[([^\]]+@[^\]]+)\]/);
  if (bracket) return bracket[1].trim();
  return raw.trim();
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(email));
}

function sanitize(name: string): string {
  return name.replace(/[<>]/g, "").trim();
}

// ─── Environment Guard ─────────────────────────────────────
// In non-production, only send to Roberto's email (safety net)
function resolveRecipient(email: string): string {
  if (IS_PRODUCTION) return email;
  console.log(`[Email] Non-production: redirecting ${email} → ${TEST_EMAIL}`);
  return TEST_EMAIL;
}

// ─── Core Send Function ────────────────────────────────────
// Isolated: failures here never crash the caller
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  // Clean email (remove markdown formatting from DB)
  payload.to = cleanEmail(payload.to);

  // Sanity checks
  if (!payload.to || !validateEmail(payload.to)) {
    return { success: false, error: `Email invalido: ${payload.to}` };
  }
  if (!payload.toName || payload.toName.trim().length === 0) {
    payload.toName = "Cliente";
  }
  const resend = getResend();
  if (!resend) {
    return { success: false, error: "RESEND_API_KEY nao configurada" };
  }

  const recipient = resolveRecipient(payload.to);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient,
      subject: payload.subject,
      html: payload.html,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] Send failed:", msg);
    return { success: false, error: msg };
  }
}

// ─── Log Helper ─────────────────────────────────────────────
// Records every email attempt in the database for audit
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logEmail(
  supabase: any,
  payload: {
    clientId?: string;
    templateName: string;
    recipientEmail: string;
    recipientName?: string;
    status: "sent" | "failed" | "skipped";
    errorMessage?: string;
  }
) {
  try {
    await supabase.from("email_logs").insert({
      client_id: payload.clientId || null,
      template_name: payload.templateName,
      recipient_email: payload.recipientEmail,
      recipient_name: payload.recipientName || null,
      status: payload.status,
      error_message: payload.errorMessage || null,
      sent_at: payload.status === "sent" ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error("[Email] Failed to log email:", err);
  }
}
