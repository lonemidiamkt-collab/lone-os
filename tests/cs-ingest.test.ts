// Testes OFFLINE do A0 (ingestão/filtro). Sem rede. Cobre parse do upsert da Evolution,
// extração de texto, filtro de trivial e detecção de autor da equipe Lone.

import { describe, it, expect } from "vitest";
import { parseUpsert, extractText, isTrivial, isLoneTeam, type EvolutionUpsert } from "@/lib/cs/ingest";

function upsert(over: Partial<EvolutionUpsert["data"]> = {}): EvolutionUpsert {
  return {
    event: "messages.upsert",
    instance: "monitor[IA]",
    data: {
      key: { remoteJid: "120363@g.us", fromMe: false, id: "ABC123", participant: "5522999@s.whatsapp.net" },
      pushName: "Cliente",
      message: { conversation: "preciso de arte pra amanhã" },
      messageTimestamp: 1700000000,
      ...over,
    },
  };
}

describe("extractText", () => {
  it("lê conversation, extendedTextMessage e caption", () => {
    expect(extractText({ conversation: "oi" })).toBe("oi");
    expect(extractText({ extendedTextMessage: { text: "olá" } })).toBe("olá");
    expect(extractText({ imageMessage: { caption: "muda essa foto" } })).toBe("muda essa foto");
    expect(extractText(null)).toBe("");
  });
});

describe("parseUpsert", () => {
  it("normaliza mensagem de grupo com texto", () => {
    const n = parseUpsert(upsert());
    expect(n).not.toBeNull();
    expect(n!.groupJid).toBe("120363@g.us");
    expect(n!.text).toBe("preciso de arte pra amanhã");
    expect(n!.messageId).toBe("ABC123");
    expect(n!.fromMe).toBe(false);
  });

  it("ignora não-grupo (DM), evento errado e mensagem sem texto", () => {
    expect(parseUpsert(upsert({ key: { remoteJid: "5522@s.whatsapp.net", id: "x" } }))).toBeNull();
    expect(parseUpsert({ event: "presence.update", data: {} })).toBeNull();
    expect(parseUpsert(upsert({ message: { imageMessage: {} } }))).toBeNull();
  });
});

describe("isTrivial", () => {
  it("corta saudação/ok/kkk/emoji", () => {
    for (const t of ["Bom dia", "ok", "blz!", "kkkk", "valeu", "👍"]) {
      expect(isTrivial(t)).toBe(true);
    }
  });
  it("NÃO corta pedido curto (conservador — recall)", () => {
    for (const t of ["muda a logo", "cadê a arte?", "preciso de post"]) {
      expect(isTrivial(t)).toBe(false);
    }
  });
});

describe("isLoneTeam", () => {
  it("reconhece número da equipe por sufixo/igualdade de dígitos", () => {
    const team = ["5522981712589", "5522988237830@s.whatsapp.net"];
    expect(isLoneTeam("5522981712589@s.whatsapp.net", team)).toBe(true);
    expect(isLoneTeam("5522999999999@s.whatsapp.net", team)).toBe(false);
    expect(isLoneTeam("", team)).toBe(false);
  });
});
