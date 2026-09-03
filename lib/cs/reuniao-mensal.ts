// O CICLO MENSAL DE REUNIÕES — quem já marcou, quem falta, e quando cobrar.
//
// PRA QUE (Roberto, 02/09): "meu time vai fazer reuniões mensais com os clientes. Todo dia quinze
// até o dia vinte e dois, eles têm que marcar a reunião com os clientes… a IA tem que lembrar ele
// de marcar essa reunião, ou já pode oferecer pra marcar. E aí o cliente marcando, ela já coloca
// na agenda desse social media, e lembra ele um dia antes, o horário antes."
//
// DECISÃO DE DESENHO: sem Google Calendar. Ele foi explícito ("não precisa nem colocar a API do
// Google"), e a decisão se sustenta sozinha — o compromisso já vive no banco, o lembrete já sai
// pelo WhatsApp que o time lê o dia inteiro, e uma integração OAuth a mais seria mais uma coisa
// para expirar sem avisar (como o token da Meta já faz).
//
// O CICLO, em quatro estados:
//   1. PENDENTE      — o mês virou e ninguém marcou nada com este cliente.
//   2. PROPOSTA      — alguém (time ou agente) sugeriu um horário; falta o cliente confirmar.
//   3. AGENDADA      — há data e hora combinadas. Entra na agenda e gera lembretes.
//   4. REALIZADA     — aconteceu. O resumo alimenta a ficha do cliente (lib/cs/reuniao.ts).
//
// A janela de agendamento (15 a 22) é sobre MARCAR, não sobre reunir: a reunião pode acontecer
// depois do dia 22. Confundir as duas coisas faria o sistema cobrar quem já marcou para o dia 25.

// Os estados. `ofertada` e `aguardando_social` existem por causa da negociação em três vias que o
// Roberto desenhou: nada entra na agenda de alguém sem essa pessoa ter dito sim.
export type EstadoReuniao =
  | "pendente"            // o mês virou e ninguém marcou nada
  | "ofertada"            // o agente ofereceu horários ao cliente e espera resposta
  | "proposta"            // o cliente disse um horário
  | "aguardando_social"   // falta o responsável dizer se pode
  | "agendada"            // os dois aceitaram
  | "realizada"
  | "cancelada";

export const DIA_ABRE = 15;
export const DIA_FECHA = 22;

/** Máximo de ofertas do agente ao cliente. Roberto: "ele pode tentar marcar duas vezes. Se ele
 *  não conseguir, ele vai lá no grupo equipe e solicita pro social media negociar." */
export const MAX_TENTATIVAS = 2;

/** Dias corridos que o cliente tem para responder a uma oferta antes da próxima tentativa. */
export const ESPERA_CLIENTE_DIAS = 2;

/** Dias ÚTEIS que o social tem para confirmar um horário proposto pelo cliente. */
export const ESPERA_SOCIAL_DIAS_UTEIS = 1;

/** Hora (em SP) em que a oferta do dia sai. Roberto: "pode mandar todo dia oito horas da manhã". */
export const HORA_OFERTA = 8;

const ehFimDeSemana = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/**
 * O primeiro dia ÚTIL a partir de uma data (inclusive).
 *
 * Roberto: "ele tem que verificar se o dia quinze é um domingo, é um sábado; se for, então ele
 * manda no dia dezoito" — ou seja, a janela abre no dia 15 do calendário, mas a primeira ação
 * acontece no primeiro dia de trabalho. Mandar oferta de reunião no sábado não é só inútil: some
 * no fim de semana e o cliente vê na segunda junto de tudo o mais.
 */
export function primeiroDiaUtil(d: Date): Date {
  const out = new Date(d);
  while (ehFimDeSemana(out)) out.setDate(out.getDate() + 1);
  return out;
}

