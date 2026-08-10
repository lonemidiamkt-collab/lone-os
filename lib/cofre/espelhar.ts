// lib/cofre/espelhar.ts — a senha do cliente tem que chegar em QUEM USA ELA.
//
// O PROBLEMA (Roberto, 05/08): "faço o cadastro do cliente, adiciono as senhas, e elas não vão
// pro social nem pro gestor — é como se não existissem, mas no painel admin tem".
//
// POR QUE ACONTECE. O cofre vive em dois lugares por decisão de segurança:
//   · `clients.*_password`      → CRIPTOGRAFADO, só admin lê (cadastro)
//   · `client_access.*_password` → texto puro, é o que social e gestor abrem no dia a dia
//
// Editar a senha na ficha de um cliente EXISTENTE já espelhava (/api/client-vault). Mas na
// ATIVAÇÃO de cliente novo a senha ia só pro `clients` — e o social ficava sem. Dos 43 clientes
// com senha cadastrada, 2 (os mais recentes) estavam assim: a informação existia e não chegava
// em quem trabalha com ela.
//
// Aqui a lógica fica em UM lugar só, chamada pelos dois caminhos. Espalhada, ela ia divergir de
// novo no próximo fluxo que alguém criasse.

import { supabaseAdmin } from "@/lib/supabase/server";

/** O que o social realmente usa. Google Ads fica de fora: é do tráfego e não entra nessa tela. */
export interface SenhasParaEspelhar {
  instagram_login?: string | null;
  instagram_password?: string | null;
  facebook_login?: string | null;
  facebook_password?: string | null;
}

/**
 * Copia login/senha (em texto puro) pro cofre que social e gestor enxergam.
 *
 * Recebe os valores JÁ EM TEXTO — nunca o criptografado do `clients`. Espelhar o cifrado
 * encheria o cofre de string ilegível e o time acharia que a senha está errada.
 *
 * Só grava campo que veio preenchido: uma ativação que não trouxe o Facebook não pode APAGAR
 * o Facebook que já estava lá.
 *
 * Nunca lança — falha de espelho não pode derrubar a ativação do cliente. Devolve o que houve
 * pra quem chamou registrar no log.
 */
export async function espelharNoCofre(
  clientId: string,
  senhas: SenhasParaEspelhar,
): Promise<{ ok: boolean; campos: string[]; erro?: string }> {
  // CIFRA ANTES DE ESPELHAR. Este espelho existe pra levar a senha do cadastro admin até quem
  // trabalha — mas o cofre de origem guarda cifrado e o destino guardava em texto puro. O espelho
  // estava, na prática, DESFAZENDO a cifra a cada cliente novo. Aqui roda sempre no servidor, onde
  // a chave existe; se ela faltar, é melhor falhar do que gravar senha aberta achando que salvou.
  const { encryptVault } = await import("@/lib/crypto/vault");
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(senhas)) {
    if (typeof v !== "string" || !v.trim()) continue;
    row[k] = k.endsWith("_password") ? encryptVault(v.trim()) : v.trim();
  }
  const campos = Object.keys(row);
  if (!clientId || !campos.length) return { ok: true, campos: [] };

  try {
    // SEM `updated_by`: a coluna tem FK pra team_members.id e quebra com e-mail ou nome solto.
    // Autoria aqui é secundária — o que não pode faltar é a senha chegando em quem trabalha.
    const { error } = await supabaseAdmin.from("client_access").upsert(
      { client_id: clientId, ...row, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );
    if (error) return { ok: false, campos, erro: error.message };
    return { ok: true, campos };
  } catch (e) {
    return { ok: false, campos, erro: e instanceof Error ? e.message : "erro" };
  }
}
