// Os motivos de saída de cliente — fonte única para a API e para a tela.
//
// Roberto: "gostei do motivo de saída obrigatório". O estado antes disso: 6 clientes arquivados, 1
// com motivo preenchido. Cinco saíram e ninguém sabe por quê.
//
// A lista é curta de propósito. Motivo demais vira campo que ninguém preenche direito, e o objetivo
// é responder uma pergunta só: a gente perde cliente por PREÇO, por RESULTADO ou por ATENDIMENTO?
// Cada resposta dessas leva a uma ação diferente — mexer na tabela, mexer na entrega, ou mexer no
// acompanhamento.
export const MOTIVOS_SAIDA = {
  preco: "Preço / orçamento do cliente",
  resultado: "Resultado abaixo do esperado",
  fechou: "Cliente fechou ou mudou de ramo",
  concorrente: "Foi para outra agência",
  equipe_propria: "Montou equipe própria",
  atendimento: "Atendimento / relacionamento",
  pausa: "Pausa temporária (pretende voltar)",
  outro: "Outro",
} as const;

export type MotivoSaida = keyof typeof MOTIVOS_SAIDA;
export const MOTIVOS_LISTA = Object.entries(MOTIVOS_SAIDA) as [MotivoSaida, string][];

/** Saída que a agência pode ter evitado — a que vale revisar em reunião. */
export const EVITAVEIS: MotivoSaida[] = ["resultado", "atendimento", "preco", "concorrente"];
