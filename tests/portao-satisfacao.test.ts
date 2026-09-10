import { describe, it, expect } from "vitest";
import { decidirAlerta, ehSaidaDeVerdade, temCelebracao, ehFragmento } from "@/lib/cs/portao-satisfacao";

// As mensagens abaixo NÃO são inventadas: são os 66 alertas que o Loninho disparou no grupo do time
// entre 16/07 e 10/09 de 2026, lidos da tabela notifications. A auditoria de 10/09 mostrou ~50 falso-
// positivos. Cada caso aqui é um alerta que existiu — o teste trava a regressão pelo dado real.

// O que o modelo devolveu na época, para os casos em que ele acusou desgaste:
const NEG_MEDIO = { sentimento: "negativo", risco: "medio", churn: false } as const;
const NEG_ALTO = { sentimento: "negativo", risco: "alto", churn: false } as const;
const CHURN = { sentimento: "negativo", risco: "alto", churn: true } as const;

describe("portão do termômetro — falso-positivos reais de produção", () => {
  it("elogio ao próprio funcionário não é insatisfação (Contele, 10/09)", () => {
    // O caso que o Roberto trouxe: a cliente elogiando o funcionário DELA, com palmas.
    const t = "Ele é desenrolado mas não faz . Agora vai. Depois do puxão de orelha ! 👏🏻👏🏻👏🏻👏🏻";
    expect(temCelebracao(t)).toBe(true);
    expect(decidirAlerta(NEG_MEDIO, t).alerta).toBe(false);
  });

  it("crítica de peça não vira alerta, mesmo curta e seca", () => {
    for (const t of [
      "Medida está errada, e 45 x 45",
      "O modelo do piso está errado",
      "Esse material está com a imagem errada(essa imagem é o sirius)",
      "No primeiro vídeo a legenda está diferente do que está sendo dito",
      "Pegou muito o som externo",
      "Porém foi postado a anterior onde não tem a informação que é polido",
      "Eu só não gostei desse aqui na hora de falar do valor, né, do piso, entendeu? Não gostei não. Eu acho que ficou melhor se deixar igual esse",
    ]) {
      expect(decidirAlerta(NEG_MEDIO, t).alerta, t).toBe(false);
    }
  });

  it("fragmento curto sem contexto vira silêncio", () => {
    for (const t of ["Esse aqui não", "Não gostei", "N funcionamos", "Larga o aço", "Não chegou ainda", "N tá carregando", "não é o meu então", "Que for menos prejuízo", "Isso já foi aprovado"]) {
      expect(ehFragmento(t), t).toBe(true);
      expect(decidirAlerta(NEG_MEDIO, t).alerta, t).toBe(false);
    }
  });

  it("assunto do negócio dele não é insatisfação com a agência", () => {
    for (const t of [
      "Movimento parado",
      "Boxes de 10 não vende. E foge do padrão também.",
      "Não estamos tendo muitas vendas on-line não",
      "Família o custo por conversa está muito alto",
      "Só to achando o gasto por mensagem alto",
      "Saquarema dobrou o custo por lead praticamente",
      "Pararam de chegar leeds qualificados",
    ]) {
      expect(decidirAlerta(NEG_MEDIO, t).alerta, t).toBe(false);
    }
  });

  it("churn só quando o objeto é o contrato", () => {
    // Os três 🚨 que dispararam em produção — nenhum era saída de cliente.
    expect(ehSaidaDeVerdade("Cancelei o login")).toBe(false);
    expect(ehSaidaDeVerdade("Vou fazer de outro banco")).toBe(false);
    expect(ehSaidaDeVerdade("Quanto aos vídeos das visitas as fábricas já perdemos tempo, e sempre fica essa questão de depender de alguém, então vamos abortar essa missão")).toBe(false);
    for (const t of ["Cancelei o login", "Vou fazer de outro banco"]) {
      expect(decidirAlerta(CHURN, t).churn, t).toBe(false);
    }
  });

  it("reconhece saída de verdade", () => {
    expect(ehSaidaDeVerdade("pessoal, quero cancelar")).toBe(true);
    expect(ehSaidaDeVerdade("vamos encerrar o contrato no fim do mês")).toBe(true);
    expect(ehSaidaDeVerdade("estou pensando em encerrar")).toBe(true);
    expect(ehSaidaDeVerdade("não vamos continuar com vocês")).toBe(true);
    expect(decidirAlerta(CHURN, "vamos rescindir o contrato").churn).toBe(true);
  });
});

describe("portão do termômetro — o que TEM que continuar alertando", () => {
  const REAIS = [
    "Não tive resposta!@all",
    "Já era para estar programado para o dia de / Hj",
    "Pessoal, entendo a questão do planejamento e que o material foi enviado na sexta-feira. Mas quero deixar claro o ponto da minha insatisfação com a falta de acompanhamento",
    "Boa tarde!!!! Pessoal, preciso falar com vocês com bastante sinceridade porque estou realmente indignado com essa situação. Já tem praticamente uma semana",
    "Mateus, quando for assim, dá uma atenção, que botaram desde 10 horas, entendeu? Aí se eu não mando, não ia subir.",
    "Vanessa, gostaria de ver com voçe sobre os relatorios e feedbacks do time imperio dos pisos! estamos precisando e não tivemos retorno",
    "Não temos feito com frequência como sempre trabalhamos .",
    "Eles não consegue saber onde estão errando , onde acertou … Quem fornece relatório somos nós. Esse grupo é exatamente para isso",
    "Sei que vocês estão aí querendo ajudar, mas a gente acaba sendo enrolado num responde na hora",
  ];
  it("reclamação sobre atendimento, prazo e resposta continua passando", () => {
    for (const t of REAIS) {
      expect(decidirAlerta(NEG_ALTO, t).alerta, t).toBe(true);
    }
  });

  it("nem elogio nem vocabulário de peça abafam reclamação da relação", () => {
    // Caso limite: agradece e reclama na mesma mensagem. A reclamação manda.
    const t = "Obrigado pelo retorno, mas cadê a arte que pedi semana passada? já faz dias";
    expect(temCelebracao(t)).toBe(true);
    expect(decidirAlerta(NEG_ALTO, t).alerta).toBe(true);
  });

  it("o portão nunca cria alerta que o modelo não pediu", () => {
    const calmo = { sentimento: "neutro", risco: "baixo", churn: false } as const;
    expect(decidirAlerta(calmo, "vocês não me respondem nunca, de novo isso").alerta).toBe(false);
  });
});
