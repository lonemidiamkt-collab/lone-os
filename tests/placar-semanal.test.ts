import { describe, it, expect } from "vitest";
import {
  produtoDoAnuncio, citacaoDoAnuncio, segmentoDeVoz, montarPlacar, falaDoResultado, PERFIS_VOZ,
  type EntradaPlacar,
} from "@/lib/traffic/placar-semanal";

// Nomes reais das contas (creative_snapshots, out/2026).
describe("produtoDoAnuncio — o produto pelo nome e pela medida, sem preço", () => {
  it.each([
    ["ADS - ESTATICO - TELHA FIBROCIMENTO 2,44 X 1,10 - R$ 59:00", "telha fibrocimento 2,44×1,10"],
    ["ADS - CIMENTO CP3 31,00", "cimento CP3"],
    ["ADS - CIMENTO CP3 -  32 - 16/10", "cimento CP3"],
    ["ADS - CAIXA D'AGUA 430,00", "caixa d'água"],
    ["ADS - ESTATICO - DECORA MATTE 18L", "decora matte 18 L"],
    ["ADS - ESTATICO - MASSA CORRIDA PVA", "massa corrida PVA"],
    ["ADS - ESTATICO - TELHA KINGSPAN 1", "telha kingspan"],
    ["ADS - IAMGEM - FECHA MES - TELHA ESMALTADA", "telha esmaltada"],
    ["ADS - ESTATICO - DUCHA LORENZETTI", "ducha lorenzetti"],
    ["ADS - ESTATICO - TELHA FIBROCIMENTO 4MM — Cópia", "telha fibrocimento 4 mm"],
    ["ADS - ESTATICO - CABO SIL 2,5MM", "cabo sil 2,5 mm"],
    ["ADS - ESTATICO - AREIA LAVADA CAMINHAO", "areia lavada caminhão"],
    ["ADS - ESTATICO - TV BOX", "TV box"],
    ["ADS - ESTATICO - TOXINA BOTULINICA TERÇO SUPERIOR", "toxina botulínica terço superior"],
    ["ADS - ESTATICO - BOMBA SUBMERSA — Cópia", "bomba submersa"],
    ["ADS - VÍDEO - BOTOX 2 [INFLUENCER] — Cópia", "botox"],
  ])("%s → %s", (nome, esperado) => {
    const p = produtoDoAnuncio(nome);
    expect(p.ehProduto).toBe(true);
    expect(p.texto).toBe(esperado);
  });

  it("nunca deixa preço passar", () => {
    for (const nome of ["ADS - CHAPA ST 38,50", "ADS - ESTATICO - TELHA GALVANIZADA 31,65", "ADS - ESTATICO - TELHA FIBROCIMENTO 2,44 X 1,10 - R$ 59:00"]) {
      expect(produtoDoAnuncio(nome).texto).not.toMatch(/R\$|38,50|31,65|59/);
    }
  });

  it("vídeo sem produto vira a frase de abertura, com acento", () => {
    const p = produtoDoAnuncio("ADS - VIDEO - CHEGOU A HORA DE VOCE REFORMAR");
    expect(p.ehProduto).toBe(false);
    expect(p.formato).toBe("video");
    expect(p.texto).toBe("Chegou a hora de você reformar");
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - CHEGOU A HORA DE VOCE REFORMAR" })).toBe('o vídeo "Chegou a hora de você reformar"');
  });

  it("revenda de carros: o nome é o modelo", () => {
    expect(produtoDoAnuncio("ADS - VÍDEO - JEEP COMPASS", "veiculos").texto).toBe("Jeep Compass");
    expect(produtoDoAnuncio("ADS - ESTATICO - HB20", "veiculos").texto).toBe("HB20");
    expect(produtoDoAnuncio("ADS - VIDEO - BMW M3", "veiculos").texto).toBe("BMW M3");
  });

  it("frase que não diz nada não é citada; a que diz ganha acento", () => {
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - SE VOCE É DE" })).toBeNull();
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - EI VOCE — Cópia" })).toBeNull();
    expect(citacaoDoAnuncio({ nome: "ADS - MOTION - VOCÊ SABIA" })).toBeNull();
    expect(citacaoDoAnuncio({ nome: "ADS - VÍDEO - Curto / transformação / CTA" })).toBeNull();
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO - POSTE PADRÃO FIBRA ENTREGANDO V3" })).toBe("poste padrão fibra entregando");
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO  - HA 40 ANOS" })).toBe('o anúncio "Há 40 anos"');
    expect(citacaoDoAnuncio({ nome: "ADS - VÍDEO -DEIXA EU TE FAZER UMA PERGUNTA" })).toBe('o vídeo "Deixa eu te fazer uma pergunta"');
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - SE VOCÊ É DE SÃO PEDRO DA ALDEIA" })).toBe('o vídeo "Se você é de São Pedro da Aldeia"');
  });

  it("regra do setor: marca de remédio vira o procedimento, 'grátis' sai, fórmula de farmácia não é citada", () => {
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - BOTOX" }, "estetica")).toBe("toxina botulínica");
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO - 2 AREAS PEQUENAS GRATIS" }, "estetica")).toBe("2 áreas pequenas");
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO - FORMULA EMAGRECEDORA" }, "farmacia")).toBeNull();
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - ENVIE SUA RECEITA PELO WHATSAPP" }, "farmacia")).toBe('o vídeo "Envie sua receita pelo WhatsApp"');
  });

  it("sobra do preço tirado, verbo de chamada e cidade não viram produto", () => {
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO - PISOS A PARTIR DE R$ 39,90" })).toBe("pisos");
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - ACABAMOS DE RECEBER UMA CARRETA DE PISOS" })).toBe('o vídeo "Acabamos de receber uma carreta de pisos"');
    expect(produtoDoAnuncio("ADS - ESTATICO - LOJA CABO FRIO").ehProduto).toBe(false);
  });

  it("a voz segue o anúncio quando o cadastro erra o ramo", () => {
    expect(segmentoDeVoz({ nome: "Hentzy Acabamentos", cnae_principal: "4744-0/05" })).toBe("pisos");
    const t = montarPlacar(entrada({ criativos: [criativo("ADS - ESTATICO - PORCELANATO 60X60", 9, 5)] }, "moveis")).texto!;
    expect(t).toMatch(/E aí na loja, a semana vendeu mais ou menos que a anterior\?/); // pergunta de loja de piso, não de showroom
  });

  it("nome genérico não é citado", () => {
    expect(citacaoDoAnuncio({ nome: "Novo anúncio de Tráfego" })).toBeNull();
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO - ONDE ESTAMOS" })).toBeNull();
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO - PEDIU" })).toBeNull();
  });
});

