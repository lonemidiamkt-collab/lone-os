"use client";

// Aba "Resultados" do Social (Leva 5a) — substitui "Métricas" e "Entregas Mensais".
//
// As duas mediam pessoas por coisas que o sistema não registra (card arrastado para "publicado",
// carimbo de coluna, um contador que ficou meses zerado). Aqui tudo sai do Instagram real, via
// /api/conteudo/resultados: posts que foram ao ar, no prazo × atrasado contra a data do card que
// casou com o post, post que saiu sem card, card que não saiu e o mix de formatos.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarCheck, Clock, Instagram, Layers, RefreshCw } from "lucide-react";
import { chamar } from "@/lib/api/chamar";
import { todaySP } from "@/lib/utils";
import Skeleton from "@/components/ui/Skeleton";
import type { Contagem, LinhaClienteResultado, MixFormatos, Resultados } from "@/lib/conteudo/resultados";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); return `${MESES[m - 1]} de ${a}`; };

/** Os últimos 6 meses (o atual primeiro). */
function ultimosMeses(hoje: string, n = 6): string[] {
  const [a, m] = hoje.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

// Uma cor por formato. Story e "outro" quase não aparecem no feed; ficam neutros.
const FORMATOS: { chave: keyof MixFormatos; rotulo: string; cor: string }[] = [
  { chave: "reel", rotulo: "Reels", cor: "bg-chart-1" },
  { chave: "carrossel", rotulo: "Carrossel", cor: "bg-chart-2" },
  { chave: "post", rotulo: "Post", cor: "bg-chart-3" },
  { chave: "outro", rotulo: "Outro", cor: "bg-muted-foreground/40" },
];

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const dataCurta = (ymd: string | null) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "—");

function somar(linhas: Contagem[]): Contagem {
  const t: Contagem = { posts: 0, noPrazo: 0, atrasados: 0, semCard: 0, planejadosSemPost: 0, formatos: { reel: 0, carrossel: 0, post: 0, story: 0, outro: 0 } };
  for (const l of linhas) {
    t.posts += l.posts; t.noPrazo += l.noPrazo; t.atrasados += l.atrasados;
    t.semCard += l.semCard; t.planejadosSemPost += l.planejadosSemPost;
    for (const k of Object.keys(t.formatos) as (keyof MixFormatos)[]) t.formatos[k] += l.formatos[k];
  }
  return t;
}

function BarraFormatos({ mix, fina = false }: { mix: MixFormatos; fina?: boolean }) {
  const total = FORMATOS.reduce((s, f) => s + mix[f.chave], 0) + mix.story;
  const titulo = FORMATOS.filter((f) => mix[f.chave] > 0).map((f) => `${f.rotulo}: ${mix[f.chave]}`).join(" · ") || "Sem posts";
  return (
    <div title={titulo} className={`flex overflow-hidden rounded-full bg-muted ${fina ? "h-1.5 w-20" : "h-2 w-full"}`}>
      {total > 0 && FORMATOS.map((f) => {
        const n = mix[f.chave] + (f.chave === "outro" ? mix.story : 0);
        return n > 0 ? <div key={f.chave} className={f.cor} style={{ width: `${(n / total) * 100}%` }} /> : null;
      })}
    </div>
  );
}

function Numero({ valor, tom }: { valor: number; tom?: "alerta" | "perigo" }) {
  const cor = valor === 0 ? "text-muted-foreground" : tom === "perigo" ? "text-lone-danger" : tom === "alerta" ? "text-lone-warning" : "text-foreground";
  return <span className={`tabular-nums ${cor}`}>{valor}</span>;
}

