import { describe, it, expect } from "vitest";
import { ordenar, legendaSaude, saudePessoaPdfHtml, type BlocoSaude } from "@/lib/reports/saudePdf";

// Roberto (02/09), olhando o digest de saúde no grupo: "essa mensagem quero separado em pdf por
// pessoa que é responsável". Os dados abaixo são os da mensagem real daquele dia.

const bloco: BlocoSaude = {
  pessoa: "Thiago",
  clientes: [
    { cliente: "Blocfast", diasSemPostar: 8, motivos: [] },
    { cliente: "Dumar Comercio e serviços", diasSemPostar: 55, motivos: [] },
    { cliente: "Varejão da Construção", diasSemPostar: null, motivos: [] },
    { cliente: "Calabria Decorações", diasSemPostar: 50, motivos: ["reclamou nos últimos 14 dias"] },
    { cliente: "Veneza Estofados", diasSemPostar: null, motivos: [], semInstagram: true },
  ],
};

describe("ordem: o pior primeiro", () => {
  const o = ordenar(bloco.clientes);

  it("quem nunca postou vem antes de quem parou há muito", () => {
    expect(o[0].cliente).toBe("Varejão da Construção");
  });

  it("depois, mais dias parados primeiro", () => {
    expect(o.slice(1, 4).map((c) => c.cliente))
      .toEqual(["Dumar Comercio e serviços", "Calabria Decorações", "Blocfast"]);
  });

  it("cadastro incompleto vai por último — não compete com trabalho parado", () => {
    // Sem Instagram o sistema é cego; misturar isso no topo acusaria o social por algo que não é dele.
    expect(o[o.length - 1].cliente).toBe("Veneza Estofados");
  });
});

describe("a legenda que vai no grupo", () => {
  it("marca a pessoa e aponta o pior caso", () => {
    const l = legendaSaude(bloco, "@5522997226048");
    expect(l).toContain("@5522997226048");
    expect(l).toMatch(/4 clientes/);                 // os 4 reais, sem o de cadastro
    expect(l).toMatch(/Varejão da Construção/);
    expect(l).toMatch(/sem nenhum post registrado/i);
  });

  it("quem tem só pendência de cadastro NÃO é cobrado por postagem", () => {
    const so: BlocoSaude = { pessoa: "Carlos", clientes: [
      { cliente: "Atlas inc", diasSemPostar: null, motivos: [], semInstagram: true },
    ] };
    const l = legendaSaude(so, "@552299");
    expect(l).toMatch(/vinculado/i);
    expect(l).not.toMatch(/pedindo atenção/);
  });

  it("sem menção resolvida, usa o nome — nunca um arroba que não notifica", () => {
    expect(legendaSaude(bloco, "")).toContain("Thiago");
    expect(legendaSaude(bloco, "")).not.toContain("@");
  });

  it("um cliente só não vira plural", () => {
    const um: BlocoSaude = { pessoa: "Ph", clientes: [{ cliente: "X", diasSemPostar: 20, motivos: [] }] };
    expect(legendaSaude(um, "")).toMatch(/\*1 cliente\* pedindo/);
  });
});

describe("o PDF individual", () => {
  const html = saudePessoaPdfHtml(bloco, "", "2026-09-02");

  it("traz o nome no título e não repete cabeçalho de pessoa dentro", () => {
    expect(html).toContain("Thiago, seus clientes pedindo atenção");
    expect(html).not.toMatch(/<h2[^>]*>Thiago<\/h2>/);
  });

  it("conta os graves (nunca postou ou +30 dias), ignorando o de cadastro", () => {
    // Varejão (nunca), Dumar (55) e Calabria (50) = 3. Blocfast (8) e Veneza (cadastro) fora.
    expect(html).toMatch(/3 há mais de um mês sem post/);
  });

  it("o motivo aparece junto do cliente", () => {
    expect(html).toContain("reclamou nos últimos 14 dias");
  });

  it("sem Instagram é dito como falta de cadastro, não como atraso", () => {
    expect(html).toContain("falta vincular o Instagram");
  });

  it("escapa caractere perigoso no nome do cliente", () => {
    const x: BlocoSaude = { pessoa: "A", clientes: [{ cliente: "B & <script>", diasSemPostar: 3, motivos: [] }] };
    const h = saudePessoaPdfHtml(x, "", "2026-09-02");
    expect(h).toContain("B &amp; &lt;script&gt;");
    expect(h).not.toContain("<script>");
  });
});
