// lib/notificacoes/lidas.ts — QUAIS avisos o "Marcar como lidas" do sino pode tocar. Módulo PURO, testado.
//
// Achado de 21/10/2026 (auditoria de erro recuperável, 4.1): o botão gravava `read = true` em TODA
// linha não lida da tabela. Quando o Roberto limpava o sino dele, sumia o aviso de tarefa do Pedro e a
// arte entregue para o Carlos — sem desfazer e, se a rede caísse, sem dizer nada.
//
// A regra agora: só os ids que estão na tela de quem clicou, e só os que essa pessoa enxerga — os
// dirigidos a ela (target_user = nome) e os do time todo (target_user nulo, que já eram um "lido"
// compartilhado: abrir um deles sempre marcou para todos).

/** Itens que só existem no navegador (empurrados agora, ainda sem linha no banco). */
export const ehTemporario = (id: string) => id.startsWith("temp-");

/** Os não lidos de uma lista, sem repetir — é o que "Marcar todas como lidas" vai marcar. */
export function idsNaoLidos(itens: { id: string; read: boolean }[]): string[] {
  return [...new Set(itens.filter((n) => !n.read).map((n) => n.id))];
}

/**
 * Dos avisos pedidos, os que esta pessoa pode marcar: os dela e os do time todo. Aviso dirigido a
 * outra pessoa nunca entra, mesmo que o id venha no pedido. Sem nome conhecido, só os do time.
 */
export function avisosDaPessoa(linhas: { id: string; target_user: string | null }[], quem: string | null): string[] {
  return linhas.filter((l) => l.target_user == null || (quem != null && l.target_user === quem)).map((l) => l.id);
}

/** Aplica lida/não lida só nos ids pedidos; o resto da lista fica como está. */
export function marcarNaLista<T extends { id: string; read: boolean }>(lista: T[], ids: string[], lida: boolean): T[] {
  const alvo = new Set(ids);
  return lista.map((n) => (alvo.has(n.id) && n.read !== lida ? { ...n, read: lida } : n));
}

export function textoMarcadas(n: number): string {
  return n === 1 ? "1 aviso marcado como lido." : `${n} avisos marcados como lidos.`;
}
