"use client";

// Criação de tarefa — o formulário da tela de Tarefas, agora usado também pelo botão "Nova tarefa"
// do Meu Trabalho e pela ação "Nova tarefa" da busca ⌘K (?acao=nova-tarefa). Um formulário só:
// o que muda aqui (colaboradores, prioridade, cliente) muda em todo lugar que cria tarefa.

import { useEffect, useState } from "react";
import { ListChecks, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useRole } from "@/lib/context/RoleContext";
import type { Priority, Role, Task } from "@/lib/types";

/** Colaboradores vêm da equipe VIVA (banco), não de lista em arquivo — foi lista em arquivo que
 *  deixou o substituto do Pedro Henrique invisível pro sistema em 10/08. */
export function useColaboradores() {
  const { profiles } = useRole();
  return profiles.map((p) => ({ name: p.name, role: p.role }));
}

/**
 * Botão "Nova tarefa" + o formulário. `abrirAoMontar` abre direto (atalho ?acao=nova-tarefa);
 * `aoAbrir` avisa quem montou, para limpar o parâmetro da URL.
 */
export function BotaoNovaTarefa({ abrirAoMontar = false, aoAbrir }: { abrirAoMontar?: boolean; aoAbrir?: () => void }) {
  const addTask = useOperationalStore((s) => s.addTask);
  const clients = useClientsStore((s) => s.clients);
  const { currentUser } = useRole();
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!abrirAoMontar) return;
    setCriando(true);
    aoAbrir?.();
  }, [abrirAoMontar]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        onClick={() => setCriando(true)}
        className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <Plus size={16} /> Nova tarefa
      </button>

      {criando && (
        <NovaTarefaModal
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          currentUser={currentUser}
          onClose={() => setCriando(false)}
          onCriar={async (dados) => {
            try {
              await addTask(dados);
              toast.success("Tarefa criada.");
              setCriando(false);
            } catch { toast.error("Não deu pra criar a tarefa."); }
          }}
        />
      )}
    </>
  );
}

export function NovaTarefaModal({
  clients, currentUser, onClose, onCriar,
}: {
  clients: { id: string; name: string }[]; currentUser: string;
  onClose: () => void; onCriar: (t: Omit<Task, "id">) => Promise<void>;
}) {
  const COLABORADORES = useColaboradores();
  const [title, setTitle] = useState("");
  // Padrão = quem está criando (o caso mais comum é anotar pra si). O 1º da lista era um nome
  // qualquer, e a tarefa ia pra pessoa errada sem ninguém perceber.
  const [assignedTo, setAssignedTo] = useState(currentUser);
  const [erro, setErro] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    const prof = COLABORADORES.find((c) => c.name === assignedTo);
    if (!assignedTo || !prof) {
      setErro(COLABORADORES.length === 0
        ? "A lista da equipe não carregou — recarregue a página para escolher o colaborador."
        : "Escolha um colaborador da equipe.");
      return;
    }
    setErro(null);
    setSalvando(true);
    const cli = clients.find((c) => c.id === clientId);
    await onCriar({
      title: title.trim(),
      assignedTo,
      role: prof.role as Role,
      status: "pending",
      priority,
      dueDate: dueDate || undefined,
      clientId: clientId || "",
      clientName: cli?.name || "",
      description: description.trim() || undefined,
      createdBy: currentUser,
    });
    setSalvando(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Nova tarefa"
        className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-sm p-6 space-y-4 animate-fade-in max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><ListChecks size={18} className="text-primary" /> Nova tarefa</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">O que precisa ser feito? *</label>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
            placeholder="Ex.: Criar arte de piso da Imperio"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Colaborador *</label>
            <select value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); setErro(null); }}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary/40 outline-none">
              {!COLABORADORES.some((c) => c.name === assignedTo) && <option value={assignedTo}>{assignedTo || "— Escolha —"}</option>}
              {COLABORADORES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Prazo</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary/40 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary/40 outline-none">
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="critical">Crítica</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Cliente <span className="text-muted-foreground/60">(opcional)</span></label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary/40 outline-none">
              <option value="">— Sem cliente —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Detalhes <span className="text-muted-foreground/60">(opcional)</span></label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder="Contexto, referências, o que não pode faltar…"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 outline-none resize-none" />
        </div>

        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
          <button onClick={submit} disabled={!title.trim() || salvando}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 transition-all disabled:opacity-50">
            {salvando ? "Criando…" : "Criar tarefa"}
          </button>
        </div>
      </div>
    </div>
  );
}