export interface JanelaCiclo {
  /** "2026-09" — o mês de referência do ciclo. */
  mes: string;
  abre: string;   // YYYY-MM-DD — sempre um dia útil
  fecha: string;  // YYYY-MM-DD — sempre um dia útil
  /** true entre a abertura e o fechamento, e só em dia útil. */
  aberta: boolean;
  /** Dias que faltam para fechar. Negativo = já fechou. */
  diasParaFechar: number;
  /** Por que a abertura mudou, quando mudou — para a mensagem poder explicar. */
  ajuste?: string;
}

const p2 = (n: number) => String(n).padStart(2, "0");

const ymdLocal = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/**
 * A janela do mês corrente, ajustada para dias úteis.
 *
 * Abre no dia 15 — ou no primeiro dia útil seguinte, se o 15 cair no fim de semana. Fecha no dia
 * 22 — ou no último dia útil ANTES dele, pelo mesmo motivo ao contrário: um prazo que termina no
 * sábado termina, na prática, na sexta.
 */
export function janelaDoMes(agora: Date): JanelaCiclo {
  const ano = agora.getFullYear();
  const mes = agora.getMonth();

  const abreBruto = new Date(ano, mes, DIA_ABRE);
  const abre = primeiroDiaUtil(abreBruto);

  // O fechamento anda para TRÁS: prazo que cai no sábado vence na sexta.
  const fecha = new Date(ano, mes, DIA_FECHA);
  while (ehFimDeSemana(fecha)) fecha.setDate(fecha.getDate() - 1);

  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dentro = hoje >= new Date(abre.getFullYear(), abre.getMonth(), abre.getDate())
    && hoje <= new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

  const ajuste = abreBruto.getDate() !== abre.getDate()
    ? `dia ${DIA_ABRE} caiu ${abreBruto.getDay() === 6 ? "sábado" : "domingo"}, começou dia ${abre.getDate()}`
    : undefined;

  return {
    mes: `${ano}-${p2(mes + 1)}`,
    abre: ymdLocal(abre),
    fecha: ymdLocal(fecha),
    // Fim de semana no meio da janela não é dia de trabalho: o agente fica quieto.
    aberta: dentro && !ehFimDeSemana(agora),
    diasParaFechar: Math.round((fecha.getTime() - hoje.getTime()) / 86400000),
    ajuste,
  };
}

export interface ClienteCiclo {
  clientId: string;
  cliente: string;
  responsavel: string | null;
  estado: EstadoReuniao;
  /** Quando está agendada. */
  quando: string | null;
  /** Quando alguém propôs mas o cliente não confirmou. */
  propostoEm: string | null;
  /** Quantas vezes o agente já ofereceu horário a este cliente neste ciclo. */
  tentativas?: number;
  /** Quando a última oferta saiu — conta o prazo de resposta do cliente. */
  ofertadoEm?: string | null;
  /** Quando o horário do cliente foi levado ao social — conta o prazo dele. */
  perguntadoAoSocialEm?: string | null;
}

// ── O QUE FAZER COM CADA CLIENTE, AGORA ──────────────────────────────────

export type Acao =
  | { tipo: "ofertar"; tentativa: number }
  | { tipo: "reofertar"; tentativa: number; diasEsperando: number }
  | { tipo: "passar_pro_social"; motivo: string }
  | { tipo: "cobrar_social"; diasEsperando: number }
  | { tipo: "nada" };

/** Dias ÚTEIS entre duas datas. Fim de semana não conta contra ninguém. */
export function diasUteisEntre(de: Date, ate: Date): number {
  let n = 0;
  const d = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  const fim = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  while (d < fim) {
    d.setDate(d.getDate() + 1);
    if (!ehFimDeSemana(d)) n++;
  }
  return n;
}

/**
 * A decisão, cliente a cliente.
 *
 * Regras que o Roberto definiu:
 *   • o agente oferece no máximo DUAS vezes;
 *   • esgotadas as tentativas, ele "vai lá no grupo equipe e solicita pro social media negociar";
 *   • o cliente tem 2 dias corridos para responder a uma oferta;
 *   • o social tem 1 dia útil para confirmar o horário que o cliente pediu.
 *
 * Só devolve ação em dia útil e dentro da janela — fora disso, o agente não fala com cliente.
 */
