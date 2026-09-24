"use client";

// components/trafego/mudancas/OQueMudou.tsx — aba "O que mudou" do Tráfego (Leva 7A, N2).
//
// Responde "o que mexeram?": dois retratos diários (status + orçamento de cada campanha e conjunto,
// tirados às 00h10) comparados, cliente por cliente. Só leitura. Regras em lib/trafego/mudancas.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, ChevronLeft, History, Pause, Play, Plus, RefreshCw,
  TrendingDown, TrendingUp, UserCheck, type LucideIcon,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { useRole } from "@/lib/context/RoleContext";
import { cn } from "@/lib/utils";
import type { Mudanca, RespostaMudancas } from "@/lib/trafego/mudancas";
import { ddmm, reais } from "@/components/trafego/hoje/formato";

interface Props {
  /** Clientes da tela (com o filtro de workspace). Vazio = todos. */
  clientIds?: string[];
  currentUser: string;
}

function iconeDe(m: Mudanca): { icone: LucideIcon; cor: string } {
  switch (m.tipo) {
    case "orcamento": return (m.variacaoPct ?? 0) >= 0
      ? { icone: TrendingUp, cor: "text-primary" }
      : { icone: TrendingDown, cor: "text-lone-info" };
    case "pausou": return { icone: Pause, cor: "text-lone-warning" };
    case "ligou": return { icone: Play, cor: "text-lone-success" };
    case "entrega": return { icone: AlertTriangle, cor: "text-lone-warning" };
    case "nova": return { icone: Plus, cor: "text-lone-success" };
    case "saiu": return { icone: Archive, cor: "text-lone-danger" };
  }
}

export default function OQueMudou({ clientIds, currentUser }: Props) {
  const { role } = useRole();
  const [ate, setAte] = useState<string | null>(null);
  const [dados, setDados] = useState<RespostaMudancas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [soMeus, setSoMeus] = useState(role === "traffic");

  const carregar = useCallback(async (dia: string | null) => {
    setCarregando(true);
    const r = await chamar<RespostaMudancas>(`/api/trafego/mudancas${dia ? `?ate=${dia}` : ""}`);
    if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro ?? "Não consegui carregar.");
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(ate); }, [carregar, ate]);

  const visiveis = useMemo(() => {
    const ids = clientIds?.length ? new Set(clientIds) : null;
    return (dados?.clientes ?? []).filter((c) =>
      (!ids || ids.has(c.clientId)) && (!soMeus || (c.gestor ?? "").split(" ")[0].toLowerCase() === currentUser.split(" ")[0].toLowerCase()));
  }, [dados, clientIds, soMeus, currentUser]);
  const total = visiveis.reduce((s, c) => s + c.mudancas.length, 0);

  const periodo = dados?.antes && dados.depois
    ? (() => {
        // Retratos de dias seguidos: as mudanças são do dia `antes` ("ontem", quando `depois` é hoje).
        const umDia = Date.parse(`${dados.depois}T12:00:00Z`) - Date.parse(`${dados.antes}T12:00:00Z`) <= 86_400_000;
        return umDia ? `em ${ddmm(dados.antes)}` : `entre ${ddmm(dados.antes)} e ${ddmm(dados.depois)}`;
      })()
    : null;

  return (
    <section className="space-y-4" aria-labelledby="titulo-mudancas">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-mudancas" className="flex items-center gap-2 text-lone-h2 text-foreground">
            <History size={16} className="text-muted-foreground" aria-hidden="true" /> O que mudou {periodo && <span className="text-muted-foreground">{periodo}</span>}
          </h2>
          <p className="mt-0.5 text-lone-caption text-muted-foreground">
            Status e orçamento de cada campanha e conjunto, comparados entre dois retratos do servidor (tirados às 00h10). Só leitura.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSoMeus((v) => !v)}
            aria-pressed={soMeus}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
              soMeus ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <UserCheck size={14} aria-hidden="true" /> Só os meus
          </button>
          <div className="inline-flex items-center rounded-lg border border-border">
            <button
              type="button"
              disabled={!dados?.antes || carregando}
              onClick={() => dados?.antes && setAte(dados.antes)}
              aria-label="Dia anterior"
              title="Dia anterior"
              className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              disabled={!ate || carregando}
              onClick={() => setAte(null)}
              className="h-8 border-x border-border px-2.5 text-xs font-medium text-foreground disabled:text-muted-foreground"
            >
              Mais recente
            </button>
            <button
              type="button"
              disabled={carregando}
              onClick={() => carregar(ate)}
              aria-label="Recarregar"
              title="Recarregar"
              className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      {erro && <p role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">{erro}</p>}

      {carregando && !dados ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : dados && !dados.disponivel ? (
        <EmptyState tone="muted" icon={<History size={20} />} title="Ainda sem retratos"
          subtitle="A tabela do retrato diário (meta_campaign_estado) entra com a migração desta leva. Depois dela, o primeiro retrato sai às 00h10 e a comparação no dia seguinte." />
      ) : dados && !dados.antes ? (
        <EmptyState tone="muted" icon={<History size={20} />} title={dados.depois ? `Primeiro retrato: ${ddmm(dados.depois)}` : "Nenhum retrato ainda"}
          subtitle="A comparação aparece depois do próximo retrato (todo dia às 00h10)." />
      ) : visiveis.length === 0 ? (
        <EmptyState tone="muted" icon={<History size={20} />} title="Nada mudou"
          subtitle={`${soMeus ? "Nos seus clientes, n" : "N"}enhuma campanha ou conjunto mudou de status ou orçamento ${periodo ?? ""}.`} />
      ) : (
        <>
          <p className="text-lone-caption text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{total}</span> {total === 1 ? "mudança" : "mudanças"} em{" "}
            <span className="font-medium tabular-nums text-foreground">{visiveis.length}</span> {visiveis.length === 1 ? "cliente" : "clientes"}
            {dados?.semMudanca ? ` · ${dados.semMudanca} sem mudança` : ""}
          </p>
          <ul className="space-y-3">
            {visiveis.map((c) => {
              const delta = c.orcamentoDepois - c.orcamentoAntes;
              return (
                <li key={c.clientId} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">
                      {c.nome}
                      {c.gestor && <span className="font-normal text-muted-foreground"> · {c.gestor}</span>}
                    </p>
                    {Math.abs(delta) >= 1 && (
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Orçamento diário no ar: {reais(c.orcamentoAntes)} → <span className={cn("font-medium", delta > 0 ? "text-primary" : "text-lone-info")}>{reais(c.orcamentoDepois)}</span>
                      </p>
                    )}
                  </div>
                  <ul className="mt-2 divide-y divide-border">
                    {c.mudancas.map((m, i) => {
                      const { icone: Icone, cor } = iconeDe(m);
                      return (
                        <li key={`${m.entityId}-${m.tipo}-${i}`} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                          <Icone size={15} className={cn("mt-0.5 shrink-0", cor)} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">{m.texto}</p>
                            <p className="truncate text-lone-caption text-muted-foreground" title={m.nome}>
                              {m.nome}{m.campanha ? ` · em ${m.campanha}` : ""}
                            </p>
                          </div>
                          {m.horaMeta && <span className="shrink-0 text-lone-caption tabular-nums text-muted-foreground">às {m.horaMeta}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
