// lib/auth/email-do-aparelho.ts — o e-mail de login que este aparelho já usou, por perfil. Puro.
//
// POR QUE (Fase 0, leva 0B, 25/11/2026). A lista pública da tela de login deixou de trazer o e-mail
// (ia para qualquer um na internet). A pessoa continua clicando na própria foto; na PRIMEIRA vez em
// cada aparelho digita o e-mail junto com a senha, e o aparelho lembra nas próximas.
//
// O que fica guardado é só o e-mail (nunca a senha), no localStorage deste navegador. Sem localStorage
// (aba anônima, dado bloqueado) nada quebra: a pessoa digita o e-mail de novo. Por isso toda leitura e
// gravação passa por try/catch e recebe o storage por função — o mesmo padrão de inatividade.ts.
// Testado em tests/email-do-aparelho.test.ts.

const PREFIXO = "lone-os:email-login:";

export const chaveDoPerfil = (perfilId: string) => `${PREFIXO}${perfilId}`;

/** Formato de e-mail o bastante para não mandar lixo ao login. Quem decide se existe é o Auth. */
export function pareceEmail(s: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s ?? "").trim());
}

const normalizar = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function lerEmailLembrado(storage: () => Storage, perfilId: string): string | null {
  try {
    const v = normalizar(storage().getItem(chaveDoPerfil(perfilId)));
    return pareceEmail(v) ? v : null;
  } catch {
    return null;
  }
}

export function lembrarEmail(storage: () => Storage, perfilId: string, email: string): void {
  const v = normalizar(email);
  if (!perfilId || !pareceEmail(v)) return;
  try { storage().setItem(chaveDoPerfil(perfilId), v); } catch { /* sem storage: só não lembra */ }
}

export function esquecerEmail(storage: () => Storage, perfilId: string): void {
  try { storage().removeItem(chaveDoPerfil(perfilId)); } catch { /* sem storage: nada a esquecer */ }
}

/**
 * Qual e-mail mandar ao login: o que a pessoa digitou agora; senão o que a lista já conhece (lista
 * completa, de quem já entrou nesta aba); senão o lembrado no aparelho. null = falta o e-mail.
 */
export function emailParaEntrar(o: { digitado?: string | null; conhecido?: string | null; lembrado?: string | null }): string | null {
  for (const c of [o.digitado, o.conhecido, o.lembrado]) {
    const v = normalizar(c);
    if (pareceEmail(v)) return v;
  }
  return null;
}
