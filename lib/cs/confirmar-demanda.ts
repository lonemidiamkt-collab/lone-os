// lib/cs/confirmar-demanda.ts — QUANDO uma demanda do agente vira "confirmada". Regras puras
// (tests/cs-confirmar-demanda.test.ts); quem grava é lib/cs/confirmar-demanda-server.ts.
//
// POR QUE (21/10/2026, auditoria de erro recuperável, 5.9). O "ok" (no WhatsApp ou no painel)
// marcava a demanda "confirmada" ANTES de saber se o card nasceu. Quando `criarCardDemanda` voltava
// null, a demanda ficava confirmada sem card; a nova tentativa caía em "essa já foi decidida" e o
// pedido do cliente sumia. E demanda sem cliente virava card no cliente de TESTE (CS_TEST_CLIENT_ID)
// — em produção.
//
// Agora: só "confirmada" com card criado. Sem card → continua pendente, com o motivo gravado, e o
// próximo "ok" tenta de novo. Sem cliente → recusa (nada de cliente de teste).

export type MotivoFalha = "sem_cliente" | "pauta_sem_itens" | "card_falhou";

/** O que a criação de card(s) produziu. `total` = quantos se tentou (pauta: um por item). */
export interface Criacao {
  ids: string[];
  total: number;
  erros: string[];
}

export type DesfechoConfirmacao =
  | { confirmar: true; cardId: string; criados: number; total: number; falhas: string[] }
  | { confirmar: false; motivo: MotivoFalha; erro: string };

/**
 * Confirma com pelo menos um card. Pauta parcial (3 de 5) confirma — refazer criaria os 3 de novo —
 * mas devolve as falhas para o time criar as que faltaram.
 */
export function desfechoDaConfirmacao(c: Criacao): DesfechoConfirmacao {
  if (!c.ids.length) return { confirmar: false, motivo: "card_falhou", erro: c.erros[0] || "o card não foi criado" };
  return { confirmar: true, cardId: c.ids[0], criados: c.ids.length, total: c.total, falhas: c.erros };
}

/** O cliente da demanda. SEM fallback para o cliente de teste: demanda sem cliente não vira card. */
export function clienteDaDemanda(d: { client_id?: unknown }): string | null {
  return typeof d.client_id === "string" && d.client_id.trim() ? d.client_id : null;
}

/** A frase para o time quando o "ok" não criou o card. Diz o que houve e o que fazer. */
export function textoFalhaConfirmacao(resumo: string, motivo: MotivoFalha, erro: string): string {
  switch (motivo) {
    case "sem_cliente":
      return `⚠️ *${resumo}* não tem cliente vinculado — não criei card. Responde *não* pra descartar e me pede de novo dizendo o cliente.`;
    case "pauta_sem_itens":
      return `Eita, não consegui recuperar os itens da pauta *${resumo}* 😕 A sugestão continua aberta — monta direto no board ou responde *não* pra descartar.`;
    case "card_falhou":
      return `❌ Não consegui criar o card de *${resumo}* (${erro.slice(0, 140)}). A sugestão *continua aberta* — responde *ok* de novo pra tentar.`;
  }
}

/** Pauta que criou só parte dos cards: quais faltaram. Vazio quando criou tudo. */
export function textoPautaParcial(criados: number, total: number, falhas: string[]): string {
  if (criados >= total || !falhas.length) return "";
  return `\n⚠️ Criei *${criados} de ${total}*. Não consegui: ${falhas.slice(0, 5).map((f) => `_${f.slice(0, 80)}_`).join("; ")} — cria esses à mão no board.`;
}
