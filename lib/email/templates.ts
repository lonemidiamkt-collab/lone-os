// ─── Email Templates ────────────────────────────────────────
// Sober Premium design — Apple/Stripe inspired
// All templates return plain HTML (compatible with any email provider)

const WELCOME_BANNER_URL = "https://painel.lonemidia.com/storage/v1/object/public/onboarding-docs/email/welcome-banner.png";
const LOGO_URL = "https://painel.lonemidia.com/logo-email.png";
const BRAND_COLOR = "#0d4af5";
const BG_COLOR = "#18181b";
const CARD_COLOR = "#0a0a0c";
const BORDER_COLOR = "#27272a";
const TEXT_PRIMARY = "#ffffff";
const TEXT_SECONDARY = "#a1a1aa";

function baseLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lone Midia</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <!-- Main card with integrated header + content -->
          <tr>
            <td style="background-color:${CARD_COLOR};border:1px solid ${BORDER_COLOR};border-radius:16px;padding:32px;">
              <!-- Integrated header: logo + brand text -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td width="56" valign="middle" style="padding-right:14px;">
                    <img src="${LOGO_URL}" alt="Lone Midia" width="48" height="48" style="display:block;width:48px;height:48px;object-fit:contain;border-radius:10px;" />
                  </td>
                  <td valign="middle">
                    <p style="color:${TEXT_PRIMARY};font-size:15px;font-weight:700;margin:0;letter-spacing:-0.01em;line-height:1.2;">Lone Midia</p>
                    <p style="color:${TEXT_SECONDARY};font-size:12px;font-weight:400;margin:2px 0 0;line-height:1.3;">Assessoria de Marketing e Vendas</p>
                  </td>
                </tr>
              </table>
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="color:${TEXT_SECONDARY};font-size:11px;margin:0;">
                Lone Midia Marketing Digital &bull; Rio de Janeiro, RJ
              </p>
              <p style="color:#52525b;font-size:10px;margin:4px 0 0;">
                Este e-mail foi enviado automaticamente pelo Lone OS
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Welcome Email ──────────────────────────────────────────
export function welcomeEmail(clientName: string, companyName: string, serviceLabel?: string): { subject: string; html: string } {
  const service = serviceLabel || "marketing digital";

  return {
    subject: `Bem-vindo a Lone Midia, ${companyName}!`,
    html: baseLayout(`
      <!-- Welcome Banner -->
      <div style="border-radius:12px;overflow:hidden;margin-bottom:28px;">
        <img src="${WELCOME_BANNER_URL}" alt="Muito Obrigado - Lone Midia agradece pela confianca e preferencia" style="width:100%;height:auto;display:block;border-radius:12px;" />
      </div>

      <p style="color:${TEXT_PRIMARY};font-size:14px;line-height:1.8;margin:0 0 16px;">
        Ola, ${clientName}! Tudo bem?
      </p>

      <p style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.8;margin:0 0 16px;">
        Quero comecar te agradecendo pela confianca em escolher a <strong style="color:${TEXT_PRIMARY};">Lone Midia</strong> para cuidar do ${service} da <strong style="color:${TEXT_PRIMARY};">${companyName}</strong>. Ficamos muito felizes em iniciar essa parceria e em poder contribuir diretamente com o crescimento do seu negocio.
      </p>

      <p style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.8;margin:0 0 16px;">
        Nosso objetivo a partir de agora e estruturar estrategias focadas em atrair clientes qualificados e fortalecer ainda mais a presenca da ${companyName} no digital, sempre alinhando as acoes com o momento atual do negocio.
      </p>

      <p style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.8;margin:0 0 24px;">
        Nos proximos dias vamos avancar com as configuracoes iniciais, analises estrategicas e organizacao das primeiras acoes. Qualquer novidade ou material que possa ajudar (promocoes, produtos de destaque, videos ou fotos), pode nos enviar por aqui tambem.
      </p>

      <!-- Divider -->
      <div style="border-top:1px solid ${BORDER_COLOR};margin:24px 0;"></div>

      <p style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.7;margin:0 0 4px;">
        Conte com a gente nessa nova etapa. Estamos juntos para buscar resultados cada vez maiores.
      </p>

      <p style="color:${TEXT_PRIMARY};font-size:13px;margin:16px 0 2px;">
        Abracos,
      </p>
      <p style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin:0;">
        Roberto Lino
      </p>
      <p style="color:${BRAND_COLOR};font-size:12px;margin:2px 0 0;">
        Lone Midia
      </p>
    `),
  };
}

// ─── Contract Signed Email ──────────────────────────────────
export function contractSignedEmail(clientName: string, companyName: string): { subject: string; html: string } {
  return {
    subject: `Contrato assinado — ${companyName}`,
    html: baseLayout(`
      <h1 style="color:${TEXT_PRIMARY};font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">
        Contrato Assinado
      </h1>
      <p style="color:${TEXT_SECONDARY};font-size:14px;text-align:center;margin:0 0 24px;line-height:1.6;">
        ${clientName}, o contrato da <strong style="color:${TEXT_PRIMARY};">${companyName}</strong> foi assinado com sucesso.
      </p>
      <div style="background-color:#10b98120;border:1px solid #10b98130;border-radius:12px;padding:20px;text-align:center;">
        <p style="color:#10b981;font-size:16px;font-weight:600;margin:0;">Tudo certo!</p>
        <p style="color:${TEXT_SECONDARY};font-size:12px;margin:8px 0 0;">O documento esta disponivel no painel Lone OS.</p>
      </div>
    `),
  };
}

