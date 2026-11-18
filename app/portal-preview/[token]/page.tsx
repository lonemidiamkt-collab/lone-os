"use client";

// app/portal-preview/[token] — SÓ DESENVOLVIMENTO. Abre o painel de resultados com o código desta máquina e os
// números REAIS de produção, para ver mudança de design sem banco local:
//   /portal-preview/<token>?cliente=<clientId>&abas=ads,google,social,crm
// As leituras (snapshot, google, crm, instagram) vão para PORTAL_PREVIEW_ORIGIN pelo `beforeFiles` do
// next.config.ts — só leitura; envio, aprovação e upload NÃO passam (falham aqui, como deve ser).
// Em produção (next build) a página não existe: notFound() logo de cara.

import { use, useEffect, useState } from "react";
import { notFound, useSearchParams } from "next/navigation";
import PortalDashboard from "@/components/portal/PortalDashboard";
import type { SnapshotData } from "@/lib/portal/types";

export default function PortalPreview({ params }: { params: Promise<{ token: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { token } = use(params);
  const q = useSearchParams();
  const abas = (q.get("abas") ?? "ads,google,social").split(",");
  const [snap, setSnap] = useState<SnapshotData | null | undefined>(undefined);

  useEffect(() => {
    if (!abas.includes("ads")) { setSnap(null); return; }
    fetch(`/api/portal/${token}/snapshot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period_kind: "last_week" }) })
      .then((r) => (r.ok ? r.json() : null)).then(setSnap).catch(() => setSnap(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (snap === undefined) return <p className="p-8 text-sm text-muted-foreground">Carregando a prévia…</p>;
  return (
    <PortalDashboard
      token={token}
      clientId={q.get("cliente") ?? ""}
      clientName={q.get("nome") ?? "Prévia do painel"}
      whatsappPhone=""
      welcomeMessage={null}
      initialData={snap}
      hasAds={abas.includes("ads")}
      hasSocial={abas.includes("social")}
      hasIg={abas.includes("social")}
      hasGoogle={abas.includes("google")}
      hasCrm={abas.includes("crm")}
      mesRelatorio="11/2026"
    />
  );
}
