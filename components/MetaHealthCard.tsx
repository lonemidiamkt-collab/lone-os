"use client";

import { useEffect, useState } from "react";
import { getMetaHealth, type MetaHealthData } from "@/lib/actions/metaHealth";

const STATUS_CONFIG = {
  green:  { dot: "#22c55e", label: "Integração OK",         bg: "#052e16" },
  yellow: { dot: "#eab308", label: "Atenção necessária",     bg: "#1c1506" },
  red:    { dot: "#ef4444", label: "Problema detectado",     bg: "#1c0505" },
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
      <div className="rounded-xl border p-4 animate-pulse" style={{ borderColor: "#1E1E2A", background: "#16161D" }}>
        <div className="h-4 w-32 rounded mb-2" style={{ background: "#1E1E2A" }} />
        <div className="h-3 w-20 rounded" style={{ background: "#1E1E2A" }} />
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
        className="rounded-xl border p-4 cursor-pointer hover:opacity-90 transition-opacity"
        style={{ borderColor: "#1E1E2A", background: cfg.bg }}
        onClick={() => setShowDetails(true)}
        role="button"
        aria-label="Ver detalhes da integração Meta"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: "#9CA3AF" }}>Meta API</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: cfg.dot }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
            {cfg.label}
          </span>
        </div>
        <p className="text-xs" style={{ color: "#6B7280" }}>
          Token: <span style={{ color: data.token_status.valid ? "#22c55e" : "#ef4444" }}>{daysLabel}</span>
          {" · "}
          Último sync: <span style={{ color: "#D1D5DB" }}>{fmt(data.last_successful_sync)}</span>
        </p>
      </div>

      {showDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowDetails(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "#16161D", border: "1px solid #1E1E2A" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-base">Detalhes — Meta API</h2>
              <button onClick={() => setShowDetails(false)} className="text-xs px-3 py-1 rounded-lg" style={{ background: "#1E1E2A", color: "#9CA3AF" }}>
                Fechar
              </button>
            </div>
            <pre className="text-xs overflow-auto rounded-lg p-4" style={{ background: "#0f0f1a", color: "#a8d8a8", maxHeight: 360 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
            <p className="text-xs mt-3" style={{ color: "#6B7280" }}>Verificado em {fmt(data.checked_at)}</p>
          </div>
        </div>
      )}
    </>
  );
}
