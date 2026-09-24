// tests/cs-manha.test.ts — a manhã unificada: UMA mensagem no lugar de bom-dia + postagem +
// pendências + setup. O que protege: seção vazia some, nada a dizer = nada enviado, ordem fixa,
// e cada seção sai com as MESMAS palavras da rota antiga (a manchete perde só o "mandei em PDF").

import { describe, it, expect } from "vitest";
import { montarManha, secaoBomDia, secaoPendencias, resumoManha, DIVISOR_MANHA, type SecaoManha } from "@/lib/cs/manha";
import { manchetePanorama, filasPanorama, type PanoramaBomDia } from "@/lib/reports/bomDiaPdf";
import { textoPorDono, type BlocoDono } from "@/lib/cs/cobranca-nominal";
import { textoArquivadas, buildPendenciasDigest } from "@/lib/cs/pendencias";
import { contarItens } from "@/lib/cs/enviar-aviso";
import { escolherFormato } from "@/lib/cs/formato-aviso";

const limpo: PanoramaBomDia = {
  data: "quarta-feira, 23/09", esperandoOk: 0, emProducao: 0, artesProntas: 0,
  semPostPlanejado: 0, esfriando: 0, encalhados: 0,
};
const cheio: PanoramaBomDia = { ...limpo, esperandoOk: 3, artesProntas: 5, esfriando: 1 };

const blocos: BlocoDono[] = [
  { dono: "Carlos Augusto", itens: [{ dono: "Carlos Augusto", cliente: "Mr.distribuidora", acao: "confirmar e postar a arte", dias: 12 }], resto: 2, maiorEspera: 12 },
  { dono: "sem dono", itens: [{ dono: null, cliente: "Paradise", acao: 'dar um "oi" — sumiu do grupo', dias: 9 }], resto: 0, maiorEspera: 9 },
];

describe("montarManha — o que entra e em que ordem", () => {
  it("tudo vazio = nenhuma mensagem", () => {
    expect(montarManha([])).toBeNull();
    expect(montarManha([{ chave: "postagem", texto: "" }, { chave: "setup", texto: "   \n" }])).toBeNull();
  });

  it("dia limpo do bom-dia sozinho NÃO vira mensagem (é só moldura)", () => {
    const bd = secaoBomDia({ panorama: limpo, blocos: [] });
    expect(bd.soMoldura).toBe(true);
    expect(montarManha([bd])).toBeNull();
  });

  it("dia limpo acompanha quando outra seção tem conteúdo — a saudação abre a mensagem", () => {
    const m = montarManha([
      { chave: "setup", texto: "🚀 *Setup de cliente novo*\n• Bio — Carlos" },
      secaoBomDia({ panorama: limpo, blocos: [] }),
    ])!;
    expect(m.secoes).toEqual(["bom-dia", "setup"]);
    expect(m.texto.startsWith("☀️ *Bom dia, time!*")).toBe(true);
    expect(m.texto).toContain("Nada em fila — dia limpo! 🚀");
  });

  it("ordem fixa: bom-dia, postagem, pendências, setup — separadas pelo divisor", () => {
    const secoes: SecaoManha[] = [
      { chave: "setup", texto: "S" },
      { chave: "pendencias", texto: "P" },
      { chave: "postagem", texto: "Q" },
      secaoBomDia({ panorama: cheio, blocos: [] }),
    ];
    const m = montarManha(secoes)!;
    expect(m.secoes).toEqual(["bom-dia", "postagem", "pendencias", "setup"]);
    expect(m.texto.endsWith(`Q\n\n${DIVISOR_MANHA}\n\nP\n\n${DIVISOR_MANHA}\n\nS`)).toBe(true);
  });

  it("seção vazia some sem deixar divisor sobrando", () => {
    const m = montarManha([{ chave: "postagem", texto: "Q" }, { chave: "pendencias", texto: "" }, { chave: "setup", texto: "S" }])!;
    expect(m.texto).toBe(`Q\n\n${DIVISOR_MANHA}\n\nS`);
    expect(m.secoes).toEqual(["postagem", "setup"]);
  });

  it("junta os fatos de todas as seções sem repetir (o porta-voz precisa de cada um uma vez)", () => {
    const m = montarManha([
      { chave: "postagem", texto: "Q", fatos: ["sem-pauta:a:2026-09-23"] },
      { chave: "setup", texto: "S", fatos: ["sem-anuncio:b", "sem-pauta:a:2026-09-23"] },
      { chave: "pendencias", texto: "", fatos: ["nao-entra"] },
    ])!;
    expect(m.fatos.sort()).toEqual(["sem-anuncio:b", "sem-pauta:a:2026-09-23"]);
  });
});

