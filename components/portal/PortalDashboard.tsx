"use client";

// Painel de Resultados — a página que o CLIENTE abre pelo link com token (pública). Tudo o que
// aparece aqui vem do snapshot montado no servidor (lib/portal/buildSnapshot.ts) ou das rotas
// públicas do portal: nada interno (notas do time, outros clientes, saúde, alertas, financeiro da
// agência) e nenhuma chamada à Meta a partir do navegador.
//
// Modernização (24/09, pedido do CEO): uma família visual só nas duas abas, evolução diária no
// mesmo desenho do painel comparativo do topo, "Ver todos os anúncios ativos", público com
// percentuais, conteúdo que respeita o período e seletores sem o anel de foco "preso".

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  BarChart3, ChevronDown, ClipboardList, Pause, Pin, Palette, RefreshCw, Star, Trophy, TrendingUp, Wallet, Zap,
  type LucideIcon,
} from "lucide-react";
import type { SnapshotData, PeriodKind, CreativeItem } from "@/lib/portal/types";
import MobileFAB from "./MobileFAB";
import PortalContent from "./PortalContent";
import PortalInstagram, { IG_PERIODOS, type IgPeriodo } from "./PortalInstagram";
import PortalUpload from "@/components/portal/PortalUpload";
import PortalAgenda from "./PortalAgenda";
import PortalMateriais from "./PortalMateriais";
import EvolucaoDiaria from "./EvolucaoDiaria";
import PublicoCard from "./PublicoCard";
import AnunciosAtivos from "./AnunciosAtivos";
import VendasDoCliente from "@/components/trafego/vendas/VendasDoCliente";
import CriativoThumb from "./CriativoThumb";
import { Aviso, Cartao, CabecalhoSecao, Segmentado, entrada } from "./ui";
import Skeleton from "@/components/ui/Skeleton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { WHATSAPP_EQUIPE, linkWhatsapp } from "@/lib/portal/contato";
import { fraseDelta, periodoAnterior, resumoConversas, type MetricType } from "@/lib/portal/formatDelta";
import { formatarBRL, formatarNumero, palavrasDoResultado, rotuloDia, type PalavrasResultado } from "@/lib/portal/formatos";
import { PainelComparativo, type KpiComparativo } from "@/components/ui/painel-comparativo";
import { tomDaVariacao } from "@/components/ui/painel-comparativo-utils";

const PERIODS: { valor: PeriodKind; rotulo: string }[] = [
  { valor: "last_week",    rotulo: "7 dias"      },
  { valor: "last_2_weeks", rotulo: "14 dias"     },
  { valor: "this_month",   rotulo: "Este mês"    },
  { valor: "last_month",   rotulo: "Mês passado" },
];

const ICON_MAP: Record<string, LucideIcon> = {
  new_creative:  Palette,
  budget_change: Wallet,
  pause:         Pause,
  optimization:  Zap,
};

/** Timestamp completo (ISO) em horário de Brasília — "Atualizado em" e aviso de dado antigo. */
function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const fmt = (n: number) => formatarNumero(n);

interface Props {
  token: string;
  /** Aprovação de arte pelo cliente. Desligada por decisão do Roberto (31/08) — ver PortalContent. */
  aprovacaoLigada?: boolean;
  clientId: string;
  clientName: string;
  whatsappPhone: string;
  welcomeMessage: string | null;
  initialData: SnapshotData | null;
  hasAds?: boolean;    // pacote inclui anúncios → mostra tráfego
  hasSocial?: boolean; // pacote inclui social/design → mostra artes entregues + Instagram orgânico
  hasIg?: boolean;     // Instagram vinculado de verdade (informativo; a seção continua avisando "não conectado" quando há anúncios)
  comecando?: boolean; // nada vinculado ainda (sem conta de anúncio e sem Instagram) → "estamos começando"
  desde?: string | null;
  /** "MM/AAAA" do rodapé, calculado no servidor em SP (evita divergência de hidratação). */
  mesRelatorio?: string;
}

