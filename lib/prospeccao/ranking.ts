// lib/prospeccao/ranking.ts — a fila do dia (V2 §5). Às 08:35, entre os ICP aprovados que passam
// no quality gate, os `limite_dia` melhores por score viram `fila_prospeccao`. As 10 abordagens
// do dia saem das 10 MELHORES, não das 10 primeiras que apareceram.

import type { ProspectRow, QualityGateResultado } from "./tipos";
import type { CampanhaRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { listarPorEstagio, ehClienteAtual, atualizarProspect } from "./db";
import { avaliarQualityGate } from "./quality-gate";
import { transicionar } from "./maquina";
import { ymdSP } from "./tempo";

export interface ResumoRanking {
  dia: string;
  candidatos: number;
  aprovados: number;
  fila: { id: string; nome: string; score: number | null; classe: string | null; pos: number }[];
  reprovados: { id: string; nome: string; itens: string[] }[];
  devolvidos: number;
}

export async function montarFilaDoDia(cfg: ProspectConfig, campanha: CampanhaRow | null, o: { agora?: Date; dry?: boolean } = {}): Promise<ResumoRanking> {
  const agora = o.agora ?? new Date();
  const dia = ymdSP(agora);
  const candidatos = await listarPorEstagio(["icp_aprovado", "fila_prospeccao"], 500);
  const aprovados: { p: ProspectRow; gate: QualityGateResultado }[] = [];
  const reprovados: ResumoRanking["reprovados"] = [];

  for (const p of candidatos) {
    const cli = await ehClienteAtual({ nome: p.nome, instagram: p.instagram, telefone: p.telefone, cidade: p.cidade });
    const gate = avaliarQualityGate(p, { cfg, campanha, agora, momento: "ranking", ehClienteAtual: cli.sim });
    if (!o.dry) await atualizarProspect(p.id, { quality_gate: gate });
    if (gate.passed) aprovados.push({ p, gate });
    else reprovados.push({ id: p.id, nome: p.nome, itens: gate.itens.filter((i) => !i.ok).map((i) => `${i.chave}${i.detalhe ? `: ${i.detalhe}` : ""}`) });
  }

  aprovados.sort((a, b) => (b.p.score ?? 0) - (a.p.score ?? 0) || a.p.created_at.localeCompare(b.p.created_at));
  const limite = campanha?.limite_dia ?? 10;
  const top = aprovados.slice(0, limite);
  const fora = aprovados.slice(limite);
  const fila: ResumoRanking["fila"] = [];
  let devolvidos = 0;

  for (let i = 0; i < top.length; i++) {
    const { p } = top[i];
    fila.push({ id: p.id, nome: p.nome, score: p.score, classe: p.classe, pos: i + 1 });
    if (o.dry) continue;
    if (p.estagio === "icp_aprovado") {
      await transicionar(p, { para: "fila_prospeccao", motivo: `Ranking ${dia}: posição ${i + 1} (score ${p.score})`, patch: { ranking_dia: dia, ranking_pos: i + 1 }, ctx: { agora, janelaAbordagem: campanha?.janela_abordagem } });
    } else {
      await atualizarProspect(p.id, { ranking_dia: dia, ranking_pos: i + 1 });
    }
  }
  if (!o.dry) {
    for (const { p } of fora) {
      if (p.estagio === "fila_prospeccao") {
        devolvidos++;
        await transicionar(p, { para: "icp_aprovado", motivo: `Ranking ${dia}: fora do top ${limite}`, patch: { ranking_dia: null, ranking_pos: null }, ctx: { agora } });
      }
    }
    for (const r of reprovados) {
      const p = candidatos.find((c) => c.id === r.id)!;
      if (p.estagio === "fila_prospeccao") {
        devolvidos++;
        await transicionar(p, { para: "icp_aprovado", motivo: `Ranking ${dia}: reprovado no quality gate (${r.itens.join("; ")})`, patch: { ranking_dia: null, ranking_pos: null }, ctx: { agora } });
      }
    }
  }
  return { dia, candidatos: candidatos.length, aprovados: aprovados.length, fila, reprovados, devolvidos };
}
