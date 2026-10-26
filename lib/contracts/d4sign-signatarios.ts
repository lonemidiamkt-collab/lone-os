// lib/contracts/d4sign-signatarios.ts — quem assina cada contrato na D4Sign e quem ainda falta. Módulo PURO.
//
// Quem assina pela Lone sai do gerador do contrato (lib/contracts/generateDocx.ts: "ambos", "roberto",
// "lucas"). Os e-mails com que eles assinam na D4Sign NÃO moram no código (o repositório é público): ficam
// no .env da VPS, junto das chaves da D4Sign:
//   D4SIGN_EMAIL_ROBERTO, D4SIGN_EMAIL_LUCAS   e-mail de cada sócio na D4Sign
//   D4SIGN_TESTEMUNHAS                          opcional: e-mails das testemunhas, separados por vírgula
//
// Papel de cada signatário: "lone" (e-mail de um sócio), "testemunha" (da lista), "cliente" (todo o resto —
// o outro lado do contrato). E-mail e chave (key_signer) ficam no servidor: a tela mostra nome e papel, e o
// Lone Finance recebe só nome, papel e se assinou.

import type { Signatario } from "./d4sign";

export type Papel = "cliente" | "lone" | "testemunha";
export type QuemAssinaPelaLone = "ambos" | "roberto" | "lucas";

export interface SignatarioGravado {
  nome: string | null;
  email: string | null;
  papel: Papel;
  assinou: boolean;
  assinadoEm: string | null;
  chave: string | null;
}

export interface SocioQueAssina { quem: "roberto" | "lucas"; nome: string; email: string | null }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailValido = (e: string | null | undefined): e is string => !!e && EMAIL.test(e.trim());
const limpo = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export function sociosQueAssinam(env: Record<string, string | undefined> = process.env): SocioQueAssina[] {
  return [
    { quem: "roberto", nome: "Roberto Lino Machado Neto", email: emailValido(env.D4SIGN_EMAIL_ROBERTO) ? limpo(env.D4SIGN_EMAIL_ROBERTO) : null },
    { quem: "lucas", nome: "Lucas Bueno dos Santos", email: emailValido(env.D4SIGN_EMAIL_LUCAS) ? limpo(env.D4SIGN_EMAIL_LUCAS) : null },
  ];
}

export function testemunhas(env: Record<string, string | undefined> = process.env): string[] {
  return (env.D4SIGN_TESTEMUNHAS ?? "").split(",").map(limpo).filter(emailValido);
}

export function papelDe(email: string | null, env: Record<string, string | undefined> = process.env): Papel {
  const e = limpo(email);
  if (e && sociosQueAssinam(env).some((s) => s.email === e)) return "lone";
  if (e && testemunhas(env).includes(e)) return "testemunha";
  return "cliente";
}

/** Os signatários lidos da D4Sign, com o papel de cada um, prontos para gravar. */
export function gravarSignatarios(lista: Signatario[], env: Record<string, string | undefined> = process.env): SignatarioGravado[] {
  return lista.map((s) => ({
    nome: s.nome, email: s.email, papel: papelDe(s.email, env), assinou: s.assinou, assinadoEm: s.assinadoEm, chave: s.chave,
  }));
}

/** Lê o jsonb gravado, tolerando o que não for lista. */
export function lerSignatariosGravados(v: unknown): SignatarioGravado[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is SignatarioGravado => !!x && typeof x === "object" && typeof (x as SignatarioGravado).assinou === "boolean")
    .map((x) => ({ ...x, papel: (["cliente", "lone", "testemunha"] as Papel[]).includes(x.papel) ? x.papel : "cliente" }));
}

export const faltamAssinar = (lista: SignatarioGravado[]) => lista.filter((s) => !s.assinou);

/**
 * Quem vai receber o contrato quando ele sai pelo Lone OS: o cliente (act 4, "como parte"), os sócios
 * escolhidos no gerador (act 4) e as testemunhas configuradas (act 5). `faltando` diz o que impede o envio.
 */
export function signatariosDoEnvio(p: {
  emailCliente: string | null;
  nomeCliente: string;
  quemAssina: QuemAssinaPelaLone;
  env?: Record<string, string | undefined>;
}): { lista: { papel: Papel; nome: string; email: string; act: "4" | "5" }[]; faltando: string[] } {
  const env = p.env ?? process.env;
  const faltando: string[] = [];
  const lista: { papel: Papel; nome: string; email: string; act: "4" | "5" }[] = [];
  if (emailValido(p.emailCliente)) lista.push({ papel: "cliente", nome: p.nomeCliente, email: limpo(p.emailCliente), act: "4" });
  else faltando.push("o e-mail de quem assina pelo cliente");
  for (const s of sociosQueAssinam(env)) {
    if (p.quemAssina !== "ambos" && p.quemAssina !== s.quem) continue;
    if (s.email) lista.push({ papel: "lone", nome: s.nome, email: s.email, act: "4" });
    else faltando.push(`o e-mail do ${s.nome.split(" ")[0]} na D4Sign (D4SIGN_EMAIL_${s.quem.toUpperCase()} no servidor)`);
  }
  for (const t of testemunhas(env)) lista.push({ papel: "testemunha", nome: t, email: t, act: "5" });
  const repetidos = lista.map((s) => s.email).filter((e, i, a) => a.indexOf(e) !== i);
  if (repetidos.length) faltando.push(`e-mail repetido entre os signatários (${[...new Set(repetidos)].join(", ")})`);
  return { lista, faltando };
}
