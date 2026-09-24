"use client";

// components/saude/SaudeDaCarteira.tsx — a tela ÚNICA de saúde da carteira (Leva 6A).
//
// Substitui o Termômetro de Churn, a Jornada CS e a Carteira, que davam três respostas diferentes
// para "este cliente está em risco?". Aqui: a distribuição da carteira por nível (modelo único, lib/
// saude/carteira.ts), e uma fila pior-primeiro em que cada cliente mostra o nível, os 2–3 porquês, o
// dono e a próxima ação (sugerida pelo feed de prioridades; a pessoa só confirma ou edita).
//
// Três vistas: Fila (o padrão), Por responsável (a distribuição por pessoa, que era a Carteira) e
// Jornada (a etapa de cada cliente, que era a Jornada CS). Estado na URL: ?view, ?nivel, ?resp, ?dono.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, ChevronDown, ChevronRight, HeartPulse, Loader2, MessageCircle, RefreshCcw, Sun,
  TrendingDown, TrendingUp,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import ProximaAcaoEditor from "@/components/saude/ProximaAcaoEditor";
import FichaRelacionamento from "@/components/saude/FichaRelacionamento";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { estiloDasIniciais, iniciais } from "@/lib/notificacoes/visual";
import { ROTULO_NIVEL_SAUDE, type NivelSaude } from "@/lib/scores/health";
import {
  DIAS_ESFRIANDO, ETAPAS_JORNADA, FILTROS_NIVEL, ROTULO_ETAPA, ROTULO_FILTRO_NIVEL,
  distribuir, ehDaPessoa, filtroDaUrl, passaNoFiltro, type FiltroNivel,
} from "@/lib/saude/carteira";
import type { LinhaSaude, RespostaSaude } from "@/lib/saude/tipos";
import type { ProximaAcao } from "@/lib/clientes/proxima-acao";

type Vista = "fila" | "responsaveis" | "jornada";
const VISTAS: { id: Vista; rotulo: string }[] = [
  { id: "fila", rotulo: "Fila" },
  { id: "responsaveis", rotulo: "Por responsável" },
  { id: "jornada", rotulo: "Jornada" },
];

const NIVEL_ESTILO: Record<NivelSaude, { selo: string; barra: string; ponto: string }> = {
  risco: { selo: "border-lone-danger-border bg-lone-danger-bg text-lone-danger", barra: "bg-lone-danger", ponto: "bg-lone-danger" },
  atencao: { selo: "border-lone-warning-border bg-lone-warning-bg text-lone-warning", barra: "bg-lone-warning", ponto: "bg-lone-warning" },
  saudavel: { selo: "border-lone-success-border bg-lone-success-bg text-lone-success", barra: "bg-lone-success", ponto: "bg-lone-success" },
  sem_dado: { selo: "border-border bg-muted text-muted-foreground", barra: "bg-muted-foreground", ponto: "bg-muted-foreground" },
};

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// ── Peças ───────────────────────────────────────────────────────────────────

function SeloNivel({ nivel, score }: { nivel: NivelSaude; score: number | null }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", NIVEL_ESTILO[nivel].selo)}>
      {ROTULO_NIVEL_SAUDE[nivel]}
      {score !== null && <span className="tabular-nums">· {score}</span>}
    </span>
  );
}

