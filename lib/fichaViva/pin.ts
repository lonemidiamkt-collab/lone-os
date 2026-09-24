// lib/fichaViva/pin.ts — código de acesso do link do cliente (Ficha Viva).
// Regra do Roberto: o PIN é a PRIMEIRA PALAVRA do nome da loja.
//   "Reformar construção" → "reformar" · "Quero Tintas" → "quero"
// Derivado do nome (sem armazenar) e revalidado no servidor a cada leitura/escrita.

import { criarTrava, type Trava } from "@/lib/portal/limite";

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

// ── Tentativas erradas ────────────────────────────────────────────────────
// O PIN é adivinhável (é o nome da loja), então o que segura é o limite: 5 erros por link em 15 min
// travam o link por 30 min; 10 erros do mesmo IP (em links quaisquer) travam o IP por 1h. As três
// rotas que conferem PIN (access, growth, submit) dividem o mesmo contador — globalThis garante isso
// mesmo com cada rota empacotada à parte.

const MIN = 60_000;
const g = globalThis as { __fichaPinTravas?: { porToken: Trava; porIp: Trava } };
const travas = (g.__fichaPinTravas ??= {
  porToken: criarTrava(5, 15 * MIN, 30 * MIN),
  porIp: criarTrava(10, 15 * MIN, 60 * MIN),
});

/** Segundos até liberar (0 = pode tentar). */
export function pinTravado(token: string, ip: string, agora = Date.now()): number {
  return Math.max(travas.porToken.travado(token, agora), travas.porIp.travado(ip, agora));
}

export function ipTravado(ip: string, agora = Date.now()): number {
  return travas.porIp.travado(ip, agora);
}

export function registrarTentativaPin(token: string, ip: string, acertou: boolean, agora = Date.now()): void {
  if (acertou) { travas.porToken.acertou(token); return; }
  travas.porToken.falhou(token, agora);
  travas.porIp.falhou(ip, agora);
}

export function mensagemTrava(segundos: number): string {
  const min = Math.max(1, Math.ceil(segundos / 60));
  return `Muitas tentativas com o código errado. Tente de novo em ${min} ${min === 1 ? "minuto" : "minutos"} ou fale com a Lone.`;
}
