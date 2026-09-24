// lib/saude/carteira.ts — "ESTE CLIENTE ESTÁ EM RISCO?" numa resposta só. PURO.
//
// POR QUE ISTO EXISTE (Leva 6A, set/2026). Havia ~9 respostas diferentes para a mesma pergunta:
// Termômetro de Churn (nota de saúde), Jornada CS (risco próprio com "crítico" por atenção e
// reclamação), Carteira (faturamento do cliente caindo), o filtro "Em Risco" de Clientes e o badge do
// menu (resultado do ANÚNCIO — CPL x meta — que não é risco de churn), a Área CEO (pontuação local
// de status + kanban + posts), o selo "Cliente em risco" no quadro de produção (de novo o anúncio), o
// aviso semanal cs-risco-semanal e o Início. Um mesmo cliente aparecia "em risco" numa tela e
// "saudável" na outra.
//
// A resposta única, daqui para a frente:
//   • NÍVEL  = o do escritor único /api/scores (clients.current_health_level, 100 = saudável). Sem
//              cache confiável, a faixa da nota (lib/scores/health.ts → nivelDaSaude).
//   • EM RISCO = nível "risco". Só isso. Resultado de anúncio ruim é outra pergunta (Tráfego).
//   • PEDE ATENÇÃO = risco, atenção, ou cliente calado no grupo há 7+ dias (esfriando) — a mesma regra
//              do aviso semanal (lib/cs/risco-semanal.ts) e do feed do Início (lib/inicio/regras.ts).
//   • PORQUÊ  = esfriando primeiro, depois os motivos gravados no breakdown da nota (motivosDoCliente).
//
// Quem lê daqui: a tela Saúde da carteira (/saude), o filtro "Em Risco" de Clientes e o badge do
// menu, a Área CEO, o cockpit do CEO, o selo do quadro de produção, a importância do cliente no feed
// de prioridades e a ficha de relacionamento (lib/cs/jornada.ts). Mudou a regra? Muda AQUI.

import { nivelDaSaude, ROTULO_NIVEL_SAUDE, type NivelSaude } from "@/lib/scores/health";
import { entraNaSemana, esfriou, motivosDoCliente, DIAS_ESFRIANDO, type ClienteSemana } from "@/lib/cs/risco-semanal";

export { DIAS_ESFRIANDO };

/** Quem abre a Saúde da carteira: os papéis que viam Termômetro, Jornada CS e Carteira no menu. */
export const PAPEIS_SAUDE = ["admin", "manager", "social"] as const;

const NIVEIS: readonly NivelSaude[] = ["saudavel", "atencao", "risco", "sem_dado"];
const DIA_MS = 86_400_000;
const sem = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// ─── Nível ──────────────────────────────────────────────────────────────────

/** A linha do cliente como vem do banco (snake_case) ou do store do navegador (camelCase). */
export interface ClienteComSaude {
  current_health_level?: string | null;
  current_health_score?: number | string | null;
  currentHealthLevel?: string | null;
  currentHealthScore?: number | null;
}

/** A nota do escritor único, ou null quando não há (ou não é número). */
export function scoreDoCliente(c: ClienteComSaude | null | undefined): number | null {
  const bruto = c?.current_health_score ?? c?.currentHealthScore ?? null;
  if (bruto === null || bruto === undefined || bruto === "") return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

/**
 * O nível de saúde do cliente. Cache do escritor único quando é um nível da escala nova; senão, a
 * faixa da nota (um nível da escala antiga, tipo "critical", não é confiado).
 */
export function nivelDoCliente(c: ClienteComSaude | null | undefined): NivelSaude {
  const cache = c?.current_health_level ?? c?.currentHealthLevel ?? null;
  if (cache && (NIVEIS as readonly string[]).includes(cache)) return cache as NivelSaude;
  return nivelDaSaude(scoreDoCliente(c));
}

/** A pergunta do título. Toda tela que diz "em risco" responde com esta função. */
export function emRisco(c: ClienteComSaude | null | undefined): boolean {
  return nivelDoCliente(c) === "risco";
}

/**
 * Dias desde a última fala do cliente no grupo. null = não dá para afirmar (nunca falou, ou o agente
 * está desligado no grupo — mesma regra do cs-esfriando, do aviso semanal e do Início).
 */
export function diasQuietoDoCliente(
  c: { last_client_msg_at?: string | null; agente_ativo?: boolean | null; lastClientMsgAt?: string | null; agenteAtivo?: boolean | null },
  agoraMs: number,
): number | null {
  const ultima = c.last_client_msg_at ?? c.lastClientMsgAt ?? null;
  const agente = c.agente_ativo ?? c.agenteAtivo ?? null;
  if (!ultima || agente === false) return null;
  const t = new Date(ultima).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((agoraMs - t) / DIA_MS));
}

