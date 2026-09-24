"use client";

// components/equipe/CargaPorPessoa.tsx — CARGA REAL POR PESSOA (Leva 7C, N30). Itens abertos de cada
// um, pelo que é dele no papel dele, contra o limite do papel (lib/carga/por-pessoa.ts). Substitui a
// capacidade fixa de 8 itens/semana que a aba "Carga" do painel da diretoria usava para todo mundo.

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useClientsStore } from "@/stores/useClientsStore";
import { useContentStore } from "@/stores/useContentStore";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { useTeamMembers } from "@/lib/hooks/useTeamMembers";
import { cn } from "@/lib/utils";
import { cargaPorPessoa, LIMITE_POR_PAPEL, ROTULO_PAPEL_CARGA, type CargaDaPessoa } from "@/lib/carga/por-pessoa";

const COR: Record<CargaDaPessoa["situacao"], { texto: string; barra: string; borda: string }> = {
  folga: { texto: "text-muted-foreground", barra: "bg-muted-foreground", borda: "border-border" },
  ok: { texto: "text-foreground", barra: "bg-primary", borda: "border-border" },
  cheio: { texto: "text-lone-warning", barra: "bg-lone-warning", borda: "border-lone-warning-border" },
  acima: { texto: "text-destructive", barra: "bg-destructive", borda: "border-destructive/30" },
};
const ROTULO_SITUACAO: Record<CargaDaPessoa["situacao"], string> = { folga: "Com folga", ok: "No ritmo", cheio: "No limite", acima: "Acima do limite" };

export default function CargaPorPessoa() {
  const clients = useClientsStore((s) => s.clients);
  const contentCards = useContentStore((s) => s.contentCards);
  const designRequests = useContentStore((s) => s.designRequests);
  const tasks = useOperationalStore((s) => s.tasks);
  const { members } = useTeamMembers();

  const carga = useMemo(() => cargaPorPessoa({
    pessoas: members.map((m) => ({ nome: m.name, papel: m.role })),
    clientes: clients.filter((c) => !c.churnedAt).map((c) => ({ id: c.id, name: c.nomeFantasia || c.name, assignedSocial: c.assignedSocial, assignedTraffic: c.assignedTraffic, assignedDesigner: c.assignedDesigner })),
    tarefas: tasks.map((t) => ({ assignedTo: t.assignedTo, status: t.status })),
    cards: contentCards.map((c) => ({ socialMedia: c.socialMedia, status: c.status, clientId: c.clientId, archivedAt: c.archivedAt ?? null, designRequestId: c.designRequestId ?? null })),
    pedidosArte: designRequests.map((r) => ({ clientId: r.clientId, status: r.status, assignedDesigner: r.assignedDesigner ?? null })),
  }), [members, clients, tasks, contentCards, designRequests]);

  return (
    <div className="space-y-4">
      <p className="text-lone-caption text-muted-foreground">
        Itens abertos agora, contra o limite do papel: {Object.entries(LIMITE_POR_PAPEL).filter(([p]) => ["social", "designer", "traffic"].includes(p))
          .map(([p, n]) => `${ROTULO_PAPEL_CARGA[p as keyof typeof ROTULO_PAPEL_CARGA]} ${n}`).join(" · ")}.
        Social conta tarefas e cards em produção; designer conta pedidos de arte e cards com ele; tráfego conta tarefas.
      </p>
      {carga.length === 0 && <p className="text-lone-body text-muted-foreground">Ninguém com trabalho aberto.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {carga.map((p) => {
          const cor = COR[p.situacao];
          const partes = [
            p.tarefas ? `${p.tarefas} tarefa${p.tarefas === 1 ? "" : "s"}` : null,
            p.cards ? `${p.cards} card${p.cards === 1 ? "" : "s"}` : null,
            p.artes ? `${p.artes} arte${p.artes === 1 ? "" : "s"}` : null,
          ].filter(Boolean).join(" · ") || "nada aberto";
          return (
            <div key={p.nome} className={cn("rounded-xl border bg-card p-4", cor.borda)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lone-body font-medium text-foreground">{p.nome}</p>
                  <p className="text-lone-caption text-muted-foreground">
                    {ROTULO_PAPEL_CARGA[p.papel]} · {p.clientes.length} cliente{p.clientes.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("text-lone-h2 tabular-nums", cor.texto)}>{p.total}/{p.limite}</p>
                  <p className={cn("text-lone-caption", cor.texto)}>{ROTULO_SITUACAO[p.situacao]}</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn("h-full rounded-full", cor.barra)} style={{ width: `${Math.min(p.uso, 100)}%` }} />
              </div>
              <p className="mt-2 text-lone-caption text-muted-foreground">{partes}</p>
              {p.situacao === "acima" && (
                <p className="mt-2 flex items-center gap-1.5 text-lone-caption text-destructive">
                  <AlertTriangle size={12} aria-hidden="true" /> Acima do limite do papel — redistribuir ou tirar da fila.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
