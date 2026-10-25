// lib/ia/selo-ia.ts — o selo "IA ok" do /agente. PURO (tests/agente-painel.test.ts).
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 11.7). O selo só olhava se a chave da OpenAI
// existia. Em 25/09 o saldo zerou e a IA ficou 5 dias sem responder — com a chave lá, o /agente mostraria
// "IA ok" o tempo todo. Agora o selo usa o mesmo critério do vigia (lib/ia/saude-ia.ts → iaFora): falhas
// acumuladas desde o último sucesso, com causa conhecida, = IA fora. Leitura do registro que falha não
// vira "ok": vira "não consegui conferir".

import type { IaFora } from "./saude-ia";

export type EstadoIa = "ok" | "desligada" | "fora" | "nao_conferida";

export interface SeloIa {
  estado: EstadoIa;
  /** O que o selo escreve. */
  texto: string;
  /** Quando "fora": desde quando e o que fazer (vem da causa conhecida). */
  detalhe?: string;
}

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

export function seloDaIa(p: { chaveConfigurada: boolean; ia: IaFora | null; registroLido: boolean }): SeloIa {
  if (!p.chaveConfigurada) return { estado: "desligada", texto: "IA desligada" };
  if (p.ia) {
    return {
      estado: "fora",
      texto: `IA fora: ${p.ia.causa.titulo}`,
      detalhe: `Desde ${hora(p.ia.desde)} · ${p.ia.falhas} chamada(s) falharam. ${p.ia.causa.acao}`,
    };
  }
  if (!p.registroLido) return { estado: "nao_conferida", texto: "IA: não consegui conferir", detalhe: "O registro de chamadas da IA não carregou." };
  return { estado: "ok", texto: "IA ok" };
}
