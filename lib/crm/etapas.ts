// lib/crm/etapas.ts — FONTE ÚNICA das etapas do funil comercial. Módulo PURO.
//
// Out/2026: o funil virou o da venda por visita — Novo → Contato feito → Diagnóstico → Proposta →
// Negociação → Ganho/Perdido. O de julho (Lead → Orçamento → Proposta → Reunião) punha a proposta
// antes da reunião, o contrário do que acontece na loja. Toda tela, rota e cron que precisa saber
// "quais etapas estão abertas" ou "como se chama esta etapa" lê daqui — eram cinco listas paralelas
// (página, cadência, lembrete, Início, proposta), e a troca de etapas teria esquecido alguma.

import { CRM_ESTAGIOS, type CrmEstagio } from "@/lib/types";

export const ETAPAS: readonly CrmEstagio[] = CRM_ESTAGIOS;
export const ETAPAS_ABERTAS: readonly CrmEstagio[] = ["novo", "contato", "diagnostico", "proposta", "negociacao"];

export const ROTULO_ETAPA: Record<CrmEstagio, string> = {
  novo: "Novo",
  contato: "Contato feito",
  diagnostico: "Diagnóstico",
  proposta: "Proposta",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};

/** O que precisa acontecer para o lead sair da etapa — aparece como dica no funil. */
export const CRITERIO_SAIDA: Record<CrmEstagio, string> = {
  novo: "Sai quando houver o primeiro contato.",
  contato: "Sai quando quem decide topar ver o diagnóstico.",
  diagnostico: "Sai quando a proposta for enviada.",
  proposta: "Sai quando o cliente começar a negociar.",
  negociacao: "Sai quando assinar (Ganho) ou desistir (Perdido).",
  ganho: "",
  perdido: "",
};

/**
 * Chance de fechar, de partida, por etapa (0–1). Conservadora para comércio local; o negócio pode
 * ter a própria (`probabilidade`). Recalibrar com o histórico de ganhos/perdas depois de ~30 fechados.
 */
export const PROBABILIDADE_PADRAO: Record<CrmEstagio, number> = {
  novo: 0.05,
  contato: 0.1,
  diagnostico: 0.25,
  proposta: 0.4,
  negociacao: 0.6,
  ganho: 1,
  perdido: 0,
};

// Etapas do funil de julho → as de hoje. Lead que ainda não passou pela migration continua aparecendo
// na coluna certa, e o PATCH de um cliente antigo (aba aberta antes do deploy) não grava lixo.
const LEGADO: Record<string, CrmEstagio> = { lead: "novo", orcamento: "diagnostico", reuniao: "diagnostico" };

export function normalizarEtapa(v: unknown): CrmEstagio {
  if (typeof v !== "string") return "novo";
  const s = v.trim().toLowerCase();
  if ((ETAPAS as readonly string[]).includes(s)) return s as CrmEstagio;
  return LEGADO[s] ?? "novo";
}

export function ehAberta(v: unknown): boolean {
  return ETAPAS_ABERTAS.includes(normalizarEtapa(v));
}

/** Chance que vale para o negócio: a dele, se houver e for válida; senão a da etapa. */
export function chanceDe(l: { estagio: unknown; probabilidade?: number | null }): number {
  const etapa = normalizarEtapa(l.estagio);
  if (etapa === "ganho") return 1;
  if (etapa === "perdido") return 0;
  const p = l.probabilidade;
  return typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? p : PROBABILIDADE_PADRAO[etapa];
}

// ─── Motivos de perda (lista fechada) ──────────────────────────────────
// Lista fechada é o que permite relatório ("perdemos 40% por sem resposta"); o texto livre fica ao
// lado. Ordem = frequência esperada no comércio local (RD Panorama 2025: sem resposta 38%, preço 33%).
export const MOTIVOS_PERDA = [
  { id: "sem_resposta", rotulo: "Sem resposta" },
  { id: "preco", rotulo: "Preço" },
  { id: "sem_verba", rotulo: "Sem verba agora" },
  { id: "ja_tem_agencia", rotulo: "Já tem agência ou faz em casa" },
  { id: "nao_decisor", rotulo: "Não é quem decide" },
  { id: "sem_perfil", rotulo: "Sem perfil para a Lone" },
  { id: "concorrente", rotulo: "Escolheu concorrente" },
  { id: "experiencia_ruim", rotulo: "Experiência ruim com agência" },
  { id: "outro", rotulo: "Outro" },
] as const;
export type MotivoPerda = (typeof MOTIVOS_PERDA)[number]["id"];

export function motivoValido(v: unknown): v is MotivoPerda {
  return typeof v === "string" && MOTIVOS_PERDA.some((m) => m.id === v);
}

export function rotuloMotivo(v: string | null | undefined): string | null {
  if (!v) return null;
  return MOTIVOS_PERDA.find((m) => m.id === v)?.rotulo ?? null;
}

/** "Sem verba agora" volta sozinho: o lead perdido por isso reaparece em 90 dias. */
export const DIAS_REATIVACAO_SEM_VERBA = 90;
