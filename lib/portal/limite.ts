// lib/portal/limite.ts — limite de tentativas em memória das rotas PÚBLICAS (portal, ficha, Instagram).
//
// Cada rota tinha o próprio Map, chaveado no token ANTES de validar e nunca limpo: qualquer string
// na URL virava uma entrada eterna. Aqui a chave só entra depois de validada (quem chama garante)
// e as entradas vencidas saem sozinhas.

interface Entrada { count: number; reset: number; bloqueadoAte?: number; falhas?: number }

const LIMPEZA_MS = 60_000;
// Teto de segurança: a chave é validada antes, mas IP não é — um varredor não pode crescer o Map sem fim.
const MAX_CHAVES = 20_000;

export interface Limite {
  /** Conta uma tentativa. `true` = passou do limite (responder 429). */
  estourou(chave: string, agora?: number): boolean;
  /** Quantas entradas estão guardadas (para teste). */
  tamanho(): number;
}

export function criarLimite(max: number, janelaMs: number): Limite {
  const mapa = new Map<string, Entrada>();
  let proximaLimpeza = 0;

  function limpar(agora: number) {
    if (agora < proximaLimpeza && mapa.size < MAX_CHAVES) return;
    proximaLimpeza = agora + LIMPEZA_MS;
    for (const [k, e] of mapa) if (e.reset < agora) mapa.delete(k);
    if (mapa.size >= MAX_CHAVES) mapa.clear();
  }

  return {
    estourou(chave, agora = Date.now()) {
      limpar(agora);
      const e = mapa.get(chave);
      if (!e || e.reset < agora) { mapa.set(chave, { count: 1, reset: agora + janelaMs }); return false; }
      if (e.count >= max) return true;
      e.count++;
      return false;
    },
    tamanho: () => mapa.size,
  };
}

export interface Trava {
  /** Está travado agora? Devolve os segundos que faltam (0 = livre). */
  travado(chave: string, agora?: number): number;
  /** Registra uma tentativa errada; ao chegar em `maxFalhas` trava por `travaMs`. */
  falhou(chave: string, agora?: number): void;
  /** Acertou: zera o histórico de erros da chave. */
  acertou(chave: string): void;
  tamanho(): number;
}

/** Trava por tentativas ERRADAS (PIN): N erros dentro da janela → bloqueio longo. */
export function criarTrava(maxFalhas: number, janelaMs: number, travaMs: number): Trava {
  const mapa = new Map<string, Entrada>();
  let proximaLimpeza = 0;

  function limpar(agora: number) {
    if (agora < proximaLimpeza && mapa.size < MAX_CHAVES) return;
    proximaLimpeza = agora + LIMPEZA_MS;
    for (const [k, e] of mapa) if (e.reset < agora && (e.bloqueadoAte ?? 0) < agora) mapa.delete(k);
    if (mapa.size >= MAX_CHAVES) mapa.clear();
  }

  return {
    travado(chave, agora = Date.now()) {
      limpar(agora);
      const ate = mapa.get(chave)?.bloqueadoAte ?? 0;
      return ate > agora ? Math.ceil((ate - agora) / 1000) : 0;
    },
    falhou(chave, agora = Date.now()) {
      let e = mapa.get(chave);
      if (!e || e.reset < agora) { e = { count: 0, reset: agora + janelaMs }; mapa.set(chave, e); }
      e.count++;
      if (e.count >= maxFalhas) { e.bloqueadoAte = agora + travaMs; e.count = 0; e.reset = agora + travaMs; }
    },
    acertou(chave) { mapa.delete(chave); },
    tamanho: () => mapa.size,
  };
}

/** IP de quem chamou. Atrás de Cloudflare → Nginx, o cf-connecting-ip é o único que o cliente não forja. */
export function ipDe(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim()
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")?.trim()
    || "desconhecido";
}
