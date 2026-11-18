"use client";

// Aba "Atendimento e vendas" do painel de resultados: os números do CRM do cliente (Âncora, Kommo ou outro CRM
// conectado pela API aberta) — leads, tempo de primeira resposta, vendas, orçamentos, ciclo e o funil de agora.
//
// Os números vêm de /api/portal/[token]/crm, que monta o MESMO bloco do relatório semanal e mensal
// (lib/crm-externo/relatorio.ts): o cliente vê aqui o que recebeu no PDF. Período que não pôde ser lido mostra
// "atualizando" — nunca zero.

import { useCallback, useEffect, useState } from "react";
import { Handshake, RefreshCw, Timer, Filter } from "lucide-react";
import { Aviso, Cartao, CabecalhoSecao, Segmentado } from "./ui";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { rotuloDia } from "@/lib/portal/formatos";
import { formatarVariacao } from "@/components/ui/painel-comparativo-utils";
import { cn } from "@/lib/utils";
import { formatarCrm, formatarCentavos, formatarDuracao, type KpiCrm, type RelatorioCrm } from "@/lib/crm-externo/relatorio";
import type { PeriodKind } from "@/lib/portal/types";

const PERIODOS: { valor: PeriodKind; rotulo: string }[] = [
  { valor: "last_week", rotulo: "7 dias" },
  { valor: "last_2_weeks", rotulo: "14 dias" },
  { valor: "this_month", rotulo: "Este mês" },
  { valor: "last_month", rotulo: "Mês passado" },
];

interface Resposta {
  periodo?: { kind: PeriodKind; inicio: string; fim: string; anteriorInicio?: string; anteriorFim?: string };
  conectado?: boolean;
  relatorio?: RelatorioCrm | null;
  indisponivel?: boolean;
}

const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");
const TOM = {
  bom: "bg-lone-success-bg text-lone-success border-lone-success-border",
  ruim: "bg-lone-warning-bg text-lone-warning border-lone-warning-border",
  neutro: "bg-muted text-muted-foreground border-border",
} as const;

function CartaoKpi({ k, destaque }: { k: KpiCrm; destaque: boolean }) {
  const pct = k.variacaoPct;
  return (
    <Cartao className={cn("flex flex-col gap-1 p-4", destaque && "border-primary/40")}>
      <span className="text-lone-caption text-muted-foreground">{k.rotulo}</span>
      <span className={cn("font-semibold tabular-nums text-foreground", destaque ? "text-2xl" : "text-xl")}>{formatarCrm(k.valor, k.formato)}</span>
      {pct != null && k.anterior != null && (
        <span className="flex flex-wrap items-center gap-1.5 text-lone-caption">
          <span className={cn("rounded-full border px-1.5 py-0.5 font-medium tabular-nums", TOM[k.tom])}>{formatarVariacao(pct)}</span>
          <span className="text-muted-foreground">antes: {formatarCrm(k.anterior, k.formato)}</span>
        </span>
      )}
      {k.nota && <span className="text-lone-caption text-muted-foreground">{k.nota}</span>}
    </Cartao>
  );
}

function Barra({ rotulo, valor, total, cor = "bg-primary" }: { rotulo: string; valor: number; total: number; cor?: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 truncate text-muted-foreground sm:w-40" title={rotulo}>{rotulo}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${rotulo}: ${inteiro(valor)}`}>
        <span className={cn("block h-full rounded-full", cor)} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-foreground">{inteiro(valor)}</span>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 first:border-t-0">
      <span className="min-w-0 text-sm text-secondary-foreground">{rotulo}</span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{valor}</span>
    </div>
  );
}

