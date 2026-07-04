// lib/cs/intent.ts — detecção de INTENÇÃO pra Lone no grupo interno (puro, testável).

/**
 * A mensagem é uma pergunta/pedido OPERACIONAL pra Lone, mesmo SEM dizer "Lone"? No grupo interno,
 * "tem entrega em atraso?", "manda as artes em atraso do Carlos", "quais pendências?" são sempre
 * pra ela. Exige um termo operacional (prefixo, tolerante a plural/flexão) + cara de pergunta/pedido.
 * Normaliza acento (o WhatsApp pode mandar unicode decomposto).
 */
export function ehPerguntaProLone(text: string): boolean {
  const t = (text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  // Prefixos SEM \b no fim de propósito: "pendenci" casa "pendencias", "esfri" casa "esfriando".
  const operacional = /\b(atras|pendent|pendenci|em produ|aguardando aprova|esfri|sem post|lacuna|entrega|demanda|cade|no board|na fila)/.test(t);
  if (!operacional) return false;
  const perguntaOuPedido =
    /\?|^(tem|teve|ha\b|quais|quantas|quantos|manda|lista|mostra|me (diz|manda|fala|mostra|mostre)|cade|quem|como (ta|anda|esta)|o que)/.test(t)
    || /\bem atraso\b|\bpendent/.test(t);
  return perguntaOuPedido;
}
