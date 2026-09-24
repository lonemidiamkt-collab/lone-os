"use client";

// /saude — Saúde da carteira (Leva 6A). A tela única para "este cliente está em risco?": substitui o
// Termômetro de Churn (/churn), a Jornada CS (/jornada) e a Carteira (/carteira), que redirecionam
// para cá. O conteúdo mora em components/saude/SaudeDaCarteira.tsx; as regras, em lib/saude/.

import { Suspense } from "react";
import Header from "@/components/Header";
import SaudeDaCarteira from "@/components/saude/SaudeDaCarteira";

export default function SaudeDaCarteiraPage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-auto bg-background">
      <Header title="Saúde da carteira" subtitle="Clientes" />
      {/* useSearchParams (filtros na URL) precisa de Suspense no App Router. */}
      <Suspense fallback={null}>
        <SaudeDaCarteira />
      </Suspense>
    </div>
  );
}
