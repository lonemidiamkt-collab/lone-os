"use client";

// Aba "Google" do painel de resultados — reformulada em 18/11/2026 (pedido do Roberto):
//   · DUAS partes, com seletor no topo: Google Meu Negócio (Perfil da Empresa) PRIMEIRO, depois Google Anúncios.
//   · Meu Negócio: ligações, rotas pedidas, cliques no site e mensagens — o que o dono entende como "gente que me
//     procurou". Clicar num cartão troca o gráfico para aquela ação.
//   · Anúncios: CLIQUES, nunca "conversões" (o dono não tem como conferir conversão; clique e ligação ele confere).
//     Cartões: Cliques, Ligações pelo anúncio, Vezes que apareceu, Investido (com custo por clique).
//
// Os números vêm de /api/portal/[token]/google, que lê a MESMA conta do relatório semanal e mensal
// (lib/google/relatorio.ts). Bloco que não pôde ser lido mostra "atualizando" — nunca zero.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye, Globe, MapPin, Megaphone, MessageCircle, MousePointerClick, Navigation, Phone, RefreshCw, Search,
  Smartphone, UtensilsCrossed, CalendarCheck, Wallet, Monitor, Map as MapaIcone, type LucideIcon,
} from "lucide-react";
import { Aviso, Cartao, CabecalhoSecao, ListaBarras, Segmentado } from "./ui";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { rotuloDia } from "@/lib/portal/formatos";
import { PainelComparativo, type KpiComparativo } from "@/components/ui/painel-comparativo";
import { tomDaVariacao } from "@/components/ui/painel-comparativo-utils";
import { formatarValor, type KpiGoogle, type RelatorioGoogleAds, type RelatorioGooglePerfil, type PontoGoogle } from "@/lib/google/relatorio";
import type { PeriodKind } from "@/lib/portal/types";

const PERIODOS: { valor: PeriodKind; rotulo: string }[] = [
  { valor: "last_week", rotulo: "7 dias" },
  { valor: "last_2_weeks", rotulo: "14 dias" },
  { valor: "this_month", rotulo: "Este mês" },
  { valor: "last_month", rotulo: "Mês passado" },
];

interface Resposta {
  periodo?: { kind: PeriodKind; inicio: string; fim: string; anteriorInicio?: string; anteriorFim?: string };
  aviso?: string;
  ads?: RelatorioGoogleAds | null;
  perfil?: RelatorioGooglePerfil | null;
  adsIndisponivel?: boolean;
  perfilIndisponivel?: boolean;
}

type Parte = "negocio" | "anuncios";

const paraSerie = (s: PontoGoogle[] | undefined) => (s ?? []).map((p) => ({ rotulo: rotuloDia(p.dia), atual: p.atual, anterior: p.anterior }));
const tendencia = (s: PontoGoogle[] | undefined) => (s ?? []).map((p) => p.atual);
const intervalo = (a: string, b: string) => `${rotuloDia(a)} a ${rotuloDia(b)}`;
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");
const subtituloDe = (j: { inicio: string; fim: string }, ant: { inicio: string; fim: string } | null) =>
  ant ? `${intervalo(j.inicio, j.fim)}, comparado com ${intervalo(ant.inicio, ant.fim)}` : intervalo(j.inicio, j.fim);

// ── Google Meu Negócio ──────────────────────────────────────────────────────────────────────────────

const ICONE_ACAO: Record<string, LucideIcon> = {
  ligacoes: Phone, rotas: Navigation, cliques_site: Globe, conversas: MessageCircle, reservas: CalendarCheck, cardapio: UtensilsCrossed,
};
/** Título do gráfico quando a ação está escolhida. */
const GRAFICO_ACAO: Record<string, string> = {
  ligacoes: "Ligações por dia", rotas: "Rotas pedidas por dia", cliques_site: "Cliques no site por dia",
  conversas: "Mensagens por dia", reservas: "Reservas por dia", cardapio: "Cliques no cardápio por dia",
};

