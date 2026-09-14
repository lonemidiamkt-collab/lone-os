"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/supabase/authed-fetch";
import MarcaDoCliente from "@/components/clients/MarcaDoCliente";
import CatalogoProdutos from "@/components/clients/CatalogoProdutos";
import PadroesCriativos from "@/components/traffic/PadroesCriativos";

// Aba "Inteligência Criativa" da ficha — o DNA criativo do cliente num lugar só:
// identidade, o que está rodando e como vai, vencedores, testes de variação, aprendizados e padrão.

interface Criativo { ad_id: string; ad_name: string | null; estado: string; severidade: number; confianca: number; evidencias: string[] | null; vencedor: boolean; vencedor_evidencias: string[] | null; amostra: { gasto7d?: number; conversas7d?: number } | null; thumb: string | null }
interface Teste { id: string; variavel: string; muda: string | null; hipotese: string | null; child_ad_id: string | null; resultado: { veredito?: string; motivo?: string } | null; created_at: string }
interface Aprendizado { variavel: string; hipotese: string | null; veredito: string; created_at: string }
interface Padrao { vencedores: number; outros: number; tagsVencedores: { tag: string; n: number }[]; tagsOutros: { tag: string; n: number }[]; precoVisivel: { vencedores: number; outros: number }; pessoa: { vencedores: number; outros: number } }
interface Dados { dia: string | null; criativos: Criativo[]; testes: Teste[]; aprendizados: Aprendizado[]; padrao: Padrao; error?: string }

const ESTADO: Record<string, string> = { CRITICAL: "Crítico", FATIGUE_PROBABLE: "Cansaço provável", FATIGUE_POSSIBLE: "Cansaço possível", WATCH: "Observar", HEALTHY: "Saudável" };
const brl = (n?: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default function InteligenciaCriativa({ clientId, role }: { clientId: string; role: string }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    authedFetch(`/api/clients/${clientId}/inteligencia`).then(async (r) => { const j = (await r.json()) as Dados; if (!r.ok) setErro(j.error ?? `HTTP ${r.status}`); else setD(j); }).catch(() => setErro("Não consegui carregar."));
  }, [clientId]);

  const vencedores = d?.criativos.filter((c) => c.vencedor) ?? [];
  const problemas = d?.criativos.filter((c) => !c.vencedor && ["CRITICAL", "FATIGUE_PROBABLE", "FATIGUE_POSSIBLE"].includes(c.estado)) ?? [];
  const podeEditarMarca = ["admin", "manager", "social", "designer", "traffic"].includes(role);

  return (
    <div className="animate-fade-in space-y-5">
      <div>
        <h3 className="font-semibold text-foreground">Inteligência Criativa</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">O que define esta marca, o que está funcionando nos anúncios, o que está sendo testado e o que já aprendemos. {d?.dia && <>Avaliação de {d.dia.split("-").reverse().join("/")}.</>}</p>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <section className="rounded-xl border border-border bg-card p-4">
        <MarcaDoCliente clientId={clientId} podeEditar={podeEditarMarca} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <CatalogoProdutos clientId={clientId} podeEditar={podeEditarMarca} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-sm font-semibold text-foreground">🏆 Vencedores agora {vencedores.length ? `(${vencedores.length})` : ""}</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">Pela régua deste cliente: custo por conversa bem abaixo da meta, conversas mínimas e gasto de decisão. Para replicar, use Tráfego › Saúde dos Criativos.</p>
        {vencedores.length === 0 && <p className="text-xs text-muted-foreground">{d ? "Nenhum vencedor com amostra suficiente nesta semana." : "Carregando…"}</p>}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {vencedores.map((c) => (
            <li key={c.ad_id} className="flex gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] p-2">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted">{c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 text-[11px]">
                <p className="truncate font-medium text-foreground" title={c.ad_name ?? ""}>{c.ad_name ?? c.ad_id}</p>
                {c.vencedor_evidencias?.slice(0, 2).map((e, k) => <p key={k} className="text-muted-foreground">• {e}</p>)}
              </div>
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
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${t.resultado?.veredito === "validada" ? "bg-emerald-500/10 text-emerald-600" : t.resultado?.veredito === "refutada" ? "bg-destructive/10 text-destructive" : t.child_ad_id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
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
            {d?.aprendizados.map((a, k) => <li key={k}><span className={a.veredito === "validada" ? "text-emerald-600" : "text-destructive"}>{a.veredito === "validada" ? "✓" : "✗"}</span> <span className="text-foreground/90">{a.hipotese ?? a.variavel}</span> <span className="text-muted-foreground">({a.variavel})</span></li>)}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <PadroesCriativos clientId={clientId} />
        </section>
      </div>
    </div>
  );
}
