// lib/cs/mencoes-unicas.ts — puro, sem imports: é usado pelo envio (lib/cs/notify.ts).

const so = (s: string) => s.replace(/\D/g, "");

/**
 * A lista `mentioned` sem repetição. A Evolution recusa a MENSAGEM INTEIRA quando a mesma pessoa
 * aparece duas vezes ("mentioned contains duplicate item") — em 30/09 o Vigia de entrega falhou
 * assim: o Julio é gestor de mais de uma conta parada, e o aviso de conta sem gasto não chegou a
 * ninguém. Aplicado no envio (lib/cs/notify.ts), vale para todo aviso com marcação.
 */
export function mencoesUnicas(jids: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const j of jids ?? []) {
    const t = (j ?? "").trim();
    if (!t) continue;
    const chave = so(t) || t; // "5522…@s.whatsapp.net" e "5522…" são a mesma pessoa
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(t);
  }
  return out;
}
