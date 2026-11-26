// lib/avisos/audio-server.ts — a VOZ NATURAL dos avisos (Roberto, 05/10: a voz do navegador ficou
// "bem feia"; quer "uma voz como a do ChatGPT"). OpenAI gpt-4o-mini-tts, mp3, em português do Brasil.
//
// Cache por (voz + instruções + texto) em avisos_audio: o mesmo aviso não paga duas vezes. A voz
// escolhida mora em agency_settings.voz_avisos e as instruções em voz_avisos_instrucoes (trocam sem deploy). Custo registrado em llm_calls.
// Se a OpenAI falhar, quem chamou recebe null e o painel cai na voz do navegador.

import { MODELO_VOZ, MODELO_VOZ_TEMPO_REAL } from "@/lib/ai/modelos";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { registrarChamadaLlm } from "@/lib/obs/llm";
import { falarPorTempoReal } from "@/lib/avisos/voz-tempo-real";

// O nome do modelo mora em lib/ai/modelos.ts (leva 1-M); reexportado aqui por quem já importava daqui.
export { MODELO_VOZ };
export const VOZ_PADRAO = "nova"; // escolhida pelo Roberto em 05/10, depois de ouvir 6 amostras
const VOZES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);
// Versão C, a que o Roberto aprovou (05/10) entre amostras A/B/C. Troca sem deploy gravando outro texto
// em agency_settings.voz_avisos_instrucoes. Mudar o texto muda a chave do cache (gera de novo).
export const INSTRUCOES_PADRAO =
  "Você é a assistente da Lone Mídia, uma agência de marketing do Rio de Janeiro. Fale em português do Brasil " +
  "com sotaque carioca leve e natural, como numa mensagem de voz de WhatsApp para um colega de trabalho: " +
  "próxima, tranquila e segura, sem tom de locutora de rádio nem de robô. Faça pausas curtas entre as frases. " +
  "Dê uma ênfase leve nos números e no nome do cliente. Termine a última frase com entonação de sugestão, não de ordem.";
export const TEXTO_MAX = 300;

async function vozEscolhida(): Promise<{ voz: string; instrucoes: string }> {
  const { data } = await supabaseAdmin.from("agency_settings").select("key, value").in("key", ["voz_avisos", "voz_avisos_instrucoes"]);
  const val = (k: string) => String((data ?? []).find((r) => r.key === k)?.value ?? "").trim();
  const v = val("voz_avisos").toLowerCase();
  const i = val("voz_avisos_instrucoes");
  return { voz: VOZES.has(v) ? v : VOZ_PADRAO, instrucoes: i.length >= 20 ? i : INSTRUCOES_PADRAO };
}

/** A API em tempo real (WebSocket) e não o /v1/audio/speech? Os gpt-realtime-* só funcionam lá. */
export function vozPorTempoReal(modelo: string): boolean {
  return modelo.startsWith("gpt-realtime");
}

/** Gera o áudio (mp3 pelo /v1/audio/speech, WAV pela API em tempo real) e registra em llm_calls. null = não deu. */
async function gerarAudio(p: { frase: string; voz: string; instrucoes: string; modelo: string; key: string }): Promise<Buffer | null> {
  if (vozPorTempoReal(p.modelo)) {
    const r = await falarPorTempoReal(p); // registra em llm_calls lá dentro
    if (!r.ok) console.error("[avisos/audio] tempo real:", r.erro);
    return r.ok ? r.wav : null;
  }
  const inicio = Date.now();
  const ctl = new AbortController();
  const tempo = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: p.modelo, voice: p.voz, input: p.frase, instructions: p.instrucoes, response_format: "mp3" }),
    });
    if (!res.ok) {
      const erro = (await res.text().catch(() => "")).slice(0, 200);
      registrarChamadaLlm({ modelo: p.modelo, ms: Date.now() - inicio, ok: false, erro: `HTTP ${res.status} ${erro}`, origem: "avisos:voz", tipo: "tts" });
      return null;
    }
    const mp3 = Buffer.from(await res.arrayBuffer());
    registrarChamadaLlm({ modelo: p.modelo, ms: Date.now() - inicio, ok: true, origem: "avisos:voz", tipo: "tts" });
    return mp3;
  } catch (e) {
    registrarChamadaLlm({ modelo: p.modelo, ms: Date.now() - inicio, ok: false, erro: e instanceof Error ? e.message : String(e), origem: "avisos:voz", tipo: "tts" });
    return null;
  } finally {
    clearTimeout(tempo);
  }
}

/** Áudio da frase, do cache ou gerado agora (mp3 no modelo atual, WAV no de tempo real). null = não deu. */
export async function audioDoAviso(texto: string): Promise<Buffer | null> {
  const frase = texto.trim().slice(0, TEXTO_MAX);
  if (!frase) return null;
  const { voz, instrucoes } = await vozEscolhida();
  // O modelo entra na chave: trocar de modelo gera de novo (o cache antigo, em mp3, fica para o modelo antigo).
  const chave = createHash("sha256").update(`${MODELO_VOZ}|${voz}|${instrucoes}|${frase}`).digest("hex");

  const { data: cache } = await supabaseAdmin.from("avisos_audio").select("mp3_base64").eq("chave", chave).maybeSingle();
  if (cache?.mp3_base64) return Buffer.from(cache.mp3_base64 as string, "base64");

  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const audio = await gerarAudio({ frase, voz, instrucoes, modelo: MODELO_VOZ, key });
  if (!audio) return null;
  // A coluna se chama mp3_base64 por história; guarda WAV também (tipoDoAudio lê o cabeçalho).
  const { error } = await supabaseAdmin.from("avisos_audio").upsert({ chave, voz, texto: frase, mp3_base64: audio.toString("base64") });
  if (error) console.error("[avisos/audio] cache:", error.message);
  return audio;
}

/** Só para ouvir antes de trocar: gera pela API em tempo real, sem cache. */
export async function amostraTempoReal(texto: string, vozPedida?: string): Promise<Buffer | null> {
  const frase = texto.trim().slice(0, TEXTO_MAX);
  const key = process.env.OPENAI_API_KEY;
  if (!frase || !key) return null;
  const { voz, instrucoes } = await vozEscolhida();
  return gerarAudio({ frase, voz: vozPedida ?? voz, instrucoes, modelo: MODELO_VOZ_TEMPO_REAL, key });
}
