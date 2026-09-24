// lib/trafego/mudancas.ts — "O QUE MUDOU ONTEM" (Leva 7A, N2). Regras puras.
//
// PRA QUE: responder "o que mexeram?" quando o resultado de um cliente muda de um dia pro outro —
// alguém subiu o orçamento, pausou um conjunto, a Meta reprovou uma campanha. A Meta não guarda esse
// histórico de um jeito que o time consulte fácil; então o servidor tira um RETRATO por dia do estado
// de cada campanha e conjunto (status + orçamento) logo depois da meia-noite (job estado-campanhas,
// tabela meta_campaign_estado) e esta tela compara dois retratos seguidos.
//
// Retrato do dia D = estado no começo de D (≈ fim de D-1). "O que mudou ontem" = retrato de hoje ×
// retrato de ontem. Só leitura: nada aqui altera a conta.
//
// Testado em tests/trafego-mudancas.test.ts.

export type NivelEstado = "campaign" | "adset";

export interface EstadoEntidade {
  client_id: string;
  nivel: NivelEstado;
  entity_id: string;
  entity_name: string | null;
  /** Campanha-mãe (no conjunto); na campanha, o próprio id. */
  campaign_id?: string | null;
  campaign_name: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  updated_time?: string | null;
}

export type TipoMudanca = "orcamento" | "ligou" | "pausou" | "entrega" | "nova" | "saiu";

export interface Mudanca {
  tipo: TipoMudanca;
  nivel: NivelEstado;
  entityId: string;
  nome: string;
  /** Campanha-mãe (para conjunto). */
  campanha: string | null;
  /** Frase pronta: "Orçamento diário R$ 50 → R$ 80 (+60%)". */
  texto: string;
  /** Variação do orçamento em % (orcamento). */
  variacaoPct?: number | null;
  /** Hora da última alteração na Meta, quando cai no dia comparado. */
  horaMeta?: string | null;
  /** Peso para ordenar: status/entrega antes de orçamento; aumento grande antes de pequeno. */
  peso: number;
}

const ATIVO = new Set(["ACTIVE"]);
const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (a > 0 ? Math.round(((b - a) / a) * 100) : null);

/** Status da Meta em português (o que o gestor lê no Gerenciador). */
export function statusPt(s: string | null | undefined): string {
  const m: Record<string, string> = {
    ACTIVE: "ativa", PAUSED: "pausada", CAMPAIGN_PAUSED: "campanha pausada", ADSET_PAUSED: "conjunto pausado",
    DISAPPROVED: "reprovada", WITH_ISSUES: "com problema", PENDING_REVIEW: "em análise", IN_PROCESS: "processando",
    PENDING_BILLING_INFO: "sem pagamento", PREAPPROVED: "pré-aprovada", ARCHIVED: "arquivada", DELETED: "excluída",
  };
  return m[s ?? ""] ?? (s ?? "—").toLowerCase();
}

