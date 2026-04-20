"use client";

import type { ContentCard } from "@/lib/types";
import { Calendar, Clock } from "lucide-react";

interface Props {
  cards: ContentCard[];
  currentUser: string;
}

export default function PostCounter({ cards, currentUser }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const myCards = cards.filter((c) => c.socialMedia === currentUser);

  const todayPosts = myCards.filter((c) => c.dueDate === today && c.status !== "published");
  const thisWeek = myCards.filter((c) => {
    if (!c.dueDate || c.status === "published") return false;
    const d = new Date(c.dueDate);
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 86400000);
    return d >= now && d <= weekEnd;
  });
  const pendingApproval = myCards.filter((c) => c.status === "approval" || c.status === "client_approval");

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
        <Calendar size={14} className="text-primary" /> Publicacoes
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
          <p className="text-lg font-bold text-primary">{todayPosts.length}</p>
          <p className="text-[10px] text-zinc-500">Hoje</p>
        </div>
        <div className="rounded-lg bg-surface border border-border p-3 text-center">
          <p className="text-lg font-bold text-foreground">{thisWeek.length}</p>
          <p className="text-[10px] text-zinc-500">Esta semana</p>
        </div>
        <div className={`rounded-lg border p-3 text-center ${pendingApproval.length > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-surface border-border"}`}>
          <p className={`text-lg font-bold ${pendingApproval.length > 0 ? "text-amber-400" : "text-foreground"}`}>{pendingApproval.length}</p>
          <p className="text-[10px] text-zinc-500">Aprovacao</p>
        </div>
      </div>
      {todayPosts.length > 0 && (
        <div className="space-y-1">
          {todayPosts.slice(0, 3).map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs py-1">
              <Clock size={10} className="text-primary shrink-0" />
              <span className="text-foreground truncate">{c.title}</span>
              <span className="text-zinc-500 ml-auto shrink-0">{c.clientName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
