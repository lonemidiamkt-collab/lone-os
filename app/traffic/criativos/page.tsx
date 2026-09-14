"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useRole } from "@/lib/context/RoleContext";

// /traffic/criativos — SAÚDE DOS CRIATIVOS, em sombra. O motor avalia todo dia; o gestor diz se
// concorda. Enquanto a precisão não passar de 80%, nada disto vira recomendação nem aviso.

interface Item {
  ad_id: string; cliente: string; ad_name: string | null; estado: string; severidade: number; confianca: number;
  evidencias: string[] | null; vencedor: boolean; vencedor_evidencias: string[] | null; rotulo: string | null;
  tipo: string | null; thumb: string | null; texto: string | null; titulo: string | null;
  amostra: { gasto7d?: number; conversas7d?: number; diasRodando?: number } | null;
}
interface Resposta { dia: string | null; itens: Item[]; precisao: { concordo: number; total: number; taxa: number } | null; error?: string }

const ESTADO: Record<string, { rotulo: string; cls: string }> = {
  CRITICAL: { rotulo: "Crítico", cls: "bg-destructive/10 text-destructive" },
  FATIGUE_PROBABLE: { rotulo: "Cansaço provável", cls: "bg-lone-warning-bg text-lone-warning" },
  FATIGUE_POSSIBLE: { rotulo: "Cansaço possível", cls: "bg-lone-warning-bg text-lone-warning" },
  WATCH: { rotulo: "Observar", cls: "bg-muted text-muted-foreground" },
  HEALTHY: { rotulo: "Saudável", cls: "bg-emerald-500/10 text-emerald-600" },
};
const ORDEM = ["CRITICAL", "FATIGUE_PROBABLE", "FATIGUE_POSSIBLE", "WATCH", "HEALTHY"];
const brl = (n?: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function CriativosPage() {
  const { role } = useRole();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>("todos");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await authedFetch("/api/traffic/criativos");
      const d = (await r.json()) as Resposta;
      if (!r.ok) { setErro(d.error ?? `HTTP ${r.status}`); return; }
      setDados(d); setErro(null);
    } catch { setErro("Não consegui carregar."); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const rotular = async (adId: string, rotulo: "concordo" | "discordo" | "sem_opiniao") => {
    if (!dados?.dia) return;
    setOcupado(adId);
    try {
      const r = await authedFetch("/api/traffic/criativos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adId, dia: dados.dia, rotulo }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErro(d?.error ?? `HTTP ${r.status}`); return; }
      setDados((prev) => prev ? { ...prev, itens: prev.itens.map((i) => (i.ad_id === adId ? { ...i, rotulo } : i)) } : prev);
    } finally { setOcupado(null); }
  };

  if (!["admin", "manager", "traffic"].includes(role)) {
    return <div className="p-6 text-sm text-muted-foreground">Área do tráfego.</div>;
  }

  const itens = dados?.itens ?? [];
  const porEstado: Record<string, number> = {};
  for (const i of itens) porEstado[i.estado] = (porEstado[i.estado] ?? 0) + 1;
  const vencedores = itens.filter((i) => i.vencedor).length;
  const lista = itens.filter((i) => filtro === "todos" ? true : filtro === "vencedores" ? i.vencedor : i.estado === filtro)
    .sort((a, b) => ORDEM.indexOf(a.estado) - ORDEM.indexOf(b.estado) || b.severidade - a.severidade);
  const rotulados = itens.filter((i) => i.rotulo).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">🎨 Saúde dos criativos</h1>
        <p className="text-sm text-muted-foreground">
          Em <span className="font-medium text-foreground">sombra</span>: o motor avalia todo dia às 07:20 e ninguém é avisado. Você diz se concorda. Quando a precisão passar de 80%, entra no feed.
          {dados?.dia && <> · Avaliação de <span className="font-medium text-foreground">{dados.dia.split("-").reverse().join("/")}</span></>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {ORDEM.map((e) => (
            <button key={e} onClick={() => setFiltro(filtro === e ? "todos" : e)} className={`rounded-full px-2.5 py-1 ${ESTADO[e].cls} ${filtro === e ? "ring-2 ring-primary/40" : ""}`}>
              {ESTADO[e].rotulo} {porEstado[e] ?? 0}
            </button>
          ))}
          <button onClick={() => setFiltro(filtro === "vencedores" ? "todos" : "vencedores")} className={`rounded-full bg-primary/10 px-2.5 py-1 text-primary ${filtro === "vencedores" ? "ring-2 ring-primary/40" : ""}`}>🏆 Vencedores {vencedores}</button>
          <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            Rotulados hoje: {rotulados}/{itens.length}
            {dados?.precisao && <> · Precisão acumulada: <span className={`font-medium ${dados.precisao.taxa >= 80 ? "text-emerald-600" : "text-foreground"}`}>{dados.precisao.taxa}%</span> ({dados.precisao.concordo}/{dados.precisao.total})</>}
          </span>
        </div>
        {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
      </header>

      {dados && itens.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma avaliação ainda. A primeira roda no próximo sync (07:20).</p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {lista.map((i) => {
          const est = ESTADO[i.estado] ?? { rotulo: i.estado, cls: "bg-muted text-muted-foreground" };
          return (
            <li key={i.ad_id} className={`flex gap-3 rounded-xl border bg-card p-3 ${i.rotulo ? "border-border/60 opacity-80" : "border-border"}`}>
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {i.thumb ? <img src={i.thumb} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">sem miniatura</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${est.cls}`}>{est.rotulo}</span>
                  {i.vencedor && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">🏆 vencedor</span>}
                  <span className="truncate text-xs font-medium text-foreground">{i.cliente}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground" title="confiança">{Math.round(i.confianca * 100)}%</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={i.ad_name ?? ""}>{i.ad_name ?? i.ad_id}{i.tipo ? ` · ${i.tipo.toLowerCase()}` : ""}</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-foreground/80">
                  {(i.vencedor ? i.vencedor_evidencias : i.evidencias)?.slice(0, 3).map((e, k) => <li key={k}>• {e}</li>)}
                </ul>
                {i.amostra && <p className="mt-1 text-[10px] text-muted-foreground">7 dias: {brl(i.amostra.gasto7d)} · {i.amostra.conversas7d ?? 0} conversas · rodando há {i.amostra.diasRodando ?? "?"} dias</p>}
                <div className="mt-2 flex gap-1.5">
                  {(["concordo", "discordo"] as const).map((r) => (
                    <button key={r} onClick={() => rotular(i.ad_id, r)} disabled={ocupado === i.ad_id}
                      className={`rounded-lg px-2.5 py-1 text-[11px] transition disabled:opacity-50 ${i.rotulo === r ? (r === "concordo" ? "bg-emerald-500 text-white" : "bg-destructive text-white") : "border border-border text-muted-foreground hover:text-foreground"}`}>
                      {r === "concordo" ? "Concordo" : "Discordo"}
                    </button>
                  ))}
                  <button onClick={() => rotular(i.ad_id, "sem_opiniao")} disabled={ocupado === i.ad_id} className={`rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground ${i.rotulo === "sem_opiniao" ? "underline" : ""}`}>não sei</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
