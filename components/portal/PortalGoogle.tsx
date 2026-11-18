"use client";

// Aba "Google" do painel de resultados: Perfil da Empresa (Google Meu Negócio — ligações, rotas pedidas, visitas ao
// site, conversas, onde o perfil apareceu e as buscas que o mostraram) e Google Ads (investimento, cliques,
// conversões, o que os anúncios geraram e as campanhas).
//
// Os números vêm de /api/portal/[token]/google, que lê a MESMA conta do relatório semanal e mensal
// (lib/google/relatorio.ts): o cliente vê aqui o que recebeu no PDF. Bloco que não pôde ser lido mostra
// "atualizando" — nunca zero.

import { useCallback, useEffect, useState } from "react";
import { MapPin, Megaphone, RefreshCw, Search } from "lucide-react";
import { Aviso, Cartao, CabecalhoSecao, Segmentado } from "./ui";
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

const paraKpi = (k: KpiGoogle, moeda?: string): KpiComparativo => ({
  rotulo: k.rotulo,
  valor: formatarValor(k.valor, k.formato, moeda),
  variacaoPct: k.variacaoPct,
  natureza: k.natureza,
  dica: k.nota ?? undefined,
});

const paraSerie = (s: PontoGoogle[]) => s.map((p) => ({ rotulo: rotuloDia(p.dia), atual: p.atual, anterior: p.anterior }));
const intervalo = (a: string, b: string) => `${rotuloDia(a)} a ${rotuloDia(b)}`;
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");

function Linha({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 first:border-t-0">
      <span className="min-w-0 text-sm text-secondary-foreground">{rotulo}{sub && <span className="ml-1.5 text-lone-caption text-muted-foreground">{sub}</span>}</span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{valor}</span>
    </div>
  );
}

