// Comercial — Leva 1 (out/2026): etapas, meta, filtro de lixo, recebimento do site, importação,
// máscara de valores e as travas de acesso. Dados INVENTADOS: o repositório é público.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { normalizarEtapa, ehAberta, chanceDe, PROBABILIDADE_PADRAO, ETAPAS_ABERTAS, motivoValido } from "@/lib/crm/etapas";
import { calcularMeta, calcularEsforco, diasUteisDoMes, ehDiaUtil } from "@/lib/crm/meta";
import { avaliarLead, celularBR } from "@/lib/crm/filtro-lead";
import { assinar, conferirAssinatura, origemDoPacote, leadDoPacote, validarPacote, type PacoteSite } from "@/lib/crm/site-lead";
import { planejarImportacao, lerCsv, isoDeSP, mesmoTelefone } from "@/lib/crm/importar";
import { mascararValores } from "@/lib/texto/mascarar-valores";
import { proximoToque } from "@/lib/crm/cadencia";

describe("etapas do funil", () => {
  it("lê as etapas antigas como as novas", () => {
    expect(normalizarEtapa("lead")).toBe("novo");
    expect(normalizarEtapa("orcamento")).toBe("diagnostico");
    expect(normalizarEtapa("reuniao")).toBe("diagnostico");
    expect(normalizarEtapa("proposta")).toBe("proposta");
    expect(normalizarEtapa("NEGOCIACAO")).toBe("negociacao");
    expect(normalizarEtapa("qualquer coisa")).toBe("novo");
    expect(normalizarEtapa(null)).toBe("novo");
  });
  it("abertas = do Novo à Negociação", () => {
    expect(ETAPAS_ABERTAS).toEqual(["novo", "contato", "diagnostico", "proposta", "negociacao"]);
    expect(ehAberta("ganho")).toBe(false);
    expect(ehAberta("reuniao")).toBe(true);
  });
  it("chance: a do negócio quando válida; senão a da etapa", () => {
    expect(chanceDe({ estagio: "negociacao", probabilidade: 0.8 })).toBe(0.8);
    expect(chanceDe({ estagio: "negociacao", probabilidade: null })).toBe(PROBABILIDADE_PADRAO.negociacao);
    expect(chanceDe({ estagio: "contato", probabilidade: 7 })).toBe(PROBABILIDADE_PADRAO.contato); // inválida
    expect(chanceDe({ estagio: "ganho", probabilidade: 0.1 })).toBe(1);
    expect(chanceDe({ estagio: "perdido" })).toBe(0);
  });
  it("motivo de perda só da lista fechada", () => {
    expect(motivoValido("sem_resposta")).toBe(true);
    expect(motivoValido("caro demais")).toBe(false);
  });
});

describe("dias úteis (seg–sex, sem feriado nacional)", () => {
  it("12/10 (Aparecida) e fim de semana não contam", () => {
    expect(ehDiaUtil("2026-10-12")).toBe(false);
    expect(ehDiaUtil("2026-10-17")).toBe(false); // sábado
    expect(ehDiaUtil("2026-10-16")).toBe(true);
  });
  it("outubro/2026 tem 21 dias úteis", () => {
    expect(diasUteisDoMes("2026-10")).toHaveLength(21);
  });
  it("novembro/2026: Finados (seg 02) e Consciência Negra (sex 20) saem", () => {
    const nov = diasUteisDoMes("2026-11");
    expect(nov).not.toContain("2026-11-02");
    expect(nov).not.toContain("2026-11-20");
  });
});

