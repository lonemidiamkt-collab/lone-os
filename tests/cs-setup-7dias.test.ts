// Teste OFFLINE do setup dos 7 dias e da graduação de onboarding (só lógica pura).
import { describe, it, expect } from "vitest";
import { itensPara, montarCobrancaSetup, graduou, escopoDe, type StatusSetup } from "@/lib/cs/setup-7dias";

describe("escopoDe — o que o cliente contratou", () => {
  it("mapeia os valores reais do cadastro", () => {
    expect(escopoDe("assessoria_social")).toBe("social");
    expect(escopoDe("trafego_pago")).toBe("trafego");
    expect(escopoDe("assessoria_trafego")).toBe("trafego");
    expect(escopoDe("lone_growth")).toBe("completo");
    expect(escopoDe(null)).toBe("completo"); // sem escopo definido, cobra tudo
  });
});

describe("itensPara — não cobra o que o cliente não contratou", () => {
  it("cliente só-social (Atlas, Dumar) não recebe item de anúncio", () => {
    const chaves = itensPara({ escopo: "social", gravaVideo: false }).map((i) => i.chave);
    expect(chaves).toContain("logo");
    expect(chaves).toContain("fixados");
    expect(chaves).not.toContain("anuncio");
    expect(chaves).not.toContain("conta_meta");
  });

  it("cliente SÓ-ANÚNCIO (Paiva Shopp) não recebe bio/linktree/destaques — o perfil não é nosso", () => {
    const chaves = itensPara({ escopo: "trafego", gravaVideo: false }).map((i) => i.chave);
    expect(chaves).toContain("anuncio");
    expect(chaves).toContain("conta_meta");
    expect(chaves).not.toContain("bio");
    expect(chaves).not.toContain("linktree");
    expect(chaves).not.toContain("destaques");
    expect(chaves).not.toContain("fixados");
  });

  it("cliente completo recebe as duas frentes", () => {
    const chaves = itensPara({ escopo: "completo", gravaVideo: false }).map((i) => i.chave);
    expect(chaves).toContain("fixados");
    expect(chaves).toContain("conta_meta"); // o furo dos 9 clientes invisíveis
  });

  it("vídeo só pra quem é de social E grava", () => {
    expect(itensPara({ escopo: "completo", gravaVideo: true }).map((i) => i.chave)).toContain("videos");
    expect(itensPara({ escopo: "trafego", gravaVideo: true }).map((i) => i.chave)).not.toContain("videos");
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

describe("graduou — a prova depende do que ele contratou", () => {
  it("só-social com arte entregue JÁ É CLIENTE (o caso do Atlas, 98 dias e 7 artes)", () => {
    expect(graduou({ escopo: "social", contaVinculada: false, anuncioRodando: false, artesEntregues: 7 })).toBe(true);
  });

  it("SÓ-ANÚNCIO gradua sem arte nenhuma — a gente não faz arte pra ele (Paiva Shopp)", () => {
    expect(graduou({ escopo: "trafego", contaVinculada: true, anuncioRodando: true, artesEntregues: 0 })).toBe(true);
  });

  it("só-anúncio com conta vinculada mas SEM anúncio rodando não gradua", () => {
    expect(graduou({ escopo: "trafego", contaVinculada: true, anuncioRodando: false, artesEntregues: 0 })).toBe(false);
  });

  it("cliente completo precisa das DUAS frentes", () => {
    expect(graduou({ escopo: "completo", contaVinculada: false, anuncioRodando: false, artesEntregues: 6 })).toBe(false);
    expect(graduou({ escopo: "completo", contaVinculada: true, anuncioRodando: true, artesEntregues: 4 })).toBe(true);
  });

  it("só-social sem nada entregue nunca gradua, por mais antigo que seja (Dumar, 98 dias)", () => {
    expect(graduou({ escopo: "social", contaVinculada: false, anuncioRodando: false, artesEntregues: 0 })).toBe(false);
  });
});
