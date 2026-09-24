// components/client/ficha/abas.ts — AS SEIS ABAS DA FICHA DO CLIENTE (Leva 6B, E2). Módulo PURO.
//
// Antes eram 15 abas numa faixa só e a ficha abria numa página longa e misturada. Agora são seis, na
// ordem em que alguém pensa no cliente: quem é e o que falta (Resumo), a marca, o que está sendo
// produzido, o resultado, a conversa e o cadastro.
//
// LINK ANTIGO CONTINUA FUNCIONANDO. Toda aba que já existiu (`?tab=onboarding`, `?tab=contratos`,
// `?tab=chat`…) cai na aba nova certa e rola até a seção dela. O teste tests/ficha-abas.test.ts
// varre o código atrás de `?tab=` e falha se algum link apontar para uma aba que este mapa não conhece.

export type AbaFicha = "resumo" | "marca" | "entregas" | "resultados" | "relacionamento" | "admin";

export const ABAS_FICHA: readonly { id: AbaFicha; rotulo: string }[] = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "marca", rotulo: "Marca & Briefing" },
  { id: "entregas", rotulo: "Entregas" },
  { id: "resultados", rotulo: "Resultados" },
  { id: "relacionamento", rotulo: "Relacionamento" },
  { id: "admin", rotulo: "Admin" },
] as const;

/** Âncoras das seções (id do elemento na página). */
export const SECAO = {
  // Resumo
  quemCuida: "quem-cuida",
  proximaAcao: "proxima-acao",
  pendente: "pendente-agora",
  // Marca & Briefing
  umaPagina: "ficha-uma-pagina",
  identidade: "identidade-visual",
  materiais: "materiais",
  briefing: "briefing",
  wallet: "creative-wallet",
  fichaViva: "ficha-viva",
  // Entregas
  producao: "producao",
  pedidosArte: "pedidos-de-arte",
  tarefas: "tarefas",
  instagram: "instagram",
  datas: "datas-do-mes",
  // Resultados
  entregasMes: "entregas-do-mes",
  anuncios: "anuncios",
  crescimento: "crescimento",
  provaSocial: "prova-social",
  inteligencia: "inteligencia-criativa",
  analiseIa: "analise-ia",
  portal: "portal",
  // Relacionamento
  reunioes: "reunioes",
  nps: "nps",
  checkins: "check-ins",
  humor: "humor-do-cliente",
  historico: "historico",
  // Admin
  cadastro: "cadastro",
  contrato: "contrato",
  onboarding: "onboarding",
  cicloDeVida: "ciclo-de-vida",
} as const;

export interface Destino { aba: AbaFicha; secao?: string }

/**
 * As abas que já existiram → onde o conteúdo delas mora agora. Nada ficou sem casa:
 *   overview (Visão Geral)        → Resumo; o dossiê foi pra Marca, os dados cadastrais e a conta
 *                                   Meta Ads pro Admin, a Prova Social pra Resultados
 *   dados (Dados)                 → Admin (identidade visual e materiais da marca → Marca)
 *   inteligencia                  → Marca (materiais, estilo, catálogo) + Resultados (criativos)
 *   resultados (Crescimento)      → Resultados — mesmo nome da aba nova, então abre no topo dela
 *                                   (Anúncios, e Crescimento logo abaixo); o humor do cliente foi
 *                                   pra Relacionamento
 *   analise-ia                    → Resultados
 *   briefing                      → Marca & Briefing
 *   contratos                     → Admin
 *   chat (Reuniões)               → Relacionamento
 *   historico                     → Relacionamento
 *   tasks (Tarefas)               → Entregas
 *   content (Conteúdo)            → Entregas
 *   onboarding                    → Admin
 *   wallet (Creative Wallet)      → Marca & Briefing
 *   portal                        → Resultados
 *   ficha-viva (Comercial)        → Marca & Briefing
 *   reports (Relatórios, saiu na Leva 1 — virou o PDF automático) → Resultados
 */
export const ABA_ANTIGA: Readonly<Record<string, Destino>> = {
  overview: { aba: "resumo" },
  dados: { aba: "admin", secao: SECAO.cadastro },
  inteligencia: { aba: "marca", secao: SECAO.materiais },
  "analise-ia": { aba: "resultados", secao: SECAO.analiseIa },
  briefing: { aba: "marca", secao: SECAO.briefing },
  contratos: { aba: "admin", secao: SECAO.contrato },
  chat: { aba: "relacionamento", secao: SECAO.reunioes },
  reunioes: { aba: "relacionamento", secao: SECAO.reunioes },
  historico: { aba: "relacionamento", secao: SECAO.historico },
  tasks: { aba: "entregas", secao: SECAO.tarefas },
  content: { aba: "entregas", secao: SECAO.producao },
  onboarding: { aba: "admin", secao: SECAO.onboarding },
  wallet: { aba: "marca", secao: SECAO.wallet },
  portal: { aba: "resultados", secao: SECAO.portal },
  "ficha-viva": { aba: "marca", secao: SECAO.fichaViva },
  reports: { aba: "resultados" },
};

const IDS = new Set<string>(ABAS_FICHA.map((a) => a.id));

/** `?tab=` (novo ou antigo) → a aba e a seção. Desconhecido ou vazio → Resumo. */
export function resolverAba(tab: string | null | undefined): Destino {
  const t = (tab ?? "").trim().toLowerCase();
  if (IDS.has(t)) return { aba: t as AbaFicha };
  return ABA_ANTIGA[t] ?? { aba: "resumo" };
}
