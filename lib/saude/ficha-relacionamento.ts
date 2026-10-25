// lib/saude/ficha-relacionamento.ts — o que a ficha de relacionamento manda gravar. PURO
// (tests/saude-ficha-relacionamento.test.ts); a tela é components/saude/FichaRelacionamento.tsx.
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 11.3). "Salvar ficha" mandava TODOS os campos,
// sempre. Quando a jornada não tinha sido lida, a ficha abria vazia e o salvar gravava pendências []
// e notas null — some a nota de handoff do comercial. Mesmo com a leitura certa, mandar tudo
// sobrescrevia o que outra pessoa tinha mudado em outro campo enquanto a ficha estava aberta.
// Agora só vai o que esta pessoa mudou.

import type { Relacionamento } from "./tipos";

/** O formulário como está na tela. */
export interface FormFicha {
  estado: string;
  ultima: string;
  proxima: string;
  /** Uma pendência por linha. */
  pendencias: string;
  notas: string;
}

export function formDaFicha(rel: Relacionamento): FormFicha {
  return {
    estado: rel.estadoManual ?? "",
    ultima: rel.ultimaReuniao ?? "",
    proxima: rel.proximaReuniao ?? "",
    pendencias: rel.pendenciasCliente.map((p) => p.item).join("\n"),
    notas: rel.notas ?? "",
  };
}

const vazioViraNull = (s: string) => (s.trim() ? s : null);
const chave = (s: string) => s.trim().toLowerCase();

/**
 * Só os campos que mudaram, no formato da rota /api/cs/jornada (que já grava só o que vem).
 * `depois` é a ficha como fica depois de gravar (para a tela atualizar sem recarregar).
 * Nada mudou → patch vazio.
 */
export function alteracoesDaFicha(antes: Relacionamento, form: FormFicha): { patch: Record<string, unknown>; depois: Relacionamento } {
  const patch: Record<string, unknown> = {};
  const depois: Relacionamento = { ...antes };

  const estado = vazioViraNull(form.estado);
  if (estado !== (antes.estadoManual ?? null)) { patch.estado = estado; depois.estadoManual = estado; }
  const ultima = vazioViraNull(form.ultima);
  if (ultima !== (antes.ultimaReuniao ?? null)) { patch.ultimaReuniao = ultima; depois.ultimaReuniao = ultima; }
  const proxima = vazioViraNull(form.proxima);
  if (proxima !== (antes.proximaReuniao ?? null)) { patch.proximaReuniao = proxima; depois.proximaReuniao = proxima; }
  const notas = vazioViraNull(form.notas);
  if ((notas ?? "") !== (antes.notas ?? "")) { patch.notas = notas; depois.notas = notas; }

  const itens = form.pendencias.split("\n").map((s) => s.trim()).filter(Boolean);
  const mesmas = itens.length === antes.pendenciasCliente.length
    && itens.every((it, i) => chave(it) === chave(antes.pendenciasCliente[i].item));
  if (!mesmas) {
    // Mantém "desde" e "impacto" de quem já estava na lista.
    const lista = itens.map((item) => antes.pendenciasCliente.find((p) => chave(p.item) === chave(item)) ?? { item });
    patch.pendenciasCliente = lista;
    depois.pendenciasCliente = lista;
  }
  return { patch, depois };
}

/**
 * A ficha como fica depois de gravar o `patch` por cima da versão MAIS NOVA que a tela tem (`atual`) —
 * e não da que estava aberta: um campo que outra pessoa mudou e esta não tocou continua o dela.
 */
export function aplicarNaFicha(atual: Relacionamento, patch: Record<string, unknown>): Relacionamento {
  const r: Relacionamento = { ...atual };
  if ("estado" in patch) r.estadoManual = (patch.estado as string | null) ?? null;
  if ("ultimaReuniao" in patch) r.ultimaReuniao = (patch.ultimaReuniao as string | null) ?? null;
  if ("proximaReuniao" in patch) r.proximaReuniao = (patch.proximaReuniao as string | null) ?? null;
  if ("notas" in patch) r.notas = (patch.notas as string | null) ?? null;
  if ("pendenciasCliente" in patch) r.pendenciasCliente = patch.pendenciasCliente as Relacionamento["pendenciasCliente"];
  return r;
}
