// lib/avisos/audio-server.ts — a VOZ NATURAL dos avisos (Roberto, 05/10: a voz do navegador ficou
// "bem feia"; quer "uma voz como a do ChatGPT"). OpenAI gpt-4o-mini-tts, mp3, em português do Brasil.
//
// Cache por (voz + instruções + texto) em avisos_audio: o mesmo aviso não paga duas vezes. A voz
// escolhida mora em agency_settings.voz_avisos (troca sem deploy). Custo registrado em llm_calls.
// Se a OpenAI falhar, quem chamou recebe null e o painel cai na voz do navegador.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { registrarChamadaLlm } from "@/lib/obs/llm";

export const MODELO_VOZ = "gpt-4o-mini-tts";
export const VOZ_PADRAO = "nova"; // escolhida pelo Roberto em 05/10, depois de ouvir 6 amostras
const VOZES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);
// As instruções exatas da amostra que o Roberto aprovou (05/10). Mudar o texto muda a chave do cache.
const INSTRUCOES =
  "Fale em português do Brasil, com sotaque brasileiro natural. Tom calmo, claro e profissional, como uma " +
  "assistente avisando a equipe de uma agência. Ritmo levemente acelerado, sem soar robótico.";
export const TEXTO_MAX = 300;

async function vozEscolhida(): Promise<string> {
  const { data } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "voz_avisos").maybeSingle();
  const v = String((data?.value as string | undefined) ?? "").trim().toLowerCase();
  return VOZES.has(v) ? v : VOZ_PADRAO;
}

/** mp3 da frase, do cache ou gerado agora. null = não deu (sem chave, OpenAI fora, sem crédito). */
export async function audioDoAviso(texto: string): Promise<Buffer | null> {
  const frase = texto.trim().slice(0, TEXTO_MAX);
  if (!frase) return null;
  const voz = await vozEscolhida();
  const chave = createHash("sha256").update(`${MODELO_VOZ}|${voz}|${INSTRUCOES}|${frase}`).digest("hex");

  const { data: cache } = await supabaseAdmin.from("avisos_audio").select("mp3_base64").eq("chave", chave).maybeSingle();
  if (cache?.mp3_base64) return Buffer.from(cache.mp3_base64 as string, "base64");

  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const inicio = Date.now();
  const ctl = new AbortController();
  const tempo = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO_VOZ, voice: voz, input: frase, instructions: INSTRUCOES, response_format: "mp3" }),
    });
    if (!res.ok) {
      const erro = (await res.text().catch(() => "")).slice(0, 200);
      registrarChamadaLlm({ modelo: MODELO_VOZ, ms: Date.now() - inicio, ok: false, erro: `HTTP ${res.status} ${erro}`, origem: "avisos:voz", tipo: "tts" });
      return null;
    }
    const mp3 = Buffer.from(await res.arrayBuffer());
    registrarChamadaLlm({ modelo: MODELO_VOZ, ms: Date.now() - inicio, ok: true, origem: "avisos:voz", tipo: "tts" });
    const { error } = await supabaseAdmin.from("avisos_audio").upsert({ chave, voz, texto: frase, mp3_base64: mp3.toString("base64") });
    if (error) console.error("[avisos/audio] cache:", error.message);
    return mp3;
  } catch (e) {
    registrarChamadaLlm({ modelo: MODELO_VOZ, ms: Date.now() - inicio, ok: false, erro: e instanceof Error ? e.message : String(e), origem: "avisos:voz", tipo: "tts" });
    return null;
  } finally {
    clearTimeout(tempo);
  }
}
