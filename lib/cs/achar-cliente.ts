// lib/cs/achar-cliente.ts — qual cliente a pessoa citou na frase?
//
// Usado quando o comando vem escrito no grupo ("gera o contrato do Bruno Tintas: 2500…"): o nome
// vem no meio da frase, do jeito que se fala.
//
// REGRA: NA DÚVIDA, NÃO ESCOLHE. Existem "Bruno Tintas Araruama" e "Bruno Tintas Iguaba",
// "BAZAR RIBEIRO" e "Bazar Ribeiro Saquarema". Chutar entre eles gera contrato para o cliente
// errado — e um contrato errado é pior que uma pergunta a mais.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface ClienteAchado {
  id: string;
  nome: string;
}

const normalizar = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Acha o cliente citado no texto.
 *
 * @returns o cliente quando há UM candidato claro; null quando não achou ou quando há empate.
 */
export async function acharClientePorNome(texto: string): Promise<ClienteAchado | null> {
  const t = normalizar(texto);
  if (!t) return null;

  const { data } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia")
    .or("active.is.null,active.eq.true");
  if (!data?.length) return null;

  const candidatos: { id: string; nome: string; peso: number }[] = [];
  for (const c of data) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "";
    const n = normalizar(nome);
    if (!n || n.length < 3) continue;
    // O nome inteiro aparece na frase — é o caso forte, e o mais longo ganha
    // ("Bruno Tintas Iguaba" vence "Bruno Tintas" quando os dois batem).
    if (t.includes(n)) candidatos.push({ id: c.id as string, nome, peso: n.length });
  }
  if (!candidatos.length) return null;

  candidatos.sort((a, b) => b.peso - a.peso);
  // Empate no tamanho = dois nomes igualmente plausíveis. Não escolhe.
  if (candidatos.length > 1 && candidatos[0].peso === candidatos[1].peso) return null;
  return { id: candidatos[0].id, nome: candidatos[0].nome };
}
