// lib/saude/montar.ts — monta a carteira (uma linha por cliente) a partir das linhas do banco. PURO:
// `carregar.ts` busca; aqui só se junta. Testado em tests/saude-carteira.test.ts.

import type { Papel } from "@/lib/api/require-role";
import { GESTAO } from "@/lib/api/require-role";
import { NOME_COMPONENTE, type ComponenteSaude } from "@/lib/scores/health";
import { estaPausado, hojeSP } from "@/lib/clients/pausa";
import { DADOS_VAZIOS, montarContexto, nomeDoCliente, type ClienteRow, type MembroRow } from "@/lib/inicio/dados";
import {
  proximaAcaoDoCliente, registradaDaLinha, type RecomendacaoDoCliente,
} from "@/lib/clientes/proxima-acao";
import {
  compararSeveridade, diasQuietoDoCliente, distribuir, donoDoCliente, ehDaPessoa, etapaDaJornada,
  nivelDoCliente, scoreDoCliente, situacaoDaSaude, tendenciaDaSerie,
} from "./carteira";
import type { ComponenteDaNota, LinhaSaude, Relacionamento, RespostaSaude } from "./tipos";

export type ClienteSaudeRow = ClienteRow & { health_computed_at?: string | null };

export interface HistoricoRow {
  client_id: string;
  score: number | string | null;
  level: string | null;
  breakdown: unknown;
  computed_for_date: string;
}

export type RecomendacaoRow = RecomendacaoDoCliente & { client_id: string | null };

export interface EntradaCarteira {
  agora: Date;
  clientes: ClienteSaudeRow[];
  time: MembroRow[];
  /** client_health_scores dos últimos ~14 dias, qualquer ordem. */
  historico: HistoricoRow[];
  /** recommendations ABERTAS (nova/vista/aceita). */
  recomendacoes: RecomendacaoRow[];
  /** client_journey (select "*"). */
  jornadas: Record<string, unknown>[];
  viewer: { nome: string | null; papel: Papel };
}

interface Breakdown { componentes?: Record<string, number | null>; motivos?: unknown; cobertura?: number | null }

const ORDEM_COMPONENTES = Object.keys(NOME_COMPONENTE) as ComponenteSaude[];

function componentesDe(b: Breakdown | null): ComponenteDaNota[] {
  const c = b?.componentes;
  if (!c || typeof c !== "object") return [];
  const chaves = [...ORDEM_COMPONENTES.filter((k) => k in c), ...Object.keys(c).filter((k) => !(ORDEM_COMPONENTES as string[]).includes(k))];
  return chaves.map((k) => {
    const v = c[k];
    return { chave: k, nome: NOME_COMPONENTE[k as ComponenteSaude] ?? k, valor: typeof v === "number" && Number.isFinite(v) ? v : null };
  });
}

function relacionamentoDe(j: Record<string, unknown> | undefined): Relacionamento {
  const s = (k: string) => (typeof j?.[k] === "string" && (j[k] as string).trim() ? (j[k] as string) : null);
  const pend = Array.isArray(j?.pendencias_cliente) ? (j!.pendencias_cliente as Relacionamento["pendenciasCliente"]) : [];
  return {
    estadoManual: s("estado"),
    pendenciasCliente: pend.filter((p) => p && typeof p.item === "string" && p.item.trim()),
    ultimaReuniao: s("ultima_reuniao"),
    proximaReuniao: s("proxima_reuniao"),
    notas: s("notas"),
  };
}

