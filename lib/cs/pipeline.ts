// lib/cs/pipeline.ts
// ─────────────────────────────────────────────────────────────────────────────
// O CONTRATO DO MOTOR DE DECISÃO — "LONE MARKETING OS"
//
// Isto é a espinha dorsal que separa DECIDIR de EXECUTAR. Hoje cada gerador
// (legenda, roteiro, pauta) decide E executa numa chamada só, sem deixar rastro.
// Aqui a decisão vira um OBJETO estruturado, persistível e auditável, e os
// geradores passam a ser EXECUTORES de uma decisão — não decisores.
//
// Regra da metodologia: todo módulo de conteúdo consome/produz estes tipos.
// É assim que "todos os módulos seguem a metodologia" deixa de ser copiar prompt
// e vira lei do código. Ver docs/lone-marketing-os.md.
//
// ⚠️ CONTRATO (tipos + assinaturas). NÃO implementa nada ainda — a Fase 3 (calendário)
//    é o primeiro módulo a rodar o pipeline inteiro. Este arquivo é inerte por design.
// ─────────────────────────────────────────────────────────────────────────────

// ── Vocabulário estratégico compartilhado ───────────────────────────────────

/** Os 3 pilares. O mix-alvo (60/25/15 ajustável) é decidido por período. */
export type Pilar = "autoridade" | "aproximacao" | "comercial";

/** Objetivo estratégico de UMA peça. Toda peça tem exatamente um. */
export type ObjetivoConteudo =
  | "autoridade" | "educacao" | "relacionamento" | "prova_social" | "humanizacao"
  | "desejo" | "quebra_objecao" | "posicionamento" | "venda" | "reconhecimento";

/** Onde a peça atua no funil do público. */
export type PosicaoFunil = "topo" | "meio" | "fundo";

/** Formato da peça. String union frouxa (novos formatos entram sem migração de tipo). */
export type Formato = "carrossel" | "reel" | "post" | "story" | "video_longo" | (string & {});

/** Maturidade da marca — afeta o mix de pilares (marca nova precisa de + autoridade). */
export type MaturidadeMarca = "nova" | "em_crescimento" | "consolidada";

// ── Estágio 1 — DIAGNÓSTICO (por cliente, cacheado; recomputa quando o briefing muda) ──

export interface DiagnosticoEstrategico {
  clienteId: string;
  publico: { quemE: string; oQueSente: string; momento: string };
  dores: string[];            // dores REAIS do cliente do cliente (não o serviço)
  desejos: string[];          // o ganho que ele persegue
  objecoes: string[];         // o que trava a compra
  crencaAtual: string;        // no que o público acredita hoje
  crencaDesejada: string;     // no que precisamos que ele passe a acreditar
  diferenciais: string[];     // o que a marca tem de único e defensável
  angulosVsConcorrencia: string[]; // como fugir do post-padrão do nicho
  oportunidades: string[];    // brechas de conteúdo/posicionamento
  maturidadeMarca: MaturidadeMarca;
  geradoEm: string;           // ISO
  fonteBriefing?: string;     // versão/id do client_briefings que originou
}

// ── Estágio 2 — OBJETIVO DO PERÍODO + NARRATIVA (semana ou mês) ──────────────

export interface MixPilares { autoridade: number; aproximacao: number; comercial: number }

export interface ObjetivoPeriodo {
  clienteId: string;
  periodo: string;            // ex.: "2026-W31" (semana) ou "2026-08" (mês)
  objetivoPrincipal: string;  // o que a marca precisa PROVAR/mover neste período
  narrativa: string;          // o fio que costura as peças (tema do período)
  mixPilares: MixPilares;     // proporção-alvo (default 60/25/15, ajustada pela maturidade)
  baseadoEmDiagnostico: string; // referência ao diagnóstico
}

// ── Estágio 3 — DECISÃO POR PEÇA (o contrato central) ────────────────────────
// Isto é o que hoje NÃO existe em lugar nenhum. Nasce ANTES de qualquer copy/arte.

export interface DecisaoDeConteudo {
  clienteId: string;
  data: string;               // data do post (YYYY-MM-DD)
  formato: Formato;
  pilar: Pilar;
  objetivo: ObjetivoConteudo;
  posicaoFunil: PosicaoFunil;
  tema: string;               // título curto do que a peça trata
  angulo: string;             // a IDEIA central — o que a peça defende/prova
  dorAlvo: string;            // qual dor/desejo do público esta peça mira
  objecaoAlvo?: string;       // objeção que ela quebra (se aplicável)
  porQueAgora: string;        // JUSTIFICATIVA — por que esta peça, neste momento
  baseadoEmPeriodo?: string;  // referência ao ObjetivoPeriodo
}

