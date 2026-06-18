"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, ChevronRight } from "lucide-react";

interface Summary {
  unack_total: number;
  unack_critical: number;
  unack_high: number;
  unack_medium: number;
}

export default function DefesaAlertBanner() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/defense/alerts?status=unack");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSummary(data.summary ?? null);
      } catch { /* silent */ }
    }
    load();
    const t = setInterval(load, 60_000); // refresh 1min
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!summary || summary.unack_total === 0) return null;

  const hasCritical = summary.unack_critical > 0;
  const bgClass = hasCritical ? "bg-destructive/10 border-destructive/30" : "bg-lone-warning-bg border-lone-warning-border";
  const textClass = hasCritical ? "text-destructive" : "text-lone-warning";

  return (
    <Link
      href="/defesa"
      className={`block rounded-xl border ${bgClass} p-3 hover:brightness-110 transition-all`}
    >
      <div className="flex items-center gap-3">
        <ShieldAlert size={18} className={`${textClass} shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className={`${textClass} font-semibold text-sm`}>
            Defesa Ativa: {summary.unack_total} {summary.unack_total === 1 ? "alerta ativo" : "alertas ativos"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {summary.unack_critical > 0 && <span className="text-destructive">{summary.unack_critical} crítico{summary.unack_critical > 1 ? "s" : ""}</span>}
            {summary.unack_critical > 0 && summary.unack_high > 0 && " · "}
            {summary.unack_high > 0 && <span className="text-lone-warning">{summary.unack_high} alto{summary.unack_high > 1 ? "s" : ""}</span>}
          </p>
        </div>
        <ChevronRight size={16} className={textClass} />
      </div>
    </Link>
  );
}