describe("segmentoDeVoz — o nome, o nicho solar, o CNAE e o nicho, nessa ordem", () => {
  it.each([
    [{ nome: "Araruama Tintas", cnae_principal: "4741-5/00", nicho: "Construção e materiais" }, "tintas"],
    [{ nome: "Imperio dos Pisos", cnae_principal: "4679-6/99", nicho: "Construção e materiais" }, "pisos"],
    [{ nome: "Engetec", cnae_principal: "4321-5/00", nicho: "Energia solar" }, "solar"],
    [{ nome: "Contele Energia Solar", cnae_principal: "3101-2/00", nicho: "Energia solar" }, "solar"],
    [{ nome: "Lagos padrão", cnae_principal: "4321-5/00", nicho: "Construção e materiais" }, "construcao"],
    [{ nome: "UNAFER", cnae_principal: "4744-0/01", nicho: "Construção e materiais" }, "ferragens"],
    [{ nome: "Madereira D´Aldeia", cnae_principal: "4671-1/00" }, "madeira"],
    [{ nome: "Veneza Estofados", cnae_principal: "4754-7/01" }, "moveis"],
    [{ nome: "Óticas Raki", cnae_principal: "8650-0/99", nicho: "Saúde e clínicas" }, "otica"],
    [{ nome: "Body Skin Araruama", cnae_principal: "9602-5/02" }, "estetica"],
    [{ nome: "JP barbearia", cnae_principal: "9602-5/01" }, "barbearia"],
    [{ nome: "Veterinaria Regional", cnae_principal: "7500-1/00" }, "veterinaria"],
    [{ nome: "Farmacia - Arte em Manipulação", cnae_principal: "4771-7/02" }, "farmacia"],
    [{ nome: "MAX CONTABILIDADE", cnae_principal: "6920-6/01" }, "contabilidade"],
    [{ nome: "Portuga P'Neus", cnae_principal: "4530-7/05" }, "pneus"],
    [{ nome: "EDUMAR AUTO PEÇAS", cnae_principal: "4530-7/03" }, "autopecas"],
    [{ nome: "Léo carros", cnae_principal: "4511-1/02" }, "veiculos"],
    [{ nome: "BAZAR RIBEIRO", cnae_principal: "4789-0/99", nicho: "Moda e vestuário" }, "bazar"],
    [{ nome: "Loja nova sem nada" }, "varejo"],
  ])("%o → %s", (c, esperado) => {
    expect(segmentoDeVoz(c)).toBe(esperado);
  });

  it("todo segmento tem pergunta e pelo menos 5 dicas de uma linha", () => {
    for (const [seg, p] of Object.entries(PERFIS_VOZ)) {
      expect(p.pergunta, seg).toMatch(/\?$/);
      expect(p.dicas.length, seg).toBeGreaterThanOrEqual(5);
      for (const d of p.dicas) {
        expect(d, seg).not.toMatch(/\n/);
        expect(d.length, seg).toBeLessThanOrEqual(200);
        // regra 7 do playbook: zero jargão de marketing com o dono
        expect(d.toLowerCase(), seg).not.toMatch(/\b(ctr|cpm|cpc|lead|leads|engajamento|alcance|impress)/);
      }
    }
  });
});

