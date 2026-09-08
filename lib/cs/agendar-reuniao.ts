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

import { lerHorario, lerHora, horarioPlausivel, porExtenso } from "./parse-horario";

/** Fala sobre a reunião de acompanhamento — não sobre uma data qualquer. */
const RX_REUNIAO = /\b(reuni[ãa]o|reuniao|call|meet|alinhamento|conversar|bate[- ]?papo|videochamada|v[ií]deo\s*chamada)\b/i;

/** Verbos que indicam MARCAR, não relatar. "tivemos uma reunião" não agenda nada. */
const RX_MARCAR = /\b(marcar?|marca|agendar?|agenda|combinar?|combina|pode ser|podemos|consigo|dispon[íi]vel|que tal|topo|fechado|confirmo|confirmado)\b/i;

/** Passado: "a reunião foi ótima", "na reunião de ontem" — não é agendamento. */
const RX_PASSADO = /\b(foi|teve|tivemos|aconteceu|ontem|semana passada|m[êe]s passado|na [úu]ltima)\b/i;

/** Recusa/adiamento: precisa de tratamento diferente de uma proposta. */
const RX_RECUSA = /\b(n[ãa]o (posso|consigo|d[áa]|vai dar|rola)|imposs[íi]vel|remarcar|adiar|outro dia|outra hora|desmarcar|cancelar)\b/i;

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
  /^\s*(?:isso|isso a[ií]|exato|exatamente|perfeito|pode confirmar|confirma|confirmado|pode marcar|pode agendar|fechado|fechou|combinado|beleza|blz|ok|okay|show|boa|t[áa] [óo]timo|t[áa] bom|por mim (?:ok|beleza|t[áa] bom)|sim)(?=[\s,.!…]|$)/i;

export function lerIntencaoReuniao(texto: string, agora = new Date(), propostoIso?: string): IntencaoReuniao {
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

  const falaDeReuniao = RX_REUNIAO.test(t);
  const querMarcar = RX_MARCAR.test(t);

  // Relato do que já aconteceu não agenda nada.
  if (falaDeReuniao && RX_PASSADO.test(t) && !querMarcar) return { tipo: "nenhuma" };

  const horario = lerHorario(t, agora);

  // Recusa SEM contraproposta: quem disse que não pode e não ofereceu alternativa.
  if (RX_RECUSA.test(t) && !horario) return falaDeReuniao || querMarcar ? { tipo: "recusa" } : { tipo: "nenhuma" };

  // Sem contexto de reunião, uma data solta é outra coisa — "a promoção começa dia 18" não é
  // convite para reunião. Exige que a conversa seja sobre reunião OU que o verbo seja de marcar.
  if (!falaDeReuniao && !querMarcar) return { tipo: "nenhuma" };

  if (!horario) {
    // Falou de marcar reunião mas não disse quando: é o momento de perguntar, não de adivinhar.
    return falaDeReuniao && querMarcar
      ? { tipo: "perguntar_horario", motivo: "sem data ou hora na mensagem" }
      : { tipo: "nenhuma" };
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
  const limite = ateIso ? new Date(`${ateIso}T23:59:59-03:00`) : null;
  const horas = [10, 15];

  const varrer = (respeitarLimite: boolean) => {
    const d = new Date(agora);
    d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 21 && out.length < quantos; i++) {
      d.setDate(d.getDate() + 1);
      const semana = d.getDay();
      if (semana === 0 || semana === 6) continue;          // reunião é em dia útil
      if (respeitarLimite && limite && d > limite) break;   // não passa da janela nesta passada
      const alvo = new Date(d);
      alvo.setHours(horas[out.length % horas.length], 0, 0, 0);
      const iso = alvo.toISOString();
      if (out.some((o) => o.iso === iso)) continue;
      out.push({ iso, texto: porExtenso(iso) });
    }
  };

  varrer(true);
  // Janela apertada demais para caber as opções: sai dela, mas só depois de tentar caber dentro.
  if (out.length < quantos) varrer(false);
  return out;
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
  return `📅 ${mencao || ""} a *${cliente}* quer a reunião em *${quandoExtenso}*.\n\n`.trimStart()
    + `Responde aqui: *ok* — ou manda outro horário que eu levo pra ele.`;
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
    + `sobre a reunião em *${quandoExtenso}*.\n\nResponde *ok* que eu confirmo com ele, ou manda outro horário.`;
}

/** Lembretes NO GRUPO DO CLIENTE — o que faz a reunião acontecer, não só existir na agenda. */
export function textoLembreteCliente(quandoExtenso: string, tipo: "vespera" | "uma_hora"): string {
  // A confirmação já termina com "Até lá! 👋". Repetir a mesma despedida no lembrete faz as duas
  // mensagens parecerem a mesma coisa reenviada — e mensagem que parece repetida é ignorada.
  return tipo === "vespera"
    ? `📅 Lembrete: amanhã temos nossa reunião de acompanhamento — *${quandoExtenso}*.\n`
      + `Se precisar remarcar, é só falar aqui que eu ajusto.`
    : `⏰ Nossa reunião começa daqui a uma hora (${quandoExtenso}). Te espero!`;
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

  const horario = lerHorario(t, agora);
  if (horario?.horaExplicita && horarioPlausivel(horario.iso, agora).ok) {
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
      if (iso !== propostoIso && horarioPlausivel(iso, agora).ok) {
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
  return `\n🔗 ${mencao ? `${mencao} ` : ""}manda o link da chamada aqui que eu levo pro cliente e ponho nos lembretes.`;
}

/** O aviso de que o link foi recebido e repassado. */
export function textoLinkRecebido(cliente: string): string {
  return `🔗 Link guardado e enviado pra *${cliente}*. Vai junto nos lembretes.`;
}
