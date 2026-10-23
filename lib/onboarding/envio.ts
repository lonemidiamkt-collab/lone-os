// lib/onboarding/envio.ts — o que o "Enviar" do link de cadastro (e o "approve") grava na FICHA.
//
// POR QUE (21/10/2026, auditoria de erro recuperável, item 1.2). O envio gravava em `clients`
// facebook_login, instagram_login, google_ads_login e `notes` mesmo vazios: apagava os logins que a
// equipe já tinha na ficha e trocava as NOTAS INTERNAS do time pela observação do cliente. O mesmo
// valia para os opcionais (razão social, CPF, telefones…): campo em branco apagava a ficha.
//
// Regra: a ficha recebe o que o cadastro tem PREENCHIDO; vazio não apaga; `notes` (da equipe) nunca
// é tocado. A observação do cliente fica no campo dela, client_onboarding_submissions.notes — a tela
// de Pendentes já mostra como "Observações do Cliente" — e vai para a linha do tempo da ficha e para o
// aviso no grupo de cadastro (app/api/onboarding, action "submit").
//
// Puro (sem banco). Testado em tests/onboarding-acessos.test.ts.

import { patchDoRascunho, RASCUNHO_PARA_FICHA } from "./sincronia";
import { ACESSOS, acessosParaFicha } from "./acessos";

/** Colunas do rascunho que o envio lê para montar a ficha (+ notes, para o aviso à equipe). */
export const COLUNAS_DO_ENVIO = [
  ...Object.keys(RASCUNHO_PARA_FICHA),
  ...ACESSOS.flatMap((a) => [a.login, a.senha]),
  "notes",
].join(", ");

/**
 * Patch de `clients` a partir da linha FINAL do rascunho (snake_case, como está no banco).
 * Ficha vazia + "em cadastro" na sincronia = tudo o que veio preenchido entra, normalizado do mesmo
 * jeito (@ do Instagram, e-mail minúsculo); o envio é a versão que o cliente confirmou.
 */
export function fichaDoEnvio(linha: Record<string, unknown>): Record<string, unknown> {
  return { ...patchDoRascunho(linha, {}, true), ...acessosParaFicha(linha) };
}

/** A observação do cliente pronta para a equipe ler (linha do tempo, grupo). null = não escreveu. */
export function observacaoDoCliente(notes: unknown, max = 500): string | null {
  if (typeof notes !== "string") return null;
  const t = notes.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
