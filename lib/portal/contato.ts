// lib/portal/contato.ts — número de WhatsApp da equipe nas telas do CLIENTE (portal, ficha, onboarding).
// Um lugar só: estava repetido em 5 arquivos, e trocar o número deixaria algum link velho no ar.

/** WhatsApp da equipe Lone (formato wa.me, só dígitos). Fallback quando o cliente não tem número próprio do time. */
export const WHATSAPP_EQUIPE = "5522981530700";

export function linkWhatsapp(numero?: string | null): string {
  return `https://wa.me/${(numero || WHATSAPP_EQUIPE).replace(/\D/g, "")}`;
}
