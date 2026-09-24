// lib/goals/catalogo.ts — AS METAS DO TIME, LIGADAS A MÉTRICAS REAIS (N33, Leva 7D). PURO.
//
// POR QUE EXISTE. A tela Metas & OKRs calculava no NAVEGADOR, sobre o mês corrente pela metade, e
// parte dos números vinha de mock (useOKRMetrics lia mockAdCampaigns: ROAS, investimento e leads de
// campanha inventada). O "histórico" era um snapshot no localStorage com baseline escrito no código.
//
// Agora cada meta é uma métrica com FONTE no banco, calculada no SERVIDOR sobre o MÊS FECHADO, e o
// fechamento de cada mês fica gravado (goal_results) — histórico de verdade, igual para todo mundo.
// O mês corrente aparece só como parcial.
//
// Regras deste catálogo:
//   · métrica sem fonte devolve null com o porquê — nunca 0 (zero é medição, null é "não sei");
//   · NENHUMA meta de faturamento da agência (MRR, receita, contrato) — regra do CEO. Custo por
//     conversa é dinheiro do CLIENTE na Meta, não da agência;
//   · o alvo vem da tabela `okrs` (por trimestre, pela chave — ou pela chave antiga da tela velha);
//     sem linha, vale o alvo padrão daqui.
//
// Quem calcula: lib/goals/calculos.ts (puro) + lib/goals/calcular-server.ts (banco).

export type Equipe = "empresa" | "trafego" | "social" | "design";
export type Sentido = "maior" | "menor";

export interface MetaCatalogo {
  chave: string;
  titulo: string;
  equipe: Equipe;
  /** Sufixo curto para a tela ("%", "R$" vai antes). */
  unidade: "%" | "R$" | "pts" | "clientes" | "posts" | "artes" | "conversas";
  sentido: Sentido;
  alvoPadrao: number;
  casas: number;
  /** De onde vem o número, em uma linha (aparece na tela). */
  fonte: string;
  /** metric_key da tela antiga que quer dizer a mesma coisa (o alvo gravado continua valendo). */
  chavesAntigas?: readonly string[];
}

export const EQUIPES: readonly { id: Equipe; rotulo: string; team: string }[] = [
  { id: "empresa", rotulo: "Empresa", team: "company" },
  { id: "trafego", rotulo: "Tráfego", team: "traffic" },
  { id: "social", rotulo: "Social Media", team: "social" },
  { id: "design", rotulo: "Design", team: "design" },
];

