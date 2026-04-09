"use client";

import Header from "@/components/Header";
import KanbanBoard from "@/components/KanbanBoard";
import ContentCardModal from "@/components/ContentCardModal";
import ContentIdeasModal from "@/components/ContentIdeasModal";
import Client360Modal from "@/components/Client360Modal";
import CampaignModal from "@/components/CampaignModal";
import DriveButton from "@/components/DriveButton";
import type { ContentCard, Client, MoodType, Priority, SocialMonthlyReport, MonthlyDeliveryReport, SocialPerformanceScore } from "@/lib/types";
import { getPriorityColor, getPriorityLabel, formatTimeSpent, getLiveTimeSpentMs, OVERTIME_THRESHOLD_MS } from "@/lib/utils";
import {
  AlertTriangle, Calendar, Instagram, ImageIcon,
  Smile, UserPlus, X, ExternalLink,
  Sparkles, Clock, Target, Zap, BarChart2,
  TrendingUp, Hash, Check, Plus, ChevronDown,
  Key, MessageCircle, Send, Eye, EyeOff, Save,
  Download, CheckCircle, FileWarning, ShieldCheck, AlertCircle,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useRole } from "@/lib/context/RoleContext";
import { useAppState } from "@/lib/context/AppStateContext";
import { useNav } from "@/lib/context/NavContext";
import SocialAuthModal from "@/components/SocialAuthModal";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { exportReportAsPdf } from "@/lib/exportPdf";

// ── Helpers ──────────────────────────────────────────────────────────────────

function hoursSince(isoString?: string): number {
  if (!isoString) return 9999;
  return (Date.now() - new Date(isoString).getTime()) / 3600000;
}

function getInactivityLevel(client: Client): "none" | "warning" | "urgent" {
  const h = hoursSince(client.lastKanbanActivity);
  if (h >= 48) return "urgent";
  if (h >= 24) return "warning";
  return "none";
}

function getDeadlineUrgency(dueDate?: string): "overdue" | "today" | "tomorrow" | "soon" | "ok" | "none" {
  if (!dueDate) return "none";
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 3) return "soon";
  return "ok";
}

function getSlaBadge(statusChangedAt?: string): { label: string; level: "warning" | "critical" } | null {
  if (!statusChangedAt) return null;
  const hours = (Date.now() - new Date(statusChangedAt).getTime()) / 3600000;
  if (hours >= 48) return { label: `${Math.floor(hours / 24)}d parado`, level: "critical" };
  if (hours >= 24) return { label: `${Math.floor(hours)}h parado`, level: "warning" };
  return null;
}

const SLA_STYLES = {
  warning: "text-zinc-400 bg-[#111118] border-[#1e1e2a]",
  critical: "text-red-500 bg-red-500/10 border-red-500/20",
};

const DEADLINE_BADGE: Record<string, { label: string; color: string }> = {
  overdue:  { label: "Vencido",  color: "bg-red-500/10 text-red-500 border-red-500/20" },
  today:    { label: "Hoje",     color: "bg-[#111118] text-zinc-400 border-[#1e1e2a]" },
  tomorrow: { label: "Amanhã",   color: "bg-[#111118] text-zinc-400 border-[#1e1e2a]" },
  soon:     { label: "Em breve", color: "bg-primary/15 text-primary border-primary/20" },
};

// ── Config ────────────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<string, { label: string; led: string; color: string; bg: string; border: string }> = {
  good:       { label: "On Fire",    led: "led led-healthy",  color: "text-primary",       bg: "bg-primary/5",    border: "border-primary/20" },
  average:    { label: "Atenção",    led: "led led-attention", color: "text-zinc-400",      bg: "bg-[#0a0a10]",     border: "border-[#1a1a22]" },
  at_risk:    { label: "Crítico",    led: "led led-critical",  color: "text-red-500",       bg: "bg-red-500/5",    border: "border-red-500/20" },
  onboarding: { label: "Onboarding", led: "led led-healthy",  color: "text-primary",       bg: "bg-primary/5",    border: "border-primary/20" },
};

const MOOD_CONFIG = {
  happy:   { emoji: "😄", label: "Satisfeito", color: "text-primary" },
  neutral: { emoji: "😐", label: "Neutro",     color: "text-zinc-400" },
  angry:   { emoji: "😠", label: "Irritado",   color: "text-red-500" },
};

const TONE_LABELS: Record<string, string> = {
  formal: "Formal", funny: "Engraçado", authoritative: "Autoritário", casual: "Casual",
};

const CONTENT_COLUMNS = [
  { id: "ideas",          title: "Ideias",             color: "bg-zinc-600" },
  { id: "script",         title: "Roteiro",            color: "bg-zinc-600" },
  { id: "in_production",  title: "Em Produção",        color: "bg-primary" },
  { id: "approval",       title: "Aprovação Interna",  color: "bg-zinc-500" },
  { id: "client_approval",title: "Aprovação Cliente",  color: "bg-zinc-500" },
  { id: "scheduled",      title: "Agendado",           color: "bg-zinc-500" },
  { id: "published",      title: "Publicado",          color: "bg-primary" },
];

const STATUS_DOT: Record<ContentCard["status"], string> = {
  ideas: "bg-zinc-600",
  script: "bg-zinc-600",
  in_production: "bg-primary",
  approval: "bg-zinc-500",
  client_approval: "bg-zinc-500",
  scheduled: "bg-zinc-500",
  published: "bg-primary",
};

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ── Confetti ──────────────────────────────────────────────────────────────────

function Confetti() {
  const items = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: `${(i * 2.5) % 100}%`,
      top: `-${(i * 0.5) % 20}%`,
      color: ["#0a34f5", "#1a4cff", "#3b6ff5", "#5588ff", "#0a34f5", "#1a4cff"][i % 6],
      delay: `${(i * 0.05) % 2}s`,
      duration: `${1 + (i * 0.05) % 2}s`,
      rotate: `${(i * 9) % 360}deg`,
    })),
  []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {items.map((item, i) => (
        <div
          key={i}
          className="absolute w-2 h-2 rounded-sm animate-bounce opacity-80"
          style={{
            left: item.left,
            top: item.top,
            backgroundColor: item.color,
            animationDelay: item.delay,
            animationDuration: item.duration,
            transform: `rotate(${item.rotate})`,
          }}
        />
      ))}
    </div>
  );
}

// ── Onboarding Complete Modal ─────────────────────────────────────────────────

interface OnboardingCompleteModalProps {
  client: Client;
  onMoveActive: () => void;
  onMoveActiveAndIdeas: () => void;
  onClose: () => void;
}

