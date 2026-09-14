// lib/priority/fontes — ADAPTADORES: cada fonte que já existe vira ItemBruto[]. Nenhuma calcula
// score; nenhuma inventa fato. Se a fonte diz "CPL 2,7× a meta", é isso que entra em `fato`.

import { supabaseAdmin } from "@/lib/supabase/server";
import { temTrafego } from "@/lib/clients/servico";
import type { ItemBruto, ContextoRanking } from "../tipos";
import { itensDoTrafego } from "./trafego";
import { itensDaProducao } from "./producao";
import { itensDaSaude } from "./saude";
import { itensDeTarefas } from "./tarefas";

export interface ClienteRef {
  id: string;
  nome: string;
  assignedSocial: string | null;
  assignedTraffic: string | null;
  temTrafego: boolean;
  importancia: number;
}

/** Clientes ativos, com quem cuida e o peso de cada um. Uma leitura, todas as fontes usam. */
export async function carregarClientes(): Promise<{ porId: Map<string, ClienteRef>; porNome: Map<string, ClienteRef> }> {
  const { data, error } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, assigned_social, assigned_traffic, monthly_budget, status, attention_level, service_type")
    .is("archived_at", null);
  if (error) throw new Error(`clients: ${error.message}`);
  const porId = new Map<string, ClienteRef>();
  const porNome = new Map<string, ClienteRef>();
  for (const c of data ?? []) {
    const verba = Number(c.monthly_budget ?? 0);
    // 70 de base; cliente em risco pesa mais (o custo de errar com ele é perder a conta); verba
    // maior pesa um pouco mais, em escala log para não engolir os pequenos.
    const importancia = Math.min(100, 70
      + (c.status === "at_risk" ? 15 : c.status === "average" ? 5 : 0)
      + (c.attention_level === "critical" ? 10 : c.attention_level === "high" ? 5 : 0)
      + (verba > 0 ? Math.min(10, Math.round(Math.log10(verba + 1) * 2.5)) : 0));
    const ref: ClienteRef = {
      id: c.id as string,
      nome: ((c.nome_fantasia as string) || (c.name as string) || "").trim(),
      assignedSocial: (c.assigned_social as string) || null,
      assignedTraffic: (c.assigned_traffic as string) || null,
      temTrafego: temTrafego({ service_type: c.service_type as string | null }),
      importancia,
    };
    porId.set(ref.id, ref);
    for (const n of [c.name as string, c.nome_fantasia as string]) if (n) porNome.set(n.trim().toLowerCase(), ref);
  }
  return { porId, porNome };
}

export async function coletarTudo(): Promise<{ itens: ItemBruto[]; ctx: ContextoRanking; porFonte: Record<string, number>; erros: string[] }> {
  const clientes = await carregarClientes();
  const ctx: ContextoRanking = { importanciaCliente: Object.fromEntries([...clientes.porId.values()].map((c) => [c.id, c.importancia])) };
  const fontes: { nome: string; fn: () => Promise<ItemBruto[]> }[] = [
    { nome: "trafego", fn: () => itensDoTrafego(clientes) },
    { nome: "producao", fn: () => itensDaProducao(clientes) },
    { nome: "saude", fn: () => itensDaSaude(clientes) },
    { nome: "tarefa", fn: () => itensDeTarefas(clientes) },
  ];
  const itens: ItemBruto[] = [];
  const porFonte: Record<string, number> = {};
  const erros: string[] = [];
  // Uma fonte quebrada não derruba a rodada: as outras seguem, e o erro fica visível na resposta.
  const resultados = await Promise.allSettled(fontes.map((f) => f.fn()));
  resultados.forEach((r, i) => {
    const nome = fontes[i].nome;
    if (r.status === "fulfilled") { itens.push(...r.value); porFonte[nome] = r.value.length; }
    else { porFonte[nome] = 0; erros.push(`${nome}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`); }
  });
  return { itens, ctx, porFonte, erros };
}