export const METAS: readonly MetaCatalogo[] = [
  // ── Empresa ────────────────────────────────────────────────────────────────
  { chave: "clientes_ativos", titulo: "Clientes ativos no fim do mês", equipe: "empresa", unidade: "clientes", sentido: "maior",
    alvoPadrao: 40, casas: 0, chavesAntigas: ["active_clients"],
    fonte: "Cadastro: entrou até o fim do mês e não saiu (churned_at)" },
  { chave: "novos_clientes", titulo: "Clientes novos no mês", equipe: "empresa", unidade: "clientes", sentido: "maior",
    alvoPadrao: 3, casas: 0, chavesAntigas: ["new_clients"],
    fonte: "Cadastro: data de entrada (join_date, ou criação) no mês" },
  { chave: "churn_pct", titulo: "Churn do mês", equipe: "empresa", unidade: "%", sentido: "menor",
    alvoPadrao: 5, casas: 1, chavesAntigas: ["churn_rate"],
    fonte: "Saídas no mês (churned_at) ÷ clientes ativos no começo do mês" },
  { chave: "nps_clientes", titulo: "NPS dos clientes", equipe: "empresa", unidade: "pts", sentido: "maior",
    alvoPadrao: 70, casas: 0,
    fonte: "Notas de 0 a 10 respondidas no grupo depois da reunião (% promotores − % detratores)" },
  { chave: "clientes_em_risco_pct", titulo: "Clientes em risco", equipe: "empresa", unidade: "%", sentido: "menor",
    alvoPadrao: 10, casas: 0,
    fonte: "Última nota de saúde do mês de cada cliente (client_health_scores), nível \"em risco\"" },
  // ── Tráfego ────────────────────────────────────────────────────────────────
  { chave: "conversas_mes", titulo: "Conversas geradas pelos anúncios", equipe: "trafego", unidade: "conversas", sentido: "maior",
    alvoPadrao: 500, casas: 0, chavesAntigas: ["leads_month"],
    fonte: "Meta Ads, uma leitura por conta e dia (metric_snapshots sem repetição)" },
  { chave: "custo_por_conversa", titulo: "Custo por conversa", equipe: "trafego", unidade: "R$", sentido: "menor",
    alvoPadrao: 15, casas: 2, chavesAntigas: ["cpl"],
    fonte: "Investido pelos clientes na Meta ÷ conversas (mesma leitura)" },
  // ── Social ─────────────────────────────────────────────────────────────────
  { chave: "posts_publicados", titulo: "Posts publicados no Instagram", equipe: "social", unidade: "posts", sentido: "maior",
    alvoPadrao: 96, casas: 0, chavesAntigas: ["posts_delivered"],
    fonte: "Posts reais no perfil dos clientes (client_ig_posts), não card arrastado" },
  { chave: "entrega_contratada_pct", titulo: "Entrega do contratado", equipe: "social", unidade: "%", sentido: "maior",
    alvoPadrao: 100, casas: 0,
    fonte: "Posts no ar ÷ posts contratados (meta do cliente, ou 12/mês = seg/qua/sex), cliente com social e Instagram o mês todo" },
  { chave: "posts_no_prazo_pct", titulo: "Posts no dia planejado", equipe: "social", unidade: "%", sentido: "maior",
    alvoPadrao: 90, casas: 0,
    fonte: "Post que casou com um card e saiu no dia planejado ou antes (mesma regra do \"No ar\")" },
  { chave: "reunioes_mes_pct", titulo: "Clientes com reunião no mês", equipe: "social", unidade: "%", sentido: "maior",
    alvoPadrao: 90, casas: 0,
    fonte: "Reuniões marcadas como realizadas no mês ÷ clientes ativos o mês todo" },
  // ── Design ─────────────────────────────────────────────────────────────────
  { chave: "artes_entregues", titulo: "Artes entregues", equipe: "design", unidade: "artes", sentido: "maior",
    alvoPadrao: 100, casas: 0,
    fonte: "Entregas registradas no mês (creative_deliveries, cada versão conta uma vez)" },
  { chave: "artes_no_prazo_pct", titulo: "Artes no prazo", equipe: "design", unidade: "%", sentido: "maior",
    alvoPadrao: 90, casas: 0, chavesAntigas: ["on_time_pct"],
    fonte: "Primeira entrega da arte até a data de postagem do card" },
  { chave: "retrabalho_pct", titulo: "Artes que voltaram para ajuste", equipe: "design", unidade: "%", sentido: "menor",
    alvoPadrao: 20, casas: 0,
    fonte: "Entregas do mês que são 2ª versão ou depois ÷ entregas do mês" },
];

const POR_CHAVE = new Map(METAS.map((m) => [m.chave, m]));

export function metaPorChave(chave: string): MetaCatalogo | undefined {
  return POR_CHAVE.get(chave);
}

/** A meta do catálogo a que uma metric_key (nova ou da tela antiga) se refere. */
export function metaDaChaveGravada(metricKey: string | null | undefined): MetaCatalogo | undefined {
  if (!metricKey) return undefined;
  return POR_CHAVE.get(metricKey) ?? METAS.find((m) => m.chavesAntigas?.includes(metricKey));
}

// ─── Alvos gravados (tabela okrs) ──────────────────────────────────────────

