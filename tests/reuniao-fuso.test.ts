// O RELÓGIO DA REUNIÃO (05/11/2026).
//
// Print do Roberto: reunião às 10:00, e às 12:00 o Loninho escreve no grupo do cliente "começa
// daqui a uma hora". O container roda em UTC e o cron passava `spNow()` (Date deslocado 3 horas,
// feito para ler getHours/getDay) como se fosse o instante real.
//
// Estes testes dependem de a suíte rodar em UTC, como a produção (ver vitest.config.ts). No Mac, em
// horário de Brasília, `spNow()` é o relógio certo e o bug fica invisível: foi assim que ele passou
// por todos os testes desde setembro.
import { describe, it, expect } from "vitest";
import { spNow } from "@/lib/cs/vigilancia";
import { lembretesDevidos, textoLembrete, decidirAcao, diasUteisEntre, janelaDoMes, type ClienteCiclo } from "@/lib/cs/reuniao-mensal";
import {
  sugerirHorarios, lerRespostaSocial, lerIntencaoReuniao, lerRespostaOferta, pareceRespostaDeHorario,
  pedeRemarcar, textoLembreteCliente,
} from "@/lib/cs/agendar-reuniao";
import { lerHora, lerHorario, porExtenso } from "@/lib/cs/parse-horario";

const sp = (s: string) => new Date(`${s}-03:00`);
const reuniao = (quando: string, o: Partial<{ lembrouVespera: boolean; lembrouUmaHora: boolean }> = {}) => ({
  clientId: "r", cliente: "Contele", responsavel: "Thiago", quando,
  lembrouVespera: true, lembrouUmaHora: false, ...o,
});

/** Em que hora de SP o cron das 8h às 17h dispara o lembrete de 1h, como a rota chama. */
function horaDoLembrete(quando: string, dia = "2026-11-05"): number | null {
  for (let c = 8; c <= 17; c++) {
    const cron = sp(`${dia}T${String(c).padStart(2, "0")}:00:00`);
    if (lembretesDevidos([reuniao(quando)], cron).some((l) => l.tipo === "uma_hora")) return c;
  }
  return null;
}

describe("a suíte roda no fuso da produção", () => {
  it("UTC, senão o bug de fuso passa despercebido", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(0);
  });
});

describe("o lembrete de 1h sai ANTES da reunião", () => {
  it("o caso do print: reunião 10:00 lembra às 9:00, não às 12:00", () => {
    expect(horaDoLembrete("2026-11-05T10:00:00-03:00")).toBe(9);
  });

  for (const h of [9, 11, 14, 15, 16, 17, 18]) {
    it(`reunião ${h}:00 lembra às ${h - 1}:00`, () => {
      expect(horaDoLembrete(`2026-11-05T${String(h).padStart(2, "0")}:00:00-03:00`)).toBe(h - 1);
    });
  }

  it("nenhum minuto do expediente fica sem lembrete", () => {
    // O cron é de hora em hora e a janela era de 45 a 90 min: reunião às 10:40 (100 min às 9h, 40
    // às 10h) caía no buraco e ninguém era lembrado.
    for (let h = 9; h <= 17; h++) {
      for (let m = 0; m < 60; m += 5) {
        const q = `2026-11-05T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`;
        expect(horaDoLembrete(q), q).not.toBeNull();
      }
    }
  });

  it("nunca dispara depois de a reunião ter começado", () => {
    for (const c of [10, 11, 12, 13]) {
      const cron = sp(`2026-11-05T${c}:00:00`);
      expect(lembretesDevidos([reuniao("2026-11-05T10:00:00-03:00")], cron)).toHaveLength(0);
    }
  });

  it("o texto diz quanto falta de verdade", () => {
    const l = (q: string, c: string) => lembretesDevidos([reuniao(q)], sp(c))[0];
    expect(textoLembrete(l("2026-11-05T10:00:00-03:00", "2026-11-05T09:00:00"), "quinta às 10:00", "")).toMatch(/em uma hora/);
    expect(textoLembrete(l("2026-11-05T10:40:00-03:00", "2026-11-05T10:00:00"), "quinta às 10:40", "")).toMatch(/em 40 minutos/);
    expect(textoLembreteCliente("quinta às 10:30", "uma_hora", { faltamMin: 90 })).toMatch(/daqui a 1h30/);
    expect(textoLembreteCliente("quinta às 10:00", "uma_hora", { faltamMin: 60 })).toMatch(/daqui a uma hora/);
  });
});

