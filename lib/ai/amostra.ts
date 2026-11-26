// lib/ai/amostra.ts — guarda uma AMOSTRA dos pedidos reais à OpenAI, para comparar modelo atual × novo.
//
// POR QUE (leva 1-M, 26/11/2026). gpt-4o e gpt-4o-mini saem da API em 14/01/2027. Trocar o modelo de
// 45 agentes "no escuro" arrisca JSON que muda de forma, resposta cortada (modelo de raciocínio gasta
// tokens pensando) e tom diferente com o cliente. Com o interruptor ligado, 1 de cada N chamadas fica em
// llm_amostras (14 dias), e lib/ai/comparar.ts reenvia ao candidato.
//
// Desligado por padrão: sem a chave `ia_amostra` em agency_settings, nada é guardado. Valor = N.
// NUNCA atrapalha a chamada: tudo aqui é "atira e esquece", com erro só no log.
// Imagem embutida (data:...) não é guardada — vira "[imagem inline]" e a amostra fica não reenviável.

export const CHAVE_AMOSTRA = "ia_amostra";
export const DIAS_DA_AMOSTRA = 14;
const CACHE_MS = 5 * 60_000;
const IMAGEM_INLINE = "[imagem inline]";

/** "50" → 50 (1 em 50). Vazio, "off", 0, negativo ou lixo → null (desligado). Teto 1 em 1. */
export function taxaDe(valor: string | null | undefined): number | null {
  const v = (valor ?? "").trim().toLowerCase();
  if (!v || v === "off") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : null;
}

export function deveAmostrar(n: number | null, sorteio = Math.random()): boolean {
  return !!n && sorteio < 1 / n;
}

/** Cópia do corpo sem imagem embutida. `reenviavel` = false quando alguma foi trocada. */
export function limparCorpo(corpo: unknown): { corpo: unknown; reenviavel: boolean } {
  let reenviavel = true;
  const limpar = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v.startsWith("data:")) { reenviavel = false; return IMAGEM_INLINE; }
      return v;
    }
    if (Array.isArray(v)) return v.map(limpar);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x)]));
    return v;
  };
  return { corpo: limpar(corpo), reenviavel };
}

let taxaEmCache: { n: number | null; ate: number } | null = null;

async function taxaAtual(): Promise<number | null> {
  if (taxaEmCache && taxaEmCache.ate > Date.now()) return taxaEmCache.n;
  let n: number | null = null;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const { data, error } = await supabaseAdmin.from("agency_settings").select("value").eq("key", CHAVE_AMOSTRA).maybeSingle();
    if (error) throw new Error(error.message);
    n = taxaDe(data?.value as string | null);
  } catch (err) {
    console.error("[amostra] não li o interruptor (fica desligado):", err instanceof Error ? err.message : err);
  }
  taxaEmCache = { n, ate: Date.now() + CACHE_MS };
  return n;
}

/** Só para teste. */
export function _zerarCacheDaAmostra(): void { taxaEmCache = null; }

export interface Amostra { origem: string; modelo: string; corpo: unknown; resposta: string | null; ok: boolean }

/** Atira e esquece. Nunca lança. */
export function guardarAmostra(a: Amostra): void {
  void (async () => {
    try {
      if (!deveAmostrar(await taxaAtual())) return;
      const { supabaseAdmin } = await import("@/lib/supabase/server");
      const { corpo, reenviavel } = limparCorpo(a.corpo);
      const { error } = await supabaseAdmin.from("llm_amostras").insert({ origem: a.origem, modelo: a.modelo, corpo, resposta: a.resposta, ok: a.ok, reenviavel });
      if (error) { console.error("[amostra] não gravei:", error.message); return; }
      if (Math.random() < 1 / 50) {
        const limite = new Date(Date.now() - DIAS_DA_AMOSTRA * 86_400_000).toISOString();
        const { error: e2 } = await supabaseAdmin.from("llm_amostras").delete().lt("created_at", limite);
        if (e2) console.error("[amostra] não apaguei as velhas:", e2.message);
      }
    } catch (err) {
      console.error("[amostra] falhou:", err instanceof Error ? err.message : err);
    }
  })();
}
