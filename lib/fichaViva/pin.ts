// lib/fichaViva/pin.ts — código de acesso do link do cliente (Ficha Viva).
// Regra do Roberto: o PIN é a PRIMEIRA PALAVRA do nome da loja.
//   "Reformar construção" → "reformar" · "Quero Tintas" → "quero"
// Derivado do nome (sem armazenar) e revalidado no servidor a cada leitura/escrita.

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Código esperado = 1ª palavra do nome, normalizada (sem acento, minúscula). */
export function accessCodeFor(name: string): string {
  return norm(name).split(/\s+/)[0] || "";
}

/** Aceita o cliente digitando só a 1ª palavra OU o nome inteiro (compara a 1ª palavra). */
export function checkAccessCode(name: string, input: string): boolean {
  const expected = accessCodeFor(name);
  if (!expected) return false;
  return norm(input).split(/\s+/)[0] === expected;
}