export function decidirAcao(c: ClienteCiclo, janela: JanelaCiclo, agora: Date): Acao {
  if (!janela.aberta) return { tipo: "nada" };

  const tentativas = c.tentativas ?? 0;

  switch (c.estado) {
    case "pendente":
      return { tipo: "ofertar", tentativa: 1 };

    case "ofertada": {
      if (!c.ofertadoEm) return { tipo: "nada" };
      const dias = Math.floor((agora.getTime() - new Date(c.ofertadoEm).getTime()) / 86400000);
      if (dias < ESPERA_CLIENTE_DIAS) return { tipo: "nada" };
      // Silêncio depois de duas ofertas não é problema de mensagem — é conversa que precisa de
      // gente. O agente sai do meio em vez de insistir numa terceira.
      if (tentativas >= MAX_TENTATIVAS) {
        return { tipo: "passar_pro_social", motivo: `${tentativas} ofertas sem resposta em ${dias} dias` };
      }
      return { tipo: "reofertar", tentativa: tentativas + 1, diasEsperando: dias };
    }

    case "proposta":
    case "aguardando_social": {
      // O cliente já disse um horário; falta o social confirmar. Aqui a espera é em dias ÚTEIS:
      // cobrar segunda por algo pedido na sexta seria contar o fim de semana contra a pessoa.
      const desde = c.perguntadoAoSocialEm ?? c.propostoEm;
      if (!desde) return { tipo: "nada" };
      const uteis = diasUteisEntre(new Date(desde), agora);
      return uteis >= ESPERA_SOCIAL_DIAS_UTEIS
        ? { tipo: "cobrar_social", diasEsperando: uteis }
        : { tipo: "nada" };
    }

    default:
      return { tipo: "nada" };   // agendada, realizada, cancelada
  }
}

export interface CobrancaCiclo {
  /** A quem cobrar. */
  pessoa: string;
  pendentes: string[];
  propostasSemResposta: { cliente: string; diasEsperando: number }[];
  agendadas: number;
  /** Sobe conforme a janela se aproxima do fim: 1 lembrete, 2 cobrança, 3 último dia. */
  intensidade: 1 | 2 | 3;
}

/**
 * O que cobrar de cada pessoa, e com que força.
 *
 * A intensidade sobe com a proximidade do dia 22 — não com o número de pendências. Cobrar forte no
 * dia 15 ensina o time a ignorar; cobrar fraco no dia 22 deixa o mês passar.
 */
export function montarCobranca(clientes: ClienteCiclo[], janela: JanelaCiclo, agora: Date): CobrancaCiclo[] {
  const intensidade: 1 | 2 | 3 = janela.diasParaFechar <= 0 ? 3 : janela.diasParaFechar <= 2 ? 2 : 1;

  const porPessoa = new Map<string, ClienteCiclo[]>();
  for (const c of clientes) {
    const k = c.responsavel?.trim() || "sem responsável";
    (porPessoa.get(k) ?? porPessoa.set(k, []).get(k)!).push(c);
  }

  const out: CobrancaCiclo[] = [];
  for (const [pessoa, cs] of porPessoa) {
    const pendentes = cs.filter((c) => c.estado === "pendente").map((c) => c.cliente);
    const propostas = cs.filter((c) => c.estado === "proposta" && c.propostoEm)
      .map((c) => ({
        cliente: c.cliente,
        diasEsperando: Math.floor((agora.getTime() - new Date(c.propostoEm as string).getTime()) / 86400000),
      }))
      // Proposta feita hoje não é cobrança — o cliente merece um dia para responder.
      .filter((x) => x.diasEsperando >= 1)
      .sort((a, b) => b.diasEsperando - a.diasEsperando);

    if (!pendentes.length && !propostas.length) continue;
    out.push({
      pessoa, pendentes, propostasSemResposta: propostas,
      agendadas: cs.filter((c) => c.estado === "agendada").length,
      intensidade,
    });
  }
  return out.sort((a, b) => b.pendentes.length - a.pendentes.length);
}

