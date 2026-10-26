// tests/modelos-casa.test.ts — a revisão dos modelos de contrato (26/10/2026).
//
// Decisões do Roberto: "só tráfego" com o escopo do contrato da JP, encerramento proporcional aos
// dias (o da Celmapel), prazo determinado com cláusula de prazo própria. O texto mora no banco e é
// editável pela tela — por isso a revisão troca parágrafo a parágrafo e RECUSA quando o parágrafo
// esperado sumiu, em vez de sobrescrever às cegas o que alguém escreveu.

import { describe, it, expect } from "vitest";
import {
  revisarModelo, conferirModelo, trocarParagrafo, clausulasDaModalidade, dataPorExtenso, terminoPrevisto,
  OBJETO_TRAFEGO, PRAZO_DETERMINADO, sqlDaRevisao, type Clausula,
} from "@/lib/contracts/modelos-casa";
import { validarContrato, bloqueios, escopoContratado } from "@/lib/contracts/validacao";

// Os parágrafos do modelo ANTIGO que a revisão troca, como estavam no banco.
const CICLOS_ANTIGO = [
  "2.1. O presente contrato entra em vigor na data de sua assinatura.",
  "2.3. A vigência contratual será organizada em ciclos sucessivos de 3 (três) meses, sendo o primeiro ciclo contado a partir da confirmação do pagamento da primeira mensalidade.",
  "2.4. Encerrado cada ciclo, caso nenhuma das partes manifeste intenção de alterar ou encerrar a contratação, o contrato será automaticamente renovado por novo ciclo de 3 (três) meses.",
  "2.10. Durante o período de aviso prévio:\na) os serviços permanecerão ativos;\nb) as obrigações contratuais continuarão vigentes;\nc) a CONTRATANTE deverá colaborar com a execução dos serviços; e\nd) permanecerão devidas as mensalidades que vencerem enquanto os serviços estiverem disponíveis.",
  "2.11. O encerramento produzirá efeitos na data mensal de vencimento que coincidir com o término do aviso prévio ou na primeira data de vencimento imediatamente posterior ao cumprimento integral dos 30 (trinta) dias.",
  "2.12. Cumprido o aviso prévio e quitados os valores correspondentes ao período de prestação dos serviços, o contrato será encerrado sem multa de cancelamento, sem cobrança das mensalidades restantes do ciclo trimestral em andamento e sem obrigação de renovação por novo ciclo.",
  "2.13. Durante qualquer ciclo, as partes poderão negociar nova proposta.",
].join("\n\n");

const RESCISAO_ANTIGA = [
  "10.1. O encerramento imotivado do contrato seguirá exclusivamente o aviso prévio e as condições estabelecidas na Cláusula Segunda.",
  "10.2. Independentemente do motivo do encerramento, permanecerão devidos:\na) as mensalidades vencidas;\nb) as mensalidades correspondentes ao período de aviso prévio;\nc) os serviços adicionais previamente aprovados; e\nd) as multas, os juros e os encargos decorrentes de inadimplência.",
  "10.3. O contrato poderá ser rescindido por descumprimento.",
].join("\n\n");

const ids = ["objeto", "ciclos", "obrig_contratada", "obrig_contratante", "ativos", "pagamento", "execucao", "sigilo", "aliciamento", "rescisao", "gerais", "foro"];
const modeloAntigo = (objeto = "1.1. Prestação de serviços de gestão de tráfego pago, design, edição e criativos."): Clausula[] =>
  ids.map((id) => ({
    id,
    title: id === "objeto" ? "DO OBJETO E DO ESCOPO" : id.toUpperCase(),
    body: id === "objeto" ? objeto : id === "ciclos" ? CICLOS_ANTIGO : id === "rescisao" ? RESCISAO_ANTIGA : `${id} — texto.`,
  }));