export function montarCarteira(e: EntradaCarteira): Omit<RespostaSaude, "geradoEm" | "falhas" | "semMigracaoProximaAcao"> {
  const ctx = montarContexto({ ...DADOS_VAZIOS, clientes: e.clientes, time: e.time }, e.agora);
  const agoraMs = e.agora.getTime();
  const hoje = hojeSP(e.agora);
  const gestao = GESTAO.includes(e.viewer.papel);
  const eu = ctx.canon(e.viewer.nome) ?? e.viewer.nome;

  // Histórico por cliente, do mais antigo pro mais novo: a série da tendência e o breakdown mais novo.
  const serie = new Map<string, HistoricoRow[]>();
  for (const h of [...e.historico].sort((a, b) => a.computed_for_date.localeCompare(b.computed_for_date))) {
    (serie.get(h.client_id) ?? serie.set(h.client_id, []).get(h.client_id)!).push(h);
  }
  const recsPor = new Map<string, RecomendacaoRow[]>();
  for (const r of e.recomendacoes) {
    if (!r.client_id) continue;
    (recsPor.get(r.client_id) ?? recsPor.set(r.client_id, []).get(r.client_id)!).push(r);
  }
  const jornadaPor = new Map(e.jornadas.map((j) => [String(j.client_id), j]));
  const calculadaEm = new Map(e.clientes.map((c) => [c.id, c.health_computed_at ?? null]));
  const notaDoDia = e.historico.reduce<string | null>((m, h) => (!m || h.computed_for_date > m ? h.computed_for_date : m), null);

  const linhas: LinhaSaude[] = ctx.vivos.map((c) => {
    const hs = serie.get(c.id) ?? [];
    const ultimo = hs[hs.length - 1];
    const b = (ultimo?.breakdown ?? null) as Breakdown | null;
    const motivosNota = Array.isArray(b?.motivos) ? (b!.motivos as unknown[]).map(String).filter(Boolean) : [];
    const nivel = nivelDoCliente(c);
    const score = scoreDoCliente(c);
    const pausado = estaPausado(c, e.agora);
    const sit = situacaoDaSaude({
      nivel, score, motivos: motivosNota, diasQuieto: diasQuietoDoCliente(c, agoraMs),
      cobertura: typeof b?.cobertura === "number" ? b.cobertura : null, pausado,
    });
    const t = tendenciaDaSerie(hs.map((h) => Number(h.score)));
    const social = ctx.canon(c.assigned_social) ?? null;
    const trafego = ctx.canon(c.assigned_traffic) ?? null;
    const dono = ctx.canon(donoDoCliente(c)) ?? null;
    const j = jornadaPor.get(c.id);
    const rel = relacionamentoDe(j);
    const proximaAcao = proximaAcaoDoCliente({
      registrada: registradaDaLinha(j),
      recomendacoes: recsPor.get(c.id) ?? [],
      saude: { nivel: sit.nivel, esfriando: sit.esfriando, motivos: sit.motivos, pausado },
      dono,
      hoje,
    });
    return {
      id: c.id,
      nome: nomeDoCliente(c),
      logo: ctx.ref(c).logo,
      nivel: sit.nivel,
      score: sit.score === null ? null : Math.round(sit.score),
      tendencia: t?.tendencia ?? null,
      delta: t?.delta ?? null,
      esfriando: sit.esfriando,
      diasQuieto: sit.diasQuieto,
      pedeAtencao: sit.pedeAtencao,
      severidade: sit.severidade,
      motivos: sit.motivos,
      componentes: componentesDe(b),
      cobertura: typeof b?.cobertura === "number" ? b.cobertura : null,
      calculadaEm: calculadaEm.get(c.id) ?? null,
      dono,
      social,
      trafego,
      designer: ctx.canon(c.assigned_designer) ?? null,
      pausado,
      etapa: etapaDaJornada({ status: c.status, estadoManual: rel.estadoManual }, sit),
      proximaAcao,
      // Gestão confirma qualquer um; social/tráfego, os clientes de quem é dono do relacionamento.
      podeEditar: gestao || ((e.viewer.papel === "social" || e.viewer.papel === "traffic") && ehDaPessoa({ social, trafego, dono }, eu)),
      relacionamento: gestao ? rel : null,
    };
  });

  linhas.sort((a, b) => compararSeveridade(a, b));
  const donos = [...new Set(linhas.map((l) => l.dono).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    eu: { nome: eu ?? null, papel: e.viewer.papel, gestao },
    linhas,
    distribuicao: distribuir(linhas),
    donos,
    notaDoDia,
  };
}
