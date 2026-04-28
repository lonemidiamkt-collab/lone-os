"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
  Heart,
  Sparkles,
  Edit3,
  Save,
  Plus,
  Bell,
  Instagram,
  Palette,
  TrendingUp,
  Briefcase,
  Clock,
  ExternalLink,
  GripVertical,
} from "lucide-react";
import { useAppState } from "@/lib/context/AppStateContext";
import { useRole } from "@/lib/context/RoleContext";
import DriveButton from "@/components/DriveButton";
import type { ContentCard, Task, TrafficRoutineCheck, TaskStatus, Priority, Reminder, Role } from "@/lib/types";
import HolidaysPdfButton from "@/components/HolidaysPdfButton";
import RichTextEditor from "@/components/RichTextEditor";

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

type EventType = "content" | "task" | "routine" | "reminder";

interface CalendarEvent {
  id: string;
  type: EventType;
  title: string;
  clientName: string;
  date: string;
  startDate?: string;
  dueDate?: string;
  color: string;
  detail: string;
  raw: ContentCard | Task | TrafficRoutineCheck | Reminder;
  isDeadline?: boolean;
}

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
  reminder: "bg-[#0d4af5]",
};

const TYPE_LABELS: Record<EventType, string> = {
  content: "Conteúdo",
  task: "Tarefa",
  routine: "Rotina",
  reminder: "Lembrete",
};

