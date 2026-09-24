"use client";

// components/client/ficha/LinhaDoTempo.tsx — A LINHA DO TEMPO ÚNICA do cliente (Leva 7C, N20).
// Substitui o "Histórico" que lia só timeline_entries pela store global (500 linhas de TODOS os
// clientes). Agora vem de GET /api/clients/[id]/linha-do-tempo: registro + conversa do grupo (1 linha
// por dia) + reuniões + perguntas + pedidos de arte + aprovações + NPS. A nota manual continua aqui.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, CalendarClock, Download, KanbanSquare, MessageCircle, MessageSquareText, PenLine, RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { useOperationalStore } from "@/stores/useOperationalStore";
import { ROTULO_TIPO_LINHA, TIPOS_LINHA, type EventoLinha, type TipoLinha } from "@/lib/clientes/linha-do-tempo";
import { Vazio } from "./Secao";
import { dataHoraCurta } from "./rotulos";

const ICONE: Record<TipoLinha, LucideIcon> = {
  conversa: MessageCircle,
  reuniao: CalendarClock,
  producao: KanbanSquare,
  pedido: MessageSquareText,
  status: Activity,
  nota: PenLine,
};

interface Resposta { eventos: EventoLinha[]; contagem: Record<TipoLinha, number>; dias: number; veConversa: boolean; avisos: string[] }

/** Quantas linhas aparecem antes do "ver tudo" — a linha inteira afoga a aba. */
const VISIVEIS = 30;

export default function LinhaDoTempo({ clientId, clientName, currentUser }: { clientId: string; clientName: string; currentUser: string }) {
  const addTimelineEntry = useOperationalStore((s) => s.addTimelineEntry);
  const [dias, setDias] = useState(90);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<TipoLinha | "todos">("todos");
  const [tudo, setTudo] = useState(false);
  const [nota, setNota] = useState("");
  const [escrevendo, setEscrevendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async (d: number) => {
    setCarregando(true);
    const r = await chamar<Resposta>(`/api/clients/${clientId}/linha-do-tempo?dias=${d}`);
    setCarregando(false);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar a linha do tempo."); return; }
    setErro(null);
    setDados(r.data);
  }, [clientId]);
  useEffect(() => { void carregar(dias); }, [carregar, dias]);

  const eventos = useMemo(() => {
    const todos = dados?.eventos ?? [];
    return filtro === "todos" ? todos : todos.filter((e) => e.tipo === filtro);
  }, [dados, filtro]);
  const visiveis = tudo ? eventos : eventos.slice(0, VISIVEIS);

  const salvar = async () => {
    if (!nota.trim() || salvando) return;
    setSalvando(true);
    try {
      await addTimelineEntry({
        clientId, type: "manual", actor: currentUser, description: nota.trim(),
        timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
      setNota(""); setEscrevendo(false);
      await carregar(dias);
    } catch (e) {
      // O texto fica no campo: falhou, não se perde.
      toast.error(`Nota não salva: ${e instanceof Error ? e.message : "erro"}`);
    } finally { setSalvando(false); }
  };

  const exportar = () => {
    if (!eventos.length) return;
    const q = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const linhas = eventos.map((e) => [q(dataHoraCurta(e.quando)), q(ROTULO_TIPO_LINHA[e.tipo]), q(e.ator), q(e.titulo), q(e.detalhe)].join(","));
    const blob = new Blob(["﻿" + ["Data/Hora,Tipo,Quem,O que aconteceu,Detalhe", ...linhas].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linha-do-tempo-${clientName.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const contagem = dados?.contagem;
  const tiposVisiveis = TIPOS_LINHA.filter((t) => t !== "conversa" || dados?.veConversa !== false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lone-caption text-muted-foreground">
          Tudo o que aconteceu com este cliente, numa lista só{dados ? ` — últimos ${dados.dias} dias` : ""}.
        </p>
        <div className="flex gap-2">
          <button onClick={exportar} disabled={!eventos.length}
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
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} aria-label="Nova nota na linha do tempo"
            placeholder="Ex.: ligou pedindo para reforçar a promoção de sábado…"
            className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring" />
          <div className="flex gap-2">
            <button onClick={salvar} disabled={salvando || !nota.trim()}
              className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {salvando ? "Salvando…" : "Salvar nota"}
            </button>
            <button onClick={() => { setEscrevendo(false); setNota(""); }} className="h-8 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          </div>
        </div>
      )}

      {/* Filtros: rolam na horizontal no celular. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filtrar a linha do tempo">
        {(["todos", ...tiposVisiveis] as const).map((t) => {
          const n = t === "todos" ? dados?.eventos.length ?? 0 : contagem?.[t] ?? 0;
          const ativo = filtro === t;
          return (
            <button key={t} onClick={() => { setFiltro(t); setTudo(false); }} aria-pressed={ativo}
              className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                ativo ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {t === "todos" ? "Tudo" : ROTULO_TIPO_LINHA[t]}
              <span className="tabular-nums opacity-80">{n}</span>
            </button>
          );
        })}
      </div>

      {erro && !dados && <Vazio>{erro}</Vazio>}
      {carregando && !dados && <div className="h-24 animate-pulse rounded-lg bg-muted" />}
      {dados && dados.avisos.length > 0 && (
        <p className="text-lone-caption text-lone-warning">Parte da linha não carregou ({dados.avisos.join(" · ")}).</p>
      )}

      {dados && (eventos.length === 0 ? <Vazio>Nada registrado {filtro === "todos" ? "" : `em ${ROTULO_TIPO_LINHA[filtro].toLowerCase()} `}nesse período.</Vazio> : (
        <ol className="relative space-y-3 border-l border-border pl-5">
          {visiveis.map((e) => {
            const Icone = ICONE[e.tipo];
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[29px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card" aria-hidden="true">
                  <Icone size={11} className="text-muted-foreground" />
                </span>
                <p className="text-lone-body text-foreground [overflow-wrap:anywhere]">{e.titulo}</p>
                {e.detalhe && <p className="mt-0.5 text-lone-body text-muted-foreground [overflow-wrap:anywhere]">{e.detalhe}</p>}
                <p className="mt-0.5 text-lone-caption text-muted-foreground">
                  {ROTULO_TIPO_LINHA[e.tipo]}{e.ator ? ` · ${e.ator}` : ""} · {dataHoraCurta(e.quando)}
                </p>
              </li>
            );
          })}
        </ol>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        {eventos.length > VISIVEIS && (
          <button onClick={() => setTudo((v) => !v)} className="text-lone-caption text-primary hover:underline">
            {tudo ? "Mostrar menos" : `Ver as ${eventos.length} entradas`}
          </button>
        )}
        {dados && dias < 365 && (
          <button onClick={() => setDias(365)} disabled={carregando}
            className="inline-flex items-center gap-1 text-lone-caption text-muted-foreground hover:text-foreground disabled:opacity-50">
            <RefreshCw size={11} className={carregando ? "animate-spin" : ""} aria-hidden="true" /> Buscar o último ano
          </button>
        )}
      </div>
    </div>
  );
}
