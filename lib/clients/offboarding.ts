// O ENCERRAMENTO COMO PROCESSO, NÃO COMO INTERRUPTOR.
//
// Roberto (09/09): "quero conseguir abrir um cliente que saiu há 2 anos e entender imediatamente
// quando entrou, quanto tempo ficou, por que saiu, quem encerrou, se existia dívida, se todas as
// entregas foram concluídas, o termo, a confirmação."
//
// Função pura: recebe o processo, devolve o que falta e o que alertar. A mesma regra serve à
// ficha do cliente, à aba de desativados e ao alerta operacional — três telas lendo um cálculo só.

import { MOTIVOS_SAIDA, type MotivoSaida } from "./churn";

export type Iniciativa = "cliente" | "lone" | "acordo";
export const INICIATIVAS: Record<Iniciativa, string> = {
  cliente: "O cliente pediu",
  lone: "Decisão da Lone",
  acordo: "Acordo entre as partes",
};

export type EstadoOffboarding =
  | "rascunho" | "em_revisao" | "termo_gerado" | "termo_enviado" | "confirmado" | "concluido";

export const ESTADOS: Record<EstadoOffboarding, string> = {
  rascunho: "Rascunho",
  em_revisao: "Aguardando revisão",
  termo_gerado: "Termo gerado",
  termo_enviado: "Termo enviado",
  confirmado: "Cliente confirmou",
  concluido: "Concluído",
};

export interface Offboarding {
  id: string;
  clientId: string;
  iniciativa: Iniciativa;
  motivo: MotivoSaida | string;
  motivoDetalhe?: string | null;
  solicitadoEm: string;   // YYYY-MM-DD
  encerraEm: string;      // YYYY-MM-DD
  financeiroOk?: boolean | null;
  financeiroNota?: string | null;
  entregasOk?: boolean | null;
  entregasNota?: string | null;
  estado: EstadoOffboarding;
  termoPath?: string | null;
  enviadoEm?: string | null;
  confirmadoEm?: string | null;
}

export interface ItemChecklist {
  chave: string;
  rotulo: string;
  feito: boolean;
  /** Sem isto, o encerramento não deveria ser dado por concluído. */
  essencial: boolean;
}

/**
 * O checklist é DERIVADO do que existe, não uma lista de caixinhas que alguém marca à mão.
 *
 * Caixinha manual mente: a pessoa marca "termo enviado" e ninguém enviou. Cada linha aqui olha um
 * fato — há motivo? há termo? há data de envio? — para o checklist não poder ficar verde sozinho.
 */
export function checklist(o: Offboarding): ItemChecklist[] {
  return [
    { chave: "motivo", rotulo: "Motivo registrado", feito: !!o.motivo, essencial: true },
    { chave: "data", rotulo: "Data de encerramento definida", feito: !!o.encerraEm, essencial: true },
    // `null` é "ninguém conferiu", e é diferente de "não há pendência". Por isso `!= null`, e não
    // `=== true`: conferir e achar dívida também é conferir.
    { chave: "financeiro", rotulo: "Financeiro conferido", feito: o.financeiroOk != null, essencial: true },
    { chave: "entregas", rotulo: "Entregas conferidas", feito: o.entregasOk != null, essencial: true },
    { chave: "termo", rotulo: "Termo gerado", feito: !!o.termoPath, essencial: true },
    { chave: "envio", rotulo: "Termo enviado ao cliente", feito: !!o.enviadoEm, essencial: true },
    { chave: "ciencia", rotulo: "Cliente confirmou ciência", feito: !!o.confirmadoEm, essencial: false },
  ];
}

export interface Situacao {
  itens: ItemChecklist[];
  faltando: ItemChecklist[];
  faltandoEssencial: ItemChecklist[];
  completo: boolean;
  percentual: number;
  /** Dias até a data efetiva. Negativo = já passou. */
  diasParaEncerrar: number;
  /** O que precisa de gente HOJE. Vazio quando está tudo em ordem. */
  alertas: string[];
}

