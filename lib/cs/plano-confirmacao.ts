// lib/cs/plano-confirmacao.ts — QUANDO o "cria" abre os cards do plano. Módulo PURO
// (tests/cs-plano-confirmacao.test.ts); o banco fica em lib/cs/plano-em-cards.ts.
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 11.2). O handler do plano rodava antes da
// confirmação de demanda e aceitava "ok", "isso", "show" ou "fechou" sem citar nada: pegava o plano
// MAIS NOVO do grupo (janela de até 7 dias) e abria os N cards dele. Um "ok" para confirmar outra
// demanda abria os cards do plano, e a demanda ficava sem confirmar. "O planejamento do B está aprovado"
// abria os do A quando o plano do A era mais novo. "ok" e "cria" em seguida duplicavam.
//
// Agora vale como nas outras confirmações (check-in, cobrança, link da reunião): só CITANDO a mensagem
// do plano. Sem citar, "ok" solto segue o fluxo normal (é resposta de demanda); um pedido explícito
// ("cria os cards", "o planejamento do X está aprovado") recebe a instrução de citar, nunca um palpite.

/** "ok", "isso", "show" — curto, sem objeto. Sozinho não diz A QUE responde. */
export function ehConfirmacaoSolta(texto: string): boolean {
  const t = (texto || "").toLowerCase().trim();
  return /^(ok|isso|show|perfeito|pode ser|fechou)\b/.test(t) && t.length <= 24;
}

export type DecisaoPlano = "criar" | "pedir_citacao" | "seguir";

/**
 * O que fazer com uma mensagem que pede para criar os cards (pediuParaCriar já disse que sim).
 *  - citou a mensagem de um plano pendente → criar ESSE plano;
 *  - não citou, mas tem plano pendente e o pedido é explícito → pedir para citar;
 *  - não citou e é só "ok/isso/show" → seguir (é a resposta de outra coisa, normalmente uma demanda).
 */
export function decidirPedidoDoPlano(p: { texto: string; citouPlano: boolean; temPlanoPendente: boolean }): DecisaoPlano {
  if (p.citouPlano) return "criar";
  if (!p.temPlanoPendente || ehConfirmacaoSolta(p.texto)) return "seguir";
  return "pedir_citacao";
}

/** A resposta quando o pedido veio sem citar: quais planos estão esperando e como confirmar. */
export function textoCiteOPlano(planos: { clienteNome: string; total: number }[]): string {
  const lista = planos.slice(0, 5).map((p) => `• *${p.clienteNome}* — ${p.total} card(s)`).join("\n");
  return [
    "Pra eu abrir os cards, responde *cria* citando a mensagem do plano (a que pergunta \"Quer que eu já abra os cards…\"). Assim não abro o plano errado.",
    planos.length ? `Planos esperando aqui:\n${lista}` : "",
  ].filter(Boolean).join("\n\n");
}

/** A pergunta que fecha o plano — o "cria" tem que citá-la. */
export function textoPerguntaCriar(total: number): string {
  return `Quer que eu já abra os *${total} cards* no board do social, cada um na data certa? Responde *cria* citando esta mensagem que eu abro. 😉`;
}

/** Depois de abrir: quantos, o que faltou, e como desfazer. */
export function textoCardsAbertos(r: { criados: number; total: number; falharam: string[] }, cliente: string): string {
  const falta = r.falharam.length ? `\n_Não consegui ${r.falharam.length}: ${r.falharam.join(", ")}._` : "";
  const desfazer = r.criados ? "\nAbri errado? Responde *desfaz* citando esta mensagem que eu arquivo esses cards." : "";
  return `✅ ${r.criados} de ${r.total} card(s) do *${cliente}* no board, cada um na data.${falta}\n${r.criados ? "Já dá pro designer pegar." : ""}${desfazer}`.trim();
}

/**
 * O calendário montado pelo WhatsApp (auditoria 11.9, 25/10/2026). Antes o "📅 Pronto!" saía ANTES do
 * PDF e o resultado do documento era ignorado: se o PDF não chegava, o time ficava com um "pronto" sem
 * nada. Agora o texto depende do que aconteceu com o PDF — e, sem PDF, a lista das peças vai em texto.
 * "Ficou salvo" só aparece quando o planejamento foi mesmo gravado.
 */
export function textoCalendarioPronto(p: {
  cliente: string; rotuloModo: string; pecas: { data: string; titulo: string }[];
  pdf: "enviado" | "falhou" | "incerto" | "nao_gerou"; salvo: boolean; ressalva?: string;
}): string {
  const n = p.pecas.length;
  const ressalva = p.ressalva ? `\n\n${p.ressalva}` : "";
  if (p.pdf === "enviado") return `📅 Pronto! Calendário ${p.rotuloModo} do *${p.cliente}* — ${n} peça(s), cada uma com direção de arte pro designer.${ressalva}`;
  const dm = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d);
  const lista = p.pecas.slice(0, 31).map((x) => `• ${dm(x.data)} — ${x.titulo}`).join("\n");
  const porque = p.pdf === "incerto"
    ? "o WhatsApp não confirmou o envio do PDF (pode ter chegado) — segue a lista em texto"
    : p.pdf === "falhou" ? "não consegui mandar o PDF — segue a lista em texto"
    : "o PDF não foi gerado — segue a lista em texto";
  const salvo = p.salvo ? "O objetivo do período ficou salvo em Planejamento." : "⚠️ Não consegui salvar o planejamento no sistema — só esta mensagem tem o plano.";
  return `📅 Montei o calendário ${p.rotuloModo} do *${p.cliente}* (${n} peça(s)), mas ${porque}:\n${lista}\n\n${salvo}${ressalva}`;
}

/** "desfaz", "desfazer", "cancela", "volta" — citando a mensagem dos cards abertos. */
export function pediuDesfazer(texto: string): boolean {
  const t = (texto || "").toLowerCase().trim();
  return /^(desfaz|desfazer|desfa[çc]a|cancela|cancelar|volta|voltar|arquiva|arquivar)\b/.test(t) && t.length <= 40;
}
