// lib/cs/nps.ts — NPS DE VERDADE DEPOIS DA REUNIÃO (Leva 6B, E6). Módulo PURO: textos, leitura da
// resposta, quem recebe a pergunta e quanto a nota pesa na saúde. O banco fica em lib/cs/nps-server.ts.
//
// POR QUE EXISTE. A ficha tinha um "NPS" que era estrela dada pelo PRÓPRIO time (components/sector/
// ClientNPS, tabela client_nps) — a tabela ficou meses com zero linhas por RLS, e nenhuma nota ali
// era do cliente. NPS é a pergunta ao cliente: "de 0 a 10, o quanto você recomendaria?". A hora
// certa de perguntar é logo depois da reunião mensal, quando ele acabou de ver o trabalho.
//
// O FLUXO:
//   1. Reunião marcada como realizada (qualquer tela: ficha, agenda, transcrição) — `meetings.estado`
//      = realizada, com `realizada_em`.
//   2. O job cs-nps (Central de Automações, NASCE DESLIGADO) acha as reuniões realizadas nas últimas
//      72h e manda UMA pergunta no grupo do cliente.
//   3. O inbound (app/api/cs/inbound) lê a resposta — só quando há pergunta pendente PARA AQUELE
//      GRUPO e a resposta é um número de 0 a 10.
//   4. Nota até 8 → uma única pergunta de volta: "o que faria virar 10?". Nota 9 ou 10 → nada mais.
//   5. A última nota (até 120 dias) entra na saúde (/api/scores) como o componente "Satisfação".

export const JOB_NPS = "cs-nps";

/** Aceita a nota até 72h depois da pergunta — fim de semana no meio incluso. */
export const JANELA_RESPOSTA_H = 72;
/** Aceita o "o que faria virar 10" até 48h depois do follow-up. */
export const JANELA_MOTIVO_H = 48;
/** Só pergunta sobre reunião realizada nas últimas 72h: ligar o job não dispara NPS de reunião velha. */
export const JANELA_REUNIAO_H = 72;
/** Espera meia hora depois de marcada como realizada — "concluir" às vezes é clicado com a reunião ainda rolando. */
export const ESPERA_POS_REUNIAO_MIN = 30;
/** No máximo uma pergunta por cliente a cada 25 dias (duas reuniões no mês = uma pergunta). */
export const INTERVALO_MINIMO_DIAS = 25;
/** Nota até aqui recebe o follow-up. */
export const LIMITE_FOLLOWUP = 8;
/** Nota mais velha que isto não conta na saúde. */
export const VALIDADE_NO_SCORE_DIAS = 120;

const H = 3600_000;
const DIA = 86_400_000;

// ─── Textos ──────────────────────────────────────────────────────────────────

