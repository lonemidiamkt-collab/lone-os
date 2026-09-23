"use client";

import { useEffect, useState } from "react";
import { chamar } from "@/lib/api/chamar";
import { variavelDe } from "@/lib/traffic/replicar";
import EstiloVisual from "@/components/clients/EstiloVisual";
import MarcaDoCliente from "@/components/clients/MarcaDoCliente";
import CatalogoProdutos from "@/components/clients/CatalogoProdutos";
import PadroesCriativos from "@/components/traffic/PadroesCriativos";

// Aba "Inteligência Criativa" da ficha — o DNA criativo do cliente num lugar só:
// identidade, o que está rodando e como vai, vencedores, testes de variação, aprendizados e padrão.

interface Variacao { nome: string; muda: string; mantem: string; testa: string }
interface Criativo { ad_id: string; ad_name: string | null; estado: string; severidade: number; confianca: number; evidencias: string[] | null; vencedor: boolean; vencedor_evidencias: string[] | null; amostra: { gasto7d?: number; conversas7d?: number } | null; thumb: string | null;
  analise: { resumo: string | null; variacoes: Variacao[]; previas: { variacao: string; url: string }[] } | null; demandasAbertas: { id: string; variavel: string; status: string }[] }
interface Teste { id: string; variavel: string; muda: string | null; hipotese: string | null; child_ad_id: string | null; resultado: { veredito?: string; motivo?: string } | null; created_at: string }
interface Aprendizado { variavel: string; hipotese: string | null; veredito: string; created_at: string }
interface Padrao { vencedores: number; outros: number; tagsVencedores: { tag: string; n: number }[]; tagsOutros: { tag: string; n: number }[]; precoVisivel: { vencedores: number; outros: number }; pessoa: { vencedores: number; outros: number } }
interface Dados { dia: string | null; criativos: Criativo[]; testes: Teste[]; aprendizados: Aprendizado[]; padrao: Padrao; iaImagem?: boolean; error?: string }

