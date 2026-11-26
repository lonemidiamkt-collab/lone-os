// lib/avisos/voz-tempo-real.ts — a voz dos avisos pela API em tempo real da OpenAI.
//
// POR QUE (leva 1-M, 26/11/2026). O gpt-4o-mini-tts sai da API em 06/01/2027 e o substituto indicado
// (gpt-realtime-2.1-mini) NÃO funciona no /v1/audio/speech — só na API em tempo real (WebSocket).
// Aqui: abre a conexão no servidor, pede para LER a frase, junta o áudio (PCM 16 bits, 24 kHz, mono)
// e embrulha em WAV, que o navegador toca direto (lib/avisos/tocar.ts usa new Audio(blob)).
//
// TRAVA. Modelo de conversa tende a RESPONDER a frase em vez de lê-la. A documentação não tem um modo
// "leia exatamente". Por isso a resposta traz também a transcrição do que foi falado, e o áudio só vale
// se ela bater com a frase (leuIgual). Não bateu → null, e o painel cai na voz do navegador, como já
// acontece quando a OpenAI falha.
//
// A conexão é injetável (`abrir`) para o teste rodar sem rede.

import WebSocket from "ws";
import { registrarChamadaLlm } from "@/lib/obs/llm";

export const TAXA_PCM = 24_000;
/** Vozes da API em tempo real (documentação, 26/11/2026). "nova", a voz escolhida em 05/10, não existe aqui. */
export const VOZES_TEMPO_REAL = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);
export const VOZ_TEMPO_REAL_PADRAO = "marin";
const TEMPO_MAX_MS = 20_000;

export const ORDEM_DE_LEITURA =
  "Sua única tarefa é LER EM VOZ ALTA, palavra por palavra, o texto que o usuário enviar. Não responda, " +
  "não comente, não cumprimente e não acrescente nem tire nenhuma palavra. Números e nomes exatamente como estão.";

