// lib/cs/autoridade-comandos.ts — a resposta para quem pede uma AÇÃO nos grupos da equipe sem ter autoridade.
// Módulo PURO (25/10/2026, onda 5 do erro recuperável).
//
// A Fase 0A (lib/cs/autoridade.ts) decide pelo número: só quem está na Gestão da Equipe, com papel operacional,
// executa ação (nível C). A confirmação de demanda já passava por essa porta (24/10/2026). Férias/ausência,
// onboarding, mover card, ajustar pedido, link da reunião e contrato não passavam: qualquer número no grupo
// (cliente adicionado por engano, ex-funcionário, número trocado) mudava para quem vão as demandas, começava a
// conversa com um cliente novo ou mexia no quadro.
//
// Quem não pode recebe UMA frase dizendo por quê. Calar parece que o agente não ouviu, e a pessoa repete.
// Quando a lista da equipe não carregou, a frase diz isso — "você não é da equipe" seria falha com cara de veredito.

export type AcaoDoTime = "onboarding" | "ausencia" | "mover_card" | "ajustar_pedido" | "link_reuniao" | "contrato"
  | "cards_do_plano" | "baixa_pendencia";

const ACOES: Record<AcaoDoTime, { pode: string; nada: string }> = {
  // 25/10/2026 (onda 6): abrir/desfazer os cards de um plano e dar baixa em pendência do cliente.
  cards_do_plano: { pode: "abrir ou arquivar os cards de um plano", nada: "Não mexi em nenhum card." },
  baixa_pendencia: { pode: "dar baixa em pendência de cliente", nada: "As pendências ficaram como estavam." },
  onboarding: { pode: "começar o onboarding de um cliente (eu converso com ele no grupo dele)", nada: "Não comecei nada." },
  ausencia: { pode: "marcar férias ou a volta de alguém (isso muda para quem eu mando as demandas)", nada: "Não anotei nada." },
  mover_card: { pode: "mover card do quadro", nada: "Não mexi em nenhum card." },
  ajustar_pedido: { pode: "ajustar um pedido antes de virar card", nada: "O pedido ficou como estava." },
  link_reuniao: { pode: "mandar o link da reunião para o cliente", nada: "Não mandei nada para o cliente." },
  contrato: { pode: "gerar contrato", nada: "Não gerei nada." },
};

export function textoSemAutoridade(acao: AcaoDoTime, o: { naoConferi?: boolean } = {}): string {
  const { pode, nada } = ACOES[acao];
  if (o.naoConferi) {
    return `Não consegui conferir agora quem está falando (a lista da equipe não carregou). ${nada} Tenta de novo em um minuto.`;
  }
  return `Só quem é da equipe, com o WhatsApp cadastrado na Gestão da Equipe, pode ${pode} por aqui. ${nada}`;
}
