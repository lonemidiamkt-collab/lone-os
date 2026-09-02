import { describe, it, expect } from "vitest";
import { avaliar, type Indicador } from "@/lib/scores/indicador";
import { scoreDimensao, loneScore, leituraLoneScore } from "@/lib/scores/executivo";
import { scorePessoa, capacidade } from "@/lib/scores/performance";
import { calcularSaude, distribuicao } from "@/lib/scores/health";
import { classificar, resumirAtrasos, type CardParaAtraso } from "@/lib/scores/atraso";

// Os números vêm da tela que o Roberto analisou em 02/09.

const ind = (o: Partial<Indicador> & { chave: string; valor: number | null; meta: number }): Indicador => ({
  titulo: o.chave, natureza: "qualidade", ...o,
});

describe("ponto 4: barra de progresso só onde faz sentido", () => {
  it("ROAS 3,3 de 4 NÃO é '83% concluído' e não mostra barra", () => {
    const a = avaliar(ind({ chave: "roas", titulo: "ROAS médio", valor: 3.3, meta: 4, unidade: "x" }));
    expect(a.mostrarBarra).toBe(false);
    expect(a.leitura).toMatch(/0.7x abaixo da meta/);
    expect(a.situacao).toBe("atencao");
  });

  it("leads 365 de 500 é acumulativo: barra faz sentido", () => {
    const a = avaliar(ind({ chave: "leads", natureza: "acumulativa", valor: 365, meta: 500, fracaoDoPeriodo: 0.7 }));
    expect(a.mostrarBarra).toBe(true);
    expect(a.score).toBe(73);
  });
});

describe("ponto 3: situação atual x projeção", () => {
  it("acumulativa no ritmo certo é 'na meta' mesmo com a barra pela metade", () => {
    // Metade do mês, metade da meta: está no ritmo. Comparar com a meta cheia assustaria à toa.
    const a = avaliar(ind({ chave: "leads", natureza: "acumulativa", valor: 250, meta: 500, fracaoDoPeriodo: 0.5 }));
    expect(a.score).toBe(50);
    expect(a.situacao).toBe("no_alvo");
    expect(a.projecao).toBe(500);
  });

  it("ritmo fraco projeta abaixo e a projeção tem situação própria", () => {
    const a = avaliar(ind({ chave: "leads", natureza: "acumulativa", valor: 120, meta: 500, fracaoDoPeriodo: 0.5 }));
    expect(a.situacao).toBe("critico");
    expect(a.projecao).toBe(240);
    expect(a.situacaoProjetada).toBe("critico");
    expect(a.leitura).toMatch(/projeta 240/);
  });

  it("saúde 68 de meta 80 NÃO pode aparecer como saudável", () => {
    // Era exatamente isto que a tela dizia "No ritmo". 85% de atingimento é atenção — o ponto é
    // que nada entre 80 e 100 pode sair verde.
    const a = avaliar(ind({ chave: "saude", titulo: "Saúde média", valor: 68, meta: 80 }));
    expect(a.situacao).toBe("atencao");
    expect(["otimo", "no_alvo"]).not.toContain(a.situacao);
    expect(a.leitura).toMatch(/12 abaixo da meta/);
  });
});

describe("métrica inversa: menor é melhor", () => {
  it("churn 0% com meta <5% é ótimo, não zero", () => {
    const a = avaliar(ind({ chave: "churn", natureza: "inversa", valor: 0, meta: 5, unidade: "%" }));
    expect(a.situacao).toBe("otimo");
    expect(a.score).toBeGreaterThanOrEqual(100);
  });

  it("CPL R$ 20 com meta R$ 15 é atenção/crítico, não 133% de sucesso", () => {
    const a = avaliar(ind({ chave: "cpl", natureza: "inversa", valor: 20, meta: 15, unidade: "R$" }));
    expect(a.score).toBe(75);
    expect(a.situacao).toBe("critico");
    expect(a.leitura).toMatch(/acima da meta/);
  });
});

describe("sem dado nunca vira zero", () => {
  it("valor null é 'sem_dado', não 0%", () => {
    // "Rodrigo, tempo médio 0,0 d" era ausência de dado exibida como desempenho perfeito.
    const a = avaliar(ind({ chave: "tempo", valor: null, meta: 3 }));
    expect(a.situacao).toBe("sem_dado");
    expect(a.score).toBeNull();
    expect(a.leitura).toBe("sem dado conectado");
  });
});

