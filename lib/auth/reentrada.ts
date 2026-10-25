// lib/auth/reentrada.ts — o pedido que voltou 401 espera a pessoa entrar de novo e é repetido.
//
// POR QUE (25/10/2026, onda 6 da auditoria de erro recuperável, itens 8.3 e 8.4). Sessão recusada mesmo
// depois de renovar mostrava "Recarregue a página… não foi salvo" com um botão Recarregar — e recarregar
// apagava o formulário (nenhum guarda rascunho). Agora o RoleContext abre "Entre de novo para continuar"
// POR CIMA da página (sem desmontar nada) e registra aqui quem sabe esperar por isso. O authedFetch, ao
// receber o 401 final, pergunta: se a pessoa voltar, ele repete o pedido UMA vez com o token novo e o
// clique que estava em "Salvando…" termina como se nada tivesse acontecido.
//
// Sem ninguém registrado (testes, páginas públicas), não espera nada: o 401 volta na hora, como antes.

/** Devolve true quando a pessoa entrou de novo (repetir o pedido) e false quando não vai voltar. */
export type EsperaDeReentrada = () => Promise<boolean>;

let espera: EsperaDeReentrada | null = null;

export function registrarReentrada(fn: EsperaDeReentrada | null): void {
  espera = fn;
}

export async function aguardarReentrada(): Promise<boolean> {
  if (!espera) return false;
  try {
    return await espera();
  } catch {
    return false;
  }
}
