"use client";

import { useMemo } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { calcHealthScore } from "@/lib/utils";
import Link from "next/link";
import { Activity } from "lucide-react";

export default function ClientHealthRadar() {
  const { clients } = useAppState();

  const healthData = useMemo(() => {
    return clients
      .filter((c) => c.status !== "onboarding" && !c.draftStatus)
      .map((c) => ({
        id: c.id,
        name: c.nomeFantasia || c.name,
        score: calcHealthScore(c),
        status: c.status,
        assignedTraffic: c.assignedTraffic,
      }))
      .sort((a, b) => a.score - b.score);
  }, [clients]);

  if (healthData.length === 0) return null;

  const critical = healthData.filter((c) => c.score < 40);
  const warning = healthData.filter((c) => c.score >= 40 && c.score < 70);
  const healthy = healthData.filter((c) => c.score >= 70);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Activity size={14} className="text-primary" /> Radar de Saude
        </h3>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {healthy.length}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {warning.length}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {critical.length}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {healthData.map((c) => {
          const color = c.score >= 70 ? "bg-emerald-500" : c.score >= 40 ? "bg-amber-500" : "bg-red-500";
          const hoverColor = c.score >= 70 ? "hover:bg-emerald-400" : c.score >= 40 ? "hover:bg-amber-400" : "hover:bg-red-400";
          return (
            <Link key={c.id} href={`/clients/${c.id}`} title={`${c.name}: ${c.score}pts`}
              className={`relative group`}>
              <div className={`w-8 h-8 rounded-lg ${color} ${hoverColor} transition-all flex items-center justify-center cursor-pointer`}>
                <span className="text-[9px] font-bold text-white">{c.score}</span>
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-card border border-border text-[10px] text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {c.name}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