function BlocoNegocio({ r, carregando }: { r: RelatorioGooglePerfil; carregando: boolean }) {
  // null = todos os contatos somados; clicar num cartão mostra só aquela ação; clicar de novo volta ao total.
  const [escolha, setEscolha] = useState<string | null>(null);
  const total = r.kpis.find((k) => k.chave === "acoes");
  const v = r.visualizacoes;
  const acaoEscolhida = r.acoes.find((a) => a.chave === escolha);

  const kpis: KpiComparativo[] = r.acoes.map((a) => ({
    rotulo: a.rotulo === "Visitas ao site" ? "Cliques no site" : a.rotulo,
    valor: inteiro(a.valor),
    variacaoPct: a.variacaoPct,
    natureza: "direta",
    icone: ICONE_ACAO[a.chave],
    tendencia: tendencia(r.seriePorAcao?.[a.chave]),
    selecionado: escolha === a.chave,
    onSelecionar: r.seriePorAcao?.[a.chave]?.length ? () => setEscolha((e) => (e === a.chave ? null : a.chave)) : undefined,
  }));

  return (
    <div className="space-y-4">
      <CabecalhoSecao icone={MapPin} titulo="Seu perfil no Google"
        descricao="Quem achou a sua empresa na Busca e no Maps e entrou em contato" />
      {r.nota && <Aviso tom="neutro">{r.nota}</Aviso>}
      <PainelComparativo
        carregando={carregando}
        titulo={acaoEscolhida ? GRAFICO_ACAO[acaoEscolhida.chave] ?? acaoEscolhida.rotulo : "Contatos pelo perfil por dia"}
        subtitulo={subtituloDe(r.janela, r.anterior)}
        rotuloAtual="Este período"
        rotuloAnterior="Período anterior"
        serie={paraSerie(acaoEscolhida ? r.seriePorAcao?.[acaoEscolhida.chave] : r.serieAcoes)}
        formatarValor={(n) => n.toLocaleString("pt-BR")}
        destaque={{
          texto: r.frase,
          tom: tomDaVariacao(total?.variacaoPct, "direta", 5),
          detalhe: "Toque num número abaixo para ver só ele no gráfico.",
        }}
        kpis={kpis}
        limiarNeutroPct={5}
        tomRuim="atencao"
        vazio="Nenhum contato pelo perfil neste período."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao as="section" className="p-4 sm:p-5">
          <CabecalhoSecao nivel={3} icone={Eye} titulo="Onde o perfil apareceu"
            descricao={`${inteiro(v.total)} ${v.total === 1 ? "vez" : "vezes"} no período`} />
          <div className="mt-4 space-y-4">
            <ListaBarras rotulo="Busca ou Maps" itens={[
              { chave: "busca", rotulo: "Busca do Google", valor: v.busca, icone: Search, texto: pctDe(v.busca, v.total) },
              { chave: "mapas", rotulo: "Google Maps", valor: v.mapas, icone: MapaIcone, texto: pctDe(v.mapas, v.total) },
            ]} />
            <ListaBarras rotulo="Celular ou computador" itens={[
              { chave: "celular", rotulo: "Celular", valor: v.celular, icone: Smartphone, texto: pctDe(v.celular, v.total) },
              { chave: "computador", rotulo: "Computador", valor: v.computador, icone: Monitor, texto: pctDe(v.computador, v.total) },
            ]} />
          </div>
        </Cartao>
        <Cartao as="section" className="p-4 sm:p-5">
          <CabecalhoSecao nivel={3} icone={Search} titulo="O que pesquisaram"
            descricao={r.termosMes ? `Buscas que mostraram o seu perfil em ${r.termosMes}` : "O Google fecha os termos de busca por mês"} />
          <div className="mt-4">
            <ListaBarras rotulo="Buscas que mostraram o perfil"
              vazio="O Google ainda não liberou os termos de busca do mês."
              itens={r.termos.map((t) => ({
                chave: t.termo,
                rotulo: t.termo,
                valor: t.valor ?? t.limiar ?? 0,
                texto: t.valor != null ? inteiro(t.valor) : t.limiar != null ? `menos de ${inteiro(t.limiar)}` : "—",
              }))} />
          </div>
        </Cartao>
      </div>
    </div>
  );
}

