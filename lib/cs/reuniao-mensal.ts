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

export type EstadoReuniao = "pendente" | "proposta" | "agendada" | "realizada" | "cancelada";

export const DIA_ABRE = 15;
export const DIA_FECHA = 22;

export interface JanelaCiclo {
  /** "2026-09" — o mês de referência do ciclo. */
  mes: string;
  abre: string;   // YYYY-MM-DD
  fecha: string;
  /** true entre os dias 15 e 22, inclusive. */
  aberta: boolean;
  /** Dias que faltam para fechar. Negativo = já fechou. */
  diasParaFechar: number;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** A janela do mês corrente, em horário de São Paulo. */
export function janelaDoMes(agora: Date): JanelaCiclo {
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;
  const dia = agora.getDate();
  return {
    mes: `${ano}-${p2(mes)}`,
    abre: `${ano}-${p2(mes)}-${p2(DIA_ABRE)}`,
    fecha: `${ano}-${p2(mes)}-${p2(DIA_FECHA)}`,
    aberta: dia >= DIA_ABRE && dia <= DIA_FECHA,
    diasParaFechar: DIA_FECHA - dia,
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
