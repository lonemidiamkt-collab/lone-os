import { describe, it, expect } from "vitest";
import {
  lerIntencaoReuniao, sugerirHorarios, textoOferta, acharLinkChamada, textoPedeLink,
} from "@/lib/cs/agendar-reuniao";

// Quarta, 02/09/2026, 10h de SP.
const AGORA = new Date("2026-09-02T13:00:00Z");
const ler = (t: string) => lerIntencaoReuniao(t, AGORA);

describe("o cliente marcou: agenda", () => {
  for (const frase of [
    "podemos fazer a reunião dia 18 às 14h",
    "reunião quinta às 15h pode ser?",
    "marca aí pra dia 18 às 10h",
    "consigo dia 18/09 às 16h",
    "fechado, reunião amanhã às 11h",
  ]) {
    it(`entende: "${frase}"`, () => {
      const r = ler(frase);
      expect(r.tipo).toBe("agendar");
      if (r.tipo === "agendar") expect(r.iso).toMatch(/^2026-09-\d\dT\d\d:00:00-03:00$/);
    });
  }
});

describe("falou de marcar mas não disse quando: pergunta", () => {
  for (const frase of [
    "bora marcar a reunião desse mês",
    "podemos agendar a call?",
    "reunião quinta pode ser?",           // dia sem hora nem turno
  ]) {
    it(`pergunta em vez de chutar: "${frase}"`, () => {
      expect(ler(frase).tipo).toBe("perguntar_horario");
    });
  }

  it('"dia 18 de manhã" agora PROPÕE, porque dia + turno é quase tudo', () => {
    // Antes isto virava pergunta. Depois do caso Contele, devolver a pergunta a quem já deu o dia
    // e o turno passou a ser considerado empurrar trabalho nosso para o cliente.
    expect(ler("reunião dia 18 de manhã").tipo).toBe("propor");
  });

  it("o motivo da pergunta é específico", () => {
    const r = ler("reunião dia 18 de manhã");
    if (r.tipo === "perguntar_horario") expect(r.motivo).toMatch(/hora exata/);
  });
});

describe("o que NÃO é agendamento", () => {
  it("data de promoção não vira reunião", () => {
    // O grupo do cliente é cheio de datas que não têm nada a ver com reunião.
    expect(ler("a promoção começa dia 18 às 8h").tipo).toBe("nenhuma");
    expect(ler("chega mercadoria dia 20 às 14h").tipo).toBe("nenhuma");
  });

  it("relato de reunião passada não agenda nada", () => {
    expect(ler("a reunião de ontem foi ótima").tipo).toBe("nenhuma");
    expect(ler("na última reunião a gente falou disso").tipo).toBe("nenhuma");
  });

  it("conversa comum", () => {
    expect(ler("bom dia, tudo bem?").tipo).toBe("nenhuma");
    expect(ler("").tipo).toBe("nenhuma");
  });
});

describe("recusa e remarcação", () => {
  it("não posso essa semana → recusa, sem inventar data", () => {
    expect(ler("não consigo reunião essa semana").tipo).toBe("recusa");
  });

  it("mas com contraproposta, agenda a contraproposta", () => {
    // "não posso terça, pode quarta às 10h" está propondo quarta.
    const r = ler("não posso terça, a reunião pode ser quarta às 10h?");
    expect(r.tipo).toBe("agendar");
  });

  it("pedido de remarcar sem horário vira recusa", () => {
    expect(ler("precisamos remarcar a reunião").tipo).toBe("recusa");
  });
});

describe("horários impossíveis viram pergunta, não agendamento", () => {
  it("madrugada", () => {
    expect(ler("reunião amanhã às 4h").tipo).toBe("perguntar_horario");
  });
  it("data no passado", () => {
    expect(ler("reunião dia 1 às 10h").tipo).toBe("agendar");   // dia 1 rola pro mês que vem
    expect(ler("reunião 01/08 às 10h").tipo).toBe("perguntar_horario");
  });
});

