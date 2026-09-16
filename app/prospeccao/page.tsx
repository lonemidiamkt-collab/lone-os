"use client";

// /prospeccao — a página do Piloto SDR Lone (agente de prospecção). Só gestão (admin/manager).
// Abas vêm da sidebar secundária (pendingTab/setCurrentTab, padrão do /crm). `?prospect=<id>` abre
// a ficha direto (é o link que o handoff e os avisos mandam); `?tab=configuracao&google=ok` é a
// volta do consentimento do Google.

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import VisaoGeral from "@/components/prospeccao/VisaoGeral";
import Prospects from "@/components/prospeccao/Prospects";
import { FilaDoDia, Conversas, Agenda } from "@/components/prospeccao/FilaConversasAgenda";
import Configuracao from "@/components/prospeccao/Configuracao";
import Relatorios from "@/components/prospeccao/Relatorios";
import FichaProspect from "@/components/prospeccao/FichaProspect";

const ABAS = ["visao", "fila", "prospects", "conversas", "agenda", "configuracao", "relatorios"] as const;
type Aba = (typeof ABAS)[number];
const ROTULO: Record<Aba, string> = { visao: "Visão geral", fila: "Fila do dia", prospects: "Prospects", conversas: "Conversas", agenda: "Agenda", configuracao: "Configuração", relatorios: "Relatórios" };

export default function ProspeccaoPage() {
  const { role, hydrated } = useRole();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Aba>("visao");
  const [aberto, setAberto] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [googleStatus, setGoogleStatus] = useState<{ status: string; motivo?: string; email?: string } | null>(null);
  const [veioComProspect, setVeioComProspect] = useState(false);
  // Query string lida no mount (useSearchParams exigiria Suspense no prerender).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab") as Aba | null;
    if (t && ABAS.includes(t)) setTab(t);
    const pid = q.get("prospect");
    if (pid) { setAberto(pid); setVeioComProspect(true); }
    if (q.get("google")) setGoogleStatus({ status: q.get("google")!, motivo: q.get("motivo") ?? undefined, email: q.get("email") ?? undefined });
  }, []);

  const { pendingTab, setPendingTab, setCurrentTab } = useNav();
  useEffect(() => { setCurrentTab(tab); }, [tab, setCurrentTab]);
  useEffect(() => {
    if (!pendingTab) return;
    if (ABAS.includes(pendingTab as Aba)) setTab(pendingTab as Aba);
    setPendingTab("");
  }, [pendingTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (id: string) => { setAberto(id); };
  const fechar = () => { setAberto(null); if (veioComProspect) { setVeioComProspect(false); router.replace(pathname); } };
  const mudou = () => setVersao((v) => v + 1);

  if (!hydrated) return null;
  if (role !== "admin" && role !== "manager") {
    return <div className="p-6"><p className="text-lone-body text-muted-foreground">Esta área é só da gestão.</p></div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lone-eyebrow uppercase tracking-wider text-muted-foreground">Prospecção</div>
          <h1 className="text-lone-h1 tracking-tight text-foreground">{ROTULO[tab]}</h1>
        </div>
        <nav className="flex flex-wrap gap-1 lg:hidden">
          {ABAS.map((a) => (
            <button key={a} onClick={() => setTab(a)} className={`rounded-lg px-3 py-1.5 text-lone-body ${tab === a ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`}>{ROTULO[a]}</button>
          ))}
        </nav>
      </header>

      {tab === "visao" && <VisaoGeral key={versao} abrir={abrir} irPara={(t) => setTab(t as Aba)} />}
      {tab === "fila" && <FilaDoDia abrir={abrir} versao={versao} onChange={mudou} />}
      {tab === "prospects" && <Prospects abrir={abrir} versao={versao} />}
      {tab === "conversas" && <Conversas abrir={abrir} versao={versao} />}
      {tab === "agenda" && <Agenda abrir={abrir} versao={versao} />}
      {tab === "configuracao" && <Configuracao onChange={mudou} googleStatus={googleStatus} />}
      {tab === "relatorios" && <Relatorios versao={versao} />}

      {aberto && (
        <>
          <div className="fixed inset-0 z-40 bg-foreground/20" onClick={fechar} />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-border bg-card shadow-sm">
            <FichaProspect id={aberto} onClose={fechar} onChange={mudou} />
          </aside>
        </>
      )}
    </div>
  );
}
