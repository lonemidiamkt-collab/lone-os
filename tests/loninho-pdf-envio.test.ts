// tests/loninho-pdf-envio.test.ts — o PDF do Loninho que não chega aparece como falha (auditoria
// 25/10/2026, 11.9) e "cria uma proposta em PDF" não vira texto cru com cara de peça pronta (11.10).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lerPedidoPdf, pedidoParaEscrever, textoNaoEscrevo } from "@/lib/cs/pedido-pdf";

const RAIZ = path.resolve(__dirname, "..");
const INFO = "\n\nA loja tem 3 unidades, vende porcelanato e quer focar em obra grande. Público: construtoras da Região dos Lagos.";

describe("pedido de ESCREVER uma peça que eu não escrevo (11.10)", () => {
  it("o erro original: 'cria uma proposta com essas informações' era diagramado e rotulado 'Proposta'", () => {
    const texto = `loninho, cria uma proposta em pdf pro Bazar com essas informações${INFO}`;
    expect(lerPedidoPdf(texto)).toMatchObject({ quer: true, tipo: "Proposta", modo: "criar" }); // o que levava ao bug
    expect(pedidoParaEscrever(texto)).toBe("Proposta");
  });

  it("briefing e pauta também", () => {
    expect(pedidoParaEscrever(`loninho escreve um briefing em pdf pro Bazar${INFO}`)).toBe("Briefing");
    expect(pedidoParaEscrever(`loninho monta uma pauta em pdf com esses dados${INFO}`)).toBe("Pauta de Conteúdo");
  });

  it("diagramar o que já veio pronto continua diagramando", () => {
    expect(pedidoParaEscrever("faz um pdf dessa pauta\n\nSegunda: post de preço\nQuarta: antes e depois")).toBeNull();
    expect(pedidoParaEscrever(`transforma essa proposta em pdf${INFO}`)).toBeNull();
    expect(pedidoParaEscrever(`monta a proposta em pdf${INFO}`)).toBeNull();
  });

  it("documento genérico com informações: diagramar não engana ninguém", () => {
    expect(pedidoParaEscrever(`loninho faz um pdf com essas informações${INFO}`)).toBeNull();
  });

  it("a resposta diz o que existe e que nada foi montado", () => {
    expect(textoNaoEscrevo("Proposta")).toMatch(/Ainda não escrevo \*proposta\* do zero/);
    expect(textoNaoEscrevo("Proposta")).toMatch(/transforma em PDF/);
    expect(textoNaoEscrevo("Proposta")).toMatch(/Não montei nada/);
    expect(textoNaoEscrevo("Roteiro de Vídeo")).toMatch(/cria um roteiro/);
  });
});

describe("cada envio do PDF é conferido (11.9)", () => {
  const inbound = readFileSync(path.join(RAIZ, "app/api/cs/inbound/route.ts"), "utf8");
  const atender = readFileSync(path.join(RAIZ, "lib/loninho/pedidos/atender.ts"), "utf8");

  it("nenhum csSendGroupDocument no inbound tem o resultado jogado fora", () => {
    const soltos = inbound.split("\n").filter((l) => /^\s*await csSendGroupDocument\(/.test(l));
    // O contrato (grupo de cadastro) é de outra frente; os do Loninho (diagramar, roteiro, calendário) são conferidos.
    expect(soltos.length).toBeLessThanOrEqual(1);
    expect(inbound).toContain("const envPdf = await csSendGroupDocument(");
    expect(inbound).toContain("pdfChegou = env.ok");
  });

  it("o pedido do time confere o texto e a reserva, e avisa no sino quando nada chega", () => {
    expect(atender).not.toMatch(/if \("texto" in r\) \{ await csSendGroupText\(ctx\.groupJid, r\.texto, undefined, META\); return; \}/);
    expect(atender).toContain("avisarNoSino(");
    expect(atender).toMatch(/env\.incerto \?/);
  });
});
