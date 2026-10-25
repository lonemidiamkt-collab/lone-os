"use client";

// A lista de tarefas do time (filtros + grupos por prazo). Mora aqui e é usada em dois lugares:
// a vista "Tarefas" do Meu Trabalho (/my-work?view=tarefas) e a página /tarefas do comercial, que
// não tem Meu Trabalho. O botão "Nova tarefa" fica no cabeçalho de quem usa (NovaTarefa.tsx).

import { useMemo, useState } from "react";
import {
  Check, Clock, AlertTriangle, Calendar, CheckCircle,
  User, Trash2, CircleDot, Flag, X, Pencil,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import ErroCargaTarefas from "@/components/tarefas/ErroCargaTarefas";
import { useConcluirTarefa, motivoDoErro } from "@/components/tarefas/useConcluirTarefa";
import { useOperationalStore, selectTarefasProntas } from "@/stores/useOperationalStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useRole } from "@/lib/context/RoleContext";
import { useColaboradores, NovaTarefaModal } from "./NovaTarefa";
import { getPriorityColor, getPriorityLabel, todaySP } from "@/lib/utils";
import { ordenarConcluidas } from "@/lib/tarefas/concluidas";
import { mudancasDaTarefa } from "@/lib/tarefas/editar";
import type { Task } from "@/lib/types";
import { toast } from "sonner";

// Dia de São Paulo, não o do navegador: quem abre de fora do fuso via "atrasada" um dia antes.
const hoje = () => todaySP();
const fmtData = (iso?: string) => {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
};

/** Áreas que dá pra abrir filtradas pela URL (?area=). Hoje só o tráfego: o card "Tarefas do tráfego"
 *  do /traffic abre /my-work?view=tarefas&area=trafego (o Kanban de tarefas do tráfego saiu — era esta
 *  mesma lista mostrada duas vezes). O filtro é o papel de quem recebeu a tarefa. */
const AREAS: Record<string, { rotulo: string; papel: Task["role"] }> = {
  trafego: { rotulo: "Só tarefas do tráfego", papel: "traffic" },
};

export default function Tarefas({ area, onLimparArea }: { area?: string | null; onLimparArea?: () => void } = {}) {
  const COLABORADORES = useColaboradores();
  const tasks = useOperationalStore((s) => s.tasks);
  const updateTask = useOperationalStore((s) => s.updateTask);
  const deleteTask = useOperationalStore((s) => s.deleteTask);
  // 25/10/2026 (13.4): carregando ou com erro, a lista NÃO diz "Nenhuma tarefa em aberto".
  const prontas = useOperationalStore(selectTarefasProntas);
  const tarefasErro = useOperationalStore((s) => s.tarefasErro);
  const clients = useClientsStore((s) => s.clients);
  const [editando, setEditando] = useState<Task | null>(null);
  const { role, currentUser } = useRole();
  const isGestao = role === "admin" || role === "manager";

  const [filtroPessoa, setFiltroPessoa] = useState<string>("todos");
  const filtroArea = area ? AREAS[area] ?? null : null;
  const [verConcluidas, setVerConcluidas] = useState(false);
  // Concluídas AGORA, nesta tela: aparecem primeiro em "Concluídas" (24/10/2026, auditoria 4.14). A lista vem do
  // banco pela data de criação e só mostra 40 — a tarefa antiga concluída por engano podia nem aparecer lá.
  const [recemConcluidas, setRecemConcluidas] = useState<string[]>([]);

  // Quem vê o quê: gestão vê tudo; staff vê o que é DELE (recebeu) ou o que ELE criou.
  const visiveis = useMemo(() => {
    let arr = tasks.filter((t) => !isGestao ? (t.assignedTo === currentUser || t.createdBy === currentUser) : true);
    if (isGestao && filtroPessoa !== "todos") arr = arr.filter((t) => t.assignedTo === filtroPessoa);
    if (filtroArea) arr = arr.filter((t) => t.role === filtroArea.papel);
    return arr;
  }, [tasks, isGestao, currentUser, filtroPessoa, filtroArea]);

  const h = hoje();
  const abertas = visiveis.filter((t) => t.status !== "done");
  const atrasadas = abertas.filter((t) => t.dueDate && t.dueDate < h);
  const venceHoje = abertas.filter((t) => t.dueDate === h);
  const proximas = abertas.filter((t) => !t.dueDate || t.dueDate > h);
  const concluidas = ordenarConcluidas(visiveis.filter((t) => t.status === "done"), recemConcluidas).slice(0, 40);

  // Concluir por engano tem volta (24/10/2026, auditoria 4.14): o aviso traz "Desfazer", que devolve o status de antes.
  // O mesmo gancho serve o Hoje (25/10/2026, 6.6).
  const { concluir: marcarFeita, reabrir } = useConcluirTarefa({
    aoConcluir: (t) => setRecemConcluidas((ids) => [t.id, ...ids.filter((x) => x !== t.id)]),
  });
  async function remover(t: Task) {
    if (!window.confirm(`Excluir a tarefa "${t.title}"?`)) return;
    try { await deleteTask(t.id); toast.success("Tarefa excluída."); } catch (e) { toast.error(`Não excluí a tarefa: ${motivoDoErro(e)}`); }
  }
  // Editar (25/10/2026, auditoria 13.5): prazo, pessoa, cliente ou título errado se corrige aqui — antes só excluindo
  // e criando de novo. Só o que mudou vai para o servidor; na falha, o formulário continua aberto com o que foi digitado.
  async function salvarEdicao(antes: Task, depois: Omit<Task, "id">) {
    const mudou = mudancasDaTarefa(antes, depois);
    if (!Object.keys(mudou).length) { setEditando(null); return; }
    try {
      await updateTask(antes.id, mudou);
      toast.success("Tarefa atualizada.");
      setEditando(null);
    } catch (e) {
      toast.error(`Não salvei a tarefa: ${motivoDoErro(e)}. O que você mudou continua aqui.`, { duration: 12000 });
    }
  }

  const podeMexer = (t: Task) => isGestao || t.assignedTo === currentUser || t.createdBy === currentUser;

  return (
    <div className="space-y-5">
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
        {filtroArea && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">
            {filtroArea.rotulo}
            {onLimparArea && (
              <button type="button" onClick={onLimparArea} aria-label="Tirar o filtro de área" className="hover:opacity-80">
                <X size={12} />
              </button>
            )}
          </span>
        )}
        <button
          onClick={() => setVerConcluidas((v) => !v)}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${verConcluidas ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
        >
          {verConcluidas ? "Ocultar concluídas" : "Ver concluídas"}
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {!prontas ? "—" : <>{abertas.length} aberta{abertas.length !== 1 ? "s" : ""}</>}
          {atrasadas.length > 0 && <span className="text-lone-warning"> · {atrasadas.length} atrasada{atrasadas.length !== 1 ? "s" : ""}</span>}
        </span>
      </div>

      {tarefasErro && tasks.length > 0 && <ErroCargaTarefas variante="faixa" />}
      {tarefasErro && tasks.length === 0 ? (
        <ErroCargaTarefas />
      ) : !prontas && tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Carregando tarefas…</p>
      ) : abertas.length === 0 && !verConcluidas ? (
        <EmptyState icon={<CheckCircle size={20} />} title="Nenhuma tarefa em aberto" subtitle="Crie uma tarefa pro time no botão “Nova tarefa”." />
      ) : (
        <div className="space-y-6">
          {atrasadas.length > 0 && <Grupo titulo="Atrasadas" cor="text-lone-warning" icone={<AlertTriangle size={14} />} tarefas={atrasadas} {...{ h, marcarFeita, remover, editar: setEditando, podeMexer, isGestao }} />}
          {venceHoje.length > 0 && <Grupo titulo="Vence hoje" cor="text-primary" icone={<Clock size={14} />} tarefas={venceHoje} {...{ h, marcarFeita, remover, editar: setEditando, podeMexer, isGestao }} />}
          {proximas.length > 0 && <Grupo titulo="Em aberto" cor="text-muted-foreground" icone={<CircleDot size={14} />} tarefas={proximas} {...{ h, marcarFeita, remover, editar: setEditando, podeMexer, isGestao }} />}
          {verConcluidas && concluidas.length > 0 && (
            <Grupo titulo="Concluídas" cor="text-lone-success" icone={<Check size={14} />} tarefas={concluidas} concluida {...{ h, marcarFeita: reabrir, remover, editar: setEditando, podeMexer, isGestao }} />
          )}
        </div>
      )}

      {editando && (
        <NovaTarefaModal
          inicial={editando}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          currentUser={currentUser}
          onClose={() => setEditando(null)}
          onCriar={(dados) => salvarEdicao(editando, dados)}
        />
      )}
    </div>
  );
}

function Grupo({
  titulo, cor, icone, tarefas, h, marcarFeita, remover, editar, podeMexer, isGestao, concluida,
}: {
  titulo: string; cor: string; icone: React.ReactNode; tarefas: Task[]; h: string;
  marcarFeita: (t: Task) => void; remover: (t: Task) => void; editar: (t: Task) => void; podeMexer: (t: Task) => boolean;
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
                className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${concluida ? "bg-lone-success border-lone-success-border text-background" : "border-border hover:border-lone-success hover:bg-lone-success-bg"}`}
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
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => editar(t)} title="Editar" aria-label={`Editar a tarefa ${t.title}`} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => remover(t)} title="Excluir" aria-label={`Excluir a tarefa ${t.title}`} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
