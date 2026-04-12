"use client";

import {
  Inbox, CheckCircle, Calendar, TrendingUp, MessageCircle,
  FileText, Users, Palette, Zap, Target, Bell, Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  tasks: CheckCircle,
  calendar: Calendar,
  traffic: TrendingUp,
  chat: MessageCircle,
  content: FileText,
  clients: Users,
  design: Palette,
  automations: Zap,
  goals: Target,
  notifications: Bell,
  search: Search,
};

const PHRASES: Record<string, string> = {
  inbox: "Caixa limpa. Produtividade em alta.",
  tasks: "Nenhuma tarefa pendente. Respire.",
  calendar: "Agenda livre. O silencio antes do hype.",
  traffic: "Nenhuma campanha ativa. Hora de planejar.",
  chat: "Silencio no canal. Todos focados.",
  content: "Sem conteudo na fila. Crie algo incrivel.",
  clients: "Nenhum cliente encontrado.",
  design: "Fila vazia. Criatividade em standby.",
  automations: "Nenhuma regra configurada.",
  goals: "Sem metas definidas. Hora de mirar alto.",
  notifications: "Nenhuma notificacao. Tudo sob controle.",
  search: "Nenhum resultado encontrado.",
};

interface EmptyStateProps {
  type?: keyof typeof ICON_MAP;
  title?: string;
  description?: string;
  compact?: boolean;
}

export default function EmptyState({ type = "inbox", title, description, compact = false }: EmptyStateProps) {
  const Icon = ICON_MAP[type] ?? Inbox;
  const phrase = description ?? PHRASES[type] ?? "Nada por aqui.";

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-6 animate-fade-in">
        <Icon size={20} strokeWidth={1.2} className="text-zinc-800 mb-2" />
        <p className="text-xs text-zinc-600">{phrase}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900/50 flex items-center justify-center mb-4">
        <Icon size={24} strokeWidth={1.2} className="text-zinc-700" />
      </div>
      {title && (
        <p className="text-sm font-medium text-zinc-500 mb-1">{title}</p>
      )}
      <p className="text-xs text-zinc-600 max-w-[240px] text-center leading-relaxed">{phrase}</p>
    </div>
  );
}
