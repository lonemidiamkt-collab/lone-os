// lib/clients/ficha-sensiveis.ts — a junção da ficha do cliente (app/clients/[id]/page.tsx).
//
// A lista (useClientsStore) vem MAGRA por segurança — sem logins, tokens de link público nem PII
// (cpf/endereço/docs). Esses campos são puxados 1x, gated, por /api/clients/[id] (o "extra"), e na
// junção o extra tem a palavra final SÓ nas chaves sensíveis (para não sobrescrever o que o realtime
// atualiza nos campos comuns).
//
// Consequência: quem muda um campo sensível precisa mudar o EXTRA, não só o store. A Ficha Viva
// mandava o token novo só para o store (patchClientLocal); o extra antigo vencia e o cartão seguia
// mostrando o link velho — já morto — e "Copiar"/"mensagem WhatsApp" entregavam ao cliente um link
// quebrado (21/10/2026). `separarPatchFicha` diz para onde vai cada parte da mudança.
// Testado em tests/ficha-viva-novo-link.test.ts.

import type { Client } from "@/lib/types";

export const CAMPOS_SENSIVEIS_FICHA: (keyof Client)[] = [
  "cpfCnpj", "birthDate", "idade", "docIdentidade", "docContratoSocial",
  "endereco", "enderecoRua", "enderecoNumero", "enderecoBairro", "enderecoCidade", "enderecoEstado", "enderecoCep",
  "facebookLogin", "googleAdsLogin", "instagramLogin",
  "publicReportToken", "publicReportTokenCreatedAt", "publicReportTokenRevokedAt",
  "fichaVivaToken", "fichaVivaRaioxToken", "fichaVivaTokenCreatedAt", "fichaVivaTokenRevokedAt",
];

const ehSensivel = (k: string) => (CAMPOS_SENSIVEIS_FICHA as string[]).includes(k);

/** O cliente que a ficha mostra: o do store, com as chaves sensíveis vindas do extra. */
export function mesclarFicha(base: Client, extra: Partial<Client>): Client {
  const merged = { ...base } as Record<string, unknown>;
  for (const k of CAMPOS_SENSIVEIS_FICHA) {
    const v = (extra as Record<string, unknown>)[k as string];
    if (v !== undefined) merged[k as string] = v;
  }
  return merged as unknown as Client;
}

/**
 * Uma mudança gravada por rota própria (portal, Ficha Viva): o extra recebe TUDO (inclusive o
 * `undefined` que apaga, ex.: revogação desfeita) e o store recebe só os campos comuns.
 */
export function separarPatchFicha(patch: Partial<Client>): { extra: Partial<Client>; comuns: Partial<Client> } {
  const comuns = Object.fromEntries(Object.entries(patch).filter(([k]) => !ehSensivel(k))) as Partial<Client>;
  return { extra: patch, comuns };
}
