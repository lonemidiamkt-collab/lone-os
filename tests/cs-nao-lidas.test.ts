// tests/cs-nao-lidas.test.ts — mensagem de cliente que a IA não leu não se perde (auditoria
// 21/10/2026, 5.10).
//
// O erro original: a classificação falhava, o inbound respondia "ok, classified:false" e, como o
// message_id já estava reclamado, ninguém nunca mais lia a mensagem. Agora ela vai para a fila,
// a rotina cs-nao-lidas a relê pelo mesmo inbound e o time é avisado quando um grupo fica sem leitura.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AVISAR_APOS_MIN, DESISTIR_H, LOTE, gruposParaAvisar, lerResultadoReleitura, noHorarioDeAviso,
  notaLeituraAtrasada, payloadDaReleitura, planejarReleitura, textoAvisoNaoLidas, textoDesistencia, type NaoLida,
} from "@/lib/cs/nao-lidas";
import { parseUpsert } from "@/lib/cs/ingest";
import { automacaoPorId } from "@/lib/automacoes/registro";

const RAIZ = path.resolve(__dirname, "..");
// 15h em São Paulo (18h UTC), quarta.
const AGORA = new Date("2026-10-21T18:00:00Z");
const minAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString();
const msg = (p: Partial<NaoLida> & { message_id: string }): NaoLida => ({
  group_jid: "padaria@g.us", client_id: "k1", cliente_nome: "Padaria", author_jid: "5522999990000@s.whatsapp.net",
  author_name: "João", texto: "Faz um post da promoção de pão pra sexta?", recebida_em: minAtras(40),
  erro: "insufficient_quota", tentativas: 1, status: "pendente", ultima_tentativa_em: null, avisado_em: null, ...p,
});

describe("o que a rodada relê", () => {
  it("as mais antigas primeiro, no máximo um lote", () => {
    const fila = Array.from({ length: LOTE + 3 }, (_, i) => msg({ message_id: `m${i}`, recebida_em: minAtras(100 - i) }));
    const { tentar, expirar } = planejarReleitura(fila, AGORA);
    expect(tentar).toHaveLength(LOTE);
    expect(tentar[0].message_id).toBe("m0");
    expect(expirar).toHaveLength(0);
  });

  it(`depois de ${DESISTIR_H}h desiste (e o time é avisado para ler à mão)`, () => {
    const velha = msg({ message_id: "velha", recebida_em: minAtras(DESISTIR_H * 60 + 1) });
    const { tentar, expirar } = planejarReleitura([velha, msg({ message_id: "nova" })], AGORA);
    expect(expirar.map((m) => m.message_id)).toEqual(["velha"]);
    expect(tentar.map((m) => m.message_id)).toEqual(["nova"]);
  });

  it("'lendo' de uma rodada que caiu no meio volta; 'lendo' recente (outra rodada em curso) não", () => {
    const travada = msg({ message_id: "t", status: "lendo", ultima_tentativa_em: minAtras(30) });
    const emCurso = msg({ message_id: "c", status: "lendo", ultima_tentativa_em: minAtras(2) });
    expect(planejarReleitura([travada, emCurso], AGORA).tentar.map((m) => m.message_id)).toEqual(["t"]);
  });
});

describe("a releitura passa pelo mesmo inbound", () => {
  it("o payload é lido pelo inbound como a mesma mensagem, do mesmo autor, no mesmo grupo", () => {
    const m = msg({ message_id: "ABC123" });
    const n = parseUpsert(payloadDaReleitura(m));
    expect(n).toMatchObject({ groupJid: "padaria@g.us", messageId: "ABC123", text: m.texto, authorName: "João", fromMe: false });
    expect(n?.authorJid).toBe("5522999990000@s.whatsapp.net");
    expect(n?.timestamp).toBe(Math.floor(Date.parse(m.recebida_em) / 1000));
  });

  it("só 'a IA falhou de novo' ou erro do servidor mantém na fila; o resto é leitura feita", () => {
    expect(lerResultadoReleitura(200, { ok: true, classified: false, reason: "A1 falhou" })).toEqual({ lida: false, motivo: "A1 falhou" });
    expect(lerResultadoReleitura(500, { ok: false, error: "x" }).lida).toBe(false);
    expect(lerResultadoReleitura(0, { ok: false, error: "fetch failed" }).lida).toBe(false);
    expect(lerResultadoReleitura(200, { ok: true, classified: true, sugeridas: ["arte_nova"] })).toEqual({ lida: true, motivo: "1 sugestão(ões)" });
    expect(lerResultadoReleitura(200, { ok: true, skip: "trivial" }).lida).toBe(true);
    expect(lerResultadoReleitura(200, { ok: true, coalesced: "ab12" }).lida).toBe(true);
  });

  it("a sugestão que nasce da releitura diz que é leitura atrasada e de quando", () => {
    const seg = Math.floor(Date.parse("2026-10-21T13:05:00Z") / 1000); // 10:05 em SP
    expect(notaLeituraAtrasada(seg, AGORA)).toMatch(/10:05/);
    expect(notaLeituraAtrasada(null, AGORA)).toMatch(/não tinha conseguido ler/);
  });
});

