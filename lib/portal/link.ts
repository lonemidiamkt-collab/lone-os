// lib/portal/link.ts — o link do portal do cliente: endereço, estado e a mensagem pronta pro cliente.
//
// Puro (sem banco, sem React): serve ao botão "Portal" da ficha (navegador), às rotas que geram o
// link e à automação do cadastro (lib/portal/link-automatico.ts). Testado em tests/portal-link.test.ts.
//
// O domínio vem de NEXT_PUBLIC_PORTAL_DOMAIN (embutido no build), com o de produção como padrão —
// estava escrito em quatro arquivos.

export const PORTAL_DOMAIN = process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "https://resultados.lonemidia.com";

/** Endereço público do portal para um token. */
export function urlDoPortal(token: string, dominio: string = PORTAL_DOMAIN): string {
  return `${dominio.replace(/\/+$/, "")}/portal/${token}`;
}

export type EstadoPortal = "ativo" | "desativado" | "sem_link";

/**
 * Estado do link: sem token = "sem_link"; revogado ou desligado = "desativado"; o resto, "ativo".
 * (Cliente pausado ou arquivado também não abre — isso é o `bloqueio`, à parte, porque o link em si
 * continua válido e volta a abrir sozinho quando o cliente retoma.)
 */
export function estadoDoPortal(c: {
  publicReportToken?: string | null;
  publicReportTokenRevokedAt?: string | null;
  publicReportEnabled?: boolean | null;
}): EstadoPortal {
  if (!c.publicReportToken) return "sem_link";
  if (c.publicReportTokenRevokedAt || c.publicReportEnabled === false) return "desativado";
  return "ativo";
}

/**
 * Número de WhatsApp no formato do wa.me (só dígitos, com o 55). Telefone brasileiro sem DDI
 * (10 ou 11 dígitos) ganha o 55; número que já começa com 55 fica como está. Vazio/curto demais = null.
 */
export function numeroWhatsapp(telefone?: string | null): string | null {
  const d = (telefone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 10) return null;
  if (d.length <= 11) return `55${d}`;
  return d;
}

/** Primeiro nome do contato, pra saudação ("Olá, Ana!"). */
function primeiroNome(nome?: string | null): string | null {
  const p = (nome ?? "").trim().split(/\s+/)[0];
  return p && p.length >= 2 ? p : null;
}

/**
 * A mensagem que o TIME manda ao cliente com o link. Com a mensagem de boas-vindas configurada no
 * portal, ela abre o texto; sem ela, uma saudação curta.
 */
export function mensagemParaCliente(p: { url: string; contato?: string | null; boasVindas?: string | null }): string {
  const nome = primeiroNome(p.contato);
  const abertura = p.boasVindas?.trim()
    || `Olá${nome ? `, ${nome}` : ""}! Preparamos o seu painel de resultados da Lone Mídia.`;
  return `${abertura}\n\nAcesse quando quiser pelo link exclusivo (não precisa de login):\n${p.url}`;
}

/**
 * Rascunho no WhatsApp: abre a conversa com o número e o texto prontos — quem clicou revisa e envia.
 * Nada sai sozinho. Sem número, abre o WhatsApp para escolher o contato.
 */
export function rascunhoWhatsapp(numero: string | null, texto: string): string {
  const q = `text=${encodeURIComponent(texto)}`;
  return numero ? `https://wa.me/${numero}?${q}` : `https://wa.me/?${q}`;
}
