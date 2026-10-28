// lib/crm/sem-venda.ts — cliente que entrou no Lone OS sem venda registrada no Comercial (28/10/2026).
//
// Boali, Dominos, Novafer, Mestre das Obras e Armazém das Festas entraram pelo "Novo cliente", sem lead Ganho: a
// meta do mês, os relatórios do Comercial e o Finance (porta /vendas) não os viam como venda. Aqui a aba Fechados
// lista quem entrou desde que o Comercial existe e não tem venda ligada; "Registrar a venda" cria o lead Ganho já
// ligado ao cadastro (clients.source_lead_id), e "Não foi venda" (segunda loja, contrato duplo, cliente antigo)
// tira da lista — a decisão fica em automation_settings, como as outras travas do Comercial.

import { supabaseAdmin } from "@/lib/supabase/server";
import { podeReceberDocumento } from "@/lib/contracts/assinatura";

/** O Comercial começou em 17/10/2026: antes disso, cliente sem lead é o normal, não pendência. */
export const COMERCIAL_COMECOU = "2026-10-17";
export const jobDispensa = (clientId: string) => `crm-sem-venda:${clientId}`;

export interface ClienteSemVenda {
  clientId: string;
  nome: string;
  /** AAAA-MM-DD em que o cadastro nasceu (proposta para a data da venda). */
  entrouEm: string;
  cadastro: "link" | "aprovacao" | "completo";
}

export interface LinhaClienteSemVenda {
  id: string;
  name: string | null;
  nome_fantasia: string | null;
  created_at: string;
  draft_status: string | null;
  source_lead_id: string | null;
  churned_at: string | null;
}

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Quem entra na lista. Pura. */
export function clientesSemVenda(linhas: LinhaClienteSemVenda[], dispensados: Set<string>): ClienteSemVenda[] {
  return linhas
    .filter((c) => !c.source_lead_id && !c.churned_at && !dispensados.has(c.id) && podeReceberDocumento(c))
    .filter((c) => diaSP(c.created_at) >= COMERCIAL_COMECOU)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((c) => ({
      clientId: c.id,
      nome: (c.nome_fantasia || c.name || "Cliente").trim(),
      entrouEm: diaSP(c.created_at),
      cadastro: c.draft_status === "pending_invite" ? "link" : c.draft_status === "awaiting_approval" ? "aprovacao" : "completo",
    }));
}

export async function lerClientesSemVenda(): Promise<{ ok: true; clientes: ClienteSemVenda[] } | { ok: false; erro: string }> {
  const [cl, tr] = await Promise.all([
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, created_at, draft_status, source_lead_id, churned_at")
      .is("source_lead_id", null).gte("created_at", `${COMERCIAL_COMECOU}T03:00:00Z`),
    supabaseAdmin.from("automation_settings").select("job").like("job", "crm-sem-venda:%"),
  ]);
  if (cl.error) return { ok: false, erro: `não consegui ler os clientes: ${cl.error.message}` };
  if (tr.error) return { ok: false, erro: `não consegui ler quem já foi dispensado: ${tr.error.message}` };
  const dispensados = new Set(((tr.data as { job: string }[] | null) ?? []).map((t) => t.job.slice("crm-sem-venda:".length)));
  return { ok: true, clientes: clientesSemVenda((cl.data as LinhaClienteSemVenda[] | null) ?? [], dispensados) };
}
