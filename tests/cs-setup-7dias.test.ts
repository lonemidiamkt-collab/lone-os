// Teste OFFLINE do setup dos 7 dias e da graduação de onboarding (só lógica pura).
import { describe, it, expect } from "vitest";
import { itensPara, montarCobrancaSetup, graduou, type StatusSetup } from "@/lib/cs/setup-7dias";

describe("itensPara — não cobra o que o cliente não contratou", () => {
  it("cliente só-social não recebe item de anúncio", () => {
    const chaves = itensPara({ temTrafego: false, gravaVideo: false }).map((i) => i.chave);
    expect(chaves).toContain("logo");
    expect(chaves).toContain("fixados");
    expect(chaves).not.toContain("anuncio");
    expect(chaves).not.toContain("conta_meta");
    expect(chaves).not.toContain("videos");
  });

  it("cliente de tráfego recebe anúncio E a conta vinculada", () => {
    const chaves = itensPara({ temTrafego: true, gravaVideo: false }).map((i) => i.chave);
    expect(chaves).toContain("anuncio");
    expect(chaves).toContain("conta_meta"); // o furo dos 9 clientes invisíveis
  });

  it("quem grava vídeo recebe o item de vídeo", () => {
    expect(itensPara({ temTrafego: false, gravaVideo: true }).map((i) => i.chave)).toContain("videos");
  });
});

describe("montarCobrancaSetup", () => {
  const dentroDoPrazo: StatusSetup = {
    cliente: "Império Material", diasDeCasa: 3,
    feitos: ["Logo finalizada"],
    abertos: [{ titulo: "Bio do perfil escrita", papel: "social", responsavel: "Carlos" }],
  };

  it("setup fechado não vira mensagem", () => {
    expect(montarCobrancaSetup([{ ...dentroDoPrazo, abertos: [] }])).toBe("");
  });

  it("dentro do prazo é lembrete, não bronca", () => {
    const m = montarCobrancaSetup([dentroDoPrazo]);
    expect(m).toContain("dia 3 de 7");
    expect(m).not.toContain("além do prazo");
    expect(m).toContain("1/2");
  });

  it("passou dos 7 dias, diz quantos dias passou", () => {
    // O Portuga está com as tarefas de setup abertas desde 03/07.
    const m = montarCobrancaSetup([{ ...dentroDoPrazo, cliente: "Portuga P'Neus", diasDeCasa: 31 }]);
    expect(m).toContain("24d além do prazo");
  });

  it("item sem dono aparece como sem dono, não some", () => {
    const m = montarCobrancaSetup([{
      ...dentroDoPrazo,
      abertos: [{ titulo: "Anúncio no ar", papel: "traffic", responsavel: null }],
    }]);
    expect(m).toContain("sem tráfego definido");
  });

  it("cliente mais antigo aparece primeiro", () => {
    const m = montarCobrancaSetup([
      { ...dentroDoPrazo, cliente: "Novo", diasDeCasa: 2 },
      { ...dentroDoPrazo, cliente: "Velho", diasDeCasa: 40 },
    ]);
    expect(m.indexOf("Velho")).toBeLessThan(m.indexOf("Novo"));
  });
});

describe("graduou — sair de onboarding", () => {
  it("só-social com arte entregue JÁ É CLIENTE (o caso do Atlas, 98 dias e 7 artes)", () => {
    expect(graduou({ temTrafego: false, contaVinculada: false, artesEntregues: 7 })).toBe(true);
  });

  it("cliente de tráfego sem conta vinculada NÃO gradua — o sistema estaria cego pra ele", () => {
    expect(graduou({ temTrafego: true, contaVinculada: false, artesEntregues: 6 })).toBe(false);
  });

  it("cliente de tráfego com conta vinculada e arte entregue gradua", () => {
    expect(graduou({ temTrafego: true, contaVinculada: true, artesEntregues: 4 })).toBe(true);
  });

  it("nada entregue nunca gradua, por mais antigo que seja (Dumar, 98 dias, 0 artes)", () => {
    expect(graduou({ temTrafego: false, contaVinculada: false, artesEntregues: 0 })).toBe(false);
  });
});
