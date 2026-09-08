// A SIMULAÇÃO: o que o agente TERIA dito, sem dizer nada a ninguém.
//
// Roberto (08/09): "não tem como testar em ninguém agora." E, no review: "SIMULAÇÃO → 5 clientes
// → 10 → 20 → todos. Você encontra um bug com 5 clientes em vez de descobrir o mesmo bug
// simultaneamente em 40 grupos."
//
// Sem cliente para testar, o teste é o passado: 13 mil mensagens reais já guardadas em
// `cs_message_corpus`. Reencenar a conversa inteira pelo parser de hoje mostra exatamente onde
// ele abriria a boca — e o caso Império dos Pisos prova que é onde ele abre a boca sem ser
// chamado que está o perigo.
//
// NADA É ENVIADO. Este módulo é função pura: recebe mensagens, devolve o que sairia.
//
// O DETALHE QUE FAZ A SIMULAÇÃO VALER: ela reencena a conversa em ORDEM, carregando o estado de
// uma mensagem para a próxima. Sem isso, cada mensagem seria julgada sozinha e o bug do Império
// (perguntar e não reconhecer a resposta que veio a seguir) ficaria invisível — foi exatamente
// o que aconteceu de verdade.

import {
  lerIntencaoReuniao, textoPergunta, textoPropoeHorario, propostaValida,
  ehConfirmacaoCurta, textoPropostaExpirada, type IntencaoReuniao,
} from "./agendar-reuniao";
import { porExtenso } from "./parse-horario";

export interface MensagemCorpus {
  id: string;
  clientId: string;
  cliente: string;
  autor: string | null;
  texto: string;
  quando: string;
}

export interface Passo {
  quando: string;
  cliente: string;
  autor: string | null;
  /** A mensagem do cliente, inteira. É o que se lê para julgar se a reação faz sentido. */
  texto: string;
  tipo: IntencaoReuniao["tipo"] | "proposta_expirada";
  /** O texto EXATO que sairia no grupo do cliente. `null` quando a reação é só interna. */
  resposta: string | null;
  /** O que muda no estado da conversa — é o que explica a reação da mensagem seguinte. */
  efeito: string;
}

/** Quanto tempo o agente lembra que perguntou o horário. Igual ao da rota. */
const MEMORIA_PERGUNTA_H = 6;

interface EstadoConversa {
  propostoIso?: string;
  propostoEm?: Date;
  perguntouEm?: Date;
}

/**
 * Reencena as mensagens de um cliente, em ordem, e devolve só os momentos em que o agente agiria.
 *
 * `msgs` precisa vir ordenada por data crescente — a ordem É a simulação.
 */
export function simularCliente(msgs: MensagemCorpus[]): Passo[] {
  const passos: Passo[] = [];
  const e: EstadoConversa = {};

  for (const m of msgs) {
    const agora = new Date(m.quando);
    if (Number.isNaN(agora.getTime())) continue;

    const lembraPergunta = !!e.perguntouEm
      && agora.getTime() - e.perguntouEm.getTime() <= MEMORIA_PERGUNTA_H * 3600_000;
    const propValida = propostaValida(e.propostoEm?.toISOString() ?? null, agora);

    // Aceite de uma proposta que já venceu: o agente reconhece, mas não fecha.
    if (e.propostoIso && !propValida && ehConfirmacaoCurta(m.texto, agora)) {
      passos.push({
        quando: m.quando, cliente: m.cliente, autor: m.autor, texto: m.texto,
        tipo: "proposta_expirada",
        resposta: textoPropostaExpirada(porExtenso(e.propostoIso)),
        efeito: "volta ao social para reconfirmar o horário",
      });
      e.propostoIso = undefined; e.propostoEm = undefined;
      continue;
    }

    const intencao = lerIntencaoReuniao(
      m.texto, agora, propValida ? e.propostoIso : undefined, lembraPergunta,
    );
    if (intencao.tipo === "nenhuma") continue;

    const base = { quando: m.quando, cliente: m.cliente, autor: m.autor, texto: m.texto };

    switch (intencao.tipo) {
      case "agendar":
        passos.push({
          ...base, tipo: "agendar",
          resposta: `📅 Anotei: *${porExtenso(intencao.iso)}*. Vou confirmar com o time e já te falo! 👍`,
          efeito: `pergunta ao social se pode ${porExtenso(intencao.iso)}`,
        });
        e.propostoIso = undefined; e.propostoEm = undefined; e.perguntouEm = undefined;
        break;

      case "propor":
        passos.push({
          ...base, tipo: "propor",
          resposta: textoPropoeHorario(intencao.iso),
          efeito: `fica esperando o cliente confirmar ${porExtenso(intencao.iso)}`,
        });
        e.propostoIso = intencao.iso; e.propostoEm = agora; e.perguntouEm = undefined;
        break;

      case "perguntar_horario":
        passos.push({
          ...base, tipo: "perguntar_horario",
          resposta: textoPergunta(intencao.motivo),
          efeito: `passa a reconhecer horário nas respostas pelas próximas ${MEMORIA_PERGUNTA_H}h`,
        });
        e.perguntouEm = agora;
        break;

      case "recusa":
        passos.push({
          ...base, tipo: "recusa", resposta: null,
          efeito: "registra a recusa e não insiste",
        });
        e.propostoIso = undefined; e.propostoEm = undefined; e.perguntouEm = undefined;
        break;
    }
  }

  return passos;
}

/** Agrupa por cliente e reencena cada conversa separadamente. */
export function simular(msgs: MensagemCorpus[]): Passo[] {
  const porCliente = new Map<string, MensagemCorpus[]>();
  for (const m of msgs) {
    const l = porCliente.get(m.clientId) ?? [];
    l.push(m);
    porCliente.set(m.clientId, l);
  }
  const out: Passo[] = [];
  for (const [, lista] of porCliente) {
    lista.sort((a, b) => a.quando.localeCompare(b.quando));
    out.push(...simularCliente(lista));
  }
  return out.sort((a, b) => b.quando.localeCompare(a.quando));
}

export interface Resumo {
  mensagens: number;
  clientes: number;
  reacoes: number;
  porTipo: Record<string, number>;
  /** Clientes em que o agente falaria, e quantas vezes. Ordena pelo mais falante. */
  porCliente: { cliente: string; reacoes: number }[];
}

export function resumir(msgs: MensagemCorpus[], passos: Passo[]): Resumo {
  const porTipo: Record<string, number> = {};
  for (const p of passos) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1;
  const contagem = new Map<string, number>();
  for (const p of passos) contagem.set(p.cliente, (contagem.get(p.cliente) ?? 0) + 1);
  return {
    mensagens: msgs.length,
    clientes: new Set(msgs.map((m) => m.clientId)).size,
    reacoes: passos.length,
    porTipo,
    porCliente: [...contagem.entries()]
      .map(([cliente, reacoes]) => ({ cliente, reacoes }))
      .sort((a, b) => b.reacoes - a.reacoes),
  };
}
