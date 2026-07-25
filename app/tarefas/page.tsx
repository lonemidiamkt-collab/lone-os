"use client";

import { useMemo, useState, useEffect } from "react";
import {
  ListChecks, Plus, X, Check, Clock, AlertTriangle, Calendar,
  User, Trash2, CircleDot, Flag,
} from "lucide-react";
import Header from "@/components/Header";
import EmptyState from "@/components/ui/EmptyState";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useRole, USER_PROFILES } from "@/lib/context/RoleContext";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import type { Priority, Role, Task } from "@/lib/types";
import { toast } from "sonner";

// data local YYYY-MM-DD (fuso do navegador — BRT), pra comparar com due_date (date seca)
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtData = (iso?: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
};
// Colaboradores que podem receber tarefa (todos os perfis do time).
const COLABORADORES = USER_PROFILES.map((p) => ({ name: p.name, role: p.role }));

export default function TarefasPage() {
  const tasks = useOperationalStore((s) => s.tasks);
  const addTask = useOperationalStore((s) => s.addTask);
  const updateTask = useOperationalStore((s) => s.updateTask);
  const deleteTask = useOperationalStore((s) => s.deleteTask);
  const clients = useClientsStore((s) => s.clients);
  const { role, currentUser } = useRole();
  const isGestao = role === "admin" || role === "manager";

  // Sem init a página abria com ZERO tarefas quando acessada direto.
  const initClients = useClientsStore((s) => s.init);
  const initOps = useOperationalStore((s) => s.init);
  useEffect(() => { initClients(); initOps(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [criando, setCriando] = useState(false);
  const [filtroPessoa, setFiltroPessoa] = useState<string>("todos");
  const [verConcluidas, setVerConcluidas] = useState(false);

  // Quem vê o quê: gestão vê tudo; staff vê o que é DELE (recebeu) ou o que ELE criou.
  const visiveis = useMemo(() => {
    let arr = tasks.filter((t) => !isGestao ? (t.assignedTo === currentUser || t.createdBy === currentUser) : true);
    if (isGestao && filtroPessoa !== "todos") arr = arr.filter((t) => t.assignedTo === filtroPessoa);
    return arr;
  }, [tasks, isGestao, currentUser, filtroPessoa]);

  const h = hoje();
  const abertas = visiveis.filter((t) => t.status !== "done");
  const atrasadas = abertas.filter((t) => t.dueDate && t.dueDate < h);
  const venceHoje = abertas.filter((t) => t.dueDate === h);
  const proximas = abertas.filter((t) => !t.dueDate || t.dueDate > h);
  const concluidas = visiveis.filter((t) => t.status === "done").slice(0, 40);

  async function marcarFeita(t: Task) {
    try { await updateTask(t.id, { status: "done" }); toast.success("Tarefa concluída! ✅"); }
    catch { toast.error("Não deu pra concluir. Tente de novo."); }
  }
  async function reabrir(t: Task) {
    try { await updateTask(t.id, { status: "pending" }); } catch { toast.error("Falha ao reabrir."); }
  }
  async function remover(t: Task) {
    if (!window.confirm(`Excluir a tarefa "${t.title}"?`)) return;
    try { await deleteTask(t.id); toast.success("Tarefa excluída."); } catch { toast.error("Falha ao excluir."); }
  }

  const podeMexer = (t: Task) => isGestao || t.assignedTo === currentUser || t.createdBy === currentUser;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <Header title="Tarefas" subtitle="Crie tarefas pro time, acompanhe prazos e conclua — o Lone CS cobra o que vencer." />
        <button
          onClick={() => setCriando(true)}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 transition-all"
        >
          <Plus size={16} /> Nova tarefa
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {isGestao && (
          <select
            value={filtroPessoa}
            onChange={(e) => setFiltroPessoa(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground focus:border-primary/40 outline-none"
          >
            <option value="todos">Todos os colaboradores</option>
            {COLABORADORES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        )}
        <button
          onClick={() => setVerConcluidas((v) => !v)}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${verConcluidas ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
        >
          {verConcluidas ? "Ocultar concluídas" : "Ver concluídas"}
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {abertas.length} aberta{abertas.length !== 1 ? "s" : ""}
          {atrasadas.length > 0 && <span className="text-lone-warning"> · {atrasadas.length} atrasada{atrasadas.length !== 1 ? "s" : ""}</span>}
        </span>
      </div>

      {abertas.length === 0 && !verConcluidas ? (
        <EmptyState icon="✅" title="Nenhuma tarefa em aberto" subtitle="Crie uma tarefa pro time no botão “Nova tarefa”." />
      ) : (
        <div className="space-y-6">
          {atrasadas.length > 0 && <Grupo titulo="Atrasadas" cor="text-lone-warning" icone={<AlertTriangle size={14} />} tarefas={atrasadas} {...{ h, marcarFeita, remover, podeMexer, isGestao }} />}
          {venceHoje.length > 0 && <Grupo titulo="Vence hoje" cor="text-primary" icone={<Clock size={14} />} tarefas={venceHoje} {...{ h, marcarFeita, remover, podeMexer, isGestao }} />}
          {proximas.length > 0 && <Grupo titulo="Em aberto" cor="text-muted-foreground" icone={<CircleDot size={14} />} tarefas={proximas} {...{ h, marcarFeita, remover, podeMexer, isGestao }} />}
          {verConcluidas && concluidas.length > 0 && (
            <Grupo titulo="Concluídas" cor="text-lone-success" icone={<Check size={14} />} tarefas={concluidas} concluida {...{ h, marcarFeita: reabrir, remover, podeMexer, isGestao }} />
          )}
        </div>
      )}

      {criando && (
        <NovaTarefaModal
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          currentUser={currentUser}
          onClose={() => setCriando(false)}
          onCriar={async (dados) => {
            try {
              await addTask(dados);
              toast.success("Tarefa criada! 📌");
              setCriando(false);
            } catch { toast.error("Não deu pra criar a tarefa."); }
          }}
        />
      )}
    </div>
  );
}

function Grupo({
  titulo, cor, icone, tarefas, h, marcarFeita, remover, podeMexer, isGestao, concluida,
}: {
  titulo: string; cor: string; icone: React.ReactNode; tarefas: Task[]; h: string;
  marcarFeita: (t: Task) => void; remover: (t: Task) => void; podeMexer: (t: Task) => boolean;
  isGestao: boolean; concluida?: boolean;
}) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wide ${cor}`}>
        {icone} {titulo} <span className="text-muted-foreground font-normal">({tarefas.length})</span>
      </div>
      <div className="space-y-2">
        {tarefas.map((t) => (
          <div key={t.id} className={`card flex items-start gap-3 py-3 ${concluida ? "opacity-60" : ""}`}>
            {podeMexer(t) && (
              <button
                onClick={() => marcarFeita(t)}
                title={concluida ? "Reabrir" : "Marcar como feita"}
                className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${concluida ? "bg-lone-success border-lone-success-border text-white" : "border-border hover:border-lone-success hover:bg-lone-success-bg"}`}
              >
                {concluida && <Check size={12} />}
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium text-foreground ${concluida ? "line-through" : ""}`}>{t.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><User size={11} /> {t.assignedTo}</span>
                {t.clientName && <span>· {t.clientName}</span>}
                {t.dueDate && (
                  <span className={`flex items-center gap-1 ${!concluida && t.dueDate < h ? "text-lone-warning font-medium" : ""}`}>
                    <Calendar size={11} /> {t.dueDate === h ? "hoje" : t.dueDate < h ? `venceu ${fmtData(t.dueDate)}` : fmtData(t.dueDate)}
                  </span>
                )}
                <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${getPriorityColor(t.priority)}`}>
                  <Flag size={9} /> {getPriorityLabel(t.priority)}
                </span>
                {t.createdBy && isGestao && <span className="text-muted-foreground/70">criada por {t.createdBy}</span>}
              </div>
              {t.description && <p className="mt-1.5 text-xs text-muted-foreground/90 line-clamp-2">{t.description}</p>}
            </div>
            {podeMexer(t) && (
              <button onClick={() => remover(t)} title="Excluir" className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NovaTarefaModal({
  clients, currentUser, onClose, onCriar,
}: {
  clients: { id: string; name: string }[]; currentUser: string;
  onClose: () => void; onCriar: (t: Omit<Task, "id">) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState(COLABORADORES[0]?.name ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    if (!title.trim() || !assignedTo) return;
    setSalvando(true);
    const prof = COLABORADORES.find((c) => c.name === assignedTo);
    const cli = clients.find((c) => c.id === clientId);
    await onCriar({
      title: title.trim(),
      assignedTo,
      role: (prof?.role ?? "social") as Role,
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-fade-in max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><ListChecks size={18} className="text-primary" /> Nova tarefa</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
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
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:border-primary/40 outline-none">
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