const pctDe = (v: number, total: number) => `${total > 0 ? Math.round((v / total) * 100) : 0}%`;

// ── Google Anúncios ─────────────────────────────────────────────────────────────────────────────────

type MetricaAds = "cliques" | "ligacoes" | "impressoes" | "investimento";

const GRAFICO_ADS: Record<MetricaAds, string> = {
  cliques: "Cliques por dia", ligacoes: "Ligações pelo anúncio por dia", impressoes: "Vezes que os anúncios apareceram por dia", investimento: "Investimento por dia",
};

function BlocoAnuncios({ r, carregando }: { r: RelatorioGoogleAds; carregando: boolean }) {
  const [metrica, setMetrica] = useState<MetricaAds>("cliques");
  const k = (c: string) => r.kpis.find((x) => x.chave === c);
  const dinheiro = (n: number | null) => formatarValor(n, "dinheiro", r.moeda);
  const series: Record<MetricaAds, PontoGoogle[]> = {
    cliques: r.serieCliques, ligacoes: r.serieLigacoes ?? [], impressoes: r.serieImpressoes ?? [], investimento: r.serieInvestimento ?? [],
  };
  const cartao = (m: MetricaAds, x: KpiGoogle | undefined, rotulo: string, icone: LucideIcon, dica?: string): KpiComparativo | null =>
    x ? {
      rotulo, icone, dica,
      valor: formatarValor(x.valor, x.formato, r.moeda),
      variacaoPct: x.variacaoPct,
      natureza: x.natureza,
      tendencia: tendencia(series[m]),
      selecionado: metrica === m,
      // Sem a série (resposta de uma versão anterior do servidor), o cartão não troca o gráfico para o vazio.
      onSelecionar: series[m]?.length ? () => setMetrica(m) : undefined,
    } : null;

  const ctr = k("ctr")?.valor, cpc = k("cpc")?.valor;
  const kpis = [
    cartao("cliques", k("cliques"), "Cliques", MousePointerClick, "pessoas que tocaram no anúncio"),
    cartao("ligacoes", k("ligacoes"), "Ligações pelo anúncio", Phone, "toques no botão de ligar"),
    cartao("impressoes", k("impressoes"), "Vezes que apareceu", Eye, ctr != null ? `${formatarValor(ctr, "pct")} clicaram` : undefined),
    cartao("investimento", k("investimento"), "Investido", Wallet, cpc != null ? `${dinheiro(cpc)} por clique` : undefined),
  ].filter((x): x is KpiComparativo => !!x);
  const m = kpis.some((x) => x.selecionado) ? metrica : "cliques";

  return (
    <div className="space-y-4">
      <CabecalhoSecao icone={Megaphone} titulo="Seus anúncios no Google" descricao="Pesquisa, Maps, YouTube e Performance Max" />
      <PainelComparativo
        carregando={carregando}
        titulo={GRAFICO_ADS[m]}
        subtitulo={subtituloDe(r.janela, r.anterior)}
        rotuloAtual="Este período"
        rotuloAnterior="Período anterior"
        serie={paraSerie(series[m])}
        formatarValor={m === "investimento" ? (n) => dinheiro(n) : (n) => n.toLocaleString("pt-BR")}
        larguraEixo={m === "investimento" ? 56 : 44}
        destaque={{ texto: r.frase, tom: tomDaVariacao(k("cliques")?.variacaoPct, "direta", 5), detalhe: "Toque num número abaixo para ver ele no gráfico." }}
        kpis={kpis}
        limiarNeutroPct={5}
        tomRuim="atencao"
        vazio="Os anúncios no Google não rodaram neste período."
      />
      <Cartao as="section" className="p-4 sm:p-5">
        <CabecalhoSecao nivel={3} titulo="Campanhas" descricao="Onde o investimento foi e quantos cliques trouxe" />
        <div className="mt-4">
          <ListaBarras rotulo="Campanhas por investimento"
            vazio="Nenhuma campanha com veiculação no período."
            itens={r.campanhas.slice(0, 8).map((c) => ({
              chave: c.id,
              rotulo: <span className="font-medium">{c.nome}</span>,
              valor: c.custo,
              texto: dinheiro(c.custo),
              detalhe: [
                c.canal,
                c.cliques > 0 ? `${inteiro(c.cliques)} ${c.cliques === 1 ? "clique" : "cliques"}` : `${inteiro(c.impressoes)} vezes na tela`,
                c.cliques > 0 ? `${dinheiro(c.custo / c.cliques)} por clique` : null,
              ].filter(Boolean).join(" · "),
            }))} />
        </div>
      </Cartao>
    </div>
  );
}

