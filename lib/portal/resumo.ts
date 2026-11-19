// lib/portal/resumo.ts — a "Visão geral" do Painel de Resultados em contas puras (19/11/2026, Lone Results 3.0).
//
// O painel abria direto em "Anúncios": quem tinha Google e Instagram precisava passar por três abas para
// responder "está funcionando?". A Visão geral junta o que cada fonte trouxe, no desenho do protótipo do
// Roberto: frase de destaque, números principais, evolução, origem, canais e execução.
//
// Regras que estas contas seguram:
//   · Só entra na frase o canal que TEM resultado no período. Canal zerado, sem dado ou que falhou fica de
//     fora — nunca "0 contatos pelo Google".
//   · Nada de somar fontes diferentes num número só (conversa de anúncio + clique no perfil do Google +
//     seguidor não são a mesma coisa). Cada canal aparece com o próprio número e o próprio nome.
//   · Seguidores: só fala em ganho quando o saldo é positivo.

import { palavrasDoResultado, type TipoResultadoPortal } from "./formatos";

export type PeriodoDoResumo = "7d" | "14d";

const ANTERIOR: Record<PeriodoDoResumo, string> = {
  "7d": "da semana anterior",
  "14d": "das 2 semanas anteriores",
};
const PARECIDO: Record<PeriodoDoResumo, string> = {
  "7d": ", parecido com a semana anterior.",
  "14d": ", parecido com as 2 semanas anteriores.",
};
const NO_PERIODO: Record<PeriodoDoResumo, string> = {
  "7d": "nos últimos 7 dias",
  "14d": "nas últimas 2 semanas",
};

/** Até aqui a diferença é "parecido" — o mesmo limiar dos cartões. */
const ESTAVEL = 5;

const n = (v: number) => Math.round(v).toLocaleString("pt-BR");
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctSemSinal = (v: number) => `${Math.round(Math.abs(v))}%`;
const pctComSinal = (v: number) => `${v > 0 ? "+" : "−"}${pctSemSinal(v)}`;

