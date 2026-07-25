"use client";

import { useMemo } from "react";
import { useClientsStore } from "@/stores/useClientsStore";
import { calcHealthScore } from "@/lib/utils";
import Link from "next/link";
import { Activity } from "lucide-react";

export default function ClientHealthRadar() {
  const clients = useClientsStore((s) => s.clients);

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

  const total = healthData.length;
  const pct = (n: number) => `${(n / total) * 100}%`;
  // Só quem precisa de atenção vira chip (risco primeiro, depois atenção); os saudáveis não viram ruído.
  const foco = [...critical, ...warning];

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Activity size={14} className="text-primary" /> Radar de Saúde
        </h3>
        <span className="text-[11px] text-muted-foreground">{total} clientes</span>
      </div>

      {/* Barra proporcional (verde/âmbar/vermelho) */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {healthy.length > 0 && <div className="bg-lone-success" style={{ width: pct(healthy.length) }} />}
        {warning.length > 0 && <div className="bg-lone-warning" style={{ width: pct(warning.length) }} />}
        {critical.length > 0 && <div className="bg-lone-danger" style={{ width: pct(critical.length) }} />}
      </div>

      {/* Resumo */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lone-success" /><strong className="text-foreground">{healthy.length}</strong> <span className="text-muted-foreground">saudáveis</span></span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lone-warning" /><strong className="text-foreground">{warning.length}</strong> <span className="text-muted-foreground">atenção</span></span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-lone-danger" /><strong className="text-foreground">{critical.length}</strong> <span className="text-muted-foreground">risco</span></span>
      </div>

      {/* Chips só dos que precisam de olhar */}
      {foco.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {foco.slice(0, 12).map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} title={`${c.name}: ${c.score}pts`}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors hover:bg-muted/50 ${
                c.score < 40 ? "border-lone-danger-border bg-lone-danger-bg" : "border-lone-warning-border bg-lone-warning-bg"
              }`}>
              <span className={`font-bold ${c.score < 40 ? "text-lone-danger" : "text-lone-warning"}`}>{c.score}</span>
              <span className="truncate max-w-[130px] text-foreground">{c.name}</span>
            </Link>
          ))}
          {foco.length > 12 && <span className="self-center text-[11px] text-muted-foreground">+{foco.length - 12}</span>}
        </div>
      )}
    </div>
  );
}
