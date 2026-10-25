// lib/auth/login-erro.ts — por que o login não entrou, em português. Puro.
//
// POR QUE (25/10/2026, onda 6 da auditoria de erro recuperável, item 8.5). Qualquer falha do Supabase
// virava `false` e a tela dizia "Senha incorreta" e apagava a senha: rede caída, deploy no meio, o Kong
// recusando as chaves (a queda de 16/10) e o limite de tentativas (429). A pessoa trocava a senha à toa
// ou desistia. E o ramo "Sem conexão… modo local" prometia um modo que não existe.
// Testado em tests/login-erro.test.ts.

export type MotivoLogin = "credencial" | "bloqueado" | "limite" | "rede" | "servidor" | "perfil" | "desconhecido";

export type FalhaLogin = { ok: false; motivo: MotivoLogin; frase: string };
export type ResultadoLogin = { ok: true } | FalhaLogin;

/** O que o supabase-js devolve/lança (AuthApiError, AuthRetryableFetchError, TypeError do fetch…). */
export interface ErroDeLogin { status?: number; code?: string; name?: string; message?: string }

export function motivoDoErroDeLogin(e: ErroDeLogin | null | undefined): MotivoLogin {
  if (!e) return "desconhecido";
  const status = typeof e.status === "number" ? e.status : undefined;
  const code = (e.code ?? "").toLowerCase();
  const msg = (e.message ?? "").toLowerCase();
  const nome = e.name ?? "";

  // Rede: o pedido nem chegou (ou não voltou). O supabase-js marca como "retryable" com status 0.
  if (nome === "AuthRetryableFetchError" || status === 0 || /failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(msg)) {
    return "rede";
  }
  if (status === 429 || code === "over_request_rate_limit" || /rate limit|too many/.test(msg)) return "limite";
  // Removido da equipe: o login fica bloqueado no Auth (25/10/2026, 8.2) — não é senha errada.
  if (code === "user_banned" || /banned/.test(msg)) return "bloqueado";
  // Só é senha quando o GoTrue diz que é. O Kong recusando a chave (16/10) também responde
  // "Invalid authentication credentials", mas com 401 — e não tem nada a ver com a senha.
  if ((status === 400 || status === undefined) && (code === "invalid_credentials" || /invalid login credentials/.test(msg))) return "credencial";
  if (status !== undefined && (status >= 500 || status === 401 || status === 403 || status === 404)) return "servidor";
  return "desconhecido";
}

export function fraseDoLogin(motivo: MotivoLogin, status?: number): string {
  switch (motivo) {
    case "credencial": return "Senha incorreta. Confira e tente de novo.";
    case "bloqueado": return "O seu acesso ao painel está bloqueado (desativado ou removido da equipe). Fale com o administrador.";
    case "limite": return "Muitas tentativas seguidas. Espere 1 ou 2 minutos e tente de novo — a senha que você digitou continua aí.";
    case "rede": return "Sem conexão com o servidor. Confira a internet e tente de novo — a senha continua aí.";
    case "servidor": return "O login do painel não está respondendo agora (pode ser uma atualização). Tente em alguns minutos; se continuar, avise o administrador.";
    case "perfil": return "Não encontrei esse perfil no sistema. Recarregue a página — se continuar, avise o administrador.";
    default: return `Não consegui entrar agora${status ? ` (erro ${status})` : ""}. Tente de novo; se repetir, avise o administrador.`;
  }
}

export function falhaDeLogin(e: ErroDeLogin | null | undefined): FalhaLogin {
  const motivo = motivoDoErroDeLogin(e);
  return { ok: false, motivo, frase: fraseDoLogin(motivo, e?.status) };
}

/** Só a senha errada apaga o campo. Rede, limite e servidor guardam o que foi digitado. */
export function apagaSenha(motivo: MotivoLogin): boolean {
  return motivo === "credencial";
}