describe("barra da meta", () => {
  const leads = [
    { estagio: "ganho", valorOrcamento: 1000, fechadoEm: "2026-10-05T00:00:00+00:00" },
    { estagio: "ganho", valorOrcamento: 2000, fechadoEm: "2026-10-14" },
    { estagio: "ganho", valorOrcamento: 5000, fechadoEm: "2026-09-30" },          // outro mês
    { estagio: "negociacao", valorOrcamento: 1000, probabilidade: 0.8, fechadoEm: null },
    { estagio: "proposta", valorOrcamento: 2000, fechadoEm: null },               // chance padrão 40%
    { estagio: "contato", valorOrcamento: 1000, fechadoEm: null, previsaoFechamento: "2026-11-10" }, // fecha em nov
    { estagio: "perdido", valorOrcamento: 9000, fechadoEm: "2026-10-03" },
  ];
  it("vendido, falta, ritmo, projeção, ponderado e cobertura no meio do mês", () => {
    const r = calcularMeta({ leads, metaValor: 10000, hoje: "2026-10-15" });
    expect(r.vendido).toBe(3000);
    expect(r.ganhos).toBe(2);
    expect(r.falta).toBe(7000);
    expect(r.progresso).toBeCloseTo(0.3);
    expect(r.decorridos).toBe(10); // 1–15/out sem 12/10: 1,2,5,6,7,8,9,13,14,15
    expect(r.restantes).toBe(12);  // 15 a 30/out, hoje incluso
    expect(r.ritmoNecessario).toBeCloseTo(7000 / 12);
    expect(r.projecao).toBeCloseTo((3000 / 10) * 21);
    expect(r.ponderado).toBeCloseTo(1000 * 0.8 + 2000 * 0.4); // o de novembro não entra
    expect(r.cobertura).toBeCloseTo(1600 / 7000);
    expect(r.nivelCobertura).toBe("vermelho");
  });
  it("sem meta: mostra o vendido, sem falta nem ritmo", () => {
    const r = calcularMeta({ leads, metaValor: null, hoje: "2026-10-15" });
    expect(r.meta).toBeNull();
    expect(r.falta).toBeNull();
    expect(r.ritmoNecessario).toBeNull();
    expect(r.vendido).toBe(3000);
  });
  it("meta batida: sem ritmo e sem cobertura", () => {
    const r = calcularMeta({ leads, metaValor: 2500, hoje: "2026-10-15" });
    expect(r.bateu).toBe(true);
    expect(r.falta).toBe(0);
    expect(r.ritmoNecessario).toBeNull();
    expect(r.cobertura).toBeNull();
  });
  it("cedo demais para projetar antes do 3º dia útil", () => {
    expect(calcularMeta({ leads, metaValor: 10000, hoje: "2026-10-02" }).projecao).toBeNull();
  });
  it("esforço: contatos da semana (seg–dom) e propostas do mês", () => {
    const e = calcularEsforco({
      toques: ["2026-10-12T13:00:00Z", "2026-10-15T20:00:00Z", "2026-10-09T13:00:00Z"],
      propostasEnviadasEm: ["2026-10-02", "2026-09-28", null], hoje: "2026-10-15",
    });
    expect(e.inicioSemana).toBe("2026-10-12");
    expect(e.contatosSemana).toBe(2);
    expect(e.propostasMes).toBe(1);
  });
});

describe("cadência respeita o 'retomar em'", () => {
  it("lead estacionado não tem toque atrasado até a data", () => {
    const base = { estagio: "contato", inicio: "2026-10-01", toques: [], hoje: "2026-10-15" };
    expect(proximoToque(base)?.situacao).toBe("atrasado");
    expect(proximoToque({ ...base, retomarEm: "2026-11-03" })).toBeNull();
  });
});

