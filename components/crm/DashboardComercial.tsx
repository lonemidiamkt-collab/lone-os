"use client";

// DASHBOARD do Comercial (redesign de out/2026, Leva D2 do PROMPT-DESIGN-COMERCIAL.md). Organização em
// faixas, como os CRMs de referência (Âncora, Pipedrive, HubSpot, RD Station): meta e números na faixa 1,
// o que precisa de atenção logo abaixo, funil e pipeline na 2, atividade/origem/resposta na 3 e as
// oportunidades na 4. Círculos só para meta, taxas e composição com até 5 partes. As contas moram em
// lib/crm/painel.ts e lib/crm/pipeline.ts (testadas); aqui é só desenho.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, MessageCircleOff, PhoneOff, Repeat, Target, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Anel, BarraMeta, Cartao, Rosca, SeloVariacao, TEXTO_TOM, TituloBloco } from "@/components/crm/graficos";
import { montarFatias, tomDaTaxa, tomDoRitmo, type FatiaDesenhada } from "@/lib/crm/graficos";
import {
  ROTULO_PERIODO, atividadeDaSemana, dataPorExtenso, duracaoCurta, fatiasDeOrigem, followUpEmDia, funilDeConversao,
  heroiDaMeta, intervaloDoPeriodo, leadsNovos, nomeDoMes, precisaDeAtencao, saudacao, taxaDeGanho, tempoDePrimeiraResposta,
  variacao, type ChaveAtencao, type LeadPainel, type Periodo,
} from "@/lib/crm/painel";
import { resumirPipeline, type LeadPipeline } from "@/lib/crm/pipeline";
import { ROTULO_ETAPA } from "@/lib/crm/etapas";
import { brl, hojeSP } from "@/lib/crm/meta";
import type { CrmMeta } from "@/lib/types";

export type FiltroFunil = { rotulo: string; ids: string[] };
type LeadDash = LeadPainel & LeadPipeline;

const ICONE_ATENCAO: Record<ChaveAtencao, LucideIcon> = {
  responder: UserPlus, atrasados: Clock, parados: AlertTriangle, regua: Repeat, sem_telefone: PhoneOff,
};
const COR_ATENCAO = { danger: "text-lone-danger", warning: "text-lone-warning", primary: "text-primary" } as const;