function Rosto({ nome, logo }: { nome: string; logo: string | null }) {
  return (
    <Avatar className="h-9 w-9 rounded-lg bg-card ring-1 ring-border" title={nome}>
      {logo && <AvatarImage src={logo} alt="" className="object-contain p-0.5" />}
      <AvatarFallback delayMs={logo ? 500 : undefined} className="rounded-[inherit] text-[11px] font-semibold" style={estiloDasIniciais(nome)}>
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

function Tendencia({ l }: { l: LinhaSaude }) {
  if (!l.tendencia || l.tendencia === "estavel" || l.delta === null) return null;
  const piorou = l.tendencia === "piorando";
  const Icone = piorou ? TrendingDown : TrendingUp;
  return (
    <span className={cn("inline-flex items-center gap-1 text-lone-caption", piorou ? "text-lone-danger" : "text-lone-success")}
      title="Variação da nota nos últimos 14 dias">
      <Icone size={12} aria-hidden /> {l.delta > 0 ? "+" : ""}{l.delta} em 14 dias
    </span>
  );
}

// ── Distribuição ────────────────────────────────────────────────────────────

function Distribuicao({ linhas, filtro, aoFiltrar }: {
  linhas: LinhaSaude[]; filtro: FiltroNivel; aoFiltrar: (f: FiltroNivel) => void;
}) {
  const d = distribuir(linhas);
  const total = d.total || 1;
  const confirmadas = linhas.filter((l) => l.pedeAtencao && l.proximaAcao.estado === "confirmada").length;
  const faixas: { f: FiltroNivel; nivel: NivelSaude; n: number }[] = [
    { f: "risco", nivel: "risco", n: d.risco },
    { f: "atencao", nivel: "atencao", n: d.atencao },
    { f: "saudavel", nivel: "saudavel", n: d.saudavel },
    { f: "sem_dado", nivel: "sem_dado", n: d.semDado },
  ];
  return (
    <section aria-labelledby="titulo-distribuicao" className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="mb-1 text-lone-eyebrow uppercase text-muted-foreground">Carteira</p>
          <h2 id="titulo-distribuicao" className="text-lone-h2 tracking-tight text-foreground">
            {d.total === 1 ? "1 cliente" : `${d.total} clientes`} por saúde
          </h2>
        </div>
        <p className="text-lone-caption text-muted-foreground">
          <span className="tabular-nums text-foreground">{d.pedemAtencao}</span> pedem atenção ·{" "}
          <span className="tabular-nums text-foreground">{d.esfriando}</span> calados há {DIAS_ESFRIANDO}+ dias ·{" "}
          <span className="tabular-nums text-foreground">{confirmadas}</span> com próxima ação confirmada
        </p>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img"
        aria-label={faixas.map((x) => `${x.n} ${ROTULO_NIVEL_SAUDE[x.nivel].toLowerCase()}`).join(", ")}>
        {faixas.map((x) => x.n > 0 && <span key={x.f} className={NIVEL_ESTILO[x.nivel].barra} style={{ width: `${(x.n / total) * 100}%` }} />)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {faixas.map((x) => (
          <button key={x.f} type="button" onClick={() => aoFiltrar(filtro === x.f ? "pedem_atencao" : x.f)} aria-pressed={filtro === x.f}
            className={cn("rounded-lg border px-3 py-2 text-left transition-colors",
              filtro === x.f ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/60")}>
            <span className="flex items-center gap-2 text-lone-caption text-muted-foreground">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", NIVEL_ESTILO[x.nivel].ponto)} aria-hidden />
              {ROTULO_NIVEL_SAUDE[x.nivel]}
            </span>
            <span className={cn("mt-0.5 block text-lone-h1 tabular-nums tracking-tight", x.n > 0 ? "text-foreground" : "text-muted-foreground")}>{x.n}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Fila ────────────────────────────────────────────────────────────────────

function LinhaCarteira({ l, aoMudarAcao, aoMudarRel }: {
  l: LinhaSaude;
  aoMudarAcao: (id: string, pa: ProximaAcao) => void;
  aoMudarRel: (id: string, r: NonNullable<LinhaSaude["relacionamento"]>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const barra = l.severidade === "critical" ? "bg-lone-danger" : l.severidade === "warning" ? "bg-lone-warning" : null;
  return (
    <li className="relative rounded-xl border border-border bg-card">
      {barra && <span className={cn("absolute bottom-3 left-0 top-3 w-[3px] rounded-full", barra)} aria-hidden />}
      <div className="flex items-start gap-3 py-3 pl-4 pr-3">
        <Rosto nome={l.nome} logo={l.logo} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/clients/${l.id}`} className="text-lone-body font-medium text-foreground hover:underline">{l.nome}</Link>
            <SeloNivel nivel={l.nivel} score={l.score} />
            <Tendencia l={l} />
            {l.pausado && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Pausado</span>}
            <span className="ml-auto text-lone-caption text-muted-foreground">{l.dono ?? "Sem responsável"}</span>
          </div>
          {l.motivos.length > 0 && (
            <p className="text-lone-caption text-muted-foreground">{maiuscula(l.motivos.join(" · "))}</p>
          )}
          <ProximaAcaoEditor clientId={l.id} proximaAcao={l.proximaAcao} podeEditar={l.podeEditar}
            onAtualizar={(pa) => aoMudarAcao(l.id, pa)} />
        </div>
        <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
          aria-label={aberto ? `Fechar detalhes de ${l.nome}` : `Abrir detalhes de ${l.nome}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ChevronDown size={16} className={cn("transition-transform", !aberto && "-rotate-90")} aria-hidden />
        </button>
      </div>

      {aberto && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-lone-eyebrow uppercase text-muted-foreground">
                Composição da nota{l.cobertura !== null ? ` · ${l.cobertura}% medido` : ""}
              </p>
              {l.componentes.length === 0 ? (
                <p className="text-lone-caption text-muted-foreground">Sem composição gravada ainda.</p>
              ) : (
                <ul className="space-y-1.5">
                  {l.componentes.map((c) => (
                    <li key={c.chave} className="flex items-center gap-3 text-lone-caption">
                      <span className="w-40 shrink-0 truncate text-muted-foreground">{c.nome}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        {c.valor !== null && (
                          <span className={cn("block h-full rounded-full", c.valor < 60 ? "bg-lone-danger" : c.valor < 75 ? "bg-lone-warning" : "bg-lone-success")}
                            style={{ width: `${Math.max(2, Math.min(100, c.valor))}%` }} />
                        )}
                      </span>
                      <span className={cn("w-12 shrink-0 text-right tabular-nums", c.valor === null ? "text-muted-foreground" : "text-foreground")}>
                        {c.valor === null ? "sem fonte" : c.valor}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {l.calculadaEm && <p className="mt-2 text-lone-caption text-muted-foreground">Nota calculada em {dataHora(l.calculadaEm)}.</p>}
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-lone-eyebrow uppercase text-muted-foreground">Quem cuida</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-lone-caption">
                  <dt className="text-muted-foreground">Social</dt><dd className="text-foreground">{l.social ?? "—"}</dd>
                  <dt className="text-muted-foreground">Tráfego</dt><dd className="text-foreground">{l.trafego ?? "—"}</dd>
                  <dt className="text-muted-foreground">Designer</dt><dd className="text-foreground">{l.designer ?? "—"}</dd>
                  <dt className="text-muted-foreground">Etapa</dt><dd className="text-foreground">{ROTULO_ETAPA[l.etapa]}</dd>
                </dl>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/clients/${l.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
                  Abrir ficha <ChevronRight size={13} aria-hidden />
                </Link>
                <Link href={`/clients/${l.id}?tab=chat`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
                  <MessageCircle size={13} aria-hidden /> Conversa
                </Link>
              </div>
            </div>
          </div>
          {l.relacionamento && (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 text-lone-h2 tracking-tight text-foreground">Ficha de relacionamento</p>
              <FichaRelacionamento clientId={l.id} nome={l.nome} relacionamento={l.relacionamento}
                onSalvo={(r) => aoMudarRel(l.id, r)} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── Por responsável (era a Carteira) ────────────────────────────────────────

function PorResponsavel({ linhas, aoEscolher }: { linhas: LinhaSaude[]; aoEscolher: (dono: string) => void }) {
  const porDono = useMemo(() => {
    const m = new Map<string, LinhaSaude[]>();
    for (const l of linhas) {
      const k = l.dono ?? "Sem responsável";
      (m.get(k) ?? m.set(k, []).get(k)!).push(l);
    }
    return [...m.entries()]
      .map(([dono, ls]) => ({ dono, ls, d: distribuir(ls), semAcao: ls.filter((l) => l.pedeAtencao && l.proximaAcao.estado !== "confirmada").length }))
      .sort((a, b) => b.d.risco - a.d.risco || b.d.pedemAtencao - a.d.pedemAtencao || a.dono.localeCompare(b.dono, "pt-BR"));
  }, [linhas]);

  const celula = "px-3 py-2.5 text-right tabular-nums";
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-lone-body">
        <thead>
          <tr className="border-b border-border text-lone-eyebrow uppercase text-muted-foreground">
            <th className="px-3 py-2.5 text-left font-medium">Responsável</th>
            <th className={cn(celula, "font-medium")}>Clientes</th>
            <th className={cn(celula, "font-medium")}>{ROTULO_NIVEL_SAUDE.risco}</th>
            <th className={cn(celula, "font-medium")}>{ROTULO_NIVEL_SAUDE.atencao}</th>
            <th className={cn(celula, "font-medium")}>Calados</th>
            <th className={cn(celula, "font-medium")}>{ROTULO_NIVEL_SAUDE.saudavel}</th>
            <th className={cn(celula, "font-medium")}>Sem dado</th>
            <th className={cn(celula, "font-medium")} title="Pedem atenção e ainda não têm próxima ação confirmada">A confirmar</th>
          </tr>
        </thead>
        <tbody>
          {porDono.map(({ dono, ls, d, semAcao }) => (
            <tr key={dono} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
              <td className="px-3 py-2.5">
                <button type="button" onClick={() => aoEscolher(dono)} className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary">
                  {dono} <ChevronRight size={13} className="text-muted-foreground" aria-hidden />
                </button>
              </td>
              <td className={cn(celula, "text-foreground")}>{ls.length}</td>
              <td className={cn(celula, d.risco ? "text-lone-danger" : "text-muted-foreground")}>{d.risco}</td>
              <td className={cn(celula, d.atencao ? "text-lone-warning" : "text-muted-foreground")}>{d.atencao}</td>
              <td className={cn(celula, d.esfriando ? "text-foreground" : "text-muted-foreground")}>{d.esfriando}</td>
              <td className={cn(celula, "text-muted-foreground")}>{d.saudavel}</td>
              <td className={cn(celula, "text-muted-foreground")}>{d.semDado}</td>
              <td className={cn(celula, semAcao ? "font-medium text-foreground" : "text-muted-foreground")}>{semAcao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Jornada (era a Jornada CS) ──────────────────────────────────────────────

function Jornada({ linhas }: { linhas: LinhaSaude[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ETAPAS_JORNADA.map((etapa) => {
        const ls = linhas.filter((l) => l.etapa === etapa);
        return (
          <section key={etapa} aria-labelledby={`etapa-${etapa}`} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 id={`etapa-${etapa}`} className="text-lone-h2 tracking-tight text-foreground">{ROTULO_ETAPA[etapa]}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-lone-caption tabular-nums text-muted-foreground">{ls.length}</span>
            </div>
            {ls.length === 0 ? (
              <p className="text-lone-caption text-muted-foreground">Ninguém nesta etapa.</p>
            ) : (
              <ul className="space-y-2">
                {ls.map((l) => (
                  <li key={l.id} className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", NIVEL_ESTILO[l.nivel].ponto)} title={ROTULO_NIVEL_SAUDE[l.nivel]} aria-hidden />
                      <Link href={`/clients/${l.id}`} className="truncate text-lone-body text-foreground hover:underline">{l.nome}</Link>
                      {l.score !== null && <span className="ml-auto shrink-0 text-lone-caption tabular-nums text-muted-foreground">{l.score}</span>}
                    </div>
                    {l.proximaAcao.texto && (
                      <p className="truncate pl-4 text-lone-caption text-muted-foreground" title={l.proximaAcao.texto}>
                        {l.proximaAcao.estado === "sugerida" ? "Sugerida: " : ""}{l.proximaAcao.texto}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────────────────────

export default function SaudeDaCarteira() {
  const params = useSearchParams();
  const router = useRouter();
  const [dados, setDados] = useState<RespostaSaude | null>(null);
  const [erro, setErro] = useState<{ msg: string; semAcesso: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recalculando, setRecalculando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await chamar<RespostaSaude>("/api/saude/carteira");
    if (r.ok && r.data) { setDados(r.data); setErro(null); }
    else setErro({ msg: r.erro ?? "Não consegui carregar a saúde da carteira.", semAcesso: r.status === 403 });
    setCarregando(false);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const gestao = !!dados?.eu.gestao;
  const vistaUrl = params.get("view");
  const vista: Vista = VISTAS.some((v) => v.id === vistaUrl) ? (vistaUrl as Vista) : "fila";
  const filtro: FiltroNivel = filtroDaUrl(params.get("nivel")) ?? "pedem_atencao";
  const respUrl = params.get("resp");
  const resp: "mine" | "all" = respUrl === "mine" || respUrl === "all" ? respUrl : gestao ? "all" : "mine";
  const dono = params.get("dono") ?? "";

  const mudar = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") p.delete(k); else p.set(k, v); }
    const q = p.toString();
    router.replace(q ? `/saude?${q}` : "/saude", { scroll: false });
  }, [params, router]);

  // Escopo (Meus/Todos + responsável) vale para a distribuição e as três vistas; o nível, só para a fila.
  const escopo = useMemo(() => (dados?.linhas ?? []).filter((l) =>
    (resp === "all" || ehDaPessoa(l, dados?.eu.nome)) && (!dono || (l.dono ?? "Sem responsável") === dono)), [dados, resp, dono]);
  const fila = useMemo(() => escopo.filter((l) => passaNoFiltro(l, filtro)), [escopo, filtro]);

  const aoMudarAcao = (id: string, pa: ProximaAcao) =>
    setDados((d) => d ? { ...d, linhas: d.linhas.map((l) => (l.id === id ? { ...l, proximaAcao: pa } : l)) } : d);
  const aoMudarRel = (id: string, r: NonNullable<LinhaSaude["relacionamento"]>) =>
    setDados((d) => d ? { ...d, linhas: d.linhas.map((l) => (l.id === id ? { ...l, relacionamento: r } : l)) } : d);

  const recalcular = async () => {
    setRecalculando(true);
    // O escritor único da saúde (100 = saudável). Roda sozinho todo dia às 06:20.
    const r = await chamar("/api/scores?gravar=1");
    setRecalculando(false);
    if (!r.ok) { toast.error(r.erro ?? "Não consegui recalcular a saúde."); return; }
    toast.success("Saúde recalculada.");
    void carregar();
  };

  const notaVelha = !!dados?.notaDoDia && dados.notaDoDia < hojeSP()
    && Date.parse(`${hojeSP()}T12:00:00Z`) - Date.parse(`${dados.notaDoDia}T12:00:00Z`) > 86_400_000;

  const seletor = "h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-prose">
          <p className="mb-1 text-lone-eyebrow uppercase text-muted-foreground">Clientes</p>
          <h1 className="flex items-center gap-2 text-lone-h1 tracking-tight text-foreground">
            <HeartPulse size={20} className="text-primary" aria-hidden /> Saúde da carteira
          </h1>
          <p className="mt-1 text-lone-body text-muted-foreground">
            O nível de cada cliente pela nota de saúde (100 = saudável), o porquê e a próxima ação. É a mesma régua
            do Início, do aviso de segunda e do filtro Em Risco de Clientes.
          </p>
        </div>
        {gestao && (
          <div className="flex flex-wrap gap-2">
            <Link href="/agente"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
              <Sun size={15} aria-hidden /> Hoje do CS
            </Link>
            <button type="button" onClick={() => void recalcular()} disabled={recalculando}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50">
              {recalculando ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCcw size={15} aria-hidden />}
              {recalculando ? "Recalculando…" : "Recalcular"}
            </button>
          </div>
        )}
      </div>

      {erro && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3">
          <AlertTriangle size={15} className="shrink-0 text-lone-danger" aria-hidden />
          <p className="flex-1 text-lone-body text-lone-danger">
            {erro.semAcesso ? "A saúde da carteira é da gestão e do social." : erro.msg}
          </p>
          {!erro.semAcesso && (
            <button type="button" onClick={() => void carregar()} className="text-xs font-medium text-lone-danger underline-offset-4 hover:underline">
              Tentar de novo
            </button>
          )}
        </div>
      )}

      {dados && (dados.falhas.length > 0 || notaVelha) && (
        <p className="flex items-start gap-2 rounded-xl border border-lone-warning-border bg-lone-warning-bg px-4 py-3 text-lone-caption text-lone-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
          {[
            dados.falhas.length ? `Não consegui ler ${dados.falhas.join(", ")} — o que aparece pode estar incompleto.` : "",
            notaVelha ? `A nota mais recente é de ${dados.notaDoDia!.slice(8, 10)}/${dados.notaDoDia!.slice(5, 7)}: o recálculo diário pode ter falhado.` : "",
          ].filter(Boolean).join(" ")}
        </p>
      )}

      {carregando && !dados ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando a saúde da carteira">
          <Skeleton className="h-40 rounded-xl" />
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : dados && (
        <>
          <Distribuicao linhas={escopo} filtro={vista === "fila" ? filtro : "todos"}
            aoFiltrar={(f) => mudar({ nivel: f === "pedem_atencao" ? null : f, view: null })} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Vista">
              {VISTAS.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={vista === v.id}
                  onClick={() => mudar({ view: v.id === "fila" ? null : v.id })}
                  className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    vista === v.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {v.rotulo}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-border p-0.5" aria-label="De quem">
                {(["mine", "all"] as const).map((r) => (
                  <button key={r} type="button" aria-pressed={resp === r}
                    onClick={() => mudar({ resp: r, dono: r === "mine" ? null : dono || null })}
                    className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      resp === r ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                    {r === "mine" ? "Meus" : "Todos"}
                  </button>
                ))}
              </div>
              {vista === "fila" && (
                <select aria-label="Nível" value={filtro} className={seletor}
                  onChange={(e) => mudar({ nivel: e.target.value === "pedem_atencao" ? null : e.target.value })}>
                  {FILTROS_NIVEL.map((f) => <option key={f} value={f}>{ROTULO_FILTRO_NIVEL[f]}</option>)}
                </select>
              )}
              {resp === "all" && vista !== "responsaveis" && (
                <select aria-label="Responsável" value={dono} className={seletor}
                  onChange={(e) => mudar({ dono: e.target.value || null })}>
                  <option value="">Todos os responsáveis</option>
                  {dados.donos.map((d) => <option key={d} value={d}>{d}</option>)}
                  <option value="Sem responsável">Sem responsável</option>
                </select>
              )}
            </div>
          </div>

          {vista === "responsaveis" ? (
            <PorResponsavel linhas={dados.linhas} aoEscolher={(d) => mudar({ view: null, resp: "all", dono: d })} />
          ) : vista === "jornada" ? (
            <Jornada linhas={escopo} />
          ) : fila.length === 0 ? (
            <EmptyState
              icon={<HeartPulse size={20} aria-hidden />}
              title={filtro === "pedem_atencao" ? "Ninguém pedindo atenção" : "Nenhum cliente neste filtro"}
              subtitle={filtro === "pedem_atencao"
                ? `Nenhum cliente em risco, em atenção ou calado há ${DIAS_ESFRIANDO}+ dias${resp === "mine" ? " na sua carteira" : ""}.`
                : "Troque o nível ou veja todos os clientes."}
              action={resp === "mine" && escopo.length === 0 ? (
                <button type="button" onClick={() => mudar({ resp: "all" })} className="text-xs font-medium text-primary hover:underline">
                  Ver todos os clientes
                </button>
              ) : undefined}
            />
          ) : (
            <ul className="space-y-2" aria-label="Clientes, do mais grave para o menos grave">
              {fila.map((l) => <LinhaCarteira key={l.id} l={l} aoMudarAcao={aoMudarAcao} aoMudarRel={aoMudarRel} />)}
            </ul>
          )}

          {dados.eu.papel === "admin" && dados.semMigracaoProximaAcao && (
            <p className="text-lone-caption text-muted-foreground">
              A confirmação da próxima ação ainda não guarda quem e quando: falta aplicar a migration
              20260925100000_proxima_acao_confirmada.sql.
            </p>
          )}
        </>
      )}
    </div>
  );
}
