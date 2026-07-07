"use client";

// components/fichaviva/FichaViva360Tab.tsx — o cockpit "Ficha Viva 360" dentro da ficha do cliente.
// Duas sub-abas: Painel de Crescimento (dados/gráficos/health editáveis) e Raio-X Comercial
// (gestão do link do cliente + diagnóstico + IA). A Carteira (cross-cliente) fica em /carteira.

import { useState } from "react";
import { LineChart, Sparkles } from "lucide-react";
import type { Client } from "@/lib/types";
import CrescimentoPanel from "@/components/fichaviva/CrescimentoPanel";
import FichaVivaManagementCard from "@/components/FichaVivaManagementCard";

interface Props {
  client: Client;
  onUpdate: (patch: Partial<Client>) => void;
}

type Sub = "painel" | "raiox";

export default function FichaViva360Tab({ client, onUpdate }: Props) {
  const [sub, setSub] = useState<Sub>("painel");

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sub-abas */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        {([
          ["painel", "Painel de Crescimento", <LineChart key="i" size={13} />],
          ["raiox", "Raio-X Comercial", <Sparkles key="i" size={13} />],
        ] as [Sub, string, React.ReactNode][]).map(([id, label, icon]) => (
          <button key={id} onClick={() => setSub(id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              sub === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {icon}{label}
          </button>
        ))}
      </div>

      {sub === "painel" && (
        <CrescimentoPanel clientId={client.id} onGerarLink={() => setSub("raiox")} />
      )}

      {sub === "raiox" && (
        <div className="max-w-2xl">
          <FichaVivaManagementCard client={client} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
