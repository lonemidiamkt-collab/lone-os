// lib/traffic/status-resultado.ts — O STATUS DO CLIENTE SAI DO RESULTADO DO ANÚNCIO, não de um
// arraste que ninguém faz.
//
// Roberto (13/09/2026), olhando o kanban de Status Clientes com 42 em "Bons resultados" e zero em
// "Médios" e "Em risco": "eu quero que você faça em cima dos resultados de anúncio dos clientes e
// só. Verifique conta por conta e sempre faça essa troca de acordo com esses resultados. E toda
// sexta-feira você faz essa análise, pede pro Júlio fazer também."
//
// Medido no banco: `clients.status` tinha SÓ dois valores em uso — good (42) e onboarding (10).
// Ninguém nunca marcou average nem at_risk. Os 42 "bons" eram o padrão do cadastro, não uma
// avaliação. No mesmo dia, pelo CPL real dos últimos 7 dias contra a meta de cada cliente: Nova
// União a 25,6 com crítico em 21,7; Óticas Raki a 17,6 com crítico em 10,7; três contas sem
// gastar nada há uma semana. Tudo em "bons resultados".
//
// A régua já existia: client_traffic_policy tem cpl_meta / cpl_alerta / cpl_critico por cliente,
// derivadas do histórico dele — é o que o diagnóstico diário do tráfego usa. Este arquivo só
// aplica a régua ao status. Função pura; quem busca o dado é a rota.

export type StatusResultado = "good" | "average" | "at_risk";

export interface EntradaStatus {
  /** Gasto nos últimos 7 dias (R$). */
  gasto7d: number;
  /** Conversões/resultados nos últimos 7 dias. */
  conv7d: number;
  /** Limiares da política do cliente. Null = sem política (não dá pra julgar). */
  cplAlerta: number | null;
  cplCritico: number | null;
  /** Conversas mínimas esperadas na janela. Null = sem exigência. */
  convMin: number | null;
  /** O cliente tem conta de anúncio vinculada? Sem conta, "sem gasto" não é problema. */
  temConta: boolean;
}

export interface Veredito {
  status: StatusResultado | null;
  /** Uma frase, para o card e para o aviso ao Julio. */
  motivo: string;
  cpl: number | null;
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

/**
 * Bons resultados: CPL até o alerta. Médios: entre alerta e crítico. Em risco: acima do crítico,
 * ou conta parada (tem conta, gastou zero em 7 dias), ou volume abaixo do mínimo combinado.
 * Sem política ou sem conta → null: o status não muda, porque não há base para mudar.
 */
export function statusPorResultado(e: EntradaStatus): Veredito {
  if (!e.temConta) return { status: null, motivo: "sem conta de anúncio vinculada", cpl: null };

  // Conta parada é o pior sinal que existe: dinheiro que devia estar rodando, parado.
  if (e.gasto7d <= 0) {
    return { status: "at_risk", motivo: "conta sem nenhum gasto nos últimos 7 dias", cpl: null };
  }

  const cpl = e.conv7d > 0 ? e.gasto7d / e.conv7d : null;

  // Gastou e não converteu nada: não tem CPL porque não tem resultado.
  if (cpl === null) {
    return { status: "at_risk", motivo: `gastou ${brl(e.gasto7d)} em 7 dias sem nenhum resultado`, cpl: null };
  }

  if (e.cplAlerta === null || e.cplCritico === null) {
    return { status: null, motivo: `CPL ${brl(cpl)}, mas o cliente não tem meta definida`, cpl };
  }

  if (cpl > e.cplCritico) {
    return { status: "at_risk", motivo: `CPL ${brl(cpl)} acima do crítico (${brl(e.cplCritico)})`, cpl };
  }
  if (e.convMin !== null && e.conv7d < e.convMin) {
    return { status: "at_risk", motivo: `só ${e.conv7d} resultado(s) em 7 dias — mínimo combinado é ${e.convMin}`, cpl };
  }
  if (cpl > e.cplAlerta) {
    return { status: "average", motivo: `CPL ${brl(cpl)} acima do alerta (${brl(e.cplAlerta)}), ainda abaixo do crítico`, cpl };
  }
  return { status: "good", motivo: `CPL ${brl(cpl)} dentro da meta (alerta em ${brl(e.cplAlerta)})`, cpl };
}

/** Dias de casa a partir dos quais o cliente não é mais "onboarding". */
export const DIAS_ONBOARDING = 30;

/**
 * Sai de onboarding quando passou o prazo OU já tem resultado de anúncio para ser julgado.
 * Roberto tirou quatro à mão (Atlas 146d, MAX 95d, Maicon 76d, Blocfast 83d); a regra tira os
 * mesmos e os próximos sem ninguém precisar lembrar.
 */
export function saiDeOnboarding(diasDeCasa: number, veredito: Veredito): boolean {
  return diasDeCasa > DIAS_ONBOARDING || veredito.status !== null;
}

/** O rótulo que a tela mostra para cada status. */
export const ROTULO: Record<StatusResultado | "onboarding", string> = {
  onboarding: "Onboarding",
  good: "Bons resultados",
  average: "Resultados médios",
  at_risk: "Em risco",
};
