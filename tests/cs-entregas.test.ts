// Teste OFFLINE da conferência de entrega — só o texto do aviso (sem banco/WhatsApp).
import { describe, it, expect } from "vitest";
import { textoConferencia, type ConferenciaEntrega } from "@/lib/cs/entregas";

const base: ConferenciaEntrega = { kind: "report", dateKey: "2026-07-20", entregues: 0, falharam: [], semRegistro: [] };

describe("textoConferencia", () => {
  it("tudo entregue → não manda nada (silêncio é a resposta certa)", () => {
    expect(textoConferencia({ ...base, entregues: 37 })).toBe("");
  });

  it("falha parcial → nomeia quem ficou de fora e o motivo", () => {
    // O caso real de 20/07: 35 de 37 enviados, e ninguém soube dos 2 que faltaram.
    const m = textoConferencia({
      ...base, entregues: 35,
      falharam: [{ cliente: "Dumar", motivo: "cliente sem tráfego nem Instagram" }],
      semRegistro: ["CIIL"],
    });
    expect(m).toContain("2 de 37");
    expect(m).toContain("Dumar");
    expect(m).toContain("cliente sem tráfego nem Instagram");
    expect(m).toContain("Nem chegou a ser tentado");
    expect(m).toContain("CIIL");
  });

  it("falha em massa → conta todos, mas não despeja a lista inteira", () => {
    // 01/07: TODAS falharam ("Bad Request"). O aviso precisa caber numa mensagem.
    const falharam = Array.from({ length: 30 }, (_, i) => ({ cliente: `Cliente ${i + 1}`, motivo: "Bad Request" }));
    const m = textoConferencia({ ...base, kind: "support", entregues: 0, falharam });
    expect(m).toContain("30 de 30");
    expect(m).toContain("mensagem de suporte");
    expect(m).toContain("e mais 22"); // mostra 8, resume o resto
    expect(m).not.toContain("Cliente 30");
  });

  it("erro sem motivo registrado não vira mensagem vazia", () => {
    const m = textoConferencia({ ...base, kind: "calendar", entregues: 1, falharam: [{ cliente: "X", motivo: "erro não registrado" }] });
    expect(m).toContain("calendário do mês");
    expect(m).toContain("erro não registrado");
  });
});

// 21/10/2026 (item 5.2): o envio que estoura o tempo pode ter chegado. A conferência mandava
// "vale reenviar" pra ele — e reenviar às cegas era justamente o que punha a mensagem em dobro.
describe("textoConferencia — envio incerto", () => {
  it("só incertos → diz que não sabe, e manda CONFERIR, não reenviar", () => {
    const m = textoConferencia({ ...base, entregues: 36, incertos: ["Bazar Ribeiro"] });
    expect(m).toContain("não sei se chegou em 1 de 37");
    expect(m).toContain("Bazar Ribeiro");
    expect(m).toContain("Confira no grupo antes de reenviar");
    expect(m).not.toContain("Vale reenviar");
  });

  it("misturado → falha pede reenvio, incerto pede conferência, cada um no seu bloco", () => {
    const m = textoConferencia({
      ...base, entregues: 35,
      falharam: [{ cliente: "Dumar", motivo: "HTTP 400" }],
      incertos: ["Veneza Estofados"],
    });
    expect(m).toContain("não chegou em 1 de 37");
    expect(m).toContain("Vale reenviar");
    expect(m).toContain("Não sei se chegou");
    expect(m).toContain("Veneza Estofados");
  });
});
