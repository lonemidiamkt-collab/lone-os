"use client";

// Tráfego › Google Meu Negócio (19/11/2026) — o Perfil da Empresa de cada cliente: contatos, Busca × Maps,
// nota e a fila de avaliações sem resposta. Regras em lib/google/carteira.ts; dados em /api/trafego/google-perfil.

import { useRole } from "@/lib/context/RoleContext";
import MeuNegocioCarteira from "@/components/trafego/google/MeuNegocioCarteira";

export default function MeuNegocioPage() {
  const { role } = useRole();
  if (role !== "admin" && role !== "manager" && role !== "traffic") {
    return <div className="p-6 text-sm text-muted-foreground">Área do tráfego.</div>;
  }
  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-lone-h1 tracking-tight text-foreground">Google Meu Negócio</h1>
          <p className="text-sm text-muted-foreground">Ligações, rotas e cliques que o Perfil da Empresa gerou, a nota de cada cliente e as avaliações esperando resposta.</p>
        </div>
        <MeuNegocioCarteira />
      </div>
    </div>
  );
}