describe("a véspera", () => {
  const vesperaEm = (quando: string, cron: string) =>
    lembretesDevidos([reuniao(quando, { lembrouVespera: false, lembrouUmaHora: true })], sp(cron)).filter((l) => l.tipo === "vespera");

  it("reunião de quinta 10h lembra na quarta", () => {
    expect(vesperaEm("2026-11-05T10:00:00-03:00", "2026-11-04T09:00:00")).toHaveLength(1);
    expect(vesperaEm("2026-11-05T10:00:00-03:00", "2026-11-03T09:00:00")).toHaveLength(0);
  });

  it("reunião de segunda lembra na sexta: o cron não roda no fim de semana", () => {
    const [l] = vesperaEm("2026-11-09T10:00:00-03:00", "2026-11-06T09:00:00");
    expect(l?.tipo).toBe("vespera");
    expect(l.diaVespera).toBe("segunda");
    expect(textoLembrete(l, "segunda às 10:00", "")).toMatch(/segunda tem reunião/);
    expect(textoLembrete(l, "segunda às 10:00", "")).not.toMatch(/amanhã/);
    expect(textoLembreteCliente("segunda às 10:00", "vespera", { diaVespera: l.diaVespera })).toMatch(/segunda temos/);
  });

  it("na sexta, reunião de terça ainda não é véspera", () => {
    expect(vesperaEm("2026-11-10T10:00:00-03:00", "2026-11-06T09:00:00")).toHaveLength(0);
  });
});

describe("a leitura da conversa não depende do fuso do servidor", () => {
  // Quarta, 04/11, 22h em SP. Em UTC já é quinta, 01h da manhã.
  const NOITE = sp("2026-11-04T22:00:00");

  it("amanhã dito às 22h é quinta, não sexta", () => {
    expect(lerHorario("amanhã 10h", NOITE)?.iso).toBe("2026-11-05T10:00:00-03:00");
  });

  it("hoje dito às 22h é quarta", () => {
    expect(lerHorario("hoje 21h", NOITE)?.iso).toBe("2026-11-04T21:00:00-03:00");
  });

  it("quinta dita na quarta à noite é amanhã, não a semana que vem", () => {
    expect(lerHorario("quinta 10h", NOITE)?.iso).toBe("2026-11-05T10:00:00-03:00");
  });

  it("depois de amanhã não vira amanhã", () => {
    expect(lerHorario("depois de amanhã 10h", NOITE)?.iso).toBe("2026-11-06T10:00:00-03:00");
  });

  it("virada de mês: dia 1 dito na noite de 31/10 é o dia seguinte", () => {
    expect(lerHorario("dia 1 às 10h", sp("2026-10-31T22:00:00"))?.iso).toBe("2026-11-01T10:00:00-03:00");
  });
});

describe("a oferta promete o horário de verdade", () => {
  it("10:00 e 15:00, não 07:00 e 12:00", () => {
    const [a, b] = sugerirHorarios(sp("2026-11-16T08:00:00"), 2, "2026-11-20");
    expect(a.texto).toBe("terça-feira, 17 de novembro às 10:00");
    expect(b.texto).toBe("quarta-feira, 18 de novembro às 15:00");
  });

  it("da noite de sexta, pula o fim de semana certo", () => {
    const [a] = sugerirHorarios(sp("2026-11-06T22:00:00"), 1);
    expect(porExtenso(a.iso)).toBe("segunda-feira, 09 de novembro às 10:00");
  });
});

