"use client";

// Aba "Atendimento e vendas" do painel de resultados: os números do CRM do cliente (Âncora, Kommo ou outro CRM
// conectado pela API aberta) — leads, tempo de primeira resposta, vendas, orçamentos, ciclo e o funil de agora.
//
// Os números vêm de /api/portal/[token]/crm, que monta o MESMO bloco do relatório semanal e mensal
// (lib/crm-externo/relatorio.ts): o cliente vê aqui o que recebeu no PDF. Período que não pôde ser lido mostra
// "atualizando" — nunca zero.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck, FileText, Filter, Handshake, Hourglass, Percent, RefreshCw, Timer, UserPlus, Wallet, XCircle, Zap, type LucideIcon,
} from "lucide-react";
import { Aviso, Cartao, CabecalhoSecao, ListaBarras, Segmentado, entrada } from "./ui";
import { CardKpi, type KpiComparativo } from "@/components/ui/painel-comparativo";
import Skeleton from "@/components/ui/Skeleton";
import { chamar } from "@/lib/api/chamar";
import { rotuloDia } from "@/lib/portal/formatos";
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

// Ícone de cada número — o mesmo cartão das outras abas (CardKpi do painel), com ícone e pílula de variação.
const ICONE: Record<string, LucideIcon> = {
  vendas: BadgeCheck, leads: UserPlus, resposta: Timer, faturamento: Wallet,
  orcamentos: FileText, ciclo: Hourglass, conversao: Percent, resposta_boa: Zap, perdidos: XCircle,
};

const paraKpi = (k: KpiCrm): KpiComparativo => ({
  rotulo: k.rotulo,
  valor: formatarCrm(k.valor, k.formato),
  variacaoPct: k.anterior != null ? k.variacaoPct : null,
  natureza: k.natureza,
  dica: k.nota ?? undefined,
  icone: ICONE[k.chave],
});

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border py-2 first:border-t-0">
      <span className="min-w-0 text-sm text-secondary-foreground">{rotulo}</span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{valor}</span>
    </div>
  );
}

function Fileira({ kpis, colunas, inicio }: { kpis: KpiCrm[]; colunas: string; inicio: number }) {
  if (!kpis.length) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", colunas)}>
      {kpis.map((k, i) => (
        <motion.div key={k.chave} variants={entrada} initial="oculto" animate="visivel" custom={inicio + i} className="min-w-0">
          <CardKpi kpi={paraKpi(k)} limiar={5} tomRuim="atencao" />
        </motion.div>
      ))}
    </div>
  );
}

function Bloco({ r }: { r: RelatorioCrm }) {
  const k = (c: string) => r.kpis.find((x) => x.chave === c);
  const principais = ["vendas", "leads", "resposta", "faturamento"].map(k).filter((x): x is KpiCrm => !!x);
  const outros = ["orcamentos", "ciclo", "conversao", "resposta_boa", "perdidos"].map(k).filter((x): x is KpiCrm => !!x);
  const t = r.resposta ? r.resposta.boa + r.resposta.atencao + r.resposta.estourada : 0;
  const pct = (v: number) => (t > 0 ? ` (${Math.round((v / t) * 100)}%)` : "");
  const COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" };
  const temFunil = !!(r.funil?.length || r.abertos || r.recuperadas);
  return (
    <div className="space-y-4">
      <CabecalhoSecao icone={Handshake} titulo="Atendimento e vendas"
        descricao={`Do seu CRM (${r.rotuloProvedor}) · ${rotuloDia(r.janela.inicio)} a ${rotuloDia(r.janela.fim)}${r.anterior ? `, comparado com ${rotuloDia(r.anterior.inicio)} a ${rotuloDia(r.anterior.fim)}` : ""}`} />
      <motion.div variants={entrada} initial="oculto" animate="visivel" custom={0}>
        <Cartao className="p-4 sm:p-5"><p className="text-sm leading-relaxed text-foreground">{r.frase}</p></Cartao>
      </motion.div>
      <Fileira kpis={principais} colunas={COLS[Math.min(principais.length, 4)]} inicio={1} />
      <Fileira kpis={outros} colunas={COLS[Math.min(outros.length, 5)]} inicio={1 + principais.length} />
      {(r.resposta || temFunil) && (
        <div className={cn("grid gap-4", r.resposta && temFunil && "lg:grid-cols-2")}>
          {r.resposta && (
            <Cartao as="section" className="p-4 sm:p-5">
              <CabecalhoSecao nivel={3} icone={Timer} titulo="Primeira resposta ao lead"
                descricao={`${inteiro(t)} respondido${t === 1 ? "" : "s"} no período${r.resposta.p90Seg != null ? ` · 9 em cada 10 em até ${formatarDuracao(r.resposta.p90Seg)}` : ""}`} />
              <div className="mt-3">
                <ListaBarras rotulo="Tempo da primeira resposta" itens={[
                  { chave: "boa", rotulo: "Menos de 5 min", valor: r.resposta.boa, texto: `${inteiro(r.resposta.boa)}${pct(r.resposta.boa)}`, icone: Zap },
                  { chave: "atencao", rotulo: "5 a 10 min", valor: r.resposta.atencao, texto: `${inteiro(r.resposta.atencao)}${pct(r.resposta.atencao)}`, icone: Timer },
                  { chave: "estourada", rotulo: "Mais de 10 min", valor: r.resposta.estourada, texto: `${inteiro(r.resposta.estourada)}${pct(r.resposta.estourada)}`, icone: Hourglass },
                ]} />
              </div>
            </Cartao>
          )}
          {temFunil && (
            <Cartao as="section" className="p-4 sm:p-5">
              <CabecalhoSecao nivel={3} icone={Filter} titulo="Funil agora" descricao="Negócios em aberto em cada etapa, hoje" />
              {r.funil?.length ? (
                <div className="mt-3">
                  <ListaBarras rotulo="Negócios por etapa do funil"
                    itens={r.funil.slice(0, 12).map((e, i) => ({ chave: `${i}-${e.etapa}`, rotulo: e.etapa, valor: e.negocios }))}
                    formatar={(n) => `${inteiro(n)} negócio${n === 1 ? "" : "s"}`} />
                </div>
              ) : null}
              {(r.abertos || r.recuperadas) && (
                <div className="mt-3 border-t border-border pt-1">
                  {r.abertos && <Linha rotulo="Em negociação agora" valor={`${inteiro(r.abertos.quantidade)}${r.abertos.valorCentavos ? ` · ${formatarCentavos(r.abertos.valorCentavos)}` : ""}`} />}
                  {r.recuperadas && <Linha rotulo="Vendas recuperadas no período" valor={`${inteiro(r.recuperadas.negocios)} · ${formatarCentavos(r.recuperadas.valorCentavos)}`} />}
                </div>
              )}
            </Cartao>
          )}
        </div>
      )}
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
