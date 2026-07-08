"use client";

// components/cs/CsAgentInbox.tsx — seção dedicada "🤖 CS Agente" no topo dos boards (social e
// designer). Agrupa os cards que o Agente CS trouxe e que ainda estão FRESCOS (não publicados/
// agendados) — um inbox do que o agente criou, pra não se perder no meio do board. Clique abre o card.

import type { ContentCard } from "@/lib/types";
import { Bot, Clock } from "lucide-react";

const ABERTOS = new Set(["ideas", "script", "in_production", "blocked", "approval", "client_approval"]);

function veioDoAgente(c: ContentCard): boolean {
  return (c.requestedByTraffic || "").includes("Agente CS");
}

export default function CsAgentInbox({
  cards,
  onOpen,
  titulo = "CS Agente",
}: {
  cards: ContentCard[];
  onOpen?: (card: ContentCard) => void;
  titulo?: string;
}) {
  const doAgente = cards
    .filter((c) => veioDoAgente(c) && ABERTOS.has(c.status))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  if (doAgente.length === 0) return null;

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4 mb-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Bot size={15} className="text-primary" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">🤖 {titulo}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
          {doAgente.length} {doAgente.length === 1 ? "pedido" : "pedidos"}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">criados pelo Agente CS · clique pra abrir</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {doAgente.map((c) => {
          const atrasado = c.dueDate && c.dueDate < hoje;
          const prioAlta = c.priority === "high";
          return (
            <button
              key={c.id}
              onClick={() => onOpen?.(c)}
              className="text-left p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-foreground leading-tight line-clamp-2">{c.title}</span>
                {prioAlta && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">⚡ alta</span>}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="truncate">{c.clientName}</span>
                {c.dueDate && (
                  <span className={`flex items-center gap-0.5 ml-auto shrink-0 ${atrasado ? "text-destructive" : ""}`}>
                    <Clock size={9} /> {new Date(c.dueDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
