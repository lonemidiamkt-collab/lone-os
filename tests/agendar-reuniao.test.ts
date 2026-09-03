import { describe, it, expect } from "vitest";
import { lerIntencaoReuniao, sugerirHorarios, textoOferta } from "@/lib/cs/agendar-reuniao";

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
    "reunião quinta pode ser?",           // dia sem hora
    "reunião dia 18 de manhã",            // período, não horário
  ]) {
    it(`pergunta em vez de chutar: "${frase}"`, () => {
      expect(ler(frase).tipo).toBe("perguntar_horario");
    });
  }

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
