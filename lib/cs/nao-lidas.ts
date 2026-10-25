// lib/cs/nao-lidas.ts — MENSAGEM DE CLIENTE QUE A IA NÃO CONSEGUIU LER não se perde. Regras puras
// (tests/cs-nao-lidas.test.ts); banco em lib/cs/nao-lidas-server.ts; rotina em
// app/api/system/cs-nao-lidas (a cada 15 min).
//
// POR QUE (21/10/2026, auditoria de erro recuperável, 5.10). Quando a classificação (A1) falhava, o
// inbound respondia "ok, classified:false". Como o message_id já tinha sido reclamado (o reenvio da
// Evolution morre no claim), a mensagem nunca mais era lida: o pedido do cliente sumia, sem aviso.
// De 25 a 30/09 a OpenAI ficou sem crédito e foi assim por cinco dias.
//
// Agora a mensagem entra numa fila com o texto que o inbound já tinha (áudio transcrito, imagem
// descrita). A rotina a passa de novo pelo MESMO inbound — a sugestão nasce normalmente, com a nota
// de que é leitura atrasada — e avisa o time quando um grupo fica com mensagem sem leitura.
//
// 25/10/2026 (auditoria 11.1): ÁUDIO que não foi transcrito também entra (tipo "audio"), com o que é
// preciso para baixar de novo (`midia`). A releitura manda o áudio original pelo inbound, que
// transcreve outra vez. Regras do áudio em lib/cs/audio-nao-lido.ts.

import type { MidiaGuardada } from "./audio-nao-lido";

/** Uma linha de cs_mensagens_nao_lidas. */
export interface NaoLida {
  message_id: string;
  group_jid: string;
  client_id?: string | null;
  cliente_nome?: string | null;
  author_jid?: string | null;
  author_name?: string | null;
  texto: string;
  recebida_em: string;
  erro?: string | null;
  tentativas: number;
  status: string;
  ultima_tentativa_em?: string | null;
  avisado_em?: string | null;
  /** "audio" = nota de voz que não foi transcrita; `texto` fica vazio e `midia` guarda como baixar de novo. */
  tipo?: "texto" | "audio" | null;
  midia?: MidiaGuardada | null;
}

export const ehAudio = (m: Pick<NaoLida, "tipo">) => m.tipo === "audio";
/** Resposta de onboarding por áudio: a releitura manda a próxima pergunta AO CLIENTE — só no expediente. */
const ehOnboarding = (m: NaoLida) => ehAudio(m) && typeof m.midia?.onboardingPasso === "number";

/** Passou disso sem conseguir ler: desiste e pede ao time para ler à mão. */
export const DESISTIR_H = 48;
/** Só avisa depois de pelo menos uma releitura ter falhado — falha de um minuto não vira ruído. */
export const AVISAR_APOS_MIN = 30;
/** O mesmo grupo não recebe o aviso de novo antes disso. */
export const REAVISAR_H = 6;
/** Mensagens por rodada (cada uma passa pelo inbound inteiro: classificação, briefing, envio). */
export const LOTE = 5;
/** "lendo" parado há mais que isso = a rodada anterior caiu no meio; volta para a fila. */
export const LENDO_TRAVADA_MIN = 15;
/** Avisos ao time só no expediente (SP). A releitura roda o dia todo. */
export const HORA_AVISO = { de: 8, ate: 20 } as const;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** O que esta rodada relê e o que ela desiste de ler. */
export function planejarReleitura(fila: NaoLida[], agora: Date): { tentar: NaoLida[]; expirar: NaoLida[] } {
  const t = agora.getTime();
  const vivas = fila.filter((m) => m.status === "pendente"
    || (m.status === "lendo" && !(t - ms(m.ultima_tentativa_em) <= LENDO_TRAVADA_MIN * 60_000)));
  const expirar = vivas.filter((m) => t - ms(m.recebida_em) > DESISTIR_H * 3600_000);
  const tentar = vivas
    .filter((m) => !expirar.includes(m))
    .filter((m) => !ehOnboarding(m) || noHorarioDeAviso(agora))
    .sort((a, b) => ms(a.recebida_em) - ms(b.recebida_em))
    .slice(0, LOTE);
  return { tentar, expirar };
}

/**
 * O webhook "de novo", como a Evolution teria mandado — só que com o texto já pronto. O inbound
 * reconhece a releitura pelo cabeçalho (x-cs-releitura) e pula o que já aconteceu na primeira vez.
 */