describe("seção do bom-dia — as palavras de sempre", () => {
  it("é a manchete da rota antiga, sem o rodapé do PDF, seguida do de cada um", () => {
    const s = secaoBomDia({ panorama: cheio, blocos });
    expect(s.texto.startsWith(manchetePanorama(cheio, null))).toBe(true);
    expect(s.texto).not.toContain("Mandei o de cada um em PDF");
    expect(s.texto).toContain(textoPorDono(blocos));
    expect(s.soMoldura).toBe(false);
  });

  it("a manchete da rota cs-bom-dia continua com o rodapé do PDF (comportamento antigo)", () => {
    expect(manchetePanorama(cheio)).toContain("_Mandei o de cada um em PDF abaixo._");
    expect(manchetePanorama(cheio)).toContain(filasPanorama(cheio));
  });

  it("com rótulo, o dono vira menção; 'sem dono' continua escrito", () => {
    const s = secaoBomDia({ panorama: cheio, blocos, rotulo: () => "@5522999999999" });
    expect(s.texto).toContain("👤 @5522999999999");
    expect(s.texto).not.toContain("*Carlos Augusto*");
    expect(s.texto).toContain("👤 _sem dono_");
  });
});

describe("seção de pendências", () => {
  it("o aviso das arquivadas vem antes do lembrete das vivas — numa seção só", () => {
    const arquivadas = textoArquivadas([{ cliente: "Atlas", resumo: "trocar a bio" }]);
    const lembrete = buildPendenciasDigest([{ cliente: "Varejão", resumo: "post de promoção", codigo: "k3" }]);
    const s = secaoPendencias(arquivadas, lembrete);
    expect(s.texto.indexOf("arquivado")).toBeLessThan(s.texto.indexOf("Varejão"));
    expect(secaoPendencias("", "").texto).toBe("");
  });

  it("texto das arquivadas é o mesmo que o cs-pendencias mandava", () => {
    expect(textoArquivadas([])).toBe("");
    const t = textoArquivadas([{ cliente: "Atlas", resumo: "trocar a bio" }]);
    expect(t).toBe([
      "🗑️ *Um pedido de cliente foi arquivado por falta de decisão* (14 dias sem ok nem não):",
      "• *Atlas* — trocar a bio",
      "Se algum ainda vale, me diz o cliente e o que era que eu crio o card agora.",
    ].join("\n"));
    const muitas = textoArquivadas(Array.from({ length: 12 }, (_, i) => ({ cliente: `C${i}`, resumo: "x" })));
    expect(muitas).toContain("12 pedidos de cliente foram arquivados");
    expect(muitas).toContain("_e mais 2._");
  });
});

describe("legenda do PDF da manhã", () => {
  it("traz as filas, o que tem dentro e de quem é cada pedaço", () => {
    const r = resumoManha({
      panorama: cheio, secoes: ["bom-dia", "postagem", "pendencias", "setup"], blocos,
      rotulo: (d) => (d === "Carlos Augusto" ? "@5522999999999" : `*${d}*`),
    });
    const [filas, dentro, quem] = r.split("\n");
    expect(filas).toBe(filasPanorama(cheio));
    expect(dentro).toBe("No PDF: o de cada um · pauta de hoje · sugestões esperando ok/não · setup de cliente novo");
    // Carlos tem 1 item listado + 2 cortados = 3.
    expect(quem).toBe("👤 @5522999999999 (3) · _sem dono_ (1)");
  });

  it("sem bom-dia (feriado) a legenda não inventa filas nem donos", () => {
    const r = resumoManha({ panorama: null, secoes: ["postagem", "setup"], blocos: [], rotulo: (d) => d });
    expect(r).toBe("No PDF: pauta de hoje · setup de cliente novo");
  });
});

describe("formato da manhã", () => {
  it("a manhã cheia passa do limite do WhatsApp e vai de PDF (regra única de volume)", () => {
    const m = montarManha([
      secaoBomDia({ panorama: cheio, blocos }),
      { chave: "pendencias", texto: buildPendenciasDigest(Array.from({ length: 6 }, (_, i) => ({ cliente: `C${i}`, resumo: "pedido" }))) },
    ])!;
    expect(escolherFormato({ itens: contarItens(m.texto), texto: m.texto })).toBe("pdf");
  });
});
