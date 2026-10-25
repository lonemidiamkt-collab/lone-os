// tests/cs-audio-nao-lido.test.ts — áudio de cliente que eu não consegui ouvir não some (auditoria
// 25/10/2026, 11.1).
//
// O erro original: Whisper sem crédito, mídia que não baixava, IA desligada ou áudio de mais de ~6 MB
// devolviam "ok, skip". A mensagem já estava reservada, então nunca mais era lida; o onboarding
// respondido por áudio ficava parado no mesmo passo, sem ninguém saber.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  deveResponderAudioDoTime, midiaParaGuardar, passoOnboardingDaReleitura, rotuloMotivoAudio, tentarDeNovo,
  textoAudioDoTime, textoOnboardingAudio, RESPOSTA_AUDIO_TIME_MIN,
} from "@/lib/cs/audio-nao-lido";
import {
  gruposParaAvisar, lerResultadoReleitura, payloadDaReleitura, planejarReleitura, textoAvisoNaoLidas, textoDesistencia,
  type NaoLida,
} from "@/lib/cs/nao-lidas";
import { parseUpsert } from "@/lib/cs/ingest";

const RAIZ = path.resolve(__dirname, "..");
const AGORA = new Date("2026-10-21T18:00:00Z"); // 15h em SP
const MADRUGADA = new Date("2026-10-21T06:00:00Z"); // 3h em SP
const minAtras = (m: number, base = AGORA) => new Date(base.getTime() - m * 60_000).toISOString();

const KEY = { remoteJid: "padaria@g.us", fromMe: false, id: "AUD1", participant: "5522999990000@s.whatsapp.net" };
const AUDIO_MSG = { audioMessage: { url: "https://mmg.whatsapp.net/x", mimetype: "audio/ogg; codecs=opus", seconds: 12, ptt: true } };

const audio = (p: Partial<NaoLida> & { message_id: string }): NaoLida => ({
  group_jid: "padaria@g.us", client_id: "k1", cliente_nome: "Padaria", author_jid: KEY.participant,
  author_name: "João", texto: "", recebida_em: minAtras(40), erro: "a transcrição falhou: OpenAI sem crédito",
  tentativas: 0, status: "pendente", ultima_tentativa_em: null, avisado_em: null,
  tipo: "audio", midia: { key: { ...KEY, id: p.message_id }, message: AUDIO_MSG }, ...p,
});

describe("por que não ouvi", () => {
  it("diz a causa conhecida (crédito acabou) em vez do JSON da OpenAI", () => {
    expect(rotuloMotivoAudio("transcricao", "HTTP 429: {\"error\":{\"code\":\"insufficient_quota\"}}")).toBe("a transcrição falhou: OpenAI sem crédito");
    expect(rotuloMotivoAudio("transcricao", "HTTP 500")).toBe("a transcrição falhou");
    expect(rotuloMotivoAudio("midia", "HTTP 404")).toMatch(/baixar o áudio/);
    expect(rotuloMotivoAudio("ia_desligada")).toMatch(/IA está desligada/);
    expect(rotuloMotivoAudio("grande", "9 MB")).toMatch(/longo demais.*9 MB/);
  });

  it("áudio longo demais não melhora tentando de novo; o resto, sim", () => {
    expect(tentarDeNovo("grande")).toBe(false);
    expect(tentarDeNovo("transcricao")).toBe(true);
    expect(tentarDeNovo("midia")).toBe(true);
    expect(tentarDeNovo("ia_desligada")).toBe(true);
  });
});

describe("a releitura manda o ÁUDIO original de volta pelo inbound", () => {
  it("o inbound lê como a mesma nota de voz, do mesmo autor, no mesmo grupo", () => {
    const m = audio({ message_id: "AUD1" });
    const n = parseUpsert(payloadDaReleitura(m));
    expect(n).toMatchObject({ groupJid: "padaria@g.us", messageId: "AUD1", isAudio: true, text: "", fromMe: false });
    expect(n?.authorJid).toBe(KEY.participant);
  });

  it("o que a fila guarda é o key + message que a Evolution mandou (é com eles que baixa de novo)", () => {
    expect(midiaParaGuardar({ key: KEY, message: AUDIO_MSG })).toEqual({ key: KEY, message: AUDIO_MSG });
    expect(midiaParaGuardar({ key: KEY, message: AUDIO_MSG }, 3)).toEqual({ key: KEY, message: AUDIO_MSG, onboardingPasso: 3 });
  });

  it("resposta de onboarding leva o passo junto — o inbound só aplica se a sessão ainda estiver nele", () => {
    const m = audio({ message_id: "AUD2", midia: { key: KEY, message: AUDIO_MSG, onboardingPasso: 2 } });
    expect(passoOnboardingDaReleitura(payloadDaReleitura(m))).toBe(2);
    expect(passoOnboardingDaReleitura(payloadDaReleitura(audio({ message_id: "AUD3" })))).toBeNull();
    expect(passoOnboardingDaReleitura({ cs: { onboardingPasso: "2" } })).toBeNull();
  });

  it("áudio de onboarding só é relido no expediente: ouvido, a próxima pergunta vai ao cliente", () => {
    const onb = audio({ message_id: "ONB", recebida_em: minAtras(60, MADRUGADA), midia: { key: KEY, message: AUDIO_MSG, onboardingPasso: 1 } });
    const comum = audio({ message_id: "COMUM", recebida_em: minAtras(50, MADRUGADA) });
    expect(planejarReleitura([onb, comum], MADRUGADA).tentar.map((m) => m.message_id)).toEqual(["COMUM"]);
    expect(planejarReleitura([{ ...onb, recebida_em: minAtras(60) }], AGORA).tentar.map((m) => m.message_id)).toEqual(["ONB"]);
  });

  it("áudio que não baixa é problema DESTA mensagem: a rodada segue para as outras", () => {
    expect(lerResultadoReleitura(200, { ok: true, classified: false, reason: "áudio: não consegui baixar", soEsta: true }))
      .toEqual({ lida: false, motivo: "áudio: não consegui baixar", soEsta: true });
    // A IA fora continua sendo disjuntor (sem soEsta).
    expect(lerResultadoReleitura(200, { ok: true, classified: false, reason: "áudio: sem crédito" })).toEqual({ lida: false, motivo: "áudio: sem crédito" });
    // Onboarding que já andou: leitura encerrada, sai da fila.
    expect(lerResultadoReleitura(200, { ok: true, skip: "onboarding já andou desde o áudio" }).lida).toBe(true);
  });
});