describe("filtro de lixo do formulário", () => {
  const real = { nome: "Maria Souza", empresa: "Madeireira Exemplo", email: "contato@exemplo.com.br", telefone: "(22) 99876-5432", desafio: "Vender mais na região" };
  it("cliente real passa, com o celular em E.164", () => {
    expect(avaliarLead(real)).toEqual({ ok: true, telefone: "5522998765432", telefoneDigitado: null });
  });
  it("nome todo em maiúsculas não é robô", () => {
    expect(avaliarLead({ ...real, nome: "MARIA SOUZA PEREIRA" }).ok).toBe(true);
  });
  it("robôs e propaganda caem", () => {
    expect(avaliarLead({ ...real, desafio: "Привет, хочу рассказать" })).toMatchObject({ ok: false, motivo: "texto_estrangeiro" });
    expect(avaliarLead({ ...real, desafio: "Ganhe dinheiro https://exemplo.top" })).toMatchObject({ ok: false, motivo: "link" });
    expect(avaliarLead({ ...real, nome: "Teste_abcd" })).toMatchObject({ ok: false, motivo: "nome_robo" });
    expect(avaliarLead({ ...real, nome: "QWERTYUI1912ASDFGH" })).toMatchObject({ ok: false, motivo: "nome_robo" });
    expect(avaliarLead({ ...real, nome: "Fulano", empresa: "Fulano", telefone: "412279771" })).toMatchObject({ ok: false, motivo: "nome_robo" });
    expect(avaliarLead({ ...real, nome: "Fulano", email: "xyz@spam.store" })).toMatchObject({ ok: false, motivo: "email_descartavel" });
  });
  it("teste da equipe cai", () => {
    expect(avaliarLead({ ...real, email: "lonemidiamkt@gmail.com" })).toMatchObject({ ok: false, motivo: "teste_equipe" });
    expect(avaliarLead({ ...real, nome: "Carlos Teste" })).toMatchObject({ ok: false, motivo: "teste_equipe" });
  });
  it("gente de verdade com telefone errado entra para conferir; sem e-mail, cai", () => {
    expect(avaliarLead({ ...real, telefone: "2298765432" })).toEqual({ ok: true, telefone: null, telefoneDigitado: "2298765432" });
    expect(avaliarLead({ ...real, telefone: "2298765432", email: "" })).toMatchObject({ ok: false, motivo: "telefone_invalido" });
  });
  it("celularBR: com/sem 55, máscara; fixo e DDD inexistente não", () => {
    expect(celularBR("+55 (22) 99876-5432")).toBe("5522998765432");
    expect(celularBR("22998765432")).toBe("5522998765432");
    expect(celularBR("552226454001")).toBeNull(); // fixo
    expect(celularBR("20998765432")).toBeNull();  // DDD 20 não existe
  });
});

describe("recebimento do site", () => {
  const segredo = "segredo-de-teste";
  const corpo = JSON.stringify({ id: "abc12345", lead: { nomeCompleto: "Maria Souza" } });
  it("assinatura confere, recusa adulterada e carimbo velho", () => {
    const ts = String(1_800_000_000_000);
    const sig = assinar(segredo, ts, corpo);
    expect(conferirAssinatura({ segredo, timestamp: ts, assinatura: sig, corpo, agora: 1_800_000_000_000 + 1000 })).toEqual({ ok: true });
    expect(conferirAssinatura({ segredo, timestamp: ts, assinatura: sig, corpo: corpo + " ", agora: 1_800_000_000_000 })).toMatchObject({ ok: false });
    expect(conferirAssinatura({ segredo, timestamp: ts, assinatura: sig, corpo, agora: 1_800_000_000_000 + 6 * 60_000 })).toMatchObject({ ok: false });
    expect(conferirAssinatura({ segredo, timestamp: null, assinatura: null, corpo, agora: 0 })).toMatchObject({ ok: false });
  });
  it("origem: anúncio quando há clique de anúncio ou utm paga", () => {
    expect(origemDoPacote({ fbclid: "x" })).toBe("Anúncio → site");
    expect(origemDoPacote({ utm_source: "facebook", utm_medium: "cpc" })).toBe("Anúncio → site");
    expect(origemDoPacote({ utm_source: "instagram", utm_medium: "bio" })).toBe("Site");
    expect(origemDoPacote(undefined)).toBe("Site");
  });
  it("monta o lead Novo com telefone, desafio, faixa e campanha", () => {
    const p: PacoteSite = {
      id: "abc12345",
      lead: { nomeCompleto: "Maria Souza", empresa: "Loja Exemplo", emailCorporativo: "m@exemplo.com", segmento: "Varejo", maiorDesafio: "Vender mais", faturamentoRotulo: "Abaixo de R$ 100 mil" },
      atribuicao: { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "outubro" },
    };
    const l = leadDoPacote(p, { ok: true, telefone: "5522998765432", telefoneDigitado: null }, "2026-10-17T07:58:03.000Z");
    expect(l).toMatchObject({ estagio: "novo", origem: "Anúncio → site", telefone: "5522998765432", externoId: "abc12345", cadenciaInicio: "2026-10-17" });
    expect(String(l.observacoes)).toContain("Desafio: Vender mais");
    expect(String(l.observacoes)).toContain("Campanha: facebook / cpc / outubro");
  });
  it("valida o pacote", () => {
    expect(validarPacote({ id: "abc12345", lead: { nomeCompleto: "X Y" } }).ok).toBe(true);
    expect(validarPacote({ id: "1", lead: { nomeCompleto: "X" } }).ok).toBe(false);
    expect(validarPacote({ id: "abc12345", lead: {} }).ok).toBe(false);
  });
});

