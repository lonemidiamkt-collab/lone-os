// Lacunas de pauta (lib/conteudo/lacunas.ts, Leva 7B N10): dias de post vazios nas próximas duas
// semanas, na cadência contratada.
import { describe, it, expect } from "vitest";
import {
  chaveDaLacuna, diasDaCadencia, elegivelParaPauta, lacunasDePauta, postsPorSemana, segundaDaSemana, tituloDaLacuna,
} from "@/lib/conteudo/lacunas";

// 2026-09-24 é quinta. Janela: sex 25/09 → qui 08/10 (semanas de 21/09, 28/09 e 05/10).
const HOJE = "2026-09-24";
const cli = (p: Partial<Parameters<typeof elegivelParaPauta>[0]> = {}) => ({ id: "k1", nome: "Loja", social: "Carla", postsGoal: 12, ...p });

describe("cadência", () => {
  it("meta mensal vira posts por semana (12 → 3, 8 → 2, 4 → 1, 0 → nenhum, vazio → padrão 3)", () => {
    expect(postsPorSemana(12)).toBe(3);
    expect(postsPorSemana(8)).toBe(2);
    expect(postsPorSemana(4)).toBe(1);
    expect(postsPorSemana(0)).toBe(0);
    expect(postsPorSemana(null)).toBe(3);
    expect(postsPorSemana(30)).toBe(3);
  });
  it("dias na ordem do playbook", () => {
    expect(diasDaCadencia(3)).toEqual([1, 3, 5]);
    expect(diasDaCadencia(2)).toEqual([1, 5]);
    expect(diasDaCadencia(1)).toEqual([1]);
    expect(diasDaCadencia(0)).toEqual([]);
  });
  it("segunda da semana", () => {
    expect(segundaDaSemana("2026-09-24")).toBe("2026-09-21");
    expect(segundaDaSemana("2026-09-21")).toBe("2026-09-21");
    expect(segundaDaSemana("2026-09-27")).toBe("2026-09-21");
  });
});

describe("quem entra", () => {
  it("fora: inativo, pausado, rascunho, teste, sem social", () => {
    expect(elegivelParaPauta(cli())).toBe(true);
    expect(elegivelParaPauta(cli({ active: false }))).toBe(false);
    expect(elegivelParaPauta(cli({ pausedAt: "2026-09-01" }))).toBe(false);
    expect(elegivelParaPauta(cli({ draftStatus: "awaiting_approval" }))).toBe(false);
    expect(elegivelParaPauta(cli({ nome: "Loja (teste)" }))).toBe(false);
    expect(elegivelParaPauta(cli({ social: null, serviceType: "assessoria_trafego" }))).toBe(false);
    expect(elegivelParaPauta(cli({ social: null, serviceType: "assessoria_social" }))).toBe(true);
  });
});

describe("lacunas", () => {
  it("sem card nenhum: sexta desta semana + seg/qua/sex das duas próximas; semanas vazias marcadas", () => {
    const [r] = lacunasDePauta({ clientes: [cli()], cards: [], hoje: HOJE });
    expect(r.lacunas.map((l) => l.data)).toEqual(["2026-09-25", "2026-09-28", "2026-09-30", "2026-10-02", "2026-10-05", "2026-10-07"]);
    expect(r.semanasVazias).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
  });

  it("a semana conta inteira: post de segunda passada cobre a cadência desta semana", () => {
    const cards = ["2026-09-21", "2026-09-23"].map((d) => ({ clientId: "k1", dueDate: d }));
    const [r] = lacunasDePauta({ clientes: [cli()], cards, hoje: HOJE });
    // Semana de 21/09 tem 2 de 3: falta 1 — a sexta.
    expect(r.lacunas.filter((l) => l.semana === "2026-09-21").map((l) => l.data)).toEqual(["2026-09-25"]);
    expect(r.semanasVazias).not.toContain("2026-09-21");
  });

  it("post em outro dia conta para a cadência; o que falta sai de segunda e sexta antes de quarta", () => {
    const cards = [{ clientId: "k1", dueDate: "2026-09-29" }]; // terça
    const [r] = lacunasDePauta({ clientes: [cli()], cards, hoje: HOJE });
    expect(r.lacunas.filter((l) => l.semana === "2026-09-28").map((l) => l.rotuloDia)).toEqual(["segunda", "sexta"]);
  });

  it("cadência de 2: só segunda e sexta; semana completa não aparece", () => {
    const cards = ["2026-09-28", "2026-10-02"].map((d) => ({ clientId: "k1", dueDate: d }));
    const [r] = lacunasDePauta({ clientes: [cli({ postsGoal: 8 })], cards, hoje: HOJE });
    expect(r.porSemana).toBe(2);
    expect(r.lacunas.some((l) => l.semana === "2026-09-28")).toBe(false);
    expect(r.lacunas.some((l) => l.dia === 3)).toBe(false);
  });

  it("card arquivado não cobre a lacuna; cliente coberto não aparece", () => {
    const tudo = ["2026-09-25", "2026-09-28", "2026-09-30", "2026-10-02", "2026-10-05", "2026-10-07"];
    expect(lacunasDePauta({ clientes: [cli()], cards: tudo.map((d) => ({ clientId: "k1", dueDate: d })), hoje: HOJE })).toEqual([]);
    const comArquivado = tudo.map((d, i) => ({ clientId: "k1", dueDate: d, archivedAt: i === 0 ? "2026-09-20" : null }));
    expect(lacunasDePauta({ clientes: [cli()], cards: comArquivado, hoje: HOJE })[0].lacunas.map((l) => l.data)).toEqual(["2026-09-25"]);
  });

  it("quarta de quem grava vídeo sugere Reels", () => {
    const [r] = lacunasDePauta({ clientes: [cli({ perfil: "video" })], cards: [], hoje: HOJE });
    expect(r.lacunas.find((l) => l.data === "2026-09-30")?.formatoSugerido).toBe("Reels");
    expect(r.lacunas.find((l) => l.data === "2026-09-28")?.formatoSugerido).toBe("Post");
  });

  it("título e chave do card que nasce da lacuna", () => {
    expect(tituloDaLacuna({ data: "2026-09-30", rotuloDia: "quarta", formatoSugerido: "Reels" })).toBe("Reels de quarta 30/09 — definir tema");
    expect(chaveDaLacuna("k1", "2026-09-30")).toBe("lacuna|k1|2026-09-30");
  });
});
