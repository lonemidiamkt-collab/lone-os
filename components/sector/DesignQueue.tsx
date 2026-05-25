"use client";

import type { DesignRequest } from "@/lib/types";
import { Palette, Clock, AlertTriangle } from "lucide-react";

interface Props {
  requests: DesignRequest[];
  currentUser: string;
}

export default function DesignQueue({ requests, currentUser }: Props) {
  const queued = requests
    .filter((r) => r.status === "queued")
    .sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      return 1;
    });

  const inProgress = requests.filter((r) => r.status === "in_progress");

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Palette size={14} className="text-primary" /> Fila de Prioridade
        </h3>
        <span className="text-[10px] text-muted-foreground">{queued.length} na fila · {inProgress.length} em andamento</span>
      </div>

      {queued.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-4">Fila vazia</p>
      ) : (
        <div className="space-y-1">
          {queued.slice(0, 6).map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors">
              <span className="text-[10px] text-zinc-600 w-4 text-center font-mono">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{r.title}</p>
                <p className="text-[10px] text-zinc-500">{r.clientName} · {r.format}</p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                r.priority === "critical" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                r.priority === "high" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
              }`}>{r.priority}</span>
              {r.deadline && (
                <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                  <Clock size={8} /> {r.deadline}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
