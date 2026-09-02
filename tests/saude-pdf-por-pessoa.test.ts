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

// ── O erro que o preview pegou antes de ir pro grupo (02/09) ───────────────
//
// A primeira versão colocou "Imperio dos Pisos — sem post registrado" no PDF do Thiago. Falso: o
// número vinha de `content_cards.status = published`, o campo que em agosto registrou 24
// publicações contra 451 posts reais no Instagram. O cliente postava; o board é que estava vazio.
//
// `undefined` (não medido) passou a ser diferente de `null` (Instagram lido e sem post).
describe("não medido ≠ nunca postou", () => {
  const misto: BlocoSaude = { pessoa: "Thiago", clientes: [
    { cliente: "Imperio dos Pisos", motivos: ["reclamou nos últimos 14 dias"] },   // sem diasSemPostar
    { cliente: "Varejão", diasSemPostar: null, motivos: [] },                      // Instagram vazio
    { cliente: "Hentzy", diasSemPostar: 58, motivos: [] },
  ] };

  it("quem entrou por reclamação NÃO é acusado de não postar", () => {
    const h = saudePessoaPdfHtml(misto, "", "2026-09-02");
    expect(h).toContain("Imperio dos Pisos");
    // A direita mostra o motivo real, não um número que ninguém apurou.
    expect(h).toMatch(/reclamou nos últimos 14 dias<\/td>/);
  });

  it("só conta como grave quem foi realmente medido", () => {
    // Varejão (Instagram vazio) e Hentzy (58d) = 2. O Império não entra.
    expect(saudePessoaPdfHtml(misto, "", "2026-09-02")).toMatch(/2 há mais de um mês sem post/);
  });

  it("ordem: Instagram vazio primeiro, dias depois, não-medido por último", () => {
    expect(ordenar(misto.clientes).map((c) => c.cliente)).toEqual(["Varejão", "Hentzy", "Imperio dos Pisos"]);
  });

  it("a legenda não promete um número que não existe", () => {
    const so: BlocoSaude = { pessoa: "X", clientes: [{ cliente: "Y", motivos: ["reclamou"] }] };
    const l = legendaSaude(so, "");
    expect(l).toContain("*Y* reclamou");
    expect(l).not.toMatch(/dias/);
  });
});

// ── "Varejão e UNAFER foi feito post sim!" (Roberto, 02/09) ────────────────
//
// E estava certo. As duas contas têm Instagram vinculado e a Meta responde media_count normalmente
// — 138 e 124 posts. Mas pedir /media devolve "(#10) Application does not have permission",
// porque as contas não estão ligadas à Página que administramos. client_ig_posts ficava vazio e o
// agente anunciava "sem NENHUM post registrado" para dois clientes que postam há meses.
//
// O snapshot já guardava a prova e ninguém lia: `conta.posts = 124` com `posts: []` é a assinatura
// de "não consegui ler", nunca de "não postou".
describe("conta que posta e não conseguimos ler", () => {
  const b: BlocoSaude = { pessoa: "Thiago", clientes: [
    { cliente: "Hentzy", diasSemPostar: 58, motivos: [] },
    { cliente: "Varejão da Construção", motivos: [], ilegivel: { postsNaConta: 138 } },
    { cliente: "UNAFER", motivos: [], ilegivel: { postsNaConta: 124 } },
  ] };
  const html = saudePessoaPdfHtml(b, "", "2026-09-02");

  it("NÃO diz que não postou — diz que falta acesso", () => {
    expect(html).toContain("sem acesso pra ler as publicações");
    expect(html).not.toMatch(/Varejão da Construção[^]{0,200}sem post registrado/);
  });

  it("mostra quantos posts a conta tem — a prova de que o cliente trabalhou", () => {
    expect(html).toContain("138 posts na conta");
    expect(html).toContain("124 posts na conta");
  });

  it("não conta como grave: o problema é de acesso, não de entrega", () => {
    expect(html).toMatch(/1 há mais de um mês sem post/); // só o Hentzy
  });

  it("vai por último, junto das outras pendências técnicas", () => {
    expect(ordenar(b.clientes)[0].cliente).toBe("Hentzy");
  });

  it("a legenda deixa claro que não é cobrança de ninguém", () => {
    const so: BlocoSaude = { pessoa: "Thiago", clientes: [
      { cliente: "UNAFER", motivos: [], ilegivel: { postsNaConta: 124 } },
    ] };
    const l = legendaSaude(so, "@552299");
    expect(l).toMatch(/postando/);
    expect(l).toMatch(/não é cobrança/i);
    expect(l).not.toMatch(/pedindo atenção/);
  });
});
