// lib/onboarding/upload.ts — envio de arquivo do link de cadastro: limite justo e nova tentativa sozinha.
//
// POR QUE (24/10/2026, auditoria de erro recuperável, item 1.5). A rota aceitava 1 upload por IP a
// cada 5 s. O cliente selecionava as 3 páginas do cartão CNPJ de uma vez, a página mandava em série
// e o 2º e o 3º arquivo levavam 429 — "Muitos uploads em pouco tempo" — com cara de que o sistema
// recusou o arquivo. Agora:
//   · o limite é por LINK de cadastro (token), com folga para a seleção inteira; o teto por IP fica só
//     contra robô;
//   · a página tenta de novo sozinha o que levou 429 (ou caiu a rede, ou o painel reiniciou), e lista
//     no fim o que não subiu, com "Tentar de novo".
//
// Puro. Testado em tests/onboarding-upload.test.ts.

/** Arquivos por minuto. A seleção normal é 1 a 5 (cartão CNPJ, RG frente e verso). */
export const LIMITE_UPLOAD = { porToken: 20, porUsuario: 60, porIp: 60, janelaMs: 60_000 } as const;

/** Segundos que a rota sugere no Retry-After quando o limite estoura. */
export const ESPERA_SUGERIDA_S = 10;

/** Respostas que valem uma nova tentativa automática (as outras são do arquivo: formato, tamanho). */
export function valeTentarDeNovo(status: number): boolean {
  return status === 0 || status === 429 || status === 502 || status === 503 || status === 504;
}

const ESPERAS_MS = [3_000, 8_000, 15_000];

/** Espera antes da tentativa `n` (1 = a primeira nova tentativa). Respeita o Retry-After se vier. */
export function esperaAntesDaTentativa(n: number, retryAfterS?: number | null): number {
  const base = ESPERAS_MS[Math.min(Math.max(n, 1), ESPERAS_MS.length) - 1];
  const pedida = retryAfterS && retryAfterS > 0 ? Math.min(retryAfterS, 60) * 1000 : 0;
  return Math.max(base, pedida);
}

export interface RespostaDeEnvio { status: number; retryAfterS?: number | null }

/**
 * Chama `enviar` e, se a resposta for das que valem nova tentativa, espera e manda de novo — até
 * `novasTentativas` vezes. Devolve a última resposta (sucesso ou não). Nunca lança se `enviar` não lançar.
 */
export async function enviarComNovaTentativa<T extends RespostaDeEnvio>(
  enviar: () => Promise<T>,
  opcoes?: { novasTentativas?: number; dormir?: (ms: number) => Promise<void>; aoEsperar?: (tentativa: number, ms: number) => void },
): Promise<T> {
  const max = opcoes?.novasTentativas ?? ESPERAS_MS.length;
  const dormir = opcoes?.dormir ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  let r = await enviar();
  for (let n = 1; n <= max && valeTentarDeNovo(r.status); n++) {
    const ms = esperaAntesDaTentativa(n, r.retryAfterS);
    opcoes?.aoEsperar?.(n, ms);
    await dormir(ms);
    r = await enviar();
  }
  return r;
}

/** Frase do arquivo que não subiu, para a lista do fim. */
export function motivoDoArquivoQueNaoSubiu(status: number, doServidor?: string | null): string {
  if (status === 0) return "a conexão caiu";
  if (status === 429) return "muitos arquivos seguidos — espere um minuto";
  if (status === 502 || status === 503 || status === 504) return "o sistema estava reiniciando";
  return doServidor?.trim() || "o servidor recusou";
}
