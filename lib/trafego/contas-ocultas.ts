// lib/trafego/contas-ocultas.ts — a lista de contas ocultas (agency_settings.hidden_ad_accounts). Puro.
// 25/10/2026 (auditoria 9.7): mexer numa conta só, e lista ilegível é erro — nunca "nenhuma oculta".

/** Lê o valor guardado. Vazio = lista vazia; JSON quebrado ou que não é lista = erro. */
export function lerListaOcultas(bruto: string | null): { ok: true; ids: string[] } | { ok: false; erro: string } {
  if (bruto == null || bruto === "") return { ok: true, ids: [] };
  try {
    const v = JSON.parse(bruto);
    if (!Array.isArray(v)) return { ok: false, erro: "o valor guardado não é uma lista" };
    return { ok: true, ids: v.filter((x): x is string => typeof x === "string") };
  } catch {
    return { ok: false, erro: "o valor guardado está ilegível" };
  }
}

/** Acrescenta (ocultar) ou tira (mostrar) UMA conta, sem mexer nas outras. */
export function alternarNaLista(ids: readonly string[], id: string, ocultar: boolean): string[] {
  const sem = ids.filter((x) => x !== id);
  return ocultar ? [...sem, id] : sem;
}
