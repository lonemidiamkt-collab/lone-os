// Teste OFFLINE do relatório de postagem — só a lógica pura buildPostingReport.
import { describe, it, expect } from "vitest";
import { buildPostingReport } from "@/lib/cs/postagem";

const C = (nome: string, temPost: boolean, esperado: boolean) => ({ nome, temPost, esperado });

describe("buildPostingReport", () => {
  it("seg/sex: balanço com/sem post + chamada pra criar", () => {
    const msg = buildPostingReport({
      diaLabel: "segunda, 30/06", videoDay: false,
      clientes: [C("Contele", true, true), C("Paradise", true, true), C("Madeirão", false, true)],
    });
    expect(msg).toContain("*Pauta de hoje* (segunda, 30/06)");
    expect(msg).toContain("✅ *Com post:* Contele, Paradise");
    expect(msg).toContain("❌ *Sem post:* Madeirão");
    expect(msg).toContain("1 cliente sem pauta");
  });

  it("quarta: só clientes de vídeo (esperado); labels de vídeo; ignora quem não faz vídeo", () => {
    const msg = buildPostingReport({
      diaLabel: "quarta, 02/07", videoDay: true,
      clientes: [C("Império", true, true), C("Tindaro", false, true), C("SoArte", false, false)],
    })!;
    expect(msg).toContain("🎬 *Vídeos de hoje — quarta*");
    expect(msg).toContain("✅ *Com vídeo:* Império");
    expect(msg).toContain("❌ *Sem vídeo:* Tindaro");
    expect(msg).not.toContain("SoArte");
    expect(msg).toContain("cadê os roteiros");
  });

  it("dia fora (terça) COM post agendado → lista quem tem; não cobra os outros", () => {
    const msg = buildPostingReport({
      diaLabel: "terça, 01/07", videoDay: false,
      clientes: [C("Contele", true, false), C("Paradise", false, false)],
    })!;
    expect(msg).toContain("*Posts de hoje* (terça, 01/07)");
    expect(msg).toContain("Tem post agendado pra hoje: *Contele*");
    expect(msg).not.toContain("Paradise");
  });

  it("dia fora sem nada agendado + sem lembrete → null (não posta)", () => {
    const msg = buildPostingReport({
      diaLabel: "terça, 01/07", videoDay: false,
      clientes: [C("Contele", false, false)],
    });
    expect(msg).toBeNull();
  });

  it("segunda: lembrete pra adiantar roteiro dos vídeos de quarta", () => {
    const msg = buildPostingReport({
      diaLabel: "segunda, 30/06", videoDay: false,
      clientes: [C("Contele", true, true)],
      videoQuarta: ["Império", "Tindaro"],
    })!;
    expect(msg).toContain("📹 *Vídeo de quarta:* Império, Tindaro");
    expect(msg).toContain("já tem roteiro");
  });
});
