// lib/whatsapp/grupo-compartilhado.ts — dois cadastros, um grupo.
//
// Bazar Ribeiro Maricá e Saquarema dividem um grupo de WhatsApp; Veneza Estofados e Veneza Nova
// Iguaçu também (de propósito). Rotina que manda "um por cliente" manda duas vezes no mesmo grupo —
// foi o que o calendário do mês fazia. O client-messages já deduplicava por grupo à mão; aqui fica a
// regra pra quem mais precisar (21/10/2026). Puro: sem banco, sem rede.

export interface GrupoDeClientes<T> {
  jid: string;
  /** Na ordem em que chegaram — o primeiro é quem "assina" o envio no registro. */
  clientes: T[];
}

/** Agrupa por grupo de WhatsApp, na ordem em que cada grupo aparece. Quem não tem grupo fica de fora. */
export function agruparPorGrupo<T extends { whatsapp_group_jid?: string | null }>(lista: readonly T[]): GrupoDeClientes<T>[] {
  const porJid = new Map<string, T[]>();
  for (const c of lista) {
    const jid = c.whatsapp_group_jid;
    if (!jid) continue;
    const arr = porJid.get(jid);
    if (arr) arr.push(c); else porJid.set(jid, [c]);
  }
  return [...porJid.entries()].map(([jid, clientes]) => ({ jid, clientes }));
}

/** "A" · "A e B" · "A, B e C". Nome repetido entra uma vez só. */
export function juntarNomes(nomes: readonly string[]): string {
  const unicos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))];
  if (unicos.length <= 1) return unicos[0] ?? "";
  return `${unicos.slice(0, -1).join(", ")} e ${unicos[unicos.length - 1]}`;
}
