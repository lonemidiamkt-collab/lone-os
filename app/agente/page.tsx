"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";

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
  pendentes: Pendente[];
  recentes: { cliente: string; tipo: string; status: string; resumo: string; created_at: string }[];
  onboardings: { cliente_nome: string; status: string; created_at: string }[];
  roteiros: { cliente_nome: string; scorecard: number | null; created_at: string }[];
}

interface Pendente {
  id: string;
  cliente: string;
  tipo: string;
  urgencia: string;
  resumo: string;
  responsavel: string | null;
  created_at: string;
}

const FUNCOES = [
  ["👂", "Ouve os grupos", "Texto, áudio (transcreve) e legendas de imagem/vídeo"],
  ["🧠", "Classifica demandas", "4 filtros (origem/papel/contexto/coerência) + autoanálise; silêncio > falso-positivo"],
  ["📋", "Sugere e cria cards", "Posta no grupo; você responde ok / não / ajustar"],
  ["🎬", "Gera roteiros", "On-demand ('Lone, roteiro pro X') + proativo na segunda, em PDF"],
  ["🚪", "Onboarding de cliente novo", "Conduz as perguntas no grupo do cliente e monta o briefing"],
  ["🔴", "Escala reclamações", "Reclamação vai pra gestão (Julio/Roberto), não pro social"],
  ["🩺", "Vigia saúde / churn", "Avisa clientes em risco toda segunda"],
  ["📊", "Mede a própria acurácia", "Relatório de autoavaliação semanal"],
  ["🌴", "Respeita férias", "Não roteia (avisa) demanda pra quem está fora"],
  ["📚", "Aprende com você", "Suas recusas viram aprendizado e ele evita repetir"],
] as const;

function fmtData(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const STATUS_CLS: Record<string, string> = {
  confirmada: "text-emerald-500", descartada: "text-destructive", pendente: "text-amber-500",
};

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function AgentePage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // id da demanda sendo decidida
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    authedFetch("/api/cs/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DashData | null) => {
        setData(d);
        setPendentes(d?.pendentes ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Decide uma pendência PELA PLATAFORMA (espelha o "ok/não" do WhatsApp): cria o card ou descarta,
  // e some da lista na hora (otimista). O agente avisa o grupo interno pra manter os dois lados juntos.
  async function decidir(id: string, acao: "confirmar" | "descartar") {
    setBusy(id);
    setErro(null);
    try {
      const r = await authedFetch("/api/cs/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
      if (r.ok) setPendentes((prev) => prev.filter((p) => p.id !== id));
      else setErro("Não consegui registrar — tenta de novo.");
    } catch {
      setErro("Falha de conexão — tenta de novo.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando o agente…</div>;
  if (!data?.ok) return <div className="p-8 text-sm text-destructive">Não consegui carregar o painel do agente.</div>;

  const { config, acuracia: a, aprendizado, recentes } = data;
  const q = busca.trim().toLowerCase();
  const aprendFiltrado = q
    ? aprendizado.filter((r) => r.cliente.toLowerCase().includes(q) || r.texto.toLowerCase().includes(q))
    : aprendizado;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold text-foreground">🤖 Agente Lone</h1>
        <p className="text-sm text-muted-foreground">Visão geral, aprendizado e onde melhorar.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 ${config.modoTeste ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
            {config.modoTeste ? "🧪 Modo teste" : "🟢 Produção"}
          </span>
          <span className={`rounded-full px-2.5 py-1 ${config.iaOk ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
            IA {config.iaOk ? "ok" : "off"}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{config.gruposMonitorados} grupos monitorados</span>
        </div>
      </header>

      {/* Pendentes — precisam do ok/não da equipe. Decidir aqui espelha o "ok" do WhatsApp. */}
      {pendentes.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">⏳ Esperando você ({pendentes.length})</h2>
            {erro && <span className="text-xs text-destructive">{erro}</span>}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">Sugestões que o agente captou e ainda não viraram card. Criar aqui é o mesmo que responder <span className="font-medium">ok</span> no grupo.</p>
          <div className="space-y-2">
            {pendentes.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{p.cliente}</span>
                    {p.urgencia === "alta" && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">urgente</span>}
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{p.tipo}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.resumo}{p.responsavel ? ` · ${p.responsavel}` : ""} · <span className="text-[10px]">{fmtData(p.created_at)}</span></div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => decidir(p.id, "confirmar")}
                    disabled={busy === p.id}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50">
                    {busy === p.id ? "…" : "Criar card"}
                  </button>
                  <button
                    onClick={() => decidir(p.id, "descartar")}
                    disabled={busy === p.id}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50">
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Acurácia */}
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

      {/* Áreas de melhoria */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">⚠️ Áreas de melhoria (erros que se repetem)</h2>
        {a.recorrentesTipo.length === 0 && a.recorrentesCliente.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum erro recorrente — recuse ("não") o que estiver errado pra eu aprender. 🎯</p>
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
        {/* Aprendizado */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">📚 O que o agente aprendeu</h2>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="filtrar…"
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

        {/* Atividade recente */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">🕑 Demandas recentes</h2>
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

      {/* Funções */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">🛠️ O que o agente faz</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FUNCOES.map(([ic, t, d]) => (
            <div key={t} className="flex gap-3 rounded-xl border border-border bg-card p-3">
              <span className="text-lg">{ic}</span>
              <div><div className="text-sm font-medium text-foreground">{t}</div><div className="text-xs text-muted-foreground">{d}</div></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
