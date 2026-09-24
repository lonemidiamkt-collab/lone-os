// lib/conteudo/kit-marca.ts — KIT DA MARCA ao lado da tarefa de arte (Leva 7B, N16).
//
// O designer abria o card, depois a ficha do cliente (paleta, logo), depois o Drive (as últimas
// artes aprovadas) e depois o WhatsApp para lembrar "o que esse cliente não aceita". Aqui tudo isso
// vira um painel só, montado de onde cada coisa já mora:
//   · logo ........... client_brand_assets (logo, variantes) → briefing.logo_url → cadastro (doc_logo/logo)
//   · paleta ......... briefing (paleta_cores) → estilo visual lido das artes (client_visual_style)
//   · tom ............ briefing (tom_voz, pessoa verbal, emoji) → cadastro (tone_of_voice)
//   · não usar ....... briefing (palavras_proibidas, elementos_evitar) + regras de arte (cs_client_rules)
//   · últimas 6 ...... cards do cliente com a arte aprovada (cliente aprovou, agendado ou no ar)
//
// Módulo puro (testado em tests/conteudo-kit-marca.test.ts); a rota é app/api/conteudo/kit-marca.

import { etapaDoStatus } from "./etapas";

export const PECAS_APROVADAS = 6;

export interface CorDaMarca {
  hex: string;
  nome: string;
}

export interface LogoDaMarca {
  url: string;
  nome: string;
}

export interface PecaAprovada {
  cardId: string;
  titulo: string;
  url: string;
  em: string;
}

export interface KitDaMarca {
  clientId: string;
  cliente: string;
  logos: LogoDaMarca[];
  paleta: CorDaMarca[];
  tipografia: string | null;
  tom: string | null;
  naoUsar: string[];
  regrasDeArte: string[];
  resumoVisual: string | null;
  aprovadas: PecaAprovada[];
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" / "ABCDEF" → "#AABBCC". Inválido → null. */
export function normalizarHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(HEX);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

/** A paleta: a do briefing (curada pela equipe) vence; sem ela, a lida das artes pela IA. Sem repetir cor. */
export function paletaDaMarca(briefing: unknown, estilo: unknown): CorDaMarca[] {
  const out: CorDaMarca[] = [];
  const vistos = new Set<string>();
  const add = (hex: unknown, nome: unknown) => {
    const h = normalizarHex(hex);
    if (!h || vistos.has(h)) return;
    vistos.add(h);
    out.push({ hex: h, nome: typeof nome === "string" && nome.trim() ? nome.trim() : h });
  };
  if (Array.isArray(briefing)) for (const c of briefing) add((c as { hex?: unknown })?.hex ?? c, (c as { nome?: unknown })?.nome);
  if (!out.length) {
    const paleta = (estilo as { paleta?: unknown } | null)?.paleta;
    if (Array.isArray(paleta)) for (const c of paleta) add((c as { hex?: unknown })?.hex, (c as { papel?: unknown })?.papel);
  }
  return out.slice(0, 8);
}

const TOM_VOZ: Record<string, string> = {
  formal: "Formal", informal: "Informal", divertido: "Divertido", tecnico: "Técnico", misto: "Misto",
  funny: "Divertido", authoritative: "Autoridade", casual: "Descontraído",
};
const PESSOA: Record<string, string> = { voce: "fala com \"você\"", voces: "fala com \"vocês\"", tu: "fala com \"tu\"", a_gente: "fala como \"a gente\"" };

/** "Informal · fala com "você" · usa emoji" — o que o designer precisa para o texto da arte. */
export function tomDaMarca(b: { tom_voz?: string | null; pessoa_verbal?: string | null; usa_emoji?: boolean | null } | null, cadastro?: string | null): string | null {
  const partes = [
    b?.tom_voz ? TOM_VOZ[b.tom_voz] ?? b.tom_voz : cadastro ? TOM_VOZ[cadastro] ?? cadastro : null,
    b?.pessoa_verbal ? PESSOA[b.pessoa_verbal] ?? null : null,
    b?.usa_emoji === true ? "usa emoji" : b?.usa_emoji === false ? "sem emoji" : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** Palavras e elementos que não entram, sem repetição (ignora caixa). */
export function listaNaoUsar(...listas: unknown[]): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const l of listas) {
    if (!Array.isArray(l)) continue;
    for (const v of l) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      const k = t.toLowerCase();
      if (!t || vistos.has(k)) continue;
      vistos.add(k);
      out.push(t);
    }
  }
  return out.slice(0, 20);
}

export interface CardAprovavel {
  id: string;
  title: string;
  status: string;
  client_approved_at?: string | null;
  publish_verified_at?: string | null;
  scheduled_at?: string | null;
  status_changed_at?: string | null;
  designer_delivered_at?: string | null;
  image_url?: string | null;
}

/** A arte do card foi aprovada? (o cliente aprovou, ou o card já foi agendado/publicado). */
export function arteAprovada(c: CardAprovavel): boolean {
  if (c.client_approved_at) return true;
  const e = etapaDoStatus(c.status);
  return e === "agendado" || e === "no_ar";
}

/**
 * As últimas peças aprovadas, da mais nova para a mais velha, com a 1ª arte ENTREGUE de cada card
 * (a capa legada só quando o card é de antes dos anexos). `excluir` = o card que está aberto.
 */
export function ultimasAprovadas(
  cards: readonly CardAprovavel[],
  artes: ReadonlyMap<string, string>,
  opts: { excluir?: string | null; limite?: number } = {},
): PecaAprovada[] {
  const quando = (c: CardAprovavel) => c.client_approved_at ?? c.publish_verified_at ?? c.scheduled_at ?? c.status_changed_at ?? c.designer_delivered_at ?? "";
  return cards
    .filter((c) => c.id !== opts.excluir && arteAprovada(c))
    .map((c) => ({ c, url: artes.get(c.id) ?? (c.designer_delivered_at && c.image_url && !/drive\.google\.com/.test(c.image_url) ? c.image_url : null) }))
    .filter((x): x is { c: CardAprovavel; url: string } => !!x.url)
    .sort((a, b) => quando(b.c).localeCompare(quando(a.c)))
    .slice(0, opts.limite ?? PECAS_APROVADAS)
    .map(({ c, url }) => ({ cardId: c.id, titulo: c.title, url, em: quando(c) }));
}
