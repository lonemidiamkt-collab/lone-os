// Quem é o dono de uma tarefa, quando ela foi atribuída a um PAPEL e não a uma pessoa.
//
// PRA QUE: a cobrança diária listava "Rodrigo" e "designer" como se fossem duas pessoas — e são a
// mesma. O Roberto viu o resultado no grupo: o mesmo profissional aparecendo em dois blocos, cada um
// com metade das tarefas dele. Das 29 tarefas abertas, 14 estão em papel genérico ("social",
// "designer", "traffic"), e TODAS as 14 têm cliente — então dá pra descobrir o dono de verdade.
//
// A regra é simples: a tarefa é de um cliente, o cliente tem responsável por área, e é esse o dono.

import { supabaseAdmin } from "@/lib/supabase/server";

const PAPEIS: Record<string, "assigned_social" | "assigned_designer" | "assigned_traffic"> = {
  social: "assigned_social",
  "social media": "assigned_social",
  designer: "assigned_designer",
  design: "assigned_designer",
  traffic: "assigned_traffic",
  trafego: "assigned_traffic",
  "tráfego": "assigned_traffic",
};

export function ehPapelGenerico(valor?: string | null): boolean {
  return !!valor && PAPEIS[valor.trim().toLowerCase()] !== undefined;
}

/**
 * Resolve papel → pessoa usando o cliente da tarefa.
 *
 * Devolve `null` quando não dá: cliente sem responsável naquela área, ou tarefa sem cliente. Nesses
 * casos a tarefa aparece como "sem dono" de propósito — é uma pendência de cadastro, e escondê-la
 * atrás de um nome chutado faria a cobrança ir para a pessoa errada.
 */
export async function resolverDonos(
  tarefas: { id: string; assigned_to?: string | null; client_id?: string | null }[],
): Promise<Map<string, string | null>> {
  const saida = new Map<string, string | null>();

  const precisamResolver = tarefas.filter((t) => ehPapelGenerico(t.assigned_to) && t.client_id);
  for (const t of tarefas) {
    if (!ehPapelGenerico(t.assigned_to)) saida.set(t.id, (t.assigned_to ?? "").trim() || null);
  }
  if (!precisamResolver.length) return saida;

  const ids = [...new Set(precisamResolver.map((t) => t.client_id as string))];
  const { data: clientes } = await supabaseAdmin
    .from("clients").select("id, assigned_social, assigned_designer, assigned_traffic").in("id", ids);
  const porId = new Map((clientes ?? []).map((c) => [c.id as string, c]));

  for (const t of precisamResolver) {
    const campo = PAPEIS[String(t.assigned_to).trim().toLowerCase()];
    const cli = porId.get(t.client_id as string);
    const pessoa = String(cli?.[campo] ?? "").trim();
    saida.set(t.id, pessoa || null);
  }
  // Papel genérico sem cliente: nada a resolver, fica sem dono.
  for (const t of tarefas) if (!saida.has(t.id)) saida.set(t.id, null);
  return saida;
}
