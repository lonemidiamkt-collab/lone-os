// lib/priority/tipos.ts — a RECOMENDAÇÃO como entidade. Fase 1 do Lone Agent V2.
//
// Hoje cada fonte calcula a própria "prioridade" numa escala própria (diagnóstico 0–100, saúde
// 0–100 invertido, bom-dia por contagem) e joga texto num grupo de WhatsApp. 63% das sugestões do
// agente expiram sem decisão. Aqui todas viram o MESMO objeto, com evidência anexada, dono, estado
// e um score comparável entre fontes — para existir UMA lista de "o que preciso fazer hoje".

export type FonteRecomendacao = "trafego" | "saude" | "producao" | "cs" | "tarefa";
export type PapelDono = "admin" | "manager" | "traffic" | "social" | "designer" | "comercial";
export type NivelPolicy = "A" | "B" | "C" | "D" | "E";
export type EstadoRecomendacao = "nova" | "vista" | "aceita" | "ignorada" | "incorreta" | "executada" | "resolvida" | "expirada";

/** O que uma fonte entrega ao motor. Sem score — o motor calcula. Sem I/O — a fonte já leu tudo. */
export interface ItemBruto {
  fonte: FonteRecomendacao;
  clientId: string | null;
  cliente: string;
  /** Identifica a coisa dentro do cliente (card, campanha, tarefa). Entra no fingerprint. */
  entityRef: string | null;
  /** Por que existe ("cpl_acima_da_meta", "card_atrasado"). Entra no fingerprint. */
  motivo: string;
  titulo: string;
  /** Evidência: frases com número. Recomendação sem fato não entra. */
  fato: string[];
  inferencia?: string[];
  hipotese?: string | null;
  recomendacao: string;
  acaoProposta?: Record<string, unknown> | null;
  /** 0–100: tamanho do problema. */
  severidade: number;
  /** 0–100: quão perto do prazo / quão rápido piora. */
  urgencia: number;
  /** 0–1: quanto o dado sustenta a leitura. */
  confianca: number;
  /** R$/dia em jogo, quando existe. */
  exposicaoRs?: number | null;
  /** Deixar para amanhã custa pouco (true) ou o dano fica (false)? */
  reversivel: boolean;
  ownerRole: PapelDono;
  owner: string | null;
  nivelPolicy: NivelPolicy;
}

export interface ContextoRanking {
  /** Peso do cliente (50–100): verba, status em risco, atenção. Sem entrada = 70. */
  importanciaCliente: Record<string, number>;
  agora?: Date;
}

export interface Recomendacao extends ItemBruto {
  fingerprint: string;
  score: number;
  explicacaoScore: Record<string, number>;
}
