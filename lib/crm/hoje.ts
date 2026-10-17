// lib/crm/hoje.ts — a LISTA DE TRABALHO do dia no comercial (aba Hoje). Módulo PURO, testado.
//
// Antes o Hoje eram três colunas soltas (reuniões, follow-ups, parados) e o comercial decidia de
// cabeça o que fazer primeiro. Agora é uma fila única, na ordem que vende: quem acabou de chegar
// (responder em até 1 h vale ~7×), reunião do dia, retomada que venceu, negociação esfriando, toque
// da cadência, contato marcado à mão e, por último, régua encerrada esperando decisão. Cada lead
// aparece UMA vez, pelo motivo mais urgente. Cada item já traz a mensagem pronta (lib/crm/modelos.ts).

import { normalizarEtapa, ehAberta } from "@/lib/crm/etapas";
import { CADENCIAS, fimDaCadencia, proximoToque, rotuloToque, type Passo, type ProximoToque } from "@/lib/crm/cadencia";
import { mensagemDeRetomada, mensagemDoToque, type Saida } from "@/lib/crm/modelos";

export type GrupoHoje = "responder" | "reuniao" | "retomar" | "esfriando" | "toque" | "manual" | "fim";

export const ORDEM_GRUPOS: GrupoHoje[] = ["responder", "reuniao", "retomar", "esfriando", "toque", "manual", "fim"];

export const ROTULO_GRUPO: Record<GrupoHoje, { titulo: string; dica: string }> = {
  responder: { titulo: "Responder agora", dica: "Lead novo sem nenhum contato. Responder em até 1 h faz o lead ~7× mais propenso a avançar." },
  reuniao: { titulo: "Reuniões de hoje", dica: "Confirme o horário pela manhã." },
  retomar: { titulo: "Retomar hoje", dica: "A data marcada em \"Retomar em\" chegou." },
  esfriando: { titulo: "Esfriando", dica: "Negócio aberto sem movimento. Negociação esfria em 3 dias; o resto, em 7." },
  toque: { titulo: "Toques da cadência", dica: "O próximo passo da régua de cada etapa." },
  manual: { titulo: "Contatos marcados", dica: "Datas de próximo contato que você marcou à mão." },
  fim: { titulo: "Régua encerrada", dica: "Todos os toques feitos e nada andou. Decida: perdido (sem resposta) ou retomar em 30 dias." },
};

export interface LeadHoje {
  id: string;
  contatoNome: string;
  empresa: string | null;
  telefone: string | null;
  estagio: string;
  origem: string | null;
  segmento?: string | null;
  observacoes?: string | null;
  createdAt: string;
  etapaDesde?: string | null;
  cadenciaInicio?: string | null;
  reuniaoData?: string | null;
  proximoContato?: string | null;
  retomarEm?: string | null;
  primeiroContatoEm?: string | null;
  /** Datas dos contatos (ligação, WhatsApp, e-mail, reunião, visita). */
  toques?: string[];
  /** Contatos + "pulado": o que faz a régua andar. */
  avancos?: string[];
}

export interface ItemHoje<L extends LeadHoje = LeadHoje> {
  lead: L;
  grupo: GrupoHoje;
  motivo: string;
  passo: Passo | null;
  toque: ProximoToque | null;
  mensagem: Saida | null;
  /** Ordenação dentro do grupo: maior primeiro. */
  peso: number;
}

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const paraDia = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : diaSP(v));
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** Dia zero da cadência: entrada na etapa; sem ela, o início marcado ou a criação. */
export const inicioDaCadencia = (l: LeadHoje): string => l.etapaDesde || l.cadenciaInicio || l.createdAt;

/** Dias sem nenhum movimento: desde o último contato, a entrada na etapa ou a criação. */
export function diasParado(l: LeadHoje, hoje: string): number {
  const datas = [...(l.toques ?? []), l.etapaDesde, l.createdAt].filter((x): x is string => !!x && Number.isFinite(new Date(x).getTime()));
  const ultima = datas.map(paraDia).sort().pop() ?? hoje;
  return Math.max(0, diff(ultima, hoje));
}

