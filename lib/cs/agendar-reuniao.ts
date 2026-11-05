// AGENDAR A REUNIÃO A PARTIR DA CONVERSA.
//
// PRA QUE (Roberto, 02/09): "a IA tem que ver se o cliente marcou a reunião ou não no grupo… e aí
// o cliente marcando ela já coloca na agenda desse social media."
//
// Duas metades:
//   • RECONHECER que a conversa é sobre marcar a reunião mensal (e não sobre outra coisa com data,
//     como "a promoção começa dia 18").
//   • CONFIRMAR ou PERGUNTAR. Um horário mal lido coloca alguém sozinho numa chamada, então: só
//     agenda com data E hora explícitas; qualquer vaguidão vira pergunta.

import { lerHorario, lerHora, horarioPlausivel, porExtenso, semAcento } from "./parse-horario";
import { componentesSP, dataSP, isoSP, somarDias } from "@/lib/prospeccao/tempo";
import { tempoQueFalta } from "./reuniao-mensal";

/** Fala sobre a reunião de acompanhamento — não sobre uma data qualquer. */
const RX_REUNIAO = /\b(reuni[ãa]o|reuniao|call|meet|alinhamento|conversar|bate[- ]?papo|videochamada|v[ií]deo\s*chamada)\b/i;

/**
 * Verbos que indicam MARCAR sem ambiguidade nenhuma. "tivemos uma reunião" não agenda nada.
 */
const RX_MARCAR_FORTE =
  /\b(marcar?|marca|marque|agendar?|agenda|agende|remarcar?|remarca|combinar?|combina|que tal)\b/i;

/**
 * Verbos AMBÍGUOS. Sozinhos não querem dizer nada — só contam quando estão perto da palavra
 * "reunião". "podemos utilizar o CRM" não marca reunião nenhuma.
 */
const RX_MARCAR_FRACO =
  /\b(pode ser|podemos|posso|consigo|topo|fechado|confirmo|confirmado|dispon[íi]vel|disponibilidade)\b/i;

/**
 * Fala DE uma reunião que já existe, sobre o que vai acontecer nela.
 *
 * "Na reunião, vou apresentar os pontos do CRM" — quem escreve isso já tem a reunião. Não está
 * pedindo para marcar, está contando o que vai fazer nela.
 */
const RX_REUNIAO_EXISTENTE =
  /\b(?:n[ao]|numa|duma|dessa|desta|daquela|nessa|nesta|naquela|durante\s+[ao]|antes\s+d[ao]|depois\s+d[ao]|pr[ao]|para\s+[ao]|sobre\s+[ao])\s+(?:nossa\s+|pr[óo]xima\s+|[úu]ltima\s+)?(?:reuni[ãa]o|call|meet)\b/i;

/** Distância máxima, em caracteres, entre "reunião" e o verbo para contarem como um pedido. */
const PERTO = 60;

/** Referências a DIA numa mensagem: "amanhã", "sexta", "dia 8", "18/09". */
const RX_DIAS = /\b(hoje|amanh[ãa]|depois de amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|dia\s+\d{1,2}|\d{1,2}\/\d{1,2})\b/gi;

/** Referências a HORA: "14:00", "10h30", "às 9", "16h". */
const RX_HORAS = /\b(\d{1,2}\s*[:h]\s*\d{2}|\d{1,2}\s*(?:hrs?|hs|h|horas?)\b|(?:as|às)\s+\d{1,2}\b)/gi;

/**
 * A mensagem oferece MAIS DE UMA opção de dia ou de hora?
 *
 * Achado na simulação (08/09), duas mensagens reais:
 *   • "Amanha as 14:00 to enrolado. Podemos combinar na segunda?" — o agente marcava justamente
 *     as 14h que o cliente acabou de recusar. O "to enrolado" não é recusa que regex nenhum
 *     conheça, mas as DUAS referências de dia (amanhã, segunda) são visíveis.
 *   • "Podemos marcar amanhã por volta das 14:00 ou sexta umas 10:30" — duas opções legítimas, e
 *     ele silenciosamente escolhia a primeira.
 *
 * Roberto já tinha escrito a regra: "não chuta horário". Com duas opções na mesa, escolher uma é
 * chutar — perguntar custa uma mensagem, marcar no dia errado custa a reunião.
 */
export function ofereceMaisDeUmHorario(texto: string): boolean {
  const t = texto || "";
  const dias = new Set([...t.matchAll(RX_DIAS)].map((m) => m[0].toLowerCase().replace(/\s+/g, " ")));
  const horas = new Set([...t.matchAll(RX_HORAS)].map((m) => m[0].toLowerCase().replace(/\s+/g, "")));
  return dias.size > 1 || horas.size > 1;
}

/**
 * Alguém VAI entrar em contato — não é proposta de horário.
 *
 * "Matheus vai entrar em contato com vocês hoje de tarde para ver a questão da reunião": o "hoje
 * de tarde" é de quem vai ligar, não da reunião. O agente propunha reunião para hoje às 15h.
 */
const RX_RECADO = /\b(vai|v[ãa]o|ir[áa]|ir[ãa]o)\s+(?:\w+\s+){0,2}(entrar em contato|falar|ligar|chamar|procurar|retornar)\b/i;

/**
 * O verbo de marcar está PERTO da palavra reunião?
 *
 * O caso Império dos Pisos (08/09): três parágrafos sobre o CRM, terminando com "recursos e
 * possibilidades que *podemos* utilizar" — a mais de 150 caracteres do "na *reunião* vou
 * apresentar" do parágrafo anterior. Bastou o "podemos" para o agente abrir uma conversa de
 * agendamento que ninguém pediu, num grupo de cliente. Coincidência de vocabulário não é intenção.
 */
function marcarPertoDeReuniao(t: string): boolean {
  const achar = (rx: RegExp) =>
    [...t.matchAll(new RegExp(rx.source, "gi"))].map((m) => m.index ?? 0);
  const reunioes = achar(RX_REUNIAO);
  if (!reunioes.length) return false;
  return [...achar(RX_MARCAR_FORTE), ...achar(RX_MARCAR_FRACO)]
    .some((v) => reunioes.some((r) => Math.abs(v - r) <= PERTO));
}

/** Passado: "a reunião foi ótima", "na reunião de ontem" — não é agendamento. */
const RX_PASSADO = /\b(foi|teve|tivemos|aconteceu|ontem|semana passada|m[êe]s passado|na [úu]ltima)\b/i;

/** Recusa/adiamento: precisa de tratamento diferente de uma proposta. */
const RX_RECUSA = /\b(n[ãa]o (posso|consigo|d[áa]|vai dar|rola|vou conseguir|vou poder)|imposs[íi]vel|remarcar|adiar|outro dia|outra hora|desmarcar|cancelar)\b/i;