/** Plano completo de um período: diagnóstico + objetivo + as decisões (1 por data). */
export interface PlanoDePeriodo {
  diagnostico: DiagnosticoEstrategico;
  objetivo: ObjetivoPeriodo;
  decisoes: DecisaoDeConteudo[];
}

// ── Estágio 5 — REVISÃO CRÍTICA (o portão que reprova e manda refazer) ───────
// Além de erro (coerência/dados/regras), avalia se a peça CUMPRE a decisão que a gerou.

export interface VereditoRevisao {
  aprovado: boolean;
  cumpriuObjetivo: boolean;   // a peça entrega o ObjetivoConteudo decidido?
  problemas: { area: string; gravidade: "alta" | "media" | "baixa"; detalhe: string; sugestao: string | null }[];
  resumo: string;
}

// ── Assinaturas dos estágios (o "motor"). Implementação = Fase 3. ────────────
// Deixar como tipos torna o contrato explícito: cada estágio tem entrada/saída fixa.

export type Diagnosticar = (clienteId: string) => Promise<DiagnosticoEstrategico>;
export type DefinirObjetivoPeriodo = (
  diag: DiagnosticoEstrategico, periodo: string, contexto?: { eventos?: string[] },
) => Promise<ObjetivoPeriodo>;
export type DecidirPecas = (
  obj: ObjetivoPeriodo, diag: DiagnosticoEstrategico, datas: string[],
) => Promise<DecisaoDeConteudo[]>;
/** EXECUTAR: os geradores atuais (legenda/roteiro/brief) recebem a decisão e produzem a peça. */
export type Executar<TSaida> = (decisao: DecisaoDeConteudo, contextoCliente: unknown) => Promise<TSaida>;
export type RevisarCriticamente = (peca: unknown, decisao: DecisaoDeConteudo) => Promise<VereditoRevisao>;

/** O pipeline inteiro de um período (o que a Fase 3 implementa e persiste). */
export type PlanejarPeriodo = (clienteId: string, periodo: string, datas: string[]) => Promise<PlanoDePeriodo>;

// ── Estágio 6 — APRENDIZADO (o loop que melhora o motor E o briefing) ────────
// O que faz o motor deixar de ser estático: ele vê o que deu certo, ouve o time e
// observa o mercado — e propõe enriquecer o briefing (versionado, human-gated).

/** De onde vem um aprendizado. */
export type FonteAprendizado = "performance" | "ensino_time" | "aprovacao_cliente" | "observacao";

/** Resultado observado de uma peça publicada — FECHA o elo decisão→resultado (o que a IA correlaciona pra aprender). */
export interface ResultadoPeca {
  cardId: string;
  clienteId: string;
  decisao?: DecisaoDeConteudo;   // a decisão que gerou a peça (pilar/objetivo/ângulo)
  salvamentos?: number; compartilhamentos?: number; comentarios?: number;
  curtidas?: number; alcance?: number;
  aprovadoCliente?: boolean; reworks?: number;
  medidoEm: string;              // ISO
}

/** Um sinal que retroalimenta o motor (vira regra / ajusta mix / afina ângulo). */
export interface SinalAprendizado {
  clienteId: string;
  fonte: FonteAprendizado;
  conteudo: string;              // o que foi aprendido (ex.: "ângulo erro-comum salva muito")
  referencia?: string;           // cardId, id de regra, post…
  registradoEm: string;          // ISO
}

/** Proposta do CURADOR de briefing — enriquecimento SUGERIDO ao time (nunca aplica sozinho). */
export interface PropostaBriefing {
  clienteId: string;
  campo: string;                 // campo do briefing a enriquecer (ex.: "desejos", "ganchos", "produtos_destaque_atual")
  sugestao: string;              // o que adicionar/ajustar
  justificativa: string;         // por que — baseado em qual sinal
  fonte: FonteAprendizado;
}

/** Registra o resultado de uma peça publicada (liga decisão↔desempenho). */
export type RegistrarResultado = (r: ResultadoPeca) => Promise<void>;
/** O CURADOR: olha os sinais do período e propõe melhorias no briefing (o time aprova → nova versão). */
export type Curar = (clienteId: string, sinais: SinalAprendizado[]) => Promise<PropostaBriefing[]>;
