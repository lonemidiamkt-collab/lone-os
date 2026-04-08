"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Check,
  ClipboardCheck,
  Filter,
  X,
  AlertTriangle,
  User,
  Flag,
  Edit3,
  Save,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import DriveButton from "@/components/DriveButton";
import type { ContentCard, Task, TrafficRoutineCheck, TaskStatus, Priority } from "@/lib/types";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

type EventType = "content" | "task" | "routine";

interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  clientName: string;
  date: string; // YYYY-MM-DD
  startDate?: string;
  dueDate?: string;
  color: string;
  detail: string;
  raw: ContentCard | Task | TrafficRoutineCheck;
  isDeadline?: boolean;
}

// A task bar spanning multiple days
interface TaskBar {
  taskId: string;
  title: string;
  clientName: string;
  assignedTo: string;
  startDay: number;
  endDay: number;
  status: TaskStatus;
  priority: Priority;
  raw: Task;
}

const TYPE_COLORS: Record<EventType, string> = {
  content: "bg-primary",
  task: "bg-[#3b6ff5]",
  routine: "bg-zinc-500",
};

const TYPE_LABELS: Record<EventType, string> = {
  content: "Conteúdo",
  task: "Tarefa",
  routine: "Rotina",
};

const TYPE_ICONS: Record<EventType, typeof FileText> = {
  content: FileText,
  task: Check,
  routine: ClipboardCheck,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  review: "Em revisão",
  done: "Concluída",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  in_progress: "text-[#0a34f5] bg-[#0a34f5]/10 border-[#0a34f5]/20",
  review: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  done: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "text-zinc-400",
  medium: "text-[#3b6ff5]",
  high: "text-amber-400",
  critical: "text-red-400",
};

