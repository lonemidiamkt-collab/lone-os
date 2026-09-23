"use client";

// Insights ACIONÁVEIS do dashboard — transforma saúde/produção/IG (que já calculamos) em cards de
// ação. Cada card leva pra tela onde resolver. Design system do app (tokens), tom por severidade.

import { useEffect, useState } from "react";
import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { cn } from "@/lib/utils";
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
  alerta:  { bar: "bg-lone-danger",  chip: "bg-lone-danger-bg text-lone-danger",   label: "Ação" },
  atencao: { bar: "bg-lone-warning", chip: "bg-lone-warning-bg text-lone-warning", label: "Atenção" },
  info:    { bar: "bg-lone-info",    chip: "bg-lone-info-bg text-lone-info",       label: "Aviso" },
  bom:     { bar: "bg-lone-success", chip: "bg-lone-success-bg text-lone-success", label: "Bom" },
};

// Mesma curva do resto do app; stagger com teto pra lista longa não atrasar a leitura.
const EASE = [0.16, 1, 0.3, 1] as const;

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
    <MotionConfig reducedMotion="user">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {insights.map((it, i) => {
          const t = TONE[it.tone];
          return (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i, 6) * 0.04, ease: EASE }}
            >
              <Link
                href={it.href}
                className="card-interactive group relative flex h-full items-start gap-3 rounded-xl border border-border bg-card p-3.5 pl-4 hover:border-primary/40"
              >
                <span className={cn("absolute left-0 top-2 bottom-2 w-1 rounded-full", t.bar)} />
                <span className="text-xl leading-none mt-0.5 shrink-0">{it.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-foreground leading-snug truncate">{it.titulo}</p>
                    <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5", t.chip)}>
                      {t.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{it.detalhe}</p>
                </div>
                <svg className="shrink-0 mt-1 opacity-40 group-hover:opacity-80 transition-opacity" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </MotionConfig>
  );
}
