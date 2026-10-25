// lib/tarefas/concluidas.ts — a ordem de "Concluídas" na tela de Tarefas (24/10/2026, auditoria 4.14). Módulo PURO.
//
// A lista vem do banco pela data de CRIAÇÃO e a tela mostra 40: a tarefa antiga concluída por engano podia nem
// aparecer em "Concluídas" para ser reaberta. As concluídas agora, nesta tela, vêm primeiro.

/** As concluídas agora primeiro (a mais recente no topo), depois as outras na ordem de sempre. */
export function ordenarConcluidas<T extends { id: string }>(concluidas: T[], recentes: string[]): T[] {
  const pos = new Map(recentes.map((id, i) => [id, i]));
  return [
    ...concluidas.filter((t) => pos.has(t.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!),
    ...concluidas.filter((t) => !pos.has(t.id)),
  ];
}
