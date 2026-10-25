// lib/email/boas-vindas.ts — o e-mail de boas-vindas ao cliente ativado, numa função só.
//
// POR QUE (24/10/2026, auditoria de erro recuperável, item 3.9). Aprovar/ativar um cadastro
// (app/api/onboarding, approve e provision) mandava o e-mail com um fetch na PRÓPRIA API
// (/api/emails) sem o cookie de quem clicou: a rota exige login, respondia 401, o `.catch(() => {})`
// engolia e a tela dizia "aprovado" como se o e-mail tivesse saído. Agora as duas rotas chamam esta
// função direto, e quem chamou recebe o que aconteceu ("enviado", "já tinha ido", ou o motivo da falha)
// para a tela dizer.
//
// Nunca lança: e-mail que falha não desfaz a ativação — mas aparece como falha.

import { sendEmail, logEmail } from "@/lib/email/emailService";
import { welcomeEmail } from "@/lib/email/templates";

import type { ResultadoBoasVindas } from "./boas-vindas-resultado";
export type { ResultadoBoasVindas } from "./boas-vindas-resultado";
export { avisoDoEmail } from "./boas-vindas-resultado";

const SERVICO: Record<string, string> = {
  lone_growth: "marketing digital",
  assessoria_trafego: "trafego pago",
  assessoria_social: "social media",
  assessoria_design: "design",
};

const preenchido = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

// O cliente do supabase muda de tipo entre as rotas (createClient × supabaseAdmin); só usamos from().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Banco = { from: (tabela: string) => any };

/** Envia (ou pula, se já foi) o e-mail de boas-vindas. `forcar` reenvia mesmo se já foi. */
export async function enviarBoasVindas(banco: Banco, clientId: string, opcoes?: { forcar?: boolean }): Promise<ResultadoBoasVindas> {
  try {
    const { data: client, error } = await banco.from("clients")
      .select("id, name, nome_fantasia, contact_name, email, email_corporativo, welcome_email_sent, service_type")
      .eq("id", clientId).maybeSingle();
    if (error || !client) {
      if (error) console.error("[boas-vindas] leitura do cliente falhou:", error.message);
      return { enviado: false, codigo: "sem_cliente", motivo: "não consegui ler o cadastro do cliente" };
    }

    // email_corporativo é o que a aba Dados edita (a intenção mais recente); `email` é o legado. O
    // sendEmail limpa o formato (há e-mail gravado como link markdown) e confere antes de mandar.
    const destinatario = [client.email_corporativo, client.email].find(preenchido)?.trim() ?? null;
    const nome = client.contact_name || client.name || "Cliente";
    const empresa = client.nome_fantasia || client.name || "Empresa";

    if (client.welcome_email_sent && !opcoes?.forcar) {
      await logEmail(banco, {
        clientId, templateName: "welcome", recipientEmail: destinatario ?? "",
        status: "skipped", errorMessage: "E-mail de boas-vindas ja enviado anteriormente",
      });
      return { enviado: false, codigo: "ja_enviado", jaEnviado: true, motivo: "já tinha sido enviado antes" };
    }

    if (!destinatario) {
      await logEmail(banco, {
        clientId, templateName: "welcome", recipientEmail: "(vazio)", recipientName: nome,
        status: "failed", errorMessage: "E-mail do cliente nao cadastrado",
      });
      return { enviado: false, codigo: "sem_email", motivo: "o cliente está sem e-mail na ficha" };
    }

    const modelo = welcomeEmail(nome, empresa, SERVICO[String(client.service_type ?? "")] ?? "marketing digital");
    const r = await sendEmail({ to: destinatario, toName: nome, subject: modelo.subject, html: modelo.html, clientId, templateName: "welcome" });
    await logEmail(banco, {
      clientId, templateName: "welcome", recipientEmail: destinatario, recipientName: nome,
      status: r.success ? "sent" : "failed", errorMessage: r.error,
    });
    if (!r.success) {
      console.error("[boas-vindas] envio falhou:", clientId, r.error);
      return { enviado: false, codigo: "falha", motivo: r.error ? `o serviço de e-mail recusou (${r.error})` : "o serviço de e-mail não respondeu" };
    }
    await banco.from("clients").update({ welcome_email_sent: true }).eq("id", clientId);
    return { enviado: true, codigo: "enviado", messageId: r.messageId };
  } catch (e) {
    console.error("[boas-vindas] falhou:", clientId, e);
    return { enviado: false, codigo: "falha", motivo: "erro inesperado ao enviar" };
  }
}
