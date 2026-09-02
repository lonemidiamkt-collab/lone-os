import { describe, it, expect } from "vitest";
import { verificarItens, motivosDeAtraso, type ProvasCliente } from "@/lib/cs/setup-autoverificar";

// Roberto (02/09): "se você viu que o Julio já fez a conta, você verifica sozinho: se a conta do
// Facebook da Lone Mídia já tem a conta, então significa que o Julio já fez. Se eu não tiver,
// porque o Julio ainda não fez, então faz essa cobrança. Você viu que não tem nenhum anúncio
// ativo e não tem verba, então significa que está atrasado."

const base: ProvasCliente = {
  artesEntregues: 0, metaAdAccountId: null, anuncioRodando: false, contaAcessivel: null,
};

describe("o que o sistema consegue provar sozinho", () => {
  it("3 artes entregues fecham as 3 fixadas", () => {
    const v = verificarItens({ ...base, artesEntregues: 3 });
    expect(v.find((x) => x.chave === "fixados")?.feito).toBe(true);
    expect(v.find((x) => x.chave === "fixados")?.prova).toMatch(/3 artes/);
  });

  it("2 artes NÃO fecham — são três fixadas, não 'algumas'", () => {
    expect(verificarItens({ ...base, artesEntregues: 2 }).find((x) => x.chave === "fixados")).toBeUndefined();
  });

  it("conta no cadastro E acessível fecha o item do tráfego", () => {
    const v = verificarItens({ ...base, metaAdAccountId: "act_123", contaAcessivel: true });
    expect(v.find((x) => x.chave === "conta_meta")?.feito).toBe(true);
  });

  it("conta no cadastro mas SEM acesso não fecha nada — é o caso do Julio", () => {
    // Digitar o ID não é conseguir o acesso. Fechar aqui esconderia justamente o trabalho que falta.
    const v = verificarItens({ ...base, metaAdAccountId: "act_123", contaAcessivel: false });
    expect(v.find((x) => x.chave === "conta_meta")).toBeUndefined();
  });

  it("Meta fora do ar (null) nunca vira 'feito'", () => {
    const v = verificarItens({ ...base, metaAdAccountId: "act_123", contaAcessivel: null });
    expect(v.find((x) => x.chave === "conta_meta")).toBeUndefined();
  });

  it("gasto nos últimos 30 dias fecha 'anúncio no ar'", () => {
    expect(verificarItens({ ...base, anuncioRodando: true }).find((x) => x.chave === "anuncio")?.feito).toBe(true);
  });

  it("cliente sem nada: nada é dado por feito", () => {
    expect(verificarItens(base)).toHaveLength(0);
  });
});

describe("a cobrança diz o que foi observado", () => {
  it("conta cadastrada e sem acesso: nomeia o que falta fazer", () => {
    const m = motivosDeAtraso({ ...base, metaAdAccountId: "act_9", contaAcessivel: false }, true);
    expect(m.join(" ")).toMatch(/NÃO responde à nossa credencial/);
    expect(m.join(" ")).toMatch(/liberar o acesso/);
  });

  it("acesso ok mas sem gasto: 'está atrasado' com a razão", () => {
    const m = motivosDeAtraso({ ...base, metaAdAccountId: "act_9", contaAcessivel: true, artesEntregues: 3 }, true);
    expect(m.join(" ")).toMatch(/nenhum anúncio gastou/);
  });

  it("Meta indisponível é dito como tal, não vira acusação", () => {
    const m = motivosDeAtraso({ ...base, metaAdAccountId: "act_9", contaAcessivel: null, artesEntregues: 3 }, true);
    expect(m.join(" ")).toMatch(/não consegui conferir/i);
    expect(m.join(" ")).not.toMatch(/falta liberar/);
  });

  it("cliente só de social não é cobrado por conta de anúncio", () => {
    const m = motivosDeAtraso({ ...base, artesEntregues: 1 }, false);
    expect(m.join(" ")).not.toMatch(/conta/);
    expect(m.join(" ")).toMatch(/só 1 de 3 artes/);
  });

  it("tudo certo: nenhum motivo de atraso", () => {
    const m = motivosDeAtraso(
      { artesEntregues: 3, metaAdAccountId: "act_9", anuncioRodando: true, contaAcessivel: true }, true);
    expect(m).toHaveLength(0);
  });
});