export type IntencaoReuniao =
  | { tipo: "agendar"; iso: string; trecho: string; confirmar: false }
  /** O cliente deu o DIA e o TURNO ("terça à tarde"). Não é hora exata, mas é quase tudo: o
   *  agente propõe um horário concreto dentro do turno em vez de devolver a pergunta. */
  | { tipo: "propor"; iso: string; trecho: string }
  | { tipo: "perguntar_horario"; motivo: string }
  | { tipo: "recusa" }
  | { tipo: "nenhuma" };

/**
 * Lê a mensagem e decide o que fazer.
 *
 * A ordem das checagens importa: recusa antes de proposta (quem diz "não posso terça, pode
 * quarta?" está propondo quarta, mas quem diz "não posso essa semana" não está propondo nada), e
 * passado antes de tudo (relato não agenda).
 */
/**
 * Confirmação curta a uma proposta que o agente fez.
 *
 * "Isso! Pode confirmar" não tem data, nem hora, nem a palavra "reunião" — e por isso caía em
 * `nenhuma`, deixando o cliente falando sozinho depois de ter concordado. Só faz sentido quando
 * EXISTE uma proposta pendente, então quem chama passa `propostoIso`; sem isso, uma resposta
 * dessas continua sendo conversa comum.
 */
const RX_CONFIRMA_CURTO =
  /^\s*(?:isso|isso a[ií]|exato|exatamente|perfeito|pode(?:\s+(?:ser|sim|confirmar|marcar|agendar))?|confirma|confirmado|fechado|fechou|combinado|beleza|blz|ok|okay|show|boa|t[áa] [óo]timo|t[áa] bom|por mim (?:ok|beleza|t[áa] bom)|sim)(?=[\s,.!…]|$)/i;

/** Tamanho máximo de uma mensagem que ainda pode ser lida como RESPOSTA a "que horas?". */
const RESPOSTA_CURTA = 160;

/**
 * Por quanto tempo um horário proposto continua valendo.
 *
 * Roberto (08/09): *"Loninho: 'pode terça às 15h?' Cliente responde dois dias depois: 'pode'. Seu
 * agente pode interpretar isso como confirmação. Não deveria. A proposta precisa ter validade."*
 *
 * Ele está certo, e o custo do erro é concreto: em dois dias alguém pode ter posto outra coisa
 * naquele horário, e o agente confirmaria uma reunião que já não cabe.
 */
export const VALIDADE_PROPOSTA_H = 24;

/** A proposta feita em `propostoEm` ainda vale? */
export function propostaValida(propostoEm: string | null | undefined, agora = new Date()): boolean {
  if (!propostoEm) return false;
  const t = new Date(propostoEm).getTime();
  if (Number.isNaN(t)) return false;
  return agora.getTime() - t <= VALIDADE_PROPOSTA_H * 3600_000;
}

/**
 * "isso", "pode", "beleza" — um aceite curto, sem data nem hora.
 *
 * Exportado porque a rota precisa reconhecê-lo mesmo quando a proposta JÁ EXPIROU: o cliente
 * concordou de boa-fé e não pode levar silêncio por causa de um relógio nosso.
 */
export function ehConfirmacaoCurta(texto: string, agora = new Date()): boolean {
  const t = (texto || "").trim();
  if (!t || !RX_CONFIRMA_CURTO.test(t) || RX_RECUSA.test(t)) return false;
  // "pode ser dia 20 às 10h" começa igual a um aceite e não é: é horário NOVO. Qualquer data ou
  // hora legível na mensagem desqualifica — quem manda horário está corrigindo, não concordando.
  if (lerHorario(t, agora)) return false;
  if (lerHora(t)?.explicita) return false;
  return true;
}

/** O que ele diz quando o cliente concorda com um horário que já passou da validade. */
export function textoPropostaExpirada(quandoExtenso: string): string {
  return `📅 Perfeito! Só me dá um minuto: *${quandoExtenso}* foi combinado faz mais de um dia e eu `
    + `preciso confirmar se continua livre. Já te falo! 👍`;
}