function Barra({ rotulo, valor, total }: { rotulo: string; valor: number; total: number }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${rotulo}: ${pct}%`}>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right tabular-nums text-foreground">{inteiro(valor)} <span className="text-muted-foreground">({pct}%)</span></span>
    </div>
  );
}

function BlocoPerfil({ r, carregando }: { r: RelatorioGooglePerfil; carregando: boolean }) {
  const v = r.visualizacoes;
  const total = r.kpis.find((k) => k.chave === "acoes");
  return (
    <div className="space-y-4">
      <CabecalhoSecao icone={MapPin} titulo="Seu perfil no Google" descricao="Busca e Maps: quem achou a sua empresa e entrou em contato" />
      {r.nota && <Aviso tom="neutro">{r.nota}</Aviso>}
      <PainelComparativo
        carregando={carregando}
        titulo="Contatos pelo perfil por dia"
        subtitulo={r.anterior ? `${intervalo(r.janela.inicio, r.janela.fim)}, comparado com ${intervalo(r.anterior.inicio, r.anterior.fim)}` : intervalo(r.janela.inicio, r.janela.fim)}
        rotuloAtual="Este período"
        rotuloAnterior="Período anterior"
        serie={paraSerie(r.serieAcoes)}
        formatarValor={(n) => n.toLocaleString("pt-BR")}
        destaque={{ texto: r.frase, tom: tomDaVariacao(total?.variacaoPct, "direta", 5) }}
        kpis={r.kpis.slice(0, 4).map((k) => paraKpi(k))}
        limiarNeutroPct={5}
        tomRuim="atencao"
        vazio="Nenhum contato pelo perfil neste período."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao as="section" className="p-4 sm:p-5">
          <CabecalhoSecao nivel={3} titulo="Onde o perfil apareceu" descricao={`${inteiro(v.total)} visualizações no período`} />
          <div className="mt-4 space-y-2.5">
            <Barra rotulo="Busca do Google" valor={v.busca} total={v.total} />
            <Barra rotulo="Google Maps" valor={v.mapas} total={v.total} />
            <div className="h-1" />
            <Barra rotulo="Celular" valor={v.celular} total={v.total} />
            <Barra rotulo="Computador" valor={v.computador} total={v.total} />
          </div>
          <div className="mt-4">
            {r.acoes.map((a) => (
              <Linha key={a.chave} rotulo={a.rotulo} sub={a.nota} valor={inteiro(a.valor)} />
            ))}
          </div>
        </Cartao>
        <Cartao as="section" className="p-4 sm:p-5">
          <CabecalhoSecao nivel={3} icone={Search} titulo="Buscas que mostraram o perfil"
            descricao={r.termosMes ? `Em ${r.termosMes} — o Google fecha os termos por mês` : "O Google fecha os termos por mês"} />
          <div className="mt-3">
            {r.termos.length ? r.termos.map((t, i) => (
              <Linha key={t.termo} rotulo={`${i + 1}. ${t.termo}`} valor={t.valor != null ? inteiro(t.valor) : t.limiar != null ? `menos de ${inteiro(t.limiar)}` : "—"} />
            )) : <p className="py-2 text-sm text-muted-foreground">O Google ainda não liberou os termos de busca do mês.</p>}
          </div>
        </Cartao>
      </div>
    </div>
  );
}

function BlocoAds({ r, carregando }: { r: RelatorioGoogleAds; carregando: boolean }) {
  const [metrica, setMetrica] = useState<"conversoes" | "cliques">("conversoes");
  const k = (c: string) => r.kpis.find((x) => x.chave === c);
  const temConv = (k("conversoes")?.valor ?? 0) > 0 || (k("conversoes")?.anterior ?? 0) > 0;
  const m = temConv ? metrica : "cliques";
  const ordem = temConv ? ["conversoes", "investimento", "custo_conversao", "cliques"] : ["cliques", "investimento", "cpc", "impressoes"];
  const kpis = ordem.map(k).filter((x): x is KpiGoogle => !!x).map((x) => paraKpi(x, r.moeda));
  const principal = k(m);
  return (
    <div className="space-y-4">
      <CabecalhoSecao icone={Megaphone} titulo="Anúncios no Google" descricao="Google Ads: Pesquisa, Maps, YouTube e Performance Max" />
      {temConv && (
        <Segmentado rotulo="Ver no gráfico" tamanho="sm" valor={metrica} onChange={setMetrica}
          opcoes={[{ valor: "conversoes", rotulo: "Conversões" }, { valor: "cliques", rotulo: "Cliques" }]} />
      )}
      <PainelComparativo
        carregando={carregando}
        titulo={m === "conversoes" ? "Conversões por dia" : "Cliques por dia"}
        subtitulo={r.anterior ? `${intervalo(r.janela.inicio, r.janela.fim)}, comparado com ${intervalo(r.anterior.inicio, r.anterior.fim)}` : intervalo(r.janela.inicio, r.janela.fim)}
        rotuloAtual="Este período"
        rotuloAnterior="Período anterior"
        serie={paraSerie(m === "conversoes" ? r.serieConversoes : r.serieCliques)}
        formatarValor={(n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        destaque={{ texto: r.frase, tom: tomDaVariacao(principal?.variacaoPct, "direta", 5) }}
        kpis={kpis}
        limiarNeutroPct={5}
        tomRuim="atencao"
        vazio="Os anúncios no Google não rodaram neste período."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Cartao as="section" className="p-4 sm:p-5 lg:col-span-2">
          <CabecalhoSecao nivel={3} titulo="O que os anúncios geraram" descricao="Ações registradas pelo Google Ads" />
          <div className="mt-3">
            {r.acoes.length ? r.acoes.map((a) => (
              <Linha key={a.categoria} rotulo={a.rotulo} valor={formatarValor(a.todas, "decimal")} />
            )) : <p className="py-2 text-sm text-muted-foreground">Nenhuma ação de conversão registrada no período.</p>}
            {k("ligacoes") && <Linha rotulo="Ligações pelo anúncio" sub="botão de ligar" valor={formatarValor(k("ligacoes")!.valor, "inteiro")} />}
            <Linha rotulo="Impressões" valor={formatarValor(k("impressoes")?.valor ?? null, "inteiro")} />
            <Linha rotulo="Taxa de cliques" valor={formatarValor(k("ctr")?.valor ?? null, "pct")} />
            <Linha rotulo="Custo por clique" valor={formatarValor(k("cpc")?.valor ?? null, "dinheiro", r.moeda)} />
          </div>
        </Cartao>
        <Cartao as="section" className="p-4 sm:p-5 lg:col-span-3">
          <CabecalhoSecao nivel={3} titulo="Campanhas" descricao="Por investimento no período" />
          <div className="mt-3">
            {r.campanhas.length ? r.campanhas.slice(0, 8).map((c) => (
              <div key={c.id} className="border-t border-border py-2.5 first:border-t-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-medium text-foreground">{c.nome}</span>
                  <span className="shrink-0 text-sm tabular-nums text-foreground">{formatarValor(c.custo, "dinheiro", r.moeda)}</span>
                </div>
                <p className="mt-0.5 text-lone-caption text-muted-foreground">
                  {c.canal} · {inteiro(c.cliques)} cliques · {formatarValor(c.conversoes, "decimal")} conversões
                  {c.custoPorConversao != null ? ` · ${formatarValor(c.custoPorConversao, "dinheiro", r.moeda)} por conversão` : ""}
                </p>
              </div>
            )) : <p className="py-2 text-sm text-muted-foreground">Nenhuma campanha com veiculação no período.</p>}
          </div>
        </Cartao>
      </div>
    </div>
  );
}

export default function PortalGoogle({ token }: { token: string }) {
  const [periodo, setPeriodo] = useState<PeriodKind>("last_week");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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

  const nada = !carregando && !erro && dados && !dados.aviso && !dados.ads && !dados.perfil && !dados.adsIndisponivel && !dados.perfilIndisponivel;

  return (
    <div className="space-y-6">
      <Segmentado rotulo="Período" opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} desabilitado={carregando} cheio className="sm:inline-flex sm:w-auto" />

      {erro && !carregando && (
        <Aviso tom="atencao" role="alert" acao={
          <button onClick={() => buscar(periodo)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-accent">
            <RefreshCw size={13} aria-hidden /> Tentar de novo
          </button>
        }>{erro}</Aviso>
      )}
      {dados?.aviso && !carregando && <Aviso tom="info" role="status">{dados.aviso}</Aviso>}

      {carregando && !dados && (
        <div className="space-y-4" aria-busy="true"><Skeleton className="h-8 w-60" /><Skeleton className="h-72" /></div>
      )}

      {dados?.perfil && <BlocoPerfil r={dados.perfil} carregando={carregando} />}
      {dados?.perfilIndisponivel && !carregando && (
        <Aviso tom="info" role="status">Os números do seu perfil no Google estão sendo atualizados — volte mais tarde.</Aviso>
      )}

      {dados?.ads && <BlocoAds r={dados.ads} carregando={carregando} />}
      {dados?.adsIndisponivel && !carregando && (
        <Aviso tom="info" role="status">Os números dos anúncios no Google estão sendo atualizados — volte mais tarde.</Aviso>
      )}

      {nada && <Aviso tom="neutro">Ainda não há números do Google para este período.</Aviso>}
    </div>
  );
}
