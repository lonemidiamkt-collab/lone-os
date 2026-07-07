"use client";

// components/fichaviva/FichaViva360Tab.tsx — aba "Comercial" da ficha do cliente.
// Decisão do Roberto: faturamento fica na aba "Crescimento" (separado); aqui mora o que é
// COMERCIAL — o Raio-X (estrutura + scripts) e, em breve, o TRÁFEGO (resultado de anúncio do
// cliente), que conversa com o Raio-X (anúncio gera lead → estrutura converte).

import type { Client } from "@/lib/types";
import FichaVivaManagementCard from "@/components/FichaVivaManagementCard";

interface Props {
  client: Client;
  onUpdate: (patch: Partial<Client>) => void;
}

export default function FichaViva360Tab({ client, onUpdate }: Props) {
  return (
    <div className="max-w-2xl animate-fade-in">
      <FichaVivaManagementCard client={client} onUpdate={onUpdate} />
    </div>
  );
}
