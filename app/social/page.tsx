"use client";

import Header from "@/components/Header";
import KanbanBoard from "@/components/KanbanBoard";
import ContentCardModal from "@/components/ContentCardModal";
import ContentIdeasModal from "@/components/ContentIdeasModal";
import Client360Modal from "@/components/Client360Modal";
import CampaignModal from "@/components/CampaignModal";
import type { ContentCard, Client, MoodType } from "@/lib/types";
import { getPriorityColor, getPriorityLabel } from "@/lib/utils";
import {
  AlertTriangle, Calendar, Instagram, ImageIcon,
  Smile, UserPlus, X, ExternalLink,
  Sparkles, Clock, Target,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useRole } from "@/lib/context/RoleContext";
import { useAppState } from "@/lib/context/AppStateContext";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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

// ── Config ────────────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  good:       { label: "On Fire",   icon: "🟢", color: "text-green-400",  bg: "bg-green-500/15",  border: "border-green-500/30" },
  average:    { label: "Atenção",   icon: "🟡", color: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/30" },
  at_risk:    { label: "Crítico",   icon: "🔴", color: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/30" },
  onboarding: { label: "Onboarding",icon: "🆕", color: "text-blue-400",   bg: "bg-blue-500/15",   border: "border-blue-500/30" },
};

const MOOD_CONFIG = {
  happy:   { emoji: "😄", label: "Satisfeito", color: "text-green-400" },
  neutral: { emoji: "😐", label: "Neutro",     color: "text-yellow-400" },
  angry:   { emoji: "😠", label: "Irritado",   color: "text-red-400" },
};

const TONE_LABELS: Record<string, string> = {
  formal: "Formal", funny: "Engraçado", authoritative: "Autoritário", casual: "Casual",
};

const CONTENT_COLUMNS = [
  { id: "ideas",          title: "Ideias",             color: "bg-gray-400" },
  { id: "script",         title: "Roteiro",            color: "bg-purple-400" },
  { id: "in_production",  title: "Em Produção",        color: "bg-blue-400" },
  { id: "approval",       title: "Aprovação Interna",  color: "bg-yellow-400" },
  { id: "client_approval",title: "Aprovação Cliente",  color: "bg-orange-400" },
  { id: "scheduled",      title: "Agendado",           color: "bg-teal-400" },
  { id: "published",      title: "Publicado",          color: "bg-green-400" },
];

const STATUS_DOT: Record<ContentCard["status"], string> = {
  ideas: "bg-gray-400",
  script: "bg-purple-400",
  in_production: "bg-blue-400",
  approval: "bg-yellow-400",
  client_approval: "bg-orange-400",
  scheduled: "bg-teal-400",
  published: "bg-green-400",
};

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ── Confetti ──────────────────────────────────────────────────────────────────

function Confetti() {
  const items = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      left: `${(i * 2.5) % 100}%`,
      top: `-${(i * 0.5) % 20}%`,
      color: ["#7C3AED", "#A78BFA", "#F59E0B", "#10B981", "#3B82F6", "#EF4444"][i % 6],
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
  const postsColor = postsPct >= 80 ? "bg-green-400" : postsPct >= 50 ? "bg-yellow-400" : "bg-red-400";

  const obItems = onboarding ?? [];
  const obDone = obItems.filter((i) => i.completed).length;
  const obPct = obItems.length > 0 ? Math.round((obDone / obItems.length) * 100) : 0;

  const hoursAgo = hoursSince(client.lastKanbanActivity);
  const activityLabel = hoursAgo < 1 ? "agora mesmo" : hoursAgo < 24 ? `${Math.floor(hoursAgo)}h atrás` : `${Math.floor(hoursAgo / 24)}d atrás`;

  const today = new Date().getDate();
  const isUpsellOpportunity = postsPct >= 100 && today <= 20;

  return (
    <div className={`card border-l-4 hover:border-primary/40 transition-all ${
      client.status === "at_risk" ? "border-l-red-500" :
      client.status === "onboarding" ? "border-l-blue-500" :
      client.status === "average" ? "border-l-yellow-500" : "border-l-green-500"
    }`}>
      <div onClick={onOpen360} className="cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${health.bg} ${health.color} ${health.border}`}>
                {health.icon} {health.label}
              </span>
              {inactivity === "urgent" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 animate-pulse font-medium">
                  ⚠ Urgente
                </span>
              )}
              {inactivity === "warning" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-accent-foreground/20 font-medium">
                  ⏱ Atenção
                </span>
              )}
            </div>
            <h3 className="font-semibold text-foreground text-sm">{client.name}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{client.industry}</span>
              {client.instagramUser && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-pink-400">{client.instagramUser}</span>
                </>
              )}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {client.name[0]}
          </div>
        </div>

        {/* Posts this month */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Posts do mês</span>
            <span className={postsPct >= 80 ? "text-green-400" : postsPct >= 50 ? "text-yellow-400" : "text-red-400"}>
              {postsNow}/{postsGoal}
            </span>
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${postsColor}`} style={{ width: `${postsPct}%` }} />
          </div>
          {isUpsellOpportunity && (
            <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg bg-yellow-500/15 border border-yellow-500/30">
              <span className="text-xs">⭐</span>
              <span className="text-xs font-medium text-yellow-400">Oportunidade de Upgrade</span>
              <span className="text-xs text-yellow-400/70">· Meta atingida antes do dia 20</span>
            </div>
          )}
        </div>

        {/* Onboarding progress (only if onboarding) */}
        {client.status === "onboarding" && obItems.length > 0 && (
          <div className="mb-3 p-2.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-blue-400">Onboarding</span>
              <span className="text-blue-400 font-medium">{obPct}%</span>
            </div>
            <div className="h-1.5 bg-blue-500/20 rounded-full overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${obPct}%` }} />
            </div>
            <p className="text-xs text-blue-400/70 mt-1">{obDone}/{obItems.length} etapas concluídas</p>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between pt-2.5 border-t border-border/60">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {mood ? (
            <span title={`Último humor: ${mood.label}`}>
              {mood.emoji} <span className={mood.color}>{mood.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/50">Sem check-in</span>
          )}
          <span className="flex items-center gap-1 text-muted-foreground/60">
            <Clock size={10} />
            {activityLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onIdeas(client)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
            title="Gerar ideias de conteúdo"
          >
            <Sparkles size={13} />
          </button>
          <button
            onClick={() => onMood(client.id)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Registrar humor do cliente"
          >
            <Smile size={13} />
          </button>
          <Link
            href={`/clients/${client.id}`}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Ver perfil completo"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
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

  const selectedClient = clients.find((c) => c.id === clientId);

  const handleSubmit = () => {
    if (!title.trim() || !clientId) return;
    addContentCard({
      title: title.trim(),
      clientId,
      clientName: selectedClient?.name ?? "",
      socialMedia: role === "social" ? currentUser : (selectedClient?.assignedSocial ?? currentUser),
      status: "ideas",
      priority,
      format,
      dueDate: dueDate || undefined,
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
            <p className="text-xs text-muted-foreground">📅 Data: {defaultDate}</p>
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
              <Label className="mb-1.5 block">Prioridade</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ContentCard["priority"])}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Urgente</option>
              </select>
            </div>
          </div>

          {/* Due date */}
          <div>
            <Label className="mb-1.5 block">Data de Postagem</Label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !clientId}>
            Criar Conteúdo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Social Media member modal ─────────────────────────────────────────────

function AddMemberModal({ onAdd, onClose }: { onAdd: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <UserPlus size={15} className="text-primary" /> Novo Social Media
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome completo (ex: Juliana Ferreira)"
          className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-primary mb-4"
          onKeyDown={(e) => e.key === "Enter" && name.trim() && (onAdd(name.trim()), onClose())}
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost text-xs flex-1">Cancelar</button>
          <button
            onClick={() => { if (name.trim()) { onAdd(name.trim()); onClose(); }}}
            disabled={!name.trim()}
            className="btn-primary text-xs flex-1 disabled:opacity-40"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SocialPage() {
  const [activeTab, setActiveTab] = useState<"carteira" | "kanban" | "calendar" | "onboarding">("carteira");
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
  } = useAppState();

  const [socialMembers, setSocialMembers] = useState(["Todos", "Carlos Melo", "Mariana Costa"]);
  const defaultWorkspace = role === "social" && socialMembers.includes(currentUser) ? currentUser : "Todos";
  const [workspace, setWorkspace] = useState(defaultWorkspace);

  const [selectedCard, setSelectedCard] = useState<ContentCard | null>(null);
  const [ideasClient, setIdeasClient] = useState<Client | null>(null);
  const [moodClientId, setMoodClientId] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [client360, setClient360] = useState<Client | null>(null);
  const [campaignClient, setCampaignClient] = useState<Client | null>(null);
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [socialFilter, setSocialFilter] = useState<string>("all");
  const [designerView, setDesignerView] = useState(false);
  const [onboardingCompleteClient, setOnboardingCompleteClient] = useState<Client | null>(null);
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<number | null>(null);
  const [newCardDate, setNewCardDate] = useState<string | null>(null);

  const filteredClients = clients.filter((c) => {
    const matchWorkspace = workspace === "Todos" ? true : c.assignedSocial === workspace;
    const matchHealth = healthFilter === "all" ? true : c.status === healthFilter;
    const matchSocial = socialFilter === "all" ? true : c.assignedSocial === socialFilter;
    return matchWorkspace && matchHealth && matchSocial;
  });

  const filteredCards = contentCards.filter((c) =>
    workspace === "Todos" ? true : c.socialMedia === workspace
  );

  const kanbanCols = CONTENT_COLUMNS.map((col) => ({
    ...col,
    items: filteredCards.filter((c) => c.status === col.id),
  }));

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
          onAdd={(name) => setSocialMembers((prev) => [...prev, name])}
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

        {/* Team filter + Add member */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Instagram size={15} className="text-pink-400" />
            <span className="text-sm text-muted-foreground font-medium">Workspace:</span>
            <div className="flex gap-1 flex-wrap">
              {socialMembers.map((member) => (
                <button
                  key={member}
                  onClick={() => setWorkspace(member)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    workspace === member
                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {member === "Todos" ? "Toda a equipe" : member}
                </button>
              ))}
            </div>
          </div>
          {(role === "admin" || role === "manager") && (
            <button
              onClick={() => setShowAddMember(true)}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <UserPlus size={13} />
              Novo Social Media
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {(["carteira", "kanban", "calendar", "onboarding"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "carteira" ? "Carteira" : tab === "kanban" ? "Kanban" : tab === "calendar" ? "Calendário" : "Onboarding"}
              {tab === "carteira" && filteredClients.length > 0 && (
                <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{filteredClients.length}</span>
              )}
              {tab === "onboarding" && counts.onboarding > 0 && (
                <span className="ml-1.5 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{counts.onboarding}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── CARTEIRA TAB ───────────────────────────────────────────────────── */}
        {activeTab === "carteira" && (
          <div className="space-y-5 animate-fade-in">

            {/* Radar de Churn */}
            {churnRisks.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
                <Target size={16} className="text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    ⚡ Radar de Churn — Intervenção Urgente
                  </p>
                  <p className="text-xs text-destructive/70 mt-0.5">
                    {churnRisks.map((c) => c.name).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* CEO Thermometer */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { key: "good",       label: "On Fire",    icon: "🟢", count: counts.good,       color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20" },
                { key: "average",    label: "Atenção",    icon: "🟡", count: counts.average,    color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
                { key: "at_risk",    label: "Crítico",    icon: "🔴", count: counts.at_risk,    color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20" },
                { key: "onboarding", label: "Onboarding", icon: "🆕", count: counts.onboarding, color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
              ].map((stat) => (
                <div key={stat.key} className={`rounded-xl p-4 border ${stat.bg} ${stat.border}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span>{stat.icon}</span>
                    <span className="text-xs text-muted-foreground">{stat.label}</span>
                  </div>
                  <p className={`text-3xl font-bold ${stat.color}`}>{stat.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">clientes</p>
                </div>
              ))}
            </div>

            {/* Health filter buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtrar:</span>
              {[
                { key: "all",       label: "Todos",        color: "text-muted-foreground",  active: "bg-muted text-foreground" },
                { key: "good",      label: "🟢 On Fire",   color: "text-green-400",         active: "bg-green-500/20 border-green-500/30 text-green-300" },
                { key: "average",   label: "🟡 Atenção",   color: "text-yellow-400",        active: "bg-yellow-500/20 border-yellow-500/30 text-yellow-300" },
                { key: "at_risk",   label: "🔴 Crítico",   color: "text-red-400",           active: "bg-red-500/20 border-red-500/30 text-red-300" },
                { key: "onboarding",label: "🆕 Onboarding",color: "text-blue-400",          active: "bg-blue-500/20 border-blue-500/30 text-blue-300" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setHealthFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    healthFilter === f.key
                      ? `${f.active} border-current`
                      : `text-muted-foreground border-transparent hover:text-foreground hover:bg-muted`
                  }`}
                >
                  {f.label}
                  {f.key !== "all" && (
                    <span className="ml-1 text-muted-foreground/60">
                      ({counts[f.key as keyof typeof counts] ?? 0})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Social member sub-filter (only when workspace === "Todos") */}
            {workspace === "Todos" && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Filtrar por Social:</span>
                {["all", ...socialMembers.filter((m) => m !== "Todos")].map((member) => (
                  <button
                    key={member}
                    onClick={() => setSocialFilter(member)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      socialFilter === member
                        ? "bg-pink-500/20 border-pink-500/30 text-pink-300"
                        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {member === "all" ? "Todos" : member}
                  </button>
                ))}
              </div>
            )}

            {/* Inactivity urgent banner */}
            {urgentClients.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                <AlertTriangle size={16} className="text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">
                    {urgentClients.length} cliente(s) sem movimentação há mais de 48h
                  </p>
                  <p className="text-xs text-destructive/70 mt-0.5">
                    {urgentClients.map((c) => c.name).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Client cards grid */}
            {filteredClients.length === 0 ? (
              <div className="card text-center py-12 text-muted-foreground">Nenhum cliente neste workspace.</div>
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
            <div className="flex items-center justify-between mb-4">
              <p className="text-muted-foreground text-sm">Clique em um card para ver briefing, arte e observações.</p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{filteredCards.length} conteúdo(s)</span>
                <button
                  onClick={() => setDesignerView((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    designerView
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  Visão do Designer
                </button>
              </div>
            </div>

            {designerView ? (
              <div className="space-y-2">
                {[...filteredCards]
                  .sort((a, b) => {
                    if (!a.dueDate) return 1;
                    if (!b.dueDate) return -1;
                    return a.dueDate.localeCompare(b.dueDate);
                  })
                  .map((card) => (
                    <div
                      key={card.id}
                      className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 cursor-pointer transition-colors"
                      onClick={() => setSelectedCard(card)}
                    >
                      <span className={`w-3 h-3 rounded-full shrink-0 ${STATUS_DOT[card.status]}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
                        <p className="text-xs text-primary">{card.clientName}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span className="bg-muted px-2 py-0.5 rounded-full">{card.format}</span>
                        {card.dueDate ? (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {card.dueDate}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">Sem data</span>
                        )}
                      </div>
                      <span className={`badge border text-xs ${getPriorityColor(card.priority)}`}>
                        {getPriorityLabel(card.priority)}
                      </span>
                    </div>
                  ))
                }
                {filteredCards.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-8">Nenhum conteúdo neste workspace.</p>
                )}
              </div>
            ) : (
              <KanbanBoard<ContentCard>
                columns={kanbanCols}
                onMove={(cardId, _from, toStatus) =>
                  updateContentCard(cardId, { status: toStatus as ContentCard["status"] })
                }
                renderCard={(card) => (
                  <div
                    className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors cursor-pointer group"
                    onClick={() => setSelectedCard(card)}
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
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-medium text-foreground text-xs leading-tight">{card.title}</p>
                        <span className={`badge border text-xs shrink-0 ${getPriorityColor(card.priority)}`}>
                          {getPriorityLabel(card.priority)}
                        </span>
                      </div>
                      <p className="text-xs text-primary mb-2">{card.clientName}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{card.format}</span>
                      </div>
                      {card.dueDate && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/60">
                          <span className="text-xs text-muted-foreground">📅 {card.dueDate}</span>
                        </div>
                      )}
                    </div>
                    <div className={`h-0.5 w-full ${STATUS_DOT[card.status]}`} />
                  </div>
                )}
              />
            )}
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
                    <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center text-sm font-bold text-blue-400">
                      {client.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{client.name}</p>
                      <p className="text-xs text-muted-foreground">Social: {client.assignedSocial}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-blue-400">{pct}%</span>
                      <p className="text-xs text-muted-foreground">{done}/{items.length} etapas</p>
                    </div>
                  </div>
                  <div className="h-2 bg-border rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>

                  {pct === 100 && (
                    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                      <p className="text-sm font-semibold text-green-400">🎉 Onboarding concluído!</p>
                      <p className="text-xs text-green-400/70 mt-0.5">Todas as etapas foram finalizadas.</p>
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
                            <p className="text-xs text-muted-foreground/60 mt-0.5">
                              Concluído por {item.completedBy}
                              {item.completedAt ? ` · ${item.completedAt}` : ""}
                            </p>
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
      </div>
    </div>
  );
}