// ── A aba ───────────────────────────────────────────────────────────────────────────────────────────

export default function PortalGoogle({ token }: { token: string }) {
  const [periodo, setPeriodo] = useState<PeriodKind>("last_week");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [parte, setParte] = useState<Parte | null>(null);

  const buscar = useCallback(async (p: PeriodKind) => {
    setCarregando(true);
    setErro(null);
    const r = await chamar<Resposta>(`/api/portal/${token}/google`, { period_kind: p });
    if (r.ok && r.data) setDados(r.data);
    else {
      // Sem dado novo, o período antigo NÃO fica na tela sob o rótulo novo.
      setDados(null);
      setErro(r.status === 0 ? "Não consegui buscar os números do Google agora. Verifique sua conexão." : r.erro || "Não consegui buscar os números do Google agora.");
    }
    setCarregando(false);
  }, [token]);

  useEffect(() => { buscar(periodo); }, [buscar, periodo]);

  const temNegocio = !!dados?.perfil || !!dados?.perfilIndisponivel;
  const temAnuncios = !!dados?.ads || !!dados?.adsIndisponivel;
  const partes = useMemo(() => [
    ...(temNegocio ? [{ valor: "negocio" as const, rotulo: "Google Meu Negócio", icone: MapPin }] : []),
    ...(temAnuncios ? [{ valor: "anuncios" as const, rotulo: "Google Anúncios", icone: Megaphone }] : []),
  ], [temNegocio, temAnuncios]);
  // Meu Negócio vem primeiro; se o cliente só tem uma das partes, é ela.
  const atual: Parte | null = parte && partes.some((p) => p.valor === parte) ? parte : partes[0]?.valor ?? null;

  const nada = !carregando && !erro && dados && !dados.aviso && !temNegocio && !temAnuncios;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {partes.length > 1 && atual && (
          <Segmentado rotulo="Parte do Google" opcoes={partes} valor={atual} onChange={setParte} destaque />
        )}
        <Segmentado rotulo="Período" opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} desabilitado={carregando} cheio className="sm:inline-flex sm:w-auto" />
      </div>

      {erro && !carregando && (
        <Aviso tom="atencao" role="alert" acao={
          <button onClick={() => buscar(periodo)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-accent">
            <RefreshCw size={13} aria-hidden /> Tentar de novo
          </button>
        }>{erro}</Aviso>
      )}
      {dados?.aviso && !carregando && <Aviso tom="info" role="status">{dados.aviso}</Aviso>}

      {carregando && !dados && (
        <div className="space-y-4" aria-busy="true"><Skeleton className="h-8 w-60" /><Skeleton className="h-72" /></div>
      )}

      {atual === "negocio" && dados?.perfil && <BlocoNegocio r={dados.perfil} carregando={carregando} />}
      {atual === "negocio" && !dados?.perfil && dados?.perfilIndisponivel && !carregando && (
        <Aviso tom="info" role="status">Os números do seu perfil no Google estão sendo atualizados — volte mais tarde.</Aviso>
      )}

      {atual === "anuncios" && dados?.ads && <BlocoAnuncios r={dados.ads} carregando={carregando} />}
      {atual === "anuncios" && !dados?.ads && dados?.adsIndisponivel && !carregando && (
        <Aviso tom="info" role="status">Os números dos anúncios no Google estão sendo atualizados — volte mais tarde.</Aviso>
      )}

      {nada && <Aviso tom="neutro">Ainda não há números do Google para este período.</Aviso>}
    </div>
  );
}
