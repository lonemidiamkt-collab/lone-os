// lib/goals/alvo.ts — o alvo digitado em "Editar metas" vale? Módulo PURO (25/10/2026, auditoria 7.1).
//
// O Enter salvava o campo VAZIO como 0 (`Number("")`) e ignorava o "salvando"; o botão bloqueava, o Enter não. Meta
// "quanto mais, melhor" com alvo 0 vira "batida 100%" (avaliarMeta) e o fechamento do dia 1º gravava assim. Dois
// Enter seguidos criavam duas linhas em `okrs`. A regra mora aqui para a tela (Enter e botão) e o servidor usarem a mesma.

import type { Sentido } from "./catalogo";

/** Motivo para recusar o alvo, ou null se ele vale. Vale para o servidor também. */
export function motivoAlvoInvalido(alvo: number, sentido: Sentido): string | null {
  if (!Number.isFinite(alvo) || alvo < 0) return "Informe um número válido (zero ou mais).";
  if (alvo === 0 && sentido === "maior") return "Meta zero já nasce batida — use um número maior que zero.";
  return null;
}

export type LeituraAlvo =
  | { tipo: "salvar"; valor: number; confirmar?: string }
  | { tipo: "erro"; motivo: string }
  /** Igual ao atual: nada a fazer (o botão já fica desligado; o Enter também não faz nada). */
  | { tipo: "igual" };

export function lerAlvoDigitado(texto: string, m: { sentido: Sentido; alvo: number }): LeituraAlvo {
  const t = texto.trim().replace(",", ".");
  if (!t) return { tipo: "erro", motivo: "Digite a meta antes de salvar." };
  const valor = Number(t);
  const invalido = motivoAlvoInvalido(valor, m.sentido);
  if (invalido) return { tipo: "erro", motivo: invalido };
  if (valor === m.alvo) return { tipo: "igual" };
  // "Até 0" é uma meta de verdade (tolerância zero), mas é dura: pede confirmação.
  if (valor === 0) return { tipo: "salvar", valor, confirmar: "Meta zero: qualquer valor acima de zero fica fora da meta. Confirmar?" };
  return { tipo: "salvar", valor };
}
