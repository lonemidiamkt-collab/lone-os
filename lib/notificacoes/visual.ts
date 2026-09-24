// Quem aparece no avatar de cada notificação: o cliente, a IA ou a pessoa do time. Tudo puro.

/** Minúsculas, sem acento, só letras/números separados por um espaço. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

// ─── Clientes ──────────────────────────────────────────────────────────────

export interface ClienteBusca {
  id: string;
  name: string;
  nomeFantasia?: string | null;
}

export interface BuscaDeClientes<T> {
  /** O cliente de nome mais longo citado no texto ("Óticas Raki" vence "Raki"). */
  umNoTexto(texto: string | null | undefined): T | null;
  /** Todos os citados, na ordem em que aparecem, sem repetir e sem contar nome dentro de nome. */
  todosNoTexto(texto: string | null | undefined): T[];
}

const MIN_NOME_CLIENTE = 4;

export function buscaDeClientes<T extends ClienteBusca>(clientes: readonly T[]): BuscaDeClientes<T> {
  const nomes: { c: T; n: string }[] = [];
  for (const c of clientes) {
    for (const nome of new Set([normalizar(c.name), normalizar(c.nomeFantasia)])) {
      if (nome.length >= MIN_NOME_CLIENTE) nomes.push({ c, n: nome });
    }
  }
  nomes.sort((a, b) => b.n.length - a.n.length);

  return {
    umNoTexto(texto) {
      const alvo = ` ${normalizar(texto)} `;
      return nomes.find(({ n }) => alvo.includes(` ${n} `))?.c ?? null;
    },
    todosNoTexto(texto) {
      const alvo = ` ${normalizar(texto)} `;
      const ocupado: [number, number][] = [];
      const achados: { c: T; pos: number }[] = [];
      for (const { c, n } of nomes) {
        let de = 0;
        for (;;) {
          const i = alvo.indexOf(` ${n} `, de);
          if (i < 0) break;
          const fim = i + n.length + 1;
          if (!ocupado.some(([a, b]) => i < b && fim > a)) {
            ocupado.push([i, fim]);
            achados.push({ c, pos: i });
          }
          de = i + 1;
        }
      }
      const vistos = new Set<string>();
      return achados
        .sort((a, b) => a.pos - b.pos)
        .filter(({ c }) => (vistos.has(c.id) ? false : (vistos.add(c.id), true)))
        .map(({ c }) => c);
    },
  };
}