export interface LinhaOkr { id: string; metric_key: string | null; target: number | string | null; quarter: string | null }

/** Alvo de cada meta num trimestre: a linha da okrs (chave nova vence a antiga). Sem linha = padrão. */
export function alvosDoTrimestre(linhas: readonly LinhaOkr[]): Map<string, { alvo: number; okrId: string }> {
  const out = new Map<string, { alvo: number; okrId: string; nova: boolean }>();
  for (const l of linhas) {
    const meta = metaDaChaveGravada(l.metric_key);
    const alvo = l.target == null || l.target === "" ? NaN : Number(l.target);
    if (!meta || !Number.isFinite(alvo)) continue;
    const nova = l.metric_key === meta.chave;
    const atual = out.get(meta.chave);
    if (!atual || (nova && !atual.nova)) out.set(meta.chave, { alvo, okrId: l.id, nova });
  }
  return new Map([...out].map(([k, x]) => [k, { alvo: x.alvo, okrId: x.okrId }]));
}

// ─── Meses ─────────────────────────────────────────────────────────────────

/** "YYYY-MM" somado de n meses. */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** O último mês que já acabou (em relação a `hoje`, YYYY-MM-DD de São Paulo). */
export function mesFechado(hoje: string): string {
  return somarMeses(hoje.slice(0, 7), -1);
}

/** Os `n` meses fechados até `mes` (inclusive), do mais antigo para o mais novo. */
export function mesesAte(mes: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarMeses(mes, i - n + 1));
}

/** "2026-Q3" — a chave de trimestre da tabela okrs. */
export function trimestreDo(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${a}-Q${Math.ceil(m / 3)}`;
}

export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split("-").map(Number);
  return { inicio: `${mes}-01`, fim: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) };
}

export function mesValido(mes: string | null | undefined): mes is string {
  return !!mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "agosto de 2026" */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** "ago/26" */
export function mesCurto(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`;
}

// ─── Avaliação ─────────────────────────────────────────────────────────────

export type StatusMeta = "batida" | "perto" | "longe" | "sem_dado";

export const ROTULO_STATUS: Record<StatusMeta, string> = {
  batida: "Batida",
  perto: "Perto",
  longe: "Longe",
  sem_dado: "Sem dado",
};

/**
 * Quanto da meta foi feito (0–100) e o status.
 *   maior é melhor: valor ÷ alvo;   menor é melhor: alvo ÷ valor (valor 0 com alvo > 0 = batida).
 * Batida ≥ 100%; perto ≥ 80%; longe abaixo disso. Sem valor ou sem alvo: sem dado.
 */
export function avaliarMeta(valor: number | null | undefined, alvo: number | null | undefined, sentido: Sentido): { progresso: number | null; status: StatusMeta } {
  if (valor == null || !Number.isFinite(valor) || alvo == null || !Number.isFinite(alvo)) return { progresso: null, status: "sem_dado" };
  let razao: number;
  if (sentido === "maior") {
    if (alvo <= 0) return { progresso: 100, status: "batida" };
    razao = valor / alvo;
  } else {
    if (valor <= 0) return { progresso: 100, status: "batida" };
    razao = alvo / valor;
  }
  const progresso = Math.max(0, Math.min(100, Math.round(razao * 100)));
  return { progresso, status: razao >= 1 ? "batida" : razao >= 0.8 ? "perto" : "longe" };
}

/** O número pronto para a tela ("12,5%", "R$ 14,20", "38 clientes"). null → "—". */
export function formatarValorMeta(meta: Pick<MetaCatalogo, "unidade" | "casas">, valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  const n = valor.toLocaleString("pt-BR", { minimumFractionDigits: meta.unidade === "R$" ? 2 : 0, maximumFractionDigits: meta.casas });
  if (meta.unidade === "R$") return `R$ ${n}`;
  if (meta.unidade === "%") return `${n}%`;
  if (meta.unidade === "pts") return n;
  return n;
}
