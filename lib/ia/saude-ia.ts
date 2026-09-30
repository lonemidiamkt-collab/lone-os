// lib/ia/saude-ia.ts — A IA ESTÁ RESPONDENDO?
//
// 25/09/2026, 7h30: o saldo da OpenAI zerou. Durante 5 dias nenhuma chamada deu certo — o Loninho
// leu 420 mensagens dos grupos dos clientes sem entender nenhuma, a revisão de arte parou, a
// transcrição de áudio parou. O primeiro aviso veio pelas ROTINAS agendadas, e só dizia "falhou"
// com JSON cortado. O agente em si não é rotina, então ninguém vigiava ele.
//
// A regra aqui olha o registro de toda chamada de IA (llm_calls), não as rotinas: se desde o último
// sucesso as falhas se acumulam e o motivo é uma causa conhecida, a IA está fora — e o aviso diz
// desde quando e o que parou junto.

import { causaDoErro, rotuloDaOrigem, type CausaConhecida } from "./causa-erro";

/** Uma chamada que falhou depois do último sucesso. */
export interface FalhaIa {
  origem: string | null;
  erro: string | null;
  created_at: string;
}

export interface IaFora {
  causa: CausaConhecida;
  /** Primeira falha depois do último sucesso. */
  desde: string;
  falhas: number;
  /** O que parou, do que mais falhou pro que menos. */
  porFrente: { rotulo: string; falhas: number }[];
}

/** Menos que isso pode ser uma chamada azarada; três seguidas com causa conhecida não é. */
const MIN_FALHAS = 3;
/** A última falha tem que ser recente — senão é história, não problema de agora. */
const AINDA_ACONTECENDO_MS = 3 * 3600_000;

/**
 * A IA está fora? `falhas` são as chamadas que falharam DEPOIS do último sucesso (qualquer modelo:
 * crédito e chave valem pra conta inteira). Devolve null quando está tudo bem, quando as falhas
 * são poucas, antigas, ou de motivo desconhecido — limite de velocidade e erro 500 passam sozinhos
 * e não merecem aviso no grupo.
 */
export function iaFora(falhas: ReadonlyArray<FalhaIa>, agora: Date): IaFora | null {
  if (falhas.length < MIN_FALHAS) return null;

  const ordenadas = [...falhas].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ultima = ordenadas[ordenadas.length - 1];
  if (agora.getTime() - new Date(ultima.created_at).getTime() > AINDA_ACONTECENDO_MS) return null;

  // A causa é a conhecida mais frequente. Falhas sem causa (o whisper devolve só "HTTP 429") entram
  // na contagem de o que parou, mas não decidem a causa.
  const porCausa = new Map<string, { causa: CausaConhecida; n: number }>();
  for (const f of ordenadas) {
    const c = causaDoErro(f.erro);
    if (!c) continue;
    const atual = porCausa.get(c.chave) ?? { causa: c, n: 0 };
    atual.n += 1;
    porCausa.set(c.chave, atual);
  }
  const principal = [...porCausa.values()].sort((a, b) => b.n - a.n)[0];
  if (!principal || principal.n < MIN_FALHAS) return null;

  const frentes = new Map<string, number>();
  for (const f of ordenadas) {
    const r = rotuloDaOrigem(f.origem);
    frentes.set(r, (frentes.get(r) ?? 0) + 1);
  }

  return {
    causa: principal.causa,
    desde: ordenadas[0].created_at,
    falhas: ordenadas.length,
    porFrente: [...frentes].map(([rotulo, n]) => ({ rotulo, falhas: n })).sort((a, b) => b.falhas - a.falhas),
  };
}