describe("o agente oferecendo horário", () => {
  it("sugere dias úteis, nunca fim de semana", () => {
    // Sexta, 04/09/2026 → as sugestões têm que pular sábado e domingo.
    const s = sugerirHorarios(new Date("2026-09-04T13:00:00Z"), 2);
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.texto).join(" ")).not.toMatch(/sábado|domingo/);
  });

  it("prefere datas DENTRO da janela do ciclo", () => {
    // Dia 16, janela fechando dia 22: as duas opções têm que caber até lá.
    const s = sugerirHorarios(new Date("2026-09-16T11:00:00Z"), 2, "2026-09-22");
    expect(s).toHaveLength(2);
    for (const o of s) expect(o.iso.slice(0, 10) <= "2026-09-22").toBe(true);
  });

  it("janela apertada: sai dela em vez de não oferecer nada", () => {
    // Dia 22 é o último: não há dia útil sobrando dentro da janela.
    const s = sugerirHorarios(new Date("2026-09-22T11:00:00Z"), 2, "2026-09-22");
    expect(s.length).toBeGreaterThan(0);
  });

  it("a oferta traz opções concretas, não 'quando você pode?'", () => {
    const t = textoOferta("Contele", sugerirHorarios(AGORA, 2).map((x) => x.texto));
    expect(t).toContain("Contele");
    expect(t).toMatch(/Algum desses funciona/);
  });
});

// ── A resposta do social (Roberto, 03/09) ─────────────────────────────────
import { lerRespostaSocial, textoPerguntaAoSocial, textoLembreteCliente, textoOfertaTentativa } from "@/lib/cs/agendar-reuniao";

describe("o social respondendo à pergunta do agente", () => {
  const ler = (t: string) => lerRespostaSocial(t, AGORA);

  for (const frase of ["ok", "pode ser", "beleza", "confirmo", "fechado", "👍", "isso, pode marcar"]) {
    it(`aceita: "${frase}"`, () => expect(ler(frase).tipo).toBe("aceita"));
  }

  it("hora sem data vira contraproposta NO MESMO DIA, mesmo com 'ok' na frente", () => {
    // "ok, mas pode ser 16h?" tratado como aceite marcaria o horário que a pessoa acabou de
    // recusar. Sem a data proposta como referência, "16h" sozinho não vira horário nenhum.
    const proposto = "2026-09-25T14:00:00-03:00";
    const r = lerRespostaSocial("ok, mas pode ser 16h?", AGORA, proposto);
    expect(r.tipo).toBe("contraproposta");
    if (r.tipo === "contraproposta") {
      expect(r.iso).toContain("2026-09-25");   // mesmo dia
      expect(r.iso).toContain("T16:00");       // outra hora
    }
  });

  it("repetir o MESMO horário é aceite, não contraproposta", () => {
    const proposto = "2026-09-25T14:00:00-03:00";
    expect(lerRespostaSocial("ok, 14h fechado", AGORA, proposto).tipo).toBe("aceita");
  });

  it("contraproposta com dia e hora", () => {
    const r = ler("nesse horário não dá, pode ser dia 25 às 10h?");
    expect(r.tipo).toBe("contraproposta");
    if (r.tipo === "contraproposta") expect(r.iso.slice(0, 10)).toBe("2026-09-25");
  });

  it("recusa sem alternativa", () => {
    expect(ler("não vai dar essa semana").tipo).toBe("recusa");
  });

  it("conversa qualquer não é resposta", () => {
    expect(ler("alguém viu o briefing da Calabria?").tipo).toBe("nenhuma");
    expect(ler("").tipo).toBe("nenhuma");
  });
});