export function payloadDaReleitura(m: NaoLida) {
  // Áudio: manda a mensagem ORIGINAL (key + audioMessage) — o inbound baixa e transcreve de novo.
  if (ehAudio(m) && m.midia?.key && m.midia?.message) {
    const key = m.midia.key as { remoteJid?: string; participant?: string; participantPn?: string; participantAlt?: string };
    return {
      event: "messages.upsert",
      data: {
        key: {
          remoteJid: key.remoteJid || m.group_jid, fromMe: false, id: m.message_id,
          participant: key.participant || m.author_jid || undefined, participantPn: key.participantPn, participantAlt: key.participantAlt,
        },
        pushName: m.author_name || "",
        message: m.midia.message as Record<string, unknown>,
        messageTimestamp: Math.floor(ms(m.recebida_em) / 1000) || 0,
      },
      ...(typeof m.midia.onboardingPasso === "number" ? { cs: { onboardingPasso: m.midia.onboardingPasso } } : {}),
    };
  }
  return {
    event: "messages.upsert",
    data: {
      key: { remoteJid: m.group_jid, fromMe: false, id: m.message_id, participant: m.author_jid || undefined },
      pushName: m.author_name || "",
      message: { conversation: m.texto },
      messageTimestamp: Math.floor(ms(m.recebida_em) / 1000) || 0,
    },
  };
}

/**
 * A releitura deu certo? Só "classified:false" (a IA falhou de novo), erro do inbound ou HTTP fora
 * de 2xx mantêm a mensagem na fila. Qualquer outro desfecho — virou sugestão, era trivial, era
 * aprovação, juntou num pedido aberto — é leitura feita.
 */
export function lerResultadoReleitura(httpStatus: number, corpo: unknown): { lida: boolean; motivo: string; soEsta?: true } {
  if (httpStatus < 200 || httpStatus >= 300) return { lida: false, motivo: `HTTP ${httpStatus}` };
  const b = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  if (b.ok === false) return { lida: false, motivo: String(b.error ?? "erro no inbound") };
  // `soEsta` (25/10/2026, 11.1): a falha é desta mensagem (o áudio dela não baixa), não da IA — a rodada
  // segue para as outras em vez de parar no disjuntor.
  if (b.classified === false) {
    return { lida: false, motivo: String(b.reason ?? "a IA não classificou"), ...(b.soEsta === true ? { soEsta: true as const } : {}) };
  }
  const desfecho = b.skip ? `pulada: ${String(b.skip)}`
    : b.coalesced ? `juntou no pedido ${String(b.coalesced)}`
    : Array.isArray(b.sugeridas) ? `${(b.sugeridas as unknown[]).length} sugestão(ões)`
    : "lida";
  return { lida: true, motivo: desfecho };
}

/** Hora de SP de um instante, para o aviso ("14:05" hoje, "20/10 14:05" em outro dia). */
export function quandoSP(iso: string, agora: Date): string {
  const d = new Date(iso);
  const dia = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return dia(d) === dia(agora) ? hora : `${dia(d)} ${hora}`;
}

function horaSP(agora: Date): number {
  return Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false })) % 24;
}

export function noHorarioDeAviso(agora: Date): boolean {
  const h = horaSP(agora);
  return h >= HORA_AVISO.de && h < HORA_AVISO.ate;
}

export interface GrupoSemLeitura {
  groupJid: string;
  cliente: string;
  mensagens: NaoLida[];
}

/**
 * Grupos que precisam do aviso agora: com mensagem esperando há 30 min ou mais e sem aviso nas
 * últimas 6h. Fora do expediente, ninguém é acordado — o aviso sai na primeira rodada da manhã.
 */
