"use client";

// components/portal/PortalResumo.tsx — "Visão geral" do Painel de Resultados (19/11/2026, Lone Results 3.0).
//
// A resposta de 5 segundos: uma frase com o que cada canal trouxe no período e um cartão por canal, que
// leva para a área dele. As contas ficam em lib/portal/resumo.ts.
//
// Cada canal é lido separado e tem o próprio estado: o que ainda está chegando mostra esqueleto, o que
// falhou diz "atualizando" (nunca zero) e NÃO derruba os outros. Os anúncios vêm do painel (o mesmo
// snapshot da área "Anúncios"); Google, Instagram e conteúdo são buscados aqui, nas mesmas rotas das áreas.

import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Globe, Palette, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Cartao, CabecalhoSecao, entrada } from "./ui";
import CriativoThumb from "./CriativoThumb";
import Skeleton from "@/components/ui/Skeleton";
import { HOVER_CARTAO } from "@/components/ui/painel-comparativo";
import { formatarVariacao, tomDaVariacao, type Natureza } from "@/components/ui/painel-comparativo-utils";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import type { PeriodKind, SnapshotData } from "@/lib/portal/types";
import type { AbaPortal } from "@/lib/portal/navegacao";
import { dentroDaJanela, formatarBRL, formatarNumero, palavrasDoResultado, rotuloDia } from "@/lib/portal/formatos";
import { comSinal, fraseDoResumo, numerosDoInstagram, type IgParaResumo, type PeriodoDoResumo } from "@/lib/portal/resumo";

/** Só o que o resumo lê da rota do Google (a forma completa está em lib/google/relatorio.ts). */
interface KpiG { chave: string; valor: number | null; variacaoPct: number | null }
interface RespostaGoogle {
  perfil?: { kpis: KpiG[]; semDados?: boolean } | null;
  ads?: { kpis: KpiG[]; semVeiculacao?: boolean } | null;
  perfilIndisponivel?: boolean;
  adsIndisponivel?: boolean;
}

type Leitura<T> = { estado: "carregando" } | { estado: "falha" } | { estado: "ausente" } | { estado: "ok"; dado: T };

const KIND: Record<PeriodoDoResumo, PeriodKind> = { "7d": "last_week", "14d": "last_2_weeks" };
const DIAS: Record<PeriodoDoResumo, number> = { "7d": 7, "14d": 14 };

export interface AnunciosDoResumo { dados: SnapshotData | null; carregando: boolean; falhou: boolean }