describe("revisão dos modelos", () => {
  it("o modelo antigo é acusado; o revisado passa", () => {
    const antes = conferirModelo("assessoria_trafego", modeloAntigo()).map((p) => p.problema);
    expect(antes).toEqual(expect.arrayContaining([
      "encerramento ainda na data de vencimento (não proporcional)",
      "10.2 sem o limite da data efetiva do encerramento",
      "tráfego sem o escopo da JP (direção criativa e roteiros)",
      "tráfego não exclui social media",
    ]));
    expect(conferirModelo("assessoria_trafego", revisarModelo("assessoria_trafego", modeloAntigo()))).toEqual([]);
  });

  it("encerramento proporcional: encerra no dia, sem cobrar depois, sem a data de vencimento", () => {
    const ciclos = revisarModelo("lone_growth", modeloAntigo()).find((c) => c.id === "ciclos")!.body;
    expect(ciclos).toMatch(/independentemente da data mensal de vencimento/);
    expect(ciclos).toMatch(/calculado proporcionalmente aos dias de vigência/);
    expect(ciclos).not.toMatch(/produzirá efeitos na data mensal de vencimento/);
    expect(ciclos).not.toMatch(/permanecerão devidas as mensalidades que vencerem/);
    // O que não era para mexer ficou igual — 2.3, 2.4 e 2.13 seguem lá, na ordem.
    expect(ciclos.indexOf("2.3.")).toBeLessThan(ciclos.indexOf("2.10."));
    expect(ciclos).toMatch(/2\.13\. Durante qualquer ciclo/);
  });

  it("só o tráfego troca o objeto; Lone Growth e social mantêm o deles", () => {
    const lg = revisarModelo("lone_growth", modeloAntigo("1.1. Lone Growth: tráfego, social e design."));
    expect(lg.find((c) => c.id === "objeto")!.body).toBe("1.1. Lone Growth: tráfego, social e design.");
    const tr = revisarModelo("assessoria_trafego", modeloAntigo());
    expect(tr.find((c) => c.id === "objeto")!.body).toBe(OBJETO_TRAFEGO.body);
  });

  it("aplicar duas vezes dá o mesmo texto", () => {
    const uma = revisarModelo("assessoria_trafego", modeloAntigo());
    expect(revisarModelo("assessoria_trafego", uma)).toEqual(uma);
  });

  it("recusa quando o parágrafo esperado sumiu (alguém editou pela tela)", () => {
    const editado = modeloAntigo().map((c) => (c.id === "ciclos" ? { ...c, body: "2.1. Texto novo, sem 2.10." } : c));
    expect(() => revisarModelo("lone_growth", editado)).toThrow(/2\.10\. não encontrado/);
    expect(() => trocarParagrafo("10.1. a\n\n10.3. b", "10.2.", "x")).toThrow();
  });

  it("não confunde 2.1. com 2.10.", () => {
    expect(trocarParagrafo("2.1. um\n\n2.10. dez", "2.1.", "2.1. novo")).toBe("2.1. novo\n\n2.10. dez");
  });
});

describe("escopo do tráfego (contrato da JP)", () => {
  it("inclui direção criativa, roteiro e edição pontual; exclui artes, social e outras plataformas", () => {
    expect(OBJETO_TRAFEGO.body).toMatch(/direção criativa e elaboração de roteiros/);
    expect(OBJETO_TRAFEGO.body).toMatch(/edição pontual dos vídeos fornecidos pela CONTRATANTE/);
    expect(OBJETO_TRAFEGO.body).toMatch(/Os criativos utilizados nas campanhas serão fornecidos pela CONTRATANTE/);
    expect(OBJETO_TRAFEGO.body).toMatch(/criação de artes/);
    expect(OBJETO_TRAFEGO.body).toMatch(/planejamento e gestão de redes sociais/);
    expect(OBJETO_TRAFEGO.body).toMatch(/Google Ads, TikTok Ads/);
    // Sem nome de cliente chumbado: quem aparece é o marcador.
    expect(OBJETO_TRAFEGO.body).not.toMatch(/JP|Barbearia/);
    expect(OBJETO_TRAFEGO.body).toMatch(/\{\{cliente_nome_fantasia\}\}/);
  });

  it("a auditoria aprova o contrato de tráfego revisado — o que fica DE FORA não conta como escopo", () => {
    const clausulas = revisarModelo("assessoria_trafego", modeloAntigo())
      .map((c) => ({ title: c.title, body: c.body.replace(/\{\{cliente_nome_fantasia\}\}/g, "Loja X") }));
    const b = bloqueios(validarContrato({
      razaoSocial: "Loja X Ltda", segmento: "varejo", enderecoRua: "Rua A, 10", cargo: "Sócio", email: "a@b.c",
      tipoServico: "assessoria_trafego", valorMensal: 1000, diaPagamento: 10, modalidade: "ciclos", clausulas,
    }));
    expect(b).toEqual([]);
    expect(escopoContratado(clausulas)).not.toMatch(/criação de artes/);
    expect(escopoContratado(clausulas)).toMatch(/Meta Ads/);
  });
});

