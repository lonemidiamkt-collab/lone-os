// O STATUS DE REUNIÃO DE UM CLIENTE NUM MÊS — a regra, num lugar só.
//
// Roberto (09/09): "reunião não pode existir somente como evento visual no calendário […]
// precisamos responder facilmente: qual cliente teve reunião este mês? qual não teve?"
//
// A distinção que o pedido chama de "extremamente importante": estar no calendário NÃO significa
// que aconteceu. Só `realizada` conta como reunião do mês. Uma reunião agendada é uma promessa;
// o indicador mede entrega.
//
// Este arquivo é FUNÇÃO PURA. Quem lê o banco é quem chama — assim a regra pode ser testada com
// linhas escritas à mão, e é a MESMA regra na aba Clientes, no dashboard e na ficha. Foi ter três
// cálculos parecidos em três telas que produziu, no passado, três respostas para a mesma pergunta.

/** Meta padrão da agência quando o cliente não tem uma própria. */
export const META_PADRAO_MES = 1;

export type EstadoReuniao =
  | "pendente" | "ofertada" | "proposta" | "aguardando_social"
  | "agendada" | "realizada" | "cancelada" | "no_show";

/** Só o que a regra precisa saber de uma reunião. */
export interface ReuniaoRef {
  id: string;
  clientId: string;
  estado: EstadoReuniao | string;
  /** Quando está marcada. */
  inicio: string;
  /** Quando aconteceu de verdade. Só existe em `realizada`. */
  realizadaEm?: string | null;
  responsavel?: string | null;
}

export type StatusMensal = "realizada" | "agendada" | "sem_reuniao";

export interface SaudeReuniao {
  status: StatusMensal;
  realizadas: number;
  agendadas: number;
  canceladas: number;
  naoCompareceu: number;
  meta: number;
  metaAtingida: boolean;
  /** A última que ACONTECEU, em qualquer mês. */
  ultima: string | null;
  /** A próxima marcada, daqui pra frente. */
  proxima: string | null;
  /** Dias desde a última realizada. `null` quando nunca houve uma. */
  diasSemReuniao: number | null;
}

/** O mês de referência, no fuso de São Paulo. `mes` no formato "2026-09". */
export function janelaDoMes(mes: string): { de: Date; ate: Date } {
  const [ano, m] = mes.split("-").map(Number);
  return {
    de: new Date(`${mes}-01T00:00:00-03:00`),
    ate: m === 12
      ? new Date(`${ano + 1}-01-01T00:00:00-03:00`)
      : new Date(`${ano}-${String(m + 1).padStart(2, "0")}-01T00:00:00-03:00`),
  };
}

/**
 * A data que conta para o mês.
 *
 * Para uma reunião REALIZADA é `realizada_em`: uma reunião marcada para 30/08 e realizada em 02/09
 * é reunião de setembro — foi em setembro que o cliente foi atendido. Para as demais é o início,
 * que é a única data que existe.
 */
function dataQueConta(r: ReuniaoRef): Date {
  return new Date(r.estado === "realizada" ? (r.realizadaEm || r.inicio) : r.inicio);
}

/**
 * Calcula a saúde de reunião de UM cliente.
 *
 * `reunioes` deve trazer TODAS as reuniões do cliente (não só as do mês) — "última reunião" e
 * "dias sem reunião" olham para trás, e filtrar antes esconderia justamente o cliente esquecido,
 * que é quem o indicador existe para achar.
 */
export function saudeDoCliente(
  reunioes: ReuniaoRef[],
  mes: string,
  agora: Date,
  metaCliente?: number | null,
): SaudeReuniao {
  const { de, ate } = janelaDoMes(mes);
  const noMes = reunioes.filter((r) => {
    const d = dataQueConta(r);
    return d >= de && d < ate;
  });

  const realizadas = noMes.filter((r) => r.estado === "realizada");
  const agendadas = noMes.filter((r) => r.estado === "agendada");
  const meta = metaCliente ?? META_PADRAO_MES;

  // A última que ACONTECEU — em qualquer mês, não só no de referência.
  const passadas = reunioes
    .filter((r) => r.estado === "realizada")
    .map((r) => dataQueConta(r))
    .sort((a, b) => b.getTime() - a.getTime());
  const ultima = passadas[0] ?? null;

  // A próxima marcada, daqui pra frente. Reunião de ontem que ninguém fechou não é "próxima".
  const futuras = reunioes
    .filter((r) => r.estado === "agendada" && new Date(r.inicio) >= agora)
    .map((r) => new Date(r.inicio))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    // Verde só com reunião REALIZADA. Amarelo é promessa. Vermelho é ninguém marcou nada.
    status: realizadas.length > 0 ? "realizada" : agendadas.length > 0 ? "agendada" : "sem_reuniao",
    realizadas: realizadas.length,
    agendadas: agendadas.length,
    canceladas: noMes.filter((r) => r.estado === "cancelada").length,
    naoCompareceu: noMes.filter((r) => r.estado === "no_show").length,
    meta,
    metaAtingida: realizadas.length >= meta,
    ultima: ultima ? ultima.toISOString() : null,
    proxima: futuras[0] ? futuras[0].toISOString() : null,
    diasSemReuniao: ultima
      ? Math.floor((agora.getTime() - ultima.getTime()) / 86400_000)
      : null,
  };
}