export default function PortalDashboard({ token, clientId, clientName, whatsappPhone, welcomeMessage, initialData, hasAds = true, hasSocial = false, comecando = false, desde = null, aprovacaoLigada = false, mesRelatorio = "" }: Props) {
  const [period, setPeriod]   = useState<PeriodKind>("last_week");
  const [data, setData]       = useState<SnapshotData | null>(initialData);
  const [loading, setLoading] = useState(false);
  // Sem dado no primeiro render = a busca do servidor não completou. Já abre avisando, em vez de
  // pintar a tela de zeros.
  const [erro, setErro]       = useState<string | null>(
    initialData ? null : "Não consegui carregar seus resultados agora.",
  );
  const [igPeriod, setIgPeriod] = useState<IgPeriodo>("7d");
  // Sobe depois de um envio de material: o histórico "Seus envios" (N37) recarrega.
  const [versaoEnvios, setVersaoEnvios] = useState(0);
  const [montado, setMontado]   = useState(false);
  useEffect(() => setMontado(true), []);

  // Cliente escolhe o que ver: Anúncios (tráfego) ou Crescimento nas redes (Instagram orgânico).
  // Só mostra o seletor quando o pacote tem os dois; senão abre direto no que existe.
  const showToggle = hasAds && hasSocial;
  const [view, setView] = useState<"ads" | "social">(hasAds ? "ads" : "social");

  const phone = whatsappPhone || WHATSAPP_EQUIPE;

  // Buscar resultado pode falhar (a Meta recusa em rajada, ou demora). Antes era
  // `if (res.ok) setData(...)` e mais nada: quando falhava, o spinner sumia e ficava na tela o
  // período ANTERIOR, calado — o cliente lia número de outra semana achando que era o pedido.
  const fetchPeriod = useCallback(async (p: PeriodKind) => {
    setLoading(true);
    setErro(null);
    const r = await chamar<SnapshotData>(`/api/portal/${token}/snapshot`, { period_kind: p });
    if (r.ok && r.data) {
      setData(r.data);
    } else {
      // Sem dado novo, o período antigo NÃO pode ficar na tela sob o rótulo novo.
      setData(null);
      setErro(r.status === 0
        ? "Não consegui buscar os resultados agora. Verifique sua conexão."
        : r.erro || "Não consegui buscar os resultados agora.");
    }
    setLoading(false);
  }, [token]);

  function handlePeriod(p: PeriodKind) {
    setPeriod(p);
    fetchPeriod(p);
  }

  // Meta não respondeu e não havia dado recente: nada de número, só o aviso.
  const atualizando = data?.ads_status === "indisponivel";
  const kpis    = atualizando ? undefined : data?.kpis;
  const chart   = atualizando ? undefined : data?.chart;
  const top     = atualizando ? [] : data?.top_creatives ?? [];
  const ativos  = atualizando ? null : data?.active_ads ?? null;
  const demo    = atualizando ? undefined : data?.demographics;
  const actions = data?.agency_actions ?? [];

  const genAt = data?.generated_at && !atualizando ? fmtDataHora(data.generated_at) : null;
  const periodoDado: PeriodKind = data?.period?.kind ?? period;
  // O resultado segue o objetivo da campanha (N4): conversas, leads ou compras. Snapshot antigo = conversas.
  const tipoResultado = data?.result_kind ?? null;
  const palavras = palavrasDoResultado(tipoResultado);
  const resumo = kpis ? resumoConversas(kpis.messages.value, kpis.messages.delta_pct, periodoDado, tipoResultado) : null;

  const kpiItems: Array<{
    key: MetricType; label: string;
    val: { value: number | null; delta_pct: number | null; direction: string } | undefined;
    format: (v: number) => string;
  }> = [
    { key: "messages", label: palavras.Varios,      val: kpis?.messages, format: (v) => fmt(v) },
    { key: "spend",    label: "Investido",          val: kpis?.spend,    format: (v) => formatarBRL(v) },
    { key: "cpa",      label: palavras.custo,       val: kpis?.cpa,      format: (v) => formatarBRL(v) },
    { key: "reach",    label: "Pessoas alcançadas", val: kpis?.reach,    format: (v) => fmt(v) },
  ];

  // Resumo do topo: resultado por dia × mesmo dia do período anterior + os 4 números principais.
  const dias = chart?.days ?? [];
  const prevConversas = chart?.previous_messages ?? null;
  const serieConversas = dias.map((d, i) => ({ rotulo: rotuloDia(d), atual: chart?.series.messages[i] ?? 0, anterior: prevConversas?.[i] ?? null }));
  const kpisResumo: KpiComparativo[] = kpiItems.map(({ key, label, val, format }) => ({
    rotulo: label,
    valor: val?.value != null ? format(val.value) : "—",
    variacaoPct: val?.delta_pct ?? null,
    // Custo por resultado: cair é bom. Investimento: nem bom nem ruim.
    natureza: key === "cpa" ? "inversa" : key === "spend" ? "neutra" : "direta",
    dica: fraseDelta(key, val?.delta_pct ?? null, periodoDado) ?? undefined,
  }));
  const per = data?.period;
  const datasPeriodo = per ? `${rotuloDia(per.start)} a ${rotuloDia(per.end)}, comparado com ${rotuloDia(per.previous_start)} a ${rotuloDia(per.previous_end)}.` : undefined;

  const mostraPublico = loading || !!demo?.gender || (demo?.age_ranges?.length ?? 0) > 0;
  const mostraCriativos = loading || top.length > 0 || (ativos?.total ?? 0) > 0;
  const mostraTimeline = loading || actions.length > 0;

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-background text-foreground">
      <MobileFAB phone={phone} clientName={clientName} />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">

        {/* ── Cabeçalho ─────────────────────────────────────────────── */}
        <header className="mb-5 flex items-start justify-between gap-4 lg:mb-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Lone Mídia" className="h-4 w-auto opacity-70" />
              <p className="text-lone-eyebrow uppercase text-muted-foreground">Painel de Resultados</p>
            </div>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              {clientName}
            </h1>
            {genAt && view === "ads" && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-lone-caption text-muted-foreground">
                <RefreshCw size={12} aria-hidden /> Atualizado em {genAt}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Só depois de montar: o tema do cliente só é conhecido no navegador (evita ícone trocado). */}
            {montado ? <ThemeToggle /> : <span className="h-9 w-9" aria-hidden />}
            {/* Desktop: botão no cabeçalho / Celular: botão flutuante (MobileFAB) */}
            <a
              href={linkWhatsapp(phone)}
              target="_blank" rel="noopener noreferrer"
              className="hidden h-10 shrink-0 items-center gap-2 rounded-lg bg-whatsapp px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 lg:inline-flex"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
              </svg>
              Falar com a equipe
            </a>
          </div>
        </header>

        {welcomeMessage && (
          <Cartao className="mb-5 px-4 py-3 text-sm text-muted-foreground lg:mb-7">{welcomeMessage}</Cartao>
        )}

        {/* Seletor: Anúncios × Crescimento nas redes (só quando o pacote tem os dois) */}
        {showToggle && (
          <Segmentado
            className="mb-6 sm:inline-flex sm:w-auto"
            rotulo="O que ver"
            cheio
            destaque
            opcoes={[
              { valor: "ads", rotulo: "Anúncios", icone: BarChart3 },
              { valor: "social", rotulo: "Crescimento nas redes", icone: TrendingUp },
            ]}
            valor={view}
            onChange={setView}
          />
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
          {/* ── Crescimento nas redes (Instagram orgânico + Conteúdo entregue + Enviar material) ── */}
          {hasSocial && view === "social" && (
            <div className="space-y-6">
              {!comecando && (
                <Segmentado
                  rotulo="Período"
                  opcoes={IG_PERIODOS.map((p) => ({ valor: p.valor, rotulo: p.rotulo }))}
                  valor={igPeriod}
                  onChange={setIgPeriod}
                />
              )}
              {/* Nada vinculado ainda (JP Barbearia, 15/09: link enviado 1 semana após o cadastro e o cliente
                  abriu "Instagram ainda não conectado" + upload). Aqui o cliente lê o que vem, não o que falta. */}
              {comecando ? (
                <Cartao className="p-5">
                  <p className="text-lone-h2 tracking-tight text-foreground">Estamos começando</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {desde ? `Sua conta com a Lone foi aberta em ${desde.split("-").reverse().join("/")}. ` : ""}Esta página vai ser o seu painel de resultados — assim que a operação estiver rodando, você acompanha aqui:
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm text-secondary-foreground">
                    <li><span className="font-medium text-foreground">Anúncios</span> — investimento, conversas e custo por conversa, semana a semana</li>
                    <li><span className="font-medium text-foreground">Instagram</span> — seguidores, alcance e os posts que mais renderam</li>
                    <li><span className="font-medium text-foreground">Conteúdo</span> — as artes que a equipe entregou para você</li>
                  </ul>
                  <p className="mt-3 text-sm text-muted-foreground">Enquanto isso, o que mais ajuda é mandar o material da loja aqui embaixo — logo, fotos, tabela de preço, vídeo.</p>
                </Cartao>
              ) : (
                <PortalInstagram token={token} clientId={clientId} period={igPeriod} />
              )}
              {/* Próximos posts e calendário do mês (N36): só Agendado, No ar e aprovado pelo cliente. */}
              <PortalAgenda token={token} />
              <PortalContent token={token} aprovacaoLigada={aprovacaoLigada}
                dias={IG_PERIODOS.find((p) => p.valor === igPeriod)?.dias ?? 7} />
              <PortalUpload token={token} clientName={clientName} onEnviado={() => setVersaoEnvios((v) => v + 1)} />
              {/* O que o cliente já mandou, se o time recebeu e onde foi usado (N37). */}
              <PortalMateriais token={token} versao={versaoEnvios} />
            </div>
          )}

          {/* ── Anúncios (tráfego) — só pra pacote que tem anúncios ── */}
          {hasAds && view === "ads" && (
            <div className="space-y-5 lg:space-y-6">
              <Segmentado
                rotulo="Período dos anúncios"
                opcoes={PERIODS}
                valor={period}
                onChange={handlePeriod}
                desabilitado={loading}
                cheio
                className="sm:inline-flex sm:w-auto"
              />

              {/* Falhou a busca: fala com o cliente em vez de mostrar zeros ou o período anterior. */}
              {erro && !loading && (
                <Aviso tom="atencao" role="alert" acao={
                  <button onClick={() => fetchPeriod(period)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-accent">
                    <RefreshCw size={13} aria-hidden /> Tentar de novo
                  </button>
                }>
                  {erro} Os dados continuam guardados — é só tentar de novo.
                </Aviso>
              )}

              {/* Meta sem resposta e nenhum dado recente guardado: avisa em vez de pintar zeros. */}
              {!erro && !loading && atualizando && (
                <Aviso tom="info" role="status">Seus números estão sendo atualizados — volte em alguns minutos.</Aviso>
              )}

              {/* Caiu de volta no último dado bom porque a Meta não respondeu: mostra, mas datado. */}
              {!erro && data?.stale_since && (
                <Aviso tom="neutro">
                  Mostrando os últimos resultados que conseguimos buscar, de {fmtDataHora(data.stale_since)}. Estamos atualizando.
                </Aviso>
              )}

              {/* Resumo: conversas × período anterior, frase do período (N34) e os 4 números.
                  Some com erro ou "números sendo atualizados" — nunca pinta zero no lugar. */}
              {(loading || (!erro && !atualizando && kpis)) && (
                <PainelComparativo
                  carregando={loading}
                  titulo={`${palavras.Varios} por dia`}
                  subtitulo={per ? `${per.label}, comparado com ${periodoAnterior(periodoDado)}` : undefined}
                  rotuloAtual="Este período"
                  rotuloAnterior="Período anterior"
                  serie={serieConversas}
                  formatarValor={(v) => v.toLocaleString("pt-BR")}
                  destaque={resumo ? { texto: resumo, tom: tomDaVariacao(kpis?.messages.delta_pct, "direta", 5), detalhe: datasPeriodo } : null}
                  kpis={kpisResumo}
                  limiarNeutroPct={5}
                  tomRuim="atencao"
                  vazio={`Ainda não houve ${palavras.varios} neste período.`}
                />
              )}

              {/* Celular: um bloco embaixo do outro, na ordem de interesse do cliente (gráfico,
                  criativos, público, o que fizemos). Computador: duas colunas — os wrappers viram
                  `contents` no celular pra ordem valer entre as colunas. */}
              <div className="flex flex-col gap-5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6">
                <div className="contents lg:col-span-3 lg:flex lg:flex-col lg:gap-6">
                  <motion.div variants={entrada} initial="oculto" animate="visivel" className="order-1 min-w-0">
                    <EvolucaoDiaria
                      dias={dias}
                      series={{
                        messages: chart?.series.messages ?? [],
                        clicks: chart?.series.clicks ?? [],
                        spend: chart?.series.spend ?? [],
                        reach: chart?.series.reach ?? [],
                      }}
                      anteriores={{
                        messages: chart?.previous_messages,
                        clicks: chart?.previous_series?.clicks,
                        spend: chart?.previous_series?.spend,
                        reach: chart?.previous_series?.reach,
                      }}
                      carregando={loading}
                      tipoResultado={tipoResultado}
                      vazio={!data || atualizando ? "Aguardando os números…" : "Sem dados para o período."}
                    />
                  </motion.div>

                  {mostraPublico && (
                    <motion.div variants={entrada} initial="oculto" animate="visivel" custom={2} className="order-3 min-w-0">
                      <PublicoCard
                        titulo="Quem está vendo seus anúncios"
                        descricao="Pessoas alcançadas no período, por gênero e idade"
                        carregando={loading}
                        genero={demo?.gender ? { mulheres: demo.gender.female_pct, homens: demo.gender.male_pct } : null}
                        idades={(demo?.age_ranges ?? []).map((r) => ({ faixa: r.label, pct: r.pct }))}
                      />
                    </motion.div>
                  )}
                </div>

                <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-6">
                  {mostraCriativos && (
                    <motion.section variants={entrada} initial="oculto" animate="visivel" custom={1} className="order-2 min-w-0 space-y-3">
                      <CabecalhoSecao icone={Trophy} titulo="Top criativos" descricao={`Os anúncios que mais trouxeram ${palavras.varios} no período`} />
                      <div className="space-y-2">
                        {loading
                          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)
                          : top.map((c, i) => <CardCriativo key={c.id} criativo={c} posicao={i + 1} palavras={palavras} />)}
                      </div>
                      {!loading && ativos && ativos.total > 0 && per && (
                        <AnunciosAtivos lista={ativos} periodo={per.kind} tipoResultado={tipoResultado} />
                      )}
                    </motion.section>
                  )}

                  {mostraTimeline && (
                    <motion.section variants={entrada} initial="oculto" animate="visivel" custom={3} className="order-4 min-w-0 space-y-3">
                      <CabecalhoSecao icone={ClipboardList} titulo="O que fizemos" descricao="Ações da equipe nas suas campanhas neste período" />
                      {loading ? (
                        <Skeleton className="h-28 rounded-xl" />
                      ) : (
                        <Cartao className="p-4">
                          <ol className="relative space-y-4 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-border">
                            {actions.map((a) => {
                              const Icone = ICON_MAP[a.icon ?? ""] ?? Pin;
                              return (
                                <li key={a.id} className="relative flex items-start gap-3">
                                  <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-primary">
                                    <Icone size={15} aria-hidden="true" />
                                  </span>
                                  <div className="min-w-0 pt-0.5">
                                    <p className="text-lone-caption text-muted-foreground">{rotuloDia(a.action_date)}</p>
                                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                                    {a.description && <p className="mt-0.5 text-lone-caption text-muted-foreground">{a.description}</p>}
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        </Cartao>
                      )}
                    </motion.section>
                  )}
                </div>
              </div>

              {/* Vendas × investimento (Leva 7A, N9): depois dos resultados dos anúncios, o que eles
                  viraram em venda. O cliente registra as vendas dele aqui; é o dinheiro dele — nada da
                  agência aparece. */}
              <motion.div variants={entrada} initial="oculto" animate="visivel" custom={4} className="min-w-0">
                <VendasDoCliente token={token} />
              </motion.div>
            </div>
          )}
          </motion.div>
        </AnimatePresence>

        {/* ── Rodapé ───────────────────────────────────────────────────── */}
        <footer className="mt-12 space-y-2 border-t border-border pb-20 pt-6 text-center lg:pb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Lone Mídia" className="mx-auto h-6 w-auto opacity-50" />
          <p className="text-lone-caption text-muted-foreground">
            Relatório exclusivo{mesRelatorio ? ` · ${mesRelatorio}` : ""}
          </p>
          <p className="mx-auto max-w-prose text-lone-caption text-muted-foreground">
            Atribuição: 7 dias de clique + 1 dia de visualização · Valores podem divergir em até 5% do Gerenciador por atribuição diferida
          </p>
        </footer>
      </div>
    </div>
    </MotionConfig>
  );
}

/** Criativo do topo: toca pra ver taxa de clique, frequência e custo por resultado. */
function CardCriativo({ criativo: c, posicao, palavras }: { criativo: CreativeItem; posicao: number; palavras: PalavrasResultado }) {
  const [aberto, setAberto] = useState(false);
  const idDetalhe = `criativo-${c.id}`;
  return (
    <Cartao className={cn("overflow-hidden transition-colors", aberto && "border-primary/40")}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-[72px] w-full items-center gap-3 p-3 text-left [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        <span className="w-4 shrink-0 text-center text-lone-caption font-medium tabular-nums text-muted-foreground" aria-hidden>{posicao}</span>
        <CriativoThumb url={c.thumbnail_url} path={c.thumbnail_path ?? null} name={c.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground">{c.name}</p>
            {c.is_winner && (
              <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-lone-brand-soft">
                <Star size={9} aria-hidden="true" /> Top
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lone-caption text-muted-foreground">
            <span><span className="font-medium tabular-nums text-foreground">{fmt(c.messages)}</span> {c.messages === 1 ? palavras.um : palavras.varios}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatarBRL(c.spend)}</span>
            {c.cpa != null && <><span aria-hidden>·</span><span><span className="tabular-nums">{formatarBRL(c.cpa)}</span> {palavras.porUm}</span></>}
          </p>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-muted-foreground transition-transform duration-200", aberto && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            id={idDetalhe}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <dl className="grid grid-cols-3 gap-2 border-t border-border bg-muted/50 px-3 py-2.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Taxa de clique</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-foreground">{c.ctr.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vezes que cada pessoa viu</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-foreground">{c.frequency.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{palavras.custo}</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-foreground">{c.cpa != null ? formatarBRL(c.cpa) : "—"}</dd>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </Cartao>
  );
}