export function lerIntencaoReuniao(
  texto: string,
  agora = new Date(),
  propostoIso?: string,
  /**
   * O agente perguntou o horário a este cliente há pouco e está esperando a resposta.
   *
   * Quem chama decide o "há pouco" (a rota usa 6 horas) — aqui só se usa o fato.
   */
  perguntouHorario = false,
): IntencaoReuniao {
  const t = (texto || "").trim();
  if (!t) return { tipo: "nenhuma" };

  // Com proposta pendente, um "isso, pode confirmar" fecha — mas só depois de checar se a
  // mensagem não traz um horário NOVO (o cliente pode estar corrigindo, não concordando).
  if (propostoIso) {
    const comHora = lerHorario(t, agora);
    const soHora = !comHora ? lerHora(t) : null;
    const temHorarioNovo = (comHora?.horaExplicita) || (soHora?.explicita);
    if (!temHorarioNovo && RX_CONFIRMA_CURTO.test(t) && !RX_RECUSA.test(t)) {
      return { tipo: "agendar", iso: propostoIso, trecho: t.slice(0, 60), confirmar: false };
    }
    // E a recusa curta também: "não vai dar não" não tem a palavra "reunião" nem verbo de marcar,
    // então cairia em `nenhuma` — o agente ficaria esperando resposta a uma proposta que já foi
    // negada, e cobraria o cliente por isso depois.
    if (!temHorarioNovo && RX_RECUSA.test(t)) return { tipo: "recusa" };
  }

  // ── ELE PERGUNTOU. ISTO É A RESPOSTA. ───────────────────────────────────
  //
  // Império dos Pisos (08/09): o agente perguntou *"me confirma só o horário — por exemplo, 'dia
  // 18 às 14h'"*. O cliente respondeu **"Amanhã 9:30 esta ótimo!"**, exatamente no formato pedido
  // — e o agente ficou mudo, porque a resposta não tinha a palavra "reunião" nem verbo de marcar.
  //
  // Perguntar e não reconhecer a resposta é pior que nunca ter perguntado: o cliente respondeu,
  // ficou esperando, e do lado de cá não existe nem registro de que ele respondeu.
  //
  // Duas travas para isto não virar um funil que engole tudo por 6 horas: a mensagem precisa ser
  // CURTA (ninguém responde "que horas?" com três parágrafos) e o horário precisa ser plausível.
  // Sem horário legível, a mensagem segue o caminho normal e provavelmente vira `nenhuma`.
  if (perguntouHorario && t.length <= RESPOSTA_CURTA) {
    if (RX_RECUSA.test(t)) return { tipo: "recusa" };
    const h = lerHorario(t, agora);
    if (h) {
      const plaus = horarioPlausivel(h.iso, agora);
      if (!plaus.ok) {
        return { tipo: "perguntar_horario", motivo: plaus.motivo ?? "horário improvável" };
      }
      return h.horaExplicita
        ? { tipo: "agendar", iso: h.iso, trecho: h.trecho, confirmar: false }
        : { tipo: "propor", iso: h.iso, trecho: h.trecho };
    }
  }

  const falaDeReuniao = RX_REUNIAO.test(t);
  const querMarcar = RX_MARCAR_FORTE.test(t) || RX_MARCAR_FRACO.test(t);

  // Relato do que já aconteceu não agenda nada.
  if (falaDeReuniao && RX_PASSADO.test(t) && !querMarcar) return { tipo: "nenhuma" };

  const horario = lerHorario(t, agora);

  // Recusa SEM contraproposta: quem disse que não pode e não ofereceu alternativa.
  if (RX_RECUSA.test(t) && !horario) return falaDeReuniao || querMarcar ? { tipo: "recusa" } : { tipo: "nenhuma" };

  // ── SEM CONTEXTO, EXIGE OS DOIS SINAIS ─────────────────────────────────
  //
  // Era "reunião OU verbo de marcar". A simulação sobre 4.584 mensagens reais mostrou que o OU
  // deixa passar mensagem que não tem nada a ver:
  //   • "Leads chegam depois das 18h… a partir de *segunda* já estou com uma pessoa
  //     *disponível*" → o agente marcaria segunda às 18h;
  //   • "Amanhã as 14:00 to enrolado. *Podemos* combinar na segunda?" → marcaria exatamente as
  //     14h que o cliente acabou de recusar (o "to enrolado" não é recusa que o regex conheça);
  //   • um relatório de atendimento com "ficou de retornar para *agendar*".
  //
  // Quando NÃO há pergunta nem proposta pendente, o agente só abre conversa de agendamento se a
  // mensagem falar de reunião E pedir para marcar. Quem responde a uma pergunta dele omite a
  // palavra "reunião" — e esse caso já é tratado lá em cima, pelo contexto.
  //
  // Custo de errar para cada lado: calado, o social lê a mensagem e resolve; falando, a Lone
  // escreveu no grupo do cliente sobre algo que ninguém pediu.
  //
  // Com pergunta ou proposta PENDENTE o portão não se aplica: aí a mensagem é resposta a algo que
  // o agente perguntou, e ninguém repete "reunião" ao responder "consigo dia 18 às 16h".
  const temContexto = !!propostoIso || perguntouHorario;
  if (!temContexto) {
    // Um pedido CURTO e direto vale sozinho: "marca aí pra dia 18 às 10h" é a mensagem inteira,
    // não sobra assunto para ser outra coisa. É o comprimento que separa esse caso do relatório
    // de atendimento de 1.500 caracteres onde "agendar" aparece de passagem.
    const pedidoDireto = RX_MARCAR_FORTE.test(t) && t.length <= RESPOSTA_CURTA;
    // Falar de reunião basta para ENTRAR: quando há data na mensagem, a data já é a intenção
    // ("reunião dia 18 de manhã" não precisa de verbo). A exigência do verbo continua existindo
    // logo abaixo, no ramo em que NÃO há data — que é onde o agente inventava conversa.
    if (!pedidoDireto && !falaDeReuniao) return { tipo: "nenhuma" };
  }

  if (!horario) {
    // ── SEM DATA NENHUMA: o ramo mais perigoso ────────────────────────────
    //
    // É o único caminho em que o agente ABRE uma conversa a partir de vocabulário solto — não há
    // data para ancorar nada. Foi por aqui que ele respondeu ao Matheus (Império dos Pisos, 08/09)
    // um "me confirma só o horário" no meio de três parágrafos sobre o CRM.
    //
    // Quando existe data na mensagem, um verbo fraco basta ("consigo dia 18 às 16h" é pedido, e
    // sempre foi). Sem data, a régua é outra: o verbo fraco só conta se estiver PERTO da palavra
    // reunião, e falar DE uma reunião que já existe não conta de jeito nenhum.
    if (!falaDeReuniao) return { tipo: "nenhuma" };
    const pedeDeVerdade = RX_MARCAR_FORTE.test(t) || marcarPertoDeReuniao(t);
    if (!pedeDeVerdade) return { tipo: "nenhuma" };
    // "Na reunião vou apresentar os números" — quem escreve isso já tem a reunião. Um verbo forte
    // desfaz: "sobre a reunião que a gente vai marcar" continua sendo pedido.
    if (RX_REUNIAO_EXISTENTE.test(t) && !RX_MARCAR_FORTE.test(t)) return { tipo: "nenhuma" };
    return { tipo: "perguntar_horario", motivo: "sem data ou hora na mensagem" };
  }

  // Recado de terceiro não é proposta: o horário citado é de quem vai ligar.
  if (RX_RECADO.test(t)) return { tipo: "nenhuma" };

  // Duas opções na mesa: pergunta qual, em vez de escolher a primeira.
  //
  // Não vale quando há recusa explícita: "não posso terça, pode ser quarta às 10h?" também cita
  // dois dias, mas um deles está NEGADO — o cliente está estreitando, não oferecendo escolha.
  // (O "to enrolado" do Mercadão não é recusa que o regex conheça, e é justamente por isso que
  // ele continua caindo aqui.)
  if (!RX_RECUSA.test(t) && ofereceMaisDeUmHorario(t)) {
    return { tipo: "perguntar_horario", motivo: "mais de um dia ou horário na mensagem" };
  }

  if (!horario.horaExplicita) {
    // ── O CASO CONTELE (04/09) ──────────────────────────────────────────────
    //
    // O cliente escreveu "Eu consigo terça à tarde" e o agente respondeu "me confirma só o
    // horário". O cliente devolveu "Isso! Pode confirmar" — e o agente perguntou de novo. Três
    // vezes a mesma pergunta, nenhuma reunião marcada.
    //
    // O erro não era de entendimento: o parser JÁ tinha calculado terça às 15h e jogava fora
    // porque a hora não foi dita com todas as letras. Quem sabe o dia e o turno tem quase tudo —
    // devolver a pergunta transfere ao cliente um trabalho que é nosso.
    //
    // Agora o agente PROPÕE o horário concreto. O cliente responde sim ou corrige, e nos dois
    // casos a conversa anda.
    const plaus = horarioPlausivel(horario.iso, agora);
    if (plaus.ok) return { tipo: "propor", iso: horario.iso, trecho: horario.trecho };
    return { tipo: "perguntar_horario", motivo: plaus.motivo ?? `disse "${horario.trecho}" mas não a hora exata` };
  }

  const plausivel = horarioPlausivel(horario.iso, agora);
  if (!plausivel.ok) {
    // ── HORÁRIO IMPLAUSÍVEL SEM FALAR DE REUNIÃO NÃO É PERGUNTA ───────────
    //
    // Achado pela simulação sobre 4.584 mensagens reais (08/09). Dois disparos, nenhum sobre
    // reunião:
    //   • "Segunda a sexta: 7:30 às 18:00 / Domingo: *fechado*" — o horário de funcionamento da
    //     loja. "fechado" ligou o verbo de marcação e "domingo 7:30" caiu como implausível.
    //   • um relatório de atendimento de 1.500 caracteres com "ficou de retornar para *agendar*"
    //     e a data "20/07" no meio — passado, logo implausível.
    // Nos dois o agente responderia "me confirma só o horário" a quem não pediu nada.
    //
    // Uma data estranha numa mensagem que nunca menciona reunião é só um dado: um relatório, um
    // horário de loja. Não há o que perguntar. Com a palavra na mensagem, a pergunta continua
    // valendo — é o caso de quem propõe reunião num domingo.
    if (!falaDeReuniao) return { tipo: "nenhuma" };
    return { tipo: "perguntar_horario", motivo: plausivel.motivo ?? "horário improvável" };
  }

  return { tipo: "agendar", iso: horario.iso, trecho: horario.trecho, confirmar: false };
}