export function avaliar(o: Offboarding, hoje = new Date()): Situacao {
  const itens = checklist(o);
  const faltando = itens.filter((i) => !i.feito);
  const faltandoEssencial = faltando.filter((i) => i.essencial);

  const fim = new Date(`${o.encerraEm}T00:00:00-03:00`);
  const hojeZero = new Date(`${hoje.toISOString().slice(0, 10)}T00:00:00-03:00`);
  const dias = Math.round((fim.getTime() - hojeZero.getTime()) / 86400_000);

  const alertas: string[] = [];
  // Roberto (§28): "cliente encerra amanhã — termo ainda não enviado."
  if (dias >= 0 && dias <= 1 && !o.enviadoEm) {
    alertas.push(dias === 0
      ? "Encerra HOJE e o termo não foi enviado."
      : "Encerra amanhã e o termo não foi enviado.");
  }
  if (dias < 0 && o.estado !== "concluido") {
    alertas.push(`A data efetiva passou há ${Math.abs(dias)} dia(s) e o encerramento não foi concluído.`);
  }
  if (o.enviadoEm && !o.confirmadoEm && dias < 0) {
    alertas.push("Termo enviado, mas o cliente ainda não confirmou ciência.");
  }
  // Pendência financeira aberta é o que mais dói depois: some da tela quando o cliente sai.
  if (o.financeiroOk === false) {
    alertas.push(`Pendência financeira registrada${o.financeiroNota ? `: ${o.financeiroNota}` : ""}.`);
  }
  if (o.entregasOk === false) {
    alertas.push("Há entregas não concluídas registradas.");
  }

  return {
    itens,
    faltando,
    faltandoEssencial,
    completo: faltandoEssencial.length === 0,
    percentual: Math.round(((itens.length - faltando.length) / itens.length) * 100),
    diasParaEncerrar: dias,
    alertas,
  };
}

/**
 * O que o TERMO pode afirmar.
 *
 * Roberto (§8), com todas as letras: "não gerar automaticamente a frase 'todos os débitos estão
 * quitados' sem verificar essa informação." Um documento assinado que afirma o que ninguém
 * conferiu é pior que um documento incompleto.
 */
export function frasesDoTermo(o: Offboarding): { financeiro: string; entregas: string } {
  return {
    financeiro: o.financeiroOk === true
      ? "Não há pendências financeiras entre as partes."
      : o.financeiroOk === false
        ? `Há pendências financeiras em aberto${o.financeiroNota ? `: ${o.financeiroNota}` : ""}.`
        : "A situação financeira não foi conferida até a emissão deste termo.",
    entregas: o.entregasOk === true
      ? "Todas as entregas contratadas foram concluídas."
      : o.entregasOk === false
        ? `Restam entregas pendentes${o.entregasNota ? `: ${o.entregasNota}` : ""}.`
        : "A situação das entregas não foi conferida até a emissão deste termo.",
  };
}

/** Quanto tempo o cliente ficou, em texto de gente. */
export function tempoDeParceria(inicio: string, fim?: string | null): string {
  const de = new Date(`${inicio.slice(0, 10)}T00:00:00-03:00`);
  const ate = new Date(`${(fim ?? new Date().toISOString()).slice(0, 10)}T00:00:00-03:00`);
  const meses = Math.max(0, (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth()));
  if (meses < 1) {
    const dias = Math.max(0, Math.round((ate.getTime() - de.getTime()) / 86400_000));
    return `${dias} dia${dias === 1 ? "" : "s"}`;
  }
  if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto ? `${anos}a ${resto}m` : `${anos} ano${anos === 1 ? "" : "s"}`;
}

export function rotuloMotivo(chave: string): string {
  return (MOTIVOS_SAIDA as Record<string, string>)[chave] ?? chave;
}