/** URL exibível da logo: `logo`, senão `docLogo`. Nada de PDF nem caminho do cofre privado. */
export function logoDoCliente(c: { logo?: string | null; docLogo?: string | null } | null | undefined): string | null {
  for (const bruto of [c?.logo, c?.docLogo]) {
    const u = (bruto ?? "").trim();
    if (!u || /\.pdf(\?|#|$)/i.test(u)) continue;
    if (/^(https?:)?\/\//i.test(u) || u.startsWith("/") || u.startsWith("data:image/")) return u;
  }
  return null;
}

// ─── IA e entregas ─────────────────────────────────────────────────────────

/** Aviso escrito pela IA: "(IA)", "a IA", "Loninho", "Agente CS", 🤖. "IA" só em maiúsculas — "ia" é verbo. */
export function ehDeIA(titulo: string | null | undefined, corpo?: string | null): boolean {
  const t = `${titulo ?? ""} ${corpo ?? ""}`;
  return /🤖/u.test(t)
    || /\(ia\)/i.test(t)
    || /(^|[^\p{L}\p{N}])IA(?=$|[^\p{L}\p{N}])/u.test(t)
    || /loninho/i.test(t)
    || /(^|[^\p{L}])agentes?(?=$|[^\p{L}])/iu.test(t);
}

/** O título do próprio sistema ("Arte entregue pelo Designer") — sinal forte, dispensa o card. */
export function tituloDeEntregaDeDesigner(titulo: string | null | undefined): boolean {
  return /arte\s+(entregue|atualizada)\s+pel[oa]\s+designer/i.test(titulo ?? "");
}

export function ehEntregaDeDesigner(titulo: string | null | undefined, corpo?: string | null): boolean {
  if (tituloDeEntregaDeDesigner(titulo)) return true;
  const t = `${titulo ?? ""} ${corpo ?? ""}`;
  return /(^|[^\p{L}])entregou(?=$|[^\p{L}])/iu.test(t) || /arte\s+pronta/i.test(t);
}

export function ehAtualizacaoDeArte(titulo: string | null | undefined): boolean {
  return /atualizad|atualizou/i.test(titulo ?? "");
}

/** "Rodrigo enviou a arte de …" → "Rodrigo" (o aviso local não carrega o card). */
export function autorNoCorpo(corpo: string | null | undefined): string | null {
  const m = (corpo ?? "").match(/^\s*(.+?)\s+(?:enviou|atualizou|entregou)\s+a\s+arte\b/i);
  return m ? m[1].trim() : null;
}

/** Card e cliente citados no corpo: `"SEX 25" (Contele) — v1…` ou `a arte de "SEX 25" para Contele. Social…`. */
export function cardDoCorpo(corpo: string | null | undefined): { titulo: string; cliente: string | null } | null {
  const t = corpo ?? "";
  const m = t.match(/"([^"]+)"\s*\(([^)]+)\)/) ?? t.match(/"([^"]+)"\s+para\s+(.+?)\.(?:\s+Social\b|\s*$)/i);
  if (m) return { titulo: m[1].trim(), cliente: m[2].trim() };
  const s = t.match(/"([^"]+)"/);
  return s ? { titulo: s[1].trim(), cliente: null } : null;
}

export function tituloDaEntrega(nome: string, atualizacao = false): string {
  return `${primeiroNome(nome) || nome} ${atualizacao ? "atualizou" : "entregou"} a arte`;
}

export function corpoDaEntrega(tituloCard: string, cliente?: string | null): string {
  return cliente ? `${tituloCard} · ${cliente}` : tituloCard;
}

// ─── Pessoas do time ───────────────────────────────────────────────────────

export interface PessoaRef {
  id: string;
  name: string;
  email?: string | null;
}

/** Perfil pelo nome (ou e-mail): exato sem acento/caixa; senão o primeiro nome, se só um do time o tem. */
export function perfilPorNome<T extends PessoaRef>(nome: string | null | undefined, perfis: readonly T[]): T | null {
  const bruto = (nome ?? "").trim();
  if (!bruto) return null;
  if (bruto.includes("@")) return perfis.find((p) => p.email?.toLowerCase() === bruto.toLowerCase()) ?? null;
  const n = normalizar(bruto);
  const exato = perfis.find((p) => normalizar(p.name) === n);
  if (exato) return exato;
  const pn = n.split(" ")[0];
  const mesmos = perfis.filter((p) => normalizar(p.name).split(" ")[0] === pn);
  return mesmos.length === 1 ? mesmos[0] : null;
}

/**
 * Pessoa do time que abre o corpo ("Carlos confirmou a arte…"). A palavra seguinte precisa ser
 * minúscula: "Carlos Autopeças avisou" é um cliente, não o Carlos.
 */
export function pessoaNoInicio<T extends PessoaRef>(corpo: string | null | undefined, perfis: readonly T[]): T | null {
  const palavras = (corpo ?? "").trim().split(/\s+/);
  let melhor: T | null = null;
  let tam = 0;
  for (const p of perfis) {
    for (const nome of new Set([p.name, primeiroNome(p.name)])) {
      const partes = normalizar(nome).split(" ").filter(Boolean);
      if (!partes.length || partes.join(" ").length < 3 || partes.length <= tam) continue;
      const inicio = normalizar(palavras.slice(0, partes.length).join(" "));
      const seguinte = palavras[partes.length] ?? "";
      if (inicio === partes.join(" ") && /^\p{Ll}/u.test(seguinte)) { melhor = p; tam = partes.length; }
    }
  }
  return melhor;
}

// ─── Iniciais e cor ────────────────────────────────────────────────────────

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "&"]);

export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "")
    .split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter((p) => p && !LIGACOES.has(p.toLowerCase()));
  if (!partes.length) return "?";
  const letras = partes.length === 1 ? [partes[0][0]] : [partes[0][0], partes[1][0]];
  return letras.join("").toUpperCase();
}

/** Tom 1..5 (os tokens chart-*) fixo por nome — o mesmo cliente tem sempre a mesma cor. */
export function tomDoNome(nome: string | null | undefined): 1 | 2 | 3 | 4 | 5 {
  let h = 5381;
  for (const ch of normalizar(nome)) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return ((h % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

/** Fundo e texto das iniciais: a tinta do tom misturada ao card e ao foreground, legível nos dois temas. */
export function estiloDasIniciais(nome: string | null | undefined): { backgroundColor: string; color: string } {
  const tom = `var(--chart-${tomDoNome(nome)})`;
  return {
    backgroundColor: `color-mix(in srgb, ${tom} 18%, var(--card))`,
    color: `color-mix(in srgb, ${tom} 62%, var(--foreground))`,
  };
}
