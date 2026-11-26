// @vitest-environment node
// tests/voz-tempo-real.test.ts — leva 1-M (26/11/2026). O gpt-4o-mini-tts sai em 06/01/2027 e o
// substituto só funciona na API em tempo real (WebSocket). Conexão falsa: nada vai para a rede.
//  · pede para LER (não responder), em PCM 24 kHz, e devolve WAV;
//  · se o modelo "responder" em vez de ler, o áudio é descartado (o painel usa a voz do navegador);
//  · erro, conexão caída e demora viram falha dita, nunca áudio pela metade.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/obs/llm", () => ({ registrarChamadaLlm: () => {} }));
import { falarPorTempoReal, leuIgual, tipoDoAudio, wavDePcm16, VOZ_TEMPO_REAL_PADRAO, type AbrirConexao, type Conexao } from "@/lib/avisos/voz-tempo-real";

const FRASE = "Loja Exemplo está com saldo de R$ 40 na conta de anúncio. Vale recarregar hoje.";

function conexaoFalsa(roteiro: (enviar: (ev: object) => void, fechar: () => void) => void) {
  const enviados: Record<string, unknown>[] = [];
  let url = "", cabecalhos: Record<string, string> = {};
  const abrir: AbrirConexao = (u, c) => {
    url = u; cabecalhos = c;
    const ouvintes: Record<string, ((x?: unknown) => void)[]> = {};
    const ws: Conexao = {
      on: (ev: string, f: (x?: unknown) => void) => { (ouvintes[ev] ??= []).push(f); },
      send: (d: string) => {
        const o = JSON.parse(d); enviados.push(o);
        if (o.type === "response.create") roteiro((e) => ouvintes.message?.forEach((f) => f(JSON.stringify(e))), () => ouvintes.close?.forEach((f) => f()));
      },
      close: () => {},
    } as Conexao;
    setTimeout(() => ouvintes.open?.forEach((f) => f()), 0);
    return ws;
  };
  return { abrir, enviados, get url() { return url; }, get cabecalhos() { return cabecalhos; } };
}

const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
const falaCerta = (enviar: (ev: object) => void) => {
  enviar({ type: "response.output_audio.delta", delta: pcm.subarray(0, 4).toString("base64") });
  enviar({ type: "response.output_audio.delta", delta: pcm.subarray(4).toString("base64") });
  enviar({ type: "response.output_audio_transcript.delta", delta: "Loja Exemplo está com saldo de quarenta reais " });
  enviar({ type: "response.output_audio_transcript.delta", delta: "na conta de anúncio. Vale recarregar hoje." });
  enviar({ type: "response.done", response: { status: "completed", usage: { input_tokens: 120, output_tokens: 400 } } });
};

describe("voz pela API em tempo real", () => {
  it("pede leitura em áudio PCM 24 kHz, com a voz e a chave certas, e devolve WAV", async () => {
    const c = conexaoFalsa(falaCerta);
    const r = await falarPorTempoReal({ frase: FRASE, voz: "nova", instrucoes: "tom tranquilo", modelo: "gpt-realtime-2.1-mini", key: "sk-teste", abrir: c.abrir });
    expect(c.url).toBe("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini");
    expect(c.cabecalhos).toEqual({ Authorization: "Bearer sk-teste" });
    expect(c.enviados.map((e) => e.type)).toEqual(["session.update", "conversation.item.create", "response.create"]);
    const sessao = c.enviados[0].session as { output_modalities: string[]; instructions: string; audio: { output: { format: unknown; voice: string } } };
    expect(sessao.output_modalities).toEqual(["audio"]);
    expect(sessao.audio.output).toEqual({ format: { type: "audio/pcm", rate: 24000 }, voice: VOZ_TEMPO_REAL_PADRAO }); // "nova" não existe aqui
    expect(sessao.instructions).toMatch(/LER EM VOZ ALTA, palavra por palavra/);
    expect(sessao.instructions).toContain("tom tranquilo");
    expect(JSON.stringify(c.enviados[1])).toContain(JSON.stringify(FRASE).slice(1, -1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(tipoDoAudio(r.wav)).toBe("audio/wav");
    expect(r.wav.subarray(44)).toEqual(pcm);
    expect(r.wav.readUInt32LE(24)).toBe(24000);
    expect(r.uso).toEqual({ input_tokens: 120, output_tokens: 400 });
  });

  it("modelo que RESPONDE em vez de ler: áudio descartado", async () => {
    const c = conexaoFalsa((enviar) => {
      enviar({ type: "response.output_audio.delta", delta: pcm.toString("base64") });
      enviar({ type: "response.output_audio_transcript.delta", delta: "Claro! Posso ajudar a recarregar o saldo da conta. Quer que eu veja agora?" });
      enviar({ type: "response.done", response: { status: "completed" } });
    });
    const r = await falarPorTempoReal({ frase: FRASE, voz: "marin", instrucoes: "", modelo: "gpt-realtime-2.1-mini", key: "k", abrir: c.abrir });
    expect(r).toMatchObject({ ok: false, erro: "a fala não bateu com o texto do aviso" });
  });

  it("erro da API, resposta incompleta, conexão caída e demora viram falha", async () => {
    const casos: [Parameters<typeof conexaoFalsa>[0], RegExp][] = [
      [(e) => e({ type: "error", error: { message: "invalid_api_key" } }), /invalid_api_key/],
      [(e) => e({ type: "response.done", response: { status: "incomplete" } }), /incomplete/],
      [(e) => e({ type: "response.done", response: { status: "completed" } }), /sem áudio/],
      [(_e, fechar) => fechar(), /fechada antes do fim/],
      [() => {}, /tempo esgotado/],
    ];
    for (const [roteiro, erro] of casos) {
      const r = await falarPorTempoReal({ frase: FRASE, voz: "marin", instrucoes: "", modelo: "m", key: "k", abrir: conexaoFalsa(roteiro).abrir, tempoMaxMs: 50 });
      expect(r.ok, String(erro)).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(erro);
    }
  });

  it("comparação da fala tolera número por extenso e pontuação, não tolera resposta", () => {
    expect(leuIgual("Saldo de R$ 40 hoje.", "saldo de quarenta reais hoje")).toBe(true);
    expect(leuIgual("Gastou R$ 1.234,56 em 3 dias.", "gastou mil duzentos e trinta e quatro reais e cinquenta e seis centavos em tres dias")).toBe(true);
    expect(leuIgual("Saldo de R$ 40 hoje.", "Oi! Tudo bem? O saldo está baixo, quer que eu recarregue a conta para você agora mesmo hoje?")).toBe(false);
    expect(leuIgual("Pausar o anúncio de inverno.", "Ativar o anúncio de verão.")).toBe(false);
    expect(leuIgual(FRASE, "Loja Exemplo está com saldo de R$ 40 na conta de anúncio, vale recarregar hoje")).toBe(true);
    expect(leuIgual(FRASE, "")).toBe(false);
    expect(tipoDoAudio(Buffer.from("ID3abc"))).toBe("audio/mpeg");
    expect(wavDePcm16(Buffer.alloc(10)).length).toBe(54);
  });
});
