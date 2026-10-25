// tests/helpers/banco-em-memoria.ts — um supabaseAdmin de mentira, em memória, para testar a parte
// que GRAVA (lib/*-server.ts) sem banco. Mesmo espírito do de conteudo-producao-server.test.ts, com
// chave única (o 23505 do Postgres) e erro forçado por tabela.

export type Linha = Record<string, unknown>;

export function bancoEmMemoria(opcoes: { unicas?: Record<string, string[]> } = {}) {
  const db: Record<string, Linha[]> = {};
  const falhar: Record<string, { op: string; erro: { message: string; code?: string } }> = {};
  let seq = 0;

  class Consulta {
    private filtros: ((r: Linha) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    private dados: Linha | Linha[] | null = null;
    private ordem: { col: string; asc: boolean } | null = null;
    private max: number | null = null;
    constructor(private tabela: string) { db[tabela] ??= []; }
    select() { return this; }
    eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
    neq(c: string, v: unknown) { this.filtros.push((r) => r[c] !== v); return this; }
    is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
    in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
    gte(c: string, v: string) { this.filtros.push((r) => String(r[c] ?? "") >= v); return this; }
    gt(c: string, v: string) { this.filtros.push((r) => String(r[c] ?? "") > v); return this; }
    or() { return this; }
    not() { return this; }
    order(c: string, o?: { ascending?: boolean }) { this.ordem = { col: c, asc: o?.ascending ?? true }; return this; }
    limit(n: number) { this.max = n; return this; }
    insert(d: Linha | Linha[]) { this.op = "insert"; this.dados = d; return this; }
    upsert(d: Linha | Linha[]) { this.op = "upsert"; this.dados = d; return this; }
    update(d: Linha) { this.op = "update"; this.dados = d; return this; }
    delete() { this.op = "delete"; return this; }
    maybeSingle() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
    single() {
      return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error ?? (r.data?.[0] ? null : { message: "nada" }) }));
    }
    then<T>(ok: (r: { data: Linha[] | null; error: { message: string; code?: string } | null }) => T, erro?: (e: unknown) => T) {
      return this.exec().then(ok, erro);
    }
    private async exec(): Promise<{ data: Linha[] | null; error: { message: string; code?: string } | null }> {
      const f = falhar[this.tabela];
      if (f && (f.op === this.op || f.op === "*")) return { data: null, error: f.erro };
      const t = db[this.tabela];
      if (this.op === "insert" || this.op === "upsert") {
        const novas = (Array.isArray(this.dados) ? this.dados : [this.dados!]).map((d): Linha => ({
          id: `${this.tabela}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...d,
        }));
        for (const nova of novas) {
          for (const col of opcoes.unicas?.[this.tabela] ?? []) {
            if (t.some((r) => r[col] === nova[col])) {
              if (this.op === "upsert") return { data: [], error: null }; // ignoreDuplicates
              return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
            }
          }
        }
        t.push(...novas);
        return { data: novas.map((r) => ({ ...r })), error: null };
      }
      let alvo = t.filter((r) => this.filtros.every((fn) => fn(r)));
      if (this.op === "update") { alvo.forEach((r) => Object.assign(r, this.dados)); return { data: alvo.map((r) => ({ ...r })), error: null }; }
      if (this.op === "delete") { db[this.tabela] = t.filter((r) => !alvo.includes(r)); return { data: alvo, error: null }; }
      if (this.ordem) {
        const { col, asc } = this.ordem;
        alvo = [...alvo].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (asc ? 1 : -1));
      }
      if (this.max != null) alvo = alvo.slice(0, this.max);
      return { data: alvo.map((r) => ({ ...r })), error: null };
    }
  }

  return {
    db,
    supabaseAdmin: { from: (t: string) => new Consulta(t) },
    /** Faz a próxima operação `op` (ou "*") na tabela devolver este erro, até `limpar()`. */
    falharEm(tabela: string, op: string, erro: { message: string; code?: string }) { falhar[tabela] = { op, erro }; },
    limpar() {
      for (const k of Object.keys(db)) delete db[k];
      for (const k of Object.keys(falhar)) delete falhar[k];
    },
  };
}
