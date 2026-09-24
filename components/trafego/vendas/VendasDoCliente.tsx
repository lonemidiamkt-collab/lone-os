"use client";

// components/trafego/vendas/VendasDoCliente.tsx — Vendas × investimento de UM cliente (Leva 7A, N9).
//
// Serve nos dois lados:
//   · PORTAL do cliente (link público): <VendasDoCliente token={token} />
//     → usa /api/trafego/vendas/portal/[token] (sem login). O cliente lança e apaga as próprias vendas.
//   · PAINEL interno (time): <VendasDoCliente clientId={id} />
//     → usa /api/trafego/vendas (com login e papel). O time lança e apaga qualquer uma.
// Mostra o custo por venda (investimento em anúncio ÷ vendas) e o retorno (faturamento ÷ investimento).
// É o dinheiro do próprio cliente — nada da agência aparece aqui.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { CANAIS_VENDA, ROTULO_CANAL, type CanalVenda, type RespostaVendasCliente } from "@/lib/trafego/vendas";

export interface VendasDoClienteProps {
  /** Link do portal (público). Use ESTE ou `clientId`, nunca os dois. */
  token?: string;
  /** Painel interno (precisa de login). */
  clientId?: string;
  /** Mostra o formulário de lançar venda (padrão: sim). */
  permitirLancar?: boolean;
  /** Título do bloco (padrão: "Vendas pelos anúncios"). */
  titulo?: string;
  className?: string;
  /** Chamado depois de lançar ou apagar (a tela de fora recarrega o resumo dela). */
  onMudou?: () => void;
}

const brl = (n: number | null | undefined, casas = 2) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function mesAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
function nomeDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Mesma assinatura do `chamar` (nunca lança), sem login quando é o portal. */
async function pedir<T>(url: string, init?: { method?: string; corpo?: unknown }, publico = false): Promise<{ ok: boolean; data: T | null; erro: string | null }> {
  if (!publico) {
    const r = await chamar<T>(url, init?.corpo, init?.method ? { method: init.method } : undefined);
    return { ok: r.ok, data: r.data, erro: r.erro };
  }
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.corpo !== undefined ? "POST" : "GET"),
      headers: init?.corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.corpo !== undefined ? JSON.stringify(init.corpo) : undefined,
    });
    const txt = await res.text().catch(() => "");
    let json: unknown = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { json = null; }
    if (!res.ok) return { ok: false, data: null, erro: (json as { error?: string } | null)?.error ?? "Não consegui completar agora." };
    return { ok: true, data: json as T, erro: null };
  } catch {
    return { ok: false, data: null, erro: "Sem conexão. Tente de novo." };
  }
}

function Kpi({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <p className="text-lone-eyebrow uppercase text-muted-foreground">{rotulo}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground">{valor}</p>
      {apoio && <p className="truncate text-[11px] text-muted-foreground">{apoio}</p>}
    </div>
  );
}

