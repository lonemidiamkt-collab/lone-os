import { describe, it, expect } from "vitest";
import { motivoParaNaoVirarRegra, podeVirarRegra, filtrarRegras } from "@/lib/cs/regras";

// Exemplos REAIS da base de produção (auditoria 22/08/2026). As "boas" são as poucas regras
// acionáveis que existiam entre 378; as "ruins" são o que entupia a memória do cliente.

const BOAS = [
  "Nome do fabricante deve ser incluído junto com o nome do piso.",
  "O cliente não quer que postagens sejam feitas sem sua revisão.",
  "O cliente não considera explorar parafusos como um tema relevante.",
  "A cafeteria e um compressor estão disponíveis no local e devem ser mencionados na legenda.",
  "Horário de funcionamento: Seg a sexta, 8h até as 17h",
  "Conferir o endereço na arte: o correto é Av. Brasil 120.",
  "Não usar vermelho nas artes deste cliente.",
  "Toda legenda fecha com o telefone da loja.",
];

const RUINS: [string, string][] = [
  ["Qualyvinil 6em1 emborrachada branco 18lts custa R$ 590,00, à vista R$ 520,00.", "catalogo"],
  ["Valor do produto: R$85,00 no cartão; R$69,00 em dinheiro/pix.", "catalogo"],
  ["Produto: Piso Ret 70x70 Rochamaxx R7004 ACET, Preço: R$24,99/m²", "catalogo"],
  ["Produto: Sabonete íntimo.", "catalogo"],
  ["Promoção válida até o dia 25 de agosto.", "promocao"],
  ["Argamassa grátis em promoção.", "promocao"],
  ["A equipe está em treinamento e reciclagem esta semana.", "efemero"],
  ["O material da próxima semana está sendo preparado para aprovação na próxima sexta.", "efemero"],
  ["O cliente está organizando o CRM e enfrentando dificuldades para arrastar conversas.", "narrativa"],
  ["O cliente pretende incluir algumas coisas para vender.", "narrativa"],
  ["IPVA GRÁTIS", "curto"],
];

describe("portão do que vira regra", () => {
  it("deixa passar as regras que realmente ensinam algo", () => {
    for (const t of BOAS) {
      expect(motivoParaNaoVirarRegra(t), `barrou indevidamente: "${t}"`).toBeNull();
    }
  });

  it("barra catálogo, promoção, efêmero e narrativa — com o motivo certo", () => {
    for (const [texto, motivo] of RUINS) {
      expect(motivoParaNaoVirarRegra(texto), `deixou passar: "${texto}"`).toBe(motivo);
    }
  });

  it("'não quer' é regra; 'está fazendo' é narrativa — a diferença não pode se perder", () => {
    expect(podeVirarRegra("O cliente não quer arte com fundo escuro.")).toBe(true);
    expect(podeVirarRegra("O cliente está reformando a loja.")).toBe(false);
  });
});

describe("filtrarRegras", () => {
  it("descarta o que a IA devolver fora dos 4 tipos e o que o portão barra", () => {
    const out = filtrarRegras([
      { texto: "Toda legenda fecha com o endereço da loja.", tipo: "copy" },
      { texto: "Porcelanato sai por R$ 69,99 o m².", tipo: "copy" },       // catálogo
      { texto: "Não usar a cor laranja.", tipo: "inventado" },              // tipo inválido
      { texto: "Não usar a cor laranja.", tipo: "visual" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.tipo)).toEqual(["copy", "visual"]);
  });

  it("não duplica a mesma regra vinda duas vezes", () => {
    const out = filtrarRegras([
      { texto: "Sempre citar o fabricante.", tipo: "copy" },
      { texto: "sempre citar o fabricante.", tipo: "copy" },
    ]);
    expect(out).toHaveLength(1);
  });
});

// O cap de aprendizado é POR FONTE. Três jobs rodam no mesmo domingo (conversas, releitura do
// ciclo, correção); com cap global, o primeiro consumia as vagas e calava os outros — e o mais
// valioso seria silenciado por rodar meia hora depois.
describe("teto de aprendizado por fonte", () => {
  it("o cap é contado pelo autor, não no total do cliente", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync("lib/cs/regras.ts", "utf8"));
    const trecho = src.slice(src.indexOf("const desde24h"), src.indexOf("const jaTem"));
    expect(trecho, "o cap precisa filtrar por author, senão as fontes se canibalizam")
      .toContain('.eq("author", meta.author)');
  });
});
