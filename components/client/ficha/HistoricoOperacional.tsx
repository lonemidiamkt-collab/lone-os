"use client";

// components/client/ficha/HistoricoOperacional.tsx — a linha do tempo do cliente (grupo, tarefas,
// conteúdo, reuniões, notas). Alimentada pelos fatos do banco (app/api/system/historico-cliente).
// Era a aba "Histórico Operacional"; agora mora em Relacionamento.

import { useState } from "react";
import {
  Activity, BarChart2, CheckSquare, Download, GitCommitHorizontal, Instagram, MessageCircle, PenLine, Star, User,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useOperationalStore } from "@/stores/useOperationalStore";
import type { TimelineEntryType } from "@/lib/types";
import { Vazio } from "./Secao";

const TIPO: Record<TimelineEntryType, { icone: LucideIcon; rotulo: string }> = {
  chat: { icone: MessageCircle, rotulo: "Chat" },
  task: { icone: CheckSquare, rotulo: "Tarefa" },
  status: { icone: Activity, rotulo: "Status" },
  content: { icone: Instagram, rotulo: "Conteúdo" },
  design: { icone: Star, rotulo: "Design" },
  report: { icone: BarChart2, rotulo: "Relatório" },
  manual: { icone: PenLine, rotulo: "Nota" },
  onboarding: { icone: GitCommitHorizontal, rotulo: "Onboarding" },
  meeting: { icone: User, rotulo: "Reunião" },
};

/** Quantas entradas aparecem antes do "ver tudo" — a linha do tempo inteira afoga a aba. */
const VISIVEIS = 25;

export default function HistoricoOperacional({ clientId, clientName, currentUser }: { clientId: string; clientName: string; currentUser: string }) {
  const entries = useOperationalStore((s) => s.timeline[clientId]) ?? [];
  const addTimelineEntry = useOperationalStore((s) => s.addTimelineEntry);
  const [nota, setNota] = useState("");
  const [escrevendo, setEscrevendo] = useState(false);
  const [tudo, setTudo] = useState(false);

  const salvar = async () => {
    if (!nota.trim()) return;
    try {
      await addTimelineEntry({
        clientId, type: "manual", actor: currentUser, description: nota.trim(),
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      setNota(""); setEscrevendo(false);
    } catch (e) {
      // O texto fica no campo: falhou, não se perde.
      toast.error(`Nota não salva: ${e instanceof Error ? e.message : "erro"}`);
    }
  };

  const exportar = () => {
    if (!entries.length) return;
    const linhas = entries.map((e) => `"${e.timestamp}","${TIPO[e.type]?.rotulo ?? e.type}","${e.actor}","${e.description.replace(/"/g, '""')}"`);
    const blob = new Blob(["﻿" + ["Data/Hora,Tipo,Responsável,Descrição", ...linhas].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${clientName.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visiveis = tudo ? entries : entries.slice(0, VISIVEIS);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lone-caption text-muted-foreground">Registro automático do que acontece com este cliente.</p>
        <div className="flex gap-2">
          <button onClick={exportar} disabled={!entries.length}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-40">
            <Download size={13} aria-hidden="true" /> Exportar CSV
          </button>
          <button onClick={() => setEscrevendo((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-accent">
            <PenLine size={13} aria-hidden="true" /> Nota manual
          </button>
        </div>
      </div>

      {escrevendo && (
        <div className="space-y-2 rounded-xl border border-border bg-background p-3">
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} aria-label="Nova nota no histórico"
            placeholder="Ex.: reunião com o cliente — satisfeito com os resultados, pediu ampliar a verba..."
            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring" />
          <div className="flex gap-2">
            <button onClick={salvar} className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90">Salvar nota</button>
            <button onClick={() => { setEscrevendo(false); setNota(""); }} className="h-8 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      )}

      {entries.length === 0 ? <Vazio>Nenhum registro ainda.</Vazio> : (
        <ol className="relative space-y-3 border-l border-border pl-5">
          {visiveis.map((e) => {
            const t = TIPO[e.type] ?? TIPO.manual;
            const Icone = t.icone;
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[29px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card" aria-hidden="true">
                  <Icone size={11} className="text-muted-foreground" />
                </span>
                <p className="text-lone-body text-foreground [overflow-wrap:anywhere]">{e.description}</p>
                <p className="mt-0.5 text-lone-caption text-muted-foreground">{t.rotulo} · {e.actor} · {e.timestamp}</p>
              </li>
            );
          })}
        </ol>
      )}
      {entries.length > VISIVEIS && (
        <button onClick={() => setTudo((v) => !v)} className="text-lone-caption text-primary hover:underline">
          {tudo ? "Mostrar menos" : `Ver as ${entries.length} entradas`}
        </button>
      )}
    </div>
  );
}
