// lib/cs/ingest.ts — A0 (Ingestão & Filtro) do Agente CS. SEM IA.
// Normaliza o evento `messages.upsert` da Evolution, detecta autor (equipe Lone vs
// cliente) e descarta ruído trivial ANTES de gastar token no A1. Idempotência e
// debounce (agrupar rajada) ficam na camada de persistência (próxima fatia).
// Fonte: blueprint A0 (§4/§5) + 11.2 (detecção de autor).

export interface EvolutionUpsert {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string; fromMe?: boolean; id?: string; participant?: string;
      /** Baileys/Evolution recentes: quando participant vem como @lid, o número real vem aqui. */
      participantPn?: string; participantAlt?: string;
    };
    pushName?: string;
    message?: Record<string, unknown> | null;
    messageType?: string;
    messageTimestamp?: number;
  };
}

export interface NormalizedInbound {
  groupJid: string;
  authorJid: string; // quem mandou (participant, em grupo)
  authorName: string;
  text: string;
  messageId: string;
  timestamp: number;
  fromMe: boolean;
  /** Se for um REPLY: id da mensagem citada (pra casar a resposta com a sugestão do agente). */
  quotedMsgId?: string;
  /** Nota de voz sem texto — a camada de cima transcreve (Whisper) e preenche o text. */
  isAudio?: boolean;
}

/** Extrai texto de conversation / extendedTextMessage / caption de imagem/vídeo/documento. */
export function extractText(message?: Record<string, unknown> | null): string {
  if (!message) return "";
  const conv = message.conversation;
  if (typeof conv === "string") return conv.trim();
  const ext = message.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text.trim();
  const img = message.imageMessage as { caption?: string } | undefined;
  if (img?.caption) return img.caption.trim();
  const vid = message.videoMessage as { caption?: string } | undefined;
  if (vid?.caption) return vid.caption.trim();
  const doc = message.documentMessage as { caption?: string } | undefined;
  if (doc?.caption) return doc.caption.trim();
  return "";
}

/** Id da mensagem citada (reply). O contextInfo mora DENTRO do tipo da mensagem: em texto é
 *  extendedTextMessage.contextInfo, mas em reply com mídia é imageMessage/videoMessage/
 *  audioMessage/documentMessage.contextInfo — sem varrer todos, reply com foto/áudio perdia o
 *  thread e a resposta caía no fallback de "última pendente" (demanda errada). */
export function extractQuotedId(message?: Record<string, unknown> | null): string | undefined {
  if (!message) return undefined;
  for (const v of Object.values(message)) {
    const ci = (v as { contextInfo?: { stanzaId?: string } } | null)?.contextInfo;
    if (ci?.stanzaId) return ci.stanzaId;
  }
  return undefined;
}

/** Normaliza um upsert. Retorna null se não for mensagem de grupo com texto. */
export function parseUpsert(payload: EvolutionUpsert): NormalizedInbound | null {
  if (payload.event && payload.event !== "messages.upsert") return null;
  const d = payload.data;
  const remoteJid = d?.key?.remoteJid ?? "";
  if (!remoteJid.endsWith("@g.us")) return null; // só grupos
  const text = extractText(d?.message);
  // Nota de voz (audioMessage/PTT) não tem texto → marca isAudio p/ a camada de cima transcrever.
  const isAudio = !!(d?.message?.audioMessage);
  if (!text && !isAudio) return null; // sem texto e sem áudio (figurinha/etc) → ignora
  const messageId = d?.key?.id ?? "";
  if (!messageId) return null;
  const quotedMsgId = extractQuotedId(d?.message);
  // Autor: quando o WhatsApp entrega o participant como @lid (id interno, dígitos sem relação com
  // o telefone), prefere o número real (participantPn/participantAlt) — senão isLoneTeam falha e
  // mensagem da equipe vira "demanda de cliente".
  const participant = d?.key?.participant ?? remoteJid;
  const participantReal = participant.endsWith("@lid")
    ? (d?.key?.participantPn || d?.key?.participantAlt || participant)
    : participant;
  return {
    groupJid: remoteJid,
    authorJid: participantReal,
    authorName: d?.pushName ?? "",
    text,
    messageId,
    timestamp: d?.messageTimestamp ?? 0,
    fromMe: !!d?.key?.fromMe,
    quotedMsgId,
    isAudio,
  };
}

// Ruído trivial — descartado antes do A1. Filtro CONSERVADOR: só corta o claramente
// trivial; na dúvida passa pro A1 (recall > precisão; ver blueprint FMEA).
const TRIVIAL_PATTERNS: RegExp[] = [
  /^(bom dia|boa tarde|boa noite)[\s!.]*$/i,
  /^(obrigad[oa]|vlw|valeu|tmj|de nada|por nada)[\s!.]*$/i,
  /^(ok|okay|blz|beleza|certo|combinado|perfeito|show|top|isso)[\s!.]*$/i,
  /^k{2,}[\s!.]*$/i, // kkk
  /^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}👍🙏❤️😂🤣]+$/u, // só emoji/figurinha textual
];

export function isTrivial(text: string): boolean {
  const t = text.trim();
  if (t.length <= 1) return true;
  return TRIVIAL_PATTERNS.some((re) => re.test(t));
}

// Forma canônica de número BR: 55 + DDD + últimos 8 dígitos. O 9º dígito móvel aparece OU não
// dependendo de quem gerou o jid (env com 9, WhatsApp sem, ou vice-versa) — e a diferença fica no
// MEIO da string, então endsWith não salva. Não-BR/curto: devolve os dígitos como vieram.
function brCanonical(digits: string): string {
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return "55" + digits.slice(2, 4) + digits.slice(-8);
  }
  return digits;
}

/** Autor é da equipe Lone? (números/JIDs conhecidos). Mensagem da Lone nunca vira demanda. */
export function isLoneTeam(authorJid: string, teamJids: string[]): boolean {
  if (!authorJid) return false;
  const digits = authorJid.replace(/[^0-9]/g, "");
  if (!digits) return false;
  const a = brCanonical(digits);
  return teamJids.some((j) => {
    const jd = j.replace(/[^0-9]/g, "");
    if (!jd) return false;
    const b = brCanonical(jd);
    return a === b || a.endsWith(b) || b.endsWith(a);
  });
}

// Conta da própria Lone (ex.: "Lone Midia - Assessoria de Marketing", "Carlos - Social Midia | Lone
// Midia", "Lucas Socio Lone") — o nome denuncia a agência, mesmo de um número não cadastrado.
// Mensagem da Lone NUNCA vira demanda do cliente. Heurística: "Lone" + marcador de papel/agência.
export function ehNomeEquipeLone(pushName?: string): boolean {
  if (!pushName) return false;
  if (/assessoria de marketing/i.test(pushName)) return true;
  return /\blone\b/i.test(pushName) && /(m[íi]dia|social|s[óo]cio|assessoria|marketing|gestor|tr[áa]fego|designer)/i.test(pushName);
}