// ─── Situação (nível + porquê + severidade) ─────────────────────────────────

export type Severidade = "critical" | "warning";

export interface EntradaSituacao {
  nivel: NivelSaude;
  score: number | null;
  /** breakdown.motivos da última nota gravada — já em frase. */
  motivos?: string[];
  diasQuieto: number | null;
  /** % do peso da nota que foi medido (breakdown.cobertura). Explica o "sem dado". */
  cobertura?: number | null;
  /** Pausado continua na carteira, mas não gera cobrança nenhuma. */
  pausado?: boolean;
}

export interface SituacaoSaude {
  nivel: NivelSaude;
  score: number | null;
  diasQuieto: number | null;
  esfriando: boolean;
  /** Risco, atenção ou esfriando (e não pausado). É quem entra na fila. */
  pedeAtencao: boolean;
  /** Mesma severidade do Início: risco = agir hoje; atenção/esfriando = esta semana. */
  severidade: Severidade | null;
  /** Os 2–3 porquês, na ordem de quem lê: esfriando primeiro, depois o que a nota apontou. */
  motivos: string[];
  pausado: boolean;
}

export function situacaoDaSaude(e: EntradaSituacao): SituacaoSaude {
  const cs: ClienteSemana = {
    cliente: "", dono: null, nivel: e.nivel, score: e.score, motivos: (e.motivos ?? []).filter(Boolean), diasQuieto: e.diasQuieto,
  };
  const pausado = !!e.pausado;
  const pedeAtencao = !pausado && entraNaSemana(cs);
  const motivos = motivosDoCliente(cs);
  if (!motivos.length && e.nivel === "sem_dado") {
    motivos.push(e.cobertura != null && e.cobertura > 0
      ? `só ${Math.round(e.cobertura)}% dos sinais medidos — pouco para dar nota`
      : "sem conversa no grupo nem entregas medidas para dar nota");
  }
  return {
    nivel: e.nivel,
    score: e.score,
    diasQuieto: e.diasQuieto,
    esfriando: esfriou(cs),
    pedeAtencao,
    severidade: !pedeAtencao ? null : e.nivel === "risco" ? "critical" : "warning",
    motivos,
    pausado,
  };
}

/** Peso na fila: pior primeiro. Os três primeiros são os mesmos do aviso semanal. */
function pesoNaFila(s: Pick<SituacaoSaude, "nivel" | "pedeAtencao" | "pausado">): number {
  if (s.pedeAtencao) return s.nivel === "risco" ? 0 : s.nivel === "atencao" ? 1 : 2;
  if (s.pausado) return 5;
  return s.nivel === "sem_dado" ? 3 : 4;
}

/**
 * Ordem da fila: risco, atenção, só-esfriando, sem dado, saudável, pausado; dentro de cada faixa,
 * menor nota, depois mais tempo calado, depois o nome.
 */
export function compararSeveridade(
  a: Pick<SituacaoSaude, "nivel" | "pedeAtencao" | "pausado" | "score" | "diasQuieto"> & { nome: string },
  b: Pick<SituacaoSaude, "nivel" | "pedeAtencao" | "pausado" | "score" | "diasQuieto"> & { nome: string },
): number {
  return pesoNaFila(a) - pesoNaFila(b)
    || (a.score ?? 101) - (b.score ?? 101)
    || (b.diasQuieto ?? -1) - (a.diasQuieto ?? -1)
    || a.nome.localeCompare(b.nome, "pt-BR");
}

// ─── Distribuição e filtros ─────────────────────────────────────────────────

export interface DistribuicaoCarteira {
  total: number;
  risco: number;
  atencao: number;
  saudavel: number;
  semDado: number;
  /** Calados há 7+ dias (cruza com os níveis: um cliente em atenção pode estar esfriando). */
  esfriando: number;
  pedemAtencao: number;
}

export function distribuir(sits: readonly Pick<SituacaoSaude, "nivel" | "esfriando" | "pedeAtencao">[]): DistribuicaoCarteira {
  const conta = (n: NivelSaude) => sits.filter((s) => s.nivel === n).length;
  return {
    total: sits.length,
    risco: conta("risco"),
    atencao: conta("atencao"),
    saudavel: conta("saudavel"),
    semDado: conta("sem_dado"),
    esfriando: sits.filter((s) => s.esfriando).length,
    pedemAtencao: sits.filter((s) => s.pedeAtencao).length,
  };
}

export type FiltroNivel = "pedem_atencao" | "risco" | "atencao" | "esfriando" | "saudavel" | "sem_dado" | "todos";