export function montarFilaHoje<L extends LeadHoje>(leads: L[], hoje: string, agora: Date = new Date()): ItemHoje<L>[] {
  const itens: ItemHoje<L>[] = [];
  for (const l of leads) {
    const etapa = normalizarEtapa(l.estagio);
    if (!ehAberta(etapa)) continue;
    const estacionado = !!l.retomarEm && l.retomarEm > hoje;
    if (estacionado && l.reuniaoData !== hoje) continue;
    const base = { lead: l, passo: null as Passo | null, toque: null as ProximoToque | null, mensagem: null as Saida | null };
    const entrada = { estagio: etapa, inicio: inicioDaCadencia(l), toques: l.avancos ?? l.toques ?? [], hoje, retomarEm: l.retomarEm };

    // 1. Lead novo sem contato nenhum.
    if (etapa === "novo" && !l.primeiroContatoEm && !(l.toques ?? []).length) {
      const horas = Math.max(0, (agora.getTime() - new Date(l.createdAt).getTime()) / 3_600_000);
      const quando = horas < 1 ? "chegou agora há pouco" : horas < 48 ? `chegou há ${Math.floor(horas)} h` : `chegou há ${Math.floor(horas / 24)} dias`;
      const passo = CADENCIAS.novo![0];
      itens.push({ ...base, grupo: "responder", passo, mensagem: mensagemDoToque(passo, l), motivo: [l.origem, quando].filter(Boolean).join(" · "), peso: -horas });
      continue;
    }
    // 2. Reunião hoje.
    if (l.reuniaoData === hoje) {
      itens.push({ ...base, grupo: "reuniao", motivo: "Reunião marcada para hoje", peso: 0 });
      continue;
    }
    // 3. Retomada que chegou.
    if (l.retomarEm && l.retomarEm <= hoje) {
      itens.push({ ...base, grupo: "retomar", mensagem: mensagemDeRetomada(l), motivo: `Marcado para retomar em ${ddmm(l.retomarEm)}`, peso: diff(l.retomarEm, hoje) });
      continue;
    }
    // 4. Esfriando (negociação em 3 dias; o resto em 7).
    const parado = diasParado(l, hoje);
    const limite = etapa === "negociacao" ? 3 : 7;
    const toque = proximoToque(entrada);
    if (parado >= limite && etapa === "negociacao") {
      itens.push({ ...base, grupo: "esfriando", toque, passo: toque?.passo ?? null, mensagem: toque ? mensagemDoToque(toque.passo, l) : mensagemDeRetomada(l), motivo: `Negociação sem movimento há ${parado} dias`, peso: parado });
      continue;
    }
    // 5. Toque da cadência vencido ou de hoje.
    if (toque && toque.situacao !== "futuro") {
      itens.push({ ...base, grupo: "toque", toque, passo: toque.passo, mensagem: mensagemDoToque(toque.passo, l), motivo: rotuloToque(toque), peso: toque.diasAtraso });
      continue;
    }
    // 6. Contato marcado à mão que venceu.
    if (l.proximoContato && l.proximoContato <= hoje) {
      itens.push({ ...base, grupo: "manual", mensagem: mensagemDeRetomada(l), motivo: `Contato marcado para ${ddmm(l.proximoContato)}`, peso: diff(l.proximoContato, hoje) });
      continue;
    }
    // 4b. Esfriando nas outras etapas (sem toque devido, mas parado há 7+ dias).
    if (parado >= limite && !toque) {
      const fim = fimDaCadencia(entrada);
      if (fim) {
        itens.push({ ...base, grupo: "fim", motivo: `Régua encerrada em ${ddmm(fim.desde)} sem resposta`, peso: diff(fim.desde, hoje) });
        continue;
      }
      itens.push({ ...base, grupo: "esfriando", mensagem: mensagemDeRetomada(l), motivo: `Sem movimento há ${parado} dias`, peso: parado });
      continue;
    }
    // 7. Régua encerrada sem o lead andar.
    if (!toque) {
      const fim = fimDaCadencia(entrada);
      if (fim) itens.push({ ...base, grupo: "fim", motivo: `Régua encerrada em ${ddmm(fim.desde)} sem resposta`, peso: diff(fim.desde, hoje) });
    }
  }
  const ordem = new Map(ORDEM_GRUPOS.map((g, i) => [g, i]));
  return itens.sort((a, b) => (ordem.get(a.grupo)! - ordem.get(b.grupo)!) || b.peso - a.peso);
}