export default function CalendarPage() {
  const { contentCards, tasks, trafficRoutineChecks, clients, updateTask } = useAppState();
  const { role } = useRole();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [filterTypes, setFilterTypes] = useState<EventType[]>(["content", "task", "routine"]);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Build events from all sources
  const allEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];

    // Content cards with due dates
    contentCards.forEach((card) => {
      if (!card.dueDate) return;
      const designTag = card.designerDeliveredAt
        ? (card.socialConfirmedAt ? "✓ Arte confirmada" : "⬆ Arte entregue")
        : card.designRequestId ? "⏳ Aguardando design" : "";
      events.push({
        id: `c-${card.id}`,
        type: "content",
        title: card.title,
        clientName: card.clientName,
        date: card.dueDate,
        dueDate: card.dueDate,
        color: card.designerDeliveredAt ? "bg-[#0a34f5]" : card.designRequestId ? "bg-[#3b6ff5]" : TYPE_COLORS.content,
        detail: `${card.format} · ${card.status.replace(/_/g, " ")}${designTag ? ` · ${designTag}` : ""}`,
        raw: card,
      });
    });

    // Tasks — create events for start date AND due date
    tasks.forEach((task) => {
      if (!task.dueDate) return;
      // Start date event
      if (task.startDate && task.startDate !== task.dueDate) {
        events.push({
          id: `t-start-${task.id}`,
          type: "task",
          title: task.title,
          clientName: task.clientName,
          date: task.startDate,
          startDate: task.startDate,
          dueDate: task.dueDate,
          color: TYPE_COLORS.task,
          detail: `Início · ${task.priority} · ${task.assignedTo}`,
          raw: task,
          isDeadline: false,
        });
      }
      // Due date event (deadline)
      events.push({
        id: `t-${task.id}`,
        type: "task",
        title: task.title,
        clientName: task.clientName,
        date: task.dueDate,
        startDate: task.startDate,
        dueDate: task.dueDate,
        color: TYPE_COLORS.task,
        detail: `${task.priority} · ${task.status.replace(/_/g, " ")}`,
        raw: task,
        isDeadline: true,
      });
    });

    // Routine checks
    trafficRoutineChecks.forEach((check) => {
      events.push({
        id: `r-${check.id}`,
        type: "routine",
        title: `${check.type === "support" ? "Suporte" : check.type === "report" ? "Relatório" : check.type === "feedback" ? "Feedback" : "Análise"}`,
        clientName: check.clientName,
        date: check.date,
        color: TYPE_COLORS.routine,
        detail: `por ${check.completedBy}`,
        raw: check,
      });
    });

    return events;
  }, [contentCards, tasks, trafficRoutineChecks]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return allEvents.filter((e) => {
      if (!filterTypes.includes(e.type)) return false;
      if (filterClient !== "all" && e.clientName !== filterClient) return false;
      return true;
    });
  }, [allEvents, filterTypes, filterClient]);

  // Group by day for current month
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    filteredEvents.forEach((e) => {
      const [y, m, d] = e.date.split("-").map(Number);
      if (y === viewYear && m - 1 === viewMonth) {
        if (!map[d]) map[d] = [];
        map[d].push(e);
      }
    });
    return map;
  }, [filteredEvents, viewYear, viewMonth]);

  // Build task bars for timeline visualization
  const taskBars = useMemo<TaskBar[]>(() => {
    if (!filterTypes.includes("task")) return [];
    return tasks
      .filter((task) => {
        if (!task.startDate || !task.dueDate) return false;
        if (filterClient !== "all" && task.clientName !== filterClient) return false;
        const [sy, sm] = task.startDate.split("-").map(Number);
        const [ey, em] = task.dueDate.split("-").map(Number);
        // Task overlaps current month
        const monthStart = new Date(viewYear, viewMonth, 1);
        const monthEnd = new Date(viewYear, viewMonth + 1, 0);
        const taskStart = new Date(sy, sm - 1, Number(task.startDate.split("-")[2]));
        const taskEnd = new Date(ey, em - 1, Number(task.dueDate.split("-")[2]));
        return taskStart <= monthEnd && taskEnd >= monthStart;
      })
      .map((task) => {
        const [, , sd] = task.startDate!.split("-").map(Number);
        const [, , ed] = task.dueDate!.split("-").map(Number);
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const [sy, sm] = task.startDate!.split("-").map(Number);
        const [ey, em] = task.dueDate!.split("-").map(Number);

        // Clamp to current month
        const startInMonth = (sy === viewYear && sm - 1 === viewMonth) ? sd : 1;
        const endInMonth = (ey === viewYear && em - 1 === viewMonth) ? ed : daysInMonth;

        return {
          taskId: task.id,
          title: task.title,
          clientName: task.clientName,
          assignedTo: task.assignedTo,
          startDay: startInMonth,
          endDay: endInMonth,
          status: task.status,
          priority: task.priority,
          raw: task,
        };
      });
  }, [tasks, viewYear, viewMonth, filterTypes, filterClient]);

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const goToPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
    setSelectedDay(null);
  };
  const goToNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
    setSelectedDay(null);
  };
  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  const toggleType = (t: EventType) => {
    setFilterTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const uniqueClients = [...new Set(allEvents.map((e) => e.clientName))].sort();

  const totalThisMonth = Object.values(eventsByDay).flat().length;
  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  // Check if a day is a deadline for any task
  const isDueDateDay = useCallback((day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return tasks.some((t) => t.dueDate === dateStr && t.status !== "done");
  }, [tasks, viewYear, viewMonth]);

  // Get task bars that span a given day
  const barsForDay = useCallback((day: number) => {
    return taskBars.filter((b) => day >= b.startDay && day <= b.endDay);
  }, [taskBars]);

  // Upcoming events (next 7 days from today)
  const upcomingEvents = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return filteredEvents
      .filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        return d >= start && d < end;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredEvents]);

  // Upcoming deadlines
  const upcomingDeadlines = useMemo(() => {
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return tasks
      .filter((t) => t.dueDate && t.status !== "done" && t.dueDate >= todayStr)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .slice(0, 8);
  }, [tasks]);

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === "task") {
      setSelectedTask(event.raw as Task);
    }
  };

  const handleBarClick = (bar: TaskBar) => {
    setSelectedTask(bar.raw);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Calendar size={24} className="text-[#0a34f5]" />
            Calendário Unificado
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conteúdos, tarefas e rotinas em um só lugar
          </p>
        </div>
        <button onClick={goToToday} className="btn-ghost text-xs">Hoje</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter size={12} /> Filtros:
        </div>
        {(["content", "task", "routine"] as EventType[]).map((t) => {
          const Icon = TYPE_ICONS[t];
          const active = filterTypes.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                active
                  ? "bg-white/5 border-white/10 text-foreground"
                  : "border-transparent text-muted-foreground/50 line-through"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[t]} ${!active ? "opacity-30" : ""}`} />
              <Icon size={12} />
              {TYPE_LABELS[t]}
            </button>
          );
        })}

        <div className="h-4 w-px bg-border mx-1" />

        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
        >
          <option value="all">Todos os clientes</option>
          {uniqueClients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {filterClient !== "all" && (
          <button onClick={() => setFilterClient("all")} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {totalThisMonth} evento(s) este mês
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Calendar Grid */}
        <div className="card">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={goToPrev} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ChevronLeft size={18} className="text-muted-foreground" />
            </button>
            <h2 className="text-lg font-bold text-foreground">
              {MONTHS[viewMonth]} {viewYear}
            </h2>
            <button onClick={goToNext} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <ChevronRight size={18} className="text-muted-foreground" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-2">{d}</div>
            ))}
          </div>

          {/* Day Cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              const dayEvents = day ? (eventsByDay[day] ?? []) : [];
              const todayFlag = day ? isToday(day) : false;
              const selected = day === selectedDay;
              const hasDeadline = day ? isDueDateDay(day) : false;
              const dayBars = day ? barsForDay(day) : [];

              return (
                <div
                  key={i}
                  onClick={() => day && setSelectedDay(selectedDay === day ? null : day)}
                  className={`min-h-[90px] rounded-lg p-1.5 flex flex-col transition-all border ${
                    todayFlag
                      ? "bg-[#0a34f5]/10 border-[#0a34f5]/30"
                      : selected
                      ? "bg-white/5 border-white/10"
                      : day
                      ? "border-transparent hover:bg-muted/50 cursor-pointer"
                      : "border-transparent"
                  }`}
                >
                  {day && (
                    <>
                      <span className={`text-xs font-medium mb-1 flex items-center gap-1 ${
                        hasDeadline
                          ? "text-[#ff2d55] font-bold drop-shadow-[0_0_6px_rgba(255,45,85,0.6)]"
                          : todayFlag ? "text-[#0a34f5] font-bold" : "text-foreground"
                      }`}>
                        {day}
                        {hasDeadline && (
                          <AlertTriangle size={10} className="text-[#ff2d55] drop-shadow-[0_0_4px_rgba(255,45,85,0.8)]" />
                        )}
                      </span>

                      {/* Task timeline bars */}
                      {dayBars.length > 0 && (
                        <div className="flex flex-col gap-px mb-0.5">
                          {dayBars.slice(0, 2).map((bar) => {
                            const isStart = bar.startDay === day;
                            const isEnd = bar.endDay === day;
                            const isDone = bar.status === "done";
                            return (
                              <button
                                key={bar.taskId}
                                onClick={(e) => { e.stopPropagation(); handleBarClick(bar); }}
                                className={`h-[14px] flex items-center text-[9px] font-medium text-white truncate transition-all hover:brightness-125 ${
                                  isDone ? "bg-emerald-600/60" : "bg-[#0a34f5]"
                                } ${isStart ? "rounded-l-sm pl-1" : "pl-0.5"} ${isEnd ? "rounded-r-sm pr-1" : "pr-0"}`}
                                title={`${bar.title} — ${bar.clientName} (${bar.assignedTo})`}
                              >
                                {isStart && (
                                  <span className="truncate">{bar.title}</span>
                                )}
                                {isEnd && !isStart && (
                                  <span className="truncate opacity-70">{bar.title}</span>
                                )}
                              </button>
                            );
                          })}
                          {dayBars.length > 2 && (
                            <span className="text-[8px] text-muted-foreground pl-0.5">+{dayBars.length - 2}</span>
                          )}
                        </div>
                      )}

                      {/* Regular events (non-bar) */}
                      <div className="flex flex-col gap-0.5 flex-1">
                        {dayEvents
                          .filter((e) => !(e.type === "task" && e.startDate && e.dueDate && e.startDate !== e.dueDate))
                          .slice(0, 2)
                          .map((e) => {
                            const isTaskDeadline = e.type === "task" && e.isDeadline && (e.raw as Task).status !== "done";
                            return (
                              <button
                                key={e.id}
                                onClick={(ev) => { ev.stopPropagation(); handleEventClick(e); }}
                                className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate text-left transition-all ${
                                  isTaskDeadline
                                    ? "bg-red-500/15 text-[#ff2d55] font-bold drop-shadow-[0_0_4px_rgba(255,45,85,0.5)]"
                                    : e.type === "content" ? "bg-primary/15 text-primary" :
                                      e.type === "task" ? "bg-[#3b6ff5]/15 text-[#3b6ff5]" :
                                      "bg-zinc-500/15 text-zinc-400"
                                } hover:brightness-125`}
                                title={`${e.clientName}: ${e.title}`}
                              >
                                {isTaskDeadline && <span className="shrink-0">⚠️</span>}
                                <span className={`w-1 h-1 rounded-full shrink-0 ${isTaskDeadline ? "bg-[#ff2d55]" : e.color}`} />
                                <span className="truncate">{e.title}</span>
                              </button>
                            );
                          })}
                        {dayEvents.length > 2 && (
                          <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 2} mais</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar — Day Detail + Upcoming + Deadlines */}
        <div className="space-y-4">
          {/* Selected Day Detail */}
          {selectedDay && (
            <div className="card animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground text-sm">
                  {selectedDay} de {MONTHS[viewMonth]}
                </h3>
                <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              {selectedDayEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum evento neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map((e) => {
                    const Icon = TYPE_ICONS[e.type];
                    const isTaskDeadline = e.type === "task" && e.isDeadline && (e.raw as Task).status !== "done";
                    return (
                      <button
                        key={e.id}
                        onClick={() => handleEventClick(e)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          isTaskDeadline
                            ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
                            : "bg-muted/50 border-border/50 hover:border-border"
                        } ${e.type === "task" ? "cursor-pointer hover:bg-muted/80" : ""}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isTaskDeadline ? "bg-[#ff2d55] shadow-[0_0_6px_rgba(255,45,85,0.8)]" : e.color}`} />
                          <Icon size={12} className={isTaskDeadline ? "text-[#ff2d55]" : "text-muted-foreground"} />
                          <span className={`text-xs font-medium truncate ${
                            isTaskDeadline ? "text-[#ff2d55] font-bold" : "text-foreground"
                          }`}>
                            {isTaskDeadline && "⚠️ "}{e.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 ml-[18px]">
                          <span className="text-[10px] text-muted-foreground">{e.clientName}</span>
                          <span className="text-[10px] text-muted-foreground/50">·</span>
                          <span className="text-[10px] text-muted-foreground">{e.detail}</span>
                        </div>
                        {isTaskDeadline && (
                          <div className="ml-[18px] mt-1">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-[#ff2d55] font-bold border border-red-500/20">
                              PRAZO FINAL
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upcoming Deadlines */}
          {upcomingDeadlines.length > 0 && (
            <div className="card animate-fade-in">
              <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-[#ff2d55]" />
                Prazos Próximos
              </h3>
              <div className="space-y-2">
                {upcomingDeadlines.map((task) => {
                  const [, m, d] = task.dueDate!.split("-").map(Number);
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                  const isToday = task.dueDate === todayStr;
                  const tomorrow = new Date(today);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
                  const isTomorrow = task.dueDate === tomorrowStr;

                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded-md px-1 transition-all"
                    >
                      <span className={`text-[10px] w-10 shrink-0 text-right font-medium ${
                        isToday ? "text-[#ff2d55] font-bold" : isTomorrow ? "text-amber-400" : "text-muted-foreground"
                      }`}>
                        {isToday ? "HOJE" : isTomorrow ? "Amanhã" : `${d} ${MONTHS_SHORT[m - 1]}`}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isToday ? "bg-[#ff2d55] shadow-[0_0_6px_rgba(255,45,85,0.8)]" : "bg-[#3b6ff5]"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs truncate block ${isToday ? "text-[#ff2d55] font-bold" : "text-foreground"}`}>
                          {task.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{task.clientName} · {task.assignedTo}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming 7 days */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
              <Calendar size={14} className="text-[#0a34f5]" />
              Próximos 7 dias
            </h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum evento nos próximos 7 dias.</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.slice(0, 15).map((e) => {
                  const Icon = TYPE_ICONS[e.type];
                  const [, m, d] = e.date.split("-").map(Number);
                  return (
                    <button
                      key={e.id}
                      onClick={() => handleEventClick(e)}
                      className={`w-full text-left flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded-md px-1 transition-all ${
                        e.type === "task" ? "cursor-pointer" : ""
                      }`}
                    >
                      <span className="text-[10px] text-muted-foreground w-10 shrink-0 text-right">
                        {d} {MONTHS_SHORT[m - 1]}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.color}`} />
                      <Icon size={11} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-foreground truncate block">{e.title}</span>
                        <span className="text-[10px] text-muted-foreground">{e.clientName}</span>
                      </div>
                    </button>
                  );
                })}
                {upcomingEvents.length > 15 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    +{upcomingEvents.length - 15} eventos
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3">Legenda</h3>
            <div className="space-y-2">
              {(["content", "task", "routine"] as EventType[]).map((t) => {
                const Icon = TYPE_ICONS[t];
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${TYPE_COLORS[t]}`} />
                    <Icon size={12} className="text-muted-foreground" />
                    <span className="text-xs text-foreground">{TYPE_LABELS[t]}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 pt-1 border-t border-border/50 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0a34f5]" />
                <span className="text-[10px] text-muted-foreground">Barra = duração da tarefa</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff2d55] shadow-[0_0_4px_rgba(255,45,85,0.6)]" />
                <AlertTriangle size={10} className="text-[#ff2d55]" />
                <span className="text-[10px] text-[#ff2d55] font-medium">Prazo final (deadline)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={(id, updates) => {
            updateTask(id, updates);
            setSelectedTask((prev) => prev ? { ...prev, ...updates } : null);
          }}
          driveLink={clients.find((c) => c.id === selectedTask.clientId)?.driveLink}
        />
      )}
    </div>
  );
}

