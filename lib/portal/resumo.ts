// lib/portal/resumo.ts — a "Visão geral" do Painel de Resultados em contas puras (19/11/2026, Lone Results 3.0).
//
// O painel abria direto em "Anúncios": quem tinha Google e Instagram precisava passar por três abas para
// responder "está funcionando?". A Visão geral junta, numa frase e num cartão por canal, o número que o
// dono reconhece de cada fonte.
//
// Regras que estas contas seguram:
//   · Só entra na frase o canal que TEM resultado no período. Canal zerado, sem dado ou que falhou fica de
//     fora — nunca "0 contatos pelo Google".
//   · Nada de somar fontes diferentes num número só (conversa de anúncio + clique no perfil do Google +
//     seguidor não são a mesma coisa). Cada canal aparece com o próprio número e o próprio nome.
//   · Seguidores: só fala em ganho quando o saldo é positivo.

import { palavrasDoResultado, type TipoResultadoPortal } from "./formatos";

export type PeriodoDoResumo = "7d" | "14d";

const ABERTURA: Record<PeriodoDoResumo, string> = {
  "7d": "Nos últimos 7 dias",
  "14d": "Nas últimas 2 semanas",
};

const n = (v: number) => Math.round(v).toLocaleString("pt-BR");

export interface EntradasDoResumo {
  periodo: PeriodoDoResumo;
  /** Resultado dos anúncios Meta no período (conversas, leads ou compras). */
  anuncios?: { resultados: number | null; tipo?: TipoResultadoPortal | null } | null;
  /** Contatos pelo perfil no Google (ligações, rotas, cliques no site, mensagens). */
  googlePerfil?: { contatos: number | null } | null;
  /** Cliques nos anúncios do Google. */
  googleAnuncios?: { cliques: number | null } | null;
  /** Saldo de seguidores do Instagram no período. */
  instagram?: { saldoSeguidores: number | null } | null;
}

/** Junta partes com vírgula e "e": ["a","b","c"] → "a, b e c". */
function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/**
 * A frase do topo. null = nenhum canal tem resultado para contar no período (a tela mostra outra mensagem,
 * não uma frase vazia).
 */
export function fraseDoResumo(e: EntradasDoResumo): string | null {
  const partes: string[] = [];

  const r = e.anuncios?.resultados;
  if (r != null && r > 0) {
    const p = palavrasDoResultado(e.anuncios?.tipo);
    partes.push(`${n(r)} ${r === 1 ? p.um : p.varios} pelos anúncios`);
  }

  const c = e.googlePerfil?.contatos;
  if (c != null && c > 0) {
    partes.push(`${n(c)} ${c === 1 ? "contato" : "contatos"} pelo seu perfil no Google`);
  }

  const q = e.googleAnuncios?.cliques;
  if (q != null && q > 0) {
    partes.push(`${n(q)} ${q === 1 ? "clique" : "cliques"} nos anúncios do Google`);
  }

  const s = e.instagram?.saldoSeguidores;
  if (s != null && s > 0) {
    partes.push(`${n(s)} ${s === 1 ? "seguidor novo" : "seguidores novos"} no Instagram`);
  }

  if (!partes.length) return null;
  return `${ABERTURA[e.periodo]}: ${juntar(partes)}.`;
}

/** O pedaço do retrato do Instagram que o resumo usa (mesma forma de IgSnapPortal). */
export interface IgParaResumo {
  conta?: { seguidores: number | null } | null;
  resumo?: { alcance: number | null; seguidoresGanhos: number | null } | null;
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
  alcance: number | null;
  alcanceAnterior: number | null;
}

/**
 * Os números do Instagram como a aba "Crescimento nas redes" calcula — mesma conta, para o resumo e a aba
 * nunca mostrarem valores diferentes do mesmo perfil. Perfil lido só por fora ("publico") não tem alcance.
 */
export function numerosDoInstagram(snap: IgParaResumo | null | undefined): NumerosDoInstagram | null {
  if (!snap?.conta) return null;
  const publico = snap.fonte === "publico";
  const atual = snap.metricas?.atual;
  const saldo = atual?.entraram != null && atual?.sairam != null
    ? atual.entraram - atual.sairam
    : snap.resumo?.seguidoresGanhos ?? null;
  return {
    seguidores: snap.conta.seguidores ?? null,
    saldo: publico ? null : saldo,
    alcance: publico ? null : atual?.alcance ?? snap.resumo?.alcance ?? null,
    alcanceAnterior: publico ? null : snap.metricas?.anterior?.alcance ?? null,
  };
}

/** "+56", "−12", "0" — saldo com sinal. */
export function comSinal(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${n(Math.abs(v))}`;
}
