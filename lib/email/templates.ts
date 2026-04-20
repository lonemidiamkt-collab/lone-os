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
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${LOGO_URL}" alt="Lone Midia" width="56" height="56" style="display:block;width:56px;height:56px;object-fit:contain;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color:${CARD_COLOR};border:1px solid ${BORDER_COLOR};border-radius:16px;padding:40px 32px;">
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
