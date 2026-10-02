// lib/cs/vespera-classificar.ts — QUEM DE FATO PRECISA DE ATENÇÃO NA VÉSPERA.
//
// Roberto (02/10/2026), sobre a véspera de sexta que disse "36 clientes precisam de atenção, já
// prontos 4/40": "TODAS ESSAS FORAM ENTREGUES E POSTADAS, TEM QUE VERIFICAR MELHOR ESSA ESTRUTURA".
//
// A véspera contava como pronto só quem tinha CARD no quadro com a data de amanhã. O time posta a
// maioria dos clientes sem abrir card: na sexta 25/09, 31 clientes postaram e 9 tinham card; na
// quarta 30/09, 21 e 6. Então "sem card" virava "precisa de atenção" para quem estava em dia — e
// aviso que erra 9 em cada 10 ensina o time a não ler o aviso.
//
// Agora a falta de card não acusa ninguém sozinha. O que acusa:
//   • card (ou demanda) pra amanhã com a arte ainda não entregue — pendência real, com nome;
//   • sem card E o cliente vem FALTANDO post nos últimos dias de post (Instagram real).
// Quem posta em dia sem usar o quadro é "em dia", não pendência.

/** Como está cada cliente na véspera. */
export type SituacaoVespera = "pronto" | "arte_pendente" | "em_dia" | "em_risco" | "sem_instagram";

export interface ClienteParaVespera {
  /** Tem card ou demanda de arte pra amanhã? */
  temPedidoAmanha: boolean;
  /** Todos os cards/demandas de amanhã com arte entregue. */
  pedidoEntregue: boolean;
  /** Dá pra conferir o Instagram (a coleta traz posts dele)? */
  instagramConferivel: boolean;
  /** Dias de post esperados mais recentes (YYYY-MM-DD, horário de SP), do mais novo pro mais velho. */
  diasEsperados: string[];
  /** Dias (YYYY-MM-DD, SP) em que o cliente postou de verdade. */
  diasComPost: ReadonlySet<string>;
}

export interface ResultadoVespera {
  situacao: SituacaoVespera;
  /** Em quantos dos dias esperados ele postou. */
  postou: number;
  de: number;
}

/** Quantas faltas recentes fazem "em risco". Uma falta isolada (feriado, cliente pediu pausa) não. */
const FALTAS_PARA_RISCO = 2;

const somaDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * O dia de post foi cumprido? Vale post no próprio dia ou um dia antes/depois — é a mesma folga da
 * conferência de postagem: agendou pra terça o post de segunda, o cliente não ficou sem post.
 */
export function cumpriuODia(dia: string, diasComPost: ReadonlySet<string>): boolean {
  return diasComPost.has(dia) || diasComPost.has(somaDias(dia, -1)) || diasComPost.has(somaDias(dia, 1));
}

export function classificarVespera(c: ClienteParaVespera): ResultadoVespera {
  const de = c.diasEsperados.length;
  const postou = c.diasEsperados.filter((d) => cumpriuODia(d, c.diasComPost)).length;

  if (c.temPedidoAmanha) return { situacao: c.pedidoEntregue ? "pronto" : "arte_pendente", postou, de };
  if (!c.instagramConferivel) return { situacao: "sem_instagram", postou, de };
  return { situacao: de - postou >= FALTAS_PARA_RISCO ? "em_risco" : "em_dia", postou, de };
}

/**
 * Os últimos `n` dias de post esperados ANTES de `hoje` (YYYY-MM-DD, SP). `diasDaSemana` em
 * getDay(): 1 = segunda, 3 = quarta, 5 = sexta. Quem só posta seg/sex não é cobrado de quarta.
 */
export function diasDePostAnteriores(hoje: string, diasDaSemana: ReadonlyArray<number>, n: number): string[] {
  const out: string[] = [];
  let d = somaDias(hoje, -1);
  for (let i = 0; i < 60 && out.length < n; i++, d = somaDias(d, -1)) {
    if (diasDaSemana.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) out.push(d);
  }
  return out;
}
