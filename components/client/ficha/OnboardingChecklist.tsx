"use client";

// components/client/ficha/OnboardingChecklist.tsx — o setup do cliente novo, em três frentes
// (tráfego, design, social). Era a aba "Onboarding"; agora mora em Admin.

import { CheckCircle, Palette, Smartphone, TrendingUp } from "lucide-react";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { cn } from "@/lib/utils";
import type { Client, OnboardingItem } from "@/lib/types";
import { Vazio } from "./Secao";

const FRENTES = [
  { dept: "traffic", titulo: "Setup de tráfego", icone: TrendingUp, campo: "assignedTraffic" },
  { dept: "design", titulo: "Setup de design", icone: Palette, campo: "assignedDesigner" },
  { dept: "social", titulo: "Setup de social", icone: Smartphone, campo: "assignedSocial" },
] as const;

export default function OnboardingChecklist({ client, itens, currentUser }: { client: Client; itens: OnboardingItem[]; currentUser: string }) {
  const toggle = useOperationalStore((s) => s.toggleOnboardingItem);
  if (itens.length === 0) {
    return <Vazio>{client.status === "onboarding" ? "Checklist de onboarding não iniciado." : "Este cliente já concluiu o onboarding."}</Vazio>;
  }
  const feitos = itens.filter((i) => i.completed).length;
  const pct = Math.round((feitos / itens.length) * 100);
  const deptDe = (i: OnboardingItem) => (i as OnboardingItem & { department?: string }).department;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-lone-body">
          <span className="text-muted-foreground">{feitos} de {itens.length} itens</span>
          <span className="tabular-nums text-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {FRENTES.map((f) => {
          const lista = itens.filter((i) => deptDe(i) === f.dept || (!deptDe(i) && f.dept === "social"));
          const ok = lista.filter((i) => i.completed).length;
          const Icone = f.icone;
          return (
            <div key={f.dept} className="space-y-2 rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Icone size={15} className="text-muted-foreground" aria-hidden="true" />
                  <span>
                    <span className="block text-lone-body font-medium text-foreground">{f.titulo}</span>
                    <span className="block text-lone-caption text-muted-foreground">{client[f.campo] || "Não atribuído"}</span>
                  </span>
                </span>
                <span className={cn("text-lone-caption tabular-nums", ok === lista.length && lista.length > 0 ? "text-lone-success" : "text-muted-foreground")}>{ok}/{lista.length}</span>
              </div>
              <ul className="space-y-0.5">
                {lista.map((i) => (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent">
                      <input type="checkbox" checked={i.completed} onChange={() => toggle(client.id, i.id, currentUser)} className="sr-only" />
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        i.completed ? "border-primary bg-primary text-primary-foreground" : "border-border")} aria-hidden="true">
                        {i.completed && <CheckCircle size={10} />}
                      </span>
                      <span className={cn("text-lone-caption", i.completed ? "text-muted-foreground line-through" : "text-foreground")}>{i.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