describe("importação", () => {
  const dados = {
    lojas_rota: [
      { rota_loja_id: 1, empresa: "Loja Alfa", contato_nome: "Ana", telefone: "5522998765432", visitada_por: "Roberto", visitada_em: "2026-10-13T14:26:00+00:00" },
      { rota_loja_id: 2, empresa: "Loja Beta", telefone: null, visitada_por: "João", visitada_em: "2026-10-14T13:00:00+00:00" },
    ],
    oportunidades: [
      { empresa: "Loja Beta", mensalidade: 1000, etapa_sugerida: "negociacao", probabilidade: 0.8, rota_loja_id: 2 },
      { empresa: "Empresa Gama", mensalidade: 2000, situacao: "Em negociação", probabilidade: 0.5 },
      { empresa: "Empresa Delta", mensalidade: 500, situacao: "Contatar em novembro", retomar_em: "2026-11-03" },
    ],
  };
  const csv = [
    "Timestamp,Nome completo,WhatsApp,Email corporativo,Empresa,Segmento,Receita Mensal (MRR),Maior desafio (hoje)",
    '2026-10-16 09:55:58,Paulo Lima,5522998761111,p@exemplo.com,Açaí Exemplo,Varejo,Abaixo de R$ 100 mil,"Vender mais,\nno verão"',
    "2026-10-16 10:00:00,Paulo Lima,5522998761111,p@exemplo.com,Açaí Exemplo,Varejo,,",
    "2026-06-01 10:00:00,Antigo Cliente,5522998762222,a@exemplo.com,Antiga,Varejo,,",
    "2026-10-10 10:00:00,Robo_abcd,5522998763333,x@spam.store,Robo_efgh,Varejo,,",
  ].join("\n");
  const plano = planejarImportacao({ dados, csvPlanilha: csv, existentes: [], clientes: [], hoje: "2026-10-17" });
  it("cria as lojas e as oportunidades; a oportunidade da rota completa a loja", () => {
    const beta = plano.linhas.find((l) => l.chave === "rota:2")!;
    expect(beta.acao).toBe("criar");
    expect(beta.campos).toMatchObject({ estagio: "negociacao", valorOrcamento: 1000, probabilidade: 0.8, rotaLojaId: 2, origem: "Visita — Rota Lagos" });
    expect(plano.linhas.filter((l) => l.fonte === "oportunidade")).toHaveLength(2);
    expect(plano.linhas.find((l) => l.titulo === "Empresa Delta")!.campos.retomarEm).toBe("2026-11-03");
    expect(plano.totais.mensalidade).toBe(3500);
  });
  it("visita conta como primeiro contato e vira atividade na data real", () => {
    const alfa = plano.linhas.find((l) => l.chave === "rota:1")!;
    expect(alfa.campos).toMatchObject({ estagio: "contato", cadenciaInicio: "2026-10-13" });
    expect(alfa.atividades[0]).toMatchObject({ tipo: "visita", quando: "2026-10-13T14:26:00+00:00" });
  });
  it("planilha: entra o mais recente, duplicado/antigo/robô ficam de fora com o motivo", () => {
    const site = plano.linhas.filter((l) => l.fonte === "planilha");
    expect(site.filter((l) => l.acao === "criar")).toHaveLength(1);
    expect(site.some((l) => /Duplicado/.test(l.motivo))).toBe(true);
    expect(site.some((l) => /mais de 90 dias/.test(l.motivo))).toBe(true);
    expect(site.some((l) => /Descartado/.test(l.motivo))).toBe(true);
  });
  it("rodar de novo não duplica: o que já existe é ignorado", () => {
    const existentes = plano.linhas.filter((l) => l.acao === "criar").map((l, i) => ({
      id: `id${i}`, empresa: (l.campos.empresa as string) ?? null, contatoNome: String(l.campos.contatoNome), telefone: (l.campos.telefone as string) ?? null,
      rotaLojaId: (l.campos.rotaLojaId as number) ?? null, externoId: (l.campos.externoId as string) ?? null,
    }));
    const de_novo = planejarImportacao({ dados, csvPlanilha: csv, existentes, clientes: [], hoje: "2026-10-17" });
    expect(de_novo.totais.criar).toBe(0);
  });
  it("quem já é cliente não vira lead", () => {
    const p = planejarImportacao({ dados, existentes: [], clientes: [{ nome: "Empresa Gama", telefones: [] }], hoje: "2026-10-17" });
    expect(p.linhas.find((l) => l.titulo === "Empresa Gama")!.acao).toBe("ignorar");
  });
  it("utilitários: CSV com quebra de linha no campo, data de SP e telefone tolerante", () => {
    expect(lerCsv('a,b\n1,"x,\ny"')[1]).toEqual(["1", "x,\ny"]);
    expect(isoDeSP("2026-10-17 04:58:03")).toBe("2026-10-17T04:58:03-03:00");
    expect(mesmoTelefone("(22) 99876-5432", "5522998765432")).toBe(true);
  });
});