export default function VendasDoCliente({ token, clientId, permitirLancar = true, titulo = "Vendas pelos anúncios", className, onMudou }: VendasDoClienteProps) {
  const publico = !!token;
  const hoje = hojeSP();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [dados, setDados] = useState<RespostaVendasCliente | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [abrirForm, setAbrirForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ soldOn: hoje, quantity: "1", amount: "", channel: "whatsapp" as CanalVenda | "", note: "" });

  const base = token ? `/api/trafego/vendas/portal/${encodeURIComponent(token)}` : "/api/trafego/vendas";
  const urlLista = token ? `${base}?mes=${mes}` : `${base}?clientId=${clientId}&mes=${mes}`;

  const carregar = useCallback(async () => {
    if (!token && !clientId) return;
    setCarregando(true);
    const r = await pedir<RespostaVendasCliente>(urlLista, undefined, publico);
    if (r.ok && r.data) { setDados(r.data); setErro(null); } else setErro(r.erro);
    setCarregando(false);
  }, [urlLista, publico, token, clientId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    const corpo = { ...(clientId ? { clientId } : {}), soldOn: form.soldOn, quantity: form.quantity, amount: form.amount, channel: form.channel || null, note: form.note };
    const r = await pedir<{ ok: boolean }>(base, { corpo }, publico);
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setErro(null);
    setForm((f) => ({ ...f, quantity: "1", amount: "", note: "" }));
    setAbrirForm(false);
    if (form.soldOn.slice(0, 7) !== mes) setMes(form.soldOn.slice(0, 7)); else carregar();
    onMudou?.();
  }

  async function apagar(id: string) {
    if (!window.confirm("Apagar esta venda?")) return;
    const url = token ? `${base}?id=${id}` : `${base}?id=${id}&clientId=${clientId}`;
    const r = await pedir<{ ok: boolean }>(url, { method: "DELETE" }, publico);
    if (!r.ok) { setErro(r.erro); return; }
    carregar();
    onMudou?.();
  }

  const meses = useMemo(() => [hoje.slice(0, 7), mesAnterior(hoje.slice(0, 7)), mesAnterior(mesAnterior(hoje.slice(0, 7)))], [hoje]);
  const res = dados?.resumo;
  const campo = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus:border-primary focus:outline-none";

  return (
    <section className={cn("space-y-3", className)} aria-label={titulo}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lone-h2 text-foreground">
          <ShoppingBag size={16} className="text-muted-foreground" aria-hidden="true" /> {titulo}
        </h3>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`mes-vendas-${clientId ?? "portal"}`}>Mês</label>
          <select id={`mes-vendas-${clientId ?? "portal"}`} value={mes} onChange={(e) => setMes(e.target.value)}
            className="h-8 rounded-lg border border-input bg-card px-2 text-xs capitalize text-foreground focus:border-primary focus:outline-none">
            {meses.map((m) => <option key={m} value={m}>{nomeDoMes(m)}</option>)}
          </select>
          {permitirLancar && dados?.disponivel !== false && (
            <button type="button" onClick={() => setAbrirForm((v) => !v)} aria-expanded={abrirForm}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">
              <Plus size={14} aria-hidden="true" /> Registrar venda
            </button>
          )}
        </div>
      </div>

      {erro && <p role="alert" className="rounded-lg border border-lone-danger-border bg-lone-danger-bg px-3 py-2 text-xs text-lone-danger">{erro}</p>}

      {abrirForm && (
        <form onSubmit={lancar} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <label htmlFor="venda-data" className="text-[11px] font-medium text-muted-foreground">Data</label>
            <input id="venda-data" type="date" required max={hoje} value={form.soldOn} onChange={(e) => setForm({ ...form, soldOn: e.target.value })} className={campo} />
          </div>
          <div className="space-y-1">
            <label htmlFor="venda-qtd" className="text-[11px] font-medium text-muted-foreground">Quantidade</label>
            <input id="venda-qtd" type="number" min={1} max={999} step={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={campo} />
          </div>
          <div className="space-y-1">
            <label htmlFor="venda-valor" className="text-[11px] font-medium text-muted-foreground">Valor total (R$, opcional)</label>
            <input id="venda-valor" inputMode="decimal" placeholder="ex: 1.500,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={campo} />
          </div>
          <div className="space-y-1">
            <label htmlFor="venda-canal" className="text-[11px] font-medium text-muted-foreground">Onde fechou</label>
            <select id="venda-canal" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as CanalVenda | "" })} className={campo}>
              <option value="">—</option>
              {CANAIS_VENDA.map((c) => <option key={c} value={c}>{ROTULO_CANAL[c]}</option>)}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <label htmlFor="venda-obs" className="text-[11px] font-medium text-muted-foreground">Observação</label>
            <input id="venda-obs" maxLength={300} placeholder="ex: cliente veio do anúncio do sofá" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={campo} />
          </div>
          <div className="flex items-center justify-end gap-2 sm:col-span-2 lg:col-span-5">
            <button type="button" onClick={() => setAbrirForm(false)} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
            <button type="submit" disabled={salvando} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {salvando && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Salvar venda
            </button>
          </div>
        </form>
      )}

      {carregando && !dados ? (
        <div className="flex items-center justify-center py-8" role="status" aria-label="Carregando vendas"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : dados && !dados.disponivel ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">O registro de vendas ainda não está disponível.</p>
      ) : dados && res ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="Vendas" valor={res.vendas.toLocaleString("pt-BR")} apoio={nomeDoMes(mes)} />
            <Kpi rotulo="Custo por venda" valor={brl(res.custoPorVenda)} apoio={res.investimento != null ? `${brl(res.investimento, 0)} investidos em anúncio` : undefined} />
            <Kpi rotulo="Faturamento" valor={brl(res.faturamento, 0)} apoio={res.ticketMedio != null ? `ticket médio ${brl(res.ticketMedio, 0)}` : "informe o valor para ver"} />
            <Kpi rotulo="Retorno" valor={res.retorno != null ? `${res.retorno.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : "—"} apoio="faturamento ÷ investimento" />
          </div>
          {dados.vendas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma venda registrada em {nomeDoMes(mes)}.{permitirLancar ? " Registre as vendas que vieram dos anúncios para ver o custo por venda." : ""}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {dados.vendas.map((v) => {
                const podeApagar = !publico || v.source === "portal";
                return (
                  <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-12 shrink-0 text-xs font-medium tabular-nums text-foreground">{ddmm(v.sold_on)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {v.quantity} {v.quantity === 1 ? "venda" : "vendas"}
                        {v.amount != null && <span className="tabular-nums"> · {brl(v.amount)}</span>}
                        {v.channel && <span className="text-muted-foreground"> · {ROTULO_CANAL[v.channel as CanalVenda] ?? v.channel}</span>}
                      </p>
                      {(v.note || !publico) && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {v.note}{v.note && !publico ? " · " : ""}{!publico ? (v.source === "portal" ? "lançada pelo cliente" : `lançada por ${v.created_by ?? "time"}`) : ""}
                        </p>
                      )}
                    </div>
                    {podeApagar && (
                      <button type="button" onClick={() => apagar(v.id)} aria-label="Apagar venda" title="Apagar"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-lone-danger-bg hover:text-lone-danger">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
