// lib/cs/esfriando.ts — "cliente esfriando": quem FALAVA no grupo e sumiu (churn precoce).
// Lógica PURA. O cron busca os clientes com atividade parada e chama isto. Backstage/suggest-only:
// alerta interno pro time reengajar — nunca fala com o cliente. Tom Lone: leve, sem alarmismo.

export interface ClienteQuieto {
  nome: string;
  diasQuieto: number;       // dias sem mensagem do cliente no grupo
  social?: string | null;   // responsável (assigned_social)
}

/** "" quando não há ninguém esfriando (o chamador NÃO posta nesse caso). */
export function buildEsfriandoDigest(clientes: ClienteQuieto[]): string {
  if (!clientes.length) return "";
  const ordenados = [...clientes].sort((a, b) => b.diasQuieto - a.diasQuieto);
  const n = ordenados.length;
  const abre = n === 1
    ? `👀 Opa, time! Um cliente que costumava falar no grupo sumiu faz uns dias — vale um "oi" pra reaquecer:`
    : `👀 Opa, time! ${n} clientes que costumavam falar no grupo sumiram faz uns dias — vale um "oi" pra reaquecer:`;
  const linhas = ordenados.map((c) => {
    const resp = c.social ? ` (${c.social})` : "";
    return `• *${c.nome}* — ${c.diasQuieto} dias sem falar${resp}`;
  });
  return `${abre}\n\n${linhas.join("\n")}\n\nUm contato leve (novidade, prévia, "como tá indo?") costuma trazer de volta. 🤝`;
}