function horaNoDia(iso: string | null | undefined, dia: string | null): string | null {
  if (!iso || !dia) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const diaSP = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (diaSP !== dia) return null;
  return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

/**
 * Compara dois retratos. `diaAlterado` = o dia em que as mudanças aconteceram (ontem), para mostrar a
 * hora da alteração quando a Meta diz que a entidade mudou naquele dia.
 */
export function compararEstados(antes: EstadoEntidade[], depois: EstadoEntidade[], diaAlterado: string | null = null): Mudanca[] {
  const mapaAntes = new Map(antes.map((e) => [e.entity_id, e]));
  const mapaDepois = new Map(depois.map((e) => [e.entity_id, e]));
  const out: Mudanca[] = [];
  const nomeDe = (e: EstadoEntidade) => e.entity_name || e.entity_id;
  const onde = (e: EstadoEntidade) => (e.nivel === "campaign" ? "Campanha" : "Conjunto");
  // Concordância: a campanha, o conjunto.
  const g = (e: EstadoEntidade, fem: string, masc: string) => (e.nivel === "campaign" ? fem : masc);

  for (const d of depois) {
    const a = mapaAntes.get(d.entity_id);
    const base = { nivel: d.nivel, entityId: d.entity_id, nome: nomeDe(d), campanha: d.nivel === "adset" ? d.campaign_name : null, horaMeta: horaNoDia(d.updated_time, diaAlterado) };
    if (!a) {
      // Entidade nova só interessa se nasceu no ar ou com orçamento — conjunto pausado antigo que
      // voltou a aparecer na leitura não é notícia.
      if (ATIVO.has(d.status ?? "")) {
        const orc = d.daily_budget ? ` · ${brl0(d.daily_budget)}/dia` : d.lifetime_budget ? ` · ${brl0(d.lifetime_budget)} no total` : "";
        out.push({ ...base, tipo: "nova", texto: `${onde(d)} ${g(d, "nova", "novo")} no ar${orc}`, peso: 60 });
      }
      continue;
    }
    // Status que a pessoa escolhe (ligar/pausar).
    if ((a.status ?? "") !== (d.status ?? "")) {
      const ligou = ATIVO.has(d.status ?? "");
      const pausou = ATIVO.has(a.status ?? "") && !ligou;
      if (ligou || pausou) {
        out.push({ ...base, tipo: ligou ? "ligou" : "pausou", texto: `${onde(d)} ${ligou ? g(d, "ativada", "ativado") : g(d, "pausada", "pausado")}`, peso: ligou ? 70 : 90 });
      } else {
        out.push({ ...base, tipo: "entrega", texto: `${onde(d)}: ${statusPt(a.status)} → ${statusPt(d.status)}`, peso: 50 });
      }
    } else if ((a.effective_status ?? "") !== (d.effective_status ?? "") && ATIVO.has(d.status ?? "")) {
      // Ligada, mas a Meta mudou a entrega (reprovou, pediu revisão, voltou a rodar).
      const piorou = !ATIVO.has(d.effective_status ?? "");
      out.push({ ...base, tipo: "entrega", texto: `${onde(d)} ${piorou ? `parou de entregar (${statusPt(d.effective_status)})` : "voltou a entregar"}`, peso: piorou ? 85 : 40 });
    }
    // Orçamento (diário ou total).
    for (const campo of ["daily_budget", "lifetime_budget"] as const) {
      const va = a[campo] ?? 0, vd = d[campo] ?? 0;
      if (Math.abs(va - vd) < 0.5) continue;
      const p = pct(va, vd);
      const rotulo = campo === "daily_budget" ? "Orçamento diário" : "Orçamento total";
      const sufixo = campo === "daily_budget" ? "/dia" : "";
      const texto = va === 0
        ? `${rotulo} definido: ${brl0(vd)}${sufixo}`
        : vd === 0
          ? `${rotulo} removido (era ${brl0(va)}${sufixo})`
          : `${rotulo} ${brl0(va)} → ${brl0(vd)}${sufixo}${p != null ? ` (${p > 0 ? "+" : ""}${p}%)` : ""}`;
      out.push({ ...base, tipo: "orcamento", texto: `${texto}`, variacaoPct: p, peso: 20 + Math.min(40, Math.abs(p ?? 0) / 5) });
    }
  }
  // Sumiu da leitura (arquivada/excluída) e estava no ar: alguém tirou do ar.
  for (const a of antes) {
    if (mapaDepois.has(a.entity_id) || !ATIVO.has(a.status ?? "")) continue;
    out.push({
      tipo: "saiu", nivel: a.nivel, entityId: a.entity_id, nome: nomeDe(a), campanha: a.nivel === "adset" ? a.campaign_name : null,
      texto: `${onde(a)} saiu do ar (${g(a, "arquivada ou excluída", "arquivado ou excluído")})`, peso: 80,
    });
  }
  return out.sort((x, y) => y.peso - x.peso || x.nome.localeCompare(y.nome));
}

/** Soma do orçamento diário ATIVO (campanhas com CBO + conjuntos com orçamento próprio). */
export function orcamentoDiarioAtivo(estado: EstadoEntidade[]): number {
  const campanhasAtivas = new Set(estado.filter((e) => e.nivel === "campaign" && ATIVO.has(e.status ?? "")).map((e) => e.entity_id));
  let total = 0;
  for (const e of estado) {
    if (!ATIVO.has(e.status ?? "") || !e.daily_budget) continue;
    if (e.nivel === "campaign") total += e.daily_budget;
    else if (!e.campaign_id || campanhasAtivas.has(e.campaign_id)) total += e.daily_budget;
  }
  return total;
}

// ─── O que a rota /api/trafego/mudancas devolve ─────────────────────────────

export interface ClienteMudancas {
  clientId: string;
  nome: string;
  gestor: string | null;
  mudancas: Mudanca[];
  /** Orçamento diário ativo (campanhas CBO + conjuntos) antes e depois. */
  orcamentoAntes: number;
  orcamentoDepois: number;
}

export interface RespostaMudancas {
  /** false = a tabela meta_campaign_estado ainda não existe (migração pendente). */
  disponivel: boolean;
  /** Retrato comparado (o mais novo) e o anterior. antes=null → só há um retrato ainda. */
  depois: string | null;
  antes: string | null;
  clientes: ClienteMudancas[];
  /** Clientes com retrato nos dois dias e nada mudou. */
  semMudanca: number;
}
