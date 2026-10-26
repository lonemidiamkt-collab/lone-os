"use client";

// A MESA DO GESTOR de tráfego (etapa 2 do plano de tráfego, 26/10/2026). Regras e leitura em lib/priority/mesa.ts.
//
// Os mesmos itens da fila de prioridades, no lugar onde o gestor trabalha, com o que cabe num dia: no máximo 10,
// o que tem mais dinheiro em jogo primeiro, e três decisões de um toque — Já fiz, Não é problema, Adiar. O "Já fiz"
// é conferido sozinho 1 e 3 dias depois (lib/priority/conferencia.ts): o problema sumiu (resolvido) ou voltou.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, ClipboardCheck, ExternalLink, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { cn, todaySP } from "@/lib/utils";
import { ROTULO_CONFERENCIA, type ResultadoConferencia } from "@/lib/priority/conferencia";
import type { ItemMesa, Mesa } from "@/lib/priority/mesa";

type Resposta = Mesa & { eu: { nome: string | null; papel: string | null }; error?: string };

const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "YYYY-MM-DD" de São Paulo, `dias` depois de hoje. */
function diaDepois(dias: number): string {
  const d = new Date(`${todaySP()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
/** Próxima segunda (nunca hoje). */
function proximaSegunda(): string {
  const d = new Date(`${todaySP()}T12:00:00Z`);
  const falta = ((8 - d.getUTCDay()) % 7) || 7;
  return diaDepois(falta);
}

function haQuantoTempo(iso: string | null): string {
  if (!iso) return "";
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (!Number.isFinite(h) || h < 0) return "";
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

/** Faixa de cor pela nota: o que está no topo e com dinheiro saindo aparece primeiro e mais forte. */
function faixa(score: number): string {
  if (score >= 70) return "bg-lone-danger";
  if (score >= 50) return "bg-lone-warning";
  return "bg-primary/60";
}

const COR_CONFERENCIA: Record<ResultadoConferencia, string> = {
  aguardando: "bg-muted text-muted-foreground",
  confirmado_1d: "bg-primary/10 text-primary",
  resolvido: "bg-lone-success-bg text-lone-success",
  voltou: "bg-lone-danger-bg text-lone-danger",
};

type Decisao = "executada" | "ignorada" | "incorreta" | "adiar";

const NAO_E_PROBLEMA: { rotulo: string; decisao: "ignorada" | "incorreta"; motivo: string }[] = [
  { rotulo: "Foi de propósito", decisao: "ignorada", motivo: "de propósito" },
  { rotulo: "O cliente pediu", decisao: "ignorada", motivo: "o cliente pediu" },
  { rotulo: "O dado está errado", decisao: "incorreta", motivo: "dado errado" },
];

export default function MesaGestor() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gestor, setGestor] = useState<string | null>(null); // null = o padrão do servidor
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ id: string; menu: "nao" | "adiar" } | null>(null);

  const carregar = useCallback(async (g: string | null = gestor) => {
    setCarregando(true);
    const q = g === null ? "" : `?gestor=${encodeURIComponent(g)}`;
    const r = await chamar<Resposta>(`/api/trafego/mesa${q}`);
    setCarregando(false);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar a Mesa."); return; }
    setDados(r.data); setErro(null);
  }, [gestor]);
  useEffect(() => { void carregar(gestor); }, [carregar, gestor]);

  const decidir = useCallback(async (item: ItemMesa, decisao: Decisao, extra: { motivo?: string; ate?: string } = {}) => {
    setOcupado(item.id);
    const r = await chamar("/api/priority/decidir", { id: item.id, decisao, ...extra });
    setOcupado(null);
    setAberto(null);
    if (!r.ok) { toast.error(`Não registrei: ${r.erro}`); return; }
    let posicao = -1;
    setDados((prev) => {
      if (!prev) return prev;
      posicao = prev.itens.findIndex((i) => i.id === item.id);
      return { ...prev, itens: prev.itens.filter((i) => i.id !== item.id) };
    });
    const rotulo = decisao === "executada" ? "Marcado como feito — confiro amanhã se resolveu"
      : decisao === "adiar" ? `Adiado até ${extra.ate?.split("-").reverse().slice(0, 2).join("/")}`
      : "Marcado como não é problema";
    toast.success(rotulo, {
      description: item.titulo,
      duration: 8000,
      action: {
        label: "Desfazer",
        onClick: () => {
          void (async () => {
            const v = await chamar("/api/priority/decidir", { id: item.id, decisao: "reabrir", estadoAnterior: item.estado });
            if (!v.ok) { toast.error(`Não consegui desfazer: ${v.erro}`); return; }
            setDados((prev) => {
              if (!prev || prev.itens.some((i) => i.id === item.id)) return prev;
              const itens = [...prev.itens];
              itens.splice(posicao < 0 ? 0 : Math.min(posicao, itens.length), 0, item);
              return { ...prev, itens };
            });
            toast.success("Voltou para a Mesa.");
          })();
        },
      },
    });
  }, []);

  const podeEscolher = !!dados && (dados.eu.papel === "admin" || dados.eu.papel === "manager");
  const itens = dados?.itens ?? [];
  const s = dados?.semana;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lone-h2 tracking-tight text-foreground">
            <ClipboardCheck size={15} className="text-primary" aria-hidden /> Mesa do gestor
          </h2>
          <p className="mt-0.5 text-lone-caption text-muted-foreground">
            No máximo 10 por dia, o que tem mais dinheiro em jogo primeiro. O “Já fiz” é conferido sozinho 1 e 3 dias depois.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeEscolher && (
            <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="De quem é a Mesa">
              {["todos", ...(dados?.gestores ?? [])].map((g) => {
                const ativo = (g === "todos" ? dados?.gestor === null : dados?.gestor?.toLowerCase() === g.toLowerCase());
                return (
                  <button key={g} type="button" onClick={() => setGestor(g)}
                    className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", ativo ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {g === "todos" ? "Todos" : g}
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" onClick={() => carregar()} disabled={carregando} aria-label="Atualizar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-50">
            {carregando && dados ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-xs text-lone-danger">
          <span className="flex-1">{erro}</span>
          <button type="button" onClick={() => carregar()} className="font-medium underline hover:no-underline">Tentar de novo</button>
        </div>
      )}

      {s && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Esta semana{dados?.gestor ? ` (${dados.gestor})` : ""}:</span>{" "}
          {s.recebidos} recebidos · {s.decididos} decididos{s.taxa !== null ? ` (${s.taxa}%)` : ""}
          {s.horasAteDecidir !== null ? ` · ${s.horasAteDecidir < 24 ? `${Math.round(s.horasAteDecidir)} h` : `${Math.round(s.horasAteDecidir / 24)} dias`} até decidir (mediana)` : ""}
          {s.feitos ? ` · ${s.feitos} feitos: ${s.resolvidos} resolvidos, ${s.voltaram} voltaram` : ""}
          <span className="ml-1 text-muted-foreground/70">· meta: decidir 60%</span>
        </p>
      )}

      {carregando && !dados ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : dados && !itens.length ? (
        <EmptyState
          icon={<Check size={20} />}
          title="Mesa limpa"
          subtitle={dados.adiados ? `Nada para hoje. ${dados.adiados > 1 ? `${dados.adiados} itens adiados voltam` : "1 item adiado volta"} na data marcada.` : "Nada pedindo decisão agora."}
        />
      ) : (
        <ol className="space-y-2.5">
          {itens.map((item) => (
            <li key={item.id} className="relative overflow-hidden rounded-xl border border-border bg-card">
              <span className={cn("absolute inset-y-0 left-0 w-1", faixa(item.score))} aria-hidden />
              <div className="flex flex-col gap-2.5 py-3.5 pl-5 pr-4">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">{item.titulo}</h3>
                  {item.exposicao_rs ? (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">{dinheiro(item.exposicao_rs)}/dia em jogo</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {item.voltou && <span className="rounded-full bg-lone-danger-bg px-2 py-0.5 font-medium text-lone-danger">Voltou depois do “Já fiz”</span>}
                  <span>aberto {haQuantoTempo(item.primeira_vez ?? item.created_at)}</span>
                  {item.owner && dados?.gestor === null && <span>· {item.owner}</span>}
                  {item.confianca < 0.6 && <span>· sinal fraco</span>}
                </div>
                {item.fato?.length ? (
                  <ul className="space-y-0.5 text-[13px] text-foreground/90">
                    {item.fato.slice(0, 2).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                ) : null}
                <p className="text-[13px] text-muted-foreground"><span className="font-medium text-foreground">O que fazer: </span>{item.recomendacao}</p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button type="button" disabled={ocupado === item.id} onClick={() => decidir(item, "executada")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
                    {ocupado === item.id ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />} Já fiz
                  </button>
                  <button type="button" disabled={ocupado === item.id} aria-expanded={aberto?.id === item.id && aberto.menu === "nao"}
                    onClick={() => setAberto((a) => (a?.id === item.id && a.menu === "nao" ? null : { id: item.id, menu: "nao" }))}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 disabled:opacity-50">
                    <X size={13} aria-hidden /> Não é problema
                  </button>
                  <button type="button" disabled={ocupado === item.id} aria-expanded={aberto?.id === item.id && aberto.menu === "adiar"}
                    onClick={() => setAberto((a) => (a?.id === item.id && a.menu === "adiar" ? null : { id: item.id, menu: "adiar" }))}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/30 disabled:opacity-50">
                    <CalendarClock size={13} aria-hidden /> Adiar
                  </button>
                  {item.client_id && (
                    <a href={`/traffic?client=${item.client_id}`} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                      Abrir a conta <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                </div>

                {aberto?.id === item.id && aberto.menu === "nao" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-2" role="group" aria-label="Por que não é problema">
                    <span className="text-xs text-muted-foreground">Por quê?</span>
                    {NAO_E_PROBLEMA.map((o) => (
                      <button key={o.rotulo} type="button" onClick={() => decidir(item, o.decisao, { motivo: o.motivo })}
                        className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:border-primary/30">{o.rotulo}</button>
                    ))}
                  </div>
                )}
                {aberto?.id === item.id && aberto.menu === "adiar" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-2" role="group" aria-label="Adiar até">
                    <span className="text-xs text-muted-foreground">Volta para a Mesa:</span>
                    {[{ r: "Amanhã", d: diaDepois(1) }, { r: "Em 3 dias", d: diaDepois(3) }, { r: "Na segunda", d: proximaSegunda() }].map((o) => (
                      <button key={o.r} type="button" onClick={() => decidir(item, "adiar", { ate: o.d })}
                        className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:border-primary/30">{o.r}</button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {dados && (dados.alemDaMesa > 0 || dados.adiados > 0) && (
        <p className="text-xs text-muted-foreground">
          {dados.alemDaMesa > 0 ? `Mais ${dados.alemDaMesa} na fila, menos urgentes — entram aqui conforme a Mesa esvazia.` : ""}
          {dados.alemDaMesa > 0 && dados.adiados > 0 ? " " : ""}
          {dados.adiados > 0 ? `${dados.adiados} adiado${dados.adiados > 1 ? "s" : ""}.` : ""}
        </p>
      )}

      {dados && dados.feitos.length > 0 && (
        <section className="space-y-2" aria-labelledby="mesa-conferencia">
          <h3 id="mesa-conferencia" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <RotateCcw size={13} className="text-primary" aria-hidden /> Conferência do “Já fiz” (7 dias)
          </h3>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {dados.feitos.map((f) => {
              const r = (f.resultado ?? "aguardando") as ResultadoConferencia;
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs">
                  <span className="min-w-0 flex-1 text-foreground">{f.titulo}</span>
                  <span className="text-muted-foreground">{f.decidido_por ? `${f.decidido_por} · ` : ""}{haQuantoTempo(f.decidido_em)}</span>
                  <span className={cn("rounded-full px-2 py-0.5 font-medium", COR_CONFERENCIA[r])}>{ROTULO_CONFERENCIA[r]}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