// ─── Task Detail Modal ─────────────────────────────────────────
function TaskDetailModal({
  task,
  onClose,
  onUpdate,
  driveLink,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  driveLink?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<TaskStatus>(task.status);
  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editAssignedTo, setEditAssignedTo] = useState(task.assignedTo);
  const [editDescription, setEditDescription] = useState(task.description || "");

  const handleSave = () => {
    onUpdate(task.id, {
      status: editStatus,
      priority: editPriority,
      assignedTo: editAssignedTo,
      description: editDescription || undefined,
    });
    setEditing(false);
  };

  const isDeadlinePassed = task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10) && task.status !== "done";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl animate-fade-in overflow-hidden">
        {/* Header bar */}
        <div className={`h-1 w-full ${task.status === "done" ? "bg-emerald-500" : isDeadlinePassed ? "bg-[#ff2d55]" : "bg-[#0a34f5]"}`} />

        <div className="p-6 space-y-5">
          {/* Title & close */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground leading-tight">{task.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">{task.clientName}</p>
                <DriveButton driveLink={driveLink} clientName={task.clientName} size="sm" />
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Deadline warning */}
          {isDeadlinePassed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={14} className="text-[#ff2d55] shrink-0" />
              <span className="text-xs text-[#ff2d55] font-bold">Prazo vencido — entrega era {task.dueDate}</span>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Check size={10} /> Status
              </label>
              {editing ? (
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                  className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
                >
                  {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              ) : (
                <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium border ${STATUS_COLORS[task.status]}`}>
                  {STATUS_LABELS[task.status]}
                </span>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Flag size={10} /> Prioridade
              </label>
              {editing ? (
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as Priority)}
                  className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
                >
                  {(Object.entries(PRIORITY_LABELS) as [Priority, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              ) : (
                <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>
                  {PRIORITY_LABELS[task.priority]}
                </span>
              )}
            </div>

            {/* Assigned to */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <User size={10} /> Responsável
              </label>
              {editing ? (
                <input
                  value={editAssignedTo}
                  onChange={(e) => setEditAssignedTo(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
                />
              ) : (
                <span className="text-xs text-foreground">{task.assignedTo}</span>
              )}
            </div>

            {/* Dates */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar size={10} /> Período
              </label>
              <div className="text-xs text-foreground">
                {task.startDate && (
                  <span className="text-muted-foreground">{task.startDate.split("-").reverse().join("/")} → </span>
                )}
                {task.dueDate ? (
                  <span className={isDeadlinePassed ? "text-[#ff2d55] font-bold" : ""}>
                    {task.dueDate.split("-").reverse().join("/")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Sem prazo</span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Descrição</label>
            {editing ? (
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground min-h-[80px] resize-none"
                placeholder="Adicionar descrição..."
              />
            ) : (
              <p className="text-xs text-foreground/80">
                {task.description || <span className="text-muted-foreground italic">Sem descrição</span>}
              </p>
            )}
          </div>

          {/* Quick status buttons (non-editing mode) */}
          {!editing && task.status !== "done" && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <span className="text-[10px] text-muted-foreground">Ação rápida:</span>
              {task.status === "pending" && (
                <button
                  onClick={() => onUpdate(task.id, { status: "in_progress" })}
                  className="text-[11px] px-3 py-1 rounded-lg bg-[#0a34f5]/10 text-[#0a34f5] border border-[#0a34f5]/20 hover:bg-[#0a34f5]/20 transition-all font-medium"
                >
                  Iniciar
                </button>
              )}
              {task.status === "in_progress" && (
                <button
                  onClick={() => onUpdate(task.id, { status: "review" })}
                  className="text-[11px] px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all font-medium"
                >
                  Enviar p/ Revisão
                </button>
              )}
              {task.status === "review" && (
                <button
                  onClick={() => onUpdate(task.id, { status: "done" })}
                  className="text-[11px] px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all font-medium"
                >
                  Concluir
                </button>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancelar</button>
                <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0a34f5] text-white text-xs font-medium hover:bg-[#0a34f5]/80 transition-all">
                  <Save size={12} /> Salvar
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground hover:bg-white/10 transition-all">
                <Edit3 size={12} /> Editar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
