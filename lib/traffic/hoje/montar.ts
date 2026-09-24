// lib/traffic/hoje/montar.ts — as linhas da aba "Hoje" do Tráfego. PURO: recebe o que ./carregar leu.
//
// Nenhuma régua nova foi inventada aqui. Cada problema vem de um motor que já existia e que já fala
// nos outros canais — por isso o "visto" de um vale em todos:
//   · conta   — lib/budgets/account-status (o que cada status da Meta significa) + sync_error.
//   · saldo   — lib/budgets/alert-engine evaluateAccount, o MESMO do alerta de WhatsApp (sync-saldos)
//               e do Início; saldo efetivo pela mesma regra do sync (lib/inicio/regras saldoEfetivo).
//   · entrega — anomaly_alerts sem "resolvido" (defense-scan, o mesmo do alerta-queda), conta ativa
//               sem gasto em 3 dias (lib/budgets/operational-alerts) e "Contas sem entrega" do
//               diagnóstico diário.
//   · acima_meta, desperdicio, fadiga, verba — o diagnóstico diário (lib/traffic/diagnostico.ts, o
//               mesmo do PDF das 8h).
// Só entra quem COMPROU tráfego (lib/clients/servico) e está operando: sem pausado, ex-cliente,
// rascunho nem "(teste)".

import { comoTipoResultado, type TipoResultadoConta } from "@/lib/meta/resultado";
import { evaluateAccount, DEFAULT_ALERT_CONFIG } from "@/lib/budgets/alert-engine";
import { metaAccountStatus } from "@/lib/budgets/account-status";
import { temTrafego } from "@/lib/clients/servico";
import { estaPausado, hojeSP } from "@/lib/clients/pausa";
import { logoDoCliente } from "@/lib/notificacoes/visual";
import { ehTeste, mesmaPessoa, nomeDoCliente } from "@/lib/inicio/dados";
import { saldoEfetivo } from "@/lib/inicio/regras";
import type { LinhaHoje, NumerosHoje, ProblemaHoje, TipoAlerta } from "./tipos";
import { compararLinhas, compararProblemas, estadoDaLinha } from "./ordem";
import { DIAGNOSTICO_TIPO, RANK_NIVEL, infoDoVisto, nivelDaAnomalia, vistoDe, type MapaVistos } from "./visto";

// ── Linhas do banco (só as colunas usadas) ──────────────────────────────────

export interface ClienteHojeRow {
  id: string;
  name: string | null;
  nome_fantasia: string | null;
  logo: string | null;
  doc_logo: string | null;
  active: boolean | null;
  churned_at: string | null;
  draft_status: string | null;
  paused_at: string | null;
  paused_until: string | null;
  service_type: string | null;
  assigned_traffic: string | null;
  meta_ad_account_id: string | null;
}

export interface ContaHojeRow {
  id: string;
  client_id: string | null;
  meta_account_id: string | null;
  account_status: number | null;
  sync_error: string | null;
  last_balance: number | null;
  is_prepaid: boolean | null;
  monthly_budget: number | null;
  current_month_spend: number | null;
  last_3d_avg_spend: number | null;
  last_synced_at?: string | null;
}

export interface ConfigHojeRow {
  client_id: string;
  verba_minima?: number | null;
  alert_verba_baixa?: boolean | null;
  alert_verba_zerada?: boolean | null;
  alert_erro_conta?: boolean | null;
  alert_sem_gasto?: boolean | null;
  alert_meta_erro?: boolean | null;
}

export interface AnomaliaHojeRow {
  client_id: string | null;
  metric: string | null;
  severity: string | null;
  percent_change: number | null;
}

export interface MetricaDiaRow {
  client_id: string | null;
  metric_date: string | null;
  spend: number | string | null;
  /** Conversas (a coluna de sempre). */
  conversions: number | string | null;
  /** Leva 7A (N4): resultado pelo objetivo (conversa, lead ou compra) e qual. Ausente antes da migração. */
  results?: number | string | null;
  result_kind?: string | null;
}

