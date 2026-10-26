// lib/priority/conferencia.ts — o sistema confere sozinho se o "Já fiz" resolveu. Puro.
//
// Mesa do Gestor (26/10/2026). "Feito" sem conferência é palavra; com conferência vira dado. Depois do "Já fiz":
//   • 1 dia depois: a mesma checagem (o mesmo problema, no mesmo criativo/conjunto) ainda aparece? Se sim, VOLTOU.
//     Se não, confirmado no 1º dia.
//   • 3 dias depois: de novo. Continua sumido = RESOLVIDO. Apareceu = VOLTOU.
// "A mesma checagem" é a fonte que gerou o item, rodando com o dado novo: o fingerprint (cliente + coisa + motivo)
// está entre os que a rodada de agora reporta. Funciona porque o diagnóstico só fala do que ainda está gastando —
// anúncio pausado sai da lista no dia seguinte, em vez de ficar 7 dias na janela.
//
// Por que 24 h e não na hora: a Meta leva até um dia para o dado da mudança aparecer, e o silêncio do "Feito"
// (lib/priority/silencio.ts) também é de 24 h — os dois relógios andam juntos.

export type ResultadoConferencia = "aguardando" | "confirmado_1d" | "resolvido" | "voltou";

export const HORAS_1A_CONFERENCIA = 24;
export const HORAS_2A_CONFERENCIA = 72;

export interface ParaConferir {
  decidido_em: string;
  resultado: ResultadoConferencia | null;
}

export interface PassoConferencia {
  resultado: ResultadoConferencia;
  etapa: "1d" | "3d";
}

/**
 * O próximo passo da conferência de uma recomendação marcada como feita, ou null se ainda não é hora (ou já
 * terminou). `reportadaAgora` = a fonte reporta o mesmo fingerprint nesta rodada.
 */
export function proximaConferencia(r: ParaConferir, reportadaAgora: boolean, agora: Date = new Date()): PassoConferencia | null {
  if (r.resultado === "resolvido" || r.resultado === "voltou") return null;
  const horas = (agora.getTime() - Date.parse(r.decidido_em)) / 3_600_000;
  if (!Number.isFinite(horas)) return null;
  if (horas >= HORAS_2A_CONFERENCIA) return { resultado: reportadaAgora ? "voltou" : "resolvido", etapa: "3d" };
  if (horas >= HORAS_1A_CONFERENCIA && r.resultado !== "confirmado_1d") {
    return { resultado: reportadaAgora ? "voltou" : "confirmado_1d", etapa: "1d" };
  }
  return null;
}

export const ROTULO_CONFERENCIA: Record<ResultadoConferencia, string> = {
  aguardando: "Conferindo amanhã",
  confirmado_1d: "Sumiu no 1º dia — confiro de novo no 3º",
  resolvido: "Resolvido",
  voltou: "Voltou",
};