describe("textos da negociação", () => {
  it("a pergunta ao social traz as duas saídas", () => {
    const t = textoPerguntaAoSocial("Contele", "sexta, 25 de setembro às 14:00", "@5522997226048");
    expect(t).toContain("@5522997226048");
    expect(t).toMatch(/\*ok\*/);
    expect(t).toMatch(/outro horário/);
  });

  it("a segunda oferta não repete a primeira", () => {
    const primeira = textoOfertaTentativa("Contele", ["segunda às 10:00"], 1);
    const segunda = textoOfertaTentativa("Contele", ["segunda às 10:00"], 2);
    expect(segunda).not.toBe(primeira);
    // Repetir a mensagem que já foi ignorada não muda o resultado: a segunda pede o horário dele.
    expect(segunda).toMatch(/Me diz um dia e horário/);
  });

  it("o lembrete do cliente fala com ele, não sobre ele", () => {
    expect(textoLembreteCliente("sexta às 14:00", "vespera")).toMatch(/nossa reunião/i);
    expect(textoLembreteCliente("sexta às 14:00", "uma_hora")).toMatch(/daqui a uma hora/i);
  });
});

// ── Varredura das falas ao cliente (Roberto, 03/09) ───────────────────────
import { textoPergunta as perguntaCli, textoFechado, textoContraproposta, DURACAO_MIN } from "@/lib/cs/agendar-reuniao";

