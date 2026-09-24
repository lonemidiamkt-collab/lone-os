"use client";

// components/trafego/vendas/VendasCarteira.tsx — aba "Vendas" do Tráfego (Leva 7A, N9).
//
// A carteira no mês: quem registrou venda vinda dos anúncios, o custo por venda e o retorno de cada
// cliente. Clicar num cliente abre o detalhe (VendasDoCliente, o mesmo bloco que o portal usa) — é lá
// que o time lança e apaga. "Registrar venda" abre o bloco para qualquer cliente da carteira.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Info, RefreshCw, ShoppingBag } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import type { RespostaVendasCarteira } from "@/lib/trafego/vendas";
import VendasDoCliente from "./VendasDoCliente";

const brl = (n: number | null | undefined, casas = 0) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

function nomeDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}
function mesAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export default function VendasCarteira({ clientes }: { clientes: { id: string; nome: string }[] }) {
  const atual = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const [mes, setMes] = useState(atual);
  const [dados, setDados] = useState<RespostaVendasCarteira | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [lancarPara, setLancarPara] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<RespostaVendasCarteira>(`/api/trafego/vendas?mes=${mes}`);
    if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro ?? "Não consegui carregar.");
    setCarregando(false);
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  const idsDaTela = useMemo(() => new Set(clientes.map((c) => c.id)), [clientes]);
  const linhas = (dados?.linhas ?? []).filter((l) => !clientes.length || idsDaTela.has(l.clientId));
  const totalVendas = linhas.reduce((s, l) => s + l.resumo.vendas, 0);
  const meses = [atual, mesAnterior(atual), mesAnterior(mesAnterior(atual))];

  return (
    <section className="space-y-4" aria-labelledby="titulo-vendas">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-vendas" className="flex items-center gap-2 text-lone-h2 text-foreground">
            <ShoppingBag size={16} className="text-muted-foreground" aria-hidden="true" /> Vendas × investimento
          </h2>
          <p className="mt-0.5 text-lone-caption text-muted-foreground">
            As vendas que o cliente fechou vindas dos anúncios (lançadas pelo time ou pelo próprio cliente no portal) e quanto custou cada uma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês"
            className="h-8 rounded-lg border border-input bg-card px-2 text-xs capitalize text-foreground focus:border-primary focus:outline-none">
            {meses.map((m) => <option key={m} value={m}>{nomeDoMes(m)}</option>)}
          </select>
          <select value={lancarPara} onChange={(e) => { setLancarPara(e.target.value); setAberto(e.target.value || null); }} aria-label="Registrar venda para o cliente"
            className="h-8 max-w-[220px] rounded-lg border border-input bg-card px-2 text-xs text-foreground focus:border-primary focus:outline-none">
            <option value="">Registrar venda para…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <button type="button" onClick={carregar} disabled={carregando} aria-label="Recarregar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {erro && <p role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">{erro}</p>}

      {lancarPara && !linhas.some((l) => l.clientId === lancarPara) && (
        <div className="rounded-xl border border-primary/30 bg-card p-4">
          <VendasDoCliente clientId={lancarPara} titulo={clientes.find((c) => c.id === lancarPara)?.nome ?? "Vendas"} onMudou={carregar} />
        </div>
      )}

      {carregando && !dados ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : dados && !dados.disponivel ? (
        <EmptyState tone="muted" icon={<ShoppingBag size={20} />} title="Registro de vendas ainda indisponível"
          subtitle="A tabela client_sales entra com a migração desta leva." />
      ) : linhas.length === 0 ? (
        <EmptyState tone="muted" icon={<ShoppingBag size={20} />} title={`Nenhuma venda registrada em ${nomeDoMes(mes)}`}
          subtitle="Escolha um cliente em “Registrar venda para…” — ou peça ao cliente para lançar pelo portal." />
      ) : (
        <>
          <p className="text-lone-caption text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{totalVendas}</span> vendas em <span className="font-medium tabular-nums text-foreground">{linhas.length}</span> clientes
          </p>
          <ul className="space-y-2">
            {linhas.map((l) => {
              const ab = aberto === l.clientId;
              return (
                <li key={l.clientId} className="overflow-hidden rounded-xl border border-border bg-card">
                  <button type="button" onClick={() => setAberto(ab ? null : l.clientId)} aria-expanded={ab}
                    className="grid w-full grid-cols-2 items-center gap-3 px-4 py-3 text-left sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_20px]">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="truncate text-sm font-medium text-foreground">{l.nome}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{l.gestor ?? "—"}{l.ultimaVenda ? ` · última ${ddmm(l.ultimaVenda)}` : ""}</p>
                    </div>
                    <div><p className="text-[11px] text-muted-foreground">Vendas</p><p className="text-sm font-semibold tabular-nums text-foreground">{l.resumo.vendas}</p></div>
                    <div><p className="text-[11px] text-muted-foreground">Custo/venda</p><p className="text-sm font-semibold tabular-nums text-foreground">{brl(l.resumo.custoPorVenda, 2)}</p></div>
                    <div><p className="text-[11px] text-muted-foreground">Investido</p><p className="text-sm tabular-nums text-foreground">{brl(l.resumo.investimento)}</p></div>
                    <div><p className="text-[11px] text-muted-foreground">Retorno</p><p className="text-sm tabular-nums text-foreground">{l.resumo.retorno != null ? `${l.resumo.retorno.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—"}</p></div>
                    <ChevronDown size={16} className={cn("hidden text-muted-foreground transition-transform sm:block", ab && "rotate-180")} aria-hidden="true" />
                  </button>
                  {ab && (
                    <div className="border-t border-border p-4">
                      <VendasDoCliente clientId={l.clientId} titulo="Lançamentos" onMudou={carregar} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Info size={12} className="shrink-0" aria-hidden="true" /> Investimento = gasto em anúncio nos dias fechados do mês (o mesmo número dos relatórios). Retorno só conta vendas com valor informado.
      </p>
    </section>
  );
}
