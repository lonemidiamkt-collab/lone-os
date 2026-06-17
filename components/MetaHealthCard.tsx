"use client";

import { useEffect, useState } from "react";
import { getMetaHealth, type MetaHealthData } from "@/lib/actions/metaHealth";

// Cores por status via tokens lone-* (resolvem em claro e escuro).
const STATUS_CONFIG = {
  green:  { dot: "var(--lone-success)", label: "Integração OK",      bg: "var(--lone-success-bg)" },
  yellow: { dot: "var(--lone-warning)", label: "Atenção necessária", bg: "var(--lone-warning-bg)" },
  red:    { dot: "var(--lone-danger)",  label: "Problema detectado",  bg: "var(--lone-danger-bg)" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default function MetaHealthCard() {
  const [data, setData] = useState<MetaHealthData | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMetaHealth().then((d) => { setData(d); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-4 w-32 rounded mb-2 bg-muted" />
        <div className="h-3 w-20 rounded bg-muted" />
      </div>
    );
  }

  if (!data) return null;

  const cfg = STATUS_CONFIG[data.status];
  const days = data.token_status.days_until_expiry;
  const daysLabel = days === null ? "sem data" : days < 0 ? "expirado" : `${days}d restantes`;

  return (
    <>
      <div
        className="rounded-xl border border-border p-4 cursor-pointer hover:opacity-90 transition-opacity"
        style={{ background: cfg.bg }}
        onClick={() => setShowDetails(true)}
        role="button"
        aria-label="Ver detalhes da integração Meta"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Meta API</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: cfg.dot }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Token: <span style={{ color: data.token_status.valid ? "var(--lone-success)" : "var(--lone-danger)" }}>{daysLabel}</span>
          {" · "}
          Último sync: <span className="text-foreground">{fmt(data.last_successful_sync)}</span>
        </p>
      </div>

      {showDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowDetails(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 bg-card border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base text-foreground">Detalhes — Meta API</h2>
              <button onClick={() => setShowDetails(false)} className="text-xs px-3 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-accent">
                Fechar
              </button>
            </div>
            <pre className="text-xs overflow-auto rounded-lg p-4 bg-muted text-foreground" style={{ maxHeight: 360 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
            <p className="text-xs mt-3 text-muted-foreground">Verificado em {fmt(data.checked_at)}</p>
          </div>
        </div>
      )}
    </>
  );
}
