"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import { useRole } from "@/lib/context/RoleContext";
import OperacaoCriativa from "@/components/traffic/OperacaoCriativa";
import PadroesCriativos from "@/components/traffic/PadroesCriativos";

// /traffic/criativos — SAÚDE DOS CRIATIVOS, em sombra. O motor avalia todo dia; o gestor diz se
// concorda. Enquanto a precisão não passar de 80%, nada disto vira recomendação nem aviso.

interface Item {
  ad_id: string; cliente: string; ad_name: string | null; estado: string; severidade: number; confianca: number;
  evidencias: string[] | null; vencedor: boolean; vencedor_evidencias: string[] | null; rotulo: string | null;
  tipo: string | null; thumb: string | null; texto: string | null; titulo: string | null;
  amostra: { gasto7d?: number; conversas7d?: number; diasRodando?: number } | null;
  analise: {
    resumo: string | null;
    elementos: { tipo: string; descricao: string }[];
    hipoteses: { hipotese: string; elemento: string; confianca: string }[];
    variacoes: { nome: string; muda: string; mantem: string; testa: string }[];
    roteiros: { variacao: string; roteiro: { angulo: string; etapas: { tempo: string; nome: string; texto: string }[]; scorecard: number } | null }[] | null;
  } | null;
}
interface Teste { id: string; cliente: string; pai: string; variavel: string; muda: string | null; hipotese: string | null; criadoPor: string | null; designer: string | null; prazo: string | null; etapa: string; resultado: { veredito?: string; motivo?: string; cplPai?: number | null; cplFilho?: number | null } | null; createdAt: string }
interface Brief { id: string; semana: string; texto: string; proposta: { cliente: string; adName: string; variacao: { nome: string; muda: string } } | null; enviado_whatsapp: boolean; estado: string }
interface Resposta { dia: string | null; itens: Item[]; testes?: Teste[]; brief?: Brief | null; precisao: { concordo: number; total: number; taxa: number } | null; error?: string }
const ETAPA: Record<string, { rotulo: string; cls: string }> = {
  na_fila: { rotulo: "na fila do designer", cls: "bg-muted text-muted-foreground" }, em_producao: { rotulo: "em produção", cls: "bg-lone-warning-bg text-lone-warning" },
  entregue: { rotulo: "arte entregue — falta subir", cls: "bg-primary/10 text-primary" }, no_ar: { rotulo: "no ar — medindo", cls: "bg-primary/10 text-primary" },
  medindo: { rotulo: "medindo (ainda sem amostra)", cls: "bg-primary/10 text-primary" }, validada: { rotulo: "✓ validada", cls: "bg-emerald-500/10 text-emerald-600" }, refutada: { rotulo: "✗ refutada", cls: "bg-destructive/10 text-destructive" },
};

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
  const [aberto, setAberto] = useState<string | null>(null);
  const [replicando, setReplicando] = useState<string | null>(null);
  const [criadas, setCriadas] = useState<Record<string, { demandaId: string; designer: string | null; prazo: string }>>({});
  const [livre, setLivre] = useState<Record<string, string>>({});

  const replicar = async (adId: string, variacao: { nome: string; muda: string; mantem: string; testa: string }) => {
    const chave = `${adId}|${variacao.nome}`;
    setReplicando(chave); setErro(null);
    try {
      const r = await authedFetch("/api/traffic/criativos/replicar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adId, variacao }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d?.error ?? `HTTP ${r.status}`); return; }
      setCriadas((prev) => ({ ...prev, [chave]: { demandaId: d.demandaId, designer: d.designer, prazo: d.prazo } }));
    } finally { setReplicando(null); }
  };

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

      {(role === "admin" || role === "manager") && <OperacaoCriativa />}

      {dados?.brief && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">📋 Brief de segunda ({dados.brief.semana.split("-").reverse().join("/")}) {dados.brief.enviado_whatsapp ? "· enviado no grupo" : "· só no painel (sombra)"}{dados.brief.proposta ? ` · proposta ${dados.brief.estado}` : ""}</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] text-foreground/90">{dados.brief.texto}</pre>
        </details>
      )}

      {dados?.testes && dados.testes.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">🧬 Testes de variação ({dados.testes.length})</h2>
          <p className="mb-2 text-[11px] text-muted-foreground">Cada linha é um filho de um vencedor, com UMA variável. O veredito só sai com gasto de decisão; até lá, "medindo".</p>
          <ul className="divide-y divide-border text-[11px]">
            {dados.testes.map((t) => {
              const e = ETAPA[t.etapa] ?? { rotulo: t.etapa, cls: "bg-muted text-muted-foreground" };
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${e.cls}`}>{e.rotulo}</span>
                  <span className="font-medium text-foreground">{t.cliente}</span>
                  <span className="text-muted-foreground">pai: {t.pai}</span>
                  <span className="text-foreground/80">variável: {t.variavel}{t.muda ? ` — ${t.muda}` : ""}</span>
                  {t.designer && <span className="text-muted-foreground">{t.designer}{t.prazo ? ` · prazo ${t.prazo.split("-").reverse().join("/")}` : ""}</span>}
                  {t.resultado?.motivo && <span className="text-muted-foreground">· {t.resultado.motivo}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dados && itens.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma avaliação ainda. A primeira roda no próximo sync (07:20).</p>
      )}

      <PadroesCriativos />

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
                {i.vencedor && i.analise && (
                  <div className="mt-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-2">
                    <button className="w-full text-left text-[11px] font-medium text-primary" onClick={() => setAberto(aberto === i.ad_id ? null : i.ad_id)}>
                      {aberto === i.ad_id ? "▾" : "▸"} Por que pode ter funcionado + 2 variações com roteiro
                    </button>
                    {aberto === i.ad_id && (
                      <div className="mt-2 space-y-2 text-[11px]">
                        {i.analise.resumo && <p className="text-foreground/90">{i.analise.resumo}</p>}
                        <div>
                          <p className="font-medium text-foreground">O que a peça tem (fato)</p>
                          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">{i.analise.elementos.map((e, k) => <li key={k}>• <span className="text-foreground/80">{e.tipo}:</span> {e.descricao}</li>)}</ul>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Hipóteses (não é causa)</p>
                          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">{i.analise.hipoteses.map((h, k) => <li key={k}>• {h.hipotese} <span className="text-[10px]">— {h.elemento} · confiança {h.confianca}</span></li>)}</ul>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-muted-foreground">Outra variável:</span>
                          <input id={`livre-${i.ad_id}`} value={livre[i.ad_id] ?? ""} onChange={(e) => setLivre({ ...livre, [i.ad_id]: e.target.value })} placeholder="ex.: trocar o cenário por loja" className="h-7 min-w-[220px] rounded-lg border border-input bg-background px-2 text-[11px] text-foreground outline-none focus:border-primary" />
                          <button disabled={!livre[i.ad_id]?.trim() || replicando === `${i.ad_id}|${livre[i.ad_id]}`}
                            onClick={() => replicar(i.ad_id, { nome: livre[i.ad_id].trim().slice(0, 60), muda: livre[i.ad_id].trim(), mantem: "todo o resto do vencedor (oferta, texto, hierarquia, CTA)", testa: `se "${livre[i.ad_id].trim()}" melhora o resultado mantendo o resto` })}
                            className="rounded-lg border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50">🧬 Replicar com essa</button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {i.analise.variacoes.map((v, k) => {
                            const r = i.analise?.roteiros?.find((x) => x.variacao === v.nome)?.roteiro ?? null;
                            return (
                              <div key={k} className="rounded-md border border-border bg-card p-2">
                                <p className="font-medium text-foreground">Variação {k + 1}: {v.nome}</p>
                                <p className="text-muted-foreground"><span className="text-foreground/80">Muda:</span> {v.muda}</p>
                                <p className="text-muted-foreground"><span className="text-foreground/80">Testa:</span> {v.testa}</p>
                                {(() => {
                                  const chave = `${i.ad_id}|${v.nome}`;
                                  const feita = criadas[chave];
                                  return feita ? (
                                    <p className="mt-1 text-[10px] text-emerald-600">✓ Demanda criada{feita.designer ? ` para ${feita.designer}` : " (cliente sem designer — cai em \"sem designer\")"} · prazo {feita.prazo.split("-").reverse().join("/")} · <a href="/design" className="underline">abrir quadro</a></p>
                                  ) : (
                                    <button onClick={() => replicar(i.ad_id, v)} disabled={replicando === chave}
                                      className="mt-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
                                      {replicando === chave ? "Criando…" : "🧬 Replicar: mandar pro designer"}
                                    </button>
                                  );
                                })()}
                                {r ? (
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-primary">Roteiro pronto (Método Lone · {r.scorecard}/100) — {r.angulo}</summary>
                                    <ol className="mt-1 space-y-0.5 text-muted-foreground">{r.etapas.map((et, j) => <li key={j}><span className="font-mono text-[10px] text-foreground/70">{et.tempo}</span> <span className="text-foreground/80">{et.nome}:</span> {et.texto}</li>)}</ol>
                                  </details>
                                ) : <p className="mt-1 text-[10px] text-muted-foreground">Roteiro não gerado (briefing insuficiente ou pendente).</p>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
