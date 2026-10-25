// lib/equipe/email.ts — achar a pessoa da equipe pelo e-mail do login. Puro.
//
// POR QUE (25/10/2026, onda 6 da auditoria de erro recuperável, item 8.12). `team_members` NÃO tem a
// coluna `auth_id`, mas três lugares procuravam por ela: o id da pessoa no painel vinha sempre nulo, o
// social atribuído nunca conseguia revelar a senha do Instagram (caía no 403) e o erro do banco era
// engolido. O elo entre o login (Supabase Auth) e a equipe é o E-MAIL — e comparado sem diferença de
// maiúsculas, porque o Auth guarda minúsculo e linhas antigas da equipe podem ter "Julio@...".

/** E-mail como o Auth guarda: sem espaços nas pontas e em minúsculas. */
export function normalizarEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Padrão para `ilike` que casa SÓ este e-mail, sem curinga. `_` é comum em e-mail e no LIKE vale
 * "qualquer caractere" — sem escapar, `joao_silva@x` casaria com `joaoXsilva@x`.
 */
export function padraoExatoIlike(email: string): string {
  return normalizarEmail(email).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Entre as linhas que o banco devolveu, a que é exatamente este e-mail (sem diferença de caixa). */
export function escolherPorEmail<T extends { email?: unknown }>(linhas: T[] | null | undefined, email: string): T | null {
  const alvo = normalizarEmail(email);
  if (!alvo) return null;
  return (linhas ?? []).find((l) => normalizarEmail(typeof l.email === "string" ? l.email : "") === alvo) ?? null;
}

/** Mapa e-mail (minúsculo) → nome, para trocar e-mail por nome em listas (quem trocou, quem fez). */
export function nomesPorEmail(linhas: Array<{ email?: unknown; name?: unknown }> | null | undefined): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const l of linhas ?? []) {
    const e = normalizarEmail(typeof l.email === "string" ? l.email : "");
    if (e && typeof l.name === "string" && l.name.trim()) mapa.set(e, l.name.trim());
  }
  return mapa;
}
