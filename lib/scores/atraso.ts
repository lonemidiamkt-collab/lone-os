// DE QUEM É O ATRASO — interno ou do cliente.
//
// PRA QUE (Roberto, 02/09): "hoje você pode ter posts entregues atrasados. Mas quem atrasou? Não
// podemos punir seu time por um cliente que passa oito dias sem aprovar."
//
// É a mesma família de erro que já apareceu três vezes hoje: um número que mistura causas
// diferentes vira cobrança da pessoa errada. Aqui a separação é entre o relógio que a Lone
// controla e o que ela não controla.

export type Culpa = "lone" | "cliente" | "compartilhado" | "indefinido";

export type EstadoCard =
  | "producao_lone"        // 🟢 com a gente, dentro do combinado
  | "atrasado_lone"        // 🔴 com a gente, passou do prazo
  | "aguardando_cliente"   // 🟡 esperando aprovação
  | "aguardando_material"  // 🔵 esperando foto, vídeo, informação
  | "em_aprovacao";        // 🟣 em revisão interna

export const ROTULO_ESTADO: Record<EstadoCard, string> = {
  producao_lone: "Em produção (Lone)",
  atrasado_lone: "Atrasado (Lone)",
  aguardando_cliente: "Aguardando cliente",
  aguardando_material: "Aguardando material",
  em_aprovacao: "Em aprovação",
};

export const CULPA_DO_ESTADO: Record<EstadoCard, Culpa> = {
  producao_lone: "lone",
  atrasado_lone: "lone",
  aguardando_cliente: "cliente",
  aguardando_material: "cliente",
  em_aprovacao: "lone",
};

export interface CardParaAtraso {
  id: string;
  status: string;
  diasAtePost: number | null;      // negativo = passou
  designerEntregou: boolean;
  clienteAprovouEm: string | null;
  bloqueadoPor: string | null;      // texto do bloqueio, quando houver
}

/**
 * Classifica o card.
 *
 * A regra central: depois que o designer entregou e a peça está esperando o cliente, o relógio
 * PARA de correr contra a Lone. Antes disso, corre.
 */
export function classificar(c: CardParaAtraso): EstadoCard {
  // Bloqueio explícito por falta de material do cliente.
  if (c.bloqueadoPor && /material|foto|v[íi]deo|informa|dado|cliente/i.test(c.bloqueadoPor)) {
    return "aguardando_material";
  }
  // Entregue e esperando o cliente decidir: não é atraso nosso.
  if (c.designerEntregou && !c.clienteAprovouEm && c.status === "client_approval") {
    return "aguardando_cliente";
  }
  if (c.designerEntregou && c.status === "approval") return "em_aprovacao";
  // Ainda conosco: atrasado só se o dia do post já passou.
  if (c.diasAtePost !== null && c.diasAtePost < 0) return "atrasado_lone";
  return "producao_lone";
}

export interface ResumoAtraso {
  total: number;
  porEstado: Record<EstadoCard, number>;
  /** % do total. Os dois números que o Roberto pediu, lado a lado. */
  atrasoInternoPct: number;
  atrasoClientePct: number;
  /** Quantos dias, em média, cada lado segura. */
  diasMediosCliente: number | null;
}

export function resumirAtrasos(cards: CardParaAtraso[], diasEsperandoCliente: number[] = []): ResumoAtraso {
  const porEstado = {
    producao_lone: 0, atrasado_lone: 0, aguardando_cliente: 0,
    aguardando_material: 0, em_aprovacao: 0,
  } as Record<EstadoCard, number>;

  for (const c of cards) porEstado[classificar(c)] += 1;

  const total = cards.length || 1;
  const doCliente = porEstado.aguardando_cliente + porEstado.aguardando_material;
  return {
    total: cards.length,
    porEstado,
    atrasoInternoPct: Math.round((porEstado.atrasado_lone / total) * 100),
    atrasoClientePct: Math.round((doCliente / total) * 100),
    diasMediosCliente: diasEsperandoCliente.length
      ? Math.round(diasEsperandoCliente.reduce((a, b) => a + b, 0) / diasEsperandoCliente.length)
      : null,
  };
}
