// lib/metrics/mapa-postagem.ts — MAPA DE POSTAGEM: cliente × semana (N32, Leva 7D). PURO.
//
// Uma grade para a gestão: em cada semana (segunda a domingo), quantos posts foram AO AR no Instagram
// do cliente contra o contratado — seg/qua/sex, 3 por semana; quem tem meta própria de posts no mês
// (clients.posts_goal) usa a meta ÷ 4. A fonte é o Instagram real (client_ig_posts), nunca o quadro.
//
// Honestidade da grade:
//   · cliente sem Instagram vinculado → a linha diz isso (ponto cego, não "0 posts");
//   · semana antes de o cliente entrar → "—" (não era cliente);
//   · semana em andamento → neutra até bater o contratado (ainda dá tempo);
//   · o cumprimento conta só semanas FECHADAS.

import { spDateStr } from "@/lib/utils";
import { somarDias } from "@/lib/conteudo/no-ar";

export interface SemanaMapa {
  inicio: string; // segunda, YYYY-MM-DD
  fim: string;    // domingo
  rotulo: string; // "22/09"
  emAndamento: boolean;
}

const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** Segunda-feira da semana de `dia`. */
export function segundaDa(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  return somarDias(dia, -((d.getUTCDay() + 6) % 7));
}

/** As últimas `n` semanas (a corrente incluída), da mais antiga para a mais nova. */
export function semanasDoMapa(hoje: string, n: number): SemanaMapa[] {
  const atual = segundaDa(hoje);
  return Array.from({ length: n }, (_, i) => {
    const inicio = somarDias(atual, -7 * (n - 1 - i));
    const fim = somarDias(inicio, 6);
    return { inicio, fim, rotulo: ddmm(inicio), emAndamento: fim >= hoje };
  });
}

/** Posts contratados por semana. Sem meta própria: seg/qua/sex = 3. */
export const CONTRATADO_PADRAO = 3;
export function contratadoPorSemana(postsGoalMes: number | null | undefined): number {
  const g = Number(postsGoalMes);
  return Number.isFinite(g) && g > 0 ? Math.max(1, Math.round(g / 4)) : CONTRATADO_PADRAO;
}

/** Os dias da semana que o contrato espera (seg/qua/sex), para a leitura da célula. */
export const DIAS_CONTRATADOS = [0, 2, 4] as const; // deslocamento a partir da segunda
const NOME_DIA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export interface ClienteMapa {
  id: string;
  nome: string;
  social: string | null;
  /** Data de entrada (join_date ou criação). */
  entrada: string | null;
  temInstagram: boolean;
  pausado: boolean;
  contratadoSemana: number;
}

export type TomCelula = "ok" | "parcial" | "zero" | "andamento" | "fora";

export interface CelulaMapa {
  semana: string;
  posts: number;
  contratado: number;
  tom: TomCelula;
  /** "seg 22 ✓ · qua 24 — · sex 26 ✓ · +1 em ter 23" — a leitura para o tooltip. */
  leitura: string;
  /** Dias da semana (0 = seg) com post, sem repetição — os pontinhos da célula. */
  diasComPost: number[];
}

export interface LinhaMapa {
  clientId: string;
  nome: string;
  social: string | null;
  temInstagram: boolean;
  pausado: boolean;
  contratadoSemana: number;
  celulas: CelulaMapa[];
  /** % do contratado entregue nas semanas FECHADAS em que era cliente (null = nenhuma). */
  cumprimento: number | null;
  semanasZeradas: number;
}

export interface ResumoSocial { social: string; clientes: number; cumprimento: number | null; semanasZeradas: number }

export const SEM_SOCIAL = "Sem social definido";