export const FILTROS_NIVEL: readonly FiltroNivel[] = ["pedem_atencao", "risco", "atencao", "esfriando", "saudavel", "sem_dado", "todos"];

export const ROTULO_FILTRO_NIVEL: Record<FiltroNivel, string> = {
  pedem_atencao: "Pedem atenção",
  risco: ROTULO_NIVEL_SAUDE.risco,
  atencao: ROTULO_NIVEL_SAUDE.atencao,
  esfriando: "Esfriando",
  saudavel: ROTULO_NIVEL_SAUDE.saudavel,
  sem_dado: "Sem dado",
  todos: "Todos os níveis",
};

export function passaNoFiltro(s: Pick<SituacaoSaude, "nivel" | "esfriando" | "pedeAtencao">, f: FiltroNivel): boolean {
  switch (f) {
    case "pedem_atencao": return s.pedeAtencao;
    case "esfriando": return s.esfriando;
    case "todos": return true;
    default: return s.nivel === f;
  }
}

/** Aceita o que vier na URL (inclusive os nomes antigos) e devolve um filtro válido. */
export function filtroDaUrl(v: string | null | undefined): FiltroNivel | null {
  const t = sem(v).replace(/[\s-]+/g, "_");
  if (!t) return null;
  if ((FILTROS_NIVEL as readonly string[]).includes(t)) return t as FiltroNivel;
  // Endereços antigos: /clients?filter=at_risk e a Jornada ("critico" era o nível acima de risco).
  if (t === "at_risk" || t === "em_risco" || t === "critico") return "risco";
  return null;
}

// ─── Tendência (sparkline de 14 dias) ───────────────────────────────────────

export type Tendencia = "piorando" | "melhorando" | "estavel";

/** Primeira × última nota da série. Menos de 2 pontos = sem tendência. 100 = saudável: cair é piorar. */
export function tendenciaDaSerie(scores: readonly number[], limiar = 5): { tendencia: Tendencia; delta: number } | null {
  const xs = scores.filter((n) => Number.isFinite(n));
  if (xs.length < 2) return null;
  const delta = Math.round(xs[xs.length - 1] - xs[0]);
  return { tendencia: delta > limiar ? "melhorando" : delta < -limiar ? "piorando" : "estavel", delta };
}

// ─── Dono e jornada ─────────────────────────────────────────────────────────

/** Dono do relacionamento: o social da conta; cliente só de tráfego cai no tráfego (aviso semanal). */
export function donoDoCliente(c: { assigned_social?: string | null; assigned_traffic?: string | null }): string | null {
  return (c.assigned_social ?? "").trim() || (c.assigned_traffic ?? "").trim() || null;
}

/** "Meus": sou o social ou o tráfego do cliente (os dois donos do relacionamento no Início). */
export function ehDaPessoa(c: { social?: string | null; trafego?: string | null; dono?: string | null }, nome: string | null | undefined): boolean {
  const eu = sem(nome);
  if (!eu) return false;
  return [c.social, c.trafego, c.dono].some((n) => sem(n) === eu);
}

/** Etapa da jornada do cliente (a vista "Jornada" da tela). Override manual vence o derivado. */
export type EtapaJornada = "onboarding" | "ativo" | "acompanhamento" | "atencao" | "risco" | "renovacao";

export const ETAPAS_JORNADA: readonly EtapaJornada[] = ["onboarding", "ativo", "acompanhamento", "atencao", "risco", "renovacao"];

export const ROTULO_ETAPA: Record<EtapaJornada, string> = {
  onboarding: "Onboarding",
  ativo: "Ativo",
  acompanhamento: "Acompanhamento",
  atencao: "Atenção",
  risco: "Risco",
  renovacao: "Renovação",
};

/** O que a ficha de relacionamento grava em client_journey.estado (com acento, como sempre foi). */
export const ESTADO_GRAVADO: Record<EtapaJornada, string> = {
  onboarding: "onboarding", ativo: "ativo", acompanhamento: "acompanhamento",
  atencao: "atenção", risco: "risco", renovacao: "renovação",
};

export function etapaDaJornada(
  c: { status?: string | null; estadoManual?: string | null },
  s: Pick<SituacaoSaude, "nivel" | "pedeAtencao">,
): EtapaJornada {
  const manual = sem(c.estadoManual);
  const doManual = ETAPAS_JORNADA.find((e) => e === manual || sem(ESTADO_GRAVADO[e]) === manual);
  if (doManual) return doManual;
  if (c.status === "onboarding") return "onboarding";
  if (s.nivel === "risco") return "risco";
  if (s.pedeAtencao) return "atencao";
  return "ativo";
}
