import { describe, it, expect } from "vitest";
import {
  TETO_FALAS_DIA, bracoDoTeste, decidirFala, dentroDoHorario, inicioDoDiaSP, medir, quemOuve,
  relogioSP, saldoResolvido, saldoZerado, textoContaParada, textoSaldoZerado, vozPadraoDoPapel,
} from "@/lib/avisos/regras";

const base = { ligadoNaCentral: true, noHorario: true, braco: "voz" as const };

describe("teto de falas por dia", () => {
  it(`fala até ${TETO_FALAS_DIA}, avisa UMA vez no limite e depois cala`, () => {
    expect(decidirFala({ ...base, jaFaladosHoje: 0 })).toBe("falar");
    expect(decidirFala({ ...base, jaFaladosHoje: TETO_FALAS_DIA - 1 })).toBe("falar");
    expect(decidirFala({ ...base, jaFaladosHoje: TETO_FALAS_DIA })).toBe("avisar_teto");
    expect(decidirFala({ ...base, jaFaladosHoje: TETO_FALAS_DIA + 1 })).toBe("mudo");
  });
  it("desligado na Central, fora do horário ou no grupo de controle: cala", () => {
    expect(decidirFala({ ...base, jaFaladosHoje: 0, ligadoNaCentral: false })).toBe("mudo");
    expect(decidirFala({ ...base, jaFaladosHoje: 0, noHorario: false })).toBe("mudo");
    expect(decidirFala({ ...base, jaFaladosHoje: 0, braco: "controle" })).toBe("mudo");
  });
});

describe("horário (São Paulo)", () => {
  it("dia útil das 8h às 18h", () => {
    expect(dentroDoHorario(new Date("2026-10-07T11:00:00Z"))).toBe(true);  // qua 8h
    expect(dentroDoHorario(new Date("2026-10-07T10:59:00Z"))).toBe(false); // qua 7h59
    expect(dentroDoHorario(new Date("2026-10-07T20:59:00Z"))).toBe(true);  // qua 17h59
    expect(dentroDoHorario(new Date("2026-10-07T21:00:00Z"))).toBe(false); // qua 18h
    expect(dentroDoHorario(new Date("2026-10-11T14:00:00Z"))).toBe(false); // domingo
  });
  it("o dia vira à meia-noite de São Paulo, não às 21h (UTC)", () => {
    expect(relogioSP(new Date("2026-10-08T01:30:00Z")).dia).toBe("2026-10-07");
    expect(inicioDoDiaSP(new Date("2026-10-08T01:30:00Z"))).toBe("2026-10-07T03:00:00.000Z");
  });
});

describe("quem ouve", () => {
  const prefs = new Map<string, boolean | null>([["Julio", null], ["Roberto Lino", null], ["Lucas Bueno", true]]);
  it("o gestor ouve; sócio só se ligou", () => {
    expect(quemOuve({ gestor: "Julio", prefs, admins: ["Roberto Lino", "Lucas Bueno"] })).toEqual(["Julio", "Lucas Bueno"]);
  });
  it("gestor que desligou não recebe; gestor fora do time ativo também não", () => {
    expect(quemOuve({ gestor: "Julio", prefs: new Map([["Julio", false]]), admins: [] })).toEqual([]);
    expect(quemOuve({ gestor: "Fulano Saiu", prefs, admins: [] })).toEqual([]);
  });
  it("padrão do botão: só quem cuida de conta de anúncio vem ligado", () => {
    expect(vozPadraoDoPapel("manager")).toBe(true);
    expect(vozPadraoDoPapel("traffic")).toBe(true);
    expect(vozPadraoDoPapel("admin")).toBe(false);
    expect(vozPadraoDoPapel("social")).toBe(false);   // Carlos: não era pra ficar ligada
    expect(vozPadraoDoPapel("designer")).toBe(false);
  });
});

describe("saldo que fala", () => {
  const s = (available: number | null, daysRemaining: number | null, isPrepaid = true, severity = "critical") =>
    ({ isPrepaid, available, daysRemaining, alert: { severity } });
  it("zerado ou que não dura um dia", () => {
    expect(saldoZerado(s(0, null))).toBe(true);
    expect(saldoZerado(s(-3, 0))).toBe(true);
    expect(saldoZerado(s(12, 0.4))).toBe(true);
  });
  it("'abaixo de X% da verba' não fala; cartão não fala; conta desativada não fala", () => {
    expect(saldoZerado(s(80, 2.5))).toBe(false);
    expect(saldoZerado(s(0, null, false))).toBe(false);
    expect(saldoZerado(s(0, null, true, "disabled"))).toBe(false);
  });
  it("recarga fecha o evento", () => {
    expect(saldoResolvido({ available: 200, daysRemaining: 6 })).toBe(true);
    expect(saldoResolvido({ available: 200, daysRemaining: null })).toBe(true);
    expect(saldoResolvido({ available: 10, daysRemaining: 0.3 })).toBe(false);
    expect(saldoResolvido({ available: 0, daysRemaining: null })).toBe(false);
  });
});

describe("teste com grupo de controle", () => {
  it("o sorteio é fixo por conta e dia e divide perto de metade", () => {
    expect(bracoDoTeste("act_1", "2026-10-07")).toBe(bracoDoTeste("act_1", "2026-10-07"));
    const bracos = Array.from({ length: 400 }, (_, i) => bracoDoTeste(`act_${i}`, "2026-10-08"));
    const voz = bracos.filter((b) => b === "voz").length;
    expect(voz).toBeGreaterThan(160);
    expect(voz).toBeLessThan(240);
  });
  it("fora da janela do teste, tudo fala", () => {
    expect(bracoDoTeste("act_1", "2026-10-05")).toBe("voz");
    expect(bracoDoTeste("act_1", "2026-10-20")).toBe("voz");
  });
  it("a medição separa voz × controle e dá a mediana em minutos", () => {
    const linhas = medir([
      { tipo: "conta_parada", braco: "voz", detectado_em: "2026-10-07T14:05:00Z", resolvido_em: "2026-10-07T14:35:00Z", ouvido_em: "2026-10-07T14:06:00Z" },
      { tipo: "conta_parada", braco: "voz", detectado_em: "2026-10-07T14:05:00Z", resolvido_em: "2026-10-07T15:05:00Z" },
      { tipo: "conta_parada", braco: "controle", detectado_em: "2026-10-07T14:05:00Z", resolvido_em: "2026-10-07T17:05:00Z" },
      { tipo: "conta_parada", braco: "controle", detectado_em: "2026-10-07T14:05:00Z", resolvido_em: null },
    ]);
    const voz = linhas.find((l) => l.tipo === "conta_parada" && l.braco === "voz")!;
    const ctl = linhas.find((l) => l.tipo === "conta_parada" && l.braco === "controle")!;
    expect(voz).toMatchObject({ eventos: 2, resolvidos: 2, medianaMinutos: 45, ouvidos: 1 });
    expect(ctl).toMatchObject({ eventos: 2, resolvidos: 1, medianaMinutos: 180 });
  });
});

describe("textos falados", () => {
  it("curtos, com o número que importa", () => {
    expect(textoContaParada("Maicon Minerais", "11:05", 59.22).titulo).toBe("A conta do Maicon Minerais parou de rodar hoje");
    expect(textoSaldoZerado("Paradise", 0, null).titulo).toBe("O saldo do Paradise zerou");
    expect(textoSaldoZerado("Paradise", 12, 0.4).titulo).toBe("O saldo do Paradise não dura até amanhã");
  });
});
