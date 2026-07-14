"use client";

// Insights ACIONÁVEIS do dashboard — transforma saúde/produção/IG (que já calculamos) em cards de
// ação. Cada card leva pra tela onde resolver. Design system do app (tokens), tom por severidade.

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";

interface Insight {
  id: string;
  tone: "alerta" | "atencao" | "bom" | "info";
  icon: string;
  titulo: string;
  detalhe: string;
  href: string;
}

const TONE: Record<Insight["tone"], { bar: string; chip: string; label: string }> = {
  alerta:  { bar: "#ef4444", chip: "rgba(239,68,68,0.12)",  label: "Ação" },
  atencao: { bar: "#f59e0b", chip: "rgba(245,158,11,0.12)", label: "Atenção" },
  info:    { bar: "#2b3cff", chip: "rgba(43,60,255,0.14)",  label: "Aviso" },
  bom:     { bar: "#22c55e", chip: "rgba(34,197,94,0.12)",  label: "Bom" },
};

export default function DashboardInsights() {
  const [insights, setInsights] = useState<Insight[] | null>(null);

  useEffect(() => {
    let alive = true;
    authedFetch("/api/dashboard/insights")
      .then((r) => (r.ok ? r.json() : { insights: [] }))
      .then((d) => { if (alive) setInsights(d.insights ?? []); })
      .catch(() => { if (alive) setInsights([]); });
    return () => { alive = false; };
  }, []);

  if (insights === null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
      </div>
    );
  }
  if (insights.length === 0) {
    return (
      <EmptyState icon="✅" title="Tudo sob controle" subtitle="Nenhum alerta agora — o time está em dia." />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {insights.map((it) => {
        const t = TONE[it.tone];
        return (
          <Link
            key={it.id}
            href={it.href}
            className="card-interactive group relative flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 pl-4 hover:border-primary/40"
          >
            <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ background: t.bar }} />
            <span className="text-xl leading-none mt-0.5 shrink-0">{it.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-foreground leading-snug truncate">{it.titulo}</p>
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5"
                  style={{ background: t.chip, color: t.bar }}>{t.label}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{it.detalhe}</p>
            </div>
            <svg className="shrink-0 mt-1 opacity-40 group-hover:opacity-80 transition-opacity" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
          </Link>
        );
      })}
    </div>
  );
}