// ─── Broadcast Email ────────────────────────────────────────
// Mass-communication template. Uses the same Sober Premium layout.
// contentHtml is the rich-text body from the admin editor (already sanitized).
// {{nome_cliente}} in contentHtml is replaced per recipient before send.
export function broadcastEmail(subject: string, contentHtml: string, clientName: string, companyName?: string): { subject: string; html: string } {
  // Accept multiple tag spellings so the user can write naturally:
  //   {{nome_cliente}} | {{nome_responsavel}} | {{nome}} | {{responsavel}}   → contact name
  //   {{empresa}} | {{nome_empresa}} | {{empresa_nome}}                     → company name
  const personalized = contentHtml
    .replace(/\{\{\s*(?:nome_cliente|nome_responsavel|responsavel|nome)\s*\}\}/gi, escapeHtml(clientName))
    .replace(/\{\{\s*(?:empresa|nome_empresa|empresa_nome|nome_fantasia)\s*\}\}/gi, escapeHtml(companyName || clientName));

  return {
    subject,
    html: baseLayout(`
      <p style="color:${TEXT_PRIMARY};font-size:14px;line-height:1.8;margin:0 0 16px;">
        Ola, ${escapeHtml(clientName)}!
      </p>
      <div style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.75;">
        ${personalized}
      </div>
      <div style="border-top:1px solid ${BORDER_COLOR};margin:28px 0 16px;"></div>
      <p style="color:${TEXT_PRIMARY};font-size:13px;margin:0 0 2px;">Abracos,</p>
      <p style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin:0;">Equipe Lone Midia</p>
      <p style="color:${BRAND_COLOR};font-size:12px;margin:2px 0 0;">Assessoria de Marketing e Vendas</p>
    `),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Monthly Report Email ───────────────────────────────────
export function monthlyReportEmail(clientName: string, companyName: string, month: string): { subject: string; html: string } {
  return {
    subject: `Relatorio mensal — ${companyName} (${month})`,
    html: baseLayout(`
      <h1 style="color:${TEXT_PRIMARY};font-size:24px;font-weight:700;margin:0 0 8px;text-align:center;">
        Relatorio Mensal
      </h1>
      <p style="color:${TEXT_SECONDARY};font-size:14px;text-align:center;margin:0 0 24px;">
        ${clientName}, o relatorio de <strong style="color:${TEXT_PRIMARY};">${month}</strong> esta disponivel.
      </p>
      <div style="background-color:${BRAND_COLOR}10;border:1px solid ${BRAND_COLOR}20;border-radius:12px;padding:20px;text-align:center;">
        <p style="color:${BRAND_COLOR};font-size:14px;font-weight:600;margin:0;">Acesse o Lone OS para ver os detalhes completos</p>
      </div>
    `),
  };
}

// ─── Holiday Alert Email ────────────────────────────────────
export function holidayAlertEmail(
  recipientName: string,
  monthLabel: string,
  holidays: Array<{ date: string; name: string; weekday: string }>,
): { subject: string; html: string } {
  const rows = holidays.length === 0
    ? `<tr><td style="color:${TEXT_SECONDARY};font-size:13px;padding:12px 0;text-align:center;">Nenhum feriado nacional em ${monthLabel}.</td></tr>`
    : holidays.map((h) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid ${BORDER_COLOR};">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="80" valign="top">
                  <p style="color:${BRAND_COLOR};font-size:18px;font-weight:700;margin:0;line-height:1;">${formatDateBrPart(h.date, "day")}</p>
                  <p style="color:${TEXT_SECONDARY};font-size:11px;margin:2px 0 0;text-transform:uppercase;letter-spacing:0.05em;">${formatDateBrPart(h.date, "month")}</p>
                </td>
                <td valign="top">
                  <p style="color:${TEXT_PRIMARY};font-size:14px;font-weight:600;margin:0;line-height:1.4;">${h.name}</p>
                  <p style="color:${TEXT_SECONDARY};font-size:12px;margin:3px 0 0;">${h.weekday}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `).join("");

  return {
    subject: `📌 [Lone OS] Planejamento: Feriados de ${monthLabel}`,
    html: baseLayout(`
      <p style="color:${TEXT_PRIMARY};font-size:18px;font-weight:600;margin:0 0 8px;">Olá, ${recipientName}.</p>
      <p style="color:${TEXT_SECONDARY};font-size:13px;line-height:1.7;margin:0 0 24px;">
        Aqui estão os <strong style="color:${TEXT_PRIMARY};">feriados nacionais de ${monthLabel}</strong> pra você considerar no planejamento de conteúdo dos clientes. Programe ganchos, ajuste calendário e antecipe pautas.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR};border:1px solid ${BORDER_COLOR};border-radius:12px;padding:8px 20px;margin-bottom:24px;">
        ${rows}
      </table>

      <div style="background-color:${BRAND_COLOR}10;border:1px solid ${BRAND_COLOR}20;border-radius:12px;padding:16px;">
        <p style="color:${BRAND_COLOR};font-size:12px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Lembrete</p>
        <p style="color:${TEXT_PRIMARY};font-size:13px;line-height:1.6;margin:0;">
          Cliente de Construção Civil reage diferente de cliente de Solar — adapte o tom por nicho. Calendário completo em <strong>painel.lonemidia.com/calendar</strong>.
        </p>
      </div>
    `),
  };
}

// helper local, não exporta
function formatDateBrPart(iso: string, part: "day" | "month"): string {
  const d = new Date(iso + "T12:00:00Z");
  if (part === "day") return String(d.getUTCDate()).padStart(2, "0");
  return d.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "").toUpperCase();
}
