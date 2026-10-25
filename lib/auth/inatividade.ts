// lib/auth/inatividade.ts — saída por inatividade contada ENTRE ABAS. Puro + armazenamento protegido.
//
// POR QUE (25/10/2026, onda 6 da auditoria de erro recuperável, item 8.3). A inatividade de 4 h era
// contada por aba e chamava signOut() global: uma aba esquecida derrubava a aba onde a pessoa estava
// digitando, as outras abas e os OUTROS APARELHOS, e o formulário aberto sumia. O aviso de 30 min só ia
// para o console.
//
// A REGRA AGORA:
//  · conta o tempo desde o último uso em QUALQUER aba deste navegador (clique, tecla, rolagem, toque) —
//    as abas compartilham o instante pelo localStorage e por BroadcastChannel;
//  · a partir de 3h30 sem uso, aparece um aviso visível com "Continuar conectado";
//  · com 4 h sem uso em nenhuma aba, a sessão fecha SÓ neste navegador (signOut local — celular e outros
//    computadores seguem logados) e a página fica guardada por baixo do pedido de senha.
// Testado em tests/inatividade.test.ts.

export const LIMITE_INATIVIDADE_MS = 4 * 60 * 60 * 1000;
export const AVISO_ANTES_MS = 30 * 60 * 1000;
/** Gravar o instante no localStorage a cada clique é desperdício: uma vez a cada 15 s basta. */
export const INTERVALO_GRAVACAO_MS = 15 * 1000;
export const CHAVE_ATIVIDADE = "lone:ultima-atividade";
export const CANAL_ATIVIDADE = "lone-atividade";

export type FaseInatividade = "ativo" | "aviso" | "sair";

export function faseDaInatividade(agora: number, ultimaAtividade: number): { fase: FaseInatividade; restanteMs: number } {
  const parado = Math.max(0, agora - ultimaAtividade);
  const restanteMs = Math.max(0, LIMITE_INATIVIDADE_MS - parado);
  if (parado >= LIMITE_INATIVIDADE_MS) return { fase: "sair", restanteMs: 0 };
  if (parado >= LIMITE_INATIVIDADE_MS - AVISO_ANTES_MS) return { fase: "aviso", restanteMs };
  return { fase: "ativo", restanteMs };
}

/** O uso mais recente conhecido (desta aba, das outras). Valor estranho/futuro não conta. */
export function maisRecente(agora: number, ...instantes: Array<number | null | undefined>): number {
  let melhor = 0;
  for (const t of instantes) {
    if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) continue;
    // Relógio de outra aba "no futuro" (ajuste de hora) seguraria a sessão para sempre: limita a agora.
    melhor = Math.max(melhor, Math.min(t, agora));
  }
  return melhor;
}

export function deveGravar(ultimaGravada: number, agora: number): boolean {
  return agora - ultimaGravada >= INTERVALO_GRAVACAO_MS;
}

interface ArmazemSimples { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Lê o instante compartilhado. Sem localStorage (aba privada, bloqueado): null, sem quebrar. */
export function lerAtividadeCompartilhada(armazem: () => ArmazemSimples | null | undefined): number | null {
  try {
    const v = armazem()?.getItem(CHAVE_ATIVIDADE);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function gravarAtividadeCompartilhada(armazem: () => ArmazemSimples | null | undefined, instante: number): boolean {
  try {
    const a = armazem();
    if (!a) return false;
    a.setItem(CHAVE_ATIVIDADE, String(instante));
    return true;
  } catch {
    return false;
  }
}

/** "às 18:40" no fuso de SP — o aviso diz QUANDO, não só "em X minutos". */
export function horaDaSaida(agora: number, restanteMs: number): string {
  return new Date(agora + restanteMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