const ESTADO: Record<string, string> = { CRITICAL: "Crítico", FATIGUE_PROBABLE: "Cansaço provável", FATIGUE_POSSIBLE: "Cansaço possível", WATCH: "Observar", HEALTHY: "Saudável" };
const brl = (n?: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default function InteligenciaCriativa({ clientId, role }: { clientId: string; role: string }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [demorando, setDemorando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // Página aberta durante o restart do deploy ficava em "Carregando…" para sempre (14/09). Agora: erro
  // vira texto com botão, e 12 s sem resposta também.
  useEffect(() => {
    let vivo = true;
    setD(null); setErro(null); setDemorando(false);
    const vigia = setTimeout(() => { if (vivo) setDemorando(true); }, 12_000);
    chamar<Dados>(`/api/clients/${clientId}/inteligencia`).then((r) => {
      if (!vivo) return;
      clearTimeout(vigia);
      if (!r.ok || !r.data) setErro(r.erro ?? "Não consegui carregar."); else setD(r.data);
    });
    return () => { vivo = false; clearTimeout(vigia); };
  }, [clientId, tentativa]);

  const vencedores = d?.criativos.filter((c) => c.vencedor) ?? [];
  const podeCriarArte = ["admin", "manager", "traffic"].includes(role);
  const [criando, setCriando] = useState<string | null>(null);
  const [criada, setCriada] = useState<Record<string, { demandaId: string; designer: string | null; prazo: string }>>({});
  const [erroArte, setErroArte] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<Record<string, { url?: string; ocupado?: boolean; erro?: string }>>({});

  // CRIAR ARTE direto da ficha: mesma rota do Tráfego (demanda travada no designer do cliente).
  async function criarArte(adId: string, v: Variacao) {
    const chave = `${adId}|${v.nome}`;
    setCriando(chave); setErroArte((e) => ({ ...e, [chave]: "" }));
    const r = await chamar<{ ok?: boolean; demandaId?: string; designer?: string | null; prazo?: string; error?: string }>("/api/traffic/criativos/replicar", { adId, variacao: v });
    setCriando(null);
    if (!r.ok || !r.data?.demandaId) { setErroArte((e) => ({ ...e, [chave]: r.erro ?? r.data?.error ?? "não criou" })); return; }
    setCriada((c) => ({ ...c, [chave]: { demandaId: r.data!.demandaId!, designer: r.data!.designer ?? null, prazo: r.data!.prazo ?? "" } }));
  }
  async function verPrevia(adId: string, v: Variacao) {
    const chave = `${adId}|${v.nome}`;
    setPrevia((p) => ({ ...p, [chave]: { ocupado: true } }));
    const r = await chamar<{ ok?: boolean; url?: string; error?: string }>("/api/traffic/criativos/previa", { adId, variacao: v });
    setPrevia((p) => ({ ...p, [chave]: r.ok && r.data?.url ? { url: r.data.url } : { erro: r.erro ?? r.data?.error ?? "não gerou" } }));
  }
  const problemas = d?.criativos.filter((c) => !c.vencedor && ["CRITICAL", "FATIGUE_PROBABLE", "FATIGUE_POSSIBLE"].includes(c.estado)) ?? [];
  const podeEditarMarca = ["admin", "manager", "social", "designer", "traffic"].includes(role);

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h3 className="font-semibold text-foreground">Inteligência Criativa</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">O que define esta marca, o que está funcionando nos anúncios, o que está sendo testado e o que já aprendemos. {d?.dia && <>Avaliação de {d.dia.split("-").reverse().join("/")}.</>}</p>
      </div>
      {(erro || (demorando && !d)) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <span className="text-destructive">{erro ?? "Está demorando mais que o normal — o painel pode estar reiniciando."}</span>
          <button onClick={() => setTentativa((t) => t + 1)} className="rounded-md border border-border px-2 py-0.5 text-foreground hover:bg-muted">Tentar de novo</button>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <MarcaDoCliente clientId={clientId} podeEditar={podeEditarMarca} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <EstiloVisual clientId={clientId} podeEditar={podeEditarMarca} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <CatalogoProdutos clientId={clientId} podeEditar={podeEditarMarca} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-foreground">🏆 Vencedores agora {vencedores.length ? `(${vencedores.length})` : ""}</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">Pela régua deste cliente: custo por conversa bem abaixo da meta, conversas mínimas e gasto de decisão. Cada vencedor traz 2 variações que mudam UMA coisa — <b>Criar arte</b> manda a demanda travada pro designer do cliente.</p>
        {vencedores.length === 0 && <p className="text-xs text-muted-foreground">{d ? "Nenhum vencedor com amostra suficiente nesta semana — sem vencedor não há o que replicar. Para um pedido comum, use Social › Novo Conteúdo." : "Carregando…"}</p>}
        <ul className="grid gap-2 lg:grid-cols-2">
          {vencedores.map((c) => (
            <li key={c.ad_id} className="rounded-lg border border-primary/30 bg-primary/[0.04] p-2">
              <div className="flex gap-2">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">{c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 text-[11px]">
                  <p className="truncate font-medium text-foreground" title={c.ad_name ?? ""}>{c.ad_name ?? c.ad_id}</p>
                  {c.vencedor_evidencias?.slice(0, 2).map((e, k) => <p key={k} className="text-muted-foreground">• {e}</p>)}
                  {!c.analise && <p className="mt-0.5 text-[10px] text-muted-foreground">Hipóteses ainda não geradas (roda às 07:40) — sem elas não há variação para criar.</p>}
                </div>
              </div>
              {c.analise && c.analise.variacoes.length > 0 && (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {c.analise.variacoes.map((v, k) => {
                    const chave = `${c.ad_id}|${v.nome}`;
                    const aberta = c.demandasAbertas.find((x) => x.variavel === variavelDe(v));
                    const feita = criada[chave];
                    const pv = previa[chave]; const urlPrevia = pv?.url ?? c.analise?.previas.find((p) => p.variacao === v.nome)?.url;
                    return (
                      <div key={k} className="rounded-md border border-border bg-card p-2 text-[11px]">
                        <p className="font-medium text-foreground">Variação {k + 1}: {v.nome}</p>
                        <p className="text-muted-foreground"><span className="text-foreground/80">Muda:</span> {v.muda}</p>
                        {urlPrevia && <a href={urlPrevia} target="_blank" rel="noreferrer" className="mt-1 block w-20 overflow-hidden rounded border border-border" title="Prévia da IA — rascunho"><img src={urlPrevia} alt="" className="w-full" /></a>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {feita || aberta ? (
                            <span className="text-[10px] text-lone-success">✓ Demanda {feita ? "criada" : "já aberta"}{feita?.designer ? ` para ${feita.designer}` : ""}{feita?.prazo ? ` · prazo ${feita.prazo.split("-").reverse().join("/")}` : ""} · <a href="/design" className="underline">abrir quadro</a></span>
                          ) : podeCriarArte ? (
                            <button onClick={() => void criarArte(c.ad_id, v)} disabled={criando === chave} className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{criando === chave ? "Criando…" : "🧬 Criar arte com essa variação"}</button>
                          ) : <span className="text-[10px] text-muted-foreground">Gestor de tráfego ou admin cria a arte.</span>}
                          {podeCriarArte && d?.iaImagem && !feita && !aberta && (
                            <button onClick={() => void verPrevia(c.ad_id, v)} disabled={pv?.ocupado} className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50">{pv?.ocupado ? "Gerando…" : urlPrevia ? "👁 Outra prévia" : "👁 Prévia (IA)"}</button>
                          )}
                        </div>
                        {(erroArte[chave] || pv?.erro) && <p className="mt-1 text-[10px] text-destructive">{erroArte[chave] || pv?.erro}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {problemas.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">⚠️ Precisam de atenção ({problemas.length})</h4>
          <ul className="mt-2 space-y-1.5">
            {problemas.map((c) => (
              <li key={c.ad_id} className="flex gap-2 text-[11px]">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">{c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0"><p className="truncate text-foreground"><span className="rounded bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive">{ESTADO[c.estado] ?? c.estado}</span> {c.ad_name ?? c.ad_id}</p><p className="text-muted-foreground">{c.evidencias?.[0]}</p></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-foreground">🧬 Testes de variação {d?.testes.length ? `(${d.testes.length})` : ""}</h4>
        {d && d.testes.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nenhuma variação replicada ainda. Quando houver vencedor, o gestor escolhe a hipótese e a demanda nasce travada para o designer.</p>}
        <ul className="mt-2 divide-y divide-border text-[11px]">
          {d?.testes.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 py-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${t.resultado?.veredito === "validada" ? "bg-lone-success-bg text-lone-success" : t.resultado?.veredito === "refutada" ? "bg-destructive/10 text-destructive" : t.child_ad_id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {t.resultado?.veredito === "validada" ? "✓ validada" : t.resultado?.veredito === "refutada" ? "✗ refutada" : t.child_ad_id ? "no ar — medindo" : "com o designer"}
              </span>
              <span className="text-foreground/80">variável: {t.variavel}{t.muda ? ` — ${t.muda}` : ""}</span>
              {t.resultado?.motivo && <span className="text-muted-foreground">· {t.resultado.motivo}</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">📚 Aprendizados deste cliente</h4>
          <p className="mb-2 text-[11px] text-muted-foreground">Só o que foi testado e medido — hipótese validada ou refutada. Nada de "achamos que".</p>
          {d && d.aprendizados.length === 0 && <p className="text-xs text-muted-foreground">Ainda nenhum veredito. O primeiro chega quando um teste de variação tiver gasto de decisão.</p>}
          <ul className="space-y-1 text-[11px]">
            {d?.aprendizados.map((a, k) => <li key={k}><span className={a.veredito === "validada" ? "text-lone-success" : "text-destructive"}>{a.veredito === "validada" ? "✓" : "✗"}</span> <span className="text-foreground/90">{a.hipotese ?? a.variavel}</span> <span className="text-muted-foreground">({a.variavel})</span></li>)}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <PadroesCriativos clientId={clientId} />
        </section>
      </div>
    </div>
  );
}
