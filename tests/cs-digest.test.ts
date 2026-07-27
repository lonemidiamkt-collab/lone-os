// Teste OFFLINE do digest — a mensagem única que substitui a enxurrada (só lógica pura).
import { describe, it, expect } from "vitest";
import { montarDigest, type ItemAcao } from "@/lib/cs/digest";

const item = (responsavel: string | null, texto: string, peso: number, cliente?: string): ItemAcao =>
  ({ responsavel, texto, peso, cliente });

describe("montarDigest", () => {
  it("dia sem nada → NÃO manda mensagem (era o vício antigo: 12 crons falando do nada)", () => {
    expect(montarDigest("manha", "seg, 27/07", { itens: [] })).toBe("");
  });

  it("agrupa por QUEM precisa agir, não por assunto", () => {
    const m = montarDigest("manha", "seg, 27/07", {
      itens: [
        item("Carlos", "arte vencida há 3 dias", 90, "Léo Carros"),
        item("Carlos", "cliente esperando resposta", 70, "CIIL"),
        item("Pedro", "arte pronta, falta postar", 80, "Imperio"),
      ],
    });
    expect(m).toContain("*Carlos* — 2 coisas");
    expect(m).toContain("*Pedro* — 1 coisa");
    expect(m).toContain("Léo Carros");
    // Carlos vem antes: o item mais pesado dele (90) supera o do Pedro (80).
    expect(m.indexOf("Carlos")).toBeLessThan(m.indexOf("Pedro"));
  });

  it("CORTA a parede de nomes — o motivo de o time ter desligado", () => {
    const muitos = Array.from({ length: 14 }, (_, i) => item("Carlos", `pendência ${i + 1}`, 50 - i));
    const m = montarDigest("manha", "seg, 27/07", { itens: muitos });
    expect(m).toContain("*Carlos* — 14 coisas");
    expect(m).toContain("e mais 9");
    expect(m).toContain("pendência 1");
    expect(m).not.toContain("pendência 14"); // não despeja a lista inteira
  });

  it("item sem dono aparece, e por último (não some, mas não lidera)", () => {
    const m = montarDigest("manha", "seg, 27/07", {
      itens: [item(null, "arte sem responsável", 99), item("Pedro", "postar hoje", 10)],
    });
    expect(m).toContain("Sem responsável");
    expect(m.indexOf("Pedro")).toBeLessThan(m.indexOf("Sem responsável"));
  });

  it("números de contexto viram UMA linha, não uma seção cada", () => {
    const m = montarDigest("manha", "seg, 27/07", {
      itens: [item("Pedro", "x", 10)],
      contexto: { emProducao: 5, aguardandoAprovacao: 2, encalhados: 12, novosHoje: 1 },
    });
    const linhaContexto = m.split("\n").filter((l) => l.startsWith("📊"));
    expect(linhaContexto).toHaveLength(1);
    expect(linhaContexto[0]).toContain("5");
    expect(linhaContexto[0]).toContain("encalhados");
  });

  it("bloco da tarde fala do que ficou e do que vem amanhã", () => {
    const m = montarDigest("tarde", "seg, 27/07", {
      itens: [item("Carlos", "não postou a arte do dia", 60, "CIIL")],
      amanha: ["Imperio — arte da terça ainda não tem card"],
    });
    expect(m).toContain("Fechando o dia");
    expect(m).toContain("Ficou pendente");
    expect(m).toContain("Pra amanhã");
    expect(m).toContain("Imperio");
  });

  it("dia limpo mas com data comemorativa perto ainda vale mensagem", () => {
    const m = montarDigest("manha", "seg, 27/07", { itens: [], datas: ["Dia dos Pais — dom 09/08"] });
    expect(m).toContain("Nada pegando fogo");
    expect(m).toContain("Dia dos Pais");
  });

  it("não deixa buraco de linhas em branco no meio", () => {
    const m = montarDigest("manha", "seg, 27/07", { itens: [item("Pedro", "x", 10)] });
    expect(m).not.toMatch(/\n{3,}/);
  });
});