const kpis = (custo: number | null, varRes: number | null, anterior = 34) => [
  { chave: "resultados" as const, rotulo: "Conversas", valor: 38, anterior, variacaoPct: varRes, natureza: "maior_melhor" as never, tom: "neutro" as never },
  { chave: "investimento" as const, rotulo: "Investimento", valor: 159.6, anterior: 150, variacaoPct: 6, natureza: "neutra" as never, tom: "neutro" as never },
  { chave: "custo" as const, rotulo: "Custo por conversa", valor: custo, anterior: 4.4, variacaoPct: -4, natureza: "menor_melhor" as never, tom: "neutro" as never },
];
const criativo = (nome: string, resultados: number, custo: number) => ({ id: nome, nome, campanha: null, resultados, investimento: resultados * custo, custo, miniatura: null });

function entrada(over: Partial<EntradaPlacar["relatorio"]> = {}, segmento: EntradaPlacar["segmento"] = "construcao"): EntradaPlacar {
  return {
    clienteId: "c1", segmento, hoje: "2026-10-26",
    relatorio: {
      janela: { inicio: "2026-10-19", fim: "2026-10-25", dias: 7, tipo: "semana", rotulo: "19 a 25 out 2026" },
      tipo: "mensagens", total: 38, semVeiculacao: false, criativosIndisponiveis: false,
      kpis: kpis(4.2, 12) as never,
      criativos: [
        criativo("ADS - ESTATICO - TELHA FIBROCIMENTO 2,44 X 1,10 - R$ 59:00", 14, 4.0),
        criativo("ADS - CIMENTO CP3 31,00", 9, 4.5),
        criativo("ADS - VIDEO - CHEGOU A HORA DE VOCE REFORMAR", 6, 5),
      ],
      ...over,
    },
  };
}