export interface Cobertura {
  clientesElegiveis: number;
  comReuniaoRealizada: number;
  comApenasAgendada: number;
  semReuniao: number;
  /** Percentual de clientes com PELO MENOS uma reunião realizada no mês. */
  percentual: number;
  totalRealizadas: number;
  totalAgendadas: number;
  totalCanceladas: number;
  totalNaoCompareceu: number;
  /** Quem bateu a meta própria. Diferente de "teve pelo menos uma". */
  comMetaAtingida: number;
}

/**
 * A cobertura do período.
 *
 * Divisor: clientes ELEGÍVEIS, não a base inteira. Cliente em onboarding ou arquivado no meio do
 * mês não deve derrubar o número de quem trabalhou — medir errado é pior que não medir.
 */
export function cobertura(saudes: SaudeReuniao[]): Cobertura {
  const elegiveis = saudes.length;
  const comRealizada = saudes.filter((s) => s.status === "realizada").length;
  return {
    clientesElegiveis: elegiveis,
    comReuniaoRealizada: comRealizada,
    comApenasAgendada: saudes.filter((s) => s.status === "agendada").length,
    semReuniao: saudes.filter((s) => s.status === "sem_reuniao").length,
    // Zero cliente elegível é 0%, não divisão por zero nem 100% de nada.
    percentual: elegiveis ? Math.round((comRealizada / elegiveis) * 1000) / 10 : 0,
    totalRealizadas: saudes.reduce((s, x) => s + x.realizadas, 0),
    totalAgendadas: saudes.reduce((s, x) => s + x.agendadas, 0),
    totalCanceladas: saudes.reduce((s, x) => s + x.canceladas, 0),
    totalNaoCompareceu: saudes.reduce((s, x) => s + x.naoCompareceu, 0),
    comMetaAtingida: saudes.filter((s) => s.metaAtingida).length,
  };
}

export interface PorResponsavel {
  responsavel: string;
  clientes: number;
  reunioesRealizadas: number;
  clientesCobertos: number;
  cobertura: number;
}

/**
 * Desempenho por dono de carteira.
 *
 * Conta pelo responsável DO CLIENTE, não pelo da reunião: a pergunta é "quem está cuidando da
 * carteira dele", e uma reunião que o Carlos fez no cliente do Thiago cobre o cliente do Thiago.
 */
export function porResponsavel(
  linhas: { responsavel: string | null; saude: SaudeReuniao }[],
): PorResponsavel[] {
  const mapa = new Map<string, { clientes: number; realizadas: number; cobertos: number }>();
  for (const l of linhas) {
    const nome = l.responsavel || "(sem responsável)";
    const a = mapa.get(nome) ?? { clientes: 0, realizadas: 0, cobertos: 0 };
    a.clientes += 1;
    a.realizadas += l.saude.realizadas;
    if (l.saude.status === "realizada") a.cobertos += 1;
    mapa.set(nome, a);
  }
  return [...mapa.entries()]
    .map(([responsavel, a]) => ({
      responsavel,
      clientes: a.clientes,
      reunioesRealizadas: a.realizadas,
      clientesCobertos: a.cobertos,
      cobertura: a.clientes ? Math.round((a.cobertos / a.clientes) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.cobertura - a.cobertura);
}

/** Os filtros da aba Clientes. */
export type FiltroReuniao =
  | "todos" | "realizada" | "agendada" | "sem_reuniao" | "atrasada" | "mais_de_30d";

export function passaNoFiltro(s: SaudeReuniao, f: FiltroReuniao, agora: Date): boolean {
  switch (f) {
    case "realizada":   return s.status === "realizada";
    case "agendada":    return s.status === "agendada";
    case "sem_reuniao": return s.status === "sem_reuniao";
    // Marcada, a hora passou, e ninguém disse se aconteceu. É o buraco por onde a métrica vaza:
    // a reunião fica "agendada" para sempre e não conta para lado nenhum.
    case "atrasada":
      return s.status === "agendada" && !!s.proxima === false && s.agendadas > 0;
    case "mais_de_30d": return s.diasSemReuniao === null || s.diasSemReuniao > 30;
    default: return true;
  }
}
