// lib/tarefas/editar.ts — o que mudou numa tarefa editada (25/10/2026, auditoria 13.5). Módulo PURO.
//
// Não existia "Editar": prazo, pessoa, cliente ou título errado só se corrigia excluindo e criando de novo (e a exclusão
// é física). O formulário de edição é o mesmo da criação; aqui sai só o que mudou, para o update não regravar o resto.
// Campo LIMPO vai como "" (o servidor grava null): `undefined` some no JSON e o prazo apagado continuaria lá.

import type { Task } from "@/lib/types";

export type EdicaoTarefa = Partial<Pick<Task, "title" | "assignedTo" | "role" | "priority" | "dueDate" | "clientId" | "clientName" | "description">>;

const CAMPOS = ["title", "assignedTo", "role", "priority", "dueDate", "clientId", "clientName", "description"] as const;

export function mudancasDaTarefa(antes: Task, depois: Omit<Task, "id">): EdicaoTarefa {
  const out: Record<string, string> = {};
  for (const c of CAMPOS) {
    const a = ((antes[c] as string | undefined) ?? "").trim();
    const d = ((depois[c] as string | undefined) ?? "").trim();
    if (a !== d) out[c] = d;
  }
  return out as unknown as EdicaoTarefa;
}

/** Título vazio não salva — a lista ficaria com uma linha em branco. Vale para o corpo cru da rota também. */
export function erroDaEdicao(e: { title?: unknown; assignedTo?: unknown }): string | null {
  if (e.title !== undefined && (typeof e.title !== "string" || !e.title.trim())) return "O título não pode ficar vazio.";
  if (e.assignedTo !== undefined && (typeof e.assignedTo !== "string" || !e.assignedTo.trim())) return "Escolha quem vai fazer a tarefa.";
  return null;
}
