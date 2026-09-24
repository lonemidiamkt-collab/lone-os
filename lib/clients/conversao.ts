// lib/clients/conversao.ts — GANHO → ONBOARDING CERTO (Leva 7C, N27). Módulo PURO.
//
// Antes: "Converter em cliente" no CRM criava o cliente sempre como Lone Growth e ramo "Outro", podia
// ser clicado duas vezes (dois clientes do mesmo lead) e o cliente nascia sem nada no onboarding até
// alguém aprovar o cadastro. Quem abria a ficha não sabia se o grupo do WhatsApp já existia.
//
// Agora a conversão PERGUNTA o pacote (service_type) e o ramo (nicho), recusa lead já convertido, e o
// cliente nasce com:
//   · o checklist de onboarding da frente que ele contratou (onboarding_items) — a MESMA lista que a
//     aprovação do cadastro usava (e continua usando, daqui);
//   · a ficha da jornada do CS (client_journey) com a próxima ação;
//   · as TAREFAS do grupo do WhatsApp. Nenhum fluxo do sistema cria grupo de WhatsApp sozinho — então
//     o sistema não finge: vira tarefa para o CS criar o grupo e vinculá-lo no painel.

import { ROTULO_NICHO, type Nicho } from "@/lib/cs/nicho";

/** Os pacotes que o comercial vende hoje (os nomes legados ficam de fora da escolha). */
export const PACOTES_VENDA = [
  { id: "lone_growth", rotulo: "Lone Growth (tráfego + social)" },
  { id: "assessoria_trafego", rotulo: "Assessoria de Tráfego" },
  { id: "assessoria_social", rotulo: "Assessoria de Social" },
  { id: "assessoria_design", rotulo: "Assessoria de Design" },
] as const;
export type PacoteVenda = (typeof PACOTES_VENDA)[number]["id"];

export function pacoteValido(p: unknown): p is PacoteVenda {
  return PACOTES_VENDA.some((x) => x.id === p);
}

export function nichoValido(n: unknown): n is Nicho {
  return typeof n === "string" && n in ROTULO_NICHO;
}

// ── Checklist de onboarding por frente ──────────────────────────────────────

export interface ItemOnboarding { label: string; department: "traffic" | "design" | "social"; sort_order: number }

export const ITENS_ONBOARDING: readonly ItemOnboarding[] = [
  { label: "Pixel de rastreamento instalado", department: "traffic", sort_order: 0 },
  { label: "Contas de anuncios configuradas", department: "traffic", sort_order: 1 },
  { label: "Estrategia inicial de campanhas definida", department: "traffic", sort_order: 2 },
  { label: "Paleta de cores e fontes definidas", department: "design", sort_order: 3 },
  { label: "Briefing de marca preenchido", department: "design", sort_order: 4 },
  { label: "Assets organizados no Drive", department: "design", sort_order: 5 },
  { label: "Acessos as redes sociais recebidos", department: "social", sort_order: 6 },
  { label: "Tom de voz e persona definidos", department: "social", sort_order: 7 },
  { label: "Calendario inicial criado", department: "social", sort_order: 8 },
  { label: "Primeira reuniao de alinhamento realizada", department: "social", sort_order: 9 },
];

const FRENTES: Record<string, ItemOnboarding["department"][]> = {
  lone_growth: ["traffic", "design", "social"],
  assessoria_trafego: ["traffic"],
  assessoria_social: ["social"],
  assessoria_design: ["design"],
};

/** Os itens que valem para o pacote. Pacote desconhecido = todas as frentes (como sempre foi). */
export function itensOnboardingPara(serviceType: string | null | undefined): ItemOnboarding[] {
  const frentes = new Set(FRENTES[serviceType ?? ""] ?? ["traffic", "design", "social"]);
  return ITENS_ONBOARDING.filter((i) => frentes.has(i.department));
}

// ── Tarefas do grupo do WhatsApp ────────────────────────────────────────────

export const PREFIXO_ONBOARDING = "[Onboarding]";

export interface TarefaConversao { title: string; role: "social"; priority: "high"; description: string; dias: number }

/** Grupo primeiro (sem ele o Agente não conversa com o cliente); vincular logo depois. */
export function tarefasDaConversao(cliente: string): TarefaConversao[] {
  return [
    {
      title: `${PREFIXO_ONBOARDING} Criar o grupo do WhatsApp — ${cliente}`, role: "social", priority: "high", dias: 1,
      description: `Criar o grupo "${cliente} x Lone Mídia" com o cliente, o social e o gestor. Depois, no grupo da equipe: "Lone, entrou um novo cliente, o cliente ${cliente} no grupo <nome do grupo>" — o Agente começa o onboarding por lá.`,
    },
    {
      title: `${PREFIXO_ONBOARDING} Vincular o grupo do WhatsApp no painel — ${cliente}`, role: "social", priority: "high", dias: 2,
      description: "Sem o grupo vinculado, o Agente não lê as mensagens do cliente e nada do grupo entra na linha do tempo.",
    },
  ];
}

/** Próxima ação da jornada do CS para o cliente recém-convertido. */
export const PROXIMA_ACAO_CONVERSAO = "Criar o grupo do WhatsApp e iniciar o onboarding com o cliente";

/** Data (YYYY-MM-DD) `dias` depois de `hoje`. */
export function prazoEm(hoje: string, dias: number): string {
  return new Date(Date.parse(`${hoje}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}