export function gruposParaAvisar(pendentes: NaoLida[], agora: Date): GrupoSemLeitura[] {
  if (!noHorarioDeAviso(agora)) return [];
  const t = agora.getTime();
  const porGrupo = new Map<string, NaoLida[]>();
  for (const m of pendentes) {
    if (m.status !== "pendente" && m.status !== "lendo") continue;
    porGrupo.set(m.group_jid, [...(porGrupo.get(m.group_jid) ?? []), m]);
  }
  const out: GrupoSemLeitura[] = [];
  for (const [groupJid, msgs] of porGrupo) {
    const velha = msgs.some((m) => t - ms(m.recebida_em) >= AVISAR_APOS_MIN * 60_000);
    const avisadoHaPouco = msgs.some((m) => m.avisado_em && t - ms(m.avisado_em) < REAVISAR_H * 3600_000);
    if (!velha || avisadoHaPouco) continue;
    const ordenadas = [...msgs].sort((a, b) => ms(a.recebida_em) - ms(b.recebida_em));
    out.push({ groupJid, cliente: ordenadas[0].cliente_nome || "cliente sem cadastro", mensagens: ordenadas });
  }
  return out.sort((a, b) => ms(a.mensagens[0].recebida_em) - ms(b.mensagens[0].recebida_em));
}

const trecho = (s: string) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > 110 ? `${t.slice(0, 107)}…` : t;
};

/** O que a linha do aviso mostra da mensagem: o texto, ou que é um áudio (e por que não ouvi). */
const conteudo = (m: NaoLida) => (ehAudio(m)
  ? `🎤 áudio que eu não consegui ouvir${m.erro ? ` — ${trecho(m.erro).slice(0, 90)}` : ""}`
  : `"${trecho(m.texto)}"`);

/** O aviso ao time: quais grupos têm mensagem sem leitura, desde quando, e o que fazer. */
export function textoAvisoNaoLidas(grupos: GrupoSemLeitura[], erro: string | null | undefined, agora: Date): string {
  const linhas = grupos.slice(0, 8).map((g) => {
    const n = g.mensagens.length;
    const primeira = g.mensagens[0];
    const audios = g.mensagens.filter(ehAudio).length;
    const extra = audios && audios < n ? ` (${audios} em áudio)` : "";
    return `• *${g.cliente}* — ${n} mensage${n === 1 ? "m" : "ns"}${extra}, desde ${quandoSP(primeira.recebida_em, agora)}\n  _${conteudo(primeira)}_`;
  });
  const partes = [
    `⚠️ *Tem mensagem de cliente que eu não consegui ler*${erro ? `\n_(a IA está falhando: ${trecho(erro).slice(0, 90)})_` : ""}`,
    "",
    linhas.join("\n"),
  ];
  if (grupos.length > 8) partes.push(`_e mais ${grupos.length - 8} grupo(s)._`);
  const temAudio = grupos.some((g) => g.mensagens.some(ehAudio));
  partes.push("", `Tô tentando de novo a cada 15 min e crio a sugestão assim que conseguir. Enquanto isso, dá uma olhada nesses grupos${temAudio ? " (e ouve os áudios)" : ""} — pode ter pedido esperando.`);
  return partes.join("\n");
}

/** Desistiu (48h sem conseguir): o time lê à mão. */
export function textoDesistencia(expiradas: NaoLida[], agora: Date): string {
  const linhas = expiradas.slice(0, 10).map((m) =>
    `• *${m.cliente_nome || "cliente"}* (${quandoSP(m.recebida_em, agora)}): _${conteudo(m)}_`);
  return [
    // Áudio longo demais entra aqui na hora (não adianta tentar de novo); o resto, depois de 48h.
    expiradas.every(ehAudio)
      ? `🚫 *Não consegui ouvir ${expiradas.length} áudio${expiradas.length === 1 ? "" : "s"} de cliente* — parei de tentar:`
      : `🚫 *Não consegui ler ${expiradas.length} mensage${expiradas.length === 1 ? "m" : "ns"} de cliente em ${DESISTIR_H}h* — parei de tentar:`,
    linhas.join("\n"),
    expiradas.length > 10 ? `_e mais ${expiradas.length - 10}._` : "",
    expiradas.some(ehAudio) ? "Ouve/lê no grupo e, se for pedido, cria o card à mão." : "Lê no grupo e, se for pedido, cria o card à mão.",
  ].filter(Boolean).join("\n");
}

/** A nota que vai no topo da sugestão quando ela nasce de uma releitura. */
export function notaLeituraAtrasada(recebidaEmSeg: number | null | undefined, agora: Date): string {
  if (!recebidaEmSeg) return "⏳ _Li agora uma mensagem que eu não tinha conseguido ler na hora._\n\n";
  return `⏳ _Li agora a mensagem das ${quandoSP(new Date(recebidaEmSeg * 1000).toISOString(), agora)} — a IA tinha falhado na hora._\n\n`;
}