/** O que o agente responde no grupo do cliente ao entender o horário. */
export function textoConfirmacao(cliente: string, iso: string): string {
  return `📅 Fechado! Anotei a reunião de acompanhamento da *${cliente}* para *${porExtenso(iso)}*.\n`
    + `Vou lembrar todo mundo na véspera. Se precisar mudar, é só falar aqui.`;
}

/**
 * O agente propondo o horário concreto a partir do turno que o cliente deu.
 *
 * Pergunta fechada, de sim ou não: é o que faz a conversa terminar numa resposta, em vez de virar
 * uma negociação de horário por mensagem.
 */
export function textoPropoeHorario(iso: string): string {
  return `📅 Perfeito! Fica bom *${porExtenso(iso)}*?\n`
    + `Se preferir outro horário nesse dia, é só me dizer.`;
}

/**
 * Quando entendeu que é reunião mas não o horário.
 *
 * O `motivo` NÃO vai para o cliente. A versão anterior imprimia `_(disse "quinta" mas não a hora
 * exata)_` na mensagem — diagnóstico interno vazando para fora, que faz o cliente ler o
 * funcionamento do sistema em vez da pergunta. Ele fica no log, para quando o parser errar.
 */
export function textoPergunta(motivo: string): string {
  void motivo;   // fica no console; o cliente vê só a pergunta
  return `📅 Perfeito! Me confirma só o horário — por exemplo, “dia 18 às 14h” — que eu já deixo marcado.`;
}

/** Duração padrão da reunião de acompanhamento, em minutos. */
export const DURACAO_MIN = 30;

/**
 * O agente OFERECENDO horário. Duas opções concretas fecham mais rápido que "quando você pode?".
 *
 * Diz o FORMATO e a DURAÇÃO desde a primeira mensagem. Sem isso o cliente aceita um horário sem
 * saber se precisa reservar meia hora ou duas, nem se vai ter que sair do escritório — e a
 * primeira coisa que ele responde é "é presencial?", que vira mais uma ida e volta.
 */
export function textoOferta(cliente: string, opcoes: string[]): string {
  return `Oi! 👋 Chegou a hora da nossa reunião mensal de acompanhamento da *${cliente}* — `
    + `a gente revisa os resultados do mês e alinha o próximo. É online, uns ${DURACAO_MIN} minutinhos.\n\n`
    + opcoes.map((o) => `• ${o}`).join("\n")
    + `\n\nAlgum desses funciona? Se preferir outro horário, é só dizer.`;
}

/**
 * Sugere horários úteis a partir de amanhã, preferindo os que cabem DENTRO da janela.
 *
 * Roberto: "ele tem do dia quinze a vinte e dois pra poder marcar e fazer a reunião nessa semana"
 * — a reunião deve acontecer no próprio ciclo sempre que der. Só quando a janela está acabando é
 * que as opções passam dela; oferecer só datas impossíveis seria pior que oferecer datas fora.
 *
 * Devolve também o ISO, não só o texto: quem oferece precisa saber o que ofereceu para reconhecer
 * "pode ser o primeiro" como resposta.
 */
export function sugerirHorarios(agora: Date, quantos = 2, ateIso?: string): { iso: string; texto: string }[] {
  const out: { iso: string; texto: string }[] = [];
  const horas = [10, 15];

  // Dias e horas de São Paulo, em qualquer fuso de servidor. Com `setHours` no container em UTC, o
  // "10h" e o "15h" saíam para o cliente como 07:00 e 12:00.
  const varrer = (respeitarLimite: boolean) => {
    for (let i = 1; i <= 21 && out.length < quantos; i++) {
      const d = componentesSP(somarDias(agora, i));
      if (d.diaSemana === 0 || d.diaSemana === 6) continue;   // reunião é em dia útil
      if (respeitarLimite && ateIso && d.ymd > ateIso) break;  // não passa da janela nesta passada
      const iso = isoSP(dataSP(d.ano, d.mes, d.dia, horas[out.length % horas.length]));
      if (out.some((o) => o.iso === iso)) continue;
      out.push({ iso, texto: porExtenso(iso) });
    }
  };

  varrer(true);
  // Janela apertada demais para caber as opções: sai dela, mas só depois de tentar caber dentro.
  if (out.length < quantos) varrer(false);
  return out;
}

// ── A RESPOSTA À OFERTA ──────────────────────────────────────────────────
//
// O agente oferece "terça às 10:00 ou quarta às 15:00" e o cliente responde "pode ser terça às
// 15h" ou "o primeiro". Nada disso tem a palavra "reunião", e a oferta não contava como pergunta:
// o agente ficava mudo com quem tinha acabado de responder a ele. É o mesmo "perguntou e esqueceu"
// do Império dos Pisos (08/09), que só tinha sido corrigido para a pergunta de horário.
//
// A oferta fica aberta por dias, não por horas. Por isso a mensagem precisa ser só a resposta:
// "a promoção começa dia 18 às 8h" é curta e tem data, e não pode virar reunião.