/** Um achado do diagnóstico diário, achatado (a função vira `funcao`). */
export interface ItemDiagnosticoHoje {
  clientId: string;
  funcao: string;
  achado: string;
  acao: string;
  prioridade: number;
}

export interface EntradaHoje {
  agora: Date;
  /** YYYY-MM-DD em São Paulo. */
  ontem: string;
  clientes: ClienteHojeRow[];
  contas: ContaHojeRow[];
  configs: ConfigHojeRow[];
  anomalias: AnomaliaHojeRow[];
  metricas: MetricaDiaRow[];
  diagnostico: ItemDiagnosticoHoje[];
  vistos: MapaVistos;
  ajustes: { warningPct: number; criticalPct: number; contasOcultas: string[] };
  /** Nome de quem olha, canonizado contra o time. */
  eu: string | null;
  /** Nome escrito de qualquer jeito → nome do time. */
  canon: (nome: string | null | undefined) => string | null;
}

// ── Datas ───────────────────────────────────────────────────────────────────

/** YYYY-MM-DD + n dias (calendário, sem fuso no meio). */
export function somarDias(ymd: string, n: number): string {
  const t = Date.parse(`${ymd.slice(0, 10)}T12:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Ontem em São Paulo — o último dia fechado. Hoje ainda está acontecendo e sempre parece pior. */
export function ontemSP(agora: Date = new Date()): string {
  return somarDias(hojeSP(agora), -1);
}

// ── Regras pequenas ─────────────────────────────────────────────────────────

/** app/api/system/alerta-queda: pior sintoma primeiro. */
const SINTOMA: Record<string, { ordem: number; texto: (p: number) => string }> = {
  spend:       { ordem: 0, texto: () => "Parou de gastar" },
  impressions: { ordem: 1, texto: (p) => `Entrega caiu ${Math.abs(Math.round(p))}%` },
  cpl:         { ordem: 2, texto: (p) => `Custo por conversa subiu ${Math.round(p)}%` },
  ctr:         { ordem: 3, texto: (p) => `Cliques caíram ${Math.abs(Math.round(p))}%` },
};

/** Gerenciador de Anúncios da conta, quando o id é reconhecível (act_123 ou 123). */
export function linkGerenciador(metaAccountId: string | null | undefined): string | null {
  const num = (metaAccountId ?? "").trim().replace(/^act_/, "");
  return /^\d+$/.test(num) ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${num}` : null;
}

/** Entra no Hoje? Comprou tráfego e está operando. */
export function clienteDoHoje(c: ClienteHojeRow, agora: Date = new Date()): boolean {
  return c.active !== false && !c.churned_at && !c.draft_status
    && !ehTeste(c.name) && !ehTeste(c.nome_fantasia)
    && !estaPausado(c, agora)
    && temTrafego({ service_type: c.service_type });
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

type Candidato = Omit<ProblemaHoje, "visto">;

/** Fica o pior candidato de cada tipo: gravidade, depois peso. */
function juntar(mapa: Map<TipoAlerta, Candidato>, c: Candidato) {
  const atual = mapa.get(c.tipo);
  if (!atual || RANK_NIVEL[c.nivel] > RANK_NIVEL[atual.nivel]
    || (RANK_NIVEL[c.nivel] === RANK_NIVEL[atual.nivel] && c.peso > atual.peso)) {
    mapa.set(c.tipo, c);
  }
}

function agrupar<T>(linhas: readonly T[], chave: (t: T) => string | null | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const l of linhas) {
    const k = chave(l);
    if (!k) continue;
    const lista = out.get(k);
    if (lista) lista.push(l); else out.set(k, [l]);
  }
  return out;
}

// ── Números do dia ──────────────────────────────────────────────────────────

export function numerosDoDia(metricas: readonly MetricaDiaRow[], ontem: string): Pick<NumerosHoje,
  "gastoOntem" | "conversasOntem" | "custoOntem" | "conversasMedia7d" | "custoMedio7d" | "tipoResultado"> {
  // Uma linha por dia (o metric_snapshots já teve cópias do mesmo dia — a última vence).
  // O "resultado" é o do objetivo (results) quando o defense-scan já gravou; senão, as conversas.
  const porDia = new Map<string, { gasto: number; conv: number; tipo: TipoResultadoConta | null }>();
  for (const m of metricas) {
    if (!m.metric_date) continue;
    porDia.set(m.metric_date.slice(0, 10), {
      gasto: num(m.spend) ?? 0,
      conv: num(m.results ?? null) ?? num(m.conversions) ?? 0,
      tipo: comoTipoResultado(m.result_kind),
    });
  }
  // Tipo: o do dia mais recente que disse qual era.
  const tipoResultado = [...porDia.entries()].sort(([a], [b]) => b.localeCompare(a)).find(([, v]) => v.tipo)?.[1].tipo ?? "mensagens";
  const dOntem = porDia.get(ontem) ?? null;
  const desde = somarDias(ontem, -7);
  const semana = [...porDia.entries()].filter(([d]) => d >= desde && d < ontem).map(([, v]) => v);
  const gastoSemana = semana.reduce((s, v) => s + v.gasto, 0);
  const convSemana = semana.reduce((s, v) => s + v.conv, 0);
  return {
    gastoOntem: dOntem ? dOntem.gasto : null,
    conversasOntem: dOntem ? dOntem.conv : null,
    custoOntem: dOntem && dOntem.conv > 0 ? dOntem.gasto / dOntem.conv : null,
    conversasMedia7d: semana.length ? convSemana / semana.length : null,
    custoMedio7d: convSemana > 0 ? gastoSemana / convSemana : null,
    tipoResultado,
  };
}

// ── A linha de um cliente ───────────────────────────────────────────────────

const TITULO_DIAG: Partial<Record<TipoAlerta, (n: number) => string>> = {
  desperdicio: (n) => (n === 1 ? "Anúncio gastando sem conversa" : `${n} anúncios gastando sem conversa`),
  acima_meta: (n) => (n === 1 ? "Custo acima da meta" : `${n} conjuntos acima da meta`),
  fadiga: (n) => (n === 1 ? "Criativo cansado" : `${n} criativos cansados`),
  verba: () => "Verba mal distribuída",
};

export function montarLinha(
  c: ClienteHojeRow,
  e: EntradaHoje,
  fontes: { contas: ContaHojeRow[]; config?: ConfigHojeRow; anomalias: AnomaliaHojeRow[]; metricas: MetricaDiaRow[]; diagnostico: ItemDiagnosticoHoje[] },
): LinhaHoje {
  const { contas, config: cfg, anomalias, metricas, diagnostico } = fontes;
  const candidatos = new Map<TipoAlerta, Candidato>();
  const lidas = contas.filter((a) => a.account_status != null); // recém-vinculada, nunca sincronizada: sem dado
  const temAtiva = lidas.some((a) => a.account_status === 1 && !a.sync_error);

  if (contas.length === 0 && !c.meta_ad_account_id) {
    juntar(candidatos, {
      tipo: "conta", nivel: "info", titulo: "Sem conta de anúncio vinculada",
      detalhe: "Sem a conta no cadastro o painel não acompanha saldo nem resultado deste cliente", peso: 5,
    });
  }

  for (const a of lidas) {
    if (a.sync_error) {
      if (cfg?.alert_meta_erro === false) continue;
      juntar(candidatos, {
        tipo: "conta", nivel: "warning", titulo: "Leitura da Meta falhou",
        detalhe: "Saldo e gasto desta conta estão desatualizados até a próxima sincronização", peso: 10,
      });
      continue;
    }
    if (a.account_status !== 1) {
      if (cfg?.alert_erro_conta === false) continue;
      const st = metaAccountStatus(a.account_status);
      if (st.gravidade === "paused" && temAtiva) continue; // conta antiga encerrada ao lado de uma ativa não é problema
      const critico = st.gravidade === "critical";
      juntar(candidatos, {
        tipo: "conta", nivel: critico ? "critical" : "warning",
        titulo: st.gravidade === "paused" ? "Nenhuma conta de anúncio ativa" : `Conta: ${st.label.toLowerCase()}`,
        detalhe: `Conta ${st.frase} — os anúncios ${critico ? "podem parar" : "não estão rodando"}`,
        peso: critico ? 30 : 20,
      });
      continue;
    }

    // Conta ativa e lida: saldo e gasto.
    const disponivel = saldoEfetivo(a);
    const media = num(a.last_3d_avg_spend);
    const dias = disponivel !== null && disponivel > 0 && media && media > 0 ? disponivel / media : null;
    const alertaSaldo = cfg?.alert_verba_baixa !== false || cfg?.alert_verba_zerada !== false;
    const r = evaluateAccount({
      available: disponivel,
      monthlyBudget: num(a.monthly_budget),
      daysRemaining: dias,
      accountStatus: 1,
      warningThreshold: cfg?.alert_verba_baixa !== false ? (num(cfg?.verba_minima) ?? null) : null,
      isPrepaid: a.is_prepaid ?? undefined,
    }, { warningPct: e.ajustes.warningPct, criticalPct: e.ajustes.criticalPct });
    if (alertaSaldo && (r.severity === "critical" || r.severity === "warning")) {
      const cartao = a.is_prepaid === false;
      const dura = dias !== null ? ` · dura ~${plural(Math.max(0, Math.round(dias)), "dia", "dias")} no ritmo atual` : "";
      juntar(candidatos, {
        tipo: "saldo", nivel: r.severity,
        titulo: cartao ? "Verba do mês estourada" : r.severity === "critical" ? "Saldo acabando" : "Saldo baixo",
        detalhe: `${r.reason}${dura}`,
        peso: r.pctRemaining != null ? 100 - r.pctRemaining : 50,
      });
    }
    // Sem gasto com a conta ativa (0 lido de verdade — null é "não sei", não "zero").
    if (cfg?.alert_sem_gasto !== false && media === 0 && !(disponivel !== null && disponivel <= 0)) {
      juntar(candidatos, {
        tipo: "entrega", nivel: "warning", titulo: "Conta sem gasto",
        detalhe: "Nenhum gasto nos últimos 3 dias com a conta ativa", peso: 40,
      });
    }
  }

  // Queda de resultado (defense-scan): pior sintoma do cliente.
  const conhecidas = anomalias
    .filter((a) => a.metric && SINTOMA[a.metric] && (a.severity === "critical" || a.severity === "high"))
    .sort((x, y) => SINTOMA[x.metric!].ordem - SINTOMA[y.metric!].ordem || (x.severity === "critical" ? -1 : 1));
  if (conhecidas.length) {
    const pior = conhecidas[0];
    const outros = new Set(conhecidas.map((a) => a.metric)).size - 1;
    juntar(candidatos, {
      tipo: "entrega",
      nivel: conhecidas.some((a) => a.severity === "critical") ? "critical" : nivelDaAnomalia(pior.severity),
      titulo: SINTOMA[pior.metric!].texto(Number(pior.percent_change ?? 0)),
      detalhe: `Comparado com a média dos últimos 7 dias${outros > 0 ? ` · mais ${plural(outros, "sinal", "sinais")} caindo` : ""}`,
      peso: 60 - SINTOMA[pior.metric!].ordem * 5,
    });
  }

  // Diagnóstico diário: um problema por tipo (o de maior prioridade), com a contagem.
  const dicas: string[] = [];
  const porFuncao = agrupar(diagnostico, (d) => d.funcao);
  for (const [funcao, itens] of porFuncao) {
    const t = DIAGNOSTICO_TIPO[funcao];
    if (!t || funcao === "Anomalias") continue; // anomalia já veio acima, direto do anomaly_alerts
    const topo = [...itens].sort((a, b) => b.prioridade - a.prioridade)[0];
    if (t === "dica") { dicas.push(topo.achado); continue; }
    if (t.tipo === "entrega") {
      juntar(candidatos, {
        tipo: "entrega", nivel: t.nivel, titulo: "Não gastou ontem", detalhe: topo.achado, acao: topo.acao || undefined,
        peso: Math.min(100, topo.prioridade) / 2,
      });
      continue;
    }
    juntar(candidatos, {
      tipo: t.tipo, nivel: t.nivel, titulo: TITULO_DIAG[t.tipo]?.(itens.length) ?? funcao,
      detalhe: topo.achado, acao: topo.acao || undefined, peso: topo.prioridade,
    });
  }

  const problemas: ProblemaHoje[] = [...candidatos.values()]
    .map((p) => {
      const v = vistoDe(e.vistos, c.id, p.tipo, p.nivel, e.agora);
      return { ...p, visto: v ? infoDoVisto(v) : null };
    })
    .sort(compararProblemas);

  // Números: a conta principal é a ativa; sem ativa, a primeira lida.
  const principal = contas.find((a) => a.account_status === 1 && !a.sync_error) ?? lidas[0] ?? contas[0] ?? null;
  const ativa = !!principal && principal.account_status === 1 && !principal.sync_error;
  const saldo = principal && ativa ? saldoEfetivo(principal) : null;
  const media3d = principal ? num(principal.last_3d_avg_spend) : null;
  const numeros: NumerosHoje = {
    saldo,
    diasRestantes: saldo !== null && saldo > 0 && media3d && media3d > 0 ? saldo / media3d : null,
    cartao: principal?.is_prepaid === false,
    statusConta: !principal || principal.account_status == null ? null
      : principal.sync_error ? "Leitura falhou"
      : principal.account_status !== 1 ? metaAccountStatus(principal.account_status).label : null,
    gastoMedio3d: media3d,
    ...numerosDoDia(metricas, e.ontem),
  };

  const metaAccountId = principal?.meta_account_id || c.meta_ad_account_id || null;
  const gerenciador = linkGerenciador(metaAccountId);
  const linkCliente = `/clients/${c.id}?tab=resultados`;
  const gestor = e.canon(c.assigned_traffic) ?? (c.assigned_traffic?.trim() || null);

  return {
    clientId: c.id,
    nome: nomeDoCliente(c),
    logo: logoDoCliente({ logo: c.logo, docLogo: c.doc_logo }),
    gestor,
    meu: !!e.eu && mesmaPessoa(gestor, e.eu),
    metaAccountId,
    linkConta: gerenciador ?? linkCliente,
    linkContaExterno: !!gerenciador,
    linkCliente,
    problemas,
    dicas,
    numeros,
    estado: estadoDaLinha(problemas),
  };
}

// ── Tudo ────────────────────────────────────────────────────────────────────

export function montarLinhas(e: EntradaHoje): LinhaHoje[] {
  const ocultas = new Set(e.ajustes.contasOcultas);
  const contas = agrupar(
    e.contas.filter((a) => !ocultas.has(a.id) && !(a.meta_account_id && ocultas.has(a.meta_account_id))),
    (a) => a.client_id,
  );
  const configs = new Map(e.configs.map((x) => [x.client_id, x]));
  const anomalias = agrupar(e.anomalias, (a) => a.client_id);
  const metricas = agrupar(e.metricas, (m) => m.client_id);
  const diagnostico = agrupar(e.diagnostico, (d) => d.clientId);

  return e.clientes
    .filter((c) => clienteDoHoje(c, e.agora))
    .map((c) => montarLinha(c, e, {
      contas: contas.get(c.id) ?? [],
      config: configs.get(c.id),
      anomalias: anomalias.get(c.id) ?? [],
      metricas: metricas.get(c.id) ?? [],
      diagnostico: diagnostico.get(c.id) ?? [],
    }))
    .sort(compararLinhas);
}

/** Ajustes padrão (agency_settings ausente). */
export const AJUSTES_PADRAO = {
  warningPct: DEFAULT_ALERT_CONFIG.warningPct,
  criticalPct: DEFAULT_ALERT_CONFIG.criticalPct,
  contasOcultas: [] as string[],
};