describe("o aviso ao time", () => {
  it(`grupo com mensagem esperando há ${AVISAR_APOS_MIN} min ou mais: avisa, uma vez`, () => {
    const g = gruposParaAvisar([msg({ message_id: "a" }), msg({ message_id: "b", recebida_em: minAtras(5) })], AGORA);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ groupJid: "padaria@g.us", cliente: "Padaria" });
    expect(g[0].mensagens.map((m) => m.message_id)).toEqual(["a", "b"]);
  });

  it("falha de minutos não vira ruído", () => {
    expect(gruposParaAvisar([msg({ message_id: "a", recebida_em: minAtras(10) })], AGORA)).toEqual([]);
  });

  it("já avisado há pouco: não repete; depois de 6h, repete", () => {
    expect(gruposParaAvisar([msg({ message_id: "a", avisado_em: minAtras(60) })], AGORA)).toEqual([]);
    expect(gruposParaAvisar([msg({ message_id: "a", avisado_em: minAtras(7 * 60) })], AGORA)).toHaveLength(1);
  });

  it("fora do expediente (SP) ninguém é acordado — o aviso sai de manhã", () => {
    const madrugada = new Date("2026-10-21T06:00:00Z"); // 3h em SP
    expect(noHorarioDeAviso(madrugada)).toBe(false);
    expect(noHorarioDeAviso(AGORA)).toBe(true);
    expect(gruposParaAvisar([msg({ message_id: "a", recebida_em: new Date(madrugada.getTime() - 3600_000).toISOString() })], madrugada)).toEqual([]);
  });

  it("o texto diz quais grupos, desde quando, o erro e o que fazer", () => {
    const t = textoAvisoNaoLidas(gruposParaAvisar([msg({ message_id: "a" })], AGORA), "insufficient_quota", AGORA);
    expect(t).toContain("*Padaria*");
    expect(t).toContain("14:20"); // 40 min antes das 15h em SP
    expect(t).toContain("insufficient_quota");
    expect(t).toMatch(/dá uma olhada nesses grupos/);
  });

  it("a desistência pede pra ler à mão", () => {
    expect(textoDesistencia([msg({ message_id: "a" })], AGORA)).toMatch(/cria o card à mão/);
  });
});

describe("a decisão no inbound e o agendamento", () => {
  const inbound = readFileSync(path.join(RAIZ, "app/api/cs/inbound/route.ts"), "utf8");

  it("o erro original: a falha do A1 guarda a mensagem em vez de responder só 'classified:false'", () => {
    expect(inbound).toContain('return naoLeu(`A1 falhou');
    expect(inbound).toContain("guardarNaoLida(");
    expect(inbound).not.toMatch(/console\.error\("\[CS\/inbound\] A1 falhou:", res\.error\);\s*return NextResponse\.json\(\{ ok: true, classified: false/);
  });

  it("a releitura não fala com o cliente nem repete o que já aconteceu", () => {
    expect(inbound).toContain('req.headers.get("x-cs-releitura") === "1"');
    expect(inbound).toMatch(/if \(msg\.messageId && !releitura\) \{\s*const \{ error: claimErr \}/);
    expect(inbound).toContain("if (c?.id && msg.text && !releitura)");
  });

  it("a rotina está na Central de Automações, a cada 15 min, com ensaio", () => {
    const a = automacaoPorId("cs-nao-lidas");
    expect(a).toMatchObject({ cron: "*/15 * * * *", ensaio: "dry=1", enviaParaCliente: false });
  });
});
