// Chamada à Graph API com TIMEOUT e RETRY.
//
// Por que isto existe: as chamadas do portal do cliente eram `fetch` puro, sem timeout e sem
// retry. Duas consequências reais, medidas em produção:
//
//   1. Sem timeout, quando a Meta engasgava a requisição ficava pendurada até o socket morrer —
//      o cliente abria o link e via spinner eterno ("o link não carrega").
//   2. Sem retry, uma recusa em rajada da Meta zerava TODO MUNDO de uma vez. Em 19/07 e 10/08 o
//      cron das 6h gerou 22 e 25 snapshots com verba R$0 / 0 mensagens / 0 criativos. No dia 10/08
//      ele rodou em 7 SEGUNDOS (o normal é 60-114s) e ainda reportou "errors: 0" — falhou tudo
//      instantaneamente e gravou zero como se fosse resultado.
//
// A Meta limita por app: 25 clientes × 6 chamadas em rajada é exatamente o perfil que ela recusa.
// Recusa por limite é temporária e passa em segundos — por isso o backoff resolve.

/** Erro de chamada à Meta. Diferente de "a conta não gastou nada": aqui a gente NÃO SABE. */
export class MetaApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly retryable: boolean;

  constructor(message: string, opts: { status: number; code?: number | null; retryable: boolean }) {
    super(message);
    this.name = "MetaApiError";
    this.status = opts.status;
    this.code = opts.code ?? null;
    this.retryable = opts.retryable;
  }
}

/** Códigos da Meta que significam "tenta de novo daqui a pouco", não "seu pedido está errado".
 *  1/2 = transitório do lado deles; 4/17/32/613/80000+ = estouro de limite de chamadas. */
const CODIGOS_TEMPORARIOS = new Set([1, 2, 4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006]);

function ehTemporario(status: number, code: number | null): boolean {
  if (status === 429 || status >= 500) return true;
  // A Meta devolve 400 com code de limite quando está te barrando por rajada — parece erro de
  // pedido, mas é temporário. Sem esta linha o retry não pegaria justo o caso que mais dói.
  return code !== null && CODIGOS_TEMPORARIOS.has(code);
}

const TIMEOUT_PADRAO_MS = 12_000;
const TENTATIVAS_PADRAO = 3;

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Busca JSON da Graph API. Lança MetaApiError se não conseguir — nunca devolve vazio disfarçado
 *  de resposta boa, porque é justamente essa confusão que apagava o painel dos clientes. */
export async function metaJson<T = Record<string, unknown>>(
  url: string,
  opts: { label: string; timeoutMs?: number; tentativas?: number } = { label: "meta" },
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const tentativas = opts.tentativas ?? TENTATIVAS_PADRAO;

  let ultimoErro: Error = new MetaApiError(`${opts.label}: falhou`, { status: 0, retryable: true });

  for (let i = 0; i < tentativas; i++) {
    if (i > 0) {
      // Backoff exponencial com jitter: 800ms, 2.4s (+ até 400ms). O jitter evita que os 25
      // clientes do cron voltem todos no mesmo instante e tomem recusa de novo, em manada.
      const base = 800 * 3 ** (i - 1);
      await esperar(base + Math.floor(Math.random() * 400));
    }

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

      if (res.ok) return (await res.json()) as T;

      const corpo = await res.json().catch(() => ({}) as Record<string, unknown>);
      const erroMeta = (corpo as { error?: { code?: number; message?: string } }).error;
      const code = typeof erroMeta?.code === "number" ? erroMeta.code : null;
      const retryable = ehTemporario(res.status, code);

      ultimoErro = new MetaApiError(
        `${opts.label}: HTTP ${res.status}${code ? ` code ${code}` : ""} — ${erroMeta?.message ?? "sem detalhe"}`,
        { status: res.status, code, retryable },
      );

      // Erro definitivo (token inválido, conta sem permissão, parâmetro errado): insistir só
      // queima tempo do cliente que está com o link aberto.
      if (!retryable) throw ultimoErro;
    } catch (err) {
      if (err instanceof MetaApiError) {
        if (!err.retryable) throw err;
        ultimoErro = err;
      } else {
        // Timeout (TimeoutError) ou queda de rede: sempre vale outra tentativa.
        ultimoErro = new MetaApiError(`${opts.label}: ${String(err)}`, { status: 0, retryable: true });
      }
    }
  }

  throw ultimoErro;
}