const TYPE_ICONS: Record<EventType, typeof FileText> = {
  content: FileText,
  task: Check,
  routine: ClipboardCheck,
  reminder: Bell,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Aguardando",
  in_progress: "Em Execucao",
  review: "Validacao",
  done: "Entregue",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
  in_progress: "text-[#0d4af5] bg-[#0d4af5]/10 border-[#0d4af5]/20",
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

type CreateType = "task" | "social" | "reminder";

export default function CalendarPage() {
  const {
    contentCards, tasks, trafficRoutineChecks, clients, updateTask,
    reminders, addReminder, toggleReminder, updateReminder,
    addTask, addContentCard, updateContentCard,
  } = useAppState();
  const { role, currentUser } = useRole();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [filterTypes, setFilterTypes] = useState<EventType[]>(["content", "task", "routine", "reminder"]);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Drag & Drop state
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const draggedEventRef = useRef<CalendarEvent | null>(null);

  // Feriados oficiais (nacionais/estaduais/municipais) + datas comemorativas — fetch por ano
  type ObservanceCategory = "national" | "estadual" | "municipal" | "comercial" | "cultural" | "awareness_month" | "profissao";
  type Observance = { date: string; name: string; category: ObservanceCategory; nichos?: string[]; monthLong?: boolean; uf?: string; cities?: string[] };
  const [observances, setObservances] = useState<Observance[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function loadHolidays() {
      try {
        const res = await fetch(`/api/holidays/${viewYear}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setObservances(data.holidays ?? []);
      } catch { /* silent — calendar funciona sem */ }
    }
    loadHolidays();
    return () => { cancelled = true; };
  }, [viewYear]);

  // Prioridade visual quando múltiplas categorias caem no mesmo dia
  const CATEGORY_PRIORITY: Record<ObservanceCategory, number> = useMemo(() => ({
    national: 6, estadual: 5, municipal: 4, comercial: 3, cultural: 2, profissao: 1, awareness_month: 0,
  }), []);

  // Map dia-do-mês → observância dominante da célula (categoria com maior prioridade)
  const observanceByDay = useMemo(() => {
    const map: Record<number, Observance & { allInDay: Observance[] }> = {};
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
    for (const o of observances) {
      if (!o.date.startsWith(prefix) || o.monthLong) continue;
      const day = parseInt(o.date.slice(8, 10), 10);
      if (!Number.isFinite(day)) continue;
      const existing = map[day];
      if (!existing || CATEGORY_PRIORITY[o.category] > CATEGORY_PRIORITY[existing.category]) {
        map[day] = { ...o, allInDay: existing ? [...existing.allInDay, o] : [o] };
      } else {
        existing.allInDay.push(o);
      }
    }
    return map;
  }, [observances, viewYear, viewMonth, CATEGORY_PRIORITY]);

  // Awareness months ativos no mês visualizado (banner topo do mês)
  const monthAwareness = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
    return observances.filter((o) => o.date.startsWith(prefix) && o.monthLong);
  }, [observances, viewYear, viewMonth]);

  // Datas do mês corrente — feriados nacionais
  const monthHolidays = useMemo(() => {
    return Object.entries(observanceByDay)
      .filter(([, o]) => o.category === "national")
      .map(([day, o]) => ({ day: parseInt(day, 10), name: o.name }))
      .sort((a, b) => a.day - b.day);
  }, [observanceByDay]);

  // Feriados estaduais
  const monthStateHolidays = useMemo(() => {
    return Object.entries(observanceByDay)
      .filter(([, o]) => o.category === "estadual")
      .map(([day, o]) => ({ day: parseInt(day, 10), name: o.name, uf: o.uf }))
      .sort((a, b) => a.day - b.day);
  }, [observanceByDay]);

  // Feriados municipais
  const monthMunicipalHolidays = useMemo(() => {
    return Object.entries(observanceByDay)
      .filter(([, o]) => o.category === "municipal")
      .map(([day, o]) => ({ day: parseInt(day, 10), name: o.name, cities: o.cities }))
      .sort((a, b) => a.day - b.day);
  }, [observanceByDay]);

  // Datas comemorativas (não-feriado: comercial/cultural/profissao)
  const monthCommemoratives = useMemo(() => {
    return Object.entries(observanceByDay)
      .filter(([, o]) => o.category !== "national" && o.category !== "estadual" && o.category !== "municipal")
      .map(([day, o]) => ({ day: parseInt(day, 10), name: o.name, category: o.category }))
      .sort((a, b) => a.day - b.day);
  }, [observanceByDay]);

  // Próximos 60 dias (ordenado, separa feriados de comemorativas)
  const upcomingObservances = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return observances
      .filter((o) => !o.monthLong && o.date >= todayIso && o.date <= cutoffIso)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [observances]);

  const handleDragStart = useCallback((e: React.DragEvent, event: CalendarEvent) => {
    if (event.type === "routine") return; // routine checks are not draggable
    draggedEventRef.current = event;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", event.id);
    (e.target as HTMLElement).style.opacity = "0.4";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    draggedEventRef.current = null;
    setDragOverDay(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, day: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(day);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, day: number) => {
    e.preventDefault();
    setDragOverDay(null);
    const event = draggedEventRef.current;
    if (!event) return;
    draggedEventRef.current = null;

    const newDate = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (newDate === event.date) return; // same day, no-op

    if (event.type === "content") {
      const card = event.raw as ContentCard;
      updateContentCard(card.id, { dueDate: newDate });
    } else if (event.type === "task") {
      const task = event.raw as Task;
      const updates: Partial<Task> = { dueDate: newDate };
      // If task has a start date, shift it proportionally
      if (task.startDate && task.dueDate) {
        const oldStart = new Date(task.startDate + "T00:00:00");
        const oldEnd = new Date(task.dueDate + "T00:00:00");
        const diff = oldEnd.getTime() - oldStart.getTime();
        const newEnd = new Date(newDate + "T00:00:00");
        const newStart = new Date(newEnd.getTime() - diff);
        updates.startDate = newStart.toISOString().slice(0, 10);
      }
      updateTask(task.id, updates);
    } else if (event.type === "reminder") {
      const rem = event.raw as Reminder;
      updateReminder(rem.id, { date: newDate });
    }
  }, [viewYear, viewMonth, updateContentCard, updateTask, updateReminder]);

  // Quick Create state
  const [showCreate, setShowCreate] = useState(false);
  const [createDate, setCreateDate] = useState("");

  // Build events from all sources
  const allEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];

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
        color: card.designerDeliveredAt ? "bg-[#0d4af5]" : card.designRequestId ? "bg-[#3b6ff5]" : TYPE_COLORS.content,
        detail: `${card.format} · ${card.status.replace(/_/g, " ")}${designTag ? ` · ${designTag}` : ""}`,
        raw: card,
      });
    });

    tasks.forEach((task) => {
      if (!task.dueDate) return;
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

    reminders.forEach((rem) => {
      events.push({
        id: `rem-${rem.id}`,
        type: "reminder",
        title: rem.title,
        clientName: rem.clientName || "",
        date: rem.date,
        color: TYPE_COLORS.reminder,
        detail: rem.done ? "✓ Concluído" : (rem.time ? `às ${rem.time}` : "Lembrete"),
        raw: rem,
      });
    });

    return events;
  }, [contentCards, tasks, trafficRoutineChecks, reminders]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter((e) => {
      if (!filterTypes.includes(e.type)) return false;
      if (filterClient !== "all" && e.clientName !== filterClient) return false;
      return true;
    });
  }, [allEvents, filterTypes, filterClient]);

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

  const taskBars = useMemo<TaskBar[]>(() => {
    if (!filterTypes.includes("task")) return [];
    return tasks
      .filter((task) => {
        if (!task.startDate || !task.dueDate) return false;
        if (filterClient !== "all" && task.clientName !== filterClient) return false;
        const monthStart = new Date(viewYear, viewMonth, 1);
        const monthEnd = new Date(viewYear, viewMonth + 1, 0);
        const [sy, sm, sd] = task.startDate.split("-").map(Number);
        const [ey, em, ed] = task.dueDate.split("-").map(Number);
        const taskStart = new Date(sy, sm - 1, sd);
        const taskEnd = new Date(ey, em - 1, ed);
        return taskStart <= monthEnd && taskEnd >= monthStart;
      })
      .map((task) => {
        const [, , sd] = task.startDate!.split("-").map(Number);
        const [, , ed] = task.dueDate!.split("-").map(Number);
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const [sy, sm] = task.startDate!.split("-").map(Number);
        const [ey, em] = task.dueDate!.split("-").map(Number);
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

  const uniqueClients = [...new Set(allEvents.map((e) => e.clientName).filter(Boolean))].sort();
  const totalThisMonth = Object.values(eventsByDay).flat().length;
  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  const isDueDateDay = useCallback((day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return tasks.some((t) => t.dueDate === dateStr && t.status !== "done");
  }, [tasks, viewYear, viewMonth]);

  const barsForDay = useCallback((day: number) => {
    return taskBars.filter((b) => day >= b.startDay && day <= b.endDay);
  }, [taskBars]);

  const remindersForDay = useCallback((day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return reminders.filter((r) => r.date === dateStr);
  }, [reminders, viewYear, viewMonth]);

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
    } else if (event.type === "reminder") {
      toggleReminder((event.raw as Reminder).id);
    }
  };

  const handleBarClick = (bar: TaskBar) => {
    setSelectedTask(bar.raw);
  };

  const handleDayClick = (day: number) => {
    setSelectedDay(selectedDay === day ? null : day);
  };

  const openQuickCreate = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setCreateDate(dateStr);
    setShowCreate(true);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Calendar size={24} className="text-[#0d4af5]" />
            Calendário Unificado
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Planeje, crie e visualize todas as atividades da agência
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
              setCreateDate(todayStr);
              setShowCreate(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-all shadow-[0_0_20px_rgba(10,52,245,0.3)]"
          >
            <Plus size={14} /> Criar
          </button>
          <button onClick={goToToday} className="btn-ghost text-xs">Hoje</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter size={12} /> Filtros:
        </div>
        {(["content", "task", "routine", "reminder"] as EventType[]).map((t) => {
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
          <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={goToPrev} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft size={18} className="text-muted-foreground" />
              </button>
              <h2 className="text-lg font-bold text-foreground min-w-[140px] text-center">
                {MONTHS[viewMonth]} {viewYear}
              </h2>
              <button onClick={goToNext} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <ChevronRight size={18} className="text-muted-foreground" />
              </button>
            </div>
            <HolidaysPdfButton month={viewMonth + 1} year={viewYear} label="Baixar PDF" />
          </div>

          {/* Awareness months ativos (Outubro Rosa, Novembro Azul, etc.) — banner topo */}
          {monthAwareness.length > 0 && (
            <div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
              <div className="flex items-start gap-2 flex-wrap">
                <Heart size={12} className="text-rose-300 mt-0.5 shrink-0" />
                <p className="text-[11px] text-rose-300 font-semibold uppercase tracking-wider">
                  Mês de conscientização
                </p>
                <div className="flex flex-wrap gap-1.5 ml-1">
                  {monthAwareness.map((a) => (
                    <span key={a.name} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-200 border border-rose-500/20">
                      <span>{a.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Banner de feriados nacionais do mês */}
          {monthHolidays.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
              <div className="flex items-start gap-2 flex-wrap">
                <Flag size={12} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-400 font-semibold uppercase tracking-wider">
                  {monthHolidays.length} feriado{monthHolidays.length > 1 ? "s" : ""} nacional{monthHolidays.length > 1 ? "is" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5 ml-1">
                  {monthHolidays.map((h) => (
                    <span key={h.day} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <strong className="font-bold">{String(h.day).padStart(2, "0")}</strong>
                      <span>{h.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Banner de feriados estaduais do mês */}
          {monthStateHolidays.length > 0 && (
            <div className="mb-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.05] p-3">
              <div className="flex items-start gap-2 flex-wrap">
                <Flag size={12} className="text-orange-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-orange-400 font-semibold uppercase tracking-wider">
                  {monthStateHolidays.length} feriado{monthStateHolidays.length > 1 ? "s" : ""} estadua{monthStateHolidays.length > 1 ? "is" : "l"}
                </p>
                <div className="flex flex-wrap gap-1.5 ml-1">
                  {monthStateHolidays.map((h) => (
                    <span key={`${h.day}-${h.name}`} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20">
                      <strong className="font-bold">{String(h.day).padStart(2, "0")}</strong>
                      <span>{h.name}{h.uf ? ` · ${h.uf}` : ""}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Banner de feriados municipais do mês */}
          {monthMunicipalHolidays.length > 0 && (
            <div className="mb-3 rounded-xl border border-lime-500/20 bg-lime-500/[0.05] p-3">
              <div className="flex items-start gap-2 flex-wrap">
                <Flag size={12} className="text-lime-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-lime-400 font-semibold uppercase tracking-wider">
                  {monthMunicipalHolidays.length} feriado{monthMunicipalHolidays.length > 1 ? "s" : ""} municipa{monthMunicipalHolidays.length > 1 ? "is" : "l"}
                </p>
                <div className="flex flex-wrap gap-1.5 ml-1">
                  {monthMunicipalHolidays.map((h) => (
                    <span key={`${h.day}-${h.name}`} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-lime-500/10 text-lime-300 border border-lime-500/20">
                      <strong className="font-bold">{String(h.day).padStart(2, "0")}</strong>
                      <span>{h.name}{h.cities && h.cities.length > 0 ? ` · ${h.cities.join(", ")}` : ""}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Banner de datas comemorativas do mês */}
          {monthCommemoratives.length > 0 && (
            <div className="mb-3 rounded-xl border border-pink-500/20 bg-pink-500/[0.05] p-3">
              <div className="flex items-start gap-2 flex-wrap">
                <Sparkles size={12} className="text-pink-300 mt-0.5 shrink-0" />
                <p className="text-[11px] text-pink-300 font-semibold uppercase tracking-wider">
                  {monthCommemoratives.length} data{monthCommemoratives.length > 1 ? "s" : ""} comemorativa{monthCommemoratives.length > 1 ? "s" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5 ml-1">
                  {monthCommemoratives.map((c) => (
                    <span key={`${c.day}-${c.name}`} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-pink-500/10 text-pink-200 border border-pink-500/20">
                      <strong className="font-bold">{String(c.day).padStart(2, "0")}</strong>
                      <span>{c.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

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
              const dayReminders = day ? remindersForDay(day) : [];
              const nonReminderEvents = dayEvents.filter((e) => e.type !== "reminder" && !(e.type === "task" && e.startDate && e.dueDate && e.startDate !== e.dueDate));

              return (
                <div
                  key={i}
                  onClick={() => day && handleDayClick(day)}
                  onDragOver={day ? (e) => handleDragOver(e, day) : undefined}
                  onDragLeave={day ? handleDragLeave : undefined}
                  onDrop={day ? (e) => handleDrop(e, day) : undefined}
                  className={`group min-h-[48px] sm:min-h-[70px] rounded-lg p-1 sm:p-1.5 flex flex-col transition-all border relative ${
                    dragOverDay === day
                      ? "bg-[#0d4af5]/15 border-[#0d4af5]/50 ring-1 ring-[#0d4af5]/30"
                      : todayFlag
                      ? "bg-[#0d4af5]/10 border-[#0d4af5]/30"
                      : selected
                      ? "bg-white/5 border-white/10"
                      : day
                      ? "border-transparent hover:bg-muted/50 cursor-pointer"
                      : "border-transparent"
                  }`}
                >
                  {day && (
                    <>
                      <div className="flex items-center justify-between mb-0.5">
                        {(() => {
                          const obs = observanceByDay[day];
                          const isNational = obs?.category === "national";
                          const isState = obs?.category === "estadual";
                          const isMunicipal = obs?.category === "municipal";
                          const isFeriado = isNational || isState || isMunicipal;
                          const isCommemorative = obs && !isFeriado;
                          const titleAttr = obs ? obs.allInDay.map((x) => x.name).join(" • ") : undefined;
                          // Cores por escopo de feriado: nacional=âmbar, estadual=laranja, municipal=lima
                          const dayColor = hasDeadline
                            ? "text-[#ff2d55] font-bold drop-shadow-[0_0_6px_rgba(255,45,85,0.6)]"
                            : todayFlag
                            ? "text-[#0d4af5] font-bold"
                            : isNational
                            ? "text-amber-400 font-bold"
                            : isState
                            ? "text-orange-400 font-bold"
                            : isMunicipal
                            ? "text-lime-400 font-bold"
                            : isCommemorative
                            ? "text-pink-300 font-medium"
                            : "text-foreground";
                          const flagColor = isNational ? "text-amber-400" : isState ? "text-orange-400" : isMunicipal ? "text-lime-400" : "";
                          return (
                            <span className={`text-xs font-medium flex items-center gap-1 ${dayColor}`} title={titleAttr}>
                              {day}
                              {hasDeadline && (
                                <AlertTriangle size={10} className="text-[#ff2d55] drop-shadow-[0_0_4px_rgba(255,45,85,0.8)]" />
                              )}
                              {!hasDeadline && isFeriado && (
                                <Flag size={9} className={flagColor} aria-label={obs!.name} />
                              )}
                              {!hasDeadline && isCommemorative && (
                                <Sparkles size={9} className="text-pink-300" aria-label={obs!.name} />
                              )}
                            </span>
                          );
                        })()}
                        {/* Quick create + icon */}
                        <button
                          onClick={(e) => { e.stopPropagation(); openQuickCreate(day); }}
                          className="w-4 h-4 rounded flex items-center justify-center text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-[#0d4af5] hover:bg-[#0d4af5]/10 transition-all"
                          title="Criar evento"
                        >
                          <Plus size={10} />
                        </button>
                      </div>

                      {/* Reminder dots */}
                      {dayReminders.length > 0 && filterTypes.includes("reminder") && (
                        <div className="flex items-center gap-1 mb-0.5">
                          {dayReminders.slice(0, 3).map((rem) => {
                            const remEvent: CalendarEvent = { id: `rem-${rem.id}`, type: "reminder", title: rem.title, clientName: rem.clientName || "", date: rem.date, color: TYPE_COLORS.reminder, detail: "", raw: rem };
                            return (
                            <button
                              key={rem.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, remEvent)}
                              onDragEnd={handleDragEnd}
                              onClick={(e) => { e.stopPropagation(); toggleReminder(rem.id); }}
                              title={`${rem.done ? "✓ " : ""}${rem.title}${rem.time ? ` às ${rem.time}` : ""} — arraste para reagendar`}
                              className={`w-[18px] h-[18px] rounded-md flex items-center justify-center transition-all cursor-grab active:cursor-grabbing ${
                                rem.done
                                  ? "bg-emerald-500/15 border border-emerald-500/30"
                                  : "bg-[#0d4af5]/10 border border-[#0d4af5]/25 shadow-[0_0_6px_rgba(10,52,245,0.3)] hover:shadow-[0_0_10px_rgba(10,52,245,0.5)]"
                              }`}
                            >
                              {rem.done ? (
                                <Check size={8} className="text-emerald-400" />
                              ) : (
                                <Bell size={8} className="text-[#0d4af5] drop-shadow-[0_0_3px_rgba(10,52,245,0.8)]" />
                              )}
                            </button>
                            );
                          })}
                          {dayReminders.length > 3 && (
                            <span className="text-[8px] text-muted-foreground">+{dayReminders.length - 3}</span>
                          )}
                        </div>
                      )}

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
                                  isDone ? "bg-emerald-600/60" : "bg-[#0d4af5]"
                                } ${isStart ? "rounded-l-sm pl-1" : "pl-0.5"} ${isEnd ? "rounded-r-sm pr-1" : "pr-0"}`}
                                title={`${bar.title} — ${bar.clientName} (${bar.assignedTo})`}
                              >
                                {isStart && <span className="truncate">{bar.title}</span>}
                                {isEnd && !isStart && <span className="truncate opacity-70">{bar.title}</span>}
                              </button>
                            );
                          })}
                          {dayBars.length > 2 && (
                            <span className="text-[8px] text-muted-foreground pl-0.5">+{dayBars.length - 2}</span>
                          )}
                        </div>
                      )}

                      {/* Regular events */}
                      <div className="flex flex-col gap-0.5 flex-1">
                        {nonReminderEvents.slice(0, 2).map((e) => {
                          const isTaskDeadline = e.type === "task" && e.isDeadline && (e.raw as Task).status !== "done";
                          const isDraggable = e.type !== "routine";
                          return (
                            <button
                              key={e.id}
                              draggable={isDraggable}
                              onDragStart={isDraggable ? (ev) => handleDragStart(ev, e) : undefined}
                              onDragEnd={isDraggable ? handleDragEnd : undefined}
                              onClick={(ev) => { ev.stopPropagation(); handleEventClick(e); }}
                              className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate text-left transition-all ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""} ${
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
                        {nonReminderEvents.length > 2 && (
                          <span className="text-[10px] text-muted-foreground px-1">+{nonReminderEvents.length - 2} mais</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Selected Day Detail */}
          {selectedDay && (
            <div className="card animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground text-sm">
                  {selectedDay} de {MONTHS[viewMonth]}
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openQuickCreate(selectedDay)}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[#0d4af5] hover:bg-[#0d4af5]/10 transition-all"
                    title="Criar evento neste dia"
                  >
                    <Plus size={14} />
                  </button>
                  <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
              </div>
              {selectedDayEvents.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground mb-2">Nenhum evento neste dia.</p>
                  <button
                    onClick={() => openQuickCreate(selectedDay)}
                    className="text-xs text-[#0d4af5] hover:underline flex items-center gap-1 mx-auto"
                  >
                    <Plus size={12} /> Criar evento
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map((e) => {
                    const Icon = TYPE_ICONS[e.type];
                    const isTaskDeadline = e.type === "task" && e.isDeadline && (e.raw as Task).status !== "done";
                    const isReminder = e.type === "reminder";
                    const rem = isReminder ? e.raw as Reminder : null;
                    return (
                      <button
                        key={e.id}
                        onClick={() => handleEventClick(e)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          isTaskDeadline
                            ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
                            : isReminder
                            ? (rem?.done ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[#0d4af5]/5 border-[#0d4af5]/20 hover:border-[#0d4af5]/40")
                            : "bg-muted/50 border-border/50 hover:border-border"
                        } ${e.type === "task" || isReminder ? "cursor-pointer hover:bg-muted/80" : ""}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            isReminder && rem?.done ? "bg-emerald-500" :
                            isTaskDeadline ? "bg-[#ff2d55] shadow-[0_0_6px_rgba(255,45,85,0.8)]" : e.color
                          }`} />
                          <Icon size={12} className={
                            isReminder ? (rem?.done ? "text-emerald-400" : "text-[#0d4af5]") :
                            isTaskDeadline ? "text-[#ff2d55]" : "text-muted-foreground"
                          } />
                          <span className={`text-xs font-medium truncate ${
                            isReminder && rem?.done ? "text-emerald-400 line-through" :
                            isTaskDeadline ? "text-[#ff2d55] font-bold" : "text-foreground"
                          }`}>
                            {isTaskDeadline && "⚠️ "}{e.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 ml-[18px]">
                          {e.clientName && <span className="text-[10px] text-muted-foreground">{e.clientName}</span>}
                          {e.clientName && <span className="text-[10px] text-muted-foreground/50">·</span>}
                          <span className="text-[10px] text-muted-foreground">{e.detail}</span>
                        </div>
                        {isTaskDeadline && (
                          <div className="ml-[18px] mt-1">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-[#ff2d55] font-bold border border-red-500/20">
                              PRAZO FINAL
                            </span>
                          </div>
                        )}
                        {isReminder && !rem?.done && (
                          <div className="ml-[18px] mt-1">
                            <span className="text-[9px] text-muted-foreground">Clique para marcar como concluído</span>
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
                  const isTaskToday = task.dueDate === todayStr;
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
                        isTaskToday ? "text-[#ff2d55] font-bold" : isTomorrow ? "text-amber-400" : "text-muted-foreground"
                      }`}>
                        {isTaskToday ? "HOJE" : isTomorrow ? "Amanhã" : `${d} ${MONTHS_SHORT[m - 1]}`}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isTaskToday ? "bg-[#ff2d55] shadow-[0_0_6px_rgba(255,45,85,0.8)]" : "bg-[#3b6ff5]"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs truncate block ${isTaskToday ? "text-[#ff2d55] font-bold" : "text-foreground"}`}>
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
              <Calendar size={14} className="text-[#0d4af5]" />
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
                      className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded-md px-1 transition-all"
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
              </div>
            )}
          </div>

          {/* Próximas datas (60 dias) — feriados oficiais + comemorativas */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
              <Calendar size={14} className="text-[#0d4af5]" />
              Próximas datas
            </h3>
            {upcomingObservances.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma data nos próximos 60 dias.</p>
            ) : (
              <div className="space-y-2">
                {upcomingObservances.map((o, idx) => {
                  const [, m, d] = o.date.split("-").map(Number);
                  const weekday = new Date(o.date + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
                  const isOfficial = o.category === "national";
                  const Icon = isOfficial ? Flag : Sparkles;
                  return (
                    <div key={`${o.date}-${idx}`} className="flex items-center gap-2 py-1.5 px-1">
                      <span className={`text-[10px] w-10 shrink-0 text-right font-medium ${isOfficial ? "text-amber-400" : "text-pink-300"}`}>
                        {d} {MONTHS_SHORT[m - 1]}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOfficial ? "bg-amber-400" : "bg-pink-300"}`} />
                      <Icon size={11} className={`shrink-0 ${isOfficial ? "text-amber-400/70" : "text-pink-300/70"}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-foreground truncate block">{o.name}</span>
                        <span className="text-[10px] text-muted-foreground">{weekday}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="card">
            <h3 className="font-semibold text-foreground text-sm mb-3">Legenda</h3>
            <div className="space-y-2">
              {(["content", "task", "routine", "reminder"] as EventType[]).map((t) => {
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
                <span className="w-2.5 h-2.5 rounded-full bg-[#0d4af5]" />
                <span className="text-[10px] text-muted-foreground">Barra = duração da tarefa</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff2d55] shadow-[0_0_4px_rgba(255,45,85,0.6)]" />
                <AlertTriangle size={10} className="text-[#ff2d55]" />
                <span className="text-[10px] text-[#ff2d55] font-medium">Prazo final</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-border/50 mt-1">
                <GripVertical size={12} className="text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Arraste eventos para reagendar</span>
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

      {/* Quick Create Modal */}
      {showCreate && (
        <QuickCreateModal
          date={createDate}
          clients={clients}
          currentUser={currentUser}
          role={role}
          onClose={() => setShowCreate(false)}
          onCreateTask={(task) => {
            addTask(task);
            setShowCreate(false);
          }}
          onCreateContent={(card) => {
            addContentCard(card);
            setShowCreate(false);
          }}
          onCreateReminder={(rem) => {
            addReminder(rem);
            setShowCreate(false);
          }}
          onSaveAndOpen={(task) => {
            const created = addTask(task);
            setShowCreate(false);
            setSelectedTask(created);
          }}
        />
      )}
    </div>
  );
}

// ─── Quick Create Modal ────────────────────────────────────────
function QuickCreateModal({
  date,
  clients,
  currentUser,
  role,
  onClose,
  onCreateTask,
  onCreateContent,
  onCreateReminder,
  onSaveAndOpen,
}: {
  date: string;
  clients: { id: string; name: string; assignedSocial: string; assignedTraffic: string; assignedDesigner: string }[];
  currentUser: string;
  role: Role;
  onClose: () => void;
  onCreateTask: (task: Omit<Task, "id">) => void;
  onCreateContent: (card: Omit<ContentCard, "id">) => void;
  onCreateReminder: (rem: Omit<Reminder, "id">) => void;
  onSaveAndOpen: (task: Omit<Task, "id">) => void;
}) {
  const [createType, setCreateType] = useState<CreateType>("task");
  // Social/designer/traffic só veem seus próprios clientes na carteira
  const visibleClients = useMemo(() => {
    if (role === "social") return clients.filter((c) => c.assignedSocial === currentUser);
    if (role === "designer") return clients.filter((c) => c.assignedDesigner === currentUser);
    if (role === "traffic") return clients.filter((c) => c.assignedTraffic === currentUser);
    return clients;
  }, [clients, role, currentUser]);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(visibleClients[0]?.id || "");
  const [sector, setSector] = useState<"social" | "designer" | "traffic">("social");
  const [priority, setPriority] = useState<Priority>("medium");
  const [description, setDescription] = useState("");
  const [briefing, setBriefing] = useState("");
  const [format, setFormat] = useState("Post Feed (1:1)");
  const [time, setTime] = useState("");
  const [endDate, setEndDate] = useState(date);

  // Autoresize do textarea de descrição (briefing usa RichTextEditor que cuida sozinho)
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  const selectedClient = visibleClients.find((c) => c.id === clientId);

  const getAssignedTo = () => {
    if (!selectedClient) return currentUser;
    if (sector === "social") return selectedClient.assignedSocial;
    if (sector === "designer") return selectedClient.assignedDesigner;
    if (sector === "traffic") return selectedClient.assignedTraffic;
    return currentUser;
  };

  const handleSave = (openDetails = false) => {
    if (!title.trim()) return;

    if (createType === "reminder") {
      onCreateReminder({
        title: title.trim(),
        date,
        time: time || undefined,
        description: description || undefined,
        createdBy: currentUser,
        clientId: clientId || undefined,
        clientName: selectedClient?.name,
        done: false,
      });
      return;
    }

    if (createType === "social") {
      onCreateContent({
        title: title.trim(),
        clientId,
        clientName: selectedClient?.name || "",
        socialMedia: selectedClient?.assignedSocial || currentUser,
        status: "ideas",
        priority,
        format,
        dueDate: endDate,
        briefing: briefing || undefined,
        statusChangedAt: new Date().toISOString(),
        columnEnteredAt: { ideas: new Date().toISOString() },
      } as Omit<ContentCard, "id">);
      return;
    }

    // Task
    const taskData: Omit<Task, "id"> = {
      title: title.trim(),
      clientId,
      clientName: selectedClient?.name || "",
      assignedTo: getAssignedTo(),
      role: sector as Role,
      status: "pending",
      priority,
      startDate: date,
      dueDate: endDate,
      description: description || undefined,
    };

    if (openDetails) {
      onSaveAndOpen(taskData);
    } else {
      onCreateTask(taskData);
    }
  };

  const CREATE_TYPES: { key: CreateType; label: string; icon: typeof Check; desc: string }[] = [
    { key: "task", label: "Tarefa", icon: Briefcase, desc: "Tarefa para qualquer setor" },
    { key: "social", label: "Social Media", icon: Instagram, desc: "Card de conteúdo com briefing" },
    { key: "reminder", label: "Lembrete", icon: Bell, desc: "Aviso simples sem design" },
  ];

  const dateParts = date.split("-");
  const dateLabel = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-black border border-[#1a1a1a] rounded-2xl shadow-[0_0_60px_rgba(10,52,245,0.08)] animate-fade-in overflow-hidden">
        {/* Top glow bar */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#0d4af5]/40 to-transparent" />

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Plus size={18} className="text-[#0d4af5]" />
                Criação Rápida
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Calendar size={11} /> {dateLabel}
              </p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <X size={16} />
            </button>
          </div>

          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {CREATE_TYPES.map((ct) => {
              const Icon = ct.icon;
              const active = createType === ct.key;
              return (
                <button
                  key={ct.key}
                  onClick={() => setCreateType(ct.key)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    active
                      ? "border-[#0d4af5]/50 bg-[#0d4af5]/[0.06] shadow-[0_0_15px_rgba(10,52,245,0.1)]"
                      : "border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#2a2a2a]"
                  }`}
                >
                  <Icon size={16} className={active ? "text-[#0d4af5]" : "text-zinc-600"} />
                  <p className={`text-xs font-medium mt-1.5 ${active ? "text-foreground" : "text-zinc-500"}`}>{ct.label}</p>
                  <p className="text-[9px] text-zinc-700 mt-0.5">{ct.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                createType === "reminder" ? "Ex: Reunião com cliente às 14h" :
                createType === "social" ? "Ex: Reel: 5 dicas de investimento" :
                "Ex: Revisar campanhas Google Ads"
              }
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-700 focus:border-[#0d4af5]/50 focus:shadow-[0_0_0_3px_rgba(10,52,245,0.08)] outline-none transition-all"
              autoFocus
            />
          </div>

          {/* Client + Sector (not for reminders) */}
          {createType !== "reminder" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Cliente</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none"
                >
                  {visibleClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {createType === "task" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Setor Responsável</label>
                  <div className="flex gap-1">
                    {([
                      { key: "social", icon: Instagram, label: "Social" },
                      { key: "designer", icon: Palette, label: "Design" },
                      { key: "traffic", icon: TrendingUp, label: "Tráfego" },
                    ] as const).map((s) => {
                      const Icon = s.icon;
                      const active = sector === s.key;
                      return (
                        <button
                          key={s.key}
                          onClick={() => setSector(s.key)}
                          className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-[9px] transition-all ${
                            active
                              ? "border-[#0d4af5]/40 bg-[#0d4af5]/10 text-[#0d4af5]"
                              : "border-[#1a1a1a] text-zinc-600 hover:border-[#2a2a2a]"
                          }`}
                        >
                          <Icon size={12} />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {createType === "social" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Formato</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none"
                  >
                    <option>Post Feed (1:1)</option>
                    <option>Reel (9:16)</option>
                    <option>Story (9:16)</option>
                    <option>Carrossel</option>
                    <option>Vídeo</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* For reminder: optional client + time */}
          {createType === "reminder" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Cliente (opcional)</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none"
                >
                  <option value="">Nenhum</option>
                  {visibleClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Clock size={10} /> Horário (opcional)
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none"
                />
              </div>
            </div>
          )}

          {/* Priority + End Date (tasks/social) */}
          {createType !== "reminder" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prioridade</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none"
                >
                  {(Object.entries(PRIORITY_LABELS) as [Priority, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Data Final</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2.5 text-xs text-foreground focus:border-[#0d4af5]/50 outline-none"
                />
              </div>
            </div>
          )}

          {/* Briefing (social) — editor WYSIWYG */}
          {createType === "social" && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Briefing</label>
              <RichTextEditor
                value={briefing}
                onChange={setBriefing}
                placeholder="Descreva o conteúdo, referências, tom de voz, CTAs, hashtags..."
                minHeight={140}
              />
              <p className="text-[9px] text-zinc-700">
                Use negrito, itálico e listas pra estruturar. O designer vê formatado.
              </p>
            </div>
          )}

          {createType === "task" && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Descrição (opcional)</label>
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes adicionais sobre a tarefa..."
                rows={3}
                className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-zinc-700 focus:border-[#0d4af5]/50 outline-none resize-none leading-relaxed min-h-[80px] overflow-hidden"
              />
            </div>
          )}

          {/* Routing info */}
          {createType !== "reminder" && selectedClient && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d4af5]/[0.03] border border-[#0d4af5]/10">
              <User size={12} className="text-[#0d4af5] shrink-0" />
              <span className="text-[10px] text-muted-foreground">
                {createType === "social"
                  ? `Será enviado para o board de ${selectedClient.assignedSocial}`
                  : `Atribuído a ${getAssignedTo()} → Board de ${sector === "social" ? "Social" : sector === "designer" ? "Design" : "Tráfego"}`
                }
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1a1a1a]">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-zinc-500 hover:text-foreground hover:bg-white/5 transition-all">
              Cancelar
            </button>
            {createType === "task" && (
              <button
                onClick={() => handleSave(true)}
                disabled={!title.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs text-foreground bg-white/5 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-30"
              >
                <ExternalLink size={12} /> Salvar e Abrir Detalhes
              </button>
            )}
            <button
              onClick={() => handleSave(false)}
              disabled={!title.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-all shadow-[0_0_15px_rgba(10,52,245,0.3)] disabled:opacity-30 disabled:shadow-none"
            >
              <Save size={12} /> Salvar
            </button>
          </div>
        </div>
      </div>
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
        <div className={`h-1 w-full ${task.status === "done" ? "bg-emerald-500" : isDeadlinePassed ? "bg-[#ff2d55]" : "bg-[#0d4af5]"}`} />

        <div className="p-6 space-y-5">
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

          {isDeadlinePassed && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={14} className="text-[#ff2d55] shrink-0" />
              <span className="text-xs text-[#ff2d55] font-bold">Prazo vencido — entrega era {task.dueDate}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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

          {!editing && task.status !== "done" && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <span className="text-[10px] text-muted-foreground">Ação rápida:</span>
              {task.status === "pending" && (
                <button
                  onClick={() => onUpdate(task.id, { status: "in_progress" })}
                  className="text-[11px] px-3 py-1 rounded-lg bg-[#0d4af5]/10 text-[#0d4af5] border border-[#0d4af5]/20 hover:bg-[#0d4af5]/20 transition-all font-medium"
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

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancelar</button>
                <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0d4af5] text-white text-xs font-medium hover:bg-[#0d4af5]/80 transition-all">
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
