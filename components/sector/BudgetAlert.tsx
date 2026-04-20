"use client";

import type { Client } from "@/lib/types";
import { AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";

interface Props {
  clients: Client[];
}

export default function BudgetAlert({ clients }: Props) {
  const today = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayPct = Math.round((today / daysInMonth) * 100);

  const alerts = clients
    .filter((c) => c.monthlyBudget > 0 && c.status !== "onboarding")
    .map((c) => {
      const threshold = c.budgetAlertPct || 90;
      const estimatedSpendPct = dayPct;
      const isOverpacing = estimatedSpendPct > threshold && today >= 10 && today < 25;
      return { client: c, threshold, dayPct: estimatedSpendPct, isOverpacing };
    })
    .filter((a) => a.isOverpacing);

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-2">
      <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
        <AlertTriangle size={12} /> Alerta de Orcamento
      </p>
      {alerts.map(({ client: c }) => (
        <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center justify-between py-1 hover:bg-amber-500/5 rounded px-1 transition-colors">
          <p className="text-xs text-zinc-300">{c.nomeFantasia || c.name}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-400">
              R$ {c.monthlyBudget.toLocaleString("pt-BR")} — dia {today}/{daysInMonth}
            </span>
            <TrendingUp size={10} className="text-amber-400" />
          </div>
        </Link>
      ))}
    </div>
  );
}