describe("ponto 1: Lone Score ponderado, não média simples", () => {
  const dims = [
    scoreDimensao("financeiro", [ind({ chave: "f", valor: 86, meta: 100 })]),
    scoreDimensao("clientes", [ind({ chave: "c", valor: 61, meta: 100 })]),
    scoreDimensao("comercial", [ind({ chave: "co", valor: 54, meta: 100 })]),
    scoreDimensao("operacao", [ind({ chave: "o", valor: 88, meta: 100 })]),
    scoreDimensao("qualidade", [ind({ chave: "q", valor: 81, meta: 100 })]),
  ];

  it("pondera pelos pesos definidos, não pela média", () => {
    const r = loneScore(dims);
    // Média simples daria 74. Ponderado (30/25/20/15/10) dá 73 — o peso do financeiro segura.
    expect(r.score).toBe(73);
    expect(r.cobertura).toBe(100);
  });

  it("dimensão sem dado sai da conta e os pesos se redistribuem", () => {
    // Comercial tem 1 lead no banco. Contar como zero derrubaria a empresa por lacuna de cadastro.
    const semComercial = dims.map((d) => d.dimensao === "comercial"
      ? scoreDimensao("comercial", [ind({ chave: "co", valor: null, meta: 100 })]) : d);
    const r = loneScore(semComercial);
    expect(r.score).toBeGreaterThan(73);   // sem o 54 puxando, o score sobe
    expect(r.cobertura).toBe(80);          // 100 - 20 do comercial
    expect(leituraLoneScore(r)).toMatch(/parcial/);
  });

  it("uma dimensão em colapso limita o score geral", () => {
    // Tudo excelente, menos comercial em 30. A média ponderada daria 80 e esconderia o colapso.
    const r = loneScore([
      scoreDimensao("financeiro", [ind({ chave: "f", valor: 92, meta: 100 })]),
      scoreDimensao("clientes", [ind({ chave: "c", valor: 90, meta: 100 })]),
      scoreDimensao("comercial", [ind({ chave: "co", valor: 30, meta: 100 })]),
      scoreDimensao("operacao", [ind({ chave: "o", valor: 95, meta: 100 })]),
      scoreDimensao("qualidade", [ind({ chave: "q", valor: 90, meta: 100 })]),
    ]);
    expect(r.limitadoPorCritica).toBe(true);
    expect(r.score).toBe(69);
    expect(leituraLoneScore(r)).toMatch(/Comercial/);
  });

  it("superar meta numa dimensão não compra crédito para outra ruim", () => {
    const d = scoreDimensao("operacao", [
      ind({ chave: "a", valor: 300, meta: 100 }),   // 300% de atingimento
      ind({ chave: "b", valor: 20, meta: 100 }),
    ]);
    expect(d.score).toBe(60);   // (100 + 20) / 2, não (300 + 20) / 2
  });
});

describe("ponto 5 e 6: score da pessoa mede o que ela controla", () => {
  it("saúde da carteira pesa 15% no social, não 100%", () => {
    // Era o defeito: "Score = saúde média da carteira" punia o social por tráfego ruim,
    // cliente que não aprova, produto ruim.
    const r = scorePessoa({ pessoa: "Carlos", funcao: "social", carteira: 24, indicadores: [
      ind({ chave: "entregas_no_prazo", valor: 88, meta: 100 }),
      ind({ chave: "producao", valor: 92, meta: 100 }),
      ind({ chave: "aprovacao", valor: 86, meta: 100 }),
      ind({ chave: "saude_carteira", valor: 67, meta: 100 }),
      ind({ chave: "sla", valor: 96, meta: 100 }),
      ind({ chave: "organizacao", valor: 80, meta: 100 }),
    ]});
    expect(r.score).toBeGreaterThan(80);   // não é 67
    expect(r.cobertura).toBe(100);
  });

  it("aponta o gargalo pelo peso, não pelo pior número solto", () => {
    const r = scorePessoa({ pessoa: "Rodrigo", funcao: "designer", indicadores: [
      ind({ chave: "entregas_no_prazo", valor: 73, meta: 100 }),  // peso 30 → perda 810
      ind({ chave: "erros", valor: 60, meta: 100 }),               // peso 5 → perda 200
      ind({ chave: "retrabalho", valor: 90, meta: 100 }),
    ]});
    expect(r.gargalo?.titulo).toBe("entregas_no_prazo");
  });

  it("nota com cobertura baixa é sinalizada", () => {
    const r = scorePessoa({ pessoa: "X", funcao: "designer", indicadores: [
      ind({ chave: "entregas_no_prazo", valor: 90, meta: 100 }),
      ind({ chave: "tempo_medio", valor: null, meta: 3 }),
      ind({ chave: "aprovacao_primeira", valor: null, meta: 100 }),
    ]});
    expect(r.cobertura).toBe(30);   // só o de peso 30 tinha dado
  });
});