describe("máscara de valores (repasse para a equipe)", () => {
  it("some o dinheiro, fica a frase", () => {
    expect(mascararValores("Fechou por 1.234, desconto de 200")).toBe("Fechou por [valor], desconto de [valor]");
    expect(mascararValores("Mensalidade R$ 1.234,00 + implantação R$500")).toBe("Mensalidade [valor] + implantação [valor]");
    expect(mascararValores("Pediu R$ 2,5 mil, negociamos 1234 reais")).toBe("Pediu [valor], negociamos [valor]");
    expect(mascararValores("Topa 1.234/mês se incluir Google")).toBe("Topa [valor] se incluir Google");
    expect(mascararValores("Cobra 2 mil por mês hoje")).toBe("Cobra [valor] hoje");
  });
  it("não mexe em data, telefone, CEP, horário nem seguidores", () => {
    const t = "Reunião 17/10/2026 às 14h30, tel (22) 99876-5432, CEP 28900-000. Tem 10 mil seguidores e 3 lojas.";
    expect(mascararValores(t)).toBe(t);
  });
});

describe("travas de acesso do comercial", () => {
  const raiz = path.resolve(__dirname, "..");
  const arquivos = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
  it("o agente de atendimento (lib/cs) nunca lê as tabelas do comercial", () => {
    const citam = arquivos(path.join(raiz, "lib/cs")).filter((f) => /\bcrm_(leads|metas|lead_activities|recebidos|leads_descartados)\b/.test(readFileSync(f, "utf8")));
    expect(citam.map((f) => path.relative(raiz, f))).toEqual([]);
  });
  it("toda rota de /api/crm confere o papel do comercial no servidor", () => {
    const rotas = arquivos(path.join(raiz, "app/api/crm")).filter((f) => f.endsWith("route.ts"));
    expect(rotas.length).toBeGreaterThanOrEqual(5);
    for (const f of rotas) {
      const src = readFileSync(f, "utf8");
      expect(src, path.relative(raiz, f)).toMatch(/PAPEIS_COMERCIAL/);
      expect(src, path.relative(raiz, f)).not.toMatch(/getServerUser\(/);
    }
  });
  it("o repasse para a equipe não carrega o valor negociado", () => {
    const src = readFileSync(path.join(raiz, "lib/cs/handoff.ts"), "utf8");
    expect(src).not.toMatch(/Valor negociado:\s*\$\{/); // a linha montada com o valor (o comentário explica que saiu)
    expect(src).not.toMatch(/valor_orcamento/);
    expect(src).toMatch(/mascararValores/);
  });
});
