// lib/cs/transcribe.ts — transcreve nota de voz do WhatsApp (ogg/opus) via OpenAI Whisper.
// Reusa a OPENAI_API_KEY. NUNCA lança — falha vira "" e o webhook segue.

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

function extFromMime(mime?: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  return "ogg"; // padrão das notas de voz do WhatsApp (opus)
}

export async function transcribeAudio(base64: string, mimetype?: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !base64) return "";
  try {
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));
    const type = mimetype || "audio/ogg";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), `audio.${extFromMime(type)}`);
    form.append("model", "whisper-1");
    form.append("language", "pt");
    const res = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error("[transcribe] HTTP", res.status, (await res.text().catch(() => "")).slice(0, 160));
      return "";
    }
    const data = (await res.json()) as { text?: string };
    return (data.text || "").trim();
  } catch (err) {
    console.error("[transcribe]", err instanceof Error ? err.message : err);
    return "";
  }
}