/** "+56", "−12", "0" — saldo com sinal. */
export function comSinal(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${n(Math.abs(v))}`;
}

export interface EntradasDoResumo {
  periodo: PeriodoDoResumo;
  /** Resultado dos anúncios Meta no período (conversas, leads ou compras), com a variação e o custo. */
  anuncios?: { resultados: number | null; variacaoPct?: number | null; custo?: number | null; variacaoCustoPct?: number | null; tipo?: TipoResultadoPortal | null } | null;
  /** Contatos pelo perfil no Google (ligações, rotas, cliques no site, mensagens). */
  googlePerfil?: { contatos: number | null; variacaoPct?: number | null } | null;
  /** Cliques nos anúncios do Google. */
  googleAnuncios?: { cliques: number | null } | null;
  /** Saldo de seguidores do Instagram no período. */
  instagram?: { saldoSeguidores: number | null } | null;
}

/** Um trecho da frase do topo. Com `tom`, a tela destaca: número (marca), subiu (verde) ou caiu (âmbar). */
export type ParteDaFrase = string | { texto: string; tom: "numero" | "bom" | "atencao" };

export interface DestaqueDoResumo {
  /** A frase principal, em trechos, para a tela colorir o número e a variação (como no protótipo). */
  partes: ParteDaFrase[];
  /** Frases de apoio: custo, e o que os outros canais trouxeram. */
  nota: string[];
}

/** O texto corrido de uma frase em trechos (leitor de tela, testes). */
export function textoDaFrase(partes: readonly ParteDaFrase[]): string {
  return partes.map((p) => (typeof p === "string" ? p : p.texto)).join("");
}

/** Comparação com o período anterior, em trechos: ", 22% acima da semana anterior." */
function comparacao(d: number | null | undefined, periodo: PeriodoDoResumo): ParteDaFrase[] {
  if (d == null || !Number.isFinite(d)) return ["."];
  if (Math.abs(d) <= ESTAVEL) return [PARECIDO[periodo]];
  return [", ", { texto: `${pctSemSinal(d)} ${d > 0 ? "acima" : "abaixo"}`, tom: d > 0 ? "bom" : "atencao" }, ` ${ANTERIOR[periodo]}.`];
}

/**
 * O bloco de destaque da Visão geral: a frase do canal principal (anúncios; sem eles, o perfil no Google;
 * sem ele, o Instagram) e as frases de apoio com o resto. null = nenhum canal tem resultado no período.
 * Canal zerado, sem dado ou que falhou nunca entra — nem na frase, nem no apoio.
 */
export function destaqueDoResumo(e: EntradasDoResumo): DestaqueDoResumo | null {
  const r = e.anuncios?.resultados ?? null;
  const c = e.googlePerfil?.contatos ?? null;
  const q = e.googleAnuncios?.cliques ?? null;
  const s = e.instagram?.saldoSeguidores ?? null;
  const p = palavrasDoResultado(e.anuncios?.tipo);
  const so = (lista: (string | null)[]) => lista.filter((x): x is string => !!x);

  const notaGoogle = c != null && c > 0 ? `Pelo Google, ${n(c)} ${c === 1 ? "contato" : "contatos"} pelo seu perfil.` : null;
  const notaCliques = q != null && q > 0 ? `Os anúncios no Google tiveram ${n(q)} ${q === 1 ? "clique" : "cliques"}.` : null;
  const notaIg = s != null && s > 0 ? `No Instagram, o saldo foi de ${comSinal(s)} ${s === 1 ? "seguidor" : "seguidores"}.` : null;

  if (r != null && r > 0) {
    const custo = e.anuncios?.custo;
    const dc = e.anuncios?.variacaoCustoPct;
    const notaCusto = custo != null && custo > 0
      ? `O custo médio foi de ${reais(custo)} ${p.porUm}${dc != null && Number.isFinite(dc) && Math.abs(dc) > ESTAVEL ? ` (${pctComSinal(dc)})` : ""}.`
      : null;
    return {
      partes: ["Os anúncios trouxeram ", { texto: `${n(r)} ${r === 1 ? p.um : p.varios}`, tom: "numero" }, ...comparacao(e.anuncios?.variacaoPct, e.periodo)],
      nota: so([notaCusto, notaIg, notaGoogle, notaCliques]),
    };
  }
  if (c != null && c > 0) {
    return {
      partes: ["Seu perfil no Google gerou ", { texto: `${n(c)} ${c === 1 ? "contato" : "contatos"}`, tom: "numero" }, ...comparacao(e.googlePerfil?.variacaoPct, e.periodo)],
      nota: so([notaIg, notaCliques]),
    };
  }
  if (s != null && s > 0) {
    return {
      partes: ["O Instagram ganhou ", { texto: `${n(s)} ${s === 1 ? "seguidor" : "seguidores"}`, tom: "bom" }, ` ${NO_PERIODO[e.periodo]}.`],
      nota: so([notaCliques]),
    };
  }
  return null;
}

/**
 * "Leitura do período": uma observação que sai só dos números (volume × custo), sem opinião e sem promessa.
 * null quando falta a comparação.
 */
export function leituraDoPeriodo(variacaoResultados: number | null | undefined, variacaoCusto: number | null | undefined, tipo?: TipoResultadoPortal | null): string | null {
  if (variacaoResultados == null || variacaoCusto == null || !Number.isFinite(variacaoResultados) || !Number.isFinite(variacaoCusto)) return null;
  const p = palavrasDoResultado(tipo);
  const custo = p.custo.toLowerCase();
  const vol = Math.abs(variacaoResultados) <= ESTAVEL ? 0 : Math.sign(variacaoResultados);
  const cus = Math.abs(variacaoCusto) <= ESTAVEL ? 0 : Math.sign(variacaoCusto);
  if (vol === 0 && cus === 0) return `O período ficou parecido com o anterior, em ${p.varios} e em ${custo}.`;
  if (vol > 0 && cus < 0) return `O volume de ${p.varios} subiu enquanto o ${custo} caiu.`;
  if (vol > 0 && cus > 0) return `Vieram mais ${p.varios}, com o ${custo} mais alto.`;
  if (vol > 0) return `Vieram mais ${p.varios}, com o ${custo} parecido.`;
  if (vol < 0 && cus > 0) return `Vieram menos ${p.varios} e o ${custo} subiu.`;
  if (vol < 0 && cus < 0) return `Vieram menos ${p.varios}, com o ${custo} mais baixo.`;
  if (vol < 0) return `Vieram menos ${p.varios}, com o ${custo} parecido.`;
  return cus < 0 ? `O volume de ${p.varios} ficou parecido e o ${custo} caiu.` : `O volume de ${p.varios} ficou parecido e o ${custo} subiu.`;
}

/** O pedaço do retrato do Instagram que o resumo usa (mesma forma de IgSnapPortal). */
export interface IgParaResumo {
  conta?: { seguidores: number | null } | null;
  resumo?: { alcance: number | null; seguidoresGanhos: number | null; postsNoPeriodo?: number | null } | null;
  metricas?: {
    atual: { alcance: number | null; entraram: number | null; sairam: number | null };
    anterior: { alcance: number | null } | null;
  } | null;
  fonte?: string;
}

export interface NumerosDoInstagram {
  seguidores: number | null;
  /** Entraram − saíram quando a Meta entrega os dois; senão, só os novos. null = sem dado. */
  saldo: number | null;
  /** Quando a Meta entrega os dois lados do saldo. */
  entraram: number | null;
  sairam: number | null;
  alcance: number | null;
  alcanceAnterior: number | null;
  /** Posts publicados no período. null = a Meta não deixou ler. */
  posts: number | null;
}

/**
 * Os números do Instagram como a área "Instagram" calcula — mesma conta, para a Visão geral e a área nunca
 * mostrarem valores diferentes do mesmo perfil. Perfil lido só por fora ("publico") não tem saldo nem alcance.
 */
export function numerosDoInstagram(snap: IgParaResumo | null | undefined): NumerosDoInstagram | null {
  if (!snap?.conta) return null;
  const publico = snap.fonte === "publico";
  const atual = snap.metricas?.atual;
  const temLados = atual?.entraram != null && atual?.sairam != null;
  const saldo = temLados ? atual!.entraram! - atual!.sairam! : snap.resumo?.seguidoresGanhos ?? null;
  return {
    seguidores: snap.conta.seguidores ?? null,
    saldo: publico ? null : saldo,
    entraram: publico || !temLados ? null : atual!.entraram,
    sairam: publico || !temLados ? null : atual!.sairam,
    alcance: publico ? null : atual?.alcance ?? snap.resumo?.alcance ?? null,
    alcanceAnterior: publico ? null : snap.metricas?.anterior?.alcance ?? null,
    posts: snap.resumo?.postsNoPeriodo ?? null,
  };
}