describe("o prazo do cliente conta dias de São Paulo", () => {
  const base: ClienteCiclo = { clientId: "1", cliente: "X", responsavel: "T", estado: "ofertada", quando: null, propostoEm: null, tentativas: 1 };
  const oferta = sp("2026-11-16T08:00:40").toISOString();
  const em = (s: string) => {
    const real = sp(s);
    return decidirAcao({ ...base, ofertadoEm: oferta }, janelaDoMes(spNow(real)), real).tipo;
  };

  it("2 dias corridos valem na manhã do 2º dia, com o cron segundos mais cedo", () => {
    expect(em("2026-11-17T08:00:05")).toBe("nada");
    expect(em("2026-11-18T08:00:05")).toBe("reofertar");
  });

  it("dias úteis contam o calendário de SP, não o do servidor", () => {
    // Sexta 22h em SP já é sábado em UTC; até segunda de manhã é 1 dia útil.
    expect(diasUteisEntre(sp("2026-11-06T22:00:00"), sp("2026-11-09T09:00:00"))).toBe(1);
  });

  it("esperando o CLIENTE responder à contraproposta, não cobra o social", () => {
    const real = sp("2026-11-18T09:00:00");
    const a = decidirAcao({ ...base, estado: "aguardando_social", tentativas: 0, propostoLado: "social",
      perguntadoAoSocialEm: sp("2026-11-16T09:00:00").toISOString() }, janelaDoMes(spNow(real)), real);
    expect(a.tipo).toBe("nada");
  });
});

describe("horário escrito do jeito que as pessoas escrevem", () => {
  for (const [frase, hora, minuto] of [
    ["às 10", 10, 0], ["as 14", 14, 0], ["às 10 fica bom", 10, 0], ["às 10, pode ser?", 10, 0],
    ["10 horas", 10, 0], ["às 10 horas", 10, 0], ["10hs", 10, 0], ["10hrs", 10, 0], ["14 hrs", 14, 0],
    ["10 e meia", 10, 30], ["às 2 e meia da tarde", 14, 30], ["meio-dia", 12, 0], ["meio dia e meia", 12, 30],
  ] as const) {
    it(`entende "${frase}"`, () => {
      const h = lerHora(frase);
      expect(h?.hora).toBe(hora);
      expect(h?.minuto).toBe(minuto);
      expect(h?.explicita).toBe(true);
    });
  }

  for (const frase of ["as 10 artes", "as 3 fotos", "em 2 horas", "reunião de 2 horas", "daqui a 2 horas", "24 horas", "as 18/09"]) {
    it(`NÃO lê hora em "${frase}"`, () => expect(lerHora(frase)).toBeNull());
  }

  it("as mensagens inteiras viram horário", () => {
    const quarta = sp("2026-11-04T10:00:00");
    for (const f of ["reunião quinta às 10", "reunião quinta 10 horas", "reunião quinta 10hs"]) {
      const r = lerIntencaoReuniao(f, quarta);
      expect(r.tipo, f).toBe("agendar");
      if (r.tipo === "agendar") expect(r.iso).toBe("2026-11-05T10:00:00-03:00");
    }
  });
});

describe("o social respondendo o mesmo horário", () => {
  // O banco devolve timestamptz em UTC. Comparar o texto fazia "ok 10h" para uma reunião às 10h
  // virar contraproposta: "Nesse horário ficou complicado, consegue às 10:00?".
  const propostoDoBanco = "2026-11-05T13:00:00+00:00";
  const quarta = sp("2026-11-04T10:00:00");

  it('"ok, 10h" é aceite', () => {
    expect(lerRespostaSocial("ok, 10h", quarta, propostoDoBanco).tipo).toBe("aceita");
  });

  it('"ok, quinta 10h" é aceite', () => {
    expect(lerRespostaSocial("ok, quinta 10h", quarta, propostoDoBanco).tipo).toBe("aceita");
  });

  it('"pode ser 16h?" continua contraproposta', () => {
    const r = lerRespostaSocial("pode ser 16h?", quarta, propostoDoBanco);
    expect(r.tipo).toBe("contraproposta");
    if (r.tipo === "contraproposta") expect(r.iso).toBe("2026-11-05T16:00:00-03:00");
  });
});

