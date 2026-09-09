// A LEITURA: quem teve reunião, quem não teve.
//
// Um só lugar que pergunta isso ao banco. A aba Clientes, o dashboard e a ficha chamam daqui —
// telas diferentes calculando a mesma coisa por conta própria é como nascem três respostas para
// a mesma pergunta.

import { supabaseAdmin } from "@/lib/supabase/server";
import { saudeDoCliente, type ReuniaoRef, type SaudeReuniao } from "./status";

export interface ClienteComReuniao {
  clientId: string;
  nome: string;
  responsavel: string | null;
  saude: SaudeReuniao;
}

/**
 * Traz TODAS as reuniões vivas dos clientes pedidos.
 *
 * "Todas", e não só as do mês, porque "última reunião" e "dias sem reunião" olham para trás —
 * e é justamente o cliente esquecido há três meses que o indicador existe para achar. Um ano
 * cobre qualquer pergunta que as telas fazem hoje.
 */
export async function reunioesDosClientes(clientIds: string[]): Promise<Map<string, ReuniaoRef[]>> {
  const mapa = new Map<string, ReuniaoRef[]>();
  if (!clientIds.length) return mapa;

  const desde = new Date(Date.now() - 400 * 86400_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select("id, client_id, estado, start_at, realizada_em, responsavel")
    .in("client_id", clientIds)
    .is("deleted_at", null)          // apagada não conta para indicador nenhum
    .gte("start_at", desde)
    .order("start_at", { ascending: false });

  if (error) {
    // Erro de leitura NÃO pode virar "ninguém teve reunião": seria acusar a operação inteira por
    // uma falha de banco. Quem chama recebe o mapa vazio e o log diz o que houve.
    console.error("[meetings/consulta] falha ao ler reuniões:", error.message);
    return mapa;
  }

  for (const m of data ?? []) {
    const id = m.client_id as string;
    const l = mapa.get(id) ?? [];
    l.push({
      id: m.id as string,
      clientId: id,
      estado: (m.estado as string) || "agendada",
      inicio: m.start_at as string,
      realizadaEm: (m.realizada_em as string) ?? null,
      responsavel: (m.responsavel as string) ?? null,
    });
    mapa.set(id, l);
  }
  return mapa;
}

/** A saúde de reunião de cada cliente ativo, para o mês pedido. */
export async function saudeDaCarteira(mes: string, agora = new Date()): Promise<ClienteComReuniao[]> {
  const { data: clientes } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, assigned_social, minimum_meetings_per_month")
    // Elegível = ativo e fora do onboarding. Cliente que ainda está entrando não deve derrubar a
    // cobertura de quem trabalhou o mês inteiro.
    .or("active.is.null,active.eq.true")
    .neq("status", "onboarding")
    .is("draft_status", null);

  const elegiveis = (clientes ?? []).filter((c) => !/\(teste\)/i.test((c.name as string) || ""));
  const porCliente = await reunioesDosClientes(elegiveis.map((c) => c.id as string));

  return elegiveis.map((c) => ({
    clientId: c.id as string,
    nome: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
    responsavel: (c.assigned_social as string) || null,
    saude: saudeDoCliente(
      porCliente.get(c.id as string) ?? [],
      mes,
      agora,
      (c.minimum_meetings_per_month as number) ?? null,
    ),
  }));
}