/** O que pode estar numa resposta de horário além da própria data e hora. */
const PALAVRAS_DE_RESPOSTA = new Set((
  "a o as os e de do da no na pra para pro por mim me eu pode ser sim ok fica ficaria bom boa otimo otima "
  + "melhor perfeito esta ta funciona consigo posso prefiro entao que se puder dia hoje amanha depois manha "
  + "tarde noite semana vem proxima proximo feira segunda terca quarta quinta sexta sabado horas hora hs hrs "
  + "meio meia opcao primeiro primeira segundo nessa nesse essa esse fechado combinado beleza blz show"
).split(" "));

/** A mensagem é só uma resposta de horário, sem outro assunto junto? */
export function pareceRespostaDeHorario(texto: string): boolean {
  const t = semAcento(texto || "").trim();
  if (!t || t.length > RESPOSTA_CURTA) return false;
  const palavras = t.replace(/[^a-z0-9:/\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  return palavras.filter((p) => !/^\d/.test(p) && !PALAVRAS_DE_RESPOSTA.has(p)).length <= 1;
}

const NOME_DO_DIA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/**
 * O cliente escolheu uma das opções oferecidas, sem dizer a hora?
 *
 * Devolve null quando não é o caso (inclusive quando a mensagem traz hora: aí quem lê é o parser).
 * "Pode ser" não diz qual das duas, então pergunta, mas só quando o cliente citou a oferta: solto
 * no grupo, "pode ser" responde a qualquer outra coisa.
 */
export function lerRespostaOferta(texto: string, opcoes: { iso: string }[], citouOferta = false): IntencaoReuniao | null {
  const t = semAcento(texto || "").trim();
  if (!opcoes.length || !t || RX_RECUSA.test(t) || lerHora(t)?.explicita) return null;
  const escolhe = (o: { iso: string }): IntencaoReuniao => ({ tipo: "agendar", iso: o.iso, trecho: t.slice(0, 60), confirmar: false });

  if (/\b(?:qualquer\s+(?:um|uma|horario)|tanto\s+faz)\b/.test(t) && t.length <= 40) return escolhe(opcoes[0]);
  if (!pareceRespostaDeHorario(t)) return null;

  if (/\bopcao\s*1\b|\bprimeira\s+opcao\b/.test(t)) return escolhe(opcoes[0]);
  if (opcoes[1] && /\bopcao\s*2\b|\bsegunda\s+opcao\b/.test(t)) return escolhe(opcoes[1]);

  // O dia vem antes do ordinal: "a segunda" é a segunda-feira quando uma das opções cai nela.
  const noDia = opcoes.filter((o) => new RegExp(`\\b${NOME_DO_DIA[componentesSP(new Date(o.iso)).diaSemana]}\\b`).test(t));
  if (noDia.length === 1) return escolhe(noDia[0]);

  if (/\bprimeir[oa]\b/.test(t)) return escolhe(opcoes[0]);
  if (opcoes[1] && /\bsegundo\b|\ba\s+segunda\b/.test(t)) return escolhe(opcoes[1]);

  if (citouOferta && /^(?:pode(?:\s+(?:ser|sim))?|sim,?\s+pode|funciona)[\s.!]*$/.test(t)) {
    return { tipo: "perguntar_horario", motivo: "aceitou sem dizer qual das opções" };
  }
  return null;
}

/** A oferta, agora com o número da tentativa. A segunda tenta de outro jeito, não repete a mesma. */
export function textoOfertaTentativa(cliente: string, opcoes: string[], tentativa: number): string {
  if (tentativa <= 1) return textoOferta(cliente, opcoes);
  // Repetir a mesma mensagem que já foi ignorada não muda o resultado. A segunda é mais curta,
  // reconhece a primeira e abre a porta para o cliente dizer o horário dele.
  return `Oi! 👋 Passando de novo sobre a reunião mensal da *${cliente}* — sei que a correria é grande.\n\n`
    + `É rapidinho, ${DURACAO_MIN} minutos online. Me diz um dia e horário que funcione pra você que eu já deixo marcado`
    + (opcoes.length ? `. Se ajudar, tenho ${opcoes[0]} livre.` : ".");
}

/** O agente levando o horário do cliente para o social decidir. */
export function textoPerguntaAoSocial(cliente: string, quandoExtenso: string, mencao: string): string {
  // "Responde NESTA mensagem": desde 21/10/2026 o agente só aceita a resposta que cita a pergunta.
  return `📅 ${mencao || ""} a *${cliente}* quer a reunião em *${quandoExtenso}*.\n\n`.trimStart()
    + `Responde *nesta mensagem*: *ok* — ou manda outro horário que eu levo pra ele.`;
}

/** O agente levando a contraproposta do social de volta ao cliente. */
export function textoContraproposta(quandoExtenso: string): string {
  return `Nesse horário ficou complicado aqui 🙈 Consegue em *${quandoExtenso}*?\n`
    + `Se não der, me diz outro que eu ajusto.`;
}

/** Esgotadas as tentativas: o agente sai do meio e entrega para a pessoa. */
export function textoPassarProSocial(cliente: string, motivo: string, mencao: string): string {
  return `🤝 ${mencao || ""} não consegui fechar a reunião da *${cliente}* (${motivo}).\n\n`.trimStart()
    + `Assume essa conversa? Quando vocês combinarem, é só me falar o dia e a hora aqui que eu marco na agenda.`;
}

/** Cobrança do social que não respondeu ao horário pedido pelo cliente. */
export function textoCobrarSocial(cliente: string, quandoExtenso: string, dias: number, mencao: string): string {
  return `⏳ ${mencao || ""} a *${cliente}* está esperando resposta há ${dias} dia${dias === 1 ? "" : "s"} `.trimStart()
    + `sobre a reunião em *${quandoExtenso}*.\n\nResponde *nesta mensagem*: *ok* que eu confirmo com ele, ou manda outro horário.`;
}

/** Lembretes NO GRUPO DO CLIENTE — o que faz a reunião acontecer, não só existir na agenda. */
export function textoLembreteCliente(
  quandoExtenso: string,
  tipo: "vespera" | "uma_hora",
  quanto: { faltamMin?: number; diaVespera?: string } = {},
): string {
  // A confirmação já termina com "Até lá! 👋". Repetir a mesma despedida no lembrete faz as duas
  // mensagens parecerem a mesma coisa reenviada — e mensagem que parece repetida é ignorada.
  return tipo === "vespera"
    ? `📅 Lembrete: ${quanto.diaVespera ?? "amanhã"} temos nossa reunião de acompanhamento — *${quandoExtenso}*.\n`
      + `Se precisar remarcar, é só falar aqui que eu ajusto.`
    : `⏰ Nossa reunião começa daqui a ${tempoQueFalta(quanto.faltamMin ?? 60)} (${quandoExtenso}). Te espero!`;
}

// ── O CLIENTE FALANDO DA REUNIÃO QUE JÁ EXISTE ───────────────────────────────

const NEGA_REUNIAO = "n[ãa]o\\s+(?:posso|consigo|vou\\s+conseguir|vou\\s+poder|vai\\s+dar|d[áa])";
const MUDA_REUNIAO = "remarcar|desmarcar|cancelar|adiar";
const A_REUNIAO = "(?:reuni[ãa]o|call|meet)";
const RX_PEDE_REMARCAR = new RegExp(
  `\\b(?:${NEGA_REUNIAO}|${MUDA_REUNIAO})\\b[^.!?\\n]{0,30}\\b${A_REUNIAO}\\b|\\b${A_REUNIAO}\\b[^.!?\\n]{0,30}\\b(?:${NEGA_REUNIAO}|${MUDA_REUNIAO})\\b`,
  "i",
);
const RX_ANTES_DEPOIS_DA_REUNIAO = new RegExp(`\\b(?:depois|antes)\\s+d[ao]\\s+(?:nossa\\s+)?${A_REUNIAO}\\b`, "i");

/**
 * O cliente está pedindo para mudar a reunião marcada?
 *
 * O lembrete promete "se precisar remarcar, é só falar aqui que eu ajusto" e a recusa não tinha
 * tratamento nenhum: o pedido caía na classificação geral, a reunião seguia marcada e, na hora,
 * saía "Te espero!" para quem já tinha dito que não ia.
 *
 * Aqui a régua é alta porque a saída tira a reunião dos lembretes: "não posso postar hoje, depois
 * da reunião te falo" não pede nada. "Vamos remarcar" sem dizer o quê só conta com reunião perto.
 */
export function pedeRemarcar(texto: string, faltamHoras: number): boolean {
  const t = (texto || "").trim();
  if (!t || RX_ANTES_DEPOIS_DA_REUNIAO.test(t)) return false;
  if (RX_PEDE_REMARCAR.test(t)) return true;
  return /\b(?:remarcar|desmarcar)\b/i.test(t) && faltamHoras <= 72;
}

/** O que o agente está esperando deste cliente, e a reunião que ele já tem. */
export interface ContextoDaConversa {
  /** A proposta na mesa: do agente ("terça às 15h?") ou a contraproposta do social. */
  pendente?: { id: string; horario_proposto: string; proposto_lado: string | null } | null;
  /** A proposta pendente ainda está na validade (`propostaValida`). */
  propostaVale: boolean;
  /** O agente perguntou o horário há pouco. */
  perguntou: boolean;
  /** A oferta aberta e as opções que ela trouxe. */
  oferta?: { id: string; opcoes: { iso: string }[] } | null;
  /** O cliente respondeu citando uma mensagem sobre a reunião. */
  citouReuniao: boolean;
}

/** O que a mensagem do cliente diz, dado o que o agente está esperando dele. */
export function lerMensagemDoCliente(texto: string, agora: Date, ctx: ContextoDaConversa): IntencaoReuniao {
  const escolheu = ctx.oferta ? lerRespostaOferta(texto, ctx.oferta.opcoes, ctx.citouReuniao) : null;
  if (escolheu) return escolheu;
  // A OFERTA TAMBÉM É PERGUNTA, mas fica aberta por dias: só vale a mensagem que é só a resposta.
  const respondeOferta = !!ctx.oferta && (ctx.citouReuniao || pareceRespostaDeHorario(texto));
  return lerIntencaoReuniao(
    texto, agora,
    ctx.propostaVale ? (ctx.pendente?.horario_proposto || undefined) : undefined,
    ctx.perguntou || respondeOferta,
  );
}

export type DecisaoDaConversa =
  /** Não é sobre reunião: a mensagem segue o fluxo normal. */
  | { tipo: "seguir" }
  /** O cliente aceitou a contraproposta do social: os dois lados disseram sim. */
  | { tipo: "fechar"; iso: string; reuniaoId: string }
  /** Citou o horário que já está marcado: confirma, não reabre. */
  | { tipo: "ja_marcada"; iso: string }
  /** Repetiu o horário que já levou ao social: a pergunta está feita. */
  | { tipo: "ja_proposta"; iso: string }
  /** Pediu para mudar: sai dos lembretes, o social fica sabendo e o cliente é perguntado. */
  | { tipo: "pedir_outro_horario"; reuniaoId: string; iso: string; responsavel: string | null }
  /** Deu o dia e o turno: o agente propõe a hora. */
  | { tipo: "propor"; iso: string; agendadaId: string | null; alvoId: string | null }
  /** Deu dia e hora: anota e pergunta ao social. */
  | { tipo: "levar_ao_social"; iso: string; agendadaId: string | null; alvoId: string | null }
  | { tipo: "perguntar"; motivo: string };

/**
 * A decisão, numa função só, sem banco e sem WhatsApp. A rota executa o que sai daqui.
 *
 * `ativa` é a próxima reunião do cliente que já tem horário (`reuniaoAtivaDoCliente`).
 */
export function decidirNaConversa(
  intencao: IntencaoReuniao,
  texto: string,
  agora: Date,
  ctx: ContextoDaConversa,
  ativa?: { id: string; estado: string; start_at: string; responsavel: string | null; horario_proposto: string | null; proposto_lado: string | null } | null,
): DecisaoDaConversa {
  if (intencao.tipo === "nenhuma") return { tipo: "seguir" };
  if (intencao.tipo === "perguntar_horario") return { tipo: "perguntar", motivo: intencao.motivo };

  const propostaNaMesa = ctx.propostaVale ? ctx.pendente : null;

  if (intencao.tipo === "recusa") {
    const emJogo = ativa
      ? { id: ativa.id, iso: ativa.start_at, responsavel: ativa.responsavel }
      : propostaNaMesa ? { id: propostaNaMesa.id, iso: propostaNaMesa.horario_proposto, responsavel: null } : null;
    if (!emJogo) return { tipo: "seguir" };
    const faltamHoras = (new Date(emJogo.iso).getTime() - agora.getTime()) / 3600_000;
    return propostaNaMesa || ctx.perguntou || pedeRemarcar(texto, faltamHoras)
      ? { tipo: "pedir_outro_horario", reuniaoId: emJogo.id, iso: emJogo.iso, responsavel: emJogo.responsavel }
      : { tipo: "seguir" };
  }

  const igual = (iso?: string | null) => !!iso && new Date(iso).getTime() === new Date(intencao.iso).getTime();

  // O CLIENTE ACEITOU A CONTRAPROPOSTA DO SOCIAL: perguntar de novo ao social o horário que ele
  // mesmo mandou seria a terceira volta do mesmo assunto.
  if (intencao.tipo === "agendar" && propostaNaMesa?.proposto_lado === "social" && igual(propostaNaMesa.horario_proposto)) {
    return { tipo: "fechar", iso: intencao.iso, reuniaoId: propostaNaMesa.id };
  }

  const agendada = ativa?.estado === "agendada" ? ativa : null;
  if (agendada) {
    // "Nossa reunião é amanhã às 10h, né?" não é proposta. Tratada como proposta, ela tirava a
    // reunião do estado `agendada`, os lembretes paravam e o social era perguntado de novo. Com o
    // turno ("amanhã de manhã") basta ser no mesmo dia: o agente diz a hora certa.
    const mesmoDia = componentesSP(new Date(agendada.start_at)).ymd === componentesSP(new Date(intencao.iso)).ymd;
    if (igual(agendada.start_at) || (intencao.tipo === "propor" && mesmoDia)) {
      return { tipo: "ja_marcada", iso: agendada.start_at };
    }
  } else if (ativa?.proposto_lado === "cliente" && igual(ativa.horario_proposto)) {
    return { tipo: "ja_proposta", iso: intencao.iso };
  }

  // Quem recebe o horário novo: a reunião que ele já tem, senão a linha que esta mensagem responde.
  const alvoId = ativa?.id ?? propostaNaMesa?.id ?? ctx.oferta?.id ?? null;
  return { tipo: intencao.tipo === "propor" ? "propor" : "levar_ao_social", iso: intencao.iso, agendadaId: agendada?.id ?? null, alvoId };
}

export function textoRemarcarCliente(): string {
  return `📅 Sem problema! Me diz o melhor dia e horário pra você que eu vejo com o time. 👍`;
}

export function textoRemarcarEquipe(cliente: string, quandoExtenso: string, trecho: string, mencao: string): string {
  return `🔁 ${mencao || ""} a *${cliente}* pediu pra mudar a reunião de *${quandoExtenso}*:\n“${trecho}”\n\n`.trimStart()
    + `Tirei essa reunião dos lembretes e já pedi outro horário no grupo. Quando a resposta vier, eu te chamo.`;
}

/** O cliente citou o horário que já está marcado: confirma, não reabre a negociação. */
export function textoReuniaoJaMarcada(quandoExtenso: string): string {
  return `📅 Nossa reunião já está marcada: *${quandoExtenso}*. Se precisar mudar, é só falar aqui.`;
}

// ── A RESPOSTA DO SOCIAL ─────────────────────────────────────────────────
//
// Roberto: "perguntar ao social mídia se pode ser ou se tem outro horário; se o social mídia pedir
// outro horário ele manda ao cliente e negocia."

// Sem `\b` no fim: emoji não é caractere de palavra, então "👍\b" nunca casa — o mesmo tipo de
// armadilha do `\b` com acento. A alternância separa as palavras (que precisam de fronteira) dos
// símbolos (que não têm).
const RX_ACEITE = /^\s*(?:(?:ok|okay|beleza|blz|pode ser|pode|confirmo|confirmado|fechado|isso|show|perfeito|t[áa] bom|tabom|sim)(?=\s|[,.!]|$)|👍|✅|👌)/i;

export type RespostaSocial =
  | { tipo: "aceita" }
  | { tipo: "contraproposta"; iso: string }
  | { tipo: "recusa" }
  | { tipo: "nenhuma" };

/**
 * Lê o que o social respondeu à pergunta sobre o horário.
 *
 * A ordem importa: um horário na mensagem vence o "ok" solto, porque "ok, mas pode ser 16h?" é
 * contraproposta, não aceite. Tratar como aceite marcaria a reunião no horário que a pessoa
 * acabou de recusar.
 */
export function lerRespostaSocial(texto: string, agora = new Date(), propostoIso?: string): RespostaSocial {
  const t = (texto || "").trim();
  if (!t) return { tipo: "nenhuma" };

  // Compara o INSTANTE. O proposto vem do banco em UTC ("13:00:00+00:00") e o lido vem em SP
  // ("10:00:00-03:00"): comparando o texto, "ok, 10h" para uma reunião às 10h virava contraproposta,
  // e o cliente recebia "nesse horário ficou complicado, consegue às 10:00?".
  const mesmoDoProposto = (iso: string) => !!propostoIso && new Date(iso).getTime() === new Date(propostoIso).getTime();

  const horario = lerHorario(t, agora);
  if (horario?.horaExplicita && horarioPlausivel(horario.iso, agora).ok && !mesmoDoProposto(horario.iso)) {
    return { tipo: "contraproposta", iso: horario.iso };
  }

  // HORA SEM DATA, no contexto de uma resposta, é "no mesmo dia, outro horário": ninguém responde
  // "pode ser 16h?" querendo dizer 16h de um dia qualquer. Sem este ramo, "ok, mas pode ser 16h?"
  // caía no aceite abaixo e a reunião ficava marcada no horário que a pessoa acabou de recusar.
  if (propostoIso) {
    const h = lerHora(t);
    if (h?.explicita) {
      const base = new Date(propostoIso);
      const p2 = (n: number) => String(n).padStart(2, "0");
      // Reconstrói no fuso de SP para não escorregar 3 horas.
      const dia = base.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const iso = `${dia}T${p2(h.hora)}:${p2(h.minuto)}:00-03:00`;
      if (!mesmoDoProposto(iso) && horarioPlausivel(iso, agora).ok) {
        return { tipo: "contraproposta", iso };
      }
    }
  }

  if (RX_ACEITE.test(t)) return { tipo: "aceita" };
  if (RX_RECUSA.test(t)) return { tipo: "recusa" };
  return { tipo: "nenhuma" };
}

/** Confirmação final, depois do aceite dos dois lados. */
export function textoFechado(cliente: string, quandoExtenso: string): string {
  return `📅 Fechado! Reunião de acompanhamento da *${cliente}* em *${quandoExtenso}* `
    + `(online, ${DURACAO_MIN} min).\nVou lembrar todo mundo na véspera e uma hora antes.`;
}

// ── O LINK DA CHAMADA ────────────────────────────────────────────────────
//
// O agente fecha a reunião dizendo "online" — e ninguém nunca pediu o link a lugar nenhum. O
// cliente ficava com "confirmado, online" e um endereço que não existe; na hora, alguém corria
// atrás no grupo. O lembrete da véspera até carrega o link, mas só se ele tiver sido gravado.
//
// Então quem fecha é quem cola: o agente pede no grupo da equipe e reconhece o link na resposta.

/** Reconhece um link de chamada colado no grupo. Só os serviços que a equipe usa. */
const RX_LINK_CHAMADA =
  /https?:\/\/(?:[\w-]+\.)*(?:meet\.google\.com|zoom\.us|teams\.(?:microsoft|live)\.com|whereby\.com|meet\.jit\.si)\/[^\s<>"']+/i;

export function acharLinkChamada(texto: string): string | null {
  const m = RX_LINK_CHAMADA.exec(texto ?? "");
  // Tira pontuação que costuma vir grudada no fim quando a pessoa escreve uma frase.
  return m ? m[0].replace(/[.,;:)\]]+$/, "") : null;
}

/** O pedido do link, junto do "fechado". Uma mensagem só: pedir depois vira outra notificação. */
export function textoPedeLink(mencao: string): string {
  return `\n🔗 ${mencao ? `${mencao} ` : ""}manda o link da chamada *respondendo esta mensagem* que eu levo pro cliente e ponho nos lembretes.`;
}

/** O aviso de que o link foi recebido e repassado. */
export function textoLinkRecebido(cliente: string): string {
  return `🔗 Link guardado e enviado pra *${cliente}*. Vai junto nos lembretes.`;
}

// ── A QUE MENSAGEM A RESPOSTA RESPONDE, E QUEM PODE RESPONDER ─────────────────
//
// 21/10/2026 (auditoria de erro recuperável, 5.1). Com UMA reunião esperando o social, qualquer
// "ok/sim/show/👍" no grupo interno a confirmava — de qualquer pessoa, sobre qualquer assunto — e o
// cliente recebia "📅 Confirmado!". Um "ok" para aprovar card marcava a reunião. E qualquer link de
// Meet colado ia para o cliente da única reunião sem link. Agora só vale a resposta que CITA a
// mensagem do agente (pelo id dela, ou pelo texto citado, que o webhook também entrega), e só do
// responsável pelo cliente ou da gestão.

const normCitacao = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * O texto citado é a pergunta do agente sobre o horário da reunião DESTE cliente? Serve para as
 * quatro mensagens que esperam a resposta do social: a pergunta, a cobrança do cron, a revalidação
 * de proposta vencida e o aviso de conflito. Todas trazem o cliente entre asteriscos.
 */
export function citaPerguntaDaReuniao(citado: string | null | undefined, cliente: string): boolean {
  const q = normCitacao(citado), c = normCitacao(cliente);
  if (!q || !c || !q.includes(`*${c}*`)) return false;
  if (!/reuniao|horario/.test(q)) return false;
  return /\bresponde\b.{0,30}\bok\b|\bmanda outro horario\b/.test(q);
}

/** O texto citado é o pedido do link da chamada (a mensagem "📅 Fechado!") DESTE cliente? */
export function citaPedidoDeLink(citado: string | null | undefined, cliente: string): boolean {
  const q = normCitacao(citado), c = normCitacao(cliente);
  return !!q && !!c && q.includes(`*${c}*`) && q.includes("manda o link da chamada");
}

export type Citada<T> = { tipo: "uma"; item: T } | { tipo: "varias"; itens: T[] } | { tipo: "nenhuma" };

/**
 * Qual item (reunião) a mensagem cita: pelo id da mensagem do agente primeiro; senão pelo texto
 * citado. Mais de um casando pelo texto → "varias" (o chamador pergunta em vez de escolher).
 */
export function acharCitada<T extends { cliente: string; msgId?: string | null }>(
  itens: T[],
  citadaId: string | null | undefined,
  citadoTexto: string | null | undefined,
  casaTexto: (citado: string | null | undefined, cliente: string) => boolean,
): Citada<T> {
  if (citadaId) {
    const porId = itens.filter((r) => !!r.msgId && r.msgId === citadaId);
    if (porId.length === 1) return { tipo: "uma", item: porId[0] };
  }
  const porTexto = itens.filter((r) => casaTexto(citadoTexto, r.cliente));
  if (porTexto.length === 1) return { tipo: "uma", item: porTexto[0] };
  if (porTexto.length > 1) return { tipo: "varias", itens: porTexto };
  return { tipo: "nenhuma" };
}

/**
 * Quem pode confirmar (ou mudar) o horário: o responsável pelo cliente — é a agenda dele — ou a
 * gestão. Sem responsável cadastrado, qualquer pessoa do operacional. Cliente, comercial e número
 * fora do time nunca.
 */
export function podeResponderPelaReuniao(
  autor: { nome: string; papel: string } | null | undefined,
  responsavel: string | null | undefined,
): boolean {
  if (!autor) return false;
  if (autor.papel === "admin" || autor.papel === "manager") return true;
  if (!["social", "traffic", "designer"].includes(autor.papel)) return false;
  const r = normCitacao(responsavel);
  if (!r) return true;
  const a = normCitacao(autor.nome);
  return a === r || a.split(" ")[0] === r.split(" ")[0];
}

/** Respondeu a pergunta da reunião sem ser o responsável. */
export function textoSemAutoridadeReuniao(cliente: string, responsavel: string | null | undefined): string {
  return `Quem confirma o horário da *${cliente}* é ${responsavel ? `*${responsavel}*` : "quem cuida do cliente"} (ou a gestão) — é a agenda dessa pessoa. `
    + `Pede pra responder aqui, na minha mensagem. Não mandei nada pro cliente.`;
}

/** Citou a pergunta, mas não deu pra entender se é sim ou outro horário. */
export function textoRespostaReuniaoNaoEntendida(cliente: string): string {
  return `Não entendi 🤔 Pra reunião da *${cliente}*: responde *ok* pra confirmar ou manda outro horário (ex.: *sexta 15h*). Não mandei nada pro cliente.`;
}

/** Recusou o horário sem dizer outro. */
export function textoRecusaSemHorario(cliente: string): string {
  return `Beleza, esse horário não dá. Me manda outro dia e hora pra *${cliente}* (ex.: *quinta 10h*) que eu levo pra ele.`;
}

/** Link colado sem citar o pedido: não adivinha de qual reunião é. */
export function textoLinkSemCitacao(clientes: string[]): string {
  const lista = clientes.length ? ` Tenho sem link: ${clientes.map((n) => `*${n}*`).join(", ")}.` : "";
  return `🔗 Vi um link de chamada. Se é de reunião com cliente, responde *na minha mensagem que pediu o link* (a do 📅 Fechado!) que eu sei de qual cliente é.${lista}`;
}
