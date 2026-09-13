// lib/auth/duas-etapas.ts — verificação em duas etapas (TOTP) por cima do Supabase Auth. Fase 0A.
//
// Por quê: a senha do admin abre o cofre de acessos, os contratos, o financeiro dos clientes e a
// voz do agente. Uma senha vazada hoje é tudo isso vazado. Com um autenticador (Google
// Authenticator, 1Password, Authy…), a senha sozinha não entra.
//
// Como o GoTrue vê: a sessão tem um "nível de garantia" — aal1 (só senha) ou aal2 (senha +
// código). Quem tem fator verificado precisa subir para aal2 depois de logar; o servidor
// (lib/supabase/auth-server.ts) recusa aal1 de quem tem fator.
//
// Este módulo roda no NAVEGADOR (client anon + sessão do usuário).

import { supabase } from "@/lib/supabase/client";

export interface EstadoDuasEtapas {
  /** Tem um TOTP verificado. */
  inscrito: boolean;
  fatorId: string | null;
  nivel: "aal1" | "aal2" | null;
  /** Inscrito, mas a sessão atual ainda está em aal1: precisa do código. */
  precisaCodigo: boolean;
}

export async function estadoDuasEtapas(): Promise<EstadoDuasEtapas> {
  const vazio: EstadoDuasEtapas = { inscrito: false, fatorId: null, nivel: null, precisaCodigo: false };
  try {
    const [{ data: fatores }, { data: aal }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const totp = fatores?.totp?.find((f) => f.status === "verified") ?? null;
    const nivel = (aal?.currentLevel as "aal1" | "aal2" | null) ?? null;
    return {
      inscrito: !!totp,
      fatorId: totp?.id ?? null,
      nivel,
      precisaCodigo: !!totp && aal?.nextLevel === "aal2" && nivel !== "aal2",
    };
  } catch {
    return vazio;
  }
}

/** Fator sem verificar sobra quando alguém abandona no meio; limpa antes de começar de novo. */
async function limparInscricoesAbandonadas(): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }
  }
}

export type Inscricao =
  | { ok: true; fatorId: string; qr: string; segredo: string }
  | { ok: false; erro: string };

export async function iniciarInscricao(): Promise<Inscricao> {
  try {
    await limparInscricoesAbandonadas();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Lone OS" });
    if (error || !data) return { ok: false, erro: traduz(error?.message) };
    return { ok: true, fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
  } catch (err) {
    return { ok: false, erro: traduz(err instanceof Error ? err.message : String(err)) };
  }
}

/** Primeiro código do autenticador: prova que o app foi configurado. A sessão sobe para aal2 na hora. */
export async function confirmarInscricao(fatorId: string, codigo: string): Promise<{ ok: boolean; erro?: string }> {
  return verificarNoFator(fatorId, codigo);
}

/** Código na entrada (login ou sessão restaurada em aal1). */
export async function verificarCodigo(codigo: string): Promise<{ ok: boolean; erro?: string }> {
  const { data } = await supabase.auth.mfa.listFactors();
  const totp = data?.totp?.find((f) => f.status === "verified");
  if (!totp) return { ok: false, erro: "Nenhum autenticador configurado nesta conta." };
  return verificarNoFator(totp.id, codigo);
}

async function verificarNoFator(fatorId: string, codigo: string): Promise<{ ok: boolean; erro?: string }> {
  const limpo = codigo.replace(/\D/g, "");
  if (limpo.length !== 6) return { ok: false, erro: "O código tem 6 dígitos." };
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: limpo });
    if (error) return { ok: false, erro: traduz(error.message) };
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: traduz(err instanceof Error ? err.message : String(err)) };
  }
}

/** Desligar exige sessão em aal2 (o GoTrue recusa em aal1) — quem tem o autenticador na mão é quem pode tirar. */
export async function removerDuasEtapas(fatorId: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId });
    if (error) return { ok: false, erro: traduz(error.message) };
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: traduz(err instanceof Error ? err.message : String(err)) };
  }
}

export function traduz(msg?: string | null): string {
  const m = (msg ?? "").toLowerCase();
  if (!m) return "Não deu certo. Tente de novo.";
  if (m.includes("invalid totp") || m.includes("invalid code") || m.includes("code is invalid")) return "Código inválido ou vencido. Confira o relógio do celular e tente o próximo.";
  if (m.includes("mfa") && (m.includes("disabled") || m.includes("not enabled"))) return "A verificação em duas etapas está desligada no servidor de autenticação (GOTRUE_MFA_ENABLED).";
  if (m.includes("aal2")) return "Confirme o código do autenticador antes de mudar isso.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Espere um minuto.";
  if (m.includes("maximum number")) return "Já existe o máximo de autenticadores nesta conta. Remova um antes.";
  return msg ?? "Não deu certo.";
}