/** "R$ 11,8 mil" para o centro da rosca. */
const brlCurto = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace(".", ",").replace(",0", "")} mil` : brl(v));
const LIGACOES = new Set(["de", "da", "das", "do", "dos", "e", "a", "o"]);
/** "Casa do Exemplo" → "CE"; "Pão e Mel" → "PM". */
const iniciais = (s: string) => s.split(/\s+/).filter((p) => p && !LIGACOES.has(p.toLowerCase())).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || s.slice(0, 2).toUpperCase();

function Janela({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto text-[10.5px] text-muted-foreground">{children}</span>;
}
function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{children}</span>;
}

export default function DashboardComercial<L extends LeadDash>({
  leads, metas, carregarMeta, metaContatosSemana, nome, proximoPasso, onAbrirLead, onDefinirMeta, onIrPara, agora: agoraFixo, acao,
}: {
  leads: L[];
  /** Metas por mês ("2026-10" → meta). Mês ausente = ainda não carregado. */
  metas: Record<string, CrmMeta | null>;
  carregarMeta?: (mes: string) => void;
  metaContatosSemana: number | null;
  nome: string;
  proximoPasso: (l: L) => { texto: string; alerta: boolean };
  onAbrirLead: (l: L) => void;
  onDefinirMeta: (sugestao: number) => void;
  onIrPara: (destino: { aba: "hoje" | "funil"; filtro?: FiltroFunil }) => void;
  agora?: Date;
  /** Botão ao lado do período (o "Novo lead" da página). */
  acao?: React.ReactNode;
}) {
  const agora = agoraFixo ?? new Date();
  const hoje = hojeSP(agora);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [simulacao, setSimulacao] = useState(50);

  // O período mora no endereço (?periodo=), como no Âncora: dá para mandar o link já filtrado.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("periodo");
    if (p === "mes" || p === "mes_passado" || p === "30d") setPeriodo(p);
  }, []);
  const trocarPeriodo = (p: Periodo) => {
    setPeriodo(p);
    const u = new URL(window.location.href);
    if (p === "mes") u.searchParams.delete("periodo"); else u.searchParams.set("periodo", p);
    window.history.replaceState(null, "", u.toString());
  };

  const iv = useMemo(() => intervaloDoPeriodo(periodo, hoje), [periodo, hoje]);
  useEffect(() => { if (!(iv.mes in metas)) carregarMeta?.(iv.mes); }, [iv.mes, metas, carregarMeta]);
  const meta = metas[iv.mes] ?? null;

  const heroi = useMemo(() => heroiDaMeta({ leads, metaValor: meta?.metaValor ?? null, hoje, intervalo: iv }), [leads, meta, hoje, iv]);
  const pipeline = useMemo(() => resumirPipeline(leads, iv.mes), [leads, iv.mes]);
  const ganho = useMemo(() => taxaDeGanho(leads), [leads]);
  const emDia = useMemo(() => followUpEmDia(leads, hoje), [leads, hoje]);
  const novos = useMemo(() => leadsNovos(leads, iv), [leads, iv]);
  const atencao = useMemo(() => precisaDeAtencao(leads, hoje, agora), [leads, hoje]); // eslint-disable-line react-hooks/exhaustive-deps
  const funil = useMemo(() => funilDeConversao(leads), [leads]);
  const semana = useMemo(() => atividadeDaSemana(leads, hoje), [leads, hoje]);
  const origem = useMemo(() => montarFatias(fatiasDeOrigem(leads, iv), 5), [leads, iv]);
  const resposta = useMemo(() => tempoDePrimeiraResposta(leads, iv), [leads, iv]);

  const temValorNoPipeline = pipeline.porEtapa.some((e) => e.valor > 0);
  const fatiasPipeline = useMemo(() => montarFatias(pipeline.porEtapa.map((e) => ({
    chave: e.etapa, rotulo: ROTULO_ETAPA[e.etapa], valor: temValorNoPipeline ? e.valor : e.n,
  })), 5), [pipeline, temValorNoPipeline]);

  const tomMeta = tomDoRitmo(heroi.progresso, heroi.fracaoDoMes);
  const primeiroNome = nome.split(" ")[0] || nome;
  const filtrarPorEtapa = (f: FatiaDesenhada) => onIrPara({
    aba: "funil", filtro: { rotulo: `Etapa: ${f.rotulo}`, ids: leads.filter((l) => ROTULO_ETAPA[l.estagio as keyof typeof ROTULO_ETAPA] === f.rotulo).map((l) => l.id) },
  });
  const filtrarPorOrigem = (f: FatiaDesenhada) => onIrPara({
    aba: "funil", filtro: { rotulo: `Origem: ${f.rotulo}`, ids: leads.filter((l) => ((l.origem ?? "").trim() || "Sem origem") === f.rotulo).map((l) => l.id) },
  });
  const maxDia = Math.max(1, ...semana.dias.map((d) => d.n), metaContatosSemana ? Math.ceil(metaContatosSemana / 5) : 0);
  const metaDia = metaContatosSemana ? metaContatosSemana / 5 : null;
  const simulado = pipeline.mrrPotencial * (simulacao / 100);

  return (
    <div className="space-y-5">
      {/* Cabeçalho humano + período (o número principal fica no canto superior esquerdo, onde o olho começa) */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{dataPorExtenso(hoje)}</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-foreground">{saudacao(agora)}, {primeiroNome}</h1>
          <p className="mt-0.5 text-lone-body text-muted-foreground">
            {periodo === "mes"
              ? `${heroi.restantes} ${heroi.restantes === 1 ? "dia útil" : "dias úteis"} até o fim de ${nomeDoMes(iv.mes)}`
              : periodo === "mes_passado" ? `Resultado de ${nomeDoMes(iv.mes)}` : "Últimos 30 dias"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5" role="group" aria-label="Período">
            {(Object.keys(ROTULO_PERIODO) as Periodo[]).map((p) => (
              <button key={p} onClick={() => trocarPeriodo(p)} aria-pressed={periodo === p}
                className={`h-8 rounded-lg border px-3 text-[13px] transition-colors ${periodo === p ? "border-primary/30 bg-primary/10 font-semibold text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                {ROTULO_PERIODO[p]}
              </button>
            ))}
          </div>
          {acao}
        </div>
      </header>

      {/* ── Faixa 1: meta + 4 números ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao destaque className="sm:col-span-2 xl:row-span-2">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Anel tamanho="lg" pct={heroi.progresso != null ? heroi.progresso * 100 : null} tom={tomMeta}
              rotulo="da meta" rotuloAcessivel={heroi.meta ? `${Math.round((heroi.progresso ?? 0) * 100)}% da meta de ${nomeDoMes(iv.mes)}` : "Meta não definida"}
              centro={heroi.meta == null ? <span className="px-3 text-lone-caption text-muted-foreground">sem meta</span> : undefined} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5"><Target size={13} className="text-muted-foreground" aria-hidden="true" /><Rotulo>Meta de {nomeDoMes(iv.mes)} · MRR novo</Rotulo></div>
              <p className="mt-1.5 text-[32px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                {brl(heroi.vendido)}{heroi.meta != null && <span className="ml-1.5 text-lone-body font-normal text-muted-foreground">de {brl(heroi.meta)}</span>}
              </p>
              <div className="mt-2"><SeloVariacao v={heroi.variacao} rotulo={iv.rotuloAnterior} /></div>
              {heroi.meta != null ? (
                <div className="mt-4 space-y-2">
                  {heroi.bateu
                    ? <p className="text-lone-body font-medium text-lone-success">Meta batida com {heroi.ganhos} {heroi.ganhos === 1 ? "contrato" : "contratos"}.</p>
                    : <p className="text-lone-body text-foreground"><span className="font-semibold">Faltam {brl(heroi.falta ?? 0)}</span>{heroi.ritmoNecessario != null && <span className="text-muted-foreground"> · {brl(heroi.ritmoNecessario)} por dia útil</span>}</p>}
                  <BarraMeta progresso={heroi.progresso ?? 0} fracaoDoMes={heroi.fracaoDoMes} tom={tomMeta} />
                  {heroi.esperadoAteHoje != null && periodo === "mes" && !heroi.bateu && (
                    <p className="text-lone-caption text-muted-foreground">No ritmo do mês já teriam entrado {brl(heroi.esperadoAteHoje)} — entraram {brl(heroi.vendido)}.</p>
                  )}
                  {heroi.cobertura != null && (
                    <p className="text-lone-caption text-muted-foreground">O ponderado do funil cobre <span className={`font-semibold ${heroi.nivelCobertura === "verde" ? "text-lone-success" : heroi.nivelCobertura === "amarelo" ? "text-lone-warning" : "text-lone-danger"}`}>{heroi.cobertura.toFixed(1).replace(".", ",")}×</span> o que falta.</p>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3">
                  <p className="text-lone-body font-medium text-foreground">Defina a meta de {nomeDoMes(iv.mes)}</p>
                  <p className="mt-0.5 text-lone-caption text-muted-foreground">Sugestão: {brl(heroi.sugestao)} — o que já entrou ({brl(heroi.vendido)}) mais o ponderado do funil ({brl(heroi.ponderado)}).</p>
                  <button onClick={() => onDefinirMeta(heroi.sugestao)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:opacity-90">
                    Definir meta <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
              <p className="mt-3 text-lone-caption text-muted-foreground">{heroi.ganhos} {heroi.ganhos === 1 ? "contrato fechado" : "contratos fechados"} no período</p>
            </div>
          </div>
        </Cartao>

        <Cartao>
          <div className="flex items-center"><Rotulo>Ponderado</Rotulo><Janela>agora</Janela></div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{brl(pipeline.ponderado)}</p>
          <p className="mt-1.5 text-lone-caption text-muted-foreground">o que deve virar · de {brl(pipeline.mrrPotencial)} em {pipeline.oportunidades.length} {pipeline.oportunidades.length === 1 ? "negócio" : "negócios"}</p>
        </Cartao>

        <Cartao>
          <div className="flex items-center"><Rotulo>Taxa de ganho</Rotulo><Janela>desde o início</Janela></div>
          <div className="mt-2 flex items-center gap-3">
            <Anel tamanho="sm" pct={ganho.pct} tom="primary" rotuloAcessivel={`Taxa de ganho: ${ganho.feitos} de ${ganho.total}`} />
            <div>
              <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{ganho.poucos ? `${ganho.feitos} de ${ganho.total}` : `${ganho.pct ?? 0}%`}</p>
              <p className="mt-1.5 text-lone-caption text-muted-foreground">{ganho.poucos ? "poucos fechamentos para porcentagem" : `${ganho.feitos} de ${ganho.total} fechados`}{ganho.pctValor != null && !ganho.poucos ? ` · ${ganho.pctValor}% em valor` : ""}</p>
            </div>
          </div>
        </Cartao>

        <Cartao>
          <button onClick={() => onIrPara({ aba: "hoje" })} className="block w-full text-left">
            <div className="flex items-center"><Rotulo>Follow-up em dia</Rotulo><Janela>agora</Janela></div>
            <div className="mt-2 flex items-center gap-3">
              <Anel tamanho="sm" pct={emDia.pct} tom={tomDaTaxa(emDia.pct)} rotuloAcessivel={`Follow-up em dia: ${emDia.feitos} de ${emDia.total}`} />
              <div>
                <p className={`text-[26px] font-semibold leading-none tracking-tight tabular-nums ${TEXTO_TOM[tomDaTaxa(emDia.pct)]}`}>{emDia.total === 0 ? "—" : emDia.poucos ? `${emDia.feitos} de ${emDia.total}` : `${emDia.pct}%`}</p>
                <p className="mt-1.5 text-lone-caption text-muted-foreground">{emDia.total === 0 ? "nenhum passo da régua pendente" : `${emDia.feitos} de ${emDia.total} sem atraso na régua`}</p>
              </div>
            </div>
          </button>
        </Cartao>

        <Cartao>
          <div className="flex items-center"><Rotulo>Leads novos</Rotulo><Janela>{ROTULO_PERIODO[periodo].toLowerCase()}</Janela></div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{novos.atual}</p>
          <div className="mt-2"><SeloVariacao v={novos.variacao} rotulo={iv.rotuloAnterior} /></div>
        </Cartao>
      </div>

      {/* ── Precisa da sua atenção (listas de ação acima da dobra) ── */}
      <section aria-label="Precisa da sua atenção">
        <div className="mb-2.5 flex items-center gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Precisa da sua atenção · agora</h2>
          <span className="h-px flex-1 bg-border" />
        </div>
        {atencao.length === 0 ? (
          <Cartao className="flex items-center gap-3 py-4"><CheckCircle2 size={18} className="text-lone-success" aria-hidden="true" /><p className="text-lone-body text-foreground">Tudo em dia: nenhum lead esperando, nada atrasado ou parado.</p></Cartao>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {atencao.map((a) => {
              const Icone = ICONE_ATENCAO[a.chave];
              const vaiProHoje = a.chave === "responder" || a.chave === "atrasados" || a.chave === "regua";
              return (
                <button key={a.chave} onClick={() => onIrPara(vaiProHoje ? { aba: "hoje" } : { aba: "funil", filtro: { rotulo: a.rotulo, ids: a.leads.map((l) => l.id) } })}
                  className="group rounded-xl border border-border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/40 dark:shadow-none">
                  <div className="flex items-center justify-between">
                    <span className={`text-[26px] font-semibold leading-none tabular-nums ${COR_ATENCAO[a.tom]}`}>{a.leads.length}</span>
                    <Icone size={16} className={COR_ATENCAO[a.tom]} aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-lone-body font-medium text-foreground">{a.rotulo}</p>
                  <p className="text-lone-caption text-muted-foreground">{a.dica}</p>
                  <p className="mt-1.5 text-lone-caption font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">ver lista →</p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Faixa 2: funil (barras, nunca rosca) + pipeline por etapa (rosca) ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao>
          <TituloBloco titulo="Funil de conversão" apoio="Quantos chegaram a cada etapa e quanto passou da anterior" />
          <div className="space-y-1">
            {funil.degraus.map((d) => (
              <div key={d.etapa} className="rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="flex-1 text-foreground">{ROTULO_ETAPA[d.etapa]}</span>
                  {d.pctDaAnterior != null && <span className={`tabular-nums ${d.pctDaAnterior < 30 ? "text-lone-warning" : "text-muted-foreground"}`}>{d.pctDaAnterior}% da anterior</span>}
                  <span className="w-8 text-right font-semibold tabular-nums text-foreground">{d.n}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-muted-foreground/15">
                  <div className={`h-full rounded-full ${d.etapa === "ganho" ? "bg-lone-success" : "bg-primary"}`} style={{ width: `${funil.total ? Math.max(d.n ? 4 : 0, (d.n / funil.total) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Entrada → contrato</span>
            <span className="text-lone-body"><span className="font-semibold text-foreground">{funil.pctTotal ?? 0}%</span> <span className="text-muted-foreground">· {funil.ganhos} de {funil.total}</span></span>
          </div>
        </Cartao>

        <Cartao>
          <TituloBloco titulo="Pipeline por etapa" apoio={temValorNoPipeline ? "Mensalidade estimada dos negócios abertos, por etapa" : "Negócios abertos por etapa (ainda sem mensalidade estimada)"} />
          {fatiasPipeline.length ? (
            <Rosca fatias={fatiasPipeline} centroValor={temValorNoPipeline ? brlCurto(pipeline.mrrPotencial) : String(pipeline.porEtapa.reduce((s, e) => s + e.n, 0))}
              centroRotulo={temValorNoPipeline ? "por mês" : "negócios"} rotuloAcessivel="Pipeline por etapa" aoClicar={filtrarPorEtapa}
              formatar={(f) => { const e = pipeline.porEtapa.find((x) => x.etapa === f.chave); return e ? `${e.n} · ${brl(e.valor)}` : ""; }} />
          ) : <p className="text-lone-body text-muted-foreground">Nenhum negócio aberto.</p>}
        </Cartao>
      </div>

      {/* ── Faixa 3: atividade da semana, origem e tempo de resposta ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao>
          <TituloBloco titulo="Contatos da semana" apoio="WhatsApp, ligação, visita e reunião registrados" />
          <div className="flex h-28 items-end gap-2">
            {semana.dias.map((d) => (
              <div key={d.dia} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10.5px] tabular-nums text-muted-foreground">{d.n || ""}</span>
                <div className={`w-full rounded-t-md ${d.futuro ? "bg-muted-foreground/10" : d.n ? "bg-primary" : "bg-muted-foreground/15"}`}
                  style={{ height: d.n ? `${Math.max(8, (d.n / maxDia) * 100)}%` : "4px" }} />
                <span className="text-[10.5px] text-muted-foreground">{["seg", "ter", "qua", "qui", "sex", "sáb", "dom"][semana.dias.indexOf(d)]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-lone-caption text-muted-foreground">
            <span className="font-semibold text-foreground">{semana.total}</span> {semana.total === 1 ? "contato" : "contatos"} esta semana
            {metaContatosSemana ? <> · meta {metaContatosSemana}{metaDia ? ` (${Math.round(metaDia)} por dia útil)` : ""}</> : " · sem meta de contatos"}
          </p>
        </Cartao>

        <Cartao>
          <TituloBloco titulo="De onde vêm os leads" apoio={`Entraram ${periodo === "mes" ? "este mês" : periodo === "mes_passado" ? `em ${nomeDoMes(iv.mes)}` : "nos últimos 30 dias"}`} />
          {origem.length ? (
            <Rosca fatias={origem} centroValor={String(origem.reduce((s, f) => s + f.valor, 0))} centroRotulo="leads" rotuloAcessivel="Origem dos leads"
              aoClicar={filtrarPorOrigem} formatar={(f) => `${f.valor}`} />
          ) : <p className="text-lone-body text-muted-foreground">Nenhum lead entrou no período.</p>}
        </Cartao>

        <Cartao>
          <TituloBloco titulo="Tempo de 1ª resposta" apoio="Só de quem chegou sozinho (site e anúncio). Meta: até 1 hora." />
          {resposta.horas == null ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <MessageCircleOff size={18} className="text-muted-foreground" aria-hidden="true" />
              <p className="text-lone-body text-muted-foreground">Nenhum lead do site respondido no período.</p>
            </div>
          ) : (
            <>
              <p className={`text-[34px] font-semibold leading-none tracking-tight tabular-nums ${resposta.horas <= 1 ? "text-lone-success" : resposta.horas <= 4 ? "text-lone-warning" : "text-lone-danger"}`}>{duracaoCurta(resposta.horas)}</p>
              <p className="mt-1.5 text-lone-caption text-muted-foreground">mediana de {resposta.n} {resposta.n === 1 ? "lead" : "leads"}</p>
              {resposta.anterior != null && <div className="mt-2"><SeloVariacao v={variacao(resposta.horas, resposta.anterior)} rotulo={iv.rotuloAnterior} melhorQuandoDesce /></div>}
            </>
          )}
        </Cartao>
      </div>

      {/* ── Faixa 4: oportunidades (maiores negócios) com a simulação no cabeçalho ── */}
      <Cartao semMargem className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-lone-h2 text-foreground">Oportunidades</h2>
            <p className="mt-0.5 text-lone-caption text-muted-foreground">Negócios abertos com mensalidade estimada, do mais perto de fechar ao mais longe</p>
          </div>
          {pipeline.oportunidades.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-lone-caption text-muted-foreground">
              Se eu fechar
              <input type="range" min={25} max={100} step={25} value={simulacao} onChange={(e) => setSimulacao(Number(e.target.value))} className="w-24 accent-primary" aria-label="Porcentagem das oportunidades fechadas" />
              <span className="w-9 font-semibold tabular-nums text-foreground">{simulacao}%</span>
              <span>→ <span className="font-semibold text-foreground">{brl(simulado)}</span>/mês · {brl(simulado * 12)} no ano</span>
            </label>
          )}
        </div>
        {pipeline.oportunidades.length === 0 ? (
          <p className="px-5 pb-5 text-lone-body text-muted-foreground">Nenhuma oportunidade com valor ainda. Coloque a mensalidade estimada no lead quando a conversa chegar no diagnóstico.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {pipeline.oportunidades.map((o) => {
              const passo = proximoPasso(o.lead);
              const nomeEmp = o.lead.empresa || o.lead.contatoNome;
              return (
                <li key={o.lead.id}>
                  <button onClick={() => onAbrirLead(o.lead)} className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent/60 sm:flex-nowrap">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{iniciais(nomeEmp)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lone-body font-medium text-foreground">{nomeEmp}</span>
                      <span className="block truncate text-lone-caption text-muted-foreground">{o.lead.empresa && o.lead.contatoNome !== o.lead.empresa ? o.lead.contatoNome : (o.lead.origem || "sem contato cadastrado")}</span>
                    </span>
                    <span className="hidden shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary md:inline">{ROTULO_ETAPA[o.etapa]}</span>
                    <span className="w-24 shrink-0 text-right text-lone-body font-semibold tabular-nums text-foreground">{brl(o.mensalidade)}</span>
                    <span className="flex w-20 shrink-0 items-center justify-end gap-2">
                      <Anel tamanho="xs" pct={o.chance * 100} tom="primary" rotuloAcessivel={`Chance de ${Math.round(o.chance * 100)}%`} />
                      <span className="w-9 text-right text-lone-caption tabular-nums text-muted-foreground">{Math.round(o.chance * 100)}%</span>
                    </span>
                    <span className={`hidden w-52 shrink-0 truncate text-lone-caption lg:block ${passo.alerta ? "font-medium text-lone-warning" : "text-muted-foreground"}`}>{passo.texto}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pipeline.oportunidades.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-5 py-3 text-lone-body">
            <span className="text-muted-foreground">{pipeline.oportunidades.length} {pipeline.oportunidades.length === 1 ? "oportunidade" : "oportunidades"}{pipeline.semValor ? ` · mais ${pipeline.semValor} abertos sem mensalidade estimada` : ""}</span>
            <span><span className="font-semibold text-foreground">{brl(pipeline.mrrPotencial)}</span><span className="text-muted-foreground">/mês · ponderado {brl(pipeline.ponderado)}</span></span>
          </div>
        )}
      </Cartao>
    </div>
  );
}