function OnboardingCompleteModal({ client, onMoveActive, onMoveActiveAndIdeas, onClose }: OnboardingCompleteModalProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 animate-fade-in">
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-lg font-bold text-foreground mb-2">Onboarding Concluído!</h3>
          <p className="text-sm text-muted-foreground">
            Deseja mover <span className="text-foreground font-semibold">{client.name}</span> para Ativo e gerar as primeiras pautas com IA?
          </p>
        </div>
        <div className="space-y-2">
          <button
            onClick={onMoveActiveAndIdeas}
            className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Mover para Ativo + Gerar Pautas
          </button>
          <button
            onClick={onMoveActive}
            className="w-full px-4 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            Apenas mover para Ativo
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-muted-foreground text-sm font-medium hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

interface CalendarViewProps {
  cards: ContentCard[];
  onDayClick?: (day: number, cards: ContentCard[]) => void;
}

function CalendarView({ cards, onDayClick }: CalendarViewProps) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const cardsByDay: Record<number, ContentCard[]> = {};
  cards.forEach((c) => {
    if (!c.dueDate) return;
    const [y, m, d] = c.dueDate.split("-").map(Number);
    if (y === year && m - 1 === month) {
      if (!cardsByDay[d]) cardsByDay[d] = [];
      cardsByDay[d].push(c);
    }
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const handleDayClick = (day: number) => {
    setSelectedDay(selectedDay === day ? null : day);
    if (onDayClick) onDayClick(day, cardsByDay[day] ?? []);
  };

  const selectedDayCards = selectedDay ? (cardsByDay[selectedDay] ?? []) : [];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Calendar size={16} className="text-primary" />
          Calendário — {MONTHS[month]} {year}
        </h3>
        <span className="text-xs text-muted-foreground">
          {Object.values(cardsByDay).flat().length} posts agendados
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          const dayCards = day ? (cardsByDay[day] ?? []) : [];
          const isToday = day === today.getDate();
          const isSelected = day === selectedDay;
          return (
            <div
              key={i}
              onClick={() => day && handleDayClick(day)}
              className={`min-h-[52px] rounded-lg flex flex-col items-center gap-0.5 p-1 text-xs transition-colors ${
                isToday ? "bg-primary text-primary-foreground font-bold" :
                isSelected ? "bg-primary/20 border border-primary/40 text-foreground" :
                day ? "hover:bg-muted text-foreground cursor-pointer" : ""
              }`}
            >
              {day && (
                <>
                  <span className="leading-none">{day}</span>
                  <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                    {dayCards.slice(0, 3).map((c) => (
                      <span key={c.id} title={`${c.clientName}: ${c.title}`}
                        className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                    ))}
                    {dayCards.length > 3 && <span className="text-muted-foreground text-[10px]">+{dayCards.length - 3}</span>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs font-medium text-foreground mb-2">
            {selectedDay} de {MONTHS[month]}
            {selectedDayCards.length > 0
              ? ` — ${selectedDayCards.length} conteúdo(s)`
              : " — Nenhum conteúdo"}
          </p>
          {selectedDayCards.length > 0 ? (
            <div className="space-y-2">
              {selectedDayCards.map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[c.status]}`} />
                  <span className="text-xs text-foreground font-medium truncate">{c.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">· {c.clientName}</span>
                </div>
              ))}
            </div>
          ) : (
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => onDayClick && onDayClick(selectedDay, [])}
            >
              Nenhum conteúdo — clique para criar
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border">
        {CONTENT_COLUMNS.map((col) => (
          <div key={col.id} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${col.color}`} />
            <span className="text-xs text-muted-foreground">{col.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Personal Dashboard ───────────────────────────────────────────────────────

interface PersonalDashboardProps {
  userName: string;
  cards: ContentCard[];
  clients: Client[];
  moodHistory: Record<string, ReturnType<typeof useAppState>["moodHistory"][string]>;
}

function PersonalDashboard({ userName, cards, clients, moodHistory }: PersonalDashboardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const myCards = cards.filter((c) => c.socialMedia === userName);
  const activeCards = myCards.filter((c) => c.status !== "published");
  const publishedCards = myCards.filter((c) => c.status === "published");

  // Cards due today/tomorrow
  const dueSoon = activeCards.filter((c) => {
    if (!c.dueDate) return false;
    const d = new Date(c.dueDate);
    d.setHours(0, 0, 0, 0);
    return d <= tomorrow;
  });

  // Overdue cards
  const overdue = activeCards.filter((c) => {
    if (!c.dueDate) return false;
    const d = new Date(c.dueDate);
    d.setHours(0, 0, 0, 0);
    return d < today;
  });

  // SLA alerts: cards stuck 24h+
  const slaAlerts = activeCards.filter((c) => {
    const sla = getSlaBadge(c.statusChangedAt);
    return sla !== null;
  });

  // Clients without mood check-in for 3+ days
  const noCheckin = clients.filter((c) => {
    const entries = moodHistory[c.id];
    if (!entries || entries.length === 0) return true;
    const lastDate = new Date(entries[0].date);
    const diffDays = (Date.now() - lastDate.getTime()) / 86400000;
    return diffDays >= 3;
  });

  const firstName = userName.split(" ")[0];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Bom dia, {firstName}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeCards.length} conteúdo(s) em andamento · {publishedCards.length} publicado(s) este mês
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary tracking-tight">{myCards.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total cards</p>
        </div>
      </div>

      {/* Alert cards row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Overdue / Due soon */}
        <div className={`rounded-xl p-4 border ${
          overdue.length > 0
            ? "bg-red-500/5 border-red-500/20"
            : dueSoon.length > 0
              ? "bg-primary/5 border-primary/20"
              : "bg-card border-border"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Clock size={13} className={overdue.length > 0 ? "text-red-500" : "text-primary"} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Entregas</span>
          </div>
          {overdue.length > 0 ? (
            <div>
              <p className="text-xl font-bold text-red-500 tracking-tight">{overdue.length}</p>
              <p className="text-[10px] text-red-500/70">vencido(s)</p>
            </div>
          ) : dueSoon.length > 0 ? (
            <div>
              <p className="text-xl font-bold text-primary tracking-tight">{dueSoon.length}</p>
              <p className="text-[10px] text-zinc-500">até amanhã</p>
            </div>
          ) : (
            <div>
              <p className="text-xl font-bold text-zinc-600 tracking-tight">0</p>
              <p className="text-[10px] text-zinc-600">tudo em dia</p>
            </div>
          )}
        </div>

        {/* SLA alerts */}
        <div className={`rounded-xl p-4 border ${
          slaAlerts.length > 0 ? "bg-[#0a0a10] border-[#1e1e2a]" : "bg-card border-border"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className={slaAlerts.length > 0 ? "text-zinc-400" : "text-zinc-600"} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Gargalos</span>
          </div>
          <p className={`text-xl font-bold tracking-tight ${slaAlerts.length > 0 ? "text-[#c0c0cc]" : "text-zinc-600"}`}>
            {slaAlerts.length}
          </p>
          <p className="text-[10px] text-zinc-500">card(s) parado(s) 24h+</p>
        </div>

        {/* Check-in needed */}
        <div className={`rounded-xl p-4 border ${
          noCheckin.length > 0 ? "bg-primary/5 border-primary/20" : "bg-card border-border"
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Smile size={13} className={noCheckin.length > 0 ? "text-primary" : "text-zinc-600"} />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Check-in</span>
          </div>
          <p className={`text-xl font-bold tracking-tight ${noCheckin.length > 0 ? "text-primary" : "text-zinc-600"}`}>
            {noCheckin.length}
          </p>
          <p className="text-[10px] text-zinc-500">sem check-in 3+ dias</p>
        </div>
      </div>

      {/* Due soon list */}
      {dueSoon.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Próximas entregas</h4>
          <div className="space-y-2">
            {dueSoon.slice(0, 4).map((card) => {
              const isOverdue = overdue.some((o) => o.id === card.id);
              return (
                <div key={card.id} className="flex items-center gap-3 text-xs">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue ? "bg-red-500" : "bg-primary"}`} />
                  <span className="text-foreground truncate flex-1">{card.title}</span>
                  <span className="text-zinc-600 shrink-0">{card.clientName}</span>
                  <span className={`shrink-0 font-medium ${isOverdue ? "text-red-500" : "text-zinc-400"}`}>
                    {card.dueDate}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ClientCard ────────────────────────────────────────────────────────────────

interface ClientCardProps {
  client: Client;
  moodEntries: ReturnType<typeof useAppState>["moodHistory"][string];
  onboarding: ReturnType<typeof useAppState>["onboarding"][string];
  onMood: (clientId: string) => void;
  onIdeas: (client: Client) => void;
  onOpen360: () => void;
}

function ClientCard({ client, moodEntries, onboarding, onMood, onIdeas, onOpen360 }: ClientCardProps) {
  const health = HEALTH_CONFIG[client.status] ?? HEALTH_CONFIG.good;
  const inactivity = getInactivityLevel(client);
  const lastMood = moodEntries?.[0];
  const mood = lastMood ? MOOD_CONFIG[lastMood.mood] : null;

  const postsNow = client.postsThisMonth ?? 0;
  const postsGoal = client.postsGoal ?? 12;
  const postsPct = Math.min(100, Math.round((postsNow / postsGoal) * 100));

  const obItems = onboarding ?? [];
  const obDone = obItems.filter((i) => i.completed).length;
  const obPct = obItems.length > 0 ? Math.round((obDone / obItems.length) * 100) : 0;

  const hoursAgo = hoursSince(client.lastKanbanActivity);
  const activityLabel = hoursAgo < 1 ? "agora" : hoursAgo < 24 ? `${Math.floor(hoursAgo)}h` : `${Math.floor(hoursAgo / 24)}d`;

  const isAtRisk = client.status === "at_risk";

  return (
    <div
      className={`bg-card border rounded-xl p-5 hover:border-primary/40 transition-all cursor-pointer ${
        isAtRisk ? "border-red-500/30" : "border-border"
      }`}
      onClick={onOpen360}
    >
      {/* Row 1: Avatar + Name + Status LED */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0 tracking-tight">
          {client.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground text-sm tracking-tight truncate">{client.name}</h3>
            <div className={health.led} title={health.label} />
            {inactivity === "urgent" && (
              <span className="text-[10px] text-red-500 font-medium animate-pulse">URGENTE</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <span>{client.industry}</span>
            {client.instagramUser && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-500">{client.instagramUser}</span>
              </>
            )}
          </div>
        </div>
        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-1 rounded-md border ${health.bg} ${health.color} ${health.border}`}>
          {health.label}
        </span>
      </div>

      {/* Row 2: Metrics row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Posts progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Posts</span>
            <span className="text-[10px] text-zinc-400 font-medium">{postsNow}/{postsGoal}</span>
          </div>
          <div className="h-1 bg-[#111118] rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${postsPct}%` }} />
          </div>
        </div>

        {/* Mood */}
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Humor</span>
          {mood ? (
            <span className="text-xs text-zinc-400 mt-1 block">{mood.emoji} {mood.label}</span>
          ) : (
            <span className="text-xs text-zinc-600 mt-1 block">—</span>
          )}
        </div>

        {/* Activity */}
        <div className="text-right">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Atividade</span>
          <span className={`text-xs mt-1 block ${inactivity === "urgent" ? "text-red-500" : inactivity === "warning" ? "text-zinc-400" : "text-primary"}`}>
            {activityLabel}
          </span>
        </div>
      </div>

      {/* Onboarding progress (only if onboarding) */}
      {client.status === "onboarding" && obItems.length > 0 && (
        <div className="mb-4 p-3 bg-primary/5 rounded-lg border border-primary/10">
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span className="text-primary uppercase tracking-wider font-medium">Onboarding</span>
            <span className="text-primary font-semibold">{obPct}%</span>
          </div>
          <div className="h-1 bg-primary/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${obPct}%` }} />
          </div>
          <p className="text-[10px] text-zinc-500 mt-1.5">{obDone} de {obItems.length} etapas</p>
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center justify-between pt-3 border-t border-[#1a1a22]/80">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onIdeas(client); }}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-zinc-600 hover:text-primary transition-colors"
            title="Gerar ideias"
          >
            <Sparkles size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMood(client.id); }}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-zinc-600 hover:text-primary transition-colors"
            title="Check-in de humor"
          >
            <Smile size={14} />
          </button>
          <Link
            href={`/clients/${client.id}`}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-zinc-600 hover:text-primary transition-colors"
            title="Ver perfil"
          >
            <ExternalLink size={14} />
          </Link>
        </div>
        {client.toneOfVoice && (
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
            {TONE_LABELS[client.toneOfVoice] ?? client.toneOfVoice}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Mood check-in inline modal ────────────────────────────────────────────────

interface MoodModalProps {
  clientName: string;
  onSave: (mood: MoodType, note: string) => void;
  onClose: () => void;
}

function MoodModal({ clientName, onSave, onClose }: MoodModalProps) {
  const [selected, setSelected] = useState<MoodType | null>(null);
  const [note, setNote] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm">Check-in de Humor</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Como foi a última interação com <span className="text-foreground font-medium">{clientName}</span>?
        </p>
        <div className="flex gap-3 mb-4">
          {(["happy", "neutral", "angry"] as MoodType[]).map((m) => {
            const cfg = MOOD_CONFIG[m];
            return (
              <button
                key={m}
                onClick={() => setSelected(m)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all ${
                  selected === m
                    ? "bg-primary/15 border-primary/40 text-foreground"
                    : "border-border text-muted-foreground hover:border-muted hover:text-foreground"
                }`}
              >
                <span className="text-2xl">{cfg.emoji}</span>
                <span className="text-xs font-medium">{cfg.label}</span>
              </button>
            );
          })}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Nota opcional (ex: pediu relatório, reclamou de algo...)"
          className="w-full bg-muted rounded-lg px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost text-xs flex-1">Cancelar</button>
          <button
            onClick={() => { if (selected) { onSave(selected, note); onClose(); }}}
            disabled={!selected}
            className="btn-primary text-xs flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Salvar check-in
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Content Card Modal ────────────────────────────────────────────────────

interface NewContentCardModalProps {
  defaultDate?: string;
  defaultClient?: Client;
  onClose: () => void;
}

function NewContentCardModal({ defaultDate, defaultClient, onClose }: NewContentCardModalProps) {
  const { clients, addContentCard } = useAppState();
  const { currentUser, role } = useRole();

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(defaultClient?.id ?? "");
  const [format, setFormat] = useState("Post");
  const [priority, setPriority] = useState<ContentCard["priority"]>("medium");
  const [dueDate, setDueDate] = useState(defaultDate ?? "");
  const [dueTime, setDueTime] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);
  const canSubmit = title.trim() && clientId && dueDate && dueTime && priority;

  const handleSubmit = () => {
    if (!canSubmit) return;
    addContentCard({
      title: title.trim(),
      clientId,
      clientName: selectedClient?.name ?? "",
      socialMedia: role === "social" ? currentUser : (selectedClient?.assignedSocial ?? currentUser),
      status: "ideas",
      priority,
      format,
      dueDate,
      dueTime,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon size={16} className="text-primary" />
            Novo Conteúdo
          </DialogTitle>
          {defaultDate && (
            <p className="text-xs text-muted-foreground">Data: {defaultDate}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div>
            <Label className="mb-1.5 block">Título do Conteúdo *</Label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Post de segunda — dicas de verão"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          {/* Client */}
          <div>
            <Label className="mb-1.5 block">Cliente *</Label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione um cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Format + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Formato</Label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {["Post", "Reels", "Story", "Carrossel", "BTS", "Destaque"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Urgência *</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ContentCard["priority"])}
                className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  priority === "critical" ? "border-red-500/50 bg-red-500/5" : priority === "high" ? "border-yellow-500/50 bg-[#0a34f5]/5" : "border-input bg-background"
                }`}
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Urgente</option>
              </select>
            </div>
          </div>

          {/* Due date + time row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Data de Postagem *</Label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  !dueDate ? "border-red-500/30" : "border-input"
                }`}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Horário *</Label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  !dueTime ? "border-red-500/30" : "border-input"
                }`}
              />
            </div>
          </div>

          {(!dueDate || !dueTime) && (
            <p className="text-xs text-red-400">Data e horário são obrigatórios para enviar a demanda ao designer.</p>
          )}

          {/* Client fixed briefing preview */}
          {selectedClient?.fixedBriefing && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
              <p className="text-[10px] text-primary uppercase tracking-wider font-medium mb-1">Briefing Fixo — {selectedClient.name}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{selectedClient.fixedBriefing}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Criar Conteúdo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Quick Task Bar ────────────────────────────────────────────────────────────

interface QuickTaskBarProps {
  clients: Client[];
}

function QuickTaskBar({ clients }: QuickTaskBarProps) {
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [format, setFormat] = useState("Post");
  const [column, setColumn] = useState<ContentCard["status"]>("ideas");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addContentCard } = useAppState();
  const { currentUser, role } = useRole();

  const canCreate = title.trim() && clientId && dueDate && dueTime;

  const handleCreate = () => {
    if (!canCreate) return;
    const client = clients.find((c) => c.id === clientId);
    addContentCard({
      title: title.trim(),
      clientId,
      clientName: client?.name ?? "",
      socialMedia: role === "social" ? currentUser : (client?.assignedSocial ?? currentUser),
      status: column,
      priority,
      format,
      dueDate,
      dueTime,
    });
    setTitle("");
    setDueDate("");
    setDueTime("");
    setSuccess(true);
    setTimeout(() => { setSuccess(false); inputRef.current?.focus(); }, 1200);
  };

  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border mb-4 transition-all flex-wrap ${
      success ? "border-primary/40 bg-primary/5" : "border-border bg-card"
    }`}>
      <Zap size={14} className="text-primary shrink-0" />
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        placeholder="Criar tarefa rápida..."
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-[120px]"
      />
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer max-w-[130px]"
      >
        <option value="">Cliente *</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer"
      >
        {["Post", "Reels", "Story", "Carrossel", "BTS", "Destaque"].map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className={`bg-muted border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer ${!dueDate ? "border-red-500/40" : "border-border"}`}
        title="Data do post *"
      />
      <input
        type="time"
        value={dueTime}
        onChange={(e) => setDueTime(e.target.value)}
        className={`bg-muted border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer w-[90px] ${!dueTime ? "border-red-500/40" : "border-border"}`}
        title="Horário do post *"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer"
      >
        <option value="low">Baixa</option>
        <option value="medium">Média</option>
        <option value="high">Alta</option>
        <option value="critical">Urgente</option>
      </select>
      <select
        value={column}
        onChange={(e) => setColumn(e.target.value as ContentCard["status"])}
        className="bg-muted border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none cursor-pointer"
      >
        {CONTENT_COLUMNS.map((col) => (
          <option key={col.id} value={col.id}>{col.title}</option>
        ))}
      </select>
      <button
        onClick={handleCreate}
        disabled={!canCreate}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        {success ? <Check size={13} /> : <Plus size={13} />}
        {success ? "Criado!" : "Criar"}
      </button>
    </div>
  );
}

// ── Add Social Media member modal ─────────────────────────────────────────────

function AddMemberModal({ onAdd, onClose }: { onAdd: (name: string, password: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-lg shadow-2xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <UserPlus size={15} className="text-primary" /> Novo Social Media
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1 uppercase tracking-wider">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1 uppercase tracking-wider">Senha de Acesso</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              onKeyDown={(e) => e.key === "Enter" && name.trim() && password.trim() && (onAdd(name.trim(), password.trim()), onClose())}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost text-xs flex-1">Cancelar</button>
          <button
            onClick={() => { if (name.trim() && password.trim()) { onAdd(name.trim(), password.trim()); onClose(); }}}
            disabled={!name.trim() || !password.trim()}
            className="btn-primary text-xs flex-1 disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Access Tab (Client Credentials) ──────────────────────────────────────────

interface AccessTabProps {
  clients: Client[];
  clientAccess: Record<string, import("@/lib/types").ClientAccess>;
  onSave: (clientId: string, access: Partial<import("@/lib/types").ClientAccess>) => void;
  isAdmin: boolean;
}

function AccessTab({ clients, clientAccess, onSave, isAdmin }: AccessTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  const FIELDS = [
    { key: "instagramLogin", label: "Instagram Login", icon: "📸" },
    { key: "instagramPassword", label: "Instagram Senha", icon: "🔒", isPassword: true },
    { key: "facebookLogin", label: "Facebook Login", icon: "👥" },
    { key: "facebookPassword", label: "Facebook Senha", icon: "🔒", isPassword: true },
    { key: "tiktokLogin", label: "TikTok Login", icon: "🎵" },
    { key: "tiktokPassword", label: "TikTok Senha", icon: "🔒", isPassword: true },
    { key: "mlabsLogin", label: "mLabs Login", icon: "📊" },
    { key: "mlabsPassword", label: "mLabs Senha", icon: "🔒", isPassword: true },
    { key: "canvaLink", label: "Canva Link", icon: "🎨" },
    { key: "driveLink", label: "Drive Link", icon: "📁" },
    { key: "otherNotes", label: "Observações", icon: "📝" },
  ];

  const startEdit = (clientId: string) => {
    const access = clientAccess[clientId] ?? {};
    const data: Record<string, string> = {};
    FIELDS.forEach((f) => {
      data[f.key] = (access as unknown as Record<string, string | undefined>)[f.key] ?? "";
    });
    setFormData(data);
    setEditingId(clientId);
  };

  const handleSave = (clientId: string) => {
    const updates: Record<string, string | undefined> = {};
    FIELDS.forEach((f) => {
      updates[f.key] = formData[f.key] || undefined;
    });
    onSave(clientId, updates);
    setEditingId(null);
    setSaved(clientId);
    setTimeout(() => setSaved(null), 1500);
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Key size={15} className="text-primary" />
        <h3 className="font-semibold text-sm tracking-tight">Acessos dos Clientes</h3>
        <span className="text-xs text-muted-foreground ml-auto">Informações não financeiras · Editável pelo social media</span>
      </div>

      {clients.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">Nenhum cliente ativo neste workspace.</p>
      )}

      {clients.map((client) => {
        const access = clientAccess[client.id];
        const isEditing = editingId === client.id;
        const hasData = access && Object.values(access).some((v) => v && v !== client.id);

        return (
          <div key={client.id} className="card border border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {client.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{client.name}</p>
                <p className="text-xs text-muted-foreground">{client.assignedSocial}</p>
              </div>
              {saved === client.id && (
                <span className="text-xs text-primary font-medium animate-fade-in">Salvo!</span>
              )}
              {!isEditing ? (
                <button
                  onClick={() => startEdit(client.id)}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  {hasData ? "Editar" : "Preencher"} Acessos
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Cancelar</button>
                  <button onClick={() => handleSave(client.id)} className="btn-primary text-xs flex items-center gap-1">
                    <Save size={11} /> Salvar
                  </button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                      {field.icon} {field.label}
                    </label>
                    <div className="relative">
                      <input
                        type={field.isPassword && !showPasswords[field.key] ? "password" : "text"}
                        value={formData[field.key] ?? ""}
                        onChange={(e) => setFormData((p) => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.isPassword ? "••••" : `${field.label}...`}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary pr-8"
                      />
                      {field.isPassword && (
                        <button
                          type="button"
                          onClick={() => setShowPasswords((p) => ({ ...p, [field.key]: !p[field.key] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPasswords[field.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : hasData ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FIELDS.filter((f) => (access as unknown as Record<string, string | undefined>)[f.key]).map((field) => {
                  const val = (access as unknown as Record<string, string | undefined>)[field.key] ?? "";
                  return (
                    <div key={field.key} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                      <span>{field.icon}</span>
                      <span className="text-muted-foreground">{field.label}:</span>
                      <span className="text-foreground font-medium truncate">
                        {field.isPassword ? "••••••" : val}
                      </span>
                    </div>
                  );
                })}
                {access?.updatedBy && (
                  <p className="text-[10px] text-zinc-600 col-span-full mt-1">
                    Atualizado por {access.updatedBy} {access.updatedAt ? `· ${new Date(access.updatedAt).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 text-center py-3 border border-dashed border-[#1a1a22] rounded-lg">
                Nenhum acesso cadastrado ainda. Clique em "Preencher Acessos" para adicionar.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Internal Chat Tab (WhatsApp-style) ──────────────────────────────────────

interface InternalChatTabProps {
  clients: Client[];
  clientChats: Record<string, import("@/lib/types").ChatMessage[]>;
  onSend: (clientId: string, text: string) => void;
}

function InternalChatTab({ clients, clientChats, onSend }: InternalChatTabProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(clients[0]?.id ?? null);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const messages = selectedClientId ? (clientChats[selectedClientId] ?? []) : [];

  const handleSend = () => {
    if (!messageText.trim() || !selectedClientId) return;
    onSend(selectedClientId, messageText.trim());
    setMessageText("");
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={15} className="text-primary" />
        <h3 className="font-semibold text-sm tracking-tight">Chat Interno por Cliente</h3>
        <span className="text-xs text-muted-foreground ml-auto">Centralize a comunicação da equipe aqui</span>
      </div>

      <div className="flex gap-4 h-[500px]">
        {/* Client list sidebar */}
        <div className="w-56 shrink-0 border border-border rounded-xl overflow-hidden flex flex-col bg-card">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Clientes</p>
          </div>
          <div className="flex-1 overflow-auto">
            {clients.map((client) => {
              const chatMsgs = clientChats[client.id] ?? [];
              const lastMsg = chatMsgs[chatMsgs.length - 1];
              const isActive = client.id === selectedClientId;
              return (
                <button
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className={`w-full text-left px-3 py-3 border-b border-border/50 transition-colors ${
                    isActive ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {client.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                        {client.name}
                      </p>
                      {lastMsg ? (
                        <p className="text-[10px] text-zinc-600 truncate mt-0.5">{lastMsg.user}: {lastMsg.text}</p>
                      ) : (
                        <p className="text-[10px] text-zinc-700 mt-0.5">Sem mensagens</p>
                      )}
                    </div>
                    {chatMsgs.length > 0 && (
                      <span className="text-[9px] text-zinc-600 shrink-0">{chatMsgs.length}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 border border-border rounded-xl overflow-hidden flex flex-col bg-card">
          {selectedClient ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {selectedClient.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
                  <p className="text-[10px] text-muted-foreground">{selectedClient.industry} · {selectedClient.assignedSocial}</p>
                </div>
                <span className="text-xs text-muted-foreground ml-auto">{messages.length} mensagem(ns)</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-zinc-600">Nenhuma mensagem ainda. Inicie a conversa sobre este cliente.</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className="flex gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-bold text-primary">
                        {msg.user.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{msg.user}</span>
                        <span className="text-[10px] text-zinc-600">{msg.timestamp}</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Escreva uma mensagem sobre este cliente..."
                    className="flex-1 bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!messageText.trim()}
                    className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione um cliente para iniciar o chat.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kanban By Client ──────────────────────────────────────────────────────────

interface KanbanByClientProps {
  clients: Client[];
  allClients: Client[];
  contentCards: ContentCard[];
  designRequests: import("@/lib/types").DesignRequest[];
  onCardClick: (card: ContentCard) => void;
  onConfirmArt: (card: ContentCard) => void;
  onNonDelivery: (card: ContentCard) => void;
  onMoveCard: (cardId: string, toStatus: string) => void;
  currentUser: string;
  role: string;
}

function KanbanByClient({ clients, allClients, contentCards, designRequests, onCardClick, onConfirmArt, onNonDelivery, onMoveCard, currentUser, role }: KanbanByClientProps) {
  const [activeClientId, setActiveClientId] = useState(clients[0]?.id ?? "");

  const activeClient = allClients.find((c) => c.id === activeClientId);
  const clientCards = contentCards.filter((c) => c.clientId === activeClientId);

  const kanbanCols = CONTENT_COLUMNS.map((col) => ({
    ...col,
    items: clientCards.filter((c) => c.status === col.id),
  }));

  return (
    <div className="space-y-4">
      {/* Client tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {clients.map((client) => {
          const count = contentCards.filter((c) => c.clientId === client.id && c.status !== "published").length;
          const isActive = client.id === activeClientId;
          const overdueCount = contentCards.filter((c) => c.clientId === client.id && c.dueDate && getDeadlineUrgency(c.dueDate) === "overdue" && c.status !== "published" && c.status !== "scheduled").length;
          return (
            <button
              key={client.id}
              onClick={() => setActiveClientId(client.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all shrink-0 ${
                isActive
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-zinc-600"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {client.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
              <div className="text-left">
                <p className="text-xs font-medium leading-tight">{client.name}</p>
                <p className="text-[10px] text-muted-foreground">{count} ativos</p>
              </div>
              {overdueCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 font-medium">{overdueCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Drive button for active client */}
      {activeClient && (
        <DriveButton driveLink={activeClient.driveLink} clientName={activeClient.name} size="md" />
      )}

      {/* Client fixed briefing banner */}
      {activeClient?.fixedBriefing && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Target size={14} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-primary uppercase tracking-wider font-semibold mb-1">Briefing Fixo — {activeClient.name}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{activeClient.fixedBriefing}</p>
          </div>
        </div>
      )}

      {/* Column summary counters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CONTENT_COLUMNS.map((col) => {
          const count = clientCards.filter((c) => c.status === col.id).length;
          return (
            <div key={col.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg shrink-0">
              <span className={`w-2 h-2 rounded-full ${col.color}`} />
              <span className="text-[10px] text-muted-foreground">{col.title}</span>
              <span className="text-xs font-semibold text-foreground">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Kanban board for this client */}
      {clientCards.length > 0 ? (
        <KanbanBoard<ContentCard>
          columns={kanbanCols}
          onMove={(cardId, _from, toStatus) => onMoveCard(cardId, toStatus)}
          renderCard={(card) => {
            const sla = getSlaBadge(card.statusChangedAt);
            return (
              <div
                className={`bg-card border rounded-lg overflow-hidden hover:border-primary/40 transition-colors cursor-pointer group ${
                  sla?.level === "critical" ? "border-red-500/30" : "border-border"
                }`}
                onClick={() => onCardClick(card)}
              >
                {card.imageUrl ? (
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    <img src={card.imageUrl} alt={card.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                ) : (
                  <div className="aspect-video w-full flex items-center justify-center bg-muted text-muted-foreground">
                    <ImageIcon size={20} />
                  </div>
                )}
                <div className="p-3">
                  {card.requestedByTraffic && (
                    <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md border mb-2 text-[#3b6ff5] bg-[#3b6ff5]/10 border-[#3b6ff5]/20">
                      <Zap size={10} />
                      Solicitação Tráfego · {card.requestedByTraffic}
                    </div>
                  )}
                  {sla && (
                    <div className={`flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md border mb-2 ${SLA_STYLES[sla.level]}`}>
                      <Clock size={10} />
                      {sla.label}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="font-medium text-foreground text-xs leading-tight">{card.title}</p>
                    <span className={`badge border text-xs shrink-0 ${getPriorityColor(card.priority)}`}>
                      {getPriorityLabel(card.priority)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{card.format}</span>
                    {card.platform && (
                      <span className="text-xs text-muted-foreground">
                        {card.platform === "instagram" ? "IG" : card.platform === "tiktok" ? "TT" : card.platform === "linkedin" ? "LI" : card.platform === "youtube" ? "YT" : "FB"}
                      </span>
                    )}
                  </div>
                  {/* Date + time */}
                  {card.dueDate && (() => {
                    const urgency = getDeadlineUrgency(card.dueDate);
                    const badge = DEADLINE_BADGE[urgency];
                    return (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar size={10} />
                          {card.dueDate}
                          {card.dueTime && <span className="text-zinc-500 ml-1">{card.dueTime}</span>}
                        </span>
                        {badge && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {/* Art actions */}
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/60 flex-wrap">
                    {card.imageUrl && (
                      <a
                        href={card.imageUrl}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors flex items-center gap-0.5"
                      >
                        <Download size={9} /> Baixar Arte
                      </a>
                    )}
                    {card.designerDeliveredAt && !card.socialConfirmedAt && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onConfirmArt(card); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[#0a34f5]/15 text-[#0a34f5] hover:bg-[#0a34f5]/25 transition-colors flex items-center gap-0.5"
                      >
                        <CheckCircle size={9} /> Confirmar Arte
                      </button>
                    )}
                    {card.socialConfirmedAt && (
                      <span className="text-[10px] text-[#0a34f5] flex items-center gap-0.5">
                        <CheckCircle size={9} /> Confirmado
                      </span>
                    )}
                    {card.nonDeliveryReason ? (
                      <span className="text-[10px] text-red-400 flex items-center gap-0.5" title={card.nonDeliveryReason}>
                        <FileWarning size={9} /> N/Entregue
                      </span>
                    ) : (card.dueDate && getDeadlineUrgency(card.dueDate) === "overdue" && card.status !== "published" && card.status !== "scheduled") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onNonDelivery(card); }}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors flex items-center gap-0.5"
                      >
                        <FileWarning size={9} /> Reportar
                      </button>
                    )}
                  </div>
                  {/* Timesheet indicator — manager/admin only */}
                  {(role === "admin" || role === "manager") && (() => {
                    const timeMs = getLiveTimeSpentMs(card.workStartedAt, card.totalTimeSpentMs);
                    if (timeMs <= 0) return null;
                    const isOvertime = timeMs >= OVERTIME_THRESHOLD_MS;
                    return (
                      <div className={`flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/40 text-[10px] ${isOvertime ? "text-amber-400" : "text-zinc-600"}`}>
                        <span>{isOvertime ? "⚠️" : "⏱️"}</span>
                        <span className={isOvertime ? "font-bold" : ""}>{formatTimeSpent(timeMs)}</span>
                        {isOvertime && <span className="text-[9px] ml-auto font-medium">OVER-TIME</span>}
                      </div>
                    );
                  })()}
                </div>
                <div className={`h-0.5 w-full ${STATUS_DOT[card.status]} ${(() => {
                  const t = getLiveTimeSpentMs(card.workStartedAt, card.totalTimeSpentMs);
                  return t >= OVERTIME_THRESHOLD_MS ? "!bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]" : "";
                })()}`} />
              </div>
            );
          }}
        />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum conteúdo para {activeClient?.name ?? "este cliente"}.</p>
          <p className="text-xs mt-1">Use a barra de criação rápida acima para adicionar.</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SocialPage() {
  const [activeTab, setActiveTab] = useState<"carteira" | "kanban" | "calendar" | "onboarding" | "acessos" | "chat" | "metricas" | "entregas" | "relatorios">("carteira"); // SocialTab — kept inline for readability
  const [adminWorkspace, setAdminWorkspace] = useState("Todos");
  const [selectedCard, setSelectedCard] = useState<ContentCard | null>(null);
  const [nonDeliveryCard, setNonDeliveryCard] = useState<ContentCard | null>(null);
  const [nonDeliveryReason, setNonDeliveryReason] = useState("");
  const [ideasClient, setIdeasClient] = useState<Client | null>(null);
  const [moodClientId, setMoodClientId] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [client360, setClient360] = useState<Client | null>(null);
  const [campaignClient, setCampaignClient] = useState<Client | null>(null);
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [onboardingCompleteClient, setOnboardingCompleteClient] = useState<Client | null>(null);
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<number | null>(null);
  const [newCardDate, setNewCardDate] = useState<string | null>(null);
  const [verifyingCard, setVerifyingCard] = useState<ContentCard | null>(null);
  const [verifyChecks, setVerifyChecks] = useState({ postLive: false, copyCorrect: false });

  const { role, currentUser } = useRole();
  const {
    clients,
    contentCards,
    onboarding,
    moodHistory,
    updateContentCard,
    addMoodEntry,
    updateClientStatus,
    toggleOnboardingItem,
    socialTeam,
    socialAuthUser,
    addSocialTeamMember,
    loginSocial,
    logoutSocial,
    designRequests,
    clientAccess,
    updateClientAccess,
    clientChats,
    sendClientMessage,
    socialReports,
    addSocialReport,
    updateSocialReport,
    contentApprovals,
    approveContent,
    rejectContent,
    monthlyDeliveryReports,
    socialPerformanceScores,
  } = useAppState();

  // ── NavContext: secondary sidebar tab navigation ──────────────
  const { pendingTab, setPendingTab, setCurrentTab } = useNav();
  const VALID_SOCIAL_TABS = ["carteira","kanban","calendar","onboarding","acessos","chat","metricas","entregas","relatorios"] as const;
  type SocialTab = typeof VALID_SOCIAL_TABS[number];

  useEffect(() => {
    if (!pendingTab) return;
    if ((VALID_SOCIAL_TABS as readonly string[]).includes(pendingTab)) {
      setActiveTab(pendingTab as SocialTab);
    }
    setPendingTab("");
  }, [pendingTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auth gate: non-admin must authenticate
  const isAdmin = role === "admin" || role === "manager";
  const isAuthenticated = isAdmin || socialAuthUser !== null;
  const effectiveUser = isAdmin ? null : socialAuthUser;

  if (!isAuthenticated) {
    return <SocialAuthModal />;
  }

  const socialMemberNames = socialTeam.map((m) => m.name);
  const workspace = effectiveUser ?? "Todos";
  const activeWorkspace = isAdmin ? adminWorkspace : effectiveUser!;

  const filteredClients = clients.filter((c) => {
    const matchWorkspace = activeWorkspace === "Todos" ? true : c.assignedSocial === activeWorkspace;
    const matchHealth = healthFilter === "all" ? true : c.status === healthFilter;
    return matchWorkspace && matchHealth;
  });

  const filteredCards = contentCards.filter((c) =>
    activeWorkspace === "Todos" ? true : c.socialMedia === activeWorkspace
  );

  const onboardingClients = filteredClients.filter((c) => c.status === "onboarding");
  const moodClientName = moodClientId ? clients.find((c) => c.id === moodClientId)?.name ?? "" : "";

  // Thermometer counts
  const counts = {
    good: filteredClients.filter((c) => c.status === "good").length,
    average: filteredClients.filter((c) => c.status === "average").length,
    at_risk: filteredClients.filter((c) => c.status === "at_risk").length,
    onboarding: filteredClients.filter((c) => c.status === "onboarding").length,
  };

  const urgentClients = filteredClients.filter((c) => getInactivityLevel(c) === "urgent");

  // Churn risks: angry mood + >=48h inactivity
  const churnRisks = filteredClients.filter((c) => {
    const lastMood = (moodHistory[c.id] ?? [])[0];
    const hasAngry = lastMood?.mood === "angry";
    const isInactive = hoursSince(c.lastKanbanActivity) >= 48;
    return hasAngry && isInactive;
  });

  const handleOnboardingToggle = (clientId: string, itemId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    toggleOnboardingItem(clientId, itemId, currentUser);
    // Check if this toggle completes all items
    const items = onboarding[clientId] ?? [];
    const updatedItems = items.map((it) =>
      it.id === itemId ? { ...it, completed: !it.completed } : it
    );
    const allDone = updatedItems.every((it) => it.completed);
    if (allDone && client.status === "onboarding") {
      setOnboardingCompleteClient(client);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <Header title="Social Media" subtitle="CRM de carteira, kanban e calendário de conteúdo" />

      {/* Confetti overlay */}
      {onboardingCompleteClient && <Confetti />}

      {/* Onboarding Complete Modal */}
      {onboardingCompleteClient && (
        <OnboardingCompleteModal
          client={onboardingCompleteClient}
          onMoveActiveAndIdeas={() => {
            updateClientStatus(onboardingCompleteClient.id, "good", currentUser);
            setIdeasClient(onboardingCompleteClient);
            setOnboardingCompleteClient(null);
          }}
          onMoveActive={() => {
            updateClientStatus(onboardingCompleteClient.id, "good", currentUser);
            setOnboardingCompleteClient(null);
          }}
          onClose={() => setOnboardingCompleteClient(null)}
        />
      )}

      {/* Modals */}
      {selectedCard && <ContentCardModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
      {/* Non-delivery report modal */}
      {nonDeliveryCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setNonDeliveryCard(null); setNonDeliveryReason(""); }}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">Reportar Não Entrega</h3>
              <p className="text-xs text-primary mt-0.5">{nonDeliveryCard.title} — {nonDeliveryCard.clientName}</p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Informe o motivo pelo qual este conteúdo não foi entregue no prazo:</p>
              <textarea
                value={nonDeliveryReason}
                onChange={(e) => setNonDeliveryReason(e.target.value)}
                rows={3}
                placeholder="Ex: Cliente não enviou as fotos, aguardando aprovação do briefing..."
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => { setNonDeliveryCard(null); setNonDeliveryReason(""); }} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={() => {
                  if (!nonDeliveryReason.trim()) return;
                  updateContentCard(nonDeliveryCard.id, {
                    nonDeliveryReason: nonDeliveryReason.trim(),
                    nonDeliveryReportedBy: currentUser,
                    nonDeliveryReportedAt: new Date().toISOString(),
                  });
                  setNonDeliveryCard(null);
                  setNonDeliveryReason("");
                }}
                disabled={!nonDeliveryReason.trim()}
                className="btn-primary flex-1 text-sm disabled:opacity-50"
              >
                Reportar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── PUBLISH VERIFICATION MODAL ── */}
      {verifyingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setVerifyingCard(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Verificação de Publicação</h3>
              </div>
              <p className="text-xs text-primary mt-1">{verifyingCard.title} — {verifyingCard.clientName}</p>
              {verifyingCard.dueDate && <p className="text-[10px] text-muted-foreground mt-0.5">Agendado: {verifyingCard.dueDate} {verifyingCard.dueTime ?? ""}</p>}
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">Confirme que o post foi publicado corretamente:</p>
              {[
                { key: "postLive" as const, label: "Post no Ar", desc: "Verificar se o post aparece no feed/stories da plataforma" },
                { key: "copyCorrect" as const, label: "Copy Correta", desc: "Verificar texto, hashtags, menções e legenda" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setVerifyChecks((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    verifyChecks[item.key]
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/30 hover:border-primary/15"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    verifyChecks[item.key]
                      ? "bg-primary text-white"
                      : "border border-zinc-600 bg-transparent"
                  }`}>
                    {verifyChecks[item.key] && <Check size={12} />}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${verifyChecks[item.key] ? "text-primary" : "text-foreground"}`}>{item.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-5 border-t border-border flex gap-2">
              <button onClick={() => setVerifyingCard(null)} className="btn-ghost flex-1 text-sm">Cancelar</button>
              <button
                onClick={() => {
                  if (!verifyChecks.postLive || !verifyChecks.copyCorrect) return;
                  updateContentCard(verifyingCard.id, {
                    publishVerifiedAt: new Date().toISOString(),
                    publishVerifiedBy: currentUser,
                    publishVerifyChecks: { ...verifyChecks },
                    status: "published",
                    statusChangedAt: new Date().toISOString(),
                  });
                  setVerifyingCard(null);
                }}
                disabled={!verifyChecks.postLive || !verifyChecks.copyCorrect}
                className="btn-primary flex-1 text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <ShieldCheck size={14} />
                Confirmar e Publicar
              </button>
            </div>
          </div>
        </div>
      )}
      {client360 && (
        <Client360Modal
          client={client360}
          onClose={() => setClient360(null)}
          onOpenIdeas={() => { setIdeasClient(client360); setClient360(null); }}
          onOpenCampaign={() => { setCampaignClient(client360); setClient360(null); }}
          onOpenMood={() => { setMoodClientId(client360.id); setClient360(null); }}
        />
      )}
      {campaignClient && <CampaignModal client={campaignClient} onClose={() => setCampaignClient(null)} />}
      {ideasClient && <ContentIdeasModal client={ideasClient} onClose={() => setIdeasClient(null)} />}
      {moodClientId && (
        <MoodModal
          clientName={moodClientName}
          onSave={(mood, note) => addMoodEntry(moodClientId, mood, note, currentUser)}
          onClose={() => setMoodClientId(null)}
        />
      )}
      {showAddMember && (
        <AddMemberModal
          onAdd={(name, password) => addSocialTeamMember(name, password)}
          onClose={() => setShowAddMember(false)}
        />
      )}
      {newCardDate && (
        <NewContentCardModal
          defaultDate={newCardDate}
          onClose={() => setNewCardDate(null)}
        />
      )}

      <div className="p-6 space-y-5 animate-fade-in">

        {/* Workspace header */}
        <div className="flex items-center justify-between gap-3">
          {isAdmin ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Monitorando Workspace de:</span>
              <div className="relative">
                <select
                  value={adminWorkspace}
                  onChange={(e) => setAdminWorkspace(e.target.value)}
                  className="bg-muted border border-border rounded-lg px-4 py-2 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer pr-8"
                >
                  <option value="Todos">Toda a Equipe</option>
                  {socialMemberNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <button
                onClick={() => setShowAddMember(true)}
                className="btn-ghost text-xs flex items-center gap-1.5"
              >
                <UserPlus size={13} />
                Novo Social Media
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-primary/15 text-primary px-3 py-1.5 rounded border border-primary/20 font-medium">
                Logado como: {effectiveUser}
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {(["carteira", "kanban", "calendar", "onboarding", "acessos", "chat", "metricas", "entregas", "relatorios"] as const).map((tab) => {
            const LABELS: Record<typeof tab, string> = {
              carteira: "Carteira", kanban: "Board", calendar: "Calendário",
              onboarding: "Onboarding", acessos: "Acessos", chat: "Chat", metricas: "Métricas",
              entregas: "Entregas", relatorios: "Aprovação & Relatórios",
            };
            // Live badge counts per tab
            const pendingKanban = filteredCards.filter((c) => !["scheduled","published"].includes(c.status)).length;
            const approvalCount = filteredCards.filter((c) => c.status === "approval" || c.status === "client_approval").length;
            const badgeMap: Partial<Record<typeof tab, number>> = {
              carteira:   filteredClients.length,
              kanban:     pendingKanban,
              onboarding: counts.onboarding,
              relatorios: approvalCount,
            };
            const badge = badgeMap[tab];
            const isApprovalTab = tab === "relatorios" && approvalCount > 0;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {LABELS[tab]}
                {badge !== undefined && badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums ${
                    isApprovalTab
                      ? "bg-[#0a34f5]/20 text-[#3b6ff5] shadow-[0_0_8px_rgba(10,52,245,0.3)]"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── CARTEIRA TAB ───────────────────────────────────────────────────── */}
        {activeTab === "carteira" && (
          <div className="space-y-6 animate-fade-in">

            {/* Personal Dashboard — shows for logged social user */}
            {effectiveUser && (
              <PersonalDashboard
                userName={effectiveUser}
                cards={contentCards}
                clients={filteredClients}
                moodHistory={moodHistory}
              />
            )}

            {/* Alerts strip — compact, top of page */}
            {(churnRisks.length > 0 || urgentClients.length > 0) && (
              <div className="flex flex-col gap-2">
                {churnRisks.length > 0 && (
                  <div className="flex items-center gap-3 bg-red-500/5 border border-red-500/15 rounded-lg px-4 py-2.5">
                    <div className="led led-critical" />
                    <p className="text-xs text-zinc-400">
                      <span className="text-red-500 font-semibold">Radar de Churn</span> — {churnRisks.map((c) => c.name).join(", ")}
                    </p>
                  </div>
                )}
                {urgentClients.length > 0 && (
                  <div className="flex items-center gap-3 bg-[#0a0a10] border border-[#1a1a22] rounded-lg px-4 py-2.5">
                    <AlertTriangle size={13} className="text-zinc-500 shrink-0" />
                    <p className="text-xs text-zinc-400">
                      <span className="text-[#c0c0cc] font-medium">{urgentClients.length} cliente(s)</span> sem movimentação há +48h
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Status overview — minimal stat row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { key: "good",       label: "On Fire",    count: counts.good,       led: "led led-healthy" },
                { key: "average",    label: "Atenção",    count: counts.average,    led: "led led-attention" },
                { key: "at_risk",    label: "Crítico",    count: counts.at_risk,    led: "led led-critical" },
                { key: "onboarding", label: "Onboarding", count: counts.onboarding, led: "led led-healthy" },
              ].map((stat) => (
                <button
                  key={stat.key}
                  onClick={() => setHealthFilter(healthFilter === stat.key ? "all" : stat.key)}
                  className={`rounded-xl p-4 border transition-all text-left ${
                    healthFilter === stat.key
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card border-border hover:border-[#1e1e2a]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={stat.led} />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <p className={`text-2xl font-bold tracking-tight ${healthFilter === stat.key ? "text-primary" : "text-foreground"}`}>
                    {stat.count}
                  </p>
                </button>
              ))}
            </div>

            {/* Active filter indicator */}
            {healthFilter !== "all" && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Filtrando por:</span>
                <span className="text-xs text-primary font-medium">{HEALTH_CONFIG[healthFilter]?.label}</span>
                <button
                  onClick={() => setHealthFilter("all")}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors ml-1"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Client cards grid */}
            {filteredClients.length === 0 ? (
              <div className="bg-card border border-border rounded-xl text-center py-16 text-muted-foreground text-sm">
                Nenhum cliente neste workspace.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filteredClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    moodEntries={moodHistory[client.id] ?? []}
                    onboarding={onboarding[client.id] ?? []}
                    onMood={(id) => { setMoodClientId(id); }}
                    onIdeas={(c) => { setIdeasClient(c); }}
                    onOpen360={() => setClient360(client)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── KANBAN TAB ────────────────────────────────────────────────────── */}
        {activeTab === "kanban" && (
          <div className="animate-fade-in">
            {/* ── POST VERIFICATION PANEL ── */}
            {(() => {
              const scheduledCards = filteredCards.filter((c) => c.status === "scheduled" && !c.publishVerifiedAt);
              if (scheduledCards.length === 0) return null;
              return (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 animate-fade-in">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck size={16} className="text-amber-400" />
                    <h3 className="text-sm font-bold text-foreground">Verificação de Publicação</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold">
                      {scheduledCards.length} pendente{scheduledCards.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Posts agendados que precisam de confirmação de que foram ao ar corretamente.</p>
                  <div className="space-y-2">
                    {scheduledCards.map((card) => {
                      const hoursAgo = card.scheduledAt ? Math.round((Date.now() - new Date(card.scheduledAt).getTime()) / 3600000) : 0;
                      const isUrgent = hoursAgo >= 4;
                      const isWarning = hoursAgo >= 2;
                      return (
                        <div key={card.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          isUrgent ? "border-red-500/30 bg-red-500/5 kpi-danger" :
                          isWarning ? "border-amber-500/20 bg-amber-500/5" :
                          "border-border bg-card/50"
                        }`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isUrgent ? "bg-red-500/15" : isWarning ? "bg-amber-500/15" : "bg-primary/10"
                          }`}>
                            <AlertCircle size={14} className={
                              isUrgent ? "text-red-400" : isWarning ? "text-amber-400" : "text-primary"
                            } />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground">{card.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{card.clientName}</span>
                              <span className="text-[10px] text-muted-foreground">· {card.format}</span>
                              {card.platform && <span className="text-[10px] text-muted-foreground">· {card.platform}</span>}
                              {card.dueTime && <span className="text-[10px] text-muted-foreground">· {card.dueTime}</span>}
                              <span className={`text-[10px] font-semibold ${
                                isUrgent ? "text-red-400" : isWarning ? "text-amber-400" : "text-muted-foreground"
                              }`}>
                                · {hoursAgo > 0 ? `há ${hoursAgo}h` : "agora"}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => { setVerifyingCard(card); setVerifyChecks({ postLive: false, copyCorrect: false }); }}
                            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                              isUrgent
                                ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
                                : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                            }`}
                          >
                            <ShieldCheck size={12} />
                            Verificar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <QuickTaskBar clients={filteredClients.length > 0 ? filteredClients : clients} />

            <KanbanByClient
              clients={filteredClients.filter((c) => c.status !== "onboarding")}
              allClients={clients}
              contentCards={filteredCards}
              designRequests={designRequests}
              onCardClick={setSelectedCard}
              onConfirmArt={(card) => updateContentCard(card.id, { socialConfirmedAt: new Date().toISOString(), socialConfirmedBy: currentUser })}
              onNonDelivery={setNonDeliveryCard}
              onMoveCard={(cardId, toStatus) => updateContentCard(cardId, { status: toStatus as ContentCard["status"], statusChangedAt: new Date().toISOString() })}
              currentUser={currentUser}
              role={role}
            />
          </div>
        )}

        {/* ── CALENDAR TAB ──────────────────────────────────────────────────── */}
        {activeTab === "calendar" && (
          <div className="animate-fade-in max-w-lg">
            <CalendarView
              cards={filteredCards}
              onDayClick={(day, dayCards) => {
                setCalendarSelectedDay(day);
                if (dayCards.length === 0) {
                  const ref = new Date();
                  const dateStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  setNewCardDate(dateStr);
                }
              }}
            />
          </div>
        )}

        {/* ── ONBOARDING TAB ────────────────────────────────────────────────── */}
        {activeTab === "onboarding" && (
          <div className="animate-fade-in space-y-4">
            {onboardingClients.length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhum cliente em onboarding neste workspace.</p>
            )}
            {onboardingClients.map((client) => {
              const items = onboarding[client.id] ?? [];
              const done = items.filter((i) => i.completed).length;
              const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
              return (
                <div key={client.id} className="card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                      {client.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{client.name}</p>
                      <p className="text-xs text-muted-foreground">Social: {client.assignedSocial}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-primary">{pct}%</span>
                      <p className="text-xs text-muted-foreground">{done}/{items.length} etapas</p>
                    </div>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>

                  {pct === 100 && (
                    <div className="mb-4 p-3 bg-[#111118] border border-primary/20 rounded-lg text-center">
                      <p className="text-sm font-semibold text-primary">🎉 Onboarding concluído!</p>
                      <p className="text-xs text-primary/70 mt-0.5">Todas as etapas foram finalizadas.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {items.map((item) => (
                      <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => handleOnboardingToggle(client.id, item.id)}
                          className="w-4 h-4 rounded accent-primary mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm transition-colors ${item.completed ? "text-muted-foreground line-through" : "text-foreground group-hover:text-foreground"}`}>
                            {item.label}
                          </span>
                          {item.completed && item.completedBy && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="w-5 h-5 rounded-full bg-[#0a34f5]/15 flex items-center justify-center shrink-0">
                                <span className="text-[8px] font-bold text-[#0a34f5]">
                                  {item.completedBy.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">{item.completedBy}</span>
                              {item.completedAt && <span className="text-[10px] text-zinc-600">· {item.completedAt}</span>}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ACESSOS TAB ──────────────────────────────────────────────────── */}
        {activeTab === "acessos" && (
          <AccessTab
            clients={filteredClients.filter((c) => c.status !== "onboarding")}
            clientAccess={clientAccess}
            onSave={(clientId, access) => updateClientAccess(clientId, access, currentUser)}
            isAdmin={isAdmin}
          />
        )}

        {/* ── CHAT TAB ────────────────────────────────────────────────────────── */}
        {activeTab === "chat" && (
          <InternalChatTab
            clients={filteredClients.filter((c) => c.status !== "onboarding")}
            clientChats={clientChats}
            onSend={(clientId, text) => sendClientMessage(clientId, currentUser, text)}
          />
        )}

        {/* ── MÉTRICAS TAB ──────────────────────────────────────────────────── */}
        {activeTab === "metricas" && (
          <div className="animate-fade-in space-y-6">

            {/* Performance Meters */}
            {(role === "admin" || role === "manager") && socialPerformanceScores.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Target size={15} className="text-primary" />
                  <h3 className="font-semibold text-sm tracking-tight">Avaliação de Performance — Social Media</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {socialPerformanceScores.map((score) => {
                    const meterColor = score.level === "excellent" ? "bg-[#0a34f5]" : score.level === "good" ? "bg-primary" : score.level === "warning" ? "bg-[#3b6ff5]" : "bg-red-500";
                    const meterBg = score.level === "excellent" ? "bg-[#0a34f5]/10 border-[#0a34f5]/20" : score.level === "good" ? "bg-primary/10 border-primary/20" : score.level === "warning" ? "bg-[#0a34f5]/10 border-[#0a34f5]/15" : "bg-red-500/10 border-red-500/20";
                    const levelLabel = score.level === "excellent" ? "Excelente" : score.level === "good" ? "Bom" : score.level === "warning" ? "Atenção" : "Reunião Necessária";
                    const levelColor = score.level === "excellent" ? "text-[#0a34f5]" : score.level === "good" ? "text-primary" : score.level === "warning" ? "text-[#3b6ff5]" : "text-red-500";
                    return (
                      <div key={score.socialMedia} className={`border rounded-xl p-4 ${meterBg}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="font-semibold text-foreground text-sm">{score.socialMedia}</p>
                            <p className="text-xs text-muted-foreground">{score.totalClients} clientes</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${levelColor}`}>{score.overallRate}%</p>
                            <p className={`text-xs font-medium ${levelColor}`}>{levelLabel}</p>
                          </div>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden mb-3">
                          <div className={`h-full rounded-full transition-all ${meterColor}`} style={{ width: `${Math.min(score.overallRate, 100)}%` }} />
                        </div>
                        <div className="space-y-1.5">
                          {score.clientBreakdown.map((cb) => (
                            <div key={cb.clientId} className="flex items-center justify-between text-xs">
                              <span className="text-foreground">{cb.clientName}</span>
                              <span className={cb.rate >= 80 ? "text-[#0a34f5]" : cb.rate >= 70 ? "text-[#3b6ff5]" : "text-red-500"}>
                                {cb.delivered}/{cb.goal} ({cb.rate}%)
                              </span>
                            </div>
                          ))}
                        </div>
                        {score.level === "critical" && (
                          <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                              <AlertTriangle size={12} /> Performance abaixo de 70% — agendar reunião
                            </p>
                          </div>
                        )}
                        {score.level === "warning" && (
                          <div className="mt-3 p-2 bg-[#0a34f5]/10 border border-[#0a34f5]/15 rounded-lg">
                            <p className="text-xs text-[#3b6ff5] font-medium flex items-center gap-1">
                              <AlertTriangle size={12} /> Performance em 70-80% — monitorar
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {(() => {
                const active = filteredCards.filter((c) => c.status !== "published");
                const published = filteredCards.filter((c) => c.status === "published");
                const slaIssues = active.filter((c) => getSlaBadge(c.statusChangedAt) !== null);
                const overdue = active.filter((c) => getDeadlineUrgency(c.dueDate) === "overdue");
                return [
                  { label: "Em andamento", value: active.length, color: "text-primary" },
                  { label: "Publicados", value: published.length, color: "text-primary" },
                  { label: "Gargalos (SLA)", value: slaIssues.length, color: slaIssues.length > 0 ? "text-red-500" : "text-zinc-600" },
                  { label: "Vencidos", value: overdue.length, color: overdue.length > 0 ? "text-red-500" : "text-zinc-600" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{kpi.label}</p>
                    <p className={`text-2xl font-bold tracking-tight ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ));
              })()}
            </div>

            {/* Pipeline Overview */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={15} className="text-primary" />
                <h3 className="font-semibold text-sm tracking-tight">Pipeline de Conteúdo</h3>
                <span className="text-xs text-muted-foreground ml-auto">{filteredCards.length} total</span>
              </div>
              <div className="space-y-2.5">
                {CONTENT_COLUMNS.map((col) => {
                  const count = filteredCards.filter((c) => c.status === col.id).length;
                  const pct = filteredCards.length > 0 ? Math.round((count / filteredCards.length) * 100) : 0;
                  return (
                    <div key={col.id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-foreground">{col.title}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-[#111118] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Posts quota + SLA side by side */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Posts quota per client */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={15} className="text-primary" />
                  <h3 className="font-semibold text-sm tracking-tight">Meta de Posts</h3>
                </div>
                <div className="space-y-3">
                  {filteredClients.filter((c) => c.postsGoal).map((client) => {
                    const postsNow = client.postsThisMonth ?? 0;
                    const goal = client.postsGoal ?? 12;
                    const pct = Math.min(Math.round((postsNow / goal) * 100), 100);
                    return (
                      <div key={client.id}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-foreground font-medium">{client.name}</span>
                          <span className={pct >= 80 ? "text-primary" : "text-zinc-400"}>{postsNow}/{goal}</span>
                        </div>
                        <div className="h-1.5 bg-[#111118] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {filteredClients.filter((c) => c.postsGoal).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum cliente com meta definida.</p>
                  )}
                </div>
              </div>

              {/* SLA Report */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={15} className="text-primary" />
                  <h3 className="font-semibold text-sm tracking-tight">SLA — Cards Parados</h3>
                </div>
                {(() => {
                  const slaCards = filteredCards
                    .filter((c) => c.status !== "published")
                    .map((c) => ({ card: c, sla: getSlaBadge(c.statusChangedAt) }))
                    .filter((x) => x.sla !== null)
                    .sort((a, b) => {
                      if (a.sla!.level === "critical" && b.sla!.level !== "critical") return -1;
                      if (a.sla!.level !== "critical" && b.sla!.level === "critical") return 1;
                      return 0;
                    });
                  if (slaCards.length === 0) {
                    return <p className="text-xs text-zinc-600">Nenhum gargalo no momento.</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {slaCards.map(({ card, sla }) => (
                        <div
                          key={card.id}
                          onClick={() => setSelectedCard(card)}
                          className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 border border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
                        >
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${SLA_STYLES[sla!.level]}`}>
                            {sla!.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground truncate">{card.title}</p>
                            <p className="text-[10px] text-zinc-500">{card.clientName}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Format breakdown */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Hash size={15} className="text-primary" />
                <h3 className="font-semibold text-sm tracking-tight">Distribuição por Formato</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(() => {
                  const formats = [...new Set(filteredCards.map((c) => c.format))];
                  return formats.map((fmt) => {
                    const count = filteredCards.filter((c) => c.format === fmt).length;
                    const pct = filteredCards.length > 0 ? Math.round((count / filteredCards.length) * 100) : 0;
                    return (
                      <div key={fmt} className="bg-muted/50 rounded-xl p-3 border border-border/50">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{fmt}</p>
                        <p className="text-xl font-bold text-foreground tracking-tight">{count}</p>
                        <p className="text-[10px] text-zinc-600">{pct}%</p>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Deadline alerts */}
            {(() => {
              const overdue = filteredCards.filter((c) => getDeadlineUrgency(c.dueDate) === "overdue" && c.status !== "published");
              const dueToday = filteredCards.filter((c) => getDeadlineUrgency(c.dueDate) === "today" && c.status !== "published");
              if (overdue.length === 0 && dueToday.length === 0) return null;
              return (
                <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="text-red-500" />
                    <h3 className="font-semibold text-sm tracking-tight">Alertas de Prazo</h3>
                  </div>
                  {overdue.length > 0 && (
                    <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-lg">
                      <p className="text-xs font-semibold text-red-500 mb-2">Vencidos ({overdue.length})</p>
                      {overdue.map((c) => (
                        <button key={c.id} onClick={() => setSelectedCard(c)} className="block text-xs text-zinc-400 hover:text-foreground text-left mb-1">
                          · {c.title} <span className="text-zinc-600">({c.clientName})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {dueToday.length > 0 && (
                    <div className="p-3 bg-[#0a0a10] border border-[#1a1a22] rounded-lg">
                      <p className="text-xs font-semibold text-zinc-400 mb-2">Vencem hoje ({dueToday.length})</p>
                      {dueToday.map((c) => (
                        <button key={c.id} onClick={() => setSelectedCard(c)} className="block text-xs text-zinc-400 hover:text-foreground text-left mb-1">
                          · {c.title} <span className="text-zinc-600">({c.clientName})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        )}

        {/* ── ENTREGAS TAB ──────────────────────────────────────────────── */}
        {activeTab === "entregas" && (
          <MonthlyDeliveriesTab
            reports={monthlyDeliveryReports}
            performanceScores={socialPerformanceScores}
            workspace={workspace}
          />
        )}

        {/* ── RELATORIOS TAB ─────────────────────────────────────────────── */}
        {activeTab === "relatorios" && (
          <SocialReportsTab
            clients={filteredClients}
            reports={socialReports}
            contentCards={filteredCards}
            onAddReport={addSocialReport}
            onUpdateReport={updateSocialReport}
            currentUser={currentUser}
            contentApprovals={contentApprovals}
            approveContent={approveContent}
            rejectContent={rejectContent}
          />
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SOCIAL REPORTS TAB
// ══════════════════════════════════════════════════════════════

function socialPctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function socialFormatMonth(month: string): string {
  const [y, m] = month.split("-");
  const mNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${mNames[parseInt(m) - 1]}/${y}`;
}

function SocialChg({ value, invert }: { value: number; invert?: boolean }) {
  const isPositive = value > 0;
  const isNeutral = Math.abs(value) < 1;
  const isGood = invert ? !isPositive : isPositive;
  if (isNeutral) return <span className="text-xs text-zinc-500">0%</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isGood ? "text-[#0a34f5]" : "text-red-500"}`}>
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function SocialMBox({ label, value, change }: { label: string; value: string | number; change?: number }) {
  return (
    <div className="bg-[#0c0c12] border border-[#1e1e2a] rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg font-bold text-foreground">{value}</p>
        {change !== undefined && <SocialChg value={change} />}
      </div>
    </div>
  );
}

function socialFmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function SocialReportsTab({
  clients,
  reports,
  contentCards: cards,
  onAddReport,
  onUpdateReport,
  currentUser,
  contentApprovals,
  approveContent: doApprove,
  rejectContent: doReject,
}: {
  clients: Client[];
  reports: SocialMonthlyReport[];
  contentCards: ContentCard[];
  onAddReport: (r: Omit<SocialMonthlyReport, "id" | "createdAt">) => SocialMonthlyReport;
  onUpdateReport: (id: string, updates: Partial<SocialMonthlyReport>) => void;
  currentUser: string;
  contentApprovals: import("@/lib/types").ContentApproval[];
  approveContent: (cardId: string, reviewer: string) => void;
  rejectContent: (cardId: string, reviewer: string, reason: string) => void;
}) {
  const activeClients = clients.filter((c) => c.status !== "onboarding");
  const [selectedClient, setSelectedClient] = useState<string>(activeClients[0]?.id ?? "");
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState<SocialMonthlyReport | null>(null);
  const [rejectCardId, setRejectCardId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const clientReports = useMemo(
    () => reports.filter((r) => r.clientId === selectedClient).sort((a, b) => a.month.localeCompare(b.month)),
    [reports, selectedClient]
  );

  const selectedClientData = clients.find((c) => c.id === selectedClient);

  const comparisons = useMemo(() => {
    return clientReports.map((report, idx) => {
      const prev = idx > 0 ? clientReports[idx - 1] : null;
      return {
        report,
        changes: prev ? {
          postsPublished: socialPctChange(report.postsPublished, prev.postsPublished),
          reach: socialPctChange(report.reach, prev.reach),
          impressions: socialPctChange(report.impressions, prev.impressions),
          engagement: socialPctChange(report.engagement, prev.engagement),
          engagementRate: socialPctChange(report.engagementRate, prev.engagementRate),
          followersGained: socialPctChange(report.followersGained, prev.followersGained),
        } : null,
      };
    });
  }, [clientReports]);

  const latest = comparisons.length > 0 ? comparisons[comparisons.length - 1] : null;

  // Approval queue
  const approvalCards = cards.filter((c) => c.status === "client_approval");
  const getApproval = (cardId: string) => contentApprovals.find((a) => a.cardId === cardId);

  return (
    <div className="animate-fade-in space-y-6">

      {/* Approval Queue */}
      {approvalCards.length > 0 && (
        <div className="bg-card border border-zinc-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Check size={15} className="text-primary" />
            <h3 className="font-semibold text-sm">Aprovações Pendentes</h3>
            <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full">{approvalCards.length}</span>
          </div>
          <div className="space-y-2">
            {approvalCards.map((card) => {
              const approval = getApproval(card.id);
              return (
                <div key={card.id} className="flex items-center gap-3 bg-muted/50 border border-border rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                    <p className="text-xs text-muted-foreground">{card.clientName} · {card.format}</p>
                  </div>
                  {approval?.status === "approved" ? (
                    <span className="text-xs text-[#0a34f5] font-medium">Aprovado</span>
                  ) : approval?.status === "rejected" ? (
                    <span className="text-xs text-red-500 font-medium">Recusado: {approval.reason}</span>
                  ) : rejectCardId === card.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Motivo da recusa..."
                        className="bg-muted rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none w-48"
                        autoFocus
                      />
                      <button
                        onClick={() => { if (rejectReason.trim()) { doReject(card.id, currentUser, rejectReason.trim()); setRejectCardId(null); setRejectReason(""); } }}
                        className="text-xs bg-red-500/20 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-colors"
                      >
                        Confirmar
                      </button>
                      <button onClick={() => { setRejectCardId(null); setRejectReason(""); }} className="text-xs text-muted-foreground hover:text-foreground">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => doApprove(card.id, currentUser)}
                        className="text-xs bg-[#0a34f5]/15 text-[#0a34f5] px-3 py-1.5 rounded-lg hover:bg-[#0a34f5]/30 transition-colors font-medium"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => setRejectCardId(card.id)}
                        className="text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors font-medium"
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Client selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Relatórios de:</span>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 flex-wrap">
          {activeClients.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedClient(c.id); setShowForm(false); setEditingReport(null); }}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                selectedClient === c.id ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <button onClick={() => { setShowForm(!showForm); setEditingReport(null); }} className="bg-primary hover:bg-primary/80 text-foreground px-3 py-1.5 rounded-lg font-medium text-xs transition-colors flex items-center gap-1.5 ml-auto">
          <Plus size={13} /> Novo Relatório
        </button>
      </div>

      {/* New Report Form */}
      {showForm && selectedClientData && (
        <SocialNewReportForm
          client={selectedClientData}
          currentUser={currentUser}
          contentCards={cards}
          onSubmit={(data) => { onAddReport(data); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Edit Report Form */}
      {editingReport && (
        <SocialEditReportForm
          report={editingReport}
          onSave={(updates) => { onUpdateReport(editingReport.id, updates); setEditingReport(null); }}
          onCancel={() => setEditingReport(null)}
        />
      )}

      {/* Latest Month Summary */}
      {latest && !editingReport && (
        <div className="bg-card border border-primary/20 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground">{selectedClientData?.name} — Último Mês</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{socialFormatMonth(latest.report.month)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => exportReportAsPdf({
                  title: "Relatório Mensal de Social Media",
                  clientName: selectedClientData?.name ?? "",
                  period: socialFormatMonth(latest.report.month),
                  createdBy: latest.report.createdBy,
                  createdAt: latest.report.createdAt,
                  sections: [
                    { label: "Posts Publicados", value: `${latest.report.postsPublished}/${latest.report.postsGoal}`, type: "metric" },
                    { label: "Reels", value: latest.report.reelsCount, type: "metric" },
                    { label: "Stories", value: latest.report.storiesCount, type: "metric" },
                    { label: "Alcance", value: latest.report.reach.toLocaleString("pt-BR"), type: "metric" },
                    { label: "Impressões", value: latest.report.impressions.toLocaleString("pt-BR"), type: "metric" },
                    { label: "Engajamento", value: latest.report.engagement.toLocaleString("pt-BR"), type: "metric" },
                    { label: "Taxa de Engajamento", value: `${latest.report.engagementRate.toFixed(1)}%`, type: "metric" },
                    { label: "Novos Seguidores", value: `+${latest.report.followersGained}`, type: "metric" },
                    ...(latest.report.topPost ? [{ label: "Top Post", value: latest.report.topPost, type: "text" as const }] : []),
                    ...(latest.report.observations ? [{ label: "Observações", value: latest.report.observations, type: "text" as const }] : []),
                  ],
                })}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <BarChart2 size={12} /> PDF
              </button>
              <button onClick={() => setEditingReport(latest.report)} className="text-xs text-primary hover:underline">Editar</button>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SocialMBox label="Posts Publicados" value={`${latest.report.postsPublished}/${latest.report.postsGoal}`} change={latest.changes?.postsPublished} />
            <SocialMBox label="Reels" value={latest.report.reelsCount} />
            <SocialMBox label="Stories" value={latest.report.storiesCount} />
            <SocialMBox label="Alcance" value={socialFmtNum(latest.report.reach)} change={latest.changes?.reach} />
            <SocialMBox label="Impressões" value={socialFmtNum(latest.report.impressions)} change={latest.changes?.impressions} />
            <SocialMBox label="Engajamento" value={socialFmtNum(latest.report.engagement)} change={latest.changes?.engagement} />
            <SocialMBox label="Taxa Engaj." value={`${latest.report.engagementRate.toFixed(1)}%`} change={latest.changes?.engagementRate} />
            <SocialMBox label="Novos Seguidores" value={`+${latest.report.followersGained}`} change={latest.changes?.followersGained} />
          </div>
          {latest.report.topPost && (
            <div className="mt-3 flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-2">
              <Sparkles size={13} className="text-primary shrink-0" />
              <span className="text-xs text-muted-foreground">Top post:</span>
              <span className="text-xs text-foreground font-medium">{latest.report.topPost}</span>
            </div>
          )}
          {latest.report.observations && (
            <div className="mt-3 bg-muted border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">Observações</p>
              <p className="text-sm text-foreground leading-relaxed">{latest.report.observations}</p>
            </div>
          )}
        </div>
      )}

      {/* Historical Comparison Table */}
      {comparisons.length > 1 && !editingReport && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={15} className="text-primary" />
            <h3 className="font-semibold text-sm">Evolução Mensal — {selectedClientData?.name}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-3 text-muted-foreground font-medium text-xs">Mês</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Posts</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Alcance</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Var.</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Engaj.</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Var.</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Taxa</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Seguidores</th>
                  <th className="text-right py-2.5 px-3 text-muted-foreground font-medium text-xs">Var.</th>
                  <th className="py-2.5 px-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map(({ report, changes }) => (
                  <tr key={report.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                    <td className="py-3 px-3 font-medium text-foreground">{socialFormatMonth(report.month)}</td>
                    <td className="py-3 px-3 text-right text-foreground">{report.postsPublished}/{report.postsGoal}</td>
                    <td className="py-3 px-3 text-right text-foreground">{socialFmtNum(report.reach)}</td>
                    <td className="py-3 px-3 text-right">{changes ? <SocialChg value={changes.reach} /> : <span className="text-xs text-zinc-600">—</span>}</td>
                    <td className="py-3 px-3 text-right text-foreground">{socialFmtNum(report.engagement)}</td>
                    <td className="py-3 px-3 text-right">{changes ? <SocialChg value={changes.engagement} /> : <span className="text-xs text-zinc-600">—</span>}</td>
                    <td className="py-3 px-3 text-right text-primary font-medium">{report.engagementRate.toFixed(1)}%</td>
                    <td className="py-3 px-3 text-right text-foreground">+{report.followersGained}</td>
                    <td className="py-3 px-3 text-right">{changes ? <SocialChg value={changes.followersGained} /> : <span className="text-xs text-zinc-600">—</span>}</td>
                    <td className="py-3 px-3 text-center"><button onClick={() => setEditingReport(report)} className="text-xs text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all">Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {comparisons.length === 0 && !editingReport && (
        <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
          Nenhum relatório para {selectedClientData?.name}. Clique em &quot;Novo Relatório&quot;.
        </div>
      )}
    </div>
  );
}

// ── Social Report Forms ──────────────────────────────────

function SocialNewReportForm({ client, currentUser, contentCards, onSubmit, onCancel }: {
  client: Client; currentUser: string; contentCards: ContentCard[];
  onSubmit: (data: Omit<SocialMonthlyReport, "id" | "createdAt">) => void; onCancel: () => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  // Auto-populate from content cards
  const clientCards = contentCards.filter((c) => c.clientId === client.id);
  const publishedCount = clientCards.filter((c) => c.status === "published").length;
  const reelsCount = clientCards.filter((c) => c.status === "published" && c.format.toLowerCase().includes("reel")).length;
  const [f, setF] = useState({
    pp: String(publishedCount || ""), pg: String(client.postsGoal ?? 12),
    rc: String(reelsCount || ""), sc: "", re: "", im: "", en: "", er: "", fg: "", fl: "", tp: "", ob: ""
  });
  const u = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const inp = (k: string, label: string, ph?: string) => (
    <div><label className="text-xs text-muted-foreground font-medium">{label}</label>
    <input type="number" value={(f as Record<string,string>)[k]} onChange={(e) => u(k, e.target.value)} placeholder={ph}
      className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
  );
  return (
    <div className="bg-card border border-primary/20 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Novo Relatório — {client.name}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1"><X size={16} /></button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (!f.pp) return; onSubmit({
        clientId: client.id, clientName: client.name, month, createdBy: currentUser,
        postsPublished: +f.pp, postsGoal: +f.pg, reelsCount: +f.rc, storiesCount: +f.sc,
        reach: +f.re, impressions: +f.im, engagement: +f.en, engagementRate: +f.er,
        followersGained: +f.fg, followersLost: +f.fl, topPost: f.tp || undefined, observations: f.ob || undefined,
      }); }} className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="text-xs text-muted-foreground font-medium">Mês *</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
          {inp("pp", "Posts Publicados *", "12")}{inp("pg", "Meta")}{inp("rc", "Reels", "4")}
          {inp("sc", "Stories", "20")}{inp("re", "Alcance", "28000")}{inp("im", "Impressões", "62000")}{inp("en", "Engajamento", "3800")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {inp("er", "Taxa Engaj. (%)", "6.1")}{inp("fg", "Novos Seguidores", "550")}{inp("fl", "Perdidos", "30")}
          <div><label className="text-xs text-muted-foreground font-medium">Top Post</label><input value={f.tp} onChange={(e) => u("tp", e.target.value)} placeholder="Nome do destaque..." className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
        </div>
        <div><label className="text-xs text-muted-foreground font-medium">Observações</label><input value={f.ob} onChange={(e) => u("ob", e.target.value)} placeholder="Notas do mês..." className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-1.5"><Save size={14} /> Salvar</button>
        </div>
      </form>
    </div>
  );
}

function SocialEditReportForm({ report, onSave, onCancel }: {
  report: SocialMonthlyReport; onSave: (u: Partial<SocialMonthlyReport>) => void; onCancel: () => void;
}) {
  const [f, setF] = useState({ pp: String(report.postsPublished), pg: String(report.postsGoal), rc: String(report.reelsCount), sc: String(report.storiesCount), re: String(report.reach), im: String(report.impressions), en: String(report.engagement), er: String(report.engagementRate), fg: String(report.followersGained), fl: String(report.followersLost), tp: report.topPost ?? "", ob: report.observations ?? "" });
  const u = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const inp = (k: string, label: string) => (
    <div><label className="text-xs text-muted-foreground font-medium">{label}</label>
    <input type="number" value={(f as Record<string,string>)[k]} onChange={(e) => u(k, e.target.value)}
      className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
  );
  return (
    <div className="bg-card border border-zinc-500/30 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="font-semibold text-foreground">Editar — {report.clientName}</h3><p className="text-xs text-muted-foreground mt-0.5">{socialFormatMonth(report.month)}</p></div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1"><X size={16} /></button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); onSave({
        postsPublished: +f.pp, postsGoal: +f.pg, reelsCount: +f.rc, storiesCount: +f.sc,
        reach: +f.re, impressions: +f.im, engagement: +f.en, engagementRate: +f.er,
        followersGained: +f.fg, followersLost: +f.fl, topPost: f.tp || undefined, observations: f.ob || undefined,
      }); }} className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="text-xs text-muted-foreground font-medium">Mês</label><div className="w-full mt-1 bg-muted/50 rounded-lg p-2.5 text-sm text-zinc-400">{socialFormatMonth(report.month)}</div></div>
          {inp("pp", "Posts")}{inp("pg", "Meta")}{inp("rc", "Reels")}
          {inp("sc", "Stories")}{inp("re", "Alcance")}{inp("im", "Impressões")}{inp("en", "Engajamento")}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {inp("er", "Taxa (%)")}{inp("fg", "Novos Seg.")}{inp("fl", "Perdidos")}
          <div><label className="text-xs text-muted-foreground font-medium">Top Post</label><input value={f.tp} onChange={(e) => u("tp", e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
        </div>
        <div><label className="text-xs text-muted-foreground font-medium">Observações</label><input value={f.ob} onChange={(e) => u("ob", e.target.value)} className="w-full mt-1 bg-muted rounded-lg p-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" /></div>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">Cancelar</button>
          <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-1.5"><Save size={14} /> Salvar</button>
        </div>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MONTHLY DELIVERIES TAB
// ══════════════════════════════════════════════════════════════

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${names[parseInt(m) - 1]} ${y}`;
}

function MonthlyDeliveriesTab({
  reports,
  performanceScores,
  workspace,
}: {
  reports: MonthlyDeliveryReport[];
  performanceScores: SocialPerformanceScore[];
  workspace: string;
}) {
  const months = [...new Set(reports.map((r) => r.month))].sort().reverse();
  const [selectedMonth, setSelectedMonth] = useState(months[0] ?? "");

  const filteredReports = useMemo(
    () => reports.filter((r) => r.month === selectedMonth && (workspace === "Todos" || r.socialMedia === workspace)),
    [reports, selectedMonth, workspace]
  );

  const filteredScores = useMemo(
    () => performanceScores.filter((s) => workspace === "Todos" || s.socialMedia === workspace),
    [performanceScores, workspace]
  );

  const totalGoal = filteredReports.reduce((s, r) => s + r.postsGoal, 0);
  const totalDelivered = filteredReports.reduce((s, r) => s + r.postsDelivered, 0);
  const overallRate = totalGoal > 0 ? Math.round((totalDelivered / totalGoal) * 100) : 0;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Month Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Mês:</span>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 flex-wrap">
          {months.map((m) => (
            <button key={m} onClick={() => setSelectedMonth(m)}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${selectedMonth === m ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >{formatMonthLabel(m)}</button>
          ))}
        </div>
      </div>

      {/* Performance Score Cards */}
      {filteredScores.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredScores.map((score) => {
            const meterColor = score.level === "excellent" ? "bg-[#0a34f5]" : score.level === "good" ? "bg-primary" : score.level === "warning" ? "bg-[#3b6ff5]" : "bg-red-500";
            const levelColor = score.level === "excellent" ? "text-[#0a34f5]" : score.level === "good" ? "text-primary" : score.level === "warning" ? "text-[#3b6ff5]" : "text-red-500";
            const levelLabel = score.level === "excellent" ? "Excelente" : score.level === "good" ? "Bom" : score.level === "warning" ? "Atenção — Monitorar" : "Crítico — Agendar Reunião";
            return (
              <div key={score.socialMedia} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-foreground">{score.socialMedia}</p>
                  <p className={`text-3xl font-bold ${levelColor}`}>{score.overallRate}%</p>
                </div>
                <p className={`text-xs font-medium mb-3 ${levelColor}`}>{levelLabel}</p>
                <div className="h-4 bg-muted rounded-full overflow-hidden mb-1">
                  <div className={`h-full rounded-full transition-all ${meterColor}`} style={{ width: `${Math.min(score.overallRate, 100)}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">{score.totalPostsDelivered}/{score.totalPostsGoal} posts entregues</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Meta Total</p>
          <p className="text-2xl font-bold text-foreground">{totalGoal}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entregues</p>
          <p className="text-2xl font-bold text-primary">{totalDelivered}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Taxa</p>
          <p className={`text-2xl font-bold ${overallRate >= 80 ? "text-[#0a34f5]" : overallRate >= 70 ? "text-[#3b6ff5]" : "text-red-500"}`}>{overallRate}%</p>
        </div>
      </div>

      {/* Per-client reports */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Entregas por Cliente — {selectedMonth && formatMonthLabel(selectedMonth)}</h3>
        {filteredReports.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground text-sm">Nenhum dado de entregas para este mês.</div>
        )}
        {filteredReports.map((report) => {
          const rateColor = report.completionRate >= 80 ? "text-[#0a34f5]" : report.completionRate >= 70 ? "text-[#3b6ff5]" : "text-red-500";
          const barColor = report.completionRate >= 80 ? "bg-[#0a34f5]" : report.completionRate >= 70 ? "bg-[#3b6ff5]" : "bg-red-500";
          return (
            <div key={report.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-foreground text-sm">{report.clientName}</p>
                  <p className="text-xs text-muted-foreground">Responsável: {report.socialMedia}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${rateColor}`}>{report.completionRate}%</p>
                  <p className="text-xs text-muted-foreground">{report.postsDelivered}/{report.postsGoal} posts</p>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(report.completionRate, 100)}%` }} />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Publicados: <strong className="text-foreground">{report.cardsByStatus.published}</strong></span>
                <span>Agendados: <strong className="text-foreground">{report.cardsByStatus.scheduled}</strong></span>
                <span>Em produção: <strong className="text-foreground">{report.cardsByStatus.inProduction}</strong></span>
                <span>Ideias: <strong className="text-foreground">{report.cardsByStatus.ideas}</strong></span>
              </div>
              {report.formats.length > 0 && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {report.formats.map((f) => (
                    <span key={f.format} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{f.format}: {f.count}</span>
                  ))}
                </div>
              )}
              {report.completionRate < 70 && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-xs text-red-500 font-medium">⚠ Entrega abaixo de 70% — ação necessária</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