/** O texto da cobrança no grupo interno. Muda de tom com a intensidade. */
export function textoCobranca(c: CobrancaCiclo, janela: JanelaCiclo, mencao: string): string {
  const quem = mencao || c.pessoa;
  const l: string[] = [];

  const abertura = c.intensidade === 3
    ? `⏰ ${quem}, hoje é o último dia da janela de agendamento (${janela.fecha.slice(8, 10)}/${janela.fecha.slice(5, 7)}).`
    : c.intensidade === 2
      ? `📅 ${quem}, faltam ${janela.diasParaFechar} dia${janela.diasParaFechar === 1 ? "" : "s"} para fechar a janela das reuniões do mês.`
      : `📅 ${quem}, abriu a janela de marcar as reuniões do mês.`;
  l.push(abertura, "");

  if (c.pendentes.length) {
    l.push(`*${c.pendentes.length} sem reunião marcada:*`);
    l.push(c.pendentes.slice(0, 12).map((x) => `• ${x}`).join("\n"));
    if (c.pendentes.length > 12) l.push(`_…e mais ${c.pendentes.length - 12}_`);
    l.push("");
  }

  if (c.propostasSemResposta.length) {
    l.push(`*Esperando o cliente responder:*`);
    l.push(c.propostasSemResposta.slice(0, 6)
      .map((x) => `• ${x.cliente} — proposto há ${x.diasEsperando} dia${x.diasEsperando === 1 ? "" : "s"}`).join("\n"));
    l.push("");
  }

  if (c.agendadas) l.push(`✅ ${c.agendadas} já marcada${c.agendadas === 1 ? "" : "s"}.`);
  l.push("", `_Me chama que eu ofereço horário pro cliente: “Lone, marca a reunião do [cliente]”._`);
  return l.join("\n").trim();
}

// ── LEMBRETES ────────────────────────────────────────────────────────────
//
// "lembra ele um dia antes, o horário antes tal, de fazer essa reunião."

export type TipoLembrete = "vespera" | "uma_hora";

export interface Lembrete {
  tipo: TipoLembrete;
  clientId: string;
  cliente: string;
  responsavel: string | null;
  quando: string;
}

/**
 * Quais reuniões merecem lembrete AGORA.
 *
 * As janelas são estreitas de propósito e o cron roda de hora em hora: um "um dia antes" disparado
 * com 30h de antecedência não é lembrete, é ruído; e disparado com 2h já perdeu a função de dar
 * tempo de se preparar.
 */
export function lembretesDevidos(
  reunioes: { clientId: string; cliente: string; responsavel: string | null; quando: string; lembrouVespera: boolean; lembrouUmaHora: boolean }[],
  agora: Date,
): Lembrete[] {
  const out: Lembrete[] = [];
  for (const r of reunioes) {
    const t = new Date(r.quando).getTime();
    const faltamMin = (t - agora.getTime()) / 60000;
    const base = { clientId: r.clientId, cliente: r.cliente, responsavel: r.responsavel, quando: r.quando };

    // Véspera: entre 20h e 28h antes — pega a rodada do dia anterior no mesmo horário.
    if (!r.lembrouVespera && faltamMin >= 20 * 60 && faltamMin <= 28 * 60) {
      out.push({ ...base, tipo: "vespera" });
    }
    // Uma hora antes: entre 45 e 90 minutos.
    if (!r.lembrouUmaHora && faltamMin >= 45 && faltamMin <= 90) {
      out.push({ ...base, tipo: "uma_hora" });
    }
  }
  return out;
}

export function textoLembrete(l: Lembrete, quandoExtenso: string, mencao: string): string {
  const quem = mencao || l.responsavel || "";
  return l.tipo === "vespera"
    ? `📅 ${quem} amanhã tem reunião com *${l.cliente}* — ${quandoExtenso}.\n_Quer que eu prepare o briefing? Manda “Lone, prepara a reunião do ${l.cliente}”._`
    : `⏰ ${quem} reunião com *${l.cliente}* em uma hora (${quandoExtenso}).`;
}
