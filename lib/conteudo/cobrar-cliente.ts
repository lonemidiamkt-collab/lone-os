// lib/conteudo/cobrar-cliente.ts — "COBRAR CLIENTE" (Leva 7B, N11): o card parado em "Com o cliente"
// há 24h ou 48h ganha um RASCUNHO de mensagem para o social copiar e mandar.
//
// NUNCA É ENVIADO SOZINHO. Não existe rotina, botão de envio nem chamada ao WhatsApp aqui: o social
// lê, ajusta e manda do celular dele, no grupo, se achar que é hora. Cobrança automática de aprovação
// no grupo do cliente é o tipo de coisa que queima a agência — o cliente sente que está falando com
// um robô justamente quando a gente precisa da boa vontade dele.
//
// Texto determinístico (sem IA): curto, educado, com o título da arte e, no 48h, o impacto real
// (a data do post chegando). Módulo puro (testado em tests/conteudo-cobrar-cliente.test.ts).

import { etapaDoStatus } from "./etapas";
import { diasEntre, somarDias } from "./no-ar";

export const HORAS_PRIMEIRO_LEMBRETE = 24;
export const HORAS_SEGUNDO_LEMBRETE = 48;

export type NivelCobranca = 24 | 48;

export interface CardEsperandoCliente {
  title: string;
  status: string;
  dueDate?: string | null;
  dueTime?: string | null;
  statusChangedAt?: string | null;
  columnEnteredAt?: Record<string, string> | null;
  clientApprovedAt?: string | null;
  archivedAt?: string | null;
}

export interface Cobranca {
  nivel: NivelCobranca;
  horas: number;
  /** Desde quando está com o cliente (ISO). */
  desde: string;
  rascunho: string;
}

const DIA_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function diaDaSemana(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return DIA_DA_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "sexta, 26/09" — ou "hoje"/"amanhã" quando é perto. */
export function quandoFalado(ymd: string, hoje: string): string {
  const d = diasEntre(hoje, ymd);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  return `${diaDaSemana(ymd)}, ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** Desde quando o card está com o cliente (ISO), ou null se não está. */
export function comOClienteDesde(card: CardEsperandoCliente): string | null {
  if (card.archivedAt || card.clientApprovedAt) return null;
  if (etapaDoStatus(card.status) !== "com_cliente") return null;
  return card.columnEnteredAt?.[card.status] ?? card.statusChangedAt ?? null;
}

/** 24, 48 ou null (ainda dentro do prazo normal de resposta). */
export function nivelDaCobranca(horas: number): NivelCobranca | null {
  if (horas >= HORAS_SEGUNDO_LEMBRETE) return 48;
  if (horas >= HORAS_PRIMEIRO_LEMBRETE) return 24;
  return null;
}

/** Primeiro nome, para a saudação ("Oi, Marcos!"). Sem nome, só "Oi!". */
function saudacao(contato?: string | null): string {
  const nome = (contato ?? "").trim().split(/\s+/)[0];
  return nome ? `Oi, ${nome}! Tudo bem?` : "Oi! Tudo bem?";
}

export function rascunhoDeCobranca(p: {
  nivel: NivelCobranca;
  titulo: string;
  hoje: string;
  /** Dia (YYYY-MM-DD) em que a arte foi para o cliente. */
  enviadaEm: string;
  dataPost?: string | null;
  contato?: string | null;
}): string {
  const titulo = p.titulo.trim();
  const arte = titulo ? `a arte "${titulo}"` : "a arte do post";
  const post = p.dataPost && diasEntre(p.hoje, p.dataPost) >= 0 ? p.dataPost : null;
  const diasDesde = Math.max(0, diasEntre(p.enviadaEm, p.hoje));
  const quandoMandamos = diasDesde === 0 ? "hoje" : diasDesde === 1 ? "ontem" : `há ${diasDesde} dias`;

  if (p.nivel === 24) {
    return [
      saudacao(p.contato),
      `Passando pra lembrar d${arte}, que mandamos ${quandoMandamos} pra sua aprovação.`,
      post
        ? `Se estiver tudo certo, é só responder "aprovado" que a gente já deixa programado pra ${quandoFalado(post, p.hoje)}.`
        : `Se estiver tudo certo, é só responder "aprovado" que a gente já programa.`,
      `Se quiser mudar alguma coisa, me diz o quê que a gente ajusta.`,
    ].join("\n");
  }

  // 48h: o impacto — sem culpar, com a data do post e um próximo passo simples.
  const prazo = post ? somarDias(post, -1) : null;
  return [
    saudacao(p.contato),
    `${arte[0].toUpperCase()}${arte.slice(1)} ainda está esperando o seu ok.`,
    post
      ? diasEntre(p.hoje, post) <= 1
        ? `O post está previsto pra ${quandoFalado(post, p.hoje)} — sem a aprovação a gente não consegue publicar no dia certo.`
        : `O post está previsto pra ${quandoFalado(post, p.hoje)}; com o seu ok até ${quandoFalado(prazo!, p.hoje)} ele sai no dia certo.`
      : `Assim que você aprovar, a gente programa a publicação.`,
    `Se preferir algum ajuste, é só dizer o que mudar que a gente resolve rapidinho.`,
  ].join("\n");
}

/**
 * A cobrança do card, ou null (não está com o cliente, já aprovou, ou ainda não deu 24h).
 * `contato` = nome do responsável do cliente (clients.contact_name), para a saudação.
 */
export function cobrancaDoCard(card: CardEsperandoCliente, opts: { agoraMs: number; hoje: string; contato?: string | null }): Cobranca | null {
  const desde = comOClienteDesde(card);
  if (!desde) return null;
  const t = Date.parse(desde);
  if (!Number.isFinite(t)) return null;
  const horas = Math.floor((opts.agoraMs - t) / 3_600_000);
  const nivel = nivelDaCobranca(horas);
  if (!nivel) return null;
  const enviadaEm = new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return {
    nivel, horas, desde,
    rascunho: rascunhoDeCobranca({ nivel, titulo: card.title, hoje: opts.hoje, enviadaEm, dataPost: card.dueDate?.slice(0, 10) ?? null, contato: opts.contato }),
  };
}
