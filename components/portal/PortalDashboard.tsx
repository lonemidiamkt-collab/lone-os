"use client";

// Painel de Resultados — a página que o CLIENTE abre pelo link com token (pública). Tudo o que
// aparece aqui vem do snapshot montado no servidor (lib/portal/buildSnapshot.ts) ou das rotas
// públicas do portal: nada interno (notas do time, outros clientes, saúde, alertas, financeiro da
// agência) e nenhuma chamada à Meta a partir do navegador.
//
// Modernização (24/09, pedido do CEO): uma família visual só nas duas abas, evolução diária no
// mesmo desenho do painel comparativo do topo, "Ver todos os anúncios ativos", público com
// percentuais, conteúdo que respeita o período e seletores sem o anel de foco "preso".

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  BarChart3, CalendarDays, Camera, ChevronDown, CircleHelp, LayoutDashboard, MapPin, Megaphone, ReceiptText, ClipboardList, MessageCircle, MousePointerClick, Pause, Pin, Palette, Receipt,
  RefreshCw, Star, Trophy, TrendingUp, Users, Wallet, Zap,
  type LucideIcon,
} from "lucide-react";
import type { SnapshotData, PeriodKind, CreativeItem } from "@/lib/portal/types";
import PortalContent from "./PortalContent";
import PortalInstagram, { type IgSnapPortal } from "./PortalInstagram";
import PortalCasco, { type ItemDoCasco } from "./PortalCasco";
import PortalResumo from "./PortalResumo";
import ComoContamos from "./ComoContamos";
import PortalInstalar from "./PortalInstalar";
import PortalUpload from "@/components/portal/PortalUpload";
import PortalAgenda from "./PortalAgenda";
import PortalMateriais from "./PortalMateriais";
import PortalGoogle from "./PortalGoogle";
import PortalCrm from "./PortalCrm";
import PublicoCard from "./PublicoCard";
import AnunciosAtivos from "./AnunciosAtivos";
import VendasDoCliente from "@/components/trafego/vendas/VendasDoCliente";
import CriativoThumb from "./CriativoThumb";
import { Aviso, Cartao, CabecalhoSecao, EstadoVazio, Segmentado, Selo, entrada } from "./ui";
import Skeleton from "@/components/ui/Skeleton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { chamar } from "@/lib/api/chamar";
import { cn } from "@/lib/utils";
import { WHATSAPP_EQUIPE, linkWhatsapp } from "@/lib/portal/contato";
import { fraseDelta, periodoAnterior, resumoConversas, type MetricType } from "@/lib/portal/formatDelta";
import { formatarBRL, formatarNumero, palavrasDoResultado, rotuloDia, type PalavrasResultado } from "@/lib/portal/formatos";
import { PainelComparativo, type KpiComparativo } from "@/components/ui/painel-comparativo";
import { tomDaVariacao } from "@/components/ui/painel-comparativo-utils";
import {
  ABAS_PORTAL, PERIODOS_DA_ABA, PERIODOS_PORTAL, abaValida, buscaDoPortal, diasDoPeriodo, paraPeriodKind, paraPeriodoIg,
  periodoValido, type AbaPortal, type PeriodoPortal,
} from "@/lib/portal/navegacao";

/** As sete áreas do protótipo Lone Results 3.0: nome no menu lateral, nome curto (barra do celular) e a linha de apoio do cabeçalho. */
const AREAS: Record<AbaPortal, Omit<ItemDoCasco<AbaPortal>, "valor"> & { apoio: string }> = {
  resumo:   { rotulo: "Visão geral",         curto: "Resumo",     icone: LayoutDashboard, apoio: "Seu marketing, seus resultados e as entregas da Lone em um só lugar." },
  ads:      { rotulo: "Meta Ads",            curto: "Meta Ads",   icone: BarChart3,       apoio: "Facebook e Instagram · anúncios pagos" },
  gads:     { rotulo: "Google Ads",          curto: "Google Ads", icone: Megaphone,       apoio: "Pesquisa, Maps, YouTube e Performance Max" },
  maps:     { rotulo: "Google Maps",         curto: "Maps",       icone: MapPin,          apoio: "Perfil da Empresa no Google · quem achou a sua loja" },
  social:   { rotulo: "Instagram",           curto: "Instagram",  icone: Camera,          apoio: "Evolução do perfil" },
  conteudo: { rotulo: "Conteúdo e entregas", curto: "Conteúdo",   icone: CalendarDays,    apoio: "Calendário, artes entregues e materiais enviados" },
  vendas:   { rotulo: "Vendas",              curto: "Vendas",     icone: ReceiptText,     apoio: "Acompanhamento comercial · registro das suas vendas", selo: "Registro" },
};