describe("o aviso ao time", () => {
  it("diz que é áudio e por que não ouvi (não um trecho vazio)", () => {
    const t = textoAvisoNaoLidas(gruposParaAvisar([audio({ message_id: "a" })], AGORA), null, AGORA);
    expect(t).toContain("*Padaria*");
    expect(t).toContain("🎤 áudio que eu não consegui ouvir");
    expect(t).toContain("OpenAI sem crédito");
    expect(t).toMatch(/ouve os áudios/);
    expect(t).not.toContain('_""_');
  });

  it("áudio longo demais vai direto para 'ouve no grupo'", () => {
    const t = textoDesistencia([audio({ message_id: "g", erro: "o áudio é longo demais pra eu transcrever (9 MB)", status: "expirada" })], AGORA);
    expect(t).toMatch(/Não consegui ouvir 1 áudio de cliente/);
    expect(t).toMatch(/Ouve\/lê no grupo/);
  });

  it("onboarding parado: o time sabe na hora, com o passo e o que fazer", () => {
    const t = textoOnboardingAudio({ cliente: "Padaria", passo: 2, total: 8, motivo: "transcricao", detalhe: "insufficient_quota", guardado: true });
    expect(t).toContain("*Padaria*");
    expect(t).toContain("pergunta 3 de 8");
    expect(t).toContain("parado nesse passo");
    expect(t).toMatch(/Tento ouvir de novo/);
    const semFila = textoOnboardingAudio({ cliente: "Padaria", passo: 0, total: 8, motivo: "grande", guardado: true });
    expect(semFila).toMatch(/pede pra mandar por escrito/);
    expect(semFila).not.toMatch(/Tento ouvir de novo/);
  });

  it("pedido do time por áudio: resposta na hora, no máximo uma a cada 30 min por grupo", () => {
    expect(textoAudioDoTime("transcricao", "insufficient_quota")).toMatch(/Não consegui ouvir.*OpenAI sem crédito.*por escrito/);
    const t0 = Date.parse("2026-10-21T18:00:00Z");
    expect(deveResponderAudioDoTime(undefined, t0)).toBe(true);
    expect(deveResponderAudioDoTime(t0, t0 + 5 * 60_000)).toBe(false);
    expect(deveResponderAudioDoTime(t0, t0 + RESPOSTA_AUDIO_TIME_MIN * 60_000)).toBe(true);
  });
});

describe("a decisão no inbound", () => {
  const inbound = readFileSync(path.join(RAIZ, "app/api/cs/inbound/route.ts"), "utf8");

  it("o erro original: áudio não ouvido não responde mais só 'skip'", () => {
    expect(inbound).not.toContain('skip: "áudio sem transcrição"');
    expect(inbound).not.toContain('skip: "áudio mas IA off"');
    expect(inbound).not.toContain('skip: "áudio muito longo"');
    expect(inbound).toMatch(/audio: \{ midia: midiaParaGuardar\(payload\.data\), desistir: !tentarDeNovo\(ouvido\.motivo\) \}/);
  });

  it("onboarding por áudio não trava calado: guarda com o passo e avisa o time na hora", () => {
    expect(inbound).toContain("midiaParaGuardar(payload.data, (sess.step as number) ?? 0)");
    expect(inbound).toContain("textoOnboardingAudio(");
    expect(inbound).toContain('onboarding: "audio_nao_ouvido"');
  });

  it("nem a fila guardou: o time é avisado, o áudio não some", () => {
    expect(inbound).toContain("textoAudioSemFila(");
  });
});
