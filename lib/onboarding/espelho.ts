// lib/onboarding/espelho.ts — a senha que o cliente manda pelo link de cadastro chega ao cofre do social.
//
// POR QUE (24/10/2026, achados A e B da frente "cadastro e portal"). O cofre vive em dois lugares
// (lib/cofre/espelhar.ts): `clients.*_password`, que só a gestão lê, e `client_access`, que é o que o
// social e o gestor abrem no dia a dia.
//   A. Nem o envio final do cadastro nem o `provision` (o caminho da tela Cadastros Pendentes)
//      copiavam para `client_access`; só o `approve` copiava — e nenhuma tela chama o approve.
//      Resultado: o cliente mandava a senha, a gestão via, o social não.
//   B. O `approve` mandava para espelharNoCofre a senha JÁ CIFRADA do cadastro; espelharNoCofre cifra
//      de novo, e o social abriria um texto ilegível achando que a senha está errada.
//
// Regra: o espelho recebe a senha em TEXTO (decifrada aqui) e espelharNoCofre cifra uma vez só.
// Fonte, por plataforma: a FICHA (clients) primeiro — é o que a gestão vê e pode ter sido corrigida
// pelo time depois do envio —, e o rascunho do cadastro quando a ficha não tem (a cópia para a
// ficha pode ter falhado no envio). Login e senha andam em par: nunca o login de um com a senha do outro.
// Google Ads não entra (espelharNoCofre só leva o que o social usa).
//
// Puro (a decifragem é injetada). Testado em tests/onboarding-espelho-cofre.test.ts.

import type { SenhasParaEspelhar } from "@/lib/cofre/espelhar";

const PARES = [
  { plataforma: "instagram", ficha: { login: "instagram_login", senha: "instagram_password" },
    rascunho: { login: "instagram_login", senha: "instagram_password" },
    espelho: { login: "instagram_login", senha: "instagram_password" } },
  { plataforma: "meta", ficha: { login: "facebook_login", senha: "facebook_password" },
    rascunho: { login: "meta_login", senha: "meta_password" },
    espelho: { login: "facebook_login", senha: "facebook_password" } },
] as const;

/** Colunas da ficha que o espelho lê. */
export const COLUNAS_FICHA_ESPELHO = PARES.flatMap((p) => [p.ficha.login, p.ficha.senha]).join(", ");
/** Colunas do rascunho que o espelho lê. */
export const COLUNAS_RASCUNHO_ESPELHO = PARES.flatMap((p) => [p.rascunho.login, p.rascunho.senha]).join(", ");

const preenchido = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export interface PlanoDoEspelho {
  senhas: SenhasParaEspelhar;
  /** Plataformas cuja senha não deu para decifrar (chave trocada, valor corrompido). Nunca a senha. */
  naoDecifradas: string[];
}

/**
 * O que mandar para espelharNoCofre, já em texto. `decifrar` é decryptVault (aceita texto puro
 * legado e devolve como está; lança se o cifrado não abre).
 */
export function senhasParaEspelho(
  fontes: { ficha?: Record<string, unknown> | null; rascunho?: Record<string, unknown> | null },
  decifrar: (valor: string) => string | null,
): PlanoDoEspelho {
  const senhas: SenhasParaEspelhar = {};
  const naoDecifradas: string[] = [];
  const ficha = fontes.ficha ?? {};
  const rascunho = fontes.rascunho ?? {};

  for (const p of PARES) {
    // O par vem de UM lugar só: a ficha se ela tem senha; senão o rascunho se ELE tem; senão só o login.
    const daFicha = preenchido(ficha[p.ficha.senha]);
    const doRascunho = !daFicha && preenchido(rascunho[p.rascunho.senha]);
    const login = daFicha ? ficha[p.ficha.login]
      : doRascunho ? rascunho[p.rascunho.login]
      : preenchido(ficha[p.ficha.login]) ? ficha[p.ficha.login] : rascunho[p.rascunho.login];
    const cifrada = daFicha ? ficha[p.ficha.senha] : doRascunho ? rascunho[p.rascunho.senha] : null;

    if (preenchido(login)) senhas[p.espelho.login] = login.trim();
    if (preenchido(cifrada)) {
      try {
        const texto = decifrar(cifrada);
        if (preenchido(texto)) senhas[p.espelho.senha] = texto;
      } catch {
        naoDecifradas.push(p.plataforma);
      }
    }
  }
  return { senhas, naoDecifradas };
}
