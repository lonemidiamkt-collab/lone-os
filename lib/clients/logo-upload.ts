// lib/clients/logo-upload.ts — o que a ficha aceita como logo, dito ANTES do envio.
//
// 24/10/2026 (auditoria de erro recuperável, 3.12): na aba Marca, "Trocar logo" não mostrava erro
// nenhum — o aviso ia para a área de Documentos Legais, que fica em outra aba. Quem mandava um PDF ou
// uma imagem de 15 MB clicava, via "Enviando…" sumir e o logo antigo continuar lá, sem saber por quê.
// A conferência mora aqui para a tela dizer o motivo junto do botão, antes de gastar o envio.
// Os formatos e o limite são os da rota (app/api/onboarding/upload/route.ts, lib/onboarding/etapas.ts).

import { limiteDoDocumento, MB } from "@/lib/onboarding/etapas";

export const LIMITE_LOGO = limiteDoDocumento("logo");
const EXTENSOES = ["png", "jpg", "jpeg", "webp", "heic", "heif"];
/** Para o `accept` do input: o seletor de arquivos já mostra só o que serve. */
export const ACEITA_LOGO = ".png,.jpg,.jpeg,.webp,.heic,.heif,image/png,image/jpeg,image/webp,image/heic,image/heif";
/** A regra dita ao lado do botão. */
export const DICA_LOGO = `Imagem PNG, JPG, WEBP ou HEIC · até ${LIMITE_LOGO / MB} MB`;

const mb = (bytes: number) => (bytes / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** null = pode enviar; texto = o que está errado e o que fazer. */
export function validarLogo(arquivo: { name: string; type?: string; size: number }): string | null {
  const ext = (arquivo.name.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf" || arquivo.type === "application/pdf") {
    return `"${arquivo.name}" é PDF — o logo precisa ser imagem (PNG, JPG, WEBP ou HEIC). Se o cliente só mandou PDF, exporte a página como PNG.`;
  }
  if (!EXTENSOES.includes(ext)) {
    return `"${arquivo.name}" não é um formato aceito para o logo. Use PNG, JPG, WEBP ou HEIC (SVG e GIF não entram).`;
  }
  if (arquivo.size > LIMITE_LOGO) {
    return `"${arquivo.name}" tem ${mb(arquivo.size)} MB — o limite é ${LIMITE_LOGO / MB} MB. Diminua a imagem e tente de novo.`;
  }
  return null;
}
