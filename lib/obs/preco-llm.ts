// lib/obs/preco-llm.ts — quanto custou UMA chamada, em dólar, a partir do `usage` que a OpenAI devolve.
//
// Preço por 1M de tokens (tabela pública da OpenAI). Modelo fora da tabela → custo null, e a
// execução fica marcada como "custo incompleto" — melhor que inventar um número que vira fato num
// painel. Quando o Roberto trocar de modelo, é aqui que se acrescenta a linha.

export interface PrecoModelo { entrada: number; cache: number; saida: number; estimado?: boolean }

const POR_MILHAO: Record<string, PrecoModelo> = {
  "gpt-4o-mini": { entrada: 0.15, cache: 0.075, saida: 0.60 },
  "gpt-4o": { entrada: 2.50, cache: 1.25, saida: 10.00 },
  "gpt-4.1": { entrada: 2.00, cache: 0.50, saida: 8.00 },
  "gpt-4.1-mini": { entrada: 0.40, cache: 0.10, saida: 1.60 },
  "gpt-4.1-nano": { entrada: 0.10, cache: 0.025, saida: 0.40 },
  "gpt-5": { entrada: 1.25, cache: 0.125, saida: 10.00 },
  "gpt-5-mini": { entrada: 0.25, cache: 0.025, saida: 2.00 },
  "gpt-5-nano": { entrada: 0.05, cache: 0.005, saida: 0.40 },
  // gpt-5.4-* está em uso (3 pontos) e não tenho a tabela deles: assumo a família 5 e marco como
  // estimado — o painel mostra o "~". Confirmar em platform.openai.com/docs/pricing.
  "gpt-5.4-mini": { entrada: 0.25, cache: 0.025, saida: 2.00, estimado: true },
  "gpt-5.4-nano": { entrada: 0.05, cache: 0.005, saida: 0.40, estimado: true },
  "o3": { entrada: 2.00, cache: 0.50, saida: 8.00 },
  "o4-mini": { entrada: 1.10, cache: 0.275, saida: 4.40 },
};

/** "gpt-4o-mini-2024-07-18" → "gpt-4o-mini". */
export function modeloBase(modelo: string): string {
  const m = modelo.trim().toLowerCase();
  if (POR_MILHAO[m]) return m;
  const semData = m.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (POR_MILHAO[semData]) return semData;
  // prefixo mais longo que case (gpt-5.4-mini-preview → gpt-5.4-mini)
  const chaves = Object.keys(POR_MILHAO).sort((a, b) => b.length - a.length);
  return chaves.find((k) => m.startsWith(k + "-")) ?? m;
}

export function precoDe(modelo: string): PrecoModelo | null {
  return POR_MILHAO[modeloBase(modelo)] ?? null;
}

export interface UsageOpenAi {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

/** Custo em USD, ou null se o modelo não está na tabela. Tokens em cache pagam o preço de cache. */
export function custoUsd(modelo: string, usage: UsageOpenAi | undefined | null): number | null {
  const p = precoDe(modelo);
  if (!p || !usage) return p ? 0 : null;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const entrada = Math.max(0, (usage.prompt_tokens ?? 0) - cached);
  const saida = usage.completion_tokens ?? 0;
  return (entrada * p.entrada + cached * p.cache + saida * p.saida) / 1_000_000;
}
