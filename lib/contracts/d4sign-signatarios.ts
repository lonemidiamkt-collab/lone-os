// lib/contracts/d4sign-signatarios.ts — quem é quem entre os signatários de um documento da D4Sign. Módulo PURO.
//
// Papel de cada signatário, pelo e-mail:
//   "lone"       um dos e-mails de quem assina pela Lone (painel ou D4SIGN_EMAILS_LONE) ou o e-mail da CONTRATADA
//   "cliente"    um e-mail do cadastro do cliente (email ou email_corporativo)
//   "cliente"    também quem sobra, QUANDO os e-mails da Lone estão configurados (é o outro lado do contrato)
//   "indefinido" quem sobra quando os e-mails da Lone não estão configurados — sem chute: a tela mostra só o nome
// E-mail e chave (key_signer) ficam no servidor; a tela mostra nome e papel.

import { CONTRATADA } from "./contratada";
import type { Signatario } from "./d4sign";
import type { Papel } from "./d4sign-resumo";

export interface SignatarioGravado {
  nome: string | null;
  email: string | null;
  papel: Papel;
  assinou: boolean;
  assinadoEm: string | null;
  chave: string | null;
}

const limpo = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export function papelDe(email: string | null, p: { emailsLone: string[]; emailsCliente: string[] }): Papel {
  const e = limpo(email);
  const lone = new Set([...p.emailsLone.map(limpo), limpo(CONTRATADA.email)]);
  if (e && lone.has(e)) return "lone";
  if (e && p.emailsCliente.map(limpo).includes(e)) return "cliente";
  return p.emailsLone.length ? "cliente" : "indefinido";
}

/** Os signatários lidos da D4Sign, com o papel de cada um, prontos para gravar. */
export function gravarSignatarios(lista: Signatario[], p: { emailsLone: string[]; emailsCliente: string[] }): SignatarioGravado[] {
  return lista.map((s) => ({
    nome: s.nome, email: s.email, papel: papelDe(s.email, p), assinou: s.assinou, assinadoEm: s.assinadoEm, chave: s.chave,
  }));
}

/** Lê o jsonb gravado, tolerando o que não for lista. */
export function lerSignatariosGravados(v: unknown): SignatarioGravado[] {
  if (!Array.isArray(v)) return [];
  const papeis: Papel[] = ["cliente", "lone", "testemunha", "indefinido"];
  return v.filter((x): x is SignatarioGravado => !!x && typeof x === "object" && typeof (x as SignatarioGravado).assinou === "boolean")
    .map((x) => ({ ...x, papel: papeis.includes(x.papel) ? x.papel : "indefinido" }));
}

/**
 * A "assinatura" do estado parcial: quem já assinou (e-mails em ordem). Muda a cada nova assinatura — é a
 * trava do aviso parcial (d4sign_documentos.aviso_parcial). Só letras, números e hífen.
 */
export function chaveDoParcial(lista: SignatarioGravado[]): string {
  const feitos = lista.filter((s) => s.assinou).map((s) => limpo(s.email) || limpo(s.nome)).sort();
  let h = 0;
  for (const c of feitos.join("|")) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return `p${feitos.length}-${(h >>> 0).toString(36)}`;
}
