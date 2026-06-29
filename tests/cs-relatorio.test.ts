// Teste OFFLINE do A5 (relatório de entregas) — só a lógica pura buildDeliveryReport.
import { describe, it, expect } from "vitest";
import { buildDeliveryReport } from "@/lib/cs/relatorio";

describe("buildDeliveryReport", () => {
  it("sem entregas → mensagem honesta pedindo pra mover o board", () => {
    const msg = buildDeliveryReport({ periodoLabel: "23/06 a 27/06", entregas: [], emProducao: 0, publicados: 0 });
    expect(msg).toContain("Nenhuma entrega registrada");
    expect(msg).toContain("23/06 a 27/06");
    expect(msg).not.toContain("Total:");
  });

  it("agrupa por designer e conta no prazo / atrasadas", () => {
    const msg = buildDeliveryReport({
      periodoLabel: "23/06 a 27/06",
      entregas: [
        { designer: "Rodrigo", onTime: true },
        { designer: "Rodrigo", onTime: true },
        { designer: "Rodrigo", onTime: false },
        { designer: "Ana", onTime: true },
      ],
      emProducao: 2,
      publicados: 3,
    });
    expect(msg).toContain("Rodrigo — 3 entregues (2 no prazo, 1 atrasada ⏰)");
    expect(msg).toContain("Ana — 1 entregue (1 no prazo ✅)");
    expect(msg).toContain("*Total:* 4 entregues · 3/4 no prazo");
    expect(msg).toContain("📢 *Publicados:* 3 no ar");
    expect(msg).toContain("⏳ *Em produção agora:* 2");
  });

  it("Rodrigo aparece antes de Ana (ordena por quem mais entregou)", () => {
    const msg = buildDeliveryReport({
      periodoLabel: "x", emProducao: 0, publicados: 0,
      entregas: [{ designer: "Ana", onTime: true }, { designer: "Rodrigo", onTime: true }, { designer: "Rodrigo", onTime: true }],
    });
    expect(msg.indexOf("Rodrigo")).toBeLessThan(msg.indexOf("Ana"));
  });

  it("designer null vira 'Sem designer'; oculta publicados/produção quando 0", () => {
    const msg = buildDeliveryReport({ periodoLabel: "x", entregas: [{ designer: null, onTime: false }], emProducao: 0, publicados: 0 });
    expect(msg).toContain("Sem designer — 1 entregue");
    expect(msg).not.toContain("Publicados");
    expect(msg).not.toContain("Em produção");
  });
});
