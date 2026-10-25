"use client";

// components/tarefas/useConcluirTarefa.ts — concluir tarefa com "Desfazer", igual em toda tela (25/10/2026, auditoria 6.6).
//
// O "Desfazer" da 4.14 só existia na tela de Tarefas; no Hoje o quadradinho concluía, a tarefa sumia da lista e não
// havia volta — e o erro trocava o motivo do servidor por "Não consegui atualizar a tarefa". Agora as duas telas usam
// este gancho: aviso com "Desfazer" por 8 s (devolve o status de antes) e, na falha, o motivo que o servidor deu.

import { useCallback } from "react";
import { toast } from "sonner";
import { useOperationalStore } from "@/stores/useOperationalStore";
import type { Task } from "@/lib/types";

/** O motivo do erro para a tela: a frase do servidor (via `chamar`) ou "sem resposta do servidor". */
export const motivoDoErro = (e: unknown) => (e instanceof Error && e.message ? e.message : "sem resposta do servidor");

export function useConcluirTarefa(opcoes: { aoConcluir?: (t: Task) => void } = {}) {
  const updateTask = useOperationalStore((s) => s.updateTask);
  const { aoConcluir } = opcoes;

  const concluir = useCallback(async (t: Task) => {
    const antes = t.status;
    try { await updateTask(t.id, { status: "done" }); }
    catch (e) { toast.error(`Não concluí a tarefa: ${motivoDoErro(e)}`); return; }
    aoConcluir?.(t);
    toast.success(`Concluída: ${t.title}`, {
      duration: 8000,
      action: {
        label: "Desfazer",
        onClick: async () => {
          try { await updateTask(t.id, { status: antes }); toast.success("Tarefa reaberta."); }
          catch (e) { toast.error(`Não consegui reabrir: ${motivoDoErro(e)}`); }
        },
      },
    });
  }, [updateTask, aoConcluir]);

  const reabrir = useCallback(async (t: Task) => {
    try { await updateTask(t.id, { status: "pending" }); }
    catch (e) { toast.error(`Não reabri a tarefa: ${motivoDoErro(e)}`); }
  }, [updateTask]);

  return { concluir, reabrir };
}