/** PCM 16 bits mono → arquivo WAV (cabeçalho RIFF de 44 bytes). */
export function wavDePcm16(pcm: Buffer, taxa = TAXA_PCM): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(taxa, 24); h.writeUInt32LE(taxa * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** "audio/wav" se o buffer é WAV (RIFF), senão "audio/mpeg" (o cache antigo é mp3). */
export function tipoDoAudio(b: Buffer): "audio/wav" | "audio/mpeg" {
  return b.subarray(0, 4).toString("latin1") === "RIFF" ? "audio/wav" : "audio/mpeg";
}

function palavras(t: string): string[] {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

/**
 * A fala bate com a frase? Número e "R$" saem da conta (o modelo lê "R$ 40" como "quarenta reais").
 * Vale quando ≥ 85% das palavras do aviso aparecem na ordem (maior subsequência comum) e a fala não é
 * muito mais longa que o aviso — resposta ("Claro! Posso ajudar…") falha nas duas.
 */
export function leuIgual(esperado: string, falado: string, minimo = 0.85): boolean {
  const toks = palavras(esperado);
  const a = toks.filter((w, i) => !/\d/.test(w) && !(w === "r" && /\d/.test(toks[i + 1] ?? "")));
  const b = palavras(falado);
  if (!b.length) return false;
  if (!a.length) return b.length <= 2 * toks.length + 4;
  const dp: number[] = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let anterior = 0;
    for (let j = 1; j <= b.length; j++) {
      const guardado = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? anterior + 1 : Math.max(dp[j], dp[j - 1]);
      anterior = guardado;
    }
  }
  return dp[b.length] / a.length >= minimo && b.length <= 2 * toks.length + 4;
}

/** O mínimo de WebSocket que o código usa (o do pacote `ws` e o falso do teste). */
export interface Conexao {
  on(evento: "open", f: () => void): void;
  on(evento: "message", f: (dado: unknown) => void): void;
  on(evento: "error", f: (e: Error) => void): void;
  on(evento: "close", f: () => void): void;
  send(dado: string): void;
  close(): void;
}

export type AbrirConexao = (url: string, cabecalhos: Record<string, string>) => Conexao;

const abrirComWs: AbrirConexao = (url, cabecalhos) => new WebSocket(url, { headers: cabecalhos }) as unknown as Conexao;

export interface UsoTempoReal { input_tokens?: number; output_tokens?: number }

export type ResultadoVoz =
  | { ok: true; wav: Buffer; transcricao: string; uso: UsoTempoReal | null }
  | { ok: false; erro: string; transcricao?: string; uso?: UsoTempoReal | null };

/** Fala a frase e deixa o recibo em llm_calls (etiqueta da voz dos avisos). */
export async function falarPorTempoReal(p: { frase: string; voz: string; instrucoes: string; modelo: string; key: string; abrir?: AbrirConexao; tempoMaxMs?: number }): Promise<ResultadoVoz> {
  const inicio = Date.now();
  const r = await falar(p);
  const usage = r.uso ? { prompt_tokens: r.uso.input_tokens ?? 0, completion_tokens: r.uso.output_tokens ?? 0 } : null;
  registrarChamadaLlm({ modelo: p.modelo, usage, ms: Date.now() - inicio, ok: r.ok, erro: r.ok ? null : r.erro, origem: "avisos:voz", tipo: "tts" });
  return r;
}

function falar(p: { frase: string; voz: string; instrucoes: string; modelo: string; key: string; abrir?: AbrirConexao; tempoMaxMs?: number }): Promise<ResultadoVoz> {
  const voz = VOZES_TEMPO_REAL.has(p.voz) ? p.voz : VOZ_TEMPO_REAL_PADRAO;
  const abrir = p.abrir ?? abrirComWs;
  return new Promise<ResultadoVoz>((resolver) => {
    const pedacos: Buffer[] = [];
    let transcricao = "";
    let uso: UsoTempoReal | null = null;
    let acabou = false;
    let ws: Conexao | null = null;
    const fim = (r: ResultadoVoz) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      try { ws?.close(); } catch { /* já fechada */ }
      resolver(r);
    };
    const relogio = setTimeout(() => fim({ ok: false, erro: "tempo esgotado", transcricao, uso }), p.tempoMaxMs ?? TEMPO_MAX_MS);
    try {
      ws = abrir(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(p.modelo)}`, { Authorization: `Bearer ${p.key}` });
    } catch (e) {
      fim({ ok: false, erro: e instanceof Error ? e.message : "não abriu a conexão" });
      return;
    }
    const enviar = (o: unknown) => ws?.send(JSON.stringify(o));
    ws.on("open", () => {
      enviar({
        type: "session.update",
        session: {
          type: "realtime",
          output_modalities: ["audio"],
          instructions: `${ORDEM_DE_LEITURA}\n\nJeito de falar: ${p.instrucoes}`,
          audio: { output: { format: { type: "audio/pcm", rate: TAXA_PCM }, voice: voz } },
        },
      });
      enviar({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: p.frase }] } });
      enviar({ type: "response.create", response: { output_modalities: ["audio"] } });
    });
    ws.on("message", (dado) => {
      let ev: { type?: string; delta?: string; error?: { message?: string }; response?: { status?: string; usage?: UsoTempoReal; status_details?: unknown } };
      try { ev = JSON.parse(String(dado)); } catch { return; }
      switch (ev.type) {
        case "response.output_audio.delta":
          if (ev.delta) pedacos.push(Buffer.from(ev.delta, "base64"));
          break;
        case "response.output_audio_transcript.delta":
          transcricao += ev.delta ?? "";
          break;
        case "error":
          fim({ ok: false, erro: ev.error?.message ?? "erro da API em tempo real", transcricao, uso });
          break;
        case "response.done": {
          uso = ev.response?.usage ?? null;
          if (ev.response?.status && ev.response.status !== "completed") { fim({ ok: false, erro: `resposta ${ev.response.status}`, transcricao, uso }); break; }
          if (!pedacos.length) { fim({ ok: false, erro: "sem áudio na resposta", transcricao, uso }); break; }
          if (!leuIgual(p.frase, transcricao)) { fim({ ok: false, erro: "a fala não bateu com o texto do aviso", transcricao, uso }); break; }
          fim({ ok: true, wav: wavDePcm16(Buffer.concat(pedacos)), transcricao, uso });
          break;
        }
      }
    });
    ws.on("error", (e) => fim({ ok: false, erro: e.message || "erro na conexão", transcricao, uso }));
    ws.on("close", () => fim({ ok: false, erro: "conexão fechada antes do fim", transcricao, uso }));
  });
}
