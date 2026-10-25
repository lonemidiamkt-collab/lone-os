// lib/tarefas/cobranca.ts — quais tarefas contam como COBRADAS hoje (25/10/2026, auditoria 13.2). Módulo PURO.
//
// A cobrança das 9h/10h marca `last_reminded_at` para não cobrar duas vezes no dia. Antes marcava TODAS as tarefas
// da rodada, inclusive as da pessoa cujo PDF e texto não saíram — e a rodada das 10h, vendo a marca, não tentava de
// novo. Agora só conta como cobrada a tarefa de quem recebeu alguma coisa (PDF, texto ou envio incerto).

/** Ids das tarefas cuja pessoa recebeu a cobrança. `pessoa` é o dono resolvido ("sem dono" quando não há). */
export function idsCobrados(itens: readonly { id: string; pessoa: string }[], receberam: ReadonlySet<string>): string[] {
  return itens.filter((it) => receberam.has(it.pessoa)).map((it) => it.id);
}
