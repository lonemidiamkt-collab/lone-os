// lib/cs/ingest.ts — A0 (Ingestão & Filtro) do Agente CS. SEM IA.
// Normaliza o evento `messages.upsert` da Evolution, detecta autor (equipe Lone vs
// cliente) e descarta ruído trivial ANTES de gastar token no A1. Idempotência e
// debounce (agrupar rajada) ficam na camada de persistência (próxima fatia).
// Fonte: blueprint A0 (§4/§5) + 11.2 (detecção de autor).

export interface EvolutionUpsert {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string; participant?: string };
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

/** Extrai texto de conversation / extendedTextMessage / caption de imagem/vídeo. */
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
  return "";
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
  // Reply/citação: WhatsApp manda o id da msg citada em extendedTextMessage.contextInfo.stanzaId.
  const ext = d?.message?.extendedTextMessage as { contextInfo?: { stanzaId?: string } } | undefined;
  const quotedMsgId = ext?.contextInfo?.stanzaId || undefined;
  return {
    groupJid: remoteJid,
    authorJid: d?.key?.participant ?? remoteJid,
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

/** Autor é da equipe Lone? (números/JIDs conhecidos). Mensagem da Lone nunca vira demanda. */
export function isLoneTeam(authorJid: string, teamJids: string[]): boolean {
  if (!authorJid) return false;
  const digits = authorJid.replace(/[^0-9]/g, "");
  return teamJids.some((j) => {
    const jd = j.replace(/[^0-9]/g, "");
    return jd.length > 0 && (digits === jd || digits.endsWith(jd) || jd.endsWith(digits));
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
