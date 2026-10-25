// lib/cs/audio-nao-lido.ts — ÁUDIO QUE EU NÃO CONSEGUI OUVIR não some. Regras puras
// (tests/cs-audio-nao-lido.test.ts); o download e a transcrição ficam em lib/cs/transcribe.ts.
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 11.1). A mensagem já tinha sido reservada
// (cs_processed_messages) quando a transcrição falhava — Whisper sem crédito, mídia que não baixava,
// IA desligada, áudio de mais de ~6 MB. O inbound respondia "ok, skip" e o pedido falado do cliente
// sumia sem rastro; o onboarding respondido por áudio ficava parado no mesmo passo, calado.
//
// Agora o áudio vai para a mesma fila de não lidas (cs_mensagens_nao_lidas, tipo "audio"), com o
// motivo e o que é preciso para baixar de novo. A rotina cs-nao-lidas transcreve outra vez a cada
// 15 min; o time é avisado quando há áudio sem leitura. Áudio longo demais não melhora tentando:
// vai direto para "ouve no grupo".

import { causaDoErro } from "@/lib/ia/causa-erro";

/** Base64 acima disso (~6 MB de áudio) não vai para o Whisper: estoura memória e não é pedido curto. */
export const LIMITE_AUDIO_BASE64 = 8_000_000;

export type MotivoAudio = "ia_desligada" | "midia" | "grande" | "transcricao";

/** Por que não ouvi, em português — vai para o aviso ao time e para a coluna `erro` da fila. */
export function rotuloMotivoAudio(motivo: MotivoAudio, detalhe?: string | null): string {
  switch (motivo) {
    case "ia_desligada": return "a IA está desligada (sem chave da OpenAI)";
    case "midia": return "não consegui baixar o áudio do WhatsApp";
    case "grande": return `o áudio é longo demais pra eu transcrever${detalhe ? ` (${detalhe})` : ""}`;
    case "transcricao": {
      const causa = causaDoErro(detalhe);
      return causa ? `a transcrição falhou: ${causa.titulo}` : "a transcrição falhou";
    }
  }
}

/** Vale tentar de novo daqui a pouco? Áudio grande demais continua grande demais. */
export function tentarDeNovo(motivo: MotivoAudio): boolean {
  return motivo !== "grande";
}

/** Resposta no grupo da EQUIPE quando o pedido do time veio por áudio e eu não ouvi. */
export function textoAudioDoTime(motivo: MotivoAudio, detalhe?: string | null): string {
  if (motivo === "grande") return `🎤 Esse áudio é longo demais pra eu transcrever${detalhe ? ` (${detalhe})` : ""}. Manda por escrito, ou em áudios mais curtos?`;
  return `🎤 Não consegui ouvir esse áudio — ${rotuloMotivoAudio(motivo, detalhe)}. Manda por escrito? Não fiz nada com ele.`;
}

/** Aviso ao time, NA HORA, quando o cliente responde o onboarding por áudio e eu não ouço. */
export function textoOnboardingAudio(p: {
  cliente: string; passo: number; total: number; motivo: MotivoAudio; detalhe?: string | null; guardado: boolean;
}): string {
  const pergunta = `a pergunta ${p.passo + 1} de ${p.total} do onboarding`;
  const depois = p.guardado && tentarDeNovo(p.motivo)
    ? "Tento ouvir de novo a cada 15 min (no expediente) e sigo o onboarding sozinho quando conseguir. Se preferir não esperar, ouve no grupo e pede pra mandar por escrito."
    : "Ouve no grupo e pede pra mandar por escrito — sem isso o onboarding não anda.";
  return `🎤 *${p.cliente}* respondeu ${pergunta} por áudio e eu não consegui ouvir (${rotuloMotivoAudio(p.motivo, p.detalhe)}). O onboarding está parado nesse passo.\n${depois}`;
}

/** Último recurso: nem a fila guardou. Avisa o time para não deixar o áudio sumir. */
export function textoAudioSemFila(cliente: string, motivo: MotivoAudio, detalhe?: string | null): string {
  return `🎤 Chegou áudio de *${cliente}* e eu não consegui ouvir (${rotuloMotivoAudio(motivo, detalhe)}) — nem guardar pra tentar de novo. Ouve no grupo: pode ter pedido esperando.`;
}

/** O que a fila guarda para baixar o áudio de novo (o mesmo `key` + `message` que a Evolution mandou). */
export interface MidiaGuardada {
  key?: unknown;
  message?: unknown;
  /** Resposta de onboarding: em que passo a sessão estava quando o áudio chegou. */
  onboardingPasso?: number | null;
}

export function midiaParaGuardar(data: { key?: unknown; message?: unknown } | null | undefined, onboardingPasso?: number | null): MidiaGuardada {
  return {
    key: data?.key ?? null,
    message: data?.message ?? null,
    ...(typeof onboardingPasso === "number" ? { onboardingPasso } : {}),
  };
}

/** Na releitura, o passo do onboarding que veio junto (só existe quando o áudio era resposta do onboarding). */
export function passoOnboardingDaReleitura(payload: unknown): number | null {
  const cs = (payload as { cs?: { onboardingPasso?: unknown } } | null)?.cs;
  return typeof cs?.onboardingPasso === "number" && Number.isInteger(cs.onboardingPasso) && cs.onboardingPasso >= 0
    ? cs.onboardingPasso : null;
}

/** O mesmo grupo da equipe não recebe "não ouvi o áudio" mais de uma vez nesse intervalo (IA fora = muitos áudios). */
export const RESPOSTA_AUDIO_TIME_MIN = 30;

export function deveResponderAudioDoTime(ultimaEm: number | undefined, agoraMs: number): boolean {
  return !ultimaEm || agoraMs - ultimaEm >= RESPOSTA_AUDIO_TIME_MIN * 60_000;
}
