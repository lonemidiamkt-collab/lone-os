"use client";

// app/agente/AgenteLone.tsx — a área do Agente Lone. Leva 6A: o CS começa o dia AQUI.
//
// Duas vistas (?view=):
//   • Hoje (padrão)  — o feed de prioridades: uma lista só, de todas as fontes (tráfego, saúde do
//                      cliente, produção, atendimento, tarefas), com o fato e uma decisão de um toque.
//                      Era um bloco no meio do painel do agente; agora é a porta de entrada do CS. O
//                      Início (gestão) aponta para cá.
//   • Desempenho     — acurácia, erros que se repetem, o que o agente aprendeu, demandas recentes e o
//                      estilo de comunicação. O que o painel tinha, sem competir com o "o que fazer hoje".
//
// A saúde de cada cliente (quem está em risco, por quê, próxima ação) mora na Saúde da carteira
// (/saude) — o feed daqui é o que fazer hoje; a carteira é o retrato de todos.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, HeartPulse } from "lucide-react";
import Header from "@/components/Header";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import EstiloPerfis from "@/components/agente/EstiloPerfis";
import FeedPrioridades from "@/components/agente/FeedPrioridades";

interface DashData {
  ok: boolean;
  config: { iaOk: boolean; grupoInterno: boolean; gruposMonitorados: number; modoTeste: boolean };
  acuracia: {
    total: number; aprovadas: number; recusadas: number; pendentes: number;
    taxaAprovacao: number | null; taxaFalsoPositivo: number | null;
    recorrentesTipo: { tipo: string; recusas: number }[];
    recorrentesCliente: { cliente: string; recusas: number }[];
  };
  aprendizado: { cliente: string; texto: string; escopo: string; origem: string; created_at: string }[];
  recentes: { cliente: string; tipo: string; status: string; resumo: string; created_at: string }[];
  onboardings: { cliente_nome: string; status: string; created_at: string }[];
  roteiros: { cliente_nome: string; scorecard: number | null; created_at: string }[];
}

type Vista = "hoje" | "desempenho";

function fmtData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
}
const STATUS_CLS: Record<string, string> = {
  confirmada: "text-lone-success", descartada: "text-destructive", pendente: "text-lone-warning",
};

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-lone-success" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lone-hero tracking-tight ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Estado({ data }: { data: DashData | null }) {
  if (!data?.ok) return null;
  const { config } = data;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className={`rounded-full px-2.5 py-1 ${config.modoTeste ? "bg-lone-warning-bg text-lone-warning" : "bg-lone-success-bg text-lone-success"}`}>
        {config.modoTeste ? "Modo teste" : "Produção"}
      </span>
      <span className={`rounded-full px-2.5 py-1 ${config.iaOk ? "bg-lone-success-bg text-lone-success" : "bg-destructive/10 text-destructive"}`}>
        IA {config.iaOk ? "ok" : "desligada"}
      </span>
      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{config.gruposMonitorados} grupos monitorados</span>
    </div>
  );
}

