// lib/scores/ler-tudo.ts — lê TODAS as linhas de uma consulta, página a página (25/10/2026, auditoria 6.1).
//
// O corpus de 180 dias do Loninho vinha numa leitura só, em ordem crescente. Com o teto de linhas do PostgREST
// (`max_rows`), só voltariam as MAIS ANTIGAS — e o "último contato" de cada cliente ficaria meses atrasado, gravado
// como saúde. O teto não aparece no código: o supabase-js não impõe limite, quem corta é o servidor. O
// supabase/config.toml (ambiente local) tem `max_rows = 1000`; o docker-compose de produção
// (infrastructure/supabase/docker-compose.yml) não define PGRST_DB_MAX_ROWS — sem o banco não dá para garantir qual
// vale lá. Por isso pagina sempre, e de um jeito que funciona com QUALQUER teto:
//   • a primeira página pede a contagem exata (`count: "exact"`);
//   • cada página começa onde a anterior terminou (pelo que veio, não pelo tamanho pedido) — um teto menor que a
//     página não encerra a leitura antes da hora;
//   • para quando leu a contagem, ou quando uma página volta vazia.
// Erro em qualquer página LANÇA: metade do corpus com cara de corpus inteiro é o mesmo erro de antes.

export interface PaginaLida<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

export async function lerTodasAsLinhas<T>(
  /** Monta a consulta com `.range(de, ate)`; `contar` = pedir `{ count: "exact" }` no select (só a 1ª página). */
  montar: (de: number, ate: number, contar: boolean) => PromiseLike<PaginaLida<T>>,
  opcoes: { pagina?: number; maximo?: number } = {},
): Promise<T[]> {
  const pagina = opcoes.pagina ?? 1000;
  const maximo = opcoes.maximo ?? 200_000;
  const linhas: T[] = [];
  let total: number | null = null;
  for (let primeira = true; ; primeira = false) {
    const r = await montar(linhas.length, linhas.length + pagina - 1, primeira);
    if (r.error) throw new Error(r.error.message);
    if (primeira && typeof r.count === "number") total = r.count;
    const lote = r.data ?? [];
    linhas.push(...lote);
    if (lote.length === 0) break;
    if (total !== null ? linhas.length >= total : lote.length < pagina) break;
    if (linhas.length >= maximo) throw new Error(`mais de ${maximo} linhas — leitura interrompida`);
  }
  return linhas;
}