/** Primeiro nome do contato, para a pergunta não sair impessoal. Sem contato: "pessoal". */
export function primeiroNome(contato: string | null | undefined): string {
  const p = (contato ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p || p.length < 2 || /\d/.test(p)) return "pessoal";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** A pergunta, exatamente como vai para o grupo do cliente. */
export function textoPergunta(contato?: string | null): string {
  return `Oi, ${primeiroNome(contato)}! Obrigado pelo tempo na nossa reunião. `
    + "Uma pergunta rápida, pra gente seguir melhorando: de 0 a 10, o quanto você recomendaria a Lone Mídia "
    + "pra um amigo ou colega? Pode responder só com o número.";
}

/** A única pergunta de volta, só para nota até 8. */
export const TEXTO_FOLLOWUP = "Obrigado pela sinceridade! E o que faria essa nota virar 10?";

export function precisaFollowUp(nota: number): boolean {
  return nota <= LIMITE_FOLLOWUP;
}

export type CategoriaNps = "promotor" | "neutro" | "detrator";

/** A régua clássica do NPS: 9–10 promotor, 7–8 neutro, 0–6 detrator. */
export function categoriaNps(nota: number): CategoriaNps {
  if (nota >= 9) return "promotor";
  if (nota >= 7) return "neutro";
  return "detrator";
}

export const ROTULO_CATEGORIA: Record<CategoriaNps, string> = {
  promotor: "Promotor",
  neutro: "Neutro",
  detrator: "Detrator",
};

// ─── Leitura da resposta ─────────────────────────────────────────────────────

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "um"/"uma" ficam de fora de propósito: "um minuto", "uma dúvida" virariam nota 1.
const PALAVRAS: Record<string, number> = {
  zero: 0, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

// Número seguido disto é quantidade, hora ou dinheiro — não nota.
const UNIDADE = "(?:h|hs|hr|hrs|horas?|min|minutos?|dias?|semanas?|mes|meses|anos?|posts?|artes?|reais|mil|pessoas|leads?|vendas?|clientes?|contatos?|x|%)";
const RE_NUM_UNIDADE = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*${UNIDADE}\\b|\\d\\s*%`);
const RE_PALAVRA_UNIDADE = new RegExp(`\\b(?:${Object.keys(PALAVRAS).join("|")})\\s+${UNIDADE}\\b`);
// "às 10", "dia 9", "até 8", "R$ 10" — contexto de hora, data ou valor.
const RE_CONTEXTO = /\b(?:as|dia|ate|desde|umas?|uns|r\$)\s*\d|r\$|\d{1,2}:\d{2}/;

/**
 * A nota de 0 a 10 que a mensagem responde, ou null quando não dá para ter certeza.
 *
 * Aceita "9", "nota 10!", "10/10", "8 de 10", "9,5" (vira 9 — arredonda para baixo, não infla),
 * "dez", "nota nove". Recusa o que é ambíguo ("8 ou 9"), fora da escala ("100"), e número que é
 * hora, data, quantidade ou dinheiro ("às 10", "10/09", "5 posts", "R$ 10"). Mensagem longa não é
 * resposta de nota. Na dúvida, null: a mensagem segue o fluxo normal e a pergunta continua aberta.
 */
export function lerNota(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const t = sem(texto).trim();
  if (!t || t.length > 80) return null;
  if (RE_NUM_UNIDADE.test(t) || RE_CONTEXTO.test(t)) return null;

  // "10/10", "9 de 10" — antes do filtro de data: aqui a barra não é dia/mês.
  const fracao = t.match(/(\d{1,2}(?:[.,]\d)?)\s*(?:\/|de)\s*10\b/);
  if (fracao) {
    const n = Number(fracao[1].replace(",", "."));
    const resto = t.replace(fracao[0], " ");
    if (Number.isFinite(n) && n >= 0 && n <= 10 && !/\d/.test(resto)) return Math.floor(n);
    return null;
  }
  if (/\d{1,2}\/\d{1,2}/.test(t)) return null;

  const numeros = t.match(/\d+(?:[.,]\d+)?/g);
  if (numeros) {
    const valores = [...new Set(numeros.map((x) => Number(x.replace(",", "."))))];
    if (valores.length !== 1) return null;
    const n = valores[0];
    if (!Number.isFinite(n) || n < 0 || n > 10) return null;
    return Math.floor(n);
  }

  // Por extenso, só em mensagem curta ("dez!", "nota nove").
  const palavras = t.split(/[^a-z]+/).filter(Boolean);
  if (palavras.length > 6 || RE_PALAVRA_UNIDADE.test(t)) return null;
  const achados = [...new Set(palavras.filter((p) => p in PALAVRAS).map((p) => PALAVRAS[p]))];
  return achados.length === 1 ? achados[0] : null;
}

/**
 * A mensagem é SÓ a nota (com no máximo um comentário curto)? Então o inbound para aqui. Se tem
 * mais ("10, e faz um post pra sexta"), a nota é gravada e a mensagem segue o fluxo normal — o
 * pedido não pode morrer engolido pela pesquisa.
 */
export function ehSoANota(texto: string): boolean {
  const palavras = sem(texto).replace(/\d+(?:[.,]\d+)?(?:\s*(?:\/|de)\s*10)?/g, " ").split(/[^a-z]+/).filter(Boolean);
  return palavras.length <= 4;
}

// ─── Quem recebe a pergunta ──────────────────────────────────────────────────

export interface ReuniaoParaNps {
  id: string;
  clientId: string | null;
  estado: string | null;
  realizadaEm: string | null;
  tipo: string | null;
  deletedAt?: string | null;
}

export interface ClienteParaNps {
  id: string;
  nome: string;
  contato: string | null;
  groupJid: string | null;
  /** false = o Agente CS está pausado para este cliente (clients.agente_ativo). */
  agenteAtivo: boolean | null;
  /** Pode receber mensagem (ativo, não arquivado, não pausado) — lib/clients/pausa.ts → podeReceber. */
  podeReceber: boolean;
}

export interface PerguntaAnterior {
  clientId: string;
  meetingId: string | null;
  perguntadoEm: string;
}

export interface EnvioNps {
  meetingId: string;
  clientId: string;
  cliente: string;
  groupJid: string;
  realizadaEm: string;
  texto: string;
}

export interface IgnoradoNps {
  cliente: string;
  clientId: string | null;
  meetingId: string;
  motivo: string;
}

/**
 * Quem recebe a pergunta nesta rodada — e, para o ensaio, quem ficou de fora e por quê.
 * Uma pergunta por cliente por rodada (a reunião mais recente), nunca duas vezes pela mesma reunião.
 */
export function selecionarEnvios(p: {
  reunioes: readonly ReuniaoParaNps[];
  clientes: ReadonlyMap<string, ClienteParaNps>;
  anteriores: readonly PerguntaAnterior[];
  agora: Date;
}): { envios: EnvioNps[]; ignorados: IgnoradoNps[] } {
  const agora = p.agora.getTime();
  const envios: EnvioNps[] = [];
  const ignorados: IgnoradoNps[] = [];
  const reunioesJaPerguntadas = new Set(p.anteriores.map((a) => a.meetingId).filter(Boolean) as string[]);
  const ultimaPorCliente = new Map<string, number>();
  for (const a of p.anteriores) {
    const t = new Date(a.perguntadoEm).getTime();
    if (Number.isFinite(t) && t > (ultimaPorCliente.get(a.clientId) ?? -Infinity)) ultimaPorCliente.set(a.clientId, t);
  }

  // Mais recente primeiro: se o cliente teve duas reuniões, pergunta pela última.
  const ordenadas = [...p.reunioes].sort((a, b) =>
    new Date(b.realizadaEm ?? 0).getTime() - new Date(a.realizadaEm ?? 0).getTime());
  const vistos = new Set<string>();

  for (const r of ordenadas) {
    const c = r.clientId ? p.clientes.get(r.clientId) : undefined;
    const fora = (motivo: string) => ignorados.push({ cliente: c?.nome ?? "(sem cliente)", clientId: r.clientId, meetingId: r.id, motivo });
    const t = r.realizadaEm ? new Date(r.realizadaEm).getTime() : NaN;

    if (r.deletedAt) continue;
    if (r.estado !== "realizada" || !Number.isFinite(t)) continue;
    if (!r.clientId || (r.tipo ?? "").startsWith("comercial")) continue; // reunião de prospecção não é cliente
    if (agora - t > JANELA_REUNIAO_H * H) continue;                          // velha demais: nem aparece no ensaio
    if (agora - t < ESPERA_POS_REUNIAO_MIN * 60_000) { fora("reunião marcada como realizada há menos de 30 min"); continue; }
    if (!c) { fora("cliente não encontrado"); continue; }
    if (reunioesJaPerguntadas.has(r.id)) { fora("já perguntado por esta reunião"); continue; }
    if (vistos.has(c.id)) { fora("outra reunião do mesmo cliente já entrou nesta rodada"); continue; }
    const ultima = ultimaPorCliente.get(c.id);
    if (ultima !== undefined && agora - ultima < INTERVALO_MINIMO_DIAS * DIA) {
      fora(`já perguntado há menos de ${INTERVALO_MINIMO_DIAS} dias`); continue;
    }
    if (!c.podeReceber) { fora("cliente pausado ou arquivado"); continue; }
    if (c.agenteAtivo === false) { fora("Agente CS pausado para este cliente"); continue; }
    if (!c.groupJid) { fora("sem grupo de WhatsApp vinculado"); continue; }

    vistos.add(c.id);
    envios.push({
      meetingId: r.id, clientId: c.id, cliente: c.nome, groupJid: c.groupJid,
      realizadaEm: r.realizadaEm as string, texto: textoPergunta(c.contato),
    });
  }
  return { envios, ignorados };
}

// ─── Pendência no grupo (o que o inbound faz com a mensagem) ─────────────────

export type EstadoPesquisa = "aguardando" | "aguardando_motivo" | "respondido" | "sem_resposta" | "falhou";

export interface PesquisaPendente {
  status: EstadoPesquisa;
  perguntadoEm: string;
  motivoPerguntadoEm: string | null;
  messageId: string | null;
  motivoMessageId: string | null;
}

export type DecisaoResposta =
  | { tipo: "nota"; nota: number; followUp: boolean; soANota: boolean }
  | { tipo: "motivo"; texto: string }
  | { tipo: "ignorar" };

/**
 * O que fazer com a mensagem de um CLIENTE num grupo com pesquisa pendente. Estreito de propósito:
 *   • aguardando a nota → só número de 0 a 10 (lerNota) dentro de 72h;
 *   • aguardando o motivo → qualquer texto de verdade dentro de 48h.
 * Resposta que cita OUTRA mensagem do agente não é resposta desta pesquisa.
 */
export function decidirResposta(p: {
  pendente: PesquisaPendente;
  texto: string;
  citadaId?: string | null;
  agora: Date;
}): DecisaoResposta {
  const agora = p.agora.getTime();
  const { pendente } = p;
  const citouOutra = (esperada: string | null) => !!p.citadaId && !!esperada && p.citadaId !== esperada;

  if (pendente.status === "aguardando") {
    if (agora - new Date(pendente.perguntadoEm).getTime() > JANELA_RESPOSTA_H * H) return { tipo: "ignorar" };
    if (citouOutra(pendente.messageId)) return { tipo: "ignorar" };
    const nota = lerNota(p.texto);
    if (nota === null) return { tipo: "ignorar" };
    return { tipo: "nota", nota, followUp: precisaFollowUp(nota), soANota: ehSoANota(p.texto) };
  }

  if (pendente.status === "aguardando_motivo") {
    const desde = new Date(pendente.motivoPerguntadoEm ?? pendente.perguntadoEm).getTime();
    if (agora - desde > JANELA_MOTIVO_H * H) return { tipo: "ignorar" };
    if (citouOutra(pendente.motivoMessageId)) return { tipo: "ignorar" };
    const texto = p.texto.trim();
    // "ok", "kkk", figurinha: não é o motivo.
    if (texto.length < 3 || /^(ok|okay|blz|beleza|certo|obrigad[oa]|valeu|vlw|top|show|kk+)[\s!.]*$/i.test(texto)) {
      return { tipo: "ignorar" };
    }
    return { tipo: "motivo", texto: texto.slice(0, 1000) };
  }

  return { tipo: "ignorar" };
}

// ─── Saúde ───────────────────────────────────────────────────────────────────

export interface RespostaNps {
  nota: number | null;
  respondidoEm: string | null;
}

/**
 * O componente "Satisfação" da saúde (0–100): a nota mais recente dos últimos 120 dias × 10.
 * Sem nota recente → null, e o peso some da conta (lib/scores/health.ts redistribui).
 */
export function componenteSatisfacao(respostas: readonly RespostaNps[], agora: Date): number | null {
  let melhor: { t: number; nota: number } | null = null;
  for (const r of respostas) {
    if (r.nota === null || r.nota === undefined || !r.respondidoEm) continue;
    const t = new Date(r.respondidoEm).getTime();
    if (!Number.isFinite(t) || agora.getTime() - t > VALIDADE_NO_SCORE_DIAS * DIA) continue;
    if (!melhor || t > melhor.t) melhor = { t, nota: r.nota };
  }
  if (!melhor) return null;
  return Math.max(0, Math.min(100, Math.round(melhor.nota * 10)));
}
