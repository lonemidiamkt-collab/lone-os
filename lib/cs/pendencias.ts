// lib/cs/pendencias.ts — lembrete diário das sugestões PENDENTES do Agente CS (engajamento).
// Lógica PURA (sem I/O): monta uma mensagem amigável listando o que ainda espera um ok/não da
// equipe. Reforça o painel Agente Lone (onde dá pra decidir na tela). Tom Lone: caloroso, 1 emoji,
// nada robótico. Fonte: fechar o loop suggest-only (demanda captada → humano confirma → vira card).

export interface PendenciaItem {
  cliente: string;
  resumo: string;
  responsavel?: string | null;
  urgencia?: string;
}

const MAX_LISTADAS = 8; // acima disso, resume o excedente pra não virar textão no zap

/** Monta o lembrete. Retorna "" quando não há nada pendente (o chamador NÃO posta nesse caso). */
export function buildPendenciasDigest(itens: PendenciaItem[]): string {
  if (!itens.length) return "";

  const n = itens.length;
  const abre = n === 1
    ? `Opa, time! 👋 Ficou *1 sugestão* esperando um ok/não de vocês:`
    : `Opa, time! 👋 Ficaram *${n} sugestões* esperando um ok/não de vocês:`;

  const mostradas = itens.slice(0, MAX_LISTADAS);
  const linhas = mostradas.map((p) => {
    const urg = p.urgencia === "alta" ? " 🔴" : "";
    const resp = p.responsavel ? ` (${p.responsavel})` : "";
    return `• *${p.cliente}* — ${p.resumo}${resp}${urg}`;
  });
  const resto = n - mostradas.length;
  if (resto > 0) linhas.push(`• …e mais ${resto}.`);

  const fecha = n === 1
    ? `Responde *ok* (crio o card) ou *não* na mensagem dela aqui em cima — ou decide no painel do Agente Lone. Tamo junto!`
    : `Responde *ok* / *não* na mensagem de cada uma aqui em cima — ou resolve tudo de uma vez no painel do Agente Lone. Tamo junto!`;

  return `${abre}\n\n${linhas.join("\n")}\n\n${fecha}`;
}
