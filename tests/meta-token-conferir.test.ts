// @vitest-environment node
// Conferência do token da Meta (auditoria 21/10/2026, item 5.14). Dados INVENTADOS.
//
// O QUE ACONTECIA: a rotina só olhava a data gravada e respondia `ok: true` com token vencido ("Token sem data de
// expiração registrada", "Token OK" com a Meta recusando). Agora faz uma chamada real à Graph e decide aqui.
import { describe, it, expect } from "vitest";
import { avaliarToken, perguntarAGraph } from "@/lib/meta/conferir-token";

const agoraMs = Date.parse("2026-10-24T12:00:00Z");
const dia = 86_400_000;
const graphOk = { tipo: "valido" as const };

describe("avaliarToken", () => {
  it("o erro original: data no passado respondia ok — agora ok:false, crítico e aviso urgente", () => {
    const a = avaliarToken({ temToken: true, expiraEmMs: agoraMs - 3 * dia, graph: graphOk, agoraMs });
    expect(a).toMatchObject({ ok: false, critico: true, avisar: true, prioridade: "urgent" });
    expect(a.motivo).toMatch(/venceu há 3 dias/);
  });
  it("o erro original: sem data registrada respondia ok sem conferir — agora a Meta decide", () => {
    expect(avaliarToken({ temToken: true, expiraEmMs: null, graph: { tipo: "invalido", motivo: "Session has expired (código 190)" }, agoraMs }))
      .toMatchObject({ ok: false, critico: true });
    expect(avaliarToken({ temToken: true, expiraEmMs: null, graph: graphOk, agoraMs })).toMatchObject({ ok: true, critico: false, avisar: false });
  });
  it("não deu para conferir (Meta fora) não é ok, mas não liga o banner à toa", () => {
    expect(avaliarToken({ temToken: true, expiraEmMs: agoraMs + 40 * dia, graph: { tipo: "sem_resposta", motivo: "timeout" }, agoraMs }))
      .toMatchObject({ ok: false, critico: false, avisar: false });
  });
  it("funcionando e perto de vencer: ok com aviso", () => {
    expect(avaliarToken({ temToken: true, expiraEmMs: agoraMs + 5 * dia + 1000, graph: graphOk, agoraMs }))
      .toMatchObject({ ok: true, avisar: true, prioridade: "urgent", titulo: "Token Meta expira em 5 dias" });
  });
  it("sem token: ok:false", () => {
    expect(avaliarToken({ temToken: false, expiraEmMs: null, graph: null, agoraMs }).ok).toBe(false);
  });
});

describe("perguntarAGraph (uma chamada real, aqui com fetch falso)", () => {
  const responde = (status: number, corpo: unknown) => (async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;
  it("200 com id = válido", async () => {
    expect(await perguntarAGraph("tok", responde(200, { id: "123" }))).toEqual({ tipo: "valido" });
  });
  it("código 190 = inválido (vencido/revogado)", async () => {
    const r = await perguntarAGraph("tok", responde(400, { error: { message: "Error validating access token", code: 190, error_subcode: 463 } }));
    expect(r).toEqual({ tipo: "invalido", motivo: "Error validating access token (código 190/463)" });
  });
  it("limite de chamadas ou rede = não conferido (não acusa o token)", async () => {
    expect((await perguntarAGraph("tok", responde(400, { error: { message: "rate limit", code: 4 } }))).tipo).toBe("sem_resposta");
    const caiu = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    expect(await perguntarAGraph("tok", caiu)).toEqual({ tipo: "sem_resposta", motivo: "ECONNRESET" });
  });
});
