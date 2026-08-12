import { describe, it, expect } from "vitest";
import { lerBlocos } from "@/lib/cs/texto-para-pdf";
import { lerPedidoPdf, pediuPdf } from "@/lib/cs/pedido-pdf";

// Os dois casos REAIS que o Roberto mandou em 12/08:
//  - Imperio dos Pisos: roteiro pronto com Criativo 1 e Criativo 2 → saiu tudo num bloco só, e a
//    linha de comando dele ("loninho, crie e esse pdf…") foi impressa DENTRO do PDF.
//  - WT Shopping: contexto sobre castração + "crie um roteiro com essas informações" → foi
//    diagramado como se o texto cru já fosse o roteiro ("1 bloco").

const IMPERIO = `loninho, crie e esse pdf de roteiro do cliente imperio dos pisos
Duração: 30–35s

Criativo 1 — Araruama, Saquarema e São Pedro
Ângulo: loja próxima + variedade + preço + estoque
"Você de Araruama, Saquarema ou São Pedro da Aldeia está construindo ou reformando? Então antes de comprar seu piso, olha isso."
Na Império dos Pisos você encontra uma grande variedade de pisos e porcelanatos.
Clique agora no WhatsApp, envie sua metragem e faça seu orçamento com a Império dos Pisos.

Criativo 2 — "Vale a pena vir até a Império"
Ângulo: Rio Bonito, Silva Jardim, Casimiro + grandes orçamentos + estrutura
"Você de Rio Bonito, Silva Jardim ou Casimiro de Abreu está fazendo uma obra maior e procurando piso?"
Quanto maior a sua obra, mais importante é comparar antes de fechar.
Clique agora no WhatsApp, envie sua metragem e consulte as condições da Império dos Pisos.`;

const WT_SHOPPING = `O pet passa por exame pré operatório, pra avaliar a condição dele passar por uma cirurgia. Mesmo que pareça algo simples, mas a castração não deixa de ser um processo cirúrgico, que necessita de anestesia, sedação, ou seja, o pet precisa estar saudável.

Após o procedimento ele fica sob observação até o horário combinado, para a chegada do tutor.

O benefício de fazer conosco é que além do Ambiente e profissionais serem habilitados para tal procedimento, nosso protocolo de segurança no pré e pós operatório seguem todos os parâmetros.

loninho, eu preciso que voce crie um roteiro de gravacao para o cliente wt shopping com essas informacoes que te passei! em pdf`;

describe("separar o pedido do conteúdo", () => {
  it("reconhece o imperativo 'crie' (era o furo que imprimia o comando no PDF)", () => {
    expect(pediuPdf("loninho, crie e esse pdf de roteiro do cliente imperio dos pisos")).toBe(true);
  });

  it("a linha de comando NÃO entra no conteúdo do PDF", () => {
    const p = lerPedidoPdf(IMPERIO);
    expect(p.quer).toBe(true);
    expect(p.conteudo).not.toContain("loninho");
    expect(p.conteudo).not.toContain("crie e esse pdf");
  });

  it("não come fala legítima que só tem verbo ('está fazendo uma obra')", () => {
    const p = lerPedidoPdf(IMPERIO);
    expect(p.conteudo).toContain("está fazendo uma obra maior e procurando piso");
    expect(p.conteudo).toContain("Clique agora no WhatsApp");
  });
});

describe("diagramar × criar", () => {
  it("Imperio: o roteiro JÁ existe → só diagramar", () => {
    expect(lerPedidoPdf(IMPERIO).modo).toBe("diagramar");
  });

  it("WT Shopping: contexto + 'crie um roteiro com essas informações' → CRIAR", () => {
    const p = lerPedidoPdf(WT_SHOPPING);
    expect(p.modo).toBe("criar");
    expect(p.tipo).toBe("Roteiro de Vídeo");
    // O contexto vira matéria-prima da IA, sem a linha de comando junto.
    expect(p.conteudo).toContain("exame pré operatório");
    expect(p.conteudo).not.toContain("loninho");
  });

  it("'transforma esse roteiro em pdf' continua sendo diagramação", () => {
    const p = lerPedidoPdf(`loninho, transforma esse roteiro em pdf pro varejão\n\n${"Fala do roteiro. ".repeat(6)}`);
    expect(p.modo).toBe("diagramar");
  });
});

describe("blocos do roteiro", () => {
  const blocos = lerBlocos(lerPedidoPdf(IMPERIO).conteudo);

  it("separa Criativo 1 e Criativo 2 (antes vinha tudo num bloco só)", () => {
    expect(blocos).toHaveLength(2);
    expect(blocos[0].rotulo).toBe("Criativo 1");
    expect(blocos[1].rotulo).toBe("Criativo 2");
  });

  it("cada criativo guarda seu título e seu ângulo", () => {
    expect(blocos[0].titulo).toBe("Araruama, Saquarema e São Pedro");
    expect(blocos[0].angulo).toBe("loja próxima + variedade + preço + estoque");
    expect(blocos[1].titulo).toBe("Vale a pena vir até a Império");
    expect(blocos[1].angulo).toContain("Rio Bonito");
  });

  it("o ângulo NÃO vira fala pra gravar", () => {
    expect(blocos[0].paragrafos.join(" ")).not.toContain("loja próxima + variedade");
  });

  it("a duração do topo vale pros dois criativos", () => {
    expect(blocos[0].duracao).toBe("30–35s");
    expect(blocos[1].duracao).toBe("30–35s");
  });

  it("nenhuma fala se perde no caminho", () => {
    const tudo = blocos.flatMap((b) => b.paragrafos).join(" ");
    expect(tudo).toContain("Você de Araruama, Saquarema ou São Pedro da Aldeia");
    expect(tudo).toContain("Quanto maior a sua obra");
    expect(tudo).toContain("consulte as condições da Império dos Pisos");
  });

  it("texto sem marcação continua virando um bloco único (não regrediu)", () => {
    const b = lerBlocos("Uma fala só.\nOutra linha da mesma peça.");
    expect(b).toHaveLength(1);
    expect(b[0].paragrafos).toHaveLength(2);
  });

  it("tira negrito do WhatsApp em vez de imprimir asterisco", () => {
    const b = lerBlocos("**Criativo 1** — Teste\n*fala em negrito*");
    expect(b[0].rotulo).toBe("Criativo 1");
    expect(b[0].paragrafos[0]).toBe("fala em negrito");
  });
});
