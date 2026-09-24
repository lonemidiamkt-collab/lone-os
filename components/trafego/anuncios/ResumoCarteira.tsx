"use client";

// Visão "Todos" da aba Anúncios Meta: uma linha por cliente com o que o servidor já leu no período.
// Antes era um botão "Carregar" que disparava a Meta para a carteira inteira pelo navegador; agora é
// leitura do banco, com a hora de cada leitura à vista e "Atualizar todos" pedindo ao servidor.

import { Loader2, RefreshCw, ChevronRight, AlertTriangle } from "lucide-react";
import { ClientSpendBar } from "@/components/AdCharts";
import { quandoFoi, ERRO_TOKEN, type ResumoAnuncios } from "@/lib/trafego/anuncios";
import type { Client } from "@/lib/types";
import type { ItemAnuncios } from "./useAnuncios";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const int = (n: number) => Math.round(n).toLocaleString("pt-BR");

function Leitura({ item, atualizando, agora }: { item: ItemAnuncios | undefined; atualizando: boolean; agora: number }) {
  if (atualizando || item?.atualizando) {
    return <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 size={11} className="animate-spin" /> lendo a Meta…</span>;
  }
  if (item?.erro === ERRO_TOKEN) return <span className="text-lone-warning">token recusado</span>;
  if (item?.erro) {
    return (
      <span className="inline-flex items-center gap-1 text-lone-warning" title={item.erro}>
        <AlertTriangle size={11} /> falhou{item.sincronizadoEm ? ` · dado ${quandoFoi(item.sincronizadoEm, agora)}` : ""}
      </span>
    );
  }
  if (!item?.sincronizadoEm) return <span className="text-muted-foreground">sem leitura</span>;
  return <span className="text-muted-foreground">{quandoFoi(item.sincronizadoEm, agora)}</span>;
}

export default function ResumoCarteira({
  clientes, itens, atualizando, agora, rotuloPeriodo, progresso, podeAtualizar, onAbrir, onAtualizarTodos,
}: {
  clientes: Client[];
  itens: Map<string, ItemAnuncios>;
  atualizando: Set<string>;
  agora: number;
  rotuloPeriodo: string;
  progresso: { feitos: number; total: number } | null;
  podeAtualizar: boolean;
  onAbrir: (clientId: string) => void;
  onAtualizarTodos: () => void;
}) {
  const comLeitura = clientes.filter((c) => itens.get(c.id)?.sincronizadoEm);
  const total: ResumoAnuncios = { spend: 0, results: 0, leads: 0, messages: 0, clicks: 0, impressions: 0, campanhas: 0, ativas: 0, semDados: 0 };
  for (const c of comLeitura) {
    const r = itens.get(c.id)!.resumo;
    total.spend += r.spend; total.results += r.results; total.leads += r.leads; total.messages += r.messages;
    total.clicks += r.clicks; total.impressions += r.impressions; total.ativas += r.ativas;
  }
  const maisAntiga = comLeitura
    .map((c) => itens.get(c.id)!.sincronizadoEm!)
    .sort()[0] ?? null;

  const linhas = [...clientes].sort((a, b) => {
    const ra = itens.get(a.id), rb = itens.get(b.id);
    const sa = ra?.sincronizadoEm ? ra.resumo.spend : -1;
    const sb = rb?.sincronizadoEm ? rb.resumo.spend : -1;
    return sb - sa || a.name.localeCompare(b.name);
  });
  const barras = linhas
    .filter((c) => (itens.get(c.id)?.resumo.spend ?? 0) > 0)
    .slice(0, 12)
    .map((c) => ({ name: c.name.split(" ").slice(0, 2).join(" "), spend: Math.round((itens.get(c.id)!.resumo.spend) * 100) / 100, conversions: itens.get(c.id)!.resumo.results }));

  const kpis = [
    { rotulo: "Gasto", valor: brl(total.spend) },
    { rotulo: "Resultados", valor: int(total.results) },
    { rotulo: "Leads", valor: int(total.leads) },
    { rotulo: "Mensagens", valor: int(total.messages) },
    { rotulo: "Cliques", valor: int(total.clicks) },
    { rotulo: "Campanhas ativas", valor: int(total.ativas) },
  ];

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lone-h2 tracking-tight text-foreground">Resumo da carteira</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rotuloPeriodo} · {comLeitura.length} de {clientes.length} cliente(s) com leitura
              {maisAntiga ? ` · a mais antiga ${quandoFoi(maisAntiga, agora)}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onAtualizarTodos}
            disabled={!podeAtualizar || !!progresso}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50"
          >
            {progresso ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {progresso ? `Atualizando ${progresso.feitos}/${progresso.total}` : "Atualizar todos"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <div key={k.rotulo} className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-lone-eyebrow uppercase text-muted-foreground">{k.rotulo}</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-foreground">{k.valor}</p>
            </div>
          ))}
        </div>
        {comLeitura.length < clientes.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            Os totais somam só quem tem leitura neste período. “Atualizar todos” lê na Meta quem está sem leitura ou com leitura de mais de 30 min.
          </p>
        )}
      </div>

      {barras.length > 1 && (
        <div className="card">
          <h3 className="mb-4 text-lone-h2 tracking-tight text-foreground">Investimento por cliente</h3>
          <ClientSpendBar data={barras} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="hidden grid-cols-[1.6fr_repeat(5,minmax(0,1fr))_1.2fr_24px] gap-3 border-b border-border bg-card px-4 py-2.5 md:grid">
          {["Cliente", "Gasto", "Resultados", "Leads", "Mensagens", "Ativas", "Leitura", ""].map((h, i) => (
            <p key={i} className="text-lone-eyebrow uppercase text-muted-foreground">{h}</p>
          ))}
        </div>
        {linhas.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum cliente com conta Meta vinculada neste workspace.</p>
        )}
        {linhas.map((c) => {
          const it = itens.get(c.id);
          const tem = !!it?.sincronizadoEm;
          const r = it?.resumo;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onAbrir(c.id)}
              className="grid w-full grid-cols-2 items-center gap-3 border-b border-border px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/50 md:grid-cols-[1.6fr_repeat(5,minmax(0,1fr))_1.2fr_24px]"
            >
              <span className="truncate font-medium text-foreground">{c.name}</span>
              <span className="tabular-nums text-foreground md:text-left text-right">{tem && r ? brl(r.spend) : "—"}</span>
              <span className="hidden tabular-nums text-foreground md:block">{tem && r ? int(r.results) : "—"}</span>
              <span className="hidden tabular-nums text-foreground md:block">{tem && r ? int(r.leads) : "—"}</span>
              <span className="hidden tabular-nums text-foreground md:block">{tem && r ? int(r.messages) : "—"}</span>
              <span className="hidden tabular-nums text-foreground md:block">{tem && r ? int(r.ativas) : "—"}</span>
              <span className="col-span-2 text-xs md:col-span-1">
                <Leitura item={it} atualizando={atualizando.has(c.id)} agora={agora} />
                {tem && r && r.semDados > 0 && <span className="ml-1 text-lone-warning">· {r.semDados} sem dados</span>}
              </span>
              <ChevronRight size={14} className="hidden text-muted-foreground md:block" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
