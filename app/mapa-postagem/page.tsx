"use client";

// /mapa-postagem — Mapa de postagem, cliente × semana (N32, Leva 7D). Só a gestão.
// A tela mora em components/gestao/MapaPostagem.tsx; as regras, em lib/metrics/mapa-postagem.ts.

import Header from "@/components/Header";
import EmptyState from "@/components/ui/EmptyState";
import MapaPostagem from "@/components/gestao/MapaPostagem";
import { useRole } from "@/lib/context/RoleContext";
import { Lock } from "lucide-react";

export default function MapaPostagemPage() {
  const { role, hydrated } = useRole();
  const gestao = role === "admin" || role === "manager";
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-auto bg-background">
      <Header title="Mapa de postagem" subtitle="Gestão" />
      {!hydrated ? null : gestao ? (
        <MapaPostagem />
      ) : (
        <div className="mx-auto w-full max-w-md px-4 py-10">
          <EmptyState icon={<Lock size={20} />} tone="muted" title="Só a gestão vê esta tela" subtitle="O mapa de postagem é da gestão. Sua carteira está em Clientes › Meus clientes." />
        </div>
      )}
    </div>
  );
}