/** O que o gráfico do topo mostra — escolhido clicando no cartão do número. */
type MetricaGrafico = MetricType | "clicks";

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
  /** Instagram de 7 dias já lido do cache no servidor (null = sem cache; a aba busca). */
  initialIg?: IgSnapPortal | null;
  hasAds?: boolean;    // pacote inclui anúncios → mostra tráfego
  hasSocial?: boolean; // pacote inclui social/design → mostra artes entregues + Instagram orgânico
  hasIg?: boolean;     // Instagram vinculado de verdade (informativo; a seção continua avisando "não conectado" quando há anúncios)
  comecando?: boolean; // nada vinculado ainda (sem conta de anúncio e sem Instagram) → "estamos começando"
  hasGoogle?: boolean; // Perfil da Empresa vinculado ou Google Ads (com contrato de tráfego)
  /** Cada parte do Google separada (são duas áreas do menu). Ausentes = valem o `hasGoogle`. */
  hasGoogleAds?: boolean;
  hasGoogleMaps?: boolean;
  hasCrm?: boolean; // CRM conectado e ativo (Âncora, Kommo, API aberta) → aba "Atendimento e vendas"
  desde?: string | null;
  /** "MM/AAAA" do rodapé, calculado no servidor em SP (evita divergência de hidratação). */
  mesRelatorio?: string;
  /** Área e período pedidos no endereço (`?aba=…&p=…`), já validados no servidor. `initialData` é DESTE período. */
  abaInicial?: AbaPortal;
  periodoInicial?: PeriodoPortal;
}