describe("ponto 8: capacidade avisa antes de quebrar", () => {
  it("94% de utilização vira aviso com o número de vagas", () => {
    const c = capacidade("social", 47, 2, 25);
    expect(c.utilizacao).toBeCloseTo(0.94, 2);
    expect(c.situacao).toBe("atencao");
    expect(c.aviso).toMatch(/\+3 clientes/);
  });

  it("acima da capacidade é crítico e diz isso", () => {
    const c = capacidade("social", 55, 2, 25);
    expect(c.situacao).toBe("critico");
    expect(c.aviso).toMatch(/ACIMA da capacidade/);
  });
});

describe("ponto 10 e 11: saúde com o porquê, e distribuição em vez de média", () => {
  it("o breakdown explica a nota", () => {
    const s = calcularSaude({ clientId: "1", cliente: "Cliente X", componentes: {
      resultado: 40, entrega: 55, relacionamento: 80, sentimento: 45,
      pendencias: 70, engajamento: 60, financeiro: 100,
    }, observacoes: ["21 dias sem contato"] });
    expect(s.score).toBe(57);
    expect(s.nivel).toBe("risco");
    expect(s.motivos[0]).toBe("21 dias sem contato");
    expect(s.motivos.join(" ")).toMatch(/Resultado em 40/);
  });

  it("a média esconde o que a distribuição mostra", () => {
    const clientes = [
      ...Array.from({ length: 40 }, (_, i) => calcularSaude({ clientId: `s${i}`, cliente: `S${i}`, componentes: { resultado: 80, entrega: 80 } })),
      ...Array.from({ length: 3 }, (_, i) => calcularSaude({ clientId: `r${i}`, cliente: `R${i}`, componentes: { resultado: 20, entrega: 20 } })),
    ];
    const d = distribuicao(clientes);
    expect(d.media).toBe(76);        // média parece aceitável…
    expect(d.risco).toBe(3);          // …e esconde 3 churns potenciais
    expect(d.emRisco.map((c) => c.cliente)).toContain("R0");
  });

  it("cliente sem dado não é cliente em risco", () => {
    const s = calcularSaude({ clientId: "1", cliente: "Novo", componentes: {} });
    expect(s.score).toBeNull();
    expect(s.nivel).toBe("sem_dado");
  });
});

describe("ponto 17: atraso da Lone x atraso do cliente", () => {
  const card = (o: Partial<CardParaAtraso>): CardParaAtraso => ({
    id: "c", status: "in_production", diasAtePost: 2, designerEntregou: false,
    clienteAprovouEm: null, bloqueadoPor: null, ...o,
  });

  it("esperando o cliente aprovar NÃO é atraso da Lone", () => {
    expect(classificar(card({ status: "client_approval", designerEntregou: true, diasAtePost: -8 })))
      .toBe("aguardando_cliente");
  });

  it("esperando material do cliente também não é nosso", () => {
    expect(classificar(card({ bloqueadoPor: "aguardando fotos do cliente", diasAtePost: -5 })))
      .toBe("aguardando_material");
  });

  it("passou do post e ainda está com a gente: atraso nosso", () => {
    expect(classificar(card({ diasAtePost: -1 }))).toBe("atrasado_lone");
  });

  it("os dois percentuais aparecem separados", () => {
    const r = resumirAtrasos([
      card({ diasAtePost: -1 }),
      card({ status: "client_approval", designerEntregou: true }),
      card({ status: "client_approval", designerEntregou: true }),
      card({ bloqueadoPor: "falta material do cliente" }),
      card({ diasAtePost: 3 }),
    ], [8, 12]);
    expect(r.atrasoInternoPct).toBe(20);
    expect(r.atrasoClientePct).toBe(60);
    expect(r.diasMediosCliente).toBe(10);
  });
});
