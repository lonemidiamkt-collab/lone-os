// O HISTÓRICO OPERACIONAL DO CLIENTE — o que a aba promete e não entregava.
//
// Roberto (10/09): "na aba histórico operacional ainda segue sem fazer histórico de forma
// automática […] não está sendo feito para todos os clientes."
//
// O QUE EU ENCONTREI. A aba diz "Registro automático de tudo que acontece com este cliente".
// No banco: 102 entradas para 51 clientes ativos, e 31 clientes sem nenhuma. As entradas de
// `design` — as únicas que pareciam automáticas — pararam em 11/05, quatro meses atrás: quem as
// escrevia era o estado legado em memória do app, que saiu do caminho quando as telas passaram a
// falar com o banco. Desde então, nenhum evento de operação alimenta a aba.
//
// Este módulo é o registrador. A regra que ele impõe: registrar FATO, não intenção. Card criado
// não é história; arte entregue é. Se tudo virar linha, a aba deixa de ser memória e vira log —
// e log ninguém lê.

import { supabaseAdmin } from "@/lib/supabase/server";

export type TipoHistorico =
  | "design"        // arte pedida, produzida, entregue
  | "content"       // post publicado, card programado
  | "meeting"       // reunião (escrito por lib/meetings/auditoria)
  | "chat"          // pedido do cliente que virou demanda
  | "status"        // mudança de estado do cliente, churn, reativação
  | "onboarding"
  | "report"        // relatório enviado
  | "manual";

export interface EventoHistorico {
  clientId: string;
  tipo: TipoHistorico;
  /** Quem fez. "Sistema" quando foi automação — e isso precisa ficar visível na tela. */
  ator: string;
  descricao: string;
  /** Quando o FATO aconteceu. Um card entregue ontem e sincronizado hoje pertence a ontem. */
  quando?: string | null;
  /**
   * Chave de deduplicação. Sem ela, um cron que roda de hora em hora escreve a mesma linha nove
   * vezes — foi assim que outras partes deste sistema viraram ruído.
   */
  chave?: string;
}

const carimbo = (iso?: string | null) =>
  new Date(iso ?? Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * Registra, sem nunca derrubar quem chamou.
 *
 * Histórico é memória, não transação: perder a entrega de uma arte porque a linha de histórico
 * falhou seria trocar o essencial pelo acessório.
 */
export async function registrarHistorico(e: EventoHistorico): Promise<void> {
  try {
    if (e.chave) {
      // Dedup pela descrição exata no mesmo dia. `timeline_entries` não tem coluna de chave, e
      // criar uma exigiria migration numa tabela que várias telas já leem — a descrição idêntica
      // no mesmo dia resolve o caso real (cron repetindo) sem mudar o schema.
      const dia = (e.quando ?? new Date().toISOString()).slice(0, 10);
      const { data: ja } = await supabaseAdmin
        .from("timeline_entries")
        .select("id")
        .eq("client_id", e.clientId)
        .eq("description", e.descricao)
        .gte("created_at", `${dia}T00:00:00-03:00`)
        .limit(1);
      if (ja?.length) return;
    }

    await supabaseAdmin.from("timeline_entries").insert({
      client_id: e.clientId,
      type: e.tipo,
      actor: e.ator,
      description: e.descricao,
      timestamp: carimbo(e.quando),
    });
  } catch (err) {
    console.error("[historico] não consegui registrar:", e.tipo, err);
  }
}

/** Vários de uma vez, para os crons que varrem a base. */
export async function registrarVarios(eventos: EventoHistorico[]): Promise<number> {
  let gravados = 0;
  for (const e of eventos) {
    await registrarHistorico(e);
    gravados += 1;
  }
  return gravados;
}