export default function PortalDashboard({ token, clientId, clientName, whatsappPhone, welcomeMessage, initialData, initialIg = null, hasAds = true, hasSocial = false, hasGoogle = false, hasGoogleAds, hasGoogleMaps, hasCrm = false, comecando = false, desde = null, aprovacaoLigada = false, mesRelatorio = "", abaInicial, periodoInicial }: Props) {
  // As sete áreas do menu, sempre (canal que o cliente não tem mostra a página "ainda não ativo").
  const abas = ABAS_PORTAL;
  const temGads = hasGoogleAds ?? hasGoogle;
  const temMaps = hasGoogleMaps ?? hasGoogle;
  /** O canal da área está ligado para este cliente? (Visão geral, Conteúdo e Vendas existem sempre.) */
  const ligado: Record<AbaPortal, boolean> = {
    resumo: true, ads: hasAds, gads: temGads, maps: temMaps, social: hasSocial && !comecando, conteudo: true, vendas: true,
  };
  const abaPadrao = abaValida(null, abas);
  const [view, setView] = useState<AbaPortal>(() => abaValida(abaInicial, abas));
  // UM período para o painel todo (lib/portal/navegacao.ts): acompanha o cliente entre as áreas e vai na URL.
  const [periodo, setPeriodo] = useState<PeriodoPortal>(() => periodoValido(periodoInicial, abaValida(abaInicial, abas)));
  /** O período no formato das rotas de anúncios e do Google. */
  const period: PeriodKind = paraPeriodKind(periodo);
  const [data, setData]       = useState<SnapshotData | null>(initialData);
  const [loading, setLoading] = useState(false);
  // Sem dado no primeiro render = a busca do servidor não completou. Já abre avisando, em vez de
  // pintar a tela de zeros.
  const [erro, setErro]       = useState<string | null>(
    initialData ? null : "Não consegui carregar seus resultados agora.",
  );
  // Sobe depois de um envio de material: o histórico "Seus envios" (N37) recarrega.
  const [versaoEnvios, setVersaoEnvios] = useState(0);
  const [montado, setMontado]   = useState(false);
  useEffect(() => setMontado(true), []);

  // Cliente escolhe o que ver: Anúncios (tráfego) ou Crescimento nas redes (Instagram orgânico).
  // Só mostra o seletor quando o pacote tem os dois; senão abre direto no que existe.
  // 05/11/2026: "Conteúdo e envios" saiu de dentro de "Crescimento nas redes" — a aba misturava o
  // relatório do Instagram com agenda, artes entregues e envio de material.
  // 18/11/2026: aba "Google" (Perfil da Empresa e Google Ads) quando o cliente tem um dos dois vinculado.
  // 18/11/2026: aba "Atendimento e vendas" quando o CRM do cliente está conectado (lib/crm-externo).
  // Gráfico do topo (05/11/2026): um gráfico só, com a escolha da métrica — a "Evolução diária" de baixo
  // repetia o mesmo desenho.
  const [metricaGrafico, setMetricaGrafico] = useState<MetricaGrafico>("messages");

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

  // Os anúncios buscam quando a área está aberta e o período dela mudou — inclusive quando o cliente trocou
  // o período em outra área (Google, Instagram) e voltou: sem isto ficaria o número de 7 dias sob "14 dias".
  const kindPedido = useRef<PeriodKind>(period);
  useEffect(() => {
    // A Visão geral usa o mesmo snapshot dos anúncios.
    if ((view !== "ads" && view !== "resumo") || !hasAds || kindPedido.current === period) return;
    kindPedido.current = period;
    fetchPeriod(period);
  }, [view, hasAds, period, fetchPeriod]);

  // Trocar de área leva o período junto; se a fonte da área nova não responde por ele, volta para 7 dias.
  function mudarAba(a: AbaPortal) {
    setView(a);
    setPeriodo((p) => periodoValido(p, a));
    window.scrollTo({ top: 0 });
  }

  // Área e período no endereço, sem recarregar: o link copiado (ou mandado pelo time) abre no mesmo lugar.
  useEffect(() => {
    const busca = buscaDoPortal(window.location.search, view, periodo, abaPadrao);
    if (busca !== window.location.search) window.history.replaceState(window.history.state, "", `${window.location.pathname}${busca}${window.location.hash}`);
  }, [view, periodo, abaPadrao]);

  const periodosDaArea = PERIODOS_PORTAL.filter((p) => PERIODOS_DA_ABA[view].includes(p.valor));
  // Canal ainda não ligado não tem número para filtrar.
  const mostraPeriodo = periodosDaArea.length > 0 && ligado[view];

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

  // Painel pela metade: a Meta recusou os criativos ou a lista de anúncios (29/10/2026, 18 painéis
  // de manhã). Antes a seção sumia calada. Agora avisa e busca de novo sozinha, em silêncio, até 2
  // vezes — o servidor já está completando por trás (lib/portal/snapshotCache.ts).
  const incompleto = !!data && !atualizando && !loading && data.ads_status !== "sem_conta"
    && (data.ads_status === "parcial" || data.active_ads === null);
  const periodoRef = useRef(period);
  periodoRef.current = period;
  const tentativasCompletar = useRef(0);
  useEffect(() => { tentativasCompletar.current = 0; }, [periodoDado]);
  useEffect(() => {
    if (!incompleto || tentativasCompletar.current >= 2) return;
    const t = setTimeout(async () => {
      tentativasCompletar.current++;
      const r = await chamar<SnapshotData>(`/api/portal/${token}/snapshot`, { period_kind: periodoDado });
      if (r.ok && r.data && r.data.period?.kind === periodoRef.current) setData(r.data);
    }, 20_000);
    return () => clearTimeout(t);
  }, [incompleto, periodoDado, token, data]);
  // O resultado segue o objetivo da campanha (N4): conversas, leads ou compras. Snapshot antigo = conversas.
  const tipoResultado = data?.result_kind ?? null;
  const palavras = palavrasDoResultado(tipoResultado);
  const resumo = kpis ? resumoConversas(kpis.messages.value, kpis.messages.delta_pct, periodoDado, tipoResultado) : null;

  // Cliques (18/11/2026): estava escondido no seletor do gráfico; agora é cartão como os outros. O total e a
  // comparação saem da própria série por dia (o snapshot não traz KPI de cliques).
  const somaSerie = (s: readonly (number | null)[] | null | undefined) => (s ? s.reduce<number>((a, v) => a + (v ?? 0), 0) : null);
  const cliquesTotal = somaSerie(chart?.series.clicks);
  const cliquesAntes = chart?.previous_series ? somaSerie(chart.previous_series.clicks) : null;
  const cliquesKpi = cliquesTotal != null
    ? { value: cliquesTotal, delta_pct: cliquesAntes ? ((cliquesTotal - cliquesAntes) / cliquesAntes) * 100 : null, direction: "" }
    : undefined;

  const kpiItems: Array<{
    key: MetricaGrafico; label: string; icone: LucideIcon;
    val: { value: number | null; delta_pct: number | null; direction: string } | undefined;
    format: (v: number) => string;
  }> = [
    { key: "messages", label: palavras.Varios,      icone: MessageCircle,     val: kpis?.messages, format: (v) => fmt(v) },
    { key: "spend",    label: "Investido",          icone: Wallet,            val: kpis?.spend,    format: (v) => formatarBRL(v) },
    { key: "cpa",      label: palavras.custo,       icone: Receipt,           val: kpis?.cpa,      format: (v) => formatarBRL(v) },
    { key: "reach",    label: "Pessoas alcançadas", icone: Users,             val: kpis?.reach,    format: (v) => fmt(v) },
    { key: "clicks",   label: "Cliques",            icone: MousePointerClick, val: cliquesKpi,     format: (v) => fmt(v) },
  ];

  // Resumo do topo: a métrica escolhida por dia × mesmo dia do período anterior. Clicar num cartão troca o
  // gráfico (antes era um seletor separado em cima — 18/11/2026).
  const dias = chart?.days ?? [];
  const serieDe = (m: MetricaGrafico): { atual: (number | null)[]; anterior: (number | null)[] | null } => {
    if (!chart) return { atual: [], anterior: null };
    if (m === "cpa") {
      // Custo por resultado do dia = investido ÷ resultados; dia sem resultado não tem custo (fica vazio, não zero).
      const por = (g: readonly (number | null)[] | null | undefined, r: readonly (number | null)[] | null | undefined) =>
        g && r ? g.map((x, i) => ((r[i] ?? 0) > 0 && x != null ? Math.round((x / (r[i] as number)) * 100) / 100 : null)) : null;
      return { atual: por(chart.series.spend, chart.series.messages) ?? [], anterior: por(chart.previous_series?.spend, chart.previous_messages) };
    }
    if (m === "messages") return { atual: chart.series.messages, anterior: chart.previous_messages ?? null };
    return { atual: chart.series[m], anterior: chart.previous_series?.[m] ?? null };
  };
  const escolhida = serieDe(metricaGrafico);
  const serieConversas = dias.map((d, i) => ({ rotulo: rotuloDia(d), atual: escolhida.atual[i] ?? (metricaGrafico === "cpa" ? null : 0), anterior: escolhida.anterior?.[i] ?? null }));
  const nomeMetrica = kpiItems.find((k) => k.key === metricaGrafico)?.label ?? palavras.Varios;
  const kpisResumo: KpiComparativo[] = kpiItems.filter((k) => k.val).map(({ key, label, icone, val, format }) => ({
    rotulo: label,
    icone,
    valor: val?.value != null ? format(val.value) : "—",
    variacaoPct: val?.delta_pct ?? null,
    // Custo por resultado: cair é bom. Investimento: nem bom nem ruim.
    natureza: key === "cpa" ? "inversa" : key === "spend" ? "neutra" : "direta",
    dica: key === "clicks" ? "toques no anúncio" : fraseDelta(key, val?.delta_pct ?? null, periodoDado) ?? undefined,
    tendencia: serieDe(key).atual.filter((x): x is number => x != null),
    selecionado: metricaGrafico === key,
    onSelecionar: chart ? () => setMetricaGrafico(key) : undefined,
  }));
  const per = data?.period;
  // Hoje (05/11/2026): gráfico por hora e comparação com ontem ATÉ A MESMA HORA.
  const porHora = chart?.granularidade === "hora";
  const ultimaHora = porHora && dias.length ? rotuloDia(dias[dias.length - 1]) : null;
  const datasPeriodo = !per ? undefined
    : porHora ? `Hoje até as ${ultimaHora ?? "0h"}, comparado com ontem até a mesma hora.`
    : `${rotuloDia(per.start)} a ${rotuloDia(per.end)}, comparado com ${rotuloDia(per.previous_start)} a ${rotuloDia(per.previous_end)}.`;

  const comoContamos = {
    temResumo: true, temAnuncios: hasAds, temGoogle: temGads || temMaps, temInstagram: hasSocial && !comecando, palavras,
  };

  const datasCurta = !per ? "" : porHora ? "Hoje, comparado com ontem até a mesma hora"
    : `${rotuloDia(per.start)} a ${rotuloDia(per.end)} · comparação ${rotuloDia(per.previous_start)} a ${rotuloDia(per.previous_end)}`;

  const mostraPublico = loading || !!demo?.gender || (demo?.age_ranges?.length ?? 0) > 0;
  const mostraCriativos = loading || top.length > 0 || (ativos?.total ?? 0) > 0 || incompleto;
  const mostraTimeline = loading || actions.length > 0;

  return (
    <MotionConfig reducedMotion="user">
    <PortalCasco
      itens={abas.map((a) => ({ valor: a, ...AREAS[a] }))}
      valor={view}
      onChange={mudarAba}
      clientName={clientName}
    >
      {/* Coluna da altura da tela: página curta termina no rodapé, sem faixa vazia depois dele. */}
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:min-h-screen lg:px-10 lg:py-10">

        {/* ── Cabeçalho (como no protótipo): área, título, linha de apoio e as três ações ── */}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 lg:mb-6">
          <div className="min-w-0">
            <p className="text-lone-eyebrow font-semibold uppercase text-lone-brand-soft">Painel de resultados · {AREAS[view].rotulo}</p>
            <h1 className="mt-1.5 break-words text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              {view === "resumo" ? clientName : AREAS[view].rotulo}
            </h1>
            <p className="mt-1 text-lone-body text-muted-foreground">{view === "resumo" ? AREAS.resumo.apoio : `${clientName} · ${AREAS[view].apoio}`}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Só depois de montar: o tema do cliente só é conhecido no navegador (evita ícone trocado). */}
            {montado ? <ThemeToggle /> : <span className="h-9 w-9" aria-hidden />}
            <ComoContamos {...comoContamos}>
              <button type="button" aria-label="Como contamos os números"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <CircleHelp size={15} aria-hidden />
                <span className="hidden min-[441px]:inline">Como contamos</span>
              </button>
            </ComoContamos>
            <FalarComALone phone={phone} clientName={clientName} curto />
          </div>
        </header>

        {welcomeMessage && (
          <Cartao className="mb-5 px-4 py-3 text-sm text-muted-foreground lg:mb-7">{welcomeMessage}</Cartao>
        )}

        {/* Período: um só, no mesmo lugar em todas as áreas. Cada área mostra o que a fonte dela responde. */}
        {mostraPeriodo && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:mb-6">
            <Segmentado
              className="sm:inline-flex sm:w-auto"
              rotulo="Período"
              opcoes={periodosDaArea}
              valor={periodo}
              onChange={setPeriodo}
              desabilitado={view === "ads" && loading}
              cheio
            />
            {/* Do que são os números: datas, com o que comparamos e quando buscamos (áreas dos anúncios). */}
            {(view === "ads" || view === "resumo") && hasAds && per && genAt && !loading && (
              <p className="inline-flex items-center gap-2 text-lone-caption text-muted-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lone-success" aria-hidden />
                {datasCurta} · atualizado em {genAt}
              </p>
            )}
          </div>
        )}

        {/* Troca de aba SEM esperar a anterior sair (05/11/2026): com AnimatePresence mode="wait" a saída
            da aba "Anúncios" travava em opacidade 0 e a aba nova nunca entrava — tela vazia em produção.
            Agora a aba nova só aparece com um fade curto; não existe saída para travar. */}
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
          {/* ── Crescimento nas redes (Instagram orgânico + Conteúdo entregue + Enviar material) ── */}
          {view === "social" && !hasSocial && (
            <EstadoVazio icone={Camera} selo={<Selo tom="atencao">A ativar</Selo>} titulo="Seu Instagram ainda não está conectado ao painel"
              acao={<FalarComALone phone={phone} clientName={clientName} />}>
              Com o perfil conectado, esta área mostra seguidores, pessoas alcançadas, visualizações e os posts que mais renderam.
            </EstadoVazio>
          )}
          {hasSocial && view === "social" && (
            <div className="space-y-6">
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
                  <p className="mt-3 text-sm text-muted-foreground">Enquanto isso, o que mais ajuda é mandar o material da loja na aba <button type="button" onClick={() => mudarAba("conteudo")} className="font-medium text-foreground underline underline-offset-2">Conteúdo e entregas</button> — logo, fotos, tabela de preço, vídeo.</p>
                </Cartao>
              ) : (
                <PortalInstagram token={token} clientId={clientId} period={paraPeriodoIg(periodo)} inicial={initialIg} />
              )}
            </div>
          )}

          {/* ── Visão geral: todas as seções do protótipo (resumo, números, evolução, canais, execução) ── */}
          {view === "resumo" && (periodo === "7d" || periodo === "14d") && (
            <PortalResumo
              token={token} clientId={clientId} periodo={periodo}
              anuncios={{ dados: data, carregando: loading, falhou: !!erro }}
              igInicial={initialIg}
              temAnuncios={hasAds} temGoogleAds={temGads} temGoogleMaps={temMaps} temInstagram={hasSocial && !comecando}
              onAbrir={mudarAba}
            />
          )}

          {/* ── Google Ads ── */}
          {view === "gads" && (temGads
            ? <PortalGoogle token={token} periodo={period} parte="anuncios" />
            : (
              <EstadoVazio icone={Megaphone} selo={<Selo>Ainda não ativo</Selo>} titulo="Você ainda não anuncia no Google com a Lone"
                acao={<FalarComALone phone={phone} clientName={clientName} />}>
                Quando houver campanhas no Google (Pesquisa, Maps, YouTube), esta área mostra cliques, vezes que o anúncio apareceu, ligações pelo anúncio e investimento.
              </EstadoVazio>
            ))}

          {/* ── Google Maps (Perfil da Empresa) ── */}
          {view === "maps" && (temMaps
            ? <PortalGoogle token={token} periodo={period} parte="negocio" />
            : (
              <div className="space-y-6">
                <EstadoVazio icone={MapPin} selo={<Selo tom="atencao">A ativar</Selo>} titulo="Seu perfil no Google ainda não está ligado ao painel"
                  acao={<FalarComALone phone={phone} clientName={clientName} />}>
                  Com o Perfil da Empresa conectado, você vê aqui quem achou a sua loja na Busca e no Maps e entrou em contato.
                </EstadoVazio>
                <section className="space-y-3">
                  <CabecalhoSecao titulo="O que esta área vai mostrar" descricao="Os números aparecem assim que o perfil for conectado" />
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {["Cliques para ligar", "Pedidos de rota", "Cliques no site", "Vezes que o perfil apareceu"].map((r) => (
                      <Cartao key={r} interativo={false} className="p-4">
                        <p className="text-lone-caption text-muted-foreground">{r}</p>
                        <p className="mt-2 text-lone-h1 font-semibold text-muted-foreground" aria-label="sem número ainda">—</p>
                        <p className="mt-1 text-lone-caption text-muted-foreground">Aguardando ativação</p>
                      </Cartao>
                    ))}
                  </div>
                </section>
              </div>
            ))}

          {/* ── Vendas: o registro das vendas do cliente e, com CRM ligado, o atendimento ── */}
          {view === "vendas" && (
            <div className="space-y-6">
              {hasCrm && <PortalCrm token={token} />}
              <VendasDoCliente token={token} />
              <Cartao as="section" interativo={false} className="p-5">
                <CabecalhoSecao nivel={3} titulo="Como chegar ao retorno real" descricao="O caminho do contato até a venda" />
                <ol className="mt-4 space-y-3 text-sm">
                  {[
                    ["Anote de onde veio o contato", "Quando alguém chamar, pergunte como achou a loja: anúncio, Google ou Instagram."],
                    ["Registre a venda aqui", "Valor e data de cada venda que veio do marketing."],
                    ["Compare com o investimento", "Com as vendas registradas, o painel mostra quanto cada real investido trouxe de volta."],
                  ].map(([t, d], i) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-lone-caption font-medium text-lone-brand-soft" aria-hidden>{i + 1}</span>
                      <span><span className="block font-medium text-foreground">{t}</span><span className="block text-muted-foreground">{d}</span></span>
                    </li>
                  ))}
                </ol>
              </Cartao>
            </div>
          )}

          {/* ── Conteúdo e envios: agenda, artes entregues, enviar material e o histórico de envios ── */}
          {view === "conteudo" && (
            <div className="space-y-6">
              {/* Próximos posts e calendário do mês (N36): só Agendado, No ar e aprovado pelo cliente. */}
              <PortalAgenda token={token} />
              <PortalContent token={token} aprovacaoLigada={aprovacaoLigada}
                dias={diasDoPeriodo(periodo)} />
              <PortalUpload token={token} clientName={clientName} onEnviado={() => setVersaoEnvios((v) => v + 1)} />
              {/* O que o cliente já mandou, se o time recebeu e onde foi usado (N37). */}
              <PortalMateriais token={token} versao={versaoEnvios} />
            </div>
          )}

          {view === "ads" && !hasAds && (
            <EstadoVazio icone={BarChart3} selo={<Selo>Ainda não ativo</Selo>} titulo="Seus anúncios ainda não estão no ar"
              acao={<FalarComALone phone={phone} clientName={clientName} />}>
              Quando as campanhas no Facebook e no Instagram começarem a rodar, esta área mostra conversas, investimento, custo por conversa e os anúncios que mais trouxeram resultado.
            </EstadoVazio>
          )}
          {/* ── Meta Ads (tráfego) — só pra pacote que tem anúncios ── */}
          {hasAds && view === "ads" && (
            <div className="space-y-5 lg:space-y-6">
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

              {/* Hoje: o número ainda está entrando — dito uma vez, sem esconder nada. */}
              {!erro && !loading && period === "today" && kpis && (
                <Aviso tom="neutro" role="status">
                  Números de hoje até agora. A Meta ainda consolida o dia — eles podem mudar um pouco até a meia-noite.
                </Aviso>
              )}

              {/* Resumo: conversas × período anterior, frase do período (N34) e os 4 números.
                  Some com erro ou "números sendo atualizados" — nunca pinta zero no lugar. */}
              {(loading || (!erro && !atualizando && kpis)) && (
                <div className="space-y-3">
                <CabecalhoSecao titulo="Performance de anúncios" descricao={datasPeriodo ? `Meta Ads · ${datasPeriodo}` : "Meta Ads"} />
                <PainelComparativo
                  carregando={loading}
                  titulo={`${nomeMetrica} por ${porHora ? "hora" : "dia"}`}
                  subtitulo={per ? `${per.label}, comparado com ${periodoAnterior(periodoDado)}` : undefined}
                  rotuloAtual={porHora ? "Hoje" : "Este período"}
                  rotuloAnterior={porHora ? "Ontem" : "Período anterior"}
                  serie={serieConversas}
                  formatarValor={(v) => metricaGrafico === "spend" || metricaGrafico === "cpa" ? formatarBRL(v) : v.toLocaleString("pt-BR")}
                  larguraEixo={metricaGrafico === "spend" || metricaGrafico === "cpa" ? 56 : 44}
                  destaque={resumo ? { texto: resumo, tom: tomDaVariacao(kpis?.messages.delta_pct, "direta", 5), detalhe: [datasPeriodo, "Toque num número abaixo para ver ele no gráfico."].filter(Boolean).join(" ") } : null}
                  kpis={kpisResumo}
                  limiarNeutroPct={5}
                  tomRuim="atencao"
                  vazio={`Ainda não houve ${palavras.varios} neste período.`}
                />
                {!loading && (
                  <Cartao interativo={false} className="px-4 py-3.5">
                    <h3 className="text-lone-h2 font-medium text-foreground">Entendendo os volumes</h3>
                    <p className="mt-1 text-lone-caption text-muted-foreground">
                      Pessoas alcançadas, cliques e {palavras.varios} são contagens diferentes: não formam um funil pessoa a pessoa. Por isso o painel não mostra taxa de conversão entre elas.
                    </p>
                  </Cartao>
                )}
                </div>
              )}

              {/* Celular: um bloco embaixo do outro, na ordem de interesse do cliente (gráfico,
                  criativos, público, o que fizemos). Computador: duas colunas — os wrappers viram
                  `contents` no celular pra ordem valer entre as colunas. */}
              <div className="flex flex-col gap-5 lg:grid lg:grid-cols-5 lg:gap-6">
                {/* Computador (como no protótipo): criativos na coluna larga, à esquerda; público e "o que fizemos"
                    na estreita, à direita — as duas colunas ficam com altura parecida, sem buraco. */}
                {/* As duas colunas terminam juntas: o último cartão da coluna estreita cresce até o fim da larga. */}
                <div className="contents lg:order-2 lg:col-span-2 lg:flex lg:flex-col lg:gap-6 lg:[&>*:last-child]:flex-1">
                  {mostraPublico && (
                    <motion.div variants={entrada} initial="oculto" animate="visivel" custom={2} className="order-3 min-w-0 lg:flex lg:flex-col">
                      <PublicoCard
                        titulo="Quem está vendo seus anúncios"
                        descricao="Pessoas alcançadas no período, por gênero e idade"
                        carregando={loading}
                        className="lg:flex-1"
                        estreito
                        genero={demo?.gender ? { mulheres: demo.gender.female_pct, homens: demo.gender.male_pct } : null}
                        idades={(demo?.age_ranges ?? []).map((r) => ({ faixa: r.label, pct: r.pct }))}
                      />
                    </motion.div>
                  )}
                  {mostraTimeline && (
                    <motion.section variants={entrada} initial="oculto" animate="visivel" custom={3} className="order-4 min-w-0 space-y-3 lg:flex lg:flex-col">
                      <CabecalhoSecao icone={ClipboardList} titulo="O que fizemos" descricao="Ações da equipe nas suas campanhas neste período" />
                      {loading ? (
                        <Skeleton className="h-28 rounded-xl" />
                      ) : (
                        <Cartao className="p-4 lg:flex-1">
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

                <div className="contents lg:order-1 lg:col-span-3 lg:flex lg:flex-col lg:gap-6">
                  {mostraCriativos && (
                    <motion.section variants={entrada} initial="oculto" animate="visivel" custom={1} className="order-2 min-w-0 space-y-3">
                      <CabecalhoSecao icone={Trophy} titulo={`Criativos com mais ${palavras.varios}`} descricao="Toque num anúncio para ver os detalhes" />
                      <div className="space-y-2">
                        {loading
                          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)
                          : top.map((c, i) => <CardCriativo key={c.id} criativo={c} posicao={i + 1} palavras={palavras} maximo={Math.max(...top.map((t) => t.messages))} />)}
                      </div>
                      {!loading && ativos && ativos.total > 0 && per && (
                        <AnunciosAtivos lista={ativos} periodo={per.kind} tipoResultado={tipoResultado} />
                      )}
                      {incompleto && (
                        <Aviso tom="neutro" role="status" acao={
                          <button onClick={() => fetchPeriod(period)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-accent">
                            <RefreshCw size={13} aria-hidden /> Tentar de novo
                          </button>
                        }>
                          Alguns anúncios não carregaram agora. Já estamos buscando de novo — os números acima estão certos.
                        </Aviso>
                      )}
                    </motion.section>
                  )}

                </div>
              </div>

            </div>
          )}
          </motion.div>

        {/* Convite para ter o painel na tela do celular — no fim da página, nunca na frente dos números. */}
        <div className="mt-auto pt-10"><PortalInstalar /></div>

        {/* ── Rodapé ───────────────────────────────────────────────────── */}
        <footer className="mt-8 space-y-2 border-t border-border pb-2 pt-6 text-center lg:pb-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Lone Mídia" className="mx-auto h-6 w-auto opacity-50" />
          <p className="text-lone-caption text-muted-foreground">
            Relatório exclusivo{mesRelatorio ? ` · ${mesRelatorio}` : ""}
          </p>
          <ComoContamos {...comoContamos}>
            <button type="button" className="text-lone-caption text-muted-foreground underline-offset-2 hover:underline">
              Como contamos os números
            </button>
          </ComoContamos>
        </footer>
      </div>
    </PortalCasco>
    </MotionConfig>
  );
}

/** "Falar com a Lone": WhatsApp da equipe. `curto` = no cabeçalho (só o ícone em tela muito estreita). */
function FalarComALone({ phone, clientName, curto = false }: { phone: string; clientName: string; curto?: boolean }) {
  const texto = `Olá! Tenho uma dúvida sobre os resultados da ${clientName}.`;
  return (
    <a href={`${linkWhatsapp(phone)}?text=${encodeURIComponent(texto)}`}
      target="_blank" rel="noopener noreferrer" aria-label="Falar com a Lone pelo WhatsApp"
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-whatsapp px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
      </svg>
      <span className={curto ? "hidden min-[441px]:inline" : undefined}>Falar com a Lone</span>
    </a>
  );
}

/** Criativo do topo: toca pra ver taxa de clique, frequência e custo por resultado. */
function CardCriativo({ criativo: c, posicao, palavras, maximo }: { criativo: CreativeItem; posicao: number; palavras: PalavrasResultado; maximo: number }) {
  const [aberto, setAberto] = useState(false);
  const idDetalhe = `criativo-${c.id}`;
  // Fatia do melhor anúncio (o 1º enche a barra; os outros se medem contra ele).
  const fatia = maximo > 0 ? Math.max(c.messages > 0 ? 4 : 0, (c.messages / maximo) * 100) : 0;
  return (
    <Cartao className={cn("group overflow-hidden transition-[border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:shadow-sm", aberto && "border-primary/40")}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-[72px] w-full items-center gap-3 p-3 text-left transition-colors duration-150 [-webkit-tap-highlight-color:transparent] [@media(hover:hover)]:hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md text-lone-caption font-medium tabular-nums",
          posicao === 1 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")} aria-hidden>{posicao}</span>
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
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <motion.span className="block h-full rounded-full bg-primary/60 transition-colors group-hover:bg-primary"
              initial={{ width: 0 }} animate={{ width: `${fatia}%` }} transition={{ duration: 0.7, delay: posicao * 0.05, ease: [0.16, 1, 0.3, 1] }} />
          </span>
        </div>
        <ChevronDown size={16} className={cn("shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:text-foreground", aberto && "rotate-180")} aria-hidden />
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