function Desempenho({ data, erro, carregando }: { data: DashData | null; erro: string | null; carregando: boolean }) {
  const [busca, setBusca] = useState("");
  if (carregando && !data) return <p className="text-sm text-muted-foreground">Carregando o desempenho do agente…</p>;
  if (!data?.ok) return <p className="text-sm text-destructive">Não consegui carregar o painel do agente{erro ? `: ${erro}` : "."}</p>;

  const { acuracia: a, aprendizado, recentes } = data;
  const q = busca.trim().toLowerCase();
  const aprendFiltrado = q
    ? aprendizado.filter((r) => r.cliente.toLowerCase().includes(q) || r.texto.toLowerCase().includes(q))
    : aprendizado;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Acurácia (últimos 30 dias)</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Tile label="Sugeridas" value={a.total} />
          <Tile label="Aprovadas" value={a.aprovadas} tone="good" />
          <Tile label="Recusadas" value={a.recusadas} tone={a.recusadas > 0 ? "bad" : undefined} />
          <Tile label="Taxa de acerto" value={a.taxaAprovacao == null ? "—" : `${a.taxaAprovacao}%`} sub="meta >75%" tone={a.taxaAprovacao != null && a.taxaAprovacao >= 75 ? "good" : a.taxaAprovacao == null ? undefined : "bad"} />
          <Tile label="Falso positivo" value={a.taxaFalsoPositivo == null ? "—" : `${a.taxaFalsoPositivo}%`} sub="meta <10%" tone={a.taxaFalsoPositivo == null ? undefined : a.taxaFalsoPositivo <= 10 ? "good" : "bad"} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Áreas de melhoria (erros que se repetem)</h2>
        {a.recorrentesTipo.length === 0 && a.recorrentesCliente.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum erro recorrente — recuse (&quot;não&quot;) o que estiver errado pra eu aprender.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            {a.recorrentesTipo.map((r) => (
              <div key={r.tipo} className="flex justify-between"><span className="text-muted-foreground">tipo <span className="font-medium text-foreground">{r.tipo}</span></span><span className="text-destructive">{r.recusas} recusas</span></div>
            ))}
            {a.recorrentesCliente.map((r) => (
              <div key={r.cliente} className="flex justify-between"><span className="text-muted-foreground">cliente <span className="font-medium text-foreground">{r.cliente}</span></span><span className="text-destructive">{r.recusas} recusas</span></div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">O que o agente aprendeu</h2>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar…" aria-label="Filtrar o que o agente aprendeu"
              className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none" />
          </div>
          {aprendFiltrado.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada aprendido ainda.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {aprendFiltrado.map((r, i) => (
                <div key={i} className="rounded-lg bg-muted/50 p-2.5 text-xs">
                  <div className="flex items-center gap-2"><span className="font-medium text-foreground">{r.cliente}</span><span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{r.escopo}</span></div>
                  <div className="mt-0.5 text-muted-foreground">{r.texto}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Demandas recentes</h2>
          {recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem demandas recentes.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {recentes.map((d, i) => (
                <div key={i} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{d.cliente}</span>
                    <span className={STATUS_CLS[d.status] ?? "text-muted-foreground"}>{d.status}</span>
                  </div>
                  <div className="text-muted-foreground">{d.tipo} · {d.resumo?.slice(0, 50)} · <span className="text-[10px]">{fmtData(d.created_at)}</span></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Estilo de comunicação aprendido (revisar antes de ligar no agente) */}
      <EstiloPerfis />
    </div>
  );
}

export default function AgenteLone() {
  const params = useSearchParams();
  const router = useRouter();
  const vista: Vista = params.get("view") === "desempenho" ? "desempenho" : "hoje";
  const [data, setData] = useState<DashData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  // O estado do agente (modo teste, IA) vale para as duas vistas; carrega em paralelo, sem segurar o feed.
  useEffect(() => {
    chamar<DashData>("/api/cs/dashboard").then((r) => {
      if (r.ok) setData(r.data);
      else setErro(r.erro);
      setCarregando(false);
    });
  }, []);

  const irPara = (v: Vista) => router.replace(v === "hoje" ? "/agente" : "/agente?view=desempenho", { scroll: false });

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-auto bg-background">
      <Header title="Agente Lone" subtitle={vista === "hoje" ? "Hoje do CS" : "Desempenho do agente"} />
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-prose space-y-3">
            <div>
              <p className="mb-1 text-lone-eyebrow uppercase text-muted-foreground">Agente Lone</p>
              <h1 className="text-lone-h1 tracking-tight text-foreground">{vista === "hoje" ? "Hoje do CS" : "Desempenho do agente"}</h1>
              <p className="mt-1 text-lone-body text-muted-foreground">
                {vista === "hoje"
                  ? "Por onde começar o dia: o que precisa de você, de todas as fontes, com o fato e o que fazer. Decida com um toque."
                  : "Quanto o agente acerta, o que aprendeu com o time e como ele escreve."}
              </p>
            </div>
            <Estado data={data} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Vista">
              {(["hoje", "desempenho"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => irPara(v)}
                  className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    vista === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {v === "hoje" ? "Hoje" : "Desempenho"}
                </button>
              ))}
            </div>
            <Link href="/saude"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
              <HeartPulse size={13} aria-hidden /> Saúde da carteira <ChevronRight size={13} aria-hidden />
            </Link>
          </div>
        </header>

        {vista === "hoje" ? <FeedPrioridades /> : <Desempenho data={data} erro={erro} carregando={carregando} />}
      </div>
    </div>
  );
}
