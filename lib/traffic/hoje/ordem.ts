// lib/traffic/hoje/ordem.ts — ordem e estado das linhas do Hoje. PURO e leve: a tela importa daqui
// (reordenar depois de marcar "visto") sem puxar os motores do servidor.

import type { EstadoLinha, LinhaHoje, NivelAlerta, ProblemaHoje, TipoAlerta, VistoInfo } from "./tipos";
import { RANK_NIVEL } from "./visto";

/** Entre tipos do mesmo nível: o que para a conta vem antes do que custa caro. */
export const ORDEM_TIPO: Record<TipoAlerta, number> = {
  conta: 0, saldo: 1, entrega: 2, acima_meta: 3, desperdicio: 4, fadiga: 5, verba: 6,
};

/** Dentro da linha: em aberto antes de visto; depois gravidade, tipo e peso. */
export function compararProblemas(a: ProblemaHoje, b: ProblemaHoje): number {
  return (a.visto ? 1 : 0) - (b.visto ? 1 : 0)
    || RANK_NIVEL[b.nivel] - RANK_NIVEL[a.nivel]
    || ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]
    || b.peso - a.peso;
}

const ORDEM_ESTADO: Record<EstadoLinha, number> = { aberto: 0, visto: 1, em_dia: 2 };

/** Entre linhas: em aberto, depois vistas, depois em dia; dentro, pelo pior problema e pelo dinheiro em jogo. */
export function compararLinhas(a: LinhaHoje, b: LinhaHoje): number {
  const e = ORDEM_ESTADO[a.estado] - ORDEM_ESTADO[b.estado];
  if (e) return e;
  const pa = a.problemas[0], pb = b.problemas[0];
  if (pa && pb) {
    const d = RANK_NIVEL[pb.nivel] - RANK_NIVEL[pa.nivel] || ORDEM_TIPO[pa.tipo] - ORDEM_TIPO[pb.tipo] || pb.peso - pa.peso;
    if (d) return d;
  }
  return (b.numeros.gastoMedio3d ?? 0) - (a.numeros.gastoMedio3d ?? 0) || a.nome.localeCompare(b.nome, "pt-BR");
}

export function estadoDaLinha(problemas: readonly ProblemaHoje[]): EstadoLinha {
  if (problemas.length === 0) return "em_dia";
  return problemas.some((p) => !p.visto) ? "aberto" : "visto";
}

/**
 * A linha depois de marcar (visto = info) ou desmarcar (visto = null) todos os alertas dela. Marcar
 * só carimba os que estavam em aberto — quem já tinha visto continua com o visto de quem viu.
 */
export function comVisto(linha: LinhaHoje, visto: VistoInfo | null): LinhaHoje {
  const problemas = linha.problemas
    .map((p) => (visto ? (p.visto ? p : { ...p, visto: { ...visto, nivel: p.nivel } }) : { ...p, visto: null }))
    .sort(compararProblemas);
  return { ...linha, problemas, estado: estadoDaLinha(problemas) };
}

/** Contagem para o cabeçalho: linhas em aberto por gravidade do pior alerta, vistas e em dia. */
export function contarLinhas(linhas: readonly LinhaHoje[]): Record<NivelAlerta | "visto" | "em_dia", number> {
  const out = { critical: 0, warning: 0, info: 0, visto: 0, em_dia: 0 };
  for (const l of linhas) {
    if (l.estado === "em_dia") out.em_dia++;
    else if (l.estado === "visto") out.visto++;
    else out[l.problemas[0].nivel]++;
  }
  return out;
}