describe("a resposta do cliente à oferta", () => {
  // Terça 17/11 10h e quarta 18/11 15h.
  const opcoes = sugerirHorarios(sp("2026-11-16T08:00:00"), 2, "2026-11-20");
  const iso = (t: string, citou = false) => {
    const r = lerRespostaOferta(t, opcoes, citou);
    return r?.tipo === "agendar" ? r.iso : r?.tipo ?? null;
  };

  for (const f of ["o primeiro", "a primeira", "pode ser o primeiro", "opção 1", "pode ser terça", "terça", "qualquer um"]) {
    it(`"${f}" escolhe a 1ª opção`, () => expect(iso(f)).toBe(opcoes[0].iso));
  }
  for (const f of ["o segundo", "a segunda", "segunda opção", "opção 2", "quarta fica melhor", "pode ser quarta"]) {
    it(`"${f}" escolhe a 2ª opção`, () => expect(iso(f)).toBe(opcoes[1].iso));
  }

  it('"a segunda" é o dia quando uma das opções cai na segunda-feira', () => {
    const comSegunda = sugerirHorarios(sp("2026-11-13T08:00:00"), 2);   // sexta → seg 16 e ter 17
    const r = lerRespostaOferta("a segunda", comSegunda);
    expect(r?.tipo === "agendar" && r.iso).toBe(comSegunda[0].iso);
  });

  it('"pode ser" não diz qual: pergunta só se citou a oferta', () => {
    expect(iso("pode ser", true)).toBe("perguntar_horario");
    expect(iso("pode ser", false)).toBeNull();
  });

  for (const f of [
    "ok", "show", "o primeiro post ficou ótimo", "primeiro preciso ver isso", "a promoção começa terça",
    "quarta posto o vídeo novo", "bom dia, tudo bem?",
  ]) {
    it(`"${f}" não é resposta à oferta`, () => expect(iso(f)).toBeNull());
  }

  it("quem traz hora passa pelo parser, não pelas opções", () => {
    expect(lerRespostaOferta("pode ser terça às 15h", opcoes)).toBeNull();
    expect(pareceRespostaDeHorario("pode ser terça às 15h")).toBe(true);
  });

  it("a resposta com hora é reconhecida; recado com data não", () => {
    for (const f of ["Pode ser terça às 15h", "Terça às 10h fica bom", "Amanhã 9:30 está ótimo", "melhor quinta 14h, se puder", "quinta às 10"]) {
      expect(pareceRespostaDeHorario(f), f).toBe(true);
    }
    for (const f of ["a promoção começa dia 18 às 8h", "chega mercadoria dia 20 às 14h", "a loja abre quinta às 8h"]) {
      expect(pareceRespostaDeHorario(f), f).toBe(false);
    }
  });
});

describe("pedido de remarcar", () => {
  const longe = 24 * 10, perto = 20;

  for (const f of [
    "preciso remarcar a reunião", "vou ter que cancelar a reunião", "não vou conseguir ir na reunião",
    "a reunião de hoje não vai dar", "não posso participar da reunião", "dá pra adiar a call?",
  ]) {
    it(`pede: "${f}"`, () => expect(pedeRemarcar(f, longe)).toBe(true));
  }

  it('"vamos remarcar" sem dizer o quê só conta com reunião perto', () => {
    expect(pedeRemarcar("vamos remarcar?", perto)).toBe(true);
    expect(pedeRemarcar("vamos remarcar?", longe)).toBe(false);
  });

  for (const f of [
    "não posso postar hoje, depois da reunião te falo", "não consigo conversar agora", "não consigo abrir o link",
    "na reunião a gente vê", "vamos cancelar a promoção",
  ]) {
    it(`não pede: "${f}"`, () => expect(pedeRemarcar(f, perto)).toBe(false));
  }
});
