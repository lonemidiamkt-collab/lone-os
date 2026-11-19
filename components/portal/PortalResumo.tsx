"use client";

// components/portal/PortalResumo.tsx — "Visão geral" do Painel de Resultados, no desenho do protótipo
// Lone Results 3.0 do Roberto (19/11/2026). Seções, na ordem do protótipo:
//   1. Resumo executivo (frase com o número em destaque + situação de cada canal) e Criativo de destaque
//   2. Os números mais importantes (até 4 cartões, com variação e mini-gráfico)
//   3. Evolução e origem dos resultados (gráfico por dia + resultados por origem + "viraram vendas?")
//   4. Resultados por canal (Meta Ads, Google Ads, Google Maps, Instagram — com selo de situação)
//   5. Crescimento e execução (visibilidade da marca, trabalho apresentado, leitura do período)
// As contas ficam em lib/portal/resumo.ts.
//
// O que muda do protótipo é só o que ele não tinha: dado real. Cada canal é lido separado e tem o próprio
// estado — o que ainda está chegando mostra esqueleto, o que falhou diz "atualizando" (nunca zero) e NÃO
// derruba os outros; canal que o cliente não tem aparece como "ainda não ativo".

import { useEffect, useState } from "react";
import {
  ArrowRight, BarChart3, Camera, Eye, MapPin, Megaphone, MessageCircle, Receipt, Trophy, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { Cartao, CabecalhoSecao, ListaBarras, Selo, entrada } from "./ui";
import CriativoThumb from "./CriativoThumb";
import AnunciosAtivos from "./AnunciosAtivos";
import Skeleton from "@/components/ui/Skeleton";
import { CardKpi, HOVER_CARTAO, PainelComparativo, type KpiComparativo } from "@/components/ui/painel-comparativo";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import type { PeriodKind, SnapshotData } from "@/lib/portal/types";
import type { AbaPortal } from "@/lib/portal/navegacao";
import { dentroDaJanela, formatarBRL, formatarNumero, palavrasDoResultado, rotuloDia } from "@/lib/portal/formatos";
import {
  comSinal, destaqueDoResumo, leituraDoPeriodo, numerosDoInstagram, textoDaFrase, type IgParaResumo, type PeriodoDoResumo,
} from "@/lib/portal/resumo";

/** Só o que o resumo lê da rota do Google (a forma completa está em lib/google/relatorio.ts). */
interface KpiG { chave: string; valor: number | null; variacaoPct: number | null }
interface RespostaGoogle {
  perfil?: { kpis: KpiG[] } | null;
  ads?: { kpis: KpiG[]; semVeiculacao?: boolean } | null;
  perfilIndisponivel?: boolean;
  adsIndisponivel?: boolean;
}

type Leitura<T> = { estado: "carregando" } | { estado: "falha" } | { estado: "ausente" } | { estado: "ok"; dado: T };
/** Situação de um canal na tela: ainda não ligado, chegando, sem resposta agora, ligado mas sem movimento, com número. */
type Situacao = "inativo" | "carregando" | "falha" | "parado" | "ok";

const KIND: Record<PeriodoDoResumo, PeriodKind> = { "7d": "last_week", "14d": "last_2_weeks" };
const DIAS: Record<PeriodoDoResumo, number> = { "7d": 7, "14d": 14 };

const SELO: Record<Situacao, { texto: string; tom: "bom" | "atencao" | "marca" | "neutro" }> = {
  ok: { texto: "Com dados", tom: "bom" },
  parado: { texto: "Sem veiculação", tom: "neutro" },
  falha: { texto: "Atualizando", tom: "atencao" },
  carregando: { texto: "Buscando", tom: "neutro" },
  inativo: { texto: "Ainda não ativo", tom: "neutro" },
};
/** Texto do selo de situação na frase do topo ("Meta Ads · dados disponíveis"). */
const NO_TOPO: Record<Situacao, string> = {
  ok: "dados disponíveis", parado: "sem veiculação", falha: "atualizando", carregando: "buscando", inativo: "ainda não ativo",
};

export interface AnunciosDoResumo { dados: SnapshotData | null; carregando: boolean; falhou: boolean }

export default function PortalResumo({ token, clientId, periodo, anuncios, igInicial = null, temAnuncios, temGoogleAds, temGoogleMaps, temInstagram, onAbrir }: {
  token: string;
  clientId: string;
  periodo: PeriodoDoResumo;
  /** O snapshot dos anúncios que o painel já tem (do mesmo período). */
  anuncios: AnunciosDoResumo;
  /** Instagram de 7 dias lido do cache no servidor. */
  igInicial?: IgParaResumo | null;
  temAnuncios: boolean;
  temGoogleAds: boolean;
  temGoogleMaps: boolean;
  temInstagram: boolean;
  onAbrir: (a: AbaPortal) => void;
}) {
  const temGoogle = temGoogleAds || temGoogleMaps;
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
    let vivo = true;
    chamar<{ items?: { entregueEm: string | null }[] }>(`/api/portal/${token}/content`).then((r) => {
      if (!vivo) return;
      setArtes(r.ok && r.data ? { estado: "ok", dado: (r.data.items ?? []).filter((i) => dentroDaJanela(i.entregueEm, DIAS[periodo])).length } : { estado: "falha" });
    });
    return () => { vivo = false; };
  }, [token, periodo]);

  // ── Meta Ads ──
  const snap = anuncios.dados;
  const adsFora = anuncios.falhou || snap?.ads_status === "indisponivel";
  const adsOk = temAnuncios && !!snap && !adsFora && !anuncios.carregando && snap.period?.kind === KIND[periodo];
  const k = adsOk ? snap.kpis : null;
  const chart = adsOk ? snap.chart : null;
  const palavras = palavrasDoResultado(snap?.result_kind ?? null);
  const destaqueAd = adsOk ? snap.top_creatives[0] ?? null : null;
  const resultados = k?.messages.value ?? null;
  const sitAds: Situacao = !temAnuncios ? "inativo" : anuncios.carregando ? "carregando" : !adsOk || resultados == null ? "falha" : "ok";
  const somaAnterior = chart?.previous_messages ? chart.previous_messages.reduce<number>((a, v) => a + (v ?? 0), 0) : null;

  // ── Google ──
  const g = google.estado === "ok" ? google.dado : null;
  const kg = (lista: KpiG[] | undefined, chave: string) => lista?.find((x) => x.chave === chave) ?? null;
  const contatos = kg(g?.perfil?.kpis, "acoes");
  const cliquesG = kg(g?.ads?.kpis, "cliques");
  const sitGoogle = (tem: boolean, kpi: KpiG | null, indisponivel: boolean | undefined, parado: boolean): Situacao =>
    !tem ? "inativo" : google.estado === "carregando" ? "carregando" : google.estado === "falha" || indisponivel || !kpi || kpi.valor == null ? "falha" : parado ? "parado" : "ok";
  const sitGads = sitGoogle(temGoogleAds, cliquesG, g?.adsIndisponivel, !!g?.ads?.semVeiculacao || cliquesG?.valor === 0);
  const sitMaps = sitGoogle(temGoogleMaps, contatos, g?.perfilIndisponivel, false);

  // ── Instagram ──
  const nIg = ig.estado === "ok" ? numerosDoInstagram(ig.dado) : null;
  const sitIg: Situacao = !temInstagram || ig.estado === "ausente" ? "inativo" : ig.estado === "carregando" ? "carregando" : nIg?.seguidores == null ? "falha" : "ok";

  const lendo = sitAds === "carregando" || sitGads === "carregando" || sitMaps === "carregando" || sitIg === "carregando";
  const destaque = destaqueDoResumo({
    periodo,
    anuncios: sitAds === "ok" ? { resultados, variacaoPct: k?.messages.delta_pct, custo: k?.cpa.value, variacaoCustoPct: k?.cpa.delta_pct, tipo: snap?.result_kind ?? null } : null,
    googlePerfil: sitMaps === "ok" ? { contatos: contatos!.valor, variacaoPct: contatos!.variacaoPct } : null,
    googleAnuncios: sitGads === "ok" ? { cliques: cliquesG!.valor } : null,
    instagram: sitIg === "ok" ? { saldoSeguidores: nIg!.saldo } : null,
  });
  const per = adsOk ? snap.period : null;
  const leitura = sitAds === "ok" ? leituraDoPeriodo(k?.messages.delta_pct, k?.cpa.delta_pct, snap?.result_kind ?? null) : null;

  // ── 2. Os números mais importantes ──
  const serie = (s: readonly (number | null)[] | undefined) => (s ?? []).filter((x): x is number => x != null);
  const numeros: KpiComparativo[] = [
    ...(sitAds === "ok" && k ? [
      { rotulo: `${palavras.Varios} · Meta`, icone: MessageCircle, valor: formatarNumero(resultados!), variacaoPct: k.messages.delta_pct, natureza: "direta" as const,
        dica: somaAnterior != null ? `${DIAS[periodo]} dias · antes: ${formatarNumero(somaAnterior)}` : `${DIAS[periodo]} dias`, tendencia: serie(chart?.series.messages) },
      ...(k.cpa.value != null ? [{ rotulo: palavras.custo, icone: Receipt, valor: formatarBRL(k.cpa.value), variacaoPct: k.cpa.delta_pct, natureza: "inversa" as const, dica: `${DIAS[periodo]} dias · Meta Ads` }] : []),
      ...(k.spend.value != null ? [{ rotulo: "Investimento · Meta", icone: Wallet, valor: formatarBRL(k.spend.value), variacaoPct: k.spend.delta_pct, natureza: "neutra" as const,
        dica: `${DIAS[periodo]} dias · não inclui Google`, tendencia: serie(chart?.series.spend) }] : []),
    ] : []),
    ...(sitIg === "ok" && nIg?.saldo != null ? [{
      rotulo: "Saldo de seguidores · IG", icone: Users, valor: comSinal(nIg.saldo), variacaoPct: null,
      dica: nIg.entraram != null && nIg.sairam != null ? `${formatarNumero(nIg.entraram)} entraram − ${formatarNumero(nIg.sairam)} saíram` : `${DIAS[periodo]} dias · Instagram`,
    }] : []),
    ...(sitMaps === "ok" ? [{ rotulo: "Contatos · Google Maps", icone: MapPin, valor: formatarNumero(contatos!.valor!), variacaoPct: contatos!.variacaoPct, natureza: "direta" as const, dica: "ligações, rotas e cliques no site" }] : []),
  ].slice(0, 4);

  // ── 3. Resultados por origem ──
  const origem = [
    { chave: "ads", rotulo: `Meta Ads · ${palavras.varios}`, sit: sitAds, valor: resultados },
    { chave: "gads", rotulo: "Google Ads · cliques", sit: sitGads, valor: cliquesG?.valor ?? null },
    { chave: "maps", rotulo: "Google Maps · contatos pelo perfil", sit: sitMaps, valor: contatos?.valor ?? null },
  ];

  // ── 4. Resultados por canal ──
  const canais: CanalProps[] = [
    { aba: "ads", icone: BarChart3, nome: "Meta Ads", sit: sitAds, valor: resultados != null ? formatarNumero(resultados) : "—", oQue: palavras.varios },
    { aba: "gads", icone: Megaphone, nome: "Google Ads", sit: sitGads, valor: cliquesG?.valor != null ? formatarNumero(cliquesG.valor) : "—", oQue: "cliques nos anúncios" },
    { aba: "maps", icone: MapPin, nome: "Google Maps", sit: sitMaps, valor: contatos?.valor != null ? formatarNumero(contatos.valor) : "—", oQue: "contatos pelo perfil" },
    { aba: "social", icone: Camera, nome: "Instagram", sit: sitIg,
      valor: nIg?.alcance != null ? formatarNumero(nIg.alcance) : nIg?.seguidores != null ? formatarNumero(nIg.seguidores) : "—",
      oQue: nIg?.alcance != null ? "contas alcançadas no perfil" : "seguidores" },
  ];

  const titulo = textoDaFrase(destaque?.partes ?? []);

  return (
    <div className="space-y-7">
      {/* ── 1. Resumo executivo + criativo de destaque ── */}
      <div className={cn("grid gap-3.5", destaqueAd && "lg:grid-cols-5")}>
        <Cartao as="section" interativo={false} aria-busy={lendo}
          className={cn("flex min-h-[220px] flex-col justify-center gap-3 p-5 sm:p-7", destaqueAd && "lg:col-span-3")}>
          <p className="text-lone-eyebrow font-semibold uppercase text-lone-brand-soft">
            Resumo executivo{per ? ` · ${rotuloDia(per.start)} a ${rotuloDia(per.end)}` : ""}
          </p>
          {destaque ? (
            <>
              <p aria-label={titulo} className="max-w-[710px] text-[21px] font-semibold leading-snug tracking-tight text-foreground sm:text-[26px]">
                {destaque.partes.map((p, i) => typeof p === "string" ? <span key={i}>{p}</span> : (
                  <span key={i} className={p.tom === "numero" ? "text-lone-brand-soft" : p.tom === "bom" ? "text-lone-success" : "text-lone-warning"}>{p.texto}</span>
                ))}
              </p>
              {destaque.nota.length > 0 && <p className="max-w-[640px] text-lone-body text-secondary-foreground">{destaque.nota.join(" ")}</p>}
            </>
          ) : lendo ? (
            <div className="space-y-2" aria-hidden><Skeleton className="h-7 w-full max-w-md" /><Skeleton className="h-7 w-2/3 max-w-sm" /></div>
          ) : (
            <p className="max-w-prose text-lone-h2 text-muted-foreground">
              Ainda não há resultado para contar neste período. Veja abaixo a situação de cada canal.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {([["Meta Ads", sitAds], ["Instagram", sitIg], ["Google Ads", sitGads], ["Google Maps", sitMaps]] as const).map(([nome, sit]) => (
              <Selo key={nome} tom={sit === "ok" ? (nome === "Instagram" ? "marca" : "bom") : SELO[sit].tom}>{nome} · {NO_TOPO[sit]}</Selo>
            ))}
          </div>
        </Cartao>

        {destaqueAd && (
          <Cartao as="section" interativo={false} className="flex flex-col justify-between p-5 sm:p-6 lg:col-span-2">
            <div>
              <p className="flex items-center gap-1.5 text-lone-eyebrow font-semibold uppercase text-lone-brand-soft"><Trophy size={12} aria-hidden /> Criativo de destaque</p>
              <div className="my-4 flex items-center gap-4">
                <CriativoThumb url={destaqueAd.thumbnail_url} path={destaqueAd.thumbnail_path ?? null} name={destaqueAd.name} className="h-[76px] w-[70px] rounded-xl" />
                <div className="min-w-0">
                  <h3 className="line-clamp-2 break-words text-lone-h2 font-medium text-foreground">{destaqueAd.name}</h3>
                  <p className="mt-1 text-lone-caption text-muted-foreground">Maior número de {palavras.varios} entre os anúncios do período</p>
                </div>
              </div>
              <dl className="flex flex-wrap gap-x-6 gap-y-3">
                {([
                  [formatarNumero(destaqueAd.messages), destaqueAd.messages === 1 ? palavras.um : palavras.varios],
                  ...(destaqueAd.cpa != null ? [[formatarBRL(destaqueAd.cpa), palavras.porUm] as const] : []),
                  [formatarBRL(destaqueAd.spend), "investidos"],
                ] as const).map(([v, r]) => (
                  <div key={r}>
                    <dd className="text-[22px] font-semibold tabular-nums tracking-tight text-foreground">{v}</dd>
                    <dt className="text-[10px] text-muted-foreground">{r}</dt>
                  </div>
                ))}
              </dl>
            </div>
            <BotaoIr onClick={() => onAbrir("ads")} className="mt-4 self-start">Explorar criativos</BotaoIr>
          </Cartao>
        )}
      </div>

      {/* Atalho pedido pelo Roberto (19/11): ver os anúncios que estão no ar sem sair da Visão geral.
          Abre a mesma lista da área Meta Ads. Sem anúncio ativo (ou lista que a Meta não entregou), não aparece. */}
      {adsOk && snap.active_ads && snap.active_ads.total > 0 && (
        <AnunciosAtivos lista={snap.active_ads} periodo={snap.period.kind} tipoResultado={snap.result_kind ?? null} />
      )}

      {/* ── 2. Os números mais importantes ── */}
      {(numeros.length > 0 || lendo) && (
        <section className="space-y-3">
          <CabecalhoSecao titulo="Os números mais importantes" descricao="Resultados pagos e crescimento do perfil, com fontes separadas" />
          <div className={cn("grid grid-cols-2 gap-3", numeros.length >= 4 || !numeros.length ? "lg:grid-cols-4" : numeros.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            {numeros.length > 0
              ? numeros.map((kpi, i) => (
                <motion.div key={kpi.rotulo} variants={entrada} initial="oculto" animate="visivel" custom={i} className="min-w-0">
                  <CardKpi kpi={kpi} limiar={5} tomRuim="atencao" />
                </motion.div>
              ))
              : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)}
          </div>
        </section>
      )}

      {/* ── 3. Evolução e origem dos resultados ── */}
      <section className="space-y-3">
        <CabecalhoSecao titulo="Evolução e origem dos resultados" descricao="Use a navegação por canal para aprofundar" />
        <div className={cn("grid gap-3.5", temAnuncios && "lg:grid-cols-5")}>
          {temAnuncios && (
            <div className="min-w-0 lg:col-span-3">
              {sitAds === "falha" ? (
                <Cartao interativo={false} className="grid h-full min-h-[220px] place-items-center p-6 text-center text-sm text-muted-foreground" role="status">
                  Estamos atualizando os números dos anúncios. Volte em alguns minutos.
                </Cartao>
              ) : (
                <PainelComparativo
                  carregando={sitAds === "carregando"}
                  titulo={`${palavras.Varios} por dia`}
                  subtitulo={per ? `${rotuloDia(per.start)} a ${rotuloDia(per.end)}, comparado com ${rotuloDia(per.previous_start)} a ${rotuloDia(per.previous_end)}` : undefined}
                  rotuloAtual="Período"
                  rotuloAnterior="Anterior"
                  serie={(chart?.days ?? []).map((d, i) => ({ rotulo: rotuloDia(d), atual: chart?.series.messages[i] ?? 0, anterior: chart?.previous_messages?.[i] ?? null }))}
                  formatarValor={(v) => v.toLocaleString("pt-BR")}
                  kpis={[]}
                  limiarNeutroPct={5}
                  tomRuim="atencao"
                  vazio={`Ainda não houve ${palavras.varios} neste período.`}
                  // Mesma altura do cartão "Resultados por origem" ao lado: sem buraco embaixo do gráfico.
                  className="h-full [&>div]:h-full [&>div]:grid-rows-1"
                />
              )}
            </div>
          )}
          <Cartao as="section" interativo={false} className={cn("flex flex-col p-5", temAnuncios && "lg:col-span-2")}>
            <CabecalhoSecao nivel={3} titulo="Resultados por origem" descricao="Fontes distintas, sem somar o que não é a mesma coisa" />
            <div className="mt-4">
              <ListaBarras rotulo="Resultados por origem" itens={origem.map((o) => ({
                chave: o.chave,
                rotulo: o.rotulo,
                valor: o.sit === "ok" || o.sit === "parado" ? o.valor ?? 0 : 0,
                texto: o.sit === "ok" || o.sit === "parado" ? formatarNumero(o.valor ?? 0) : o.sit === "carregando" ? "…" : "—",
                detalhe: o.sit === "inativo" ? "Ainda não ativo" : o.sit === "falha" ? "Atualizando" : o.sit === "parado" ? "Sem veiculação no período" : undefined,
              }))} />
            </div>
            <div className="mt-auto rounded-xl border border-primary/30 bg-primary/10 p-4">
              <h3 className="text-lone-h2 font-medium text-foreground">Os contatos viraram vendas?</h3>
              <p className="mt-1.5 text-lone-body text-secondary-foreground">
                O painel mostra quem procurou a sua empresa. Para saber quanto virou venda, registre as vendas que vieram do marketing.
              </p>
              <BotaoIr onClick={() => onAbrir("vendas")} className="mt-3">Ver acompanhamento de vendas</BotaoIr>
            </div>
          </Cartao>
        </div>
      </section>

      {/* ── 4. Resultados por canal ── */}
      <section className="space-y-3">
        <CabecalhoSecao titulo="Resultados por canal" descricao="Cada plataforma mantém suas próprias métricas e período de apuração" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {canais.map((c, i) => (
            <motion.div key={c.aba} variants={entrada} initial="oculto" animate="visivel" custom={i} className="min-w-0">
              <Canal {...c} onAbrir={onAbrir} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── 5. Crescimento e execução ── */}
      <section className="space-y-3">
        <CabecalhoSecao titulo="Crescimento e execução" descricao="Resultados de marca e entregas da equipe no período" />
        <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          <Cartao as="section" interativo={false} className="p-5">
            <h3 className="flex items-center gap-2 text-lone-h2 font-medium text-foreground"><Eye size={15} className="text-muted-foreground" aria-hidden /> Visibilidade da marca</h3>
            <dl className="mb-2 mt-5 flex flex-wrap gap-x-6 gap-y-3">
              <Grande valor={sitAds === "ok" && k?.reach.value != null ? formatarNumero(k.reach.value) : null} carregando={sitAds === "carregando"} rotulo="alcance dos anúncios Meta" />
              <Grande valor={sitIg === "ok" && nIg?.alcance != null ? formatarNumero(nIg.alcance) : null} carregando={sitIg === "carregando"} rotulo="alcance do Instagram" />
            </dl>
            <p className="text-lone-caption text-muted-foreground">Os públicos podem se sobrepor. Não existe alcance único somando os dois números.</p>
          </Cartao>

          <Cartao as="section" interativo={false} className="flex flex-col p-5">
            <h3 className="text-lone-h2 font-medium text-foreground">Trabalho apresentado no portal</h3>
            <dl className="mb-3 mt-5 flex flex-wrap gap-x-6 gap-y-3">
              <Grande valor={sitIg === "ok" && nIg?.posts != null ? formatarNumero(nIg.posts) : null} carregando={sitIg === "carregando"} rotulo="posts no Instagram" />
              <Grande valor={artes.estado === "ok" ? formatarNumero(artes.dado) : null} carregando={artes.estado === "carregando"} rotulo={artes.estado === "ok" && artes.dado === 1 ? "arte entregue" : "artes entregues"} />
            </dl>
            <BotaoIr onClick={() => onAbrir("conteudo")} className="mt-auto self-start">Ver calendário e arquivos</BotaoIr>
          </Cartao>

          <Cartao as="section" interativo={false} className="flex flex-col gap-2.5 p-5 md:col-span-2 lg:col-span-1">
            <h3 className="text-lone-h2 font-medium text-foreground">Leitura do período</h3>
            <span><Selo tom="marca">Observação dos dados</Selo></span>
            <p className="text-lone-body text-secondary-foreground">
              {leitura ?? (lendo ? "Buscando os números do período…" : "Ainda não há comparação com o período anterior para ler aqui.")}
            </p>
            <p className="text-[10px] text-muted-foreground">Leitura automática dos números, não é uma ação registrada da equipe. O painel ainda não sabe quanto desses contatos virou venda.</p>
          </Cartao>
        </div>
      </section>
    </div>
  );
}

/** Número grande com legenda (os "bigstats" do protótipo). Sem número: travessão, nunca zero. */
function Grande({ valor, rotulo, carregando }: { valor: string | null; rotulo: string; carregando: boolean }) {
  return (
    <div>
      <dd className="text-[22px] font-semibold tabular-nums tracking-tight text-foreground">
        {carregando ? <Skeleton className="h-7 w-16" /> : valor ?? <span className="text-muted-foreground" aria-label="sem número agora">—</span>}
      </dd>
      <dt className="text-[10px] text-muted-foreground">{rotulo}</dt>
    </div>
  );
}

function BotaoIr({ onClick, className, children }: { onClick: () => void; className?: string; children: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}>
      {children} <ArrowRight size={13} aria-hidden />
    </button>
  );
}

interface CanalProps {
  aba: AbaPortal;
  icone: LucideIcon;
  nome: string;
  sit: Situacao;
  valor: string;
  /** O que o número conta ("conversas", "contatos pelo perfil"). */
  oQue: string;
}

/** Cartão de canal do protótipo: ícone, selo de situação, nome, número e o que ele conta. Leva à área. */
function Canal({ aba, icone: Icone, nome, sit, valor, oQue, onAbrir }: CanalProps & { onAbrir: (a: AbaPortal) => void }) {
  return (
    <button type="button" onClick={() => onAbrir(aba)} aria-label={`${nome}: abrir a área`}
      className={cn(
        "group flex h-full min-h-[150px] w-full flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left",
        "[-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", HOVER_CARTAO,
      )}>
      <span className="flex w-full items-center justify-between gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-lone-brand-soft"><Icone size={16} aria-hidden /></span>
        <Selo tom={SELO[sit].tom}>{SELO[sit].texto}</Selo>
      </span>
      <span className="mt-1.5 text-xs font-semibold text-foreground">{nome}</span>
      {sit === "carregando" ? (
        <span className="block space-y-2" aria-hidden><Skeleton className="h-7 w-20" /><Skeleton className="h-3 w-24" /></span>
      ) : sit === "ok" || sit === "parado" ? (
        <>
          <span className="text-[23px] font-semibold leading-tight tabular-nums tracking-tight text-foreground">{valor}</span>
          <span className="text-lone-caption text-muted-foreground">{oQue}</span>
        </>
      ) : (
        // Não ligado ou sem resposta agora: diz isso — nunca um zero no lugar do número.
        <>
          <span className="text-[23px] font-semibold leading-tight text-muted-foreground" aria-hidden>—</span>
          <span className="text-lone-caption text-muted-foreground">{sit === "inativo" ? "toque para ver como ativar" : "estamos atualizando estes números"}</span>
        </>
      )}
    </button>
  );
}