function Bloco({ r }: { r: RelatorioCrm }) {
  const k = (c: string) => r.kpis.find((x) => x.chave === c);
  const principais = ["vendas", "leads", "resposta", "faturamento"].map(k).filter((x): x is KpiCrm => !!x);
  const outros = ["orcamentos", "ciclo", "conversao", "resposta_boa", "perdidos"].map(k).filter((x): x is KpiCrm => !!x);
  const t = r.resposta ? r.resposta.boa + r.resposta.atencao + r.resposta.estourada : 0;
  const maiorEtapa = Math.max(1, ...(r.funil ?? []).map((e) => e.negocios));
  return (
    <div className="space-y-4">
      <CabecalhoSecao icone={Handshake} titulo="Atendimento e vendas"
        descricao={`Do seu CRM (${r.rotuloProvedor}) · ${rotuloDia(r.janela.inicio)} a ${rotuloDia(r.janela.fim)}${r.anterior ? `, comparado com ${rotuloDia(r.anterior.inicio)} a ${rotuloDia(r.anterior.fim)}` : ""}`} />
      <Cartao className="p-4 sm:p-5"><p className="text-sm text-foreground">{r.frase}</p></Cartao>
      {principais.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {principais.map((x, i) => <CartaoKpi key={x.chave} k={x} destaque={i === 0} />)}
        </div>
      )}
      {outros.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {outros.map((x) => <CartaoKpi key={x.chave} k={x} destaque={false} />)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {r.resposta && (
          <Cartao as="section" className="p-4 sm:p-5">
            <CabecalhoSecao nivel={3} icone={Timer} titulo="Primeira resposta ao lead"
              descricao={`${inteiro(t)} respondido${t === 1 ? "" : "s"} no período${r.resposta.p90Seg != null ? ` · 9 em cada 10 em até ${formatarDuracao(r.resposta.p90Seg)}` : ""}`} />
            <div className="mt-4 space-y-2.5">
              <Barra rotulo="Menos de 5 min" valor={r.resposta.boa} total={t} cor="bg-lone-success" />
              <Barra rotulo="5 a 10 min" valor={r.resposta.atencao} total={t} cor="bg-lone-warning" />
              <Barra rotulo="Mais de 10 min" valor={r.resposta.estourada} total={t} cor="bg-lone-danger" />
            </div>
          </Cartao>
        )}
        {(r.funil?.length || r.abertos || r.recuperadas) && (
          <Cartao as="section" className="p-4 sm:p-5">
            <CabecalhoSecao nivel={3} icone={Filter} titulo="Funil agora" descricao="Negócios em aberto em cada etapa, hoje" />
            {r.funil?.length ? (
              <div className="mt-4 space-y-2.5">
                {r.funil.slice(0, 12).map((e) => <Barra key={e.etapa} rotulo={e.etapa} valor={e.negocios} total={maiorEtapa} />)}
              </div>
            ) : null}
            <div className="mt-4">
              {r.abertos && <Linha rotulo="Em negociação agora" valor={`${inteiro(r.abertos.quantidade)}${r.abertos.valorCentavos ? ` · ${formatarCentavos(r.abertos.valorCentavos)}` : ""}`} />}
              {r.recuperadas && <Linha rotulo="Vendas recuperadas no período" valor={`${inteiro(r.recuperadas.negocios)} · ${formatarCentavos(r.recuperadas.valorCentavos)}`} />}
            </div>
          </Cartao>
        )}
      </div>
    </div>
  );
}

export default function PortalCrm({ token }: { token: string }) {
  const [periodo, setPeriodo] = useState<PeriodKind>("last_week");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async (p: PeriodKind) => {
    setCarregando(true);
    setErro(null);
    const r = await chamar<Resposta>(`/api/portal/${token}/crm`, { period_kind: p });
    if (r.ok && r.data) setDados(r.data);
    else {
      // Sem dado novo, o período antigo NÃO fica na tela sob o rótulo novo.
      setDados(null);
      setErro(r.status === 0 ? "Não consegui buscar os números de atendimento agora. Verifique sua conexão." : r.erro || "Não consegui buscar os números de atendimento agora.");
    }
    setCarregando(false);
  }, [token]);

  useEffect(() => { buscar(periodo); }, [buscar, periodo]);

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
      {carregando && !dados && (
        <div className="space-y-4" aria-busy="true"><Skeleton className="h-8 w-60" /><Skeleton className="h-48" /></div>
      )}
      {dados?.relatorio && !dados.relatorio.semDados && <div className={cn(carregando && "opacity-60")}><Bloco r={dados.relatorio} /></div>}
      {dados?.indisponivel && !carregando && (
        <Aviso tom="info" role="status">Os números de atendimento e vendas estão sendo atualizados — volte mais tarde.</Aviso>
      )}
      {dados && !carregando && !dados.indisponivel && (!dados.relatorio || dados.relatorio.semDados) && (
        <Aviso tom="neutro">Ainda não há números de atendimento para este período.</Aviso>
      )}
    </div>
  );
}