export default function ResultadosTab({ workspace }: { workspace: string }) {
  const hoje = todaySP();
  const meses = useMemo(() => ultimosMeses(hoje), [hoje]);
  const [mes, setMes] = useState(meses[0]);
  const [dados, setDados] = useState<Resultados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (m: string) => {
    setCarregando(true);
    setErro(null);
    const r = await chamar<Resultados>(`/api/conteudo/resultados?mes=${m}`);
    if (!r.ok || !r.data) { setErro(r.erro ?? "Não consegui carregar os resultados."); setDados(null); }
    else setDados(r.data);
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(mes); }, [mes, carregar]);

  // O filtro de quadro do Social vale aqui também: com uma pessoa escolhida, os números são os dela.
  const doQuadro = workspace && workspace !== "Todos";
  const clientes: LinhaClienteResultado[] = useMemo(
    () => (dados?.porCliente ?? []).filter((c) => !doQuadro || c.social === workspace),
    [dados, doQuadro, workspace],
  );
  const total = useMemo(() => somar(clientes), [clientes]);
  const planejados = total.noPrazo + total.atrasados;
  const semInstagram = clientes.filter((c) => !c.temInstagram).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho: o mês e de onde vem o número */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lone-h2 tracking-tight text-foreground">Resultados de {rotuloMes(mes)}</h2>
          <p className="text-lone-caption text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Instagram size={12} aria-hidden /> Contado nos posts que foram ao ar no Instagram{doQuadro ? ` · quadro de ${workspace}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="resultados-mes" className="sr-only">Mês</label>
          <select id="resultados-mes" value={mes} onChange={(e) => setMes(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-xs text-foreground outline-none focus:border-primary">
            {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
          </select>
          <button onClick={() => void carregar(mes)} disabled={carregando} title="Atualizar"
            className="h-9 w-9 grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""} aria-hidden />
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-lone-danger-border bg-lone-danger-bg px-4 py-3 text-sm text-lone-danger">
          <span className="flex items-center gap-2"><AlertCircle size={15} aria-hidden /> {erro}</span>
          <button onClick={() => void carregar(mes)} className="text-xs underline shrink-0">Tentar de novo</button>
        </div>
      )}

      {carregando && !dados ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : dados && (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-lone-eyebrow uppercase text-muted-foreground">Posts no ar</p>
              <p className="text-lone-hero tabular-nums text-foreground mt-1">{total.posts}</p>
              <p className="text-lone-caption text-muted-foreground mt-1">{clientes.length - semInstagram} cliente(s) com Instagram</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-lone-eyebrow uppercase text-muted-foreground flex items-center gap-1.5"><CalendarCheck size={12} aria-hidden /> No prazo</p>
              <p className="text-lone-hero tabular-nums text-foreground mt-1">
                {total.noPrazo}
                {pct(total.noPrazo, planejados) !== null && <span className="text-lone-body text-muted-foreground ml-1.5">{pct(total.noPrazo, planejados)}%</span>}
              </p>
              <p className="text-lone-caption text-muted-foreground mt-1">no dia planejado ou antes</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-lone-eyebrow uppercase text-muted-foreground flex items-center gap-1.5"><Clock size={12} aria-hidden /> Atrasados</p>
              <p className={`text-lone-hero tabular-nums mt-1 ${total.atrasados > 0 ? "text-lone-warning" : "text-foreground"}`}>{total.atrasados}</p>
              <p className="text-lone-caption text-muted-foreground mt-1">
                {total.planejadosSemPost > 0 ? `+ ${total.planejadosSemPost} planejado(s) que não saíram` : "saíram depois do dia planejado"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-lone-eyebrow uppercase text-muted-foreground flex items-center gap-1.5"><Layers size={12} aria-hidden /> Sem card</p>
              <p className="text-lone-hero tabular-nums text-foreground mt-1">{total.semCard}</p>
              <p className="text-lone-caption text-muted-foreground mt-1">foram ao ar sem estar no board</p>
            </div>
          </div>

          {/* Mix de formatos */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-lone-h2 tracking-tight text-foreground">Mix de formatos</h3>
            <BarraFormatos mix={total.formatos} />
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {FORMATOS.map((f) => {
                const n = total.formatos[f.chave] + (f.chave === "outro" ? total.formatos.story : 0);
                if (f.chave === "outro" && n === 0) return null;
                return (
                  <span key={f.chave} className="flex items-center gap-1.5 text-lone-body text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${f.cor}`} aria-hidden />
                    {f.rotulo} <span className="tabular-nums text-foreground">{n}</span>
                    {total.posts > 0 && <span className="tabular-nums">({pct(n, total.posts)}%)</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Por social media (sempre a agência toda: é a comparação) */}
          <div className="rounded-xl border border-border bg-card">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-lone-h2 tracking-tight text-foreground">Por social media</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-lone-body">
                <thead>
                  <tr className="border-y border-border text-left text-lone-caption text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Pessoa</th>
                    <th className="px-3 py-2 font-medium text-right">Clientes</th>
                    <th className="px-3 py-2 font-medium text-right">Posts</th>
                    <th className="px-3 py-2 font-medium text-right">No prazo</th>
                    <th className="px-3 py-2 font-medium text-right">Atrasados</th>
                    <th className="px-3 py-2 font-medium text-right">Sem card</th>
                    <th className="px-3 py-2 font-medium text-right">Não saíram</th>
                    <th className="px-5 py-2 font-medium">Formatos</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.porPessoa.map((p) => {
                    const base = p.noPrazo + p.atrasados;
                    return (
                      <tr key={p.pessoa} className={`border-b border-border last:border-0 ${doQuadro && p.pessoa === workspace ? "bg-primary/5" : ""}`}>
                        <td className="px-5 py-2.5 text-foreground font-medium">{p.pessoa}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{p.clientes}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{p.posts}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                          {p.noPrazo}{base > 0 && <span className="text-muted-foreground ml-1">({pct(p.noPrazo, base)}%)</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right"><Numero valor={p.atrasados} tom="alerta" /></td>
                        <td className="px-3 py-2.5 text-right"><Numero valor={p.semCard} /></td>
                        <td className="px-3 py-2.5 text-right"><Numero valor={p.planejadosSemPost} tom="perigo" /></td>
                        <td className="px-5 py-2.5"><BarraFormatos mix={p.formatos} fina /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Por cliente */}
          <div className="rounded-xl border border-border bg-card">
            <div className="px-5 pt-5 pb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-lone-h2 tracking-tight text-foreground">Por cliente</h3>
              <span className="text-lone-caption text-muted-foreground">{clientes.length} cliente(s)</span>
            </div>
            {clientes.length === 0 ? (
              <p className="px-5 pb-5 text-lone-body text-muted-foreground">Nenhum cliente neste quadro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-lone-body">
                  <thead>
                    <tr className="border-y border-border text-left text-lone-caption text-muted-foreground">
                      <th className="px-5 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Social</th>
                      <th className="px-3 py-2 font-medium text-right">Posts / meta</th>
                      <th className="px-3 py-2 font-medium text-right">No prazo</th>
                      <th className="px-3 py-2 font-medium text-right">Atrasados</th>
                      <th className="px-3 py-2 font-medium text-right">Sem card</th>
                      <th className="px-3 py-2 font-medium text-right">Não saíram</th>
                      <th className="px-3 py-2 font-medium">Formatos</th>
                      <th className="px-5 py-2 font-medium text-right">Último post</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((c) => (
                      <tr key={c.clientId} className="border-b border-border last:border-0">
                        <td className="px-5 py-2.5 text-foreground">{c.cliente}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{c.social ?? "—"}</td>
                        {c.temInstagram ? (
                          <>
                            <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                              {c.posts}{c.meta ? <span className="text-muted-foreground">/{c.meta}</span> : null}
                            </td>
                            <td className="px-3 py-2.5 text-right"><Numero valor={c.noPrazo} /></td>
                            <td className="px-3 py-2.5 text-right"><Numero valor={c.atrasados} tom="alerta" /></td>
                            <td className="px-3 py-2.5 text-right"><Numero valor={c.semCard} /></td>
                            <td className="px-3 py-2.5 text-right"><Numero valor={c.planejadosSemPost} tom="perigo" /></td>
                            <td className="px-3 py-2.5"><BarraFormatos mix={c.formatos} fina /></td>
                          </>
                        ) : (
                          <td colSpan={6} className="px-3 py-2.5 text-lone-caption text-muted-foreground">
                            Instagram não vinculado — sem fonte para contar.
                          </td>
                        )}
                        <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{dataCurta(c.ultimoPost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-lone-caption text-muted-foreground max-w-prose">
            Um post conta como planejado quando casa com um card do mesmo cliente com data até 1 dia antes ou
            depois (mesmo formato primeiro, depois o horário mais perto). &ldquo;Não saíram&rdquo; são cards com
            data no mês, já vencida, sem post que case — story não entra, porque a Meta não lista story no feed.
          </p>
        </>
      )}
    </div>
  );
}
