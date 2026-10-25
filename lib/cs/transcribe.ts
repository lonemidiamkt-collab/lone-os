// lib/cs/transcribe.ts — transcreve nota de voz do WhatsApp (ogg/opus) via OpenAI Whisper.
// Reusa a OPENAI_API_KEY. NUNCA lança.
//
// 25/10/2026 (auditoria de erro recuperável, 11.1): `transcribeAudio` devolvia "" tanto para áudio
// mudo quanto para Whisper sem crédito — e o inbound não sabia distinguir "não tinha o que ler" de
// "não consegui ler". Agora `transcreverAudio` diz o erro, e `ouvirAudio` faz o caminho inteiro
// (baixar → limite → transcrever) dizendo o MOTIVO da falha, que vai para a fila de não lidas.

import { registrarChamadaLlm } from "@/lib/obs/llm";
import { LIMITE_AUDIO_BASE64, type MotivoAudio } from "@/lib/cs/audio-nao-lido";

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

function extFromMime(mime?: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  return "ogg"; // padrão das notas de voz do WhatsApp (opus)
}

// Prompt de domínio: viesa a grafia do Whisper pro vocabulário do dia a dia (marketing + nome do
// cliente/nicho, quando conhecido). Sem isso ele erra termo técnico e nome próprio ("card", "story",
// "reels", "carrossel", "tráfego", "Império dos Pisos"…). Cap ~200 chars (o prompt não é transcrito).
function promptDominio(contexto?: string): string {
  // "Loninho"/"Lone" no começo: é como o time chama o agente por áudio ("Loninho, me manda os clientes
  // que precisam da minha atenção hoje") — sem isso o Whisper escreve "Lonildo", "o Neno" e o pedido
  // não é reconhecido.
  const base = "Loninho e Lone, assistente da Lone Mídia. Agência de marketing no WhatsApp: post, arte, card, story, reels, feed, carrossel, legenda, briefing, tráfego, campanha, criativo, orçamento.";
  const ctx = (contexto || "").trim().slice(0, 90);
  return (ctx ? `${ctx}. ${base}` : base).slice(0, 200);
}

/** Transcreve. `erro` preenchido = não consegui (texto vazio sem erro = áudio sem fala). */
export async function transcreverAudio(base64: string, mimetype?: string, contexto?: string): Promise<{ texto: string; erro: string | null }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { texto: "", erro: "sem OPENAI_API_KEY" };
  if (!base64) return { texto: "", erro: "áudio vazio" };
  try {
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));
    const type = mimetype || "audio/ogg";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), `audio.${extFromMime(type)}`);
    form.append("model", "whisper-1");
    form.append("language", "pt");
    form.append("prompt", promptDominio(contexto));
    const t0 = Date.now();
    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const corpo = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
      console.error("[transcribe] HTTP", res.status, corpo);
      // O corpo vai junto (25/10/2026): "HTTP 429" sozinho não diz se é limite de velocidade ou crédito
      // acabado; com "insufficient_quota" o vigia da IA reconhece a causa.
      const erro = `HTTP ${res.status}${corpo ? `: ${corpo}` : ""}`;
      registrarChamadaLlm({ modelo: "whisper-1", ms: Date.now() - t0, ok: false, erro, origem: "cs:transcribe", tipo: "transcription" });
      return { texto: "", erro };
    }
    const data = (await res.json()) as { text?: string };
    // whisper cobra por minuto de áudio, não por token — fica a contagem e a duração; custo null.
    registrarChamadaLlm({ modelo: "whisper-1", ms: Date.now() - t0, ok: true, origem: "cs:transcribe", tipo: "transcription" });
    return { texto: (data.text || "").trim(), erro: null };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    console.error("[transcribe]", erro);
    return { texto: "", erro };
  }
}

/** Compatível com quem já usava: só o texto ("" = não ouviu ou não tinha fala). */
export async function transcribeAudio(base64: string, mimetype?: string, contexto?: string): Promise<string> {
  return (await transcreverAudio(base64, mimetype, contexto)).texto;
}

export type AudioOuvido =
  | { ok: true; texto: string }
  | { ok: false; motivo: MotivoAudio; detalhe: string };

/**
 * Baixa a nota de voz (Evolution) e transcreve. Falha diz o motivo — sem IA, mídia que não baixou,
 * áudio longo demais ou transcrição que falhou. `texto` vazio com ok:true = áudio sem fala.
 */
export async function ouvirAudio(rawData: { key?: unknown; message?: unknown }, contexto?: string): Promise<AudioOuvido> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, motivo: "ia_desligada", detalhe: "sem OPENAI_API_KEY" };
  const { csFetchMediaBase64 } = await import("@/lib/cs/notify");
  const media = await csFetchMediaBase64(rawData);
  if (!media.base64) return { ok: false, motivo: "midia", detalhe: media.error ?? "a Evolution não devolveu o áudio" };
  // Áudio de 1h+ estouraria memória e o limite do Whisper (~25 MB) — demanda real é curta.
  if (media.base64.length > LIMITE_AUDIO_BASE64) {
    return { ok: false, motivo: "grande", detalhe: `${Math.round((media.base64.length * 3) / 4 / 1_000_000)} MB` };
  }
  const t = await transcreverAudio(media.base64, media.mimetype, contexto);
  if (t.erro) return { ok: false, motivo: "transcricao", detalhe: t.erro };
  return { ok: true, texto: t.texto };
}
