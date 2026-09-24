"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

// Creative Operations — a visão da gestão sobre a operação criativa (30 dias). Só admin/gestor.
interface Dados {
  periodo: string; dia: string | null;
  demandas: { pedidas: number; entregues: number; viaIa: number; atrasadas: number; tempoMedioDias: number | null; porDesigner: Record<string, { pedidos: number; entregues: number; atrasados: number }> };
  testes: { criados: number; noAr: number; validados: number; refutados: number };
  criativos: { avaliados: number; vencedores: number; criticos: number; clientesComVencedor: number };
  alertas: { vencedorSemTeste: string[]; semCriativoNovo30d: string[]; contasTrafego: number };
  error?: string;
}

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-lone-success" : "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function OperacaoCriativa() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { authedFetch("/api/traffic/criativos/operacao").then(async (r) => { const j = (await r.json()) as Dados; if (!r.ok) setErro(j.error ?? `HTTP ${r.status}`); else setD(j); }).catch(() => setErro("Não consegui carregar.")); }, []);
  if (erro) return <p className="text-xs text-destructive">{erro}</p>;
  if (!d) return null;
  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4">
      <h2 className="text-sm font-semibold text-foreground">Operação criativa — últimos {d.periodo}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Tile label="Demandas pedidas" value={d.demandas.pedidas} sub={`${d.demandas.viaIa} via replicação`} />
        <Tile label="Entregues" value={d.demandas.entregues} sub={d.demandas.tempoMedioDias != null ? `${d.demandas.tempoMedioDias} dias em média` : undefined} />
        <Tile label="Atrasadas" value={d.demandas.atrasadas} tone={d.demandas.atrasadas ? "bad" : undefined} />
        <Tile label="Vencedores hoje" value={d.criativos.vencedores} sub={`em ${d.criativos.clientesComVencedor} clientes`} tone="good" />
        <Tile label="Críticos hoje" value={d.criativos.criticos} tone={d.criativos.criticos ? "bad" : undefined} />
        <Tile label="Testes criados" value={d.testes.criados} sub={`${d.testes.noAr} no ar`} />
        <Tile label="Validados" value={d.testes.validados} tone="good" />
        <Tile label="Refutados" value={d.testes.refutados} />
      </div>
      <div className="mt-3 grid gap-3 text-[11px] md:grid-cols-3">
        <div>
          <p className="font-medium text-foreground">Por designer</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">{Object.entries(d.demandas.porDesigner).map(([k, v]) => <li key={k}>{k}: {v.entregues}/{v.pedidos} entregues{v.atrasados ? <span className="text-destructive"> · {v.atrasados} atrasadas</span> : null}</li>)}</ul>
        </div>
        <div>
          <p className="font-medium text-foreground">Vencedor sem teste ({d.alertas.vencedorSemTeste.length})</p>
          <p className="mt-1 text-muted-foreground">{d.alertas.vencedorSemTeste.length ? d.alertas.vencedorSemTeste.join(" · ") : "todos os vencedores já têm variação"}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">Sem criativo novo há 30 dias ({d.alertas.semCriativoNovo30d.length}/{d.alertas.contasTrafego})</p>
          <p className="mt-1 text-muted-foreground">{d.alertas.semCriativoNovo30d.length ? d.alertas.semCriativoNovo30d.join(" · ") : "todas as contas tiveram criativo novo"}</p>
        </div>
      </div>
    </section>
  );
}