describe("o que o cliente lê", () => {
  const ops = sugerirHorarios(new Date(2026, 8, 16, 8), 2, "2026-09-22").map((o) => o.texto);

  it("NUNCA vaza jargão de sistema", () => {
    // A versão anterior imprimia `_(disse "quinta" mas não a hora exata)_` na mensagem: o cliente
    // lia o funcionamento do parser em vez da pergunta.
    const t = perguntaCli('disse "quinta" mas não a hora exata');
    expect(t).not.toMatch(/disse "quinta"/);
    expect(t).not.toMatch(/parser|null|horaExplicita|_\(/);
    expect(t).toMatch(/me confirma/i);
  });

  it("diz FORMATO e DURAÇÃO já na primeira oferta", () => {
    // Sem isso o cliente aceita sem saber se reserva 30 minutos ou duas horas, nem se precisa sair
    // do escritório — e a primeira resposta dele vira "é presencial?".
    const t = textoOferta("Contele", ops);
    expect(t).toMatch(/online/i);
    expect(t).toContain(String(DURACAO_MIN));
  });

  it("a segunda tentativa também informa, para quem não leu a primeira", () => {
    const t = textoOfertaTentativa("Contele", ops, 2);
    expect(t).toMatch(/online/i);
  });

  it("confirmação e lembrete de véspera NÃO terminam igual", () => {
    // Mensagem que parece a mesma reenviada é ignorada.
    const conf = textoFechado("Contele", "sexta às 14:00");
    const vesp = textoLembreteCliente("sexta às 14:00", "vespera");
    expect(vesp).not.toContain("Até lá! 👋");
    expect(conf).not.toBe(vesp);
  });

  it("o lembrete da véspera abre a porta para remarcar", () => {
    expect(textoLembreteCliente("sexta às 14:00", "vespera")).toMatch(/remarcar/i);
  });

  it("nenhuma fala ao cliente cita nome de tabela, código ou id", () => {
    const todas = [
      textoOferta("X", ops), textoOfertaTentativa("X", ops, 2), perguntaCli("qualquer"),
      textoContraproposta("sexta às 16:00"),
      textoLembreteCliente("sexta às 14:00", "vespera"),
      textoLembreteCliente("sexta às 14:00", "uma_hora"),
    ].join(" ");
    expect(todas).not.toMatch(/meetings|client_id|estado|undefined|null|\bISO\b/);
  });
});

// ── O CASO CONTELE (04/09) ────────────────────────────────────────────────
//
// Conversa real. A cliente escreveu "Eu consigo terça à tarde"; o agente respondeu "me confirma
// só o horário"; ela devolveu "Isso! Pode confirmar" — e ele perguntou de novo. Três vezes a
// mesma pergunta no grupo, nenhuma reunião marcada.
//
// Dois defeitos, ambos aqui: o parser já sabia que "terça à tarde" era terça 15h e jogava fora
// por falta de hora exata; e uma confirmação curta, sem data nem hora, caía em "nenhuma".
describe("cliente dá o turno: o agente PROPÕE, não devolve a pergunta", () => {
  const quinta = new Date(2026, 8, 4, 16, 54);   // sexta 04/09/2026, como na conversa

  it('"Eu consigo terça à tarde" vira PROPOSTA de horário concreto', () => {
    const r = lerIntencaoReuniao("Eu consigo terça à tarde", quinta);
    expect(r.tipo).toBe("propor");
    if (r.tipo === "propor") {
      expect(r.iso).toContain("T15:00");        // "à tarde" = 15h
      expect(r.iso.slice(0, 10)).toBe("2026-09-08"); // a terça seguinte
    }
  });

  it('"quinta de manhã" também propõe, às 10h', () => {
    const r = lerIntencaoReuniao("consigo quinta de manhã", quinta);
    expect(r.tipo).toBe("propor");
    if (r.tipo === "propor") expect(r.iso).toContain("T10:00");
  });

  it("horário impossível continua virando pergunta, não proposta", () => {
    // Domingo não é dia de reunião de trabalho: propor seria pior que perguntar.
    const r = lerIntencaoReuniao("pode ser domingo de manhã", quinta);
    expect(r.tipo).toBe("perguntar_horario");
  });
});

describe("confirmação curta fecha a proposta pendente", () => {
  const proposto = "2026-09-08T15:00:00-03:00";
  const agora = new Date(2026, 8, 4, 17);

  for (const frase of ["Isso ! Pode confirmar", "isso aí", "pode marcar", "fechado", "por mim ok", "perfeito"]) {
    it(`fecha com: "${frase}"`, () => {
      const r = lerIntencaoReuniao(frase, agora, proposto);
      expect(r.tipo).toBe("agendar");
      if (r.tipo === "agendar") expect(r.iso).toBe(proposto);
    });
  }

  it("SEM proposta pendente, a mesma frase não agenda nada", () => {
    // "Isso, pode confirmar" solto no grupo é conversa — sem contexto, marcar seria chutar.
    expect(lerIntencaoReuniao("Isso ! Pode confirmar", agora).tipo).toBe("nenhuma");
  });

  it("horário NOVO na resposta corrige a proposta, não a confirma", () => {
    // "ok, mas pode ser 16h?" está corrigindo — confirmar marcaria o horário recusado.
    const r = lerIntencaoReuniao("ok, mas pode ser dia 9 às 16h?", agora, proposto);
    expect(r.tipo).toBe("agendar");
    if (r.tipo === "agendar") expect(r.iso).not.toBe(proposto);
  });

  it("recusa não vira confirmação", () => {
    expect(lerIntencaoReuniao("não vai dar não", agora, proposto).tipo).toBe("recusa");
  });
});

// ── O LINK DA CHAMADA ────────────────────────────────────────────────────
describe("link da chamada colado no grupo", () => {
  for (const [frase, esperado] of [
    ["https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["segue o link: https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij"],
    ["https://us02web.zoom.us/j/8412345678?pwd=xyz", "https://us02web.zoom.us/j/8412345678?pwd=xyz"],
    ["ta aqui https://teams.microsoft.com/l/meetup-join/19%3ameeting", "https://teams.microsoft.com/l/meetup-join/19%3ameeting"],
  ] as const) {
    it(`acha em: "${frase.slice(0, 40)}"`, () => {
      expect(acharLinkChamada(frase)).toBe(esperado);
    });
  }

  it("tira a pontuação grudada no fim", () => {
    expect(acharLinkChamada("o link é https://meet.google.com/abc-defg-hij."))
      .toBe("https://meet.google.com/abc-defg-hij");
  });

  it("ignora link que não é de chamada — o grupo vive cheio deles", () => {
    for (const t of [
      "olha esse post https://instagram.com/p/xyz",
      "https://painel.lonemidia.com/clients",
      "https://drive.google.com/file/d/123",
      "sem link nenhum aqui",
    ]) expect(acharLinkChamada(t)).toBeNull();
  });

  it("o pedido do link marca a pessoa", () => {
    expect(textoPedeLink("@Thiago")).toContain("@Thiago");
    expect(textoPedeLink("")).toContain("link da chamada");
  });
});

// ── O CASO IMPÉRIO DOS PISOS (08/09) ─────────────────────────────────────
//
// Dois erros numa conversa só, num grupo de cliente:
//   1. O Matheus escreveu três parágrafos sobre o CRM e o agente abriu uma conversa de
//      agendamento que ninguém pediu.
//   2. O agente perguntou o horário; o Matheus respondeu no formato exato que foi pedido; o
//      agente ficou mudo.
describe("Império dos Pisos: não inventar conversa", () => {
  const MATHEUS = `Boa tarde!

Vi que foi mencionado que o CRM não identifica de qual anúncio veio cada lead, mas ele identifica sim. Essa é, inclusive, uma das primeiras informações que recebemos quando o lead entra em contato com a empresa, mostrando a origem do contato.

Na reunião, vou apresentar todos os pontos relacionados ao CRM que foram mencionados no PDF, incluindo essa informação e os demais recursos e possibilidades que podemos utilizar para melhorar o acompanhamento dos leads e das vendas.`;

  it("a mensagem do CRM não vira pedido de reunião", () => {
    expect(ler(MATHEUS).tipo).toBe("nenhuma");
  });

  it("“podemos” longe de “reunião” não é pedido de marcação", () => {
    expect(ler("Na reunião falamos do CRM. Temos recursos que podemos utilizar no atendimento.").tipo)
      .toBe("nenhuma");
  });

  it("mas “podemos” PERTO de “reunião” continua sendo", () => {
    expect(ler("A reunião podemos fazer essa semana?").tipo).toBe("perguntar_horario");
  });

  for (const frase of [
    "Na reunião vou apresentar os números",
    "durante a reunião a gente vê isso",
    "deixo pra reunião",
    "sobre a reunião, levo o material impresso",
    "nessa reunião quero falar de verba",
  ]) {
    it(`fala DE uma reunião existente, não pede outra: "${frase}"`, () => {
      expect(ler(frase).tipo).toBe("nenhuma");
    });
  }

  it("verbo forte desfaz: “a reunião que a gente vai marcar”", () => {
    expect(ler("sobre a reunião que a gente vai marcar, me avisa").tipo).toBe("perguntar_horario");
  });
});

describe("Império dos Pisos: reconhecer a resposta que ele pediu", () => {
  const respondendo = (t: string) => lerIntencaoReuniao(t, AGORA, undefined, true);

  it("“Amanhã 9:30 esta ótimo!” fecha o horário", () => {
    const r = respondendo("Amanhã 9:30 esta ótimo!");
    expect(r.tipo).toBe("agendar");
    if (r.tipo === "agendar") expect(r.iso).toBe("2026-09-03T09:30:00-03:00");
  });

  it("sem a pergunta pendente, a mesma frase não faz nada", () => {
    expect(ler("Amanhã 9:30 esta ótimo!").tipo).toBe("nenhuma");
  });

  for (const frase of ["dia 18 às 14h", "quinta 10h pode ser", "amanhã 9h30"]) {
    it(`responde ao formato pedido: "${frase}"`, () => {
      expect(respondendo(frase).tipo).toBe("agendar");
    });
  }

  it("só o dia vira proposta de horário, não pergunta de novo", () => {
    expect(respondendo("quinta de manhã").tipo).toBe("propor");
  });

  it("recusa é entendida como recusa", () => {
    expect(respondendo("não vai dar essa semana").tipo).toBe("recusa");
  });

  it("TEXTÃO com data não é resposta — ninguém responde “que horas?” em três parágrafos", () => {
    const longo = "Bom dia! Sobre o material, a promoção do dia 18 começa cedo e vamos "
      + "precisar de arte nova para o feed e para o story, além do banner do site. "
      + "Depois te mando as fotos dos produtos que entraram essa semana no estoque.";
    expect(respondendo(longo).tipo).not.toBe("agendar");
  });

  it("mensagem sem horário nenhum não é engolida pela janela", () => {
    expect(respondendo("obrigado!").tipo).toBe("nenhuma");
  });
});
