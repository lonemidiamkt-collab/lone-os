// tests/alarmes-coleta.test.ts — a leitura da Meta dos alarmes e a releitura de quem falha no lote (26/10/2026).

import { describe, it, expect, vi, afterEach } from "vitest";
import { lerCampanhasPorDia, motivoDaMeta } from "@/lib/traffic/alarmes/coleta";

const linha = (data: string, gasto: string, conversas: string) => ({
  date_start: data, campaign_id: "c1", spend: gasto,
  actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: conversas }],
});
const ok = (rows: unknown[]) => ({ code: 200, body: JSON.stringify({ data: rows }) });
const erroMeta = (code: number, message: string, status = 400) => ({ code: status, body: JSON.stringify({ error: { code, message } }) });
const resposta = (status: number, corpo: unknown) =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });

const semEspera = async () => {};

afterEach(() => vi.unstubAllGlobals());

describe("releitura das contas que o lote não devolveu", () => {
  it("conta que falhou no lote é pedida sozinha; a que volta entra, a que não volta sai com o motivo", async () => {
    const chamadas: string[] = [];
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        chamadas.push("lote");
        return resposta(200, [
          ok([linha("2026-10-26", "40.5", "3")]),
          erroMeta(17, "User request limit reached"),
          { code: 500, body: "{}" },
        ]);
      }
      const conta = /\/(act_\d+)\/insights/.exec(url)?.[1];
      chamadas.push(conta ?? "?");
      if (conta === "act_2") return resposta(200, { data: [linha("2026-10-26", "12", "1")] });
      return resposta(400, { error: { code: 17, message: "User request limit reached" } });
    });
    vi.stubGlobal("fetch", fetchFalso);

    const r = await lerCampanhasPorDia("tok", ["act_1", "act_2", "act_3"], "2026-10-12", "2026-10-26", { esperar: semEspera });

    expect([...r.porConta.keys()].sort()).toEqual(["act_1", "act_2"]);
    expect(r.porConta.get("act_2")).toEqual([{ data: "2026-10-26", campanhaId: "c1", gasto: 12, conversas: 1 }]);
    expect(r.falhas.get("act_3")).toBe("Meta 17: User request limit reached");
    expect(r.falhas.has("act_2")).toBe(false);
    // act_2 voltou na 1ª releitura; act_3 tentou as duas vezes; act_1 nunca foi relida.
    expect(chamadas).toEqual(["lote", "act_2", "act_3", "act_3"]);
  });

  it("lote inteiro recusado: todas as contas são relidas uma a uma", async () => {
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return resposta(500, { error: { code: 2, message: "Service temporarily unavailable" } });
      return resposta(200, { data: [linha("2026-10-26", "10", "2")] });
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await lerCampanhasPorDia("tok", ["act_1", "act_2"], "2026-10-12", "2026-10-26", { esperar: semEspera });
    expect(r.porConta.size).toBe(2);
    expect(r.falhas.size).toBe(0);
  });

  it("espera antes de cada releitura (a segunda mais longa), nunca depois do sucesso", async () => {
    const esperas: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? resposta(200, [erroMeta(17, "limite")]) : resposta(400, { error: { code: 17, message: "limite" } })));
    await lerCampanhasPorDia("tok", ["act_9"], "2026-10-12", "2026-10-26", { esperar: async (ms) => { esperas.push(ms); } });
    expect(esperas).toEqual([2_000, 8_000]);
  });
});

describe("motivo da Meta", () => {
  it("usa o código e a mensagem do erro; sem JSON, diz o status", () => {
    expect(motivoDaMeta(400, JSON.stringify({ error: { code: 100, message: "Invalid parameter" } }))).toBe("Meta 100: Invalid parameter");
    expect(motivoDaMeta(502, "<html>bad gateway</html>")).toBe("Meta respondeu 502");
  });
});
