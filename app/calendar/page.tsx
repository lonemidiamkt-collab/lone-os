"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Check,
  ClipboardCheck,
  Filter,
  X,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import type { ContentCard, Task, TrafficRoutineCheck } from "@/lib/types";

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
  color: string;
  detail: string;
  raw: ContentCard | Task | TrafficRoutineCheck;
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

export default function CalendarPage() {
  const { contentCards, tasks, trafficRoutineChecks, clients } = useAppState();
  const { role } = useRole();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [filterTypes, setFilterTypes] = useState<EventType[]>(["content", "task", "routine"]);
  const [filterClient, setFilterClient] = useState<string>("all");

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
        color: card.designerDeliveredAt ? "bg-[#0a34f5]" : card.designRequestId ? "bg-[#3b6ff5]" : TYPE_COLORS.content,
        detail: `${card.format} · ${card.status.replace(/_/g, " ")}${designTag ? ` · ${designTag}` : ""}`,
        raw: card,
      });
    });

    // Tasks with due dates
    tasks.forEach((task) => {
      if (!task.dueDate) return;
      events.push({
        id: `t-${task.id}`,
        type: "task",
        title: task.title,
        clientName: task.clientName,
        date: task.dueDate,
        color: TYPE_COLORS.task,
        detail: `${task.priority} · ${task.status.replace(/_/g, " ")}`,
        raw: task,
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
              return (
                <div
                  key={i}
                  onClick={() => day && setSelectedDay(selectedDay === day ? null : day)}
                  className={`min-h-[80px] rounded-lg p-1.5 flex flex-col transition-all border ${
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
                      <span className={`text-xs font-medium mb-1 ${
                        todayFlag ? "text-[#0a34f5] font-bold" : "text-foreground"
                      }`}>
                        {day}
                      </span>
                      <div className="flex flex-col gap-0.5 flex-1">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate ${
                              e.type === "content" ? "bg-primary/15 text-primary" :
                              e.type === "task" ? "bg-[#3b6ff5]/15 text-[#3b6ff5]" :
                              "bg-zinc-500/15 text-zinc-400"
                            }`}
                            title={`${e.clientName}: ${e.title}`}
                          >
                            <span className={`w-1 h-1 rounded-full shrink-0 ${e.color}`} />
                            <span className="truncate">{e.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} mais</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar — Day Detail + Upcoming */}
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
                    return (
                      <div key={e.id} className="p-3 bg-muted/50 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${e.color}`} />
                          <Icon size={12} className="text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium text-foreground truncate">{e.title}</span>
                        </div>
                        <div className="flex items-center gap-2 ml-[18px]">
                          <span className="text-[10px] text-muted-foreground">{e.clientName}</span>
                          <span className="text-[10px] text-muted-foreground/50">·</span>
                          <span className="text-[10px] text-muted-foreground">{e.detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                    <div key={e.id} className="flex items-center gap-2 py-1.5">
                      <span className="text-[10px] text-muted-foreground w-10 shrink-0 text-right">
                        {d} {MONTHS_SHORT[m - 1]}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.color}`} />
                      <Icon size={11} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-foreground truncate block">{e.title}</span>
                        <span className="text-[10px] text-muted-foreground">{e.clientName}</span>
                      </div>
                    </div>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
