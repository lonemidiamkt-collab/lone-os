import { describe, it, expect } from "vitest";
import {
  textoConviteEquipe, textoConviteCliente, textoRemarqueEquipe, textoRemarqueCliente,
  type Convite,
} from "@/lib/cs/convite-reuniao";

const base: Convite = {
  cliente: "Contele",
  quando: "terça-feira, 15 de setembro às 15:00",
  responsavel: "Thiago",
  colaboradores: [],
  modalidade: "online",
  link: "https://meet.google.com/abc-defg-hij",
  marcadaPor: "Thiago",
};

describe("convite à equipe", () => {
  it("marca o responsável e cada convidado", () => {
    const t = textoConviteEquipe(
      { ...base, colaboradores: ["Carlos Augusto"] },
      "@Thiago @Carlos",
    );
    expect(t).toContain("@Thiago");
    expect(t).toContain("@Carlos");
  });

  it("diz de quem veio o convite quando há convidado", () => {
    const t = textoConviteEquipe({ ...base, colaboradores: ["Carlos Augusto"] }, "@Thiago @Carlos");
    expect(t).toContain("convite de Thiago");
  });

  it("não fala em convite quando ninguém foi convidado", () => {
    const t = textoConviteEquipe(base, "@Thiago");
    expect(t).not.toContain("convite de");
  });

  it("leva o link da chamada", () => {
    expect(textoConviteEquipe(base, "@Thiago")).toContain("meet.google.com/abc-defg-hij");
  });

  it("online sem link avisa que o link ainda vem", () => {
    const t = textoConviteEquipe({ ...base, link: null }, "@Thiago");
    expect(t).toContain("o link vem antes");
  });

  it("presencial mostra o endereço, não link", () => {
    const t = textoConviteEquipe(
      { ...base, modalidade: "presencial", link: null, local: "Av. Brasil, 100" },
      "@Thiago",
    );
    expect(t).toContain("📍 Presencial — Av. Brasil, 100");
    expect(t).not.toContain("🔗");
  });

  it("sem menção resolvida, cai nos nomes — melhor sem notificar que sem dizer quem vai", () => {
    const t = textoConviteEquipe({ ...base, colaboradores: ["Carlos Augusto"] }, "");
    expect(t).toContain("Thiago");
    expect(t).toContain("Carlos Augusto");
  });

  it("resume a pauta a uma linha", () => {
    const t = textoConviteEquipe(
      { ...base, pauta: "## Pontos\nRevisar o desempenho de agosto\nOutra linha" },
      "@Thiago",
    );
    expect(t).toContain("Revisar o desempenho de agosto");
    expect(t).not.toContain("Outra linha");
  });
});

describe("convite ao cliente", () => {
  const t = textoConviteCliente({ ...base, colaboradores: ["Carlos Augusto"], pauta: "Cobrar material" });

  it("dá data, hora e como entrar", () => {
    expect(t).toContain("terça-feira, 15 de setembro às 15:00");
    expect(t).toContain("meet.google.com");
  });

  it("NÃO vaza nada interno — nem pauta, nem quem convidou, nem convidado", () => {
    expect(t).not.toContain("Cobrar material");
    expect(t).not.toContain("Carlos");
    expect(t).not.toContain("convite de");
  });

  it("abre a porta para remarcar", () => {
    expect(t).toContain("remarcar");
  });
});

describe("remarque", () => {
  it("mostra o horário velho riscado e o novo", () => {
    const t = textoRemarqueEquipe(base, "@Thiago", "segunda-feira, 14 de setembro às 10:00");
    expect(t).toContain("~segunda-feira, 14 de setembro às 10:00~");
    expect(t).toContain("*terça-feira, 15 de setembro às 15:00*");
  });

  it("ao cliente também, sem nada interno", () => {
    const t = textoRemarqueCliente({ ...base, pauta: "interno" }, "segunda-feira, 14 de setembro às 10:00");
    expect(t).toContain("mudou de horário");
    expect(t).not.toContain("interno");
  });
});