export default function PortalResumo({ token, clientId, periodo, anuncios, igInicial = null, temAnuncios, temGoogle, temInstagram, temConteudo, onAbrir }: {
  token: string;
  clientId: string;
  periodo: PeriodoDoResumo;
  /** O snapshot dos anúncios que o painel já tem (do mesmo período). */
  anuncios: AnunciosDoResumo;
  /** Instagram de 7 dias lido do cache no servidor. */
  igInicial?: IgParaResumo | null;
  temAnuncios: boolean;
  temGoogle: boolean;
  temInstagram: boolean;
  temConteudo: boolean;
  onAbrir: (a: AbaPortal) => void;
}) {
  const [google, setGoogle] = useState<Leitura<RespostaGoogle>>({ estado: "carregando" });
  const [ig, setIg] = useState<Leitura<IgParaResumo>>(() => (periodo === "7d" && igInicial?.conta ? { estado: "ok", dado: igInicial } : { estado: "carregando" }));
  const [artes, setArtes] = useState<Leitura<number>>({ estado: "carregando" });

  useEffect(() => {
    if (!temGoogle) return;
    let vivo = true;
    setGoogle({ estado: "carregando" });
    chamar<RespostaGoogle>(`/api/portal/${token}/google`, { period_kind: KIND[periodo] }).then((r) => {
      if (vivo) setGoogle(r.ok && r.data ? { estado: "ok", dado: r.data } : { estado: "falha" });
    });
    return () => { vivo = false; };
  }, [token, periodo, temGoogle]);

  useEffect(() => {
    if (!temInstagram) return;
    if (periodo === "7d" && igInicial?.conta) { setIg({ estado: "ok", dado: igInicial }); return; }
    let vivo = true;
    setIg({ estado: "carregando" });
    chamar<IgParaResumo & { estado?: string }>(`/api/meta/instagram/${clientId}?token=${encodeURIComponent(token)}&period=${periodo}`).then((r) => {
      if (!vivo) return;
      const e = r.data?.estado;
      if (r.ok && r.data?.conta && (!e || e === "ok")) setIg({ estado: "ok", dado: r.data });
      else setIg({ estado: r.status === 404 ? "ausente" : "falha" }); // 404 = perfil ainda não ligado
    });
    return () => { vivo = false; };
  }, [token, clientId, periodo, temInstagram, igInicial]);

  useEffect(() => {
    if (!temConteudo) return;
    let vivo = true;
    chamar<{ items?: { entregueEm: string | null }[] }>(`/api/portal/${token}/content`).then((r) => {
      if (!vivo) return;
      setArtes(r.ok && r.data ? { estado: "ok", dado: (r.data.items ?? []).filter((i) => dentroDaJanela(i.entregueEm, DIAS[periodo])).length } : { estado: "falha" });
    });
    return () => { vivo = false; };
  }, [token, periodo, temConteudo]);

  // ── Anúncios (Meta) ──
  const snap = anuncios.dados;
  const adsFora = anuncios.falhou || snap?.ads_status === "indisponivel";
  const adsOk = !!snap && !adsFora && !anuncios.carregando && snap.period?.kind === KIND[periodo];
  const k = adsOk ? snap.kpis : null;
  const palavras = palavrasDoResultado(snap?.result_kind ?? null);
  const destaque = adsOk ? snap.top_creatives[0] ?? null : null;

  // ── Google ──
  const g = google.estado === "ok" ? google.dado : null;
  const kg = (lista: KpiG[] | undefined, chave: string) => lista?.find((x) => x.chave === chave) ?? null;
  const contatos = kg(g?.perfil?.kpis, "acoes");
  const cliquesG = kg(g?.ads?.kpis, "cliques");
  const googleFora = google.estado === "falha" || (!!g && !g.perfil && !g.ads && (!!g.perfilIndisponivel || !!g.adsIndisponivel));

  // ── Instagram ──
  const nIg = ig.estado === "ok" ? numerosDoInstagram(ig.dado) : null;

  const lendo = (temAnuncios && anuncios.carregando) || (temGoogle && google.estado === "carregando") || (temInstagram && ig.estado === "carregando");
  const frase = fraseDoResumo({
    periodo,
    anuncios: k ? { resultados: k.messages.value, tipo: snap?.result_kind ?? null } : null,
    googlePerfil: contatos ? { contatos: contatos.valor } : null,
    googleAnuncios: cliquesG ? { cliques: cliquesG.valor } : null,
    instagram: nIg ? { saldoSeguidores: nIg.saldo } : null,
  });
  const per = adsOk ? snap.period : null;

  const canais: CanalProps[] = [
    ...(temAnuncios ? [{
      aba: "ads" as const, icone: BarChart3, nome: "Anúncios",
      estado: anuncios.carregando ? "carregando" as const : adsOk && k?.messages.value != null ? "ok" as const : "falha" as const,
      valor: k?.messages.value != null ? formatarNumero(k.messages.value) : "—",
      oQue: palavras.varios,
      variacaoPct: k?.messages.delta_pct ?? null,
      detalhe: k?.cpa.value != null ? `${formatarBRL(k.cpa.value)} ${palavras.porUm}` : k?.spend.value != null ? `${formatarBRL(k.spend.value)} investidos` : undefined,
    }] : []),
    ...(temGoogle ? [{
      aba: "google" as const, icone: Globe, nome: "Google",
      estado: google.estado === "carregando" ? "carregando" as const : googleFora || (!contatos && !cliquesG) ? "falha" as const : "ok" as const,
      // O perfil (gente que procurou a loja) vem primeiro; só anúncios no Google = cliques.
      valor: contatos?.valor != null ? formatarNumero(contatos.valor) : cliquesG?.valor != null ? formatarNumero(cliquesG.valor) : "—",
      oQue: contatos ? "contatos pelo perfil" : "cliques nos anúncios",
      variacaoPct: (contatos ?? cliquesG)?.variacaoPct ?? null,
      detalhe: contatos && cliquesG?.valor != null ? `${formatarNumero(cliquesG.valor)} cliques nos anúncios` : undefined,
    }] : []),
    ...(temInstagram && ig.estado !== "ausente" ? [{
      aba: "social" as const, icone: TrendingUp, nome: "Instagram",
      estado: ig.estado === "carregando" ? "carregando" as const : nIg?.seguidores != null ? "ok" as const : "falha" as const,
      valor: nIg?.seguidores != null ? formatarNumero(nIg.seguidores) : "—",
      oQue: "seguidores",
      variacaoPct: null,
      detalhe: nIg?.saldo != null && nIg.saldo !== 0 ? `${comSinal(nIg.saldo)} no período` : nIg?.alcance != null ? `${formatarNumero(nIg.alcance)} pessoas alcançadas` : undefined,
      detalheBom: (nIg?.saldo ?? 0) > 0,
    }] : []),
    ...(temConteudo ? [{
      aba: "conteudo" as const, icone: Palette, nome: "Conteúdo",
      estado: artes.estado === "carregando" ? "carregando" as const : artes.estado === "ok" ? "ok" as const : "falha" as const,
      valor: artes.estado === "ok" ? formatarNumero(artes.dado) : "—",
      oQue: artes.estado === "ok" && artes.dado === 1 ? "arte entregue" : "artes entregues",
      variacaoPct: null,
      detalhe: "Agenda, artes e envio de material",
    }] : []),
  ];

  return (
    // Celular: frase, canais e só depois o anúncio destaque (os canais são o que o dono procura).
    // Computador: frase e destaque lado a lado, canais embaixo.
    <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <Cartao as="section" interativo={false} className={cn("p-5 sm:p-6", destaque ? "lg:col-span-3" : "lg:col-span-5")} aria-busy={lendo}>
          <p className="text-lone-eyebrow uppercase text-muted-foreground">
            Visão geral{per ? ` · ${rotuloDia(per.start)} a ${rotuloDia(per.end)}` : ""}
          </p>
          {frase ? (
            <p className="mt-3 max-w-prose text-lone-h1 font-medium leading-snug tracking-tight text-foreground sm:text-lone-hero sm:leading-snug">{frase}</p>
          ) : lendo ? (
            <div className="mt-3 space-y-2" aria-hidden><Skeleton className="h-7 w-full max-w-md" /><Skeleton className="h-7 w-2/3 max-w-sm" /></div>
          ) : (
            <p className="mt-3 max-w-prose text-lone-h2 text-muted-foreground">
              Ainda não há resultado para contar neste período. Abra uma área abaixo para ver o detalhe de cada canal.
            </p>
          )}
          {frase && lendo && <p className="mt-2 text-lone-caption text-muted-foreground" role="status">Ainda buscando os outros canais…</p>}
          <p className="mt-3 text-lone-caption text-muted-foreground">
            Cada canal conta do jeito dele — os números não se somam. Toque num canal para ver o detalhe.
          </p>
        </Cartao>

        {destaque && (
          <Cartao as="section" interativo={false} className="order-3 flex flex-col p-5 lg:order-2 lg:col-span-2">
            <CabecalhoSecao nivel={3} icone={Trophy} titulo="Anúncio que mais trouxe resultado" />
            <div className="mt-4 flex items-center gap-3">
              <CriativoThumb url={destaque.thumbnail_url} path={destaque.thumbnail_path ?? null} name={destaque.name} className="h-16 w-16" />
              <div className="min-w-0">
                <p className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground">{destaque.name}</p>
                <p className="mt-1 text-lone-caption text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">{formatarNumero(destaque.messages)}</span> {destaque.messages === 1 ? palavras.um : palavras.varios}
                  {destaque.cpa != null && <> · <span className="tabular-nums">{formatarBRL(destaque.cpa)}</span> {palavras.porUm}</>}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => onAbrir("ads")}
              className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              Ver todos os anúncios <ArrowRight size={13} aria-hidden />
            </button>
          </Cartao>
        )}

      <section className="order-2 space-y-3 lg:order-3 lg:col-span-5">
        <CabecalhoSecao titulo="Resultado por canal" descricao="O número principal de cada um no período" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {canais.map((c, i) => (
            <motion.div key={c.aba} variants={entrada} initial="oculto" animate="visivel" custom={i} className={cn("min-w-0", canais.length % 2 === 1 && i === 0 && "col-span-2 lg:col-span-1")}>
              <Canal {...c} onAbrir={onAbrir} />
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface CanalProps {
  aba: AbaPortal;
  icone: LucideIcon;
  nome: string;
  estado: "carregando" | "ok" | "falha";
  valor: string;
  /** O que o número conta ("conversas", "contatos pelo perfil"). */
  oQue: string;
  variacaoPct: number | null;
  natureza?: Natureza;
  detalhe?: string;
  detalheBom?: boolean;
}

function Canal({ aba, icone: Icone, nome, estado, valor, oQue, variacaoPct, natureza = "direta", detalhe, detalheBom, onAbrir }: CanalProps & { onAbrir: (a: AbaPortal) => void }) {
  const pct = variacaoPct;
  return (
    <button type="button" onClick={() => onAbrir(aba)} aria-label={`${nome}: abrir a área`}
      className={cn(
        "group flex h-full min-h-[132px] w-full flex-col rounded-xl border border-border bg-card p-4 text-left",
        "[-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", HOVER_CARTAO,
      )}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
            <Icone size={15} aria-hidden />
          </span>
          <span className="truncate">{nome}</span>
        </span>
        <ArrowRight size={14} className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </span>

      {estado === "carregando" ? (
        <span className="mt-3 block space-y-2" aria-hidden><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-28" /></span>
      ) : estado === "falha" ? (
        // Falhou ou ainda não há leitura: diz isso — nunca um zero no lugar do número.
        <span className="mt-3 block text-lone-caption text-muted-foreground">Estamos atualizando estes números. Toque para abrir a área.</span>
      ) : (
        <>
          <span className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-lone-h1 font-semibold tabular-nums tracking-tight text-foreground sm:text-lone-hero">{valor}</span>
            {pct != null && Number.isFinite(pct) && <Variacao pct={pct} natureza={natureza} />}
          </span>
          <span className="mt-0.5 block text-lone-caption text-muted-foreground">{oQue}</span>
          {detalhe && <span className={cn("mt-auto block pt-2 text-lone-caption", detalheBom ? "font-medium text-lone-success" : "text-muted-foreground")}>{detalhe}</span>}
        </>
      )}
    </button>
  );
}

/** Selo de variação contra o período anterior. Até 5% = estável (cinza); queda em âmbar, nunca vermelho. */
function Variacao({ pct, natureza }: { pct: number; natureza: Natureza }) {
  const tom = tomDaVariacao(pct, natureza, 5);
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-lone-caption font-medium tabular-nums",
      tom === "neutro" ? "border-border bg-muted text-muted-foreground"
        : tom === "bom" ? "border-lone-success-border bg-lone-success-bg text-lone-success"
        : "border-lone-warning-border bg-lone-warning-bg text-lone-warning")}>
      {tom === "neutro" && Math.abs(pct) <= 5 ? "estável" : formatarVariacao(pct)}
    </span>
  );
}