export function montarMapa(args: {
  clientes: readonly ClienteMapa[];
  /** Posts (client_id, posted_at ISO) da janela inteira. */
  posts: readonly { client_id: string; posted_at: string }[];
  semanas: readonly SemanaMapa[];
  hoje: string;
}): { semanas: readonly SemanaMapa[]; linhas: LinhaMapa[]; porSocial: ResumoSocial[]; semInstagram: number } {
  const diasPorCliente = new Map<string, string[]>();
  for (const p of args.posts) {
    const dia = spDateStr(p.posted_at);
    const l = diasPorCliente.get(p.client_id) ?? [];
    l.push(dia);
    diasPorCliente.set(p.client_id, l);
  }

  const linhas: LinhaMapa[] = args.clientes.map((c) => {
    const dias = diasPorCliente.get(c.id) ?? [];
    let entregue = 0, esperado = 0, zeradas = 0;
    const celulas = args.semanas.map((s): CelulaMapa => {
      const daSemana = dias.filter((d) => d >= s.inicio && d <= s.fim).sort();
      const offsets = [...new Set(daSemana.map((d) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${s.inicio}T12:00:00Z`)) / 86_400_000)))];
      const posts = daSemana.length;
      // Não era cliente ainda (entrou depois do fim da semana).
      if (!c.entrada || c.entrada > s.fim) {
        return { semana: s.inicio, posts, contratado: c.contratadoSemana, tom: "fora", leitura: "ainda não era cliente", diasComPost: offsets };
      }
      const leitura = leituraDaSemana(s, daSemana, args.hoje);
      if (s.emAndamento) {
        return { semana: s.inicio, posts, contratado: c.contratadoSemana, tom: posts >= c.contratadoSemana ? "ok" : "andamento", leitura, diasComPost: offsets };
      }
      entregue += Math.min(posts, c.contratadoSemana);
      esperado += c.contratadoSemana;
      if (posts === 0) zeradas++;
      const tom: TomCelula = posts >= c.contratadoSemana ? "ok" : posts === 0 ? "zero" : "parcial";
      return { semana: s.inicio, posts, contratado: c.contratadoSemana, tom, leitura, diasComPost: offsets };
    });
    return {
      clientId: c.id, nome: c.nome, social: c.social, temInstagram: c.temInstagram, pausado: c.pausado,
      contratadoSemana: c.contratadoSemana, celulas,
      cumprimento: c.temInstagram && esperado > 0 ? Math.round((entregue / esperado) * 100) : null,
      semanasZeradas: c.temInstagram ? zeradas : 0,
    };
  });

  // Pior primeiro: sem Instagram vai pro fim (não dá pra medir), depois o menor cumprimento.
  linhas.sort((a, b) =>
    Number(!a.temInstagram) - Number(!b.temInstagram)
    || (a.cumprimento ?? 101) - (b.cumprimento ?? 101)
    || a.nome.localeCompare(b.nome));

  const porSocialMapa = new Map<string, { clientes: number; entregue: number; esperado: number; zeradas: number }>();
  for (const l of linhas) {
    const nome = l.social?.trim() || SEM_SOCIAL;
    const g = porSocialMapa.get(nome) ?? { clientes: 0, entregue: 0, esperado: 0, zeradas: 0 };
    g.clientes++;
    if (l.temInstagram) {
      for (const cel of l.celulas) {
        if (cel.tom === "fora" || cel.tom === "andamento" || args.semanas.find((s) => s.inicio === cel.semana)?.emAndamento) continue;
        g.entregue += Math.min(cel.posts, cel.contratado);
        g.esperado += cel.contratado;
      }
      g.zeradas += l.semanasZeradas;
    }
    porSocialMapa.set(nome, g);
  }
  const porSocial: ResumoSocial[] = [...porSocialMapa].map(([social, g]) => ({
    social, clientes: g.clientes, semanasZeradas: g.zeradas,
    cumprimento: g.esperado > 0 ? Math.round((g.entregue / g.esperado) * 100) : null,
  })).sort((a, b) => Number(a.social === SEM_SOCIAL) - Number(b.social === SEM_SOCIAL) || a.social.localeCompare(b.social));

  return { semanas: args.semanas, linhas, porSocial, semInstagram: linhas.filter((l) => !l.temInstagram).length };
}

/** "seg 22 ✓ · qua 24 — · sex 26 ✓ · +1 em ter 23" */
export function leituraDaSemana(s: SemanaMapa, diasComPost: readonly string[], hoje: string): string {
  const partes: string[] = [];
  const usados = new Set<string>();
  for (const off of DIAS_CONTRATADOS) {
    const dia = somarDias(s.inicio, off);
    const n = diasComPost.filter((d) => d === dia).length;
    const nome = `${NOME_DIA[off]} ${dia.slice(8, 10)}`;
    if (n) { partes.push(`${nome} ✓`); usados.add(dia); }
    else partes.push(`${nome} ${dia >= hoje ? "(ainda não)" : "—"}`);
  }
  const extras = diasComPost.filter((d) => !usados.has(d) || diasComPost.filter((x) => x === d).length > 1);
  const extrasUnicos = [...new Set(extras)];
  for (const d of extrasUnicos) {
    const off = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${s.inicio}T12:00:00Z`)) / 86_400_000);
    const qtd = diasComPost.filter((x) => x === d).length - (usados.has(d) ? 1 : 0);
    if (qtd > 0) partes.push(`+${qtd} em ${NOME_DIA[off]} ${d.slice(8, 10)}`);
  }
  return partes.join(" · ");
}
