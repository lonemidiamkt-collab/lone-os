import { describe, it, expect } from "vitest";
import { validarWhatsapp, formatarWhatsapp } from "@/lib/team/whatsapp";

// O WhatsApp cadastrado na Equipe é a credencial da pessoa perante o agente: precisa entrar
// canônico (55 + DDD + 8) para a comparação exata de lib/cs/autoridade.ts funcionar.

describe("WhatsApp da equipe", () => {
  it("aceita os formatos que uma pessoa digita e guarda o canônico", () => {
    for (const e of ["(22) 98153-0700", "22 98153-0700", "22981530700", "+55 22 98153-0700", "5522981530700", "55 22 8153-0700"]) {
      expect(validarWhatsapp(e), e).toEqual({ ok: true, numero: "552281530700" });
    }
  });
  it("vazio apaga; lixo recusa com frase útil", () => {
    expect(validarWhatsapp("")).toEqual({ ok: true, numero: null });
    expect(validarWhatsapp(null)).toEqual({ ok: true, numero: null });
    expect(validarWhatsapp("123")).toMatchObject({ ok: false });
    expect(validarWhatsapp("+1 555 123 4567")).toMatchObject({ ok: false }); // outro país
    expect(validarWhatsapp(42)).toMatchObject({ ok: false });
  });
  it("mostra de volta com o nono dígito", () => {
    expect(formatarWhatsapp("552281530700")).toBe("(22) 98153-0700");
    expect(formatarWhatsapp(null)).toBe("");
  });
});
