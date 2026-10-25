// lib/fichaViva/analise.ts — a estrutura comercial da Ficha Viva (SWOT, prioridades, scripts): edição,
// "Refazer" com a IA e a versão anterior guardada. Puro. Testado em tests/ficha-viva-estrutura.test.ts.
//
// POR QUE (25/10/2026, onda 6 da auditoria de erro recuperável, itens 12.2 e 12.3).
//  · "Refazer" trocava SWOT, prioridades e scripts editados à mão pela nova saída da IA, sem confirmar e
//    sem guardar a anterior. Agora a edição fica marcada (quando e quem), o Refazer pede confirmação
//    quando houve edição, e TODA troca guarda a versão anterior (um nível) — "Voltar à anterior" desfaz.
//  · Os campos "1 por linha" passavam pela conversão a cada tecla: o Enter sumia e não dava para
//    acrescentar item digitando. O rascunho agora guarda o texto cru; a conversão é só ao salvar.
//
// A versão anterior mora dentro do próprio JSON (`anterior`), sem coluna nova: o PDF e o portal leem só
// diagnostico/swot/prioridades/scripts e ignoram o resto.

export interface Swot { forcas: string[]; fraquezas: string[]; oportunidades: string[]; ameacas: string[] }

export interface EstruturaBase {
  diagnostico: string;
  swot: Swot;
  prioridades: string[];
  scripts: string[];
}

/** Marcas de quem fez esta versão. */
export interface MarcasEstrutura {
  /** Quando a IA gerou (Refazer / geração automática). */
  geradoEm?: string | null;
  /** Quando alguém do time editou à mão — e quem. */
  editadoEm?: string | null;
  editadoPor?: string | null;
}

export type VersaoEstrutura = EstruturaBase & MarcasEstrutura;

export interface EstruturaGuardada extends VersaoEstrutura {
  /** A versão que esta substituiu (um nível só). */
  anterior?: VersaoEstrutura | null;
}

const lista = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const quando = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Só o conteúdo, no formato certo — não confia em quem mandou. */
export function normalizarEstrutura(a: unknown): EstruturaBase {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const s = (o.swot && typeof o.swot === "object" ? o.swot : {}) as Record<string, unknown>;
  return {
    diagnostico: texto(o.diagnostico),
    swot: { forcas: lista(s.forcas), fraquezas: lista(s.fraquezas), oportunidades: lista(s.oportunidades), ameacas: lista(s.ameacas) },
    prioridades: lista(o.prioridades),
    scripts: lista(o.scripts),
  };
}

/** Uma versão (conteúdo + marcas), sem a anterior dela — guardamos um nível só. */
export function versaoSemAnterior(a: unknown): VersaoEstrutura | null {
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  return { ...normalizarEstrutura(o), geradoEm: quando(o.geradoEm), editadoEm: quando(o.editadoEm), editadoPor: quando(o.editadoPor) };
}

export function lerEstrutura(a: unknown): EstruturaGuardada | null {
  const v = versaoSemAnterior(a);
  if (!v) return null;
  return { ...v, anterior: versaoSemAnterior((a as Record<string, unknown>).anterior) };
}

/** O time salvou a edição: marca quem/quando e guarda a versão que estava. */
export function salvarEdicao(nova: unknown, atual: unknown, quem: string, agora: string): EstruturaGuardada {
  const antes = versaoSemAnterior(atual);
  return {
    ...normalizarEstrutura(nova),
    geradoEm: antes?.geradoEm ?? null,
    editadoEm: agora,
    editadoPor: quem || null,
    anterior: antes,
  };
}

/** A IA refez: versão nova sem marca de edição, com a que estava guardada como anterior. */
export function refazerComIa(gerada: unknown, atual: unknown, agora: string): EstruturaGuardada {
  return {
    ...normalizarEstrutura(gerada),
    geradoEm: agora,
    editadoEm: null,
    editadoPor: null,
    anterior: versaoSemAnterior(atual),
  };
}

/** "Voltar à anterior": troca as duas de lugar (dá para voltar de novo). null quando não há anterior. */
export function voltarAnterior(atual: unknown): EstruturaGuardada | null {
  const a = lerEstrutura(atual);
  if (!a?.anterior) return null;
  const { anterior, ...agora } = a;
  return { ...anterior, anterior: agora };
}

/** Refazer só pede confirmação quando há trabalho humano para perder. */
export function precisaConfirmarRefazer(a: unknown): boolean {
  return !!lerEstrutura(a)?.editadoEm;
}

// ── Rascunho da edição: texto cru, convertido só ao salvar (12.3) ────────────────

export interface RascunhoEstrutura {
  diagnostico: string;
  forcas: string;
  fraquezas: string;
  oportunidades: string;
  ameacas: string;
  prioridades: string;
  scripts: string;
}

export const listaParaTexto = (l: string[] | null | undefined): string => (l ?? []).join("\n");
export const textoParaLista = (t: string): string[] => t.split("\n").map((s) => s.trim()).filter(Boolean);

export function paraRascunho(a: unknown): RascunhoEstrutura {
  const e = normalizarEstrutura(a);
  return {
    diagnostico: e.diagnostico,
    forcas: listaParaTexto(e.swot.forcas),
    fraquezas: listaParaTexto(e.swot.fraquezas),
    oportunidades: listaParaTexto(e.swot.oportunidades),
    ameacas: listaParaTexto(e.swot.ameacas),
    prioridades: listaParaTexto(e.prioridades),
    scripts: listaParaTexto(e.scripts),
  };
}

export function doRascunho(r: RascunhoEstrutura): EstruturaBase {
  return {
    diagnostico: r.diagnostico.trim(),
    swot: {
      forcas: textoParaLista(r.forcas),
      fraquezas: textoParaLista(r.fraquezas),
      oportunidades: textoParaLista(r.oportunidades),
      ameacas: textoParaLista(r.ameacas),
    },
    prioridades: textoParaLista(r.prioridades),
    scripts: textoParaLista(r.scripts),
  };
}

/** "editada à mão em 21/10 por Roberto" — para a tela e para a confirmação do Refazer. */
export function descreverEdicao(a: MarcasEstrutura | null | undefined): string | null {
  if (!a?.editadoEm) return null;
  const d = new Date(a.editadoEm);
  const data = Number.isFinite(d.getTime())
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })
    : "data desconhecida";
  return `editada à mão em ${data}${a.editadoPor ? ` por ${a.editadoPor}` : ""}`;
}
