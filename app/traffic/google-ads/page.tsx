"use client";

// Tráfego › Google Ads (19/11/2026) — a carteira do Google: verba, ritmo do mês, buscas perdidas e sinais.
// Regras em lib/google/carteira.ts; dados em /api/trafego/google-ads.

import { useRole } from "@/lib/context/RoleContext";
import GoogleAdsCarteira from "@/components/trafego/google/GoogleAdsCarteira";

export default function GoogleAdsPage() {
  const { role } = useRole();
  if (role !== "admin" && role !== "manager" && role !== "traffic") {
    return <div className="p-6 text-sm text-muted-foreground">Área do tráfego.</div>;
  }
  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-lone-h1 tracking-tight text-foreground">Google Ads</h1>
          <p className="text-sm text-muted-foreground">Verba e ritmo do mês, o que os anúncios geraram e quem precisa de você hoje.</p>
        </div>
        <GoogleAdsCarteira />
      </div>
    </div>
  );
}