describe("prazo determinado", () => {
  it("troca a cláusula de ciclos pela de prazo, no mesmo lugar", () => {
    const m = clausulasDaModalidade(modeloAntigo(), "determinado");
    expect(m[1].id).toBe("ciclos");
    expect(m[1].body).toBe(PRAZO_DETERMINADO.body);
    expect(m.map((c) => c.body).join("\n")).not.toMatch(/automaticamente renovado/);
    const r101 = clausulasDaModalidade([{ id: "rescisao", title: "R", body: "10.1. Segue a Cláusula Segunda, não sendo aplicada multa de cancelamento ou cobrança do restante do ciclo trimestral." }], "determinado");
    expect(r101[0].body).toBe("10.1. Segue a Cláusula Segunda, não sendo aplicada multa de cancelamento.");
    expect(clausulasDaModalidade(modeloAntigo(), "ciclos")).toEqual(modeloAntigo());
  });

  it("a auditoria barra prazo determinado com a cláusula de renovação automática", () => {
    const base = {
      razaoSocial: "Loja X Ltda", segmento: "varejo", enderecoRua: "Rua A, 10", cargo: "Sócio", email: "a@b.c",
      tipoServico: "lone_growth", valorMensal: 1000, diaPagamento: 10, modalidade: "determinado" as const, duracaoMeses: 2,
    };
    const errado = bloqueios(validarContrato({ ...base, clausulas: modeloAntigo().map((c) => ({ title: c.title, body: c.body })) }));
    expect(errado.some((a) => a.codigo === "ERRO_CRITICO_010")).toBe(true);
    const certo = bloqueios(validarContrato({ ...base, clausulas: clausulasDaModalidade(modeloAntigo(), "determinado").map((c) => ({ title: c.title, body: c.body })) }));
    expect(certo.some((a) => a.codigo === "ERRO_CRITICO_010")).toBe(false);
  });

  it("término no mesmo dia N meses depois (JP: 09/09 → 09/11)", () => {
    expect(terminoPrevisto("2026-09-09", 2)).toBe("2026-11-09");
    expect(terminoPrevisto("2026-11-15", 3)).toBe("2027-02-15");
    expect(terminoPrevisto("2026-01-31", 1)).toBe("2026-02-28");
    expect(terminoPrevisto("lixo", 2)).toBeNull();
    expect(dataPorExtenso("2026-09-09")).toBe("09 de setembro de 2026");
    expect(dataPorExtenso("2026-13-01")).toBeNull();
  });
});

describe("ciclos sem meses na frase", () => {
  it("não é 'prazo ausente' — o prazo dos ciclos é o próprio ciclo", () => {
    const b = bloqueios(validarContrato({
      razaoSocial: "Loja X Ltda", segmento: "varejo", enderecoRua: "Rua A, 10", cargo: "Sócio", email: "a@b.c",
      tipoServico: "lone_growth", valorMensal: 1000, diaPagamento: 10, modalidade: "ciclos",
      clausulas: [{ title: "Objeto", body: "Marketing." }],
    }));
    expect(b.some((a) => a.codigo === "ERRO_CRITICO_003")).toBe(false);
  });

  it("prazo determinado sem meses continua barrado", () => {
    const b = bloqueios(validarContrato({
      razaoSocial: "Loja X Ltda", tipoServico: "lone_growth", valorMensal: 1000, diaPagamento: 10,
      modalidade: "determinado", clausulas: [{ title: "Objeto", body: "Marketing." }],
    }));
    expect(b.some((a) => a.codigo === "ERRO_CRITICO_003")).toBe(true);
  });
});

describe("SQL da revisão", () => {
  const exportado = [
    { id: "a1", service_type: "assessoria_trafego", clauses: modeloAntigo(), updated_at: "2026-10-26T19:40:25.847+00:00" },
    { id: "d1", service_type: "assessoria_design", clauses: [], updated_at: "2026-10-26T19:40:25.652+00:00" },
  ];

  it("só por cima da versão exportada, tudo ou nada", () => {
    const sql = sqlDaRevisao(exportado);
    expect(sql).toMatch(/^do \$revisao\$/);
    expect(sql).toMatch(/where id = 'a1' and updated_at = '2026-10-26T19:40:25.847\+00:00'/);
    expect(sql).toMatch(/raise exception 'modelo assessoria_trafego mudou/);
    expect(sql).not.toMatch(/'d1'/); // modelo vazio fica de fora
    // O JSON entra inteiro e volta igual ao revisado.
    const json = /\$m0\$(.*)\$m0\$::jsonb/.exec(sql)![1];
    expect(JSON.parse(json)).toEqual(revisarModelo("assessoria_trafego", modeloAntigo()));
  });

  it("modelo já revisado não gera nada", () => {
    const revisado = [{ ...exportado[0], clauses: revisarModelo("assessoria_trafego", modeloAntigo()) }];
    expect(sqlDaRevisao(revisado)).toBe("");
  });
});

