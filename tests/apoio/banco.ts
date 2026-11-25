// tests/apoio/banco.ts — um Supabase em memória para testar as ROTAS de verdade (Onda 4). Uso:
//   const { banco } = vi.hoisted(() => ({ banco: {} as Banco }));
//   vi.mock("@/lib/supabase/server", async () => ({ supabaseAdmin: (await import("./apoio/banco")).criarBanco(banco) }));
// Imita o que já enganou teste aqui: só volta coluna pedida, gatilho de updated_at, id repetido é erro, página de range.

type Linha = Record<string, unknown>;
type Erro = { message: string; code?: string };
type Resposta = { data: unknown; error: Erro | null };

export interface Banco {
  t: Record<string, Linha[]>;
  /** "tabela" (leitura) ou "insert:tabela", "update:tabela", "delete:tabela" que devem falhar. */
  falha: Set<string>;
  /** Roda uma vez, logo antes de uma gravação na tabela: alguém mexeu no meio. */
  noMeio: { tabela: string; f: () => void } | null;
  escritas: string[];
  rpc: (nome: string, args: Linha) => Resposta;
  seq: number;
}

export function zerar(b: Banco, t: Record<string, Linha[]> = {}): void {
  Object.assign(b, { t, falha: new Set<string>(), noMeio: null, escritas: [], seq: 0, rpc: () => ({ data: null, error: { message: "sem rpc" } }) });
}

const valor = (r: Linha, caminho: string) => r[caminho] ?? null;

export function criarBanco(b: Banco) {
  const from = (tabela: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let dados: Linha[] = [], patch: Linha = {}, cols: string[] | null = null, pediuLinhas = false;
    let ordem: { c: string; asc: boolean } | null = null, max: number | null = null, faixa: [number, number] | null = null;
    const f: ((r: Linha) => boolean)[] = [];
    const exec = (): Resposta => {
      const t = (b.t[tabela] ??= []);
      if (op !== "select") {
        b.escritas.push(`${op}:${tabela}`);
        if (b.noMeio?.tabela === tabela) { const m = b.noMeio; b.noMeio = null; m.f(); }
      }
      if (b.falha.has(op === "select" ? tabela : `${op}:${tabela}`)) return { data: null, error: { message: `${tabela} fora do ar` } };
      if (op === "insert") {
        const novas = dados.map((d) => ({ id: `${tabela}-${++b.seq}`, created_at: new Date(Date.UTC(2026, 10, 25) + ++b.seq).toISOString(), ...d }));
        if (novas.some((n) => t.some((r) => r.id === n.id))) return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        t.push(...novas);
        return { data: novas.map((n) => ({ ...n })), error: null };
      }
      let alvo = t.filter((r) => f.every((x) => x(r)));
      if (op === "update") alvo.forEach((r) => Object.assign(r, patch, "updated_at" in r || "updated_at" in patch ? { updated_at: `banco-${++b.seq}` } : {}));
      if (op === "delete") b.t[tabela] = t.filter((r) => !alvo.includes(r));
      if (ordem) { const { c, asc } = ordem; alvo = [...alvo].sort((x, y) => (String(valor(x, c) ?? "") < String(valor(y, c) ?? "") ? -1 : 1) * (asc ? 1 : -1)); }
      if (faixa) alvo = alvo.slice(faixa[0], faixa[1] + 1);
      if (max != null) alvo = alvo.slice(0, max);
      const c = cols;
      return { data: op !== "select" && !pediuLinhas ? null : alvo.map((r) => (c ? Object.fromEntries(c.map((k) => [k, valor(r, k)])) : { ...r })), error: null };
    };
    const q: Record<string, unknown> = {};
    const enc = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => { fn(...a); return q; };
    Object.assign(q, {
      select: enc((c?: string) => { pediuLinhas = true; cols = c && c !== "*" && !c.includes("(") ? c.split(",").map((x) => x.trim()) : null; }),
      insert: enc((d: Linha | Linha[]) => { op = "insert"; dados = Array.isArray(d) ? d : [d]; }),
      update: enc((d: Linha) => { op = "update"; patch = d; }),
      delete: enc(() => { op = "delete"; }),
      eq: enc((c: string, v: unknown) => { f.push((r) => valor(r, c) === v && v !== null); }),
      neq: enc((c: string, v: unknown) => { f.push((r) => valor(r, c) !== v); }),
      is: enc((c: string, v: unknown) => { f.push((r) => valor(r, c) === v); }),
      in: enc((c: string, v: unknown[]) => { f.push((r) => v.includes(valor(r, c))); }),
      gte: enc((c: string, v: string) => { f.push((r) => String(valor(r, c) ?? "") >= v); }),
      lte: enc((c: string, v: string) => { f.push((r) => String(valor(r, c) ?? "") <= v); }),
      not: enc((c: string, o: string, v: unknown) => { f.push((r) => (o === "is" ? valor(r, c) !== v : !String(v).includes(String(valor(r, c))))); }),
      contains: enc((c: string, v: Linha) => { f.push((r) => { const o = r[c] as Linha | null; return !!o && Object.entries(v).every(([k, x]) => o[k] === x); }); }),
      or: enc(() => {}),
      order: enc((c: string, o?: { ascending?: boolean }) => { ordem ??= { c, asc: o?.ascending ?? true }; }),
      limit: enc((n: number) => { max = n; }),
      range: enc((de: number, ate: number) => { faixa = [de, ate]; }),
      maybeSingle: async () => { const r = exec(); return { ...r, data: (r.data as Linha[] | null)?.[0] ?? null }; },
      single: async () => { const r = exec(); const l = (r.data as Linha[] | null)?.[0] ?? null; return { data: l, error: r.error ?? (l ? null : { message: "nenhuma linha" }) }; },
      then: (ok: (v: Resposta) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve().then(exec).then(ok, erro),
    });
    return q;
  };
  return { from, rpc: async (nome: string, args: Linha) => { b.escritas.push(`rpc:${nome}`); return b.rpc(nome, args); }, storage: { from: () => ({ download: async () => ({ data: null, error: { message: "sem storage" } }) }) } };
}
