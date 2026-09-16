// lib/prospeccao/normalizar.ts — uma empresa, uma linha (§25). Aqui mora o que decide se dois
// achados são a mesma empresa: CNPJ, Instagram, telefone ou nome+cidade canônicos.

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Nome canônico: minúsculo, sem acento, sem sufixo societário, sem pontuação. */
export function nomeCanonico(nome: string | null | undefined): string {
  if (!nome) return "";
  return semAcento(nome)
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|comércio|de|do|da|dos|das|e|&)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const cidadeCanonica = (c: string | null | undefined) => nomeCanonico(c);

/** Só dígitos do CNPJ; null se não tiver 14 dígitos válidos. */
export function cnpjLimpo(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length !== 14) return null;
  if (/^(\d)\1{13}$/.test(d)) return null;
  return cnpjValido(d) ? d : null;
}

export function cnpjValido(d: string): boolean {
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, ch, i) => acc + Number(ch) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const d1 = calc(d.slice(0, 12), p1);
  const d2 = calc(d.slice(0, 12) + d1, p2);
  return d.endsWith(`${d1}${d2}`);
}

export function cnpjFormatado(d: string | null | undefined): string {
  if (!d || d.length !== 14) return d ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Telefone brasileiro → dígitos com DDI (55 + DDD + número). null se não parecer telefone.
 * Aceita "(22) 99999-9999", "22 2665 1234", "+55 22 9 9999-9999", "5522999999999".
 */
export function telefoneDigitos(v: string | null | undefined): string | null {
  if (!v) return null;
  let d = v.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  return null;
}

export const ehCelular = (digitos: string) => digitos.length === 13 && digitos[4] === "9";

export const jidDeTelefone = (digitos: string) => `${digitos}@s.whatsapp.net`;

/** "5522999999999@s.whatsapp.net" → "5522999999999"; "…@lid" → null (LID não é telefone). */
export function telefoneDeJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  if (jid.endsWith("@s.whatsapp.net")) return jid.split("@")[0].split(":")[0];
  return null;
}

/** "@casa.das.telhas" / "instagram.com/casa.das.telhas/" → "casa.das.telhas". */
export function instagramHandle(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v.trim().toLowerCase();
  const m = /instagram\.com\/([a-z0-9._]+)/.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@/, "").replace(/\/.*$/, "");
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

export function siteNormalizado(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (/instagram\.com|facebook\.com|wa\.me|whatsapp\.com/i.test(u.hostname)) return null;
    return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "" : u.pathname}`.replace(/\/$/, "");
  } catch { return null; }
}

export interface ChavesDedup {
  cnpj: string | null;
  instagram: string | null;
  telefone: string | null;
  nomeCidade: string | null;
}

export function chavesDedup(p: {
  cnpj?: string | null; instagram?: string | null; telefone?: string | null; nome?: string | null; cidade?: string | null;
}): ChavesDedup {
  const nome = nomeCanonico(p.nome);
  const cidade = cidadeCanonica(p.cidade);
  return {
    cnpj: cnpjLimpo(p.cnpj),
    instagram: instagramHandle(p.instagram),
    telefone: telefoneDigitos(p.telefone),
    nomeCidade: nome && cidade ? `${nome}|${cidade}` : null,
  };
}

/** Mesma empresa se QUALQUER chave forte coincidir. */
export function mesmaEmpresa(a: ChavesDedup, b: ChavesDedup): boolean {
  if (a.cnpj && b.cnpj) return a.cnpj === b.cnpj;
  if (a.instagram && b.instagram && a.instagram === b.instagram) return true;
  if (a.telefone && b.telefone && a.telefone === b.telefone) return true;
  if (a.nomeCidade && b.nomeCidade && a.nomeCidade === b.nomeCidade) return true;
  return false;
}

/** Distância em km entre duas coordenadas (haversine). */
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** Primeiro nome com inicial maiúscula ("MARCELO FERREIRA DA SILVA" → "Marcelo"). */
export function primeiroNome(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const p = nome.trim().split(/\s+/)[0];
  if (!p) return null;
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** "MARCELO FERREIRA DA SILVA" → "Marcelo Ferreira da Silva". */
export function nomeProprio(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const minusculas = new Set(["da", "de", "do", "das", "dos", "e"]);
  return nome.trim().toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

// Palavras que não identificam ninguém: "Varejão da Construção" e "Varejão Material de Construção"
// são a mesma loja, e o que sobra depois de tirar o genérico ("varejao") é o que diz isso.
const GENERICOS = new Set([
  "material", "materiais", "construcao", "construcoes", "loja", "lojas", "casa", "deposito", "depositos", "distribuidora",
  "distribuidor", "comercial", "atacadao", "atacado", "varejo", "bazar", "center", "home", "ltda", "me", "epp", "eireli",
  "sa", "cia", "comercio", "empresa", "industria", "servicos", "rj", "araruama", "cabo", "frio", "macae", "marica", "rio",
  "ostras", "bonito", "unamar", "tintas", "pisos", "piso", "telhas", "ferragens", "ferragem", "madeireira", "materials",
  "building", "ltd", "de", "do", "da", "dos", "das", "e", "em", "para", "com",
]);

/** Palavras que identificam a empresa (sem genéricos). Vazio → todas as palavras. */
export function palavrasSignificativas(nome: string | null | undefined): string[] {
  const todas = nomeCanonico(nome).split(" ").filter(Boolean);
  const sig = todas.filter((w) => !GENERICOS.has(w) && w.length >= 3);
  return sig.length ? sig : todas;
}

/**
 * "Varejão da Construção" ≈ "Varejão Material de Construção"; "DelRio" ≈ "Del Rio Atacadão do Piso";
 * "Ello" ≈ "Ello Material de Construção". Compara as palavras significativas: se todas as de um
 * nome estão no outro (ou os nomes colados são um prefixo do outro), é a mesma empresa.
 * Falso positivo aqui é barato (deixa de prospectar alguém); falso negativo é mensagem para cliente.
 */
export function nomesParecidos(a: string | null | undefined, b: string | null | undefined): boolean {
  // 1) Nome inteiro colado: "toppisos" ⊂ "toppisoscabofrio", "delrio…" = "del rio…".
  const ja = nomeCanonico(a).replace(/\s/g, ""), jb = nomeCanonico(b).replace(/\s/g, "");
  if (ja.length >= 5 && jb.length >= 5 && (ja === jb || ja.startsWith(jb) || jb.startsWith(ja))) return true;
  // 2) Palavras significativas de um dentro do outro: "varejao" ⊂ "varejao material construcao".
  const pa = palavrasSignificativas(a), pb = palavrasSignificativas(b);
  if (!pa.length || !pb.length) return false;
  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (curto.join("").length < 4) return false;
  return curto.every((w) => longo.includes(w) || longo.some((x) => x.startsWith(w) && w.length >= 5));
}