describe("montarPlacar — o texto da segunda", () => {
  it("número primeiro, os dois produtos com medida, dica e a pergunta; até 5 linhas", () => {
    const p = montarPlacar(entrada());
    expect(p.texto).toBe([
      "Bom dia! Relatório da semana (19/10 a 25/10) aqui em cima.",
      "*Placar:* 38 conversas no WhatsApp vindas do anúncio, R$ 4,20 em média por conversa — 12% a mais que na semana anterior.",
      "*O que mais puxou conversa:* telha fibrocimento 2,44×1,10 (14 conversas) e cimento CP3 (9).",
      `*Dica:* ${p.texto!.split("*Dica:* ")[1].split("\n")[0]}`,
      "E aí na loja, a semana vendeu mais ou menos que a anterior?",
    ].join("\n"));
    expect(p.texto!.split("\n").length).toBeLessThanOrEqual(5);
    expect(p.dica).toBe("nicho");
    expect(PERFIS_VOZ.construcao.dicas).toContain(p.texto!.split("*Dica:* ")[1].split("\n")[0]);
  });

  it("nunca leva o nome do anúncio, preço ou jargão", () => {
    const t = montarPlacar(entrada()).texto!;
    expect(t).not.toMatch(/ADS|ESTATICO|R\$ 59|31,00|CTR|CPM|lead|alcance/);
  });

  it("variação pequena vira 'no mesmo ritmo'; queda forte avisa o time", () => {
    expect(montarPlacar(entrada({ kpis: kpis(4.2, 3) as never })).texto).toMatch(/no mesmo ritmo da semana anterior/);
    const queda = montarPlacar(entrada({ kpis: kpis(4.2, -40, 63) as never }));
    expect(queda.texto).toMatch(/40% a menos que na semana anterior/);
    expect(queda.alerta).toBe("queda");
  });

  it("semana sem resultado ou sem anúncio rodando não vira placar automático (o gestor explica)", () => {
    expect(montarPlacar(entrada({ total: 0 }))).toMatchObject({ texto: null, alerta: "zero" });
    expect(montarPlacar(entrada({ semVeiculacao: true }))).toMatchObject({ texto: null, alerta: "sem_veiculacao" });
  });

  it("leitura por anúncio falhou: sai sem a linha dos anúncios, sem inventar", () => {
    const t = montarPlacar(entrada({ criativosIndisponiveis: true, criativos: [] })).texto!;
    expect(t).not.toMatch(/O que mais/);
    expect(t.split("\n")).toHaveLength(4);
  });

  it("produto bem mais barato que a média vira a dica (pedido de estoque) — só em loja", () => {
    const criativos = [criativo("ADS - ESTATICO - PORCELANATO 70X70 ACETINADO", 20, 2.0), criativo("ADS - CIMENTO CP3", 9, 4.5)];
    const p = montarPlacar(entrada({ criativos }));
    expect(p.dica).toBe("dados");
    expect(p.texto).toMatch(/\*Dica:\* Porcelanato 70×70 acetinado trouxe conversa bem mais barata que a média da semana — se tiver estoque pra mais 15 dias/);
    // serviço não tem estoque: a dica é a do nicho
    expect(montarPlacar(entrada({ criativos }, "contabilidade")).dica).toBe("nicho");
  });

  it("cópias do mesmo anúncio somam; anúncio com 1 ou 2 não é citado", () => {
    const t = montarPlacar(entrada({
      criativos: [criativo("ADS - IMAGEM - COMBO LEVANTE", 15, 5), criativo("ADS - IMAGEM - COMBO LEVANTE — Cópia", 13, 5), criativo("ADS - ESTATICO - CIMENTO CP3", 2, 5)],
    })).texto!;
    expect(t).toMatch(/\*O que mais puxou conversa:\* combo levante \(28 conversas\)\./);
    expect(t).not.toMatch(/cimento/);
  });

  it("frase de vídeo com palavra de produto continua sendo frase", () => {
    expect(citacaoDoAnuncio({ nome: "ADS - VIDEO - TA PRECISANDO DE UM POSTE" })).toBe('o vídeo "Tá precisando de um poste"');
    expect(citacaoDoAnuncio({ nome: "ADS - ESTATICO - A PORTA IDEAL" })).toBe('o anúncio "A porta ideal"');
  });

  it("base pequena ou salto grande: o número da semana anterior, não a %", () => {
    expect(montarPlacar(entrada({ kpis: kpis(4.2, 2000, 1) as never })).texto).toMatch(/na semana anterior foi 1\./);
    expect(montarPlacar(entrada({ kpis: kpis(4.2, 233, 12) as never })).texto).toMatch(/na semana anterior foram 12\./);
    expect(montarPlacar(entrada({ kpis: kpis(4.2, -40, 8) as never })).alerta).toBeNull(); // queda sobre base pequena não alarma
  });

  it("clínica fala de agenda; contato no lugar de lead", () => {
    const t = montarPlacar(entrada({ tipo: "leads" }, "estetica")).texto!;
    expect(t).toMatch(/38 pessoas deixaram o contato pelo anúncio/);
    expect(t).toMatch(/agenda de avaliações da semana encheu/);
    expect(falaDoResultado("leads", 1).placar).toBe("1 pessoa deixou o contato pelo anúncio");
  });

  it("a dica gira de uma semana para outra", () => {
    const a = montarPlacar({ ...entrada(), hoje: "2026-10-26" }).texto;
    const b = montarPlacar({ ...entrada(), hoje: "2026-11-02" }).texto;
    expect(a).not.toBe(b);
  });
});
