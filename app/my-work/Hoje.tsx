"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Inbox, Check, Clock, AlertTriangle, FileText, Palette,
  TrendingUp, Instagram, ChevronRight, CheckCircle, Filter,
  Eye, Bell,
  CalendarClock, History, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { ETAPAS_DE_APROVACAO, corDoStatus, rotuloCompleto, statusNaEtapa } from "@/lib/conteudo/etapas";
import { ROTULO_ESTADO_DESIGN, designerDeve } from "@/lib/conteudo/producao";
import { montarItens, type ItemQuadro } from "@/lib/conteudo/quadro";
import { useClientsStore } from "@/stores/useClientsStore";
import EmptyState from "@/components/ui/EmptyState";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRole } from "@/lib/context/RoleContext";
import { getPriorityColor, getPriorityLabel, formatTimeSpent, getLiveTimeSpentMs, todaySP, spDateStr } from "@/lib/utils";
import Link from "next/link";
import type { Task, ContentCard } from "@/lib/types";
import SignedImage from "@/components/shared/SignedImage";

type FilterType = "all" | "tasks" | "content" | "design" | "approvals" | "meetings";

// A vista "Hoje" do Meu Trabalho: reuniões, tarefas, cards, demandas de design e aprovações que estão
// com você (gestão vê as do time). As vistas Tarefas e Agenda moram ao lado (MeuTrabalho.tsx).
export default function Hoje() {
  const tasks = useOperationalStore((s) => s.tasks);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const clients = useClientsStore((s) => s.clients);
  const clientesCarregados = useClientsStore((s) => s.initialized);
  const notifications = useNotificationsStore((s) => s.notifications);
  const markNotificationRead = useNotificationsStore((s) => s.markRead);
  const { role, currentUser } = useRole();
  const [filter, setFilter] = useState<FilterType>("all");
  // Reuniões marcadas com cliente. Não vêm do store (que não conhece `meetings`) e sim da rota,
  // que já resolve "quem sou eu": cada um vê a própria carteira, gestão vê tudo.
  const [reunioes, setReunioes] = useState<{ id: string; cliente: string; quando: string; responsavel: string | null }[]>([]);
  // O que JÁ aconteceu. Roberto (08/09): "cada um com seu histórico." Sem isto, a pessoa chega na
  // reunião do mês sem lembrar o que foi combinado na anterior — que é o que a reunião mensal
  // existe para evitar. Quem tem 17 clientes não vai abrir cliente por cliente para lembrar.
  interface Passada {
    reuniaoId: string; clientId: string; cliente: string; quando: string;
    resumo: string | null; temTranscricao: boolean; temAta: boolean; papel?: string;
  }
  const [historico, setHistorico] = useState<Passada[]>([]);
  const [verHistorico, setVerHistorico] = useState(false);
  const [erroReunioes, setErroReunioes] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    // Este mês e o próximo: uma reunião marcada dia 20 para o dia 2 do mês seguinte precisa
    // aparecer, senão some justamente na virada, quando é mais fácil esquecer dela.
    // Mês de São Paulo: na última noite do mês o relógio UTC já está no mês seguinte.
    const [ano, mes] = todaySP().split("-").map(Number);
    const meses = [0, 1].map((i) => {
      const d = new Date(ano, mes - 1 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
    type RespReunioes = { reunioes?: unknown[]; historico?: Passada[] };
    Promise.all(meses.map((m) => chamar<RespReunioes>(`/api/reunioes?mes=${m}`)))
      .then((respostas) => {
        if (!vivo) return;
        const falha = respostas.find((r) => !r.ok);
        // Falha não é "nenhuma reunião": sem este aviso a pessoa confiava na lista vazia.
        setErroReunioes(falha ? falha.erro : null);
        const rs = respostas.map((r) => r.data);
        const todas = rs.flatMap((j) => (j?.reunioes ?? []) as { estado: string; quando: string | null; reuniaoId: string; cliente: string; responsavel: string | null }[])
          .filter((x) => x.estado === "agendada" && !!x.quando && new Date(x.quando) >= new Date(Date.now() - 3600_000))
          .map((x) => ({ id: x.reuniaoId, cliente: x.cliente, quando: x.quando as string, responsavel: x.responsavel }))
          .sort((a, b) => a.quando.localeCompare(b.quando));
        setReunioes(todas);
        // O histórico vem na mesma resposta; o do mês corrente já cobre os 6 meses para trás.
        const hist = (rs[0]?.historico ?? []) as Passada[];
        setHistorico(hist.filter((h, i, arr) => arr.findIndex((x) => x.reuniaoId === h.reuniaoId) === i));
      });
    return () => { vivo = false; };
  }, []);

  const isAdmin = role === "admin" || role === "manager";
  const pSort = (a: { priority: string }, b: { priority: string }) => {
    const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
  };

  // Tasks: Admin/Manager = ALL open tasks, Staff = only assigned to me
  const myTasks = useMemo(() =>
    tasks
      .filter((t) => t.status !== "done" && (isAdmin || t.assignedTo === currentUser))
      .sort(pSort),
    [tasks, currentUser, isAdmin]
  );

  // Content cards: Admin/Manager = ALL unpublished, Social = my assigned
  const myCards = useMemo(() =>
    contentCards
      // exclui os em aprovação (já contam em "Aprovações") — evita contar/renderizar 2x
      .filter((c) => !statusNaEtapa(c.status, "no_ar", ...ETAPAS_DE_APROVACAO) && (isAdmin || c.socialMedia === currentUser))
      .sort(pSort),
    [contentCards, currentUser, isAdmin]
  );

  // Arte com o designer (Leva 5b: o pedido de arte é etapa do card). Gestão vê todas; o designer, a
  // fila dele (mesma regra de dono do quadro); os outros, as artes dos cards deles ou que pediram.
  const myDesignReqs = useMemo<ItemQuadro[]>(() =>
    montarItens(contentCards, designRequests, clients.map((c) => ({ id: c.id, assignedDesigner: c.assignedDesigner })))
      .filter((it) => it.etapa === "com_designer" && (designerDeve(it.estado) || it.estado === "bloqueado"))
      .filter((it) => isAdmin
        || (role === "designer" ? it.designer === currentUser : (it.card.socialMedia === currentUser || it.pedido?.requestedBy === currentUser))),
    [contentCards, designRequests, clients, currentUser, role, isAdmin]
  );
  // Sem a carteira, a regra de dono não sabe o que é do designer — não pode afirmar "tudo em dia".
  const designerSemCarteira = role === "designer" && !clientesCarregados;

  // Approvals: Admin/Manager = all, Staff = my cards only
  const pendingApprovals = useMemo(() =>
    contentCards.filter((c) =>
      statusNaEtapa(c.status, ...ETAPAS_DE_APROVACAO) &&
      (isAdmin || c.socialMedia === currentUser)
    ),
    [contentCards, isAdmin, currentUser]
  );

  // Unread notifications
  const unreadNotifs = useMemo(() =>
    notifications.filter((n) => !n.read).slice(0, 5),
    [notifications]
  );

  const totalItems = myTasks.length + myCards.length + myDesignReqs.length + pendingApprovals.length + reunioes.length;

  const FILTERS: { key: FilterType; label: string; count: number; icon: typeof Check }[] = [
    { key: "all", label: "Tudo", count: totalItems, icon: Inbox },
    { key: "tasks", label: "Tarefas", count: myTasks.length, icon: Check },
    { key: "content", label: "Conteúdo", count: myCards.length, icon: FileText },
    { key: "design", label: "Design", count: myDesignReqs.length, icon: Palette },
    { key: "approvals", label: "Aprovações", count: pendingApprovals.length, icon: Eye },
    { key: "meetings", label: "Reuniões", count: reunioes.length, icon: CalendarClock },
  ];

  return (
    <div className="space-y-6">
      {/* Filtros com contagem */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`p-3 rounded-xl border transition-all text-left ${
                active
                  ? "border-primary/30 bg-primary/[0.05]"
                  : "border-border bg-card hover:border-primary/20"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={active ? "text-primary" : "text-muted-foreground"} />
                <span className={`text-xs font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>{f.label}</span>
              </div>
              <p className={`text-xl font-semibold tabular-nums ${active ? "text-primary" : "text-foreground"}`}>{f.count}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Main content */}
        <div className="space-y-4">
          {/* Tasks */}
          {/* REUNIÕES — primeiro, porque é o único item da lista com hora marcada e outra pessoa
              esperando do outro lado. Perder uma custa diferente de perder um prazo interno. */}
          {(filter === "all" || filter === "meetings") && reunioes.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <CalendarClock size={14} className="text-lone-success" /> Reuniões marcadas
                <span className="text-[10px] text-muted-foreground font-normal">· {reunioes.length}</span>
              </h2>
              <div className="space-y-2">
                {reunioes.map((r) => {
                  const d = new Date(r.quando);
                  const hoje = spDateStr(d) === todaySP();
                  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });
                  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                  return (
                    <div key={r.id} className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.cliente}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Reunião de acompanhamento{r.responsavel ? ` · ${r.responsavel}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-semibold tabular-nums ${hoje ? "text-lone-success" : "text-foreground"}`}>{hora}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{hoje ? "hoje" : dia}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(filter === "all" || filter === "meetings") && erroReunioes && (
            <p className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Não consegui carregar as reuniões: {erroReunioes}
            </p>
          )}

          {/* O HISTÓRICO — fechado por padrão: quem abre o Meu Trabalho quer saber o que fazer
              hoje, não o que já foi feito. Mas antes da reunião do mês, é o primeiro lugar onde
              se procura o que ficou combinado. */}
          {(filter === "all" || filter === "meetings") && historico.length > 0 && (
            <section className="mb-6">
              <button
                onClick={() => setVerHistorico((v) => !v)}
                className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3 hover:text-primary transition-colors"
              >
                <History size={14} className="text-muted-foreground" /> Reuniões que já aconteceram
                <span className="text-[10px] text-muted-foreground font-normal">· {historico.length}</span>
                <ChevronDown size={13} className={`text-muted-foreground transition-transform ${verHistorico ? "rotate-180" : ""}`} />
              </button>
              {verHistorico && (
                <div className="space-y-2">
                  {historico.map((h) => {
                    const d = new Date(h.quando);
                    const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit", timeZone: "America/Sao_Paulo" });
                    return (
                      <Link key={h.reuniaoId} href={`/clients/${h.clientId}?tab=reunioes`}
                            className="block p-3 rounded-xl bg-surface border border-border hover:border-primary/40 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{h.cliente}</p>
                            {/* O resumo é o que serve; sem ele, dizer o que EXISTE de registro
                                evita a pessoa abrir para descobrir que não há nada. */}
                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                              {h.resumo
                                || (h.temTranscricao ? "Transcrição guardada — abra para ler" : "Sem registro do que foi tratado")}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] text-muted-foreground tabular-nums">{dia}</p>
                            {h.temAta && <p className="text-[10px] text-lone-success">ata em PDF</p>}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {(filter === "all" || filter === "tasks") && myTasks.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <Check size={14} className="text-primary" />
                Minhas Tarefas ({myTasks.length})
              </h3>
              <div className="space-y-2">
                {myTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Content cards */}
          {(filter === "all" || filter === "content") && myCards.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <FileText size={14} className="text-primary" />
                Meus Cards de Conteúdo ({myCards.length})
              </h3>
              <div className="space-y-2">
                {myCards.map((card) => (
                  <CardRow key={card.id} card={card} />
                ))}
              </div>
            </div>
          )}

          {/* Design requests */}
          {(filter === "all" || filter === "design") && myDesignReqs.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <Palette size={14} className="text-primary" />
                Arte com o designer ({myDesignReqs.length})
              </h3>
              <div className="space-y-2">
                {myDesignReqs.map((it) => (
                  <Link key={it.card.id} href={`${role === "designer" ? "/design" : "/social"}?card=${it.card.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/20 transition-all">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${it.estado === "alteracao" || it.estado === "bloqueado" ? "bg-destructive" : "bg-chart-4"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{it.card.title}</p>
                      <p className="text-[10px] text-muted-foreground">{it.card.clientName}{it.card.format ? ` · ${it.card.format}` : ""}{it.designer && role !== "designer" ? ` · ${it.designer}` : ""}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      it.estado === "alteracao" || it.estado === "bloqueado" ? "text-destructive bg-destructive/10 border-destructive/20" : "text-chart-4 bg-chart-4/10 border-chart-4/20"
                    }`}>
                      {ROTULO_ESTADO_DESIGN[it.estado]}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Pending approvals */}
          {(filter === "all" || filter === "approvals") && pendingApprovals.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <Eye size={14} className="text-lone-warning" />
                Em revisão ou com o cliente ({pendingApprovals.length})
              </h3>
              <div className="space-y-2">
                {pendingApprovals.map((card) => (
                  <CardRow key={card.id} card={card} isApproval />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {designerSemCarteira && (
            <p className="text-xs text-muted-foreground">Carregando sua carteira para listar suas demandas de design…</p>
          )}
          {totalItems === 0 && !designerSemCarteira && !erroReunioes && (
            <EmptyState icon={<CheckCircle size={20} />} title="Tudo em dia!" subtitle="Nenhuma tarefa ou card pendente no momento." />
          )}
        </div>

        {/* Sidebar — Recent notifications */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
              <Bell size={14} className="text-primary" />
              Notificações Recentes
            </h3>
            {unreadNotifs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma notificação não lida.</p>
            ) : (
              <div className="space-y-2">
                {unreadNotifs.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className="w-full text-left p-2.5 rounded-lg bg-primary/[0.03] border border-primary/10 hover:border-primary/30 transition-all"
                  >
                    <p className="text-[11px] font-medium text-foreground leading-tight">{n.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3">Acesso Rápido</h3>
            <div className="space-y-1">
              {[
                { href: "/my-work?view=agenda", label: "Agenda", icon: Clock },
                { href: "/social", label: "Social Media", icon: Instagram },
                { href: "/traffic", label: "Tráfego Pago", icon: TrendingUp },
                { href: "/design", label: "Designer", icon: Palette },
              ].map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                  >
                    <Icon size={13} />
                    {link.label}
                    <ChevronRight size={11} className="ml-auto" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const updateTask = useOperationalStore((s) => s.updateTask);
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: "Aguardando", color: "text-muted-foreground bg-muted border-border" },
    in_progress: { label: "Em execução", color: "text-primary bg-primary/10 border-primary/20" },
    review: { label: "Validação", color: "text-lone-warning bg-lone-warning-bg border-lone-warning-border" },
    done: { label: "Entregue", color: "text-lone-success bg-lone-success-bg border-lone-success-border" },
  };
  const s = statusConfig[task.status] ?? statusConfig.pending;
  const timeMs = getLiveTimeSpentMs(task.workStartedAt, task.totalTimeSpentMs);
  const isDone = task.status === "done";
  const route = task.role === "social" ? "/social" : task.role === "designer" ? "/design" : "/traffic";

  return (
    <Link href={route} className={`card-interactive flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/20 cursor-pointer ${isDone ? "opacity-50" : ""}`}>
      <button
        onClick={(e) => {
          e.preventDefault(); e.stopPropagation();
          updateTask(task.id, { status: isDone ? "pending" : "done" }).catch(() => toast.error("Não consegui atualizar a tarefa. Tenta de novo?"));
        }}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
          isDone ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"
        }`}
        title={isDone ? "Reabrir" : "Concluir"}
      >
        {isDone && <Check size={10} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium text-foreground truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{task.clientName}</span>
          {task.dueDate && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} /> {task.dueDate}
            </span>
          )}
          {timeMs > 0 && (
            <span className="text-[10px] text-muted-foreground">{formatTimeSpent(timeMs)}</span>
          )}
        </div>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${s.color}`}>
        {s.label}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${getPriorityColor(task.priority)}`}>
        {getPriorityLabel(task.priority)}
      </span>
      <ChevronRight size={12} className="text-muted-foreground shrink-0" />
    </Link>
  );
}

function CardRow({ card, isApproval }: { card: ContentCard; isApproval?: boolean }) {

  return (
    <Link href={`/social?card=${card.id}`} className={`card-interactive flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
      isApproval
        ? "bg-lone-warning-bg border-lone-warning-border hover:border-lone-warning"
        : "bg-muted/30 border-border/50 hover:border-primary/20"
    }`}>
      {card.imageUrl && card.imageUrl.includes("http") ? (
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
          <SignedImage src={card.imageUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <FileText size={14} className="text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{card.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{card.clientName}</span>
          <span className="text-[10px] text-muted-foreground">· {card.format}</span>
          {card.dueDate && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} /> {card.dueDate}
            </span>
          )}
        </div>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${
        isApproval ? "text-lone-warning bg-lone-warning-bg border-lone-warning-border" :
        "text-muted-foreground bg-muted border-border"
      }`}>
        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${corDoStatus(card.status)}`} aria-hidden="true" />
        {rotuloCompleto(card.status)}
      </span>
      <ChevronRight size={12} className="text-muted-foreground shrink-0" />
    </Link>
  );
}
