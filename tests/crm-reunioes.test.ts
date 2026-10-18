// Reuniões de venda do Comercial (out/2026). Dados INVENTADOS.
import { describe, it, expect } from "vitest";
import {
  inicioDe, fimDe, horaCurta, diaCurto, validarMarcacao, horariosLivres, lembretesDevidos, itensDeReuniao, horaPorFrase,
  textoMarcadaGrupo, textoVesperaGrupo, textoHoraGrupo, mensagemConfirmacaoLead, mensagemVesperaLead, type ReuniaoBase,
} from "@/lib/crm/reunioes";
import { assinarState, lerState } from "@/lib/google/estado-oauth";
import { planejarPassos, leadsDoPedido, type AcaoIA, type LeadAssistente } from "@/lib/crm/assistente";

const lead = { empresa: "Loja Exemplo", contatoNome: "Ana Souza", telefone: "5522998765432", endereco: "Rua Um, 10, Cidade Alfa", cidade: "Cidade Alfa" };
const R = (o: Partial<ReuniaoBase> = {}): ReuniaoBase => ({
  id: "r1", leadId: "l1", inicio: inicioDe("2026-10-22", "15:00"), fim: inicioDe("2026-10-22", "15:45"), formato: "meet",
  local: null, meetUrl: "https://meet.google.com/abc-defg-hij", estado: "agendada", lembreteVesperaEm: null, lembreteHoraEm: null,
  criadoEm: "2026-10-18T12:00:00Z", ...o,
});

describe("horário de São Paulo", () => {
  it("monta o ISO com -03:00 e formata curto", () => {
    expect(inicioDe("2026-10-22", "15:00")).toBe("2026-10-22T15:00:00-03:00");
    expect(fimDe(inicioDe("2026-10-22", "15:00"), 45)).toBe("2026-10-22T18:45:00.000Z");
    expect(horaCurta("2026-10-22T18:00:00Z")).toBe("15h");
    expect(horaCurta("2026-10-22T18:30:00Z")).toBe("15h30");
    expect(diaCurto("2026-10-22T18:00:00Z")).toBe("quinta, 22/10");
  });
  it("valida: no passado, longe demais, duração e formato", () => {
    const agora = new Date("2026-10-20T12:00:00Z");
    expect(validarMarcacao({ inicio: inicioDe("2026-10-22", "15:00"), duracao: 45, formato: "meet", agora })).toBeNull();
    expect(validarMarcacao({ inicio: inicioDe("2026-10-19", "15:00"), duracao: 45, formato: "meet", agora })).toMatch(/passou/);
    expect(validarMarcacao({ inicio: inicioDe("2028-01-01", "15:00"), duracao: 45, formato: "meet", agora })).toMatch(/1 ano/);
    expect(validarMarcacao({ inicio: inicioDe("2026-10-22", "15:00"), duracao: 5, formato: "meet", agora })).toMatch(/Duração/);
    expect(validarMarcacao({ inicio: inicioDe("2026-10-22", "15:00"), duracao: 45, formato: "zoom", agora })).toMatch(/Formato/);
  });
});

describe("horários livres", () => {
  it("pula o que está ocupado no Google e o que já passou", () => {
    const livres = horariosLivres({
      dia: "2026-10-22", duracao: 60, agora: new Date("2026-10-22T12:10:00Z"), // 9h10 em SP
      ocupados: [{ inicio: inicioDe("2026-10-22", "10:00"), fim: inicioDe("2026-10-22", "11:30") }],
      max: 4,
    });
    expect(livres).toEqual(["11:30", "12:00", "12:30", "13:00"]); // 9h30 e 10h… batem ou estão a menos de 30 min
  });
  it("respeita o fim do expediente", () => {
    expect(horariosLivres({ dia: "2026-10-22", duracao: 90, agora: new Date("2026-10-21T12:00:00Z"), ocupados: [], de: 16, max: 9 })).toEqual(["16:00", "16:30"]);
  });
});

describe("lembretes", () => {
  it("véspera a partir das 9h, uma vez; 1 hora antes, uma vez", () => {
    expect(lembretesDevidos(R(), new Date("2026-10-21T11:30:00Z"))).toEqual({ vespera: false, hora: false }); // 8h30 da véspera
    expect(lembretesDevidos(R(), new Date("2026-10-21T12:05:00Z"))).toEqual({ vespera: true, hora: false });  // 9h05
    expect(lembretesDevidos(R({ lembreteVesperaEm: "2026-10-21T12:05:00Z" }), new Date("2026-10-21T15:00:00Z")).vespera).toBe(false);
    expect(lembretesDevidos(R(), new Date("2026-10-22T17:05:00Z"))).toEqual({ vespera: false, hora: true });  // 14h05
    expect(lembretesDevidos(R({ estado: "cancelada" }), new Date("2026-10-22T17:05:00Z")).hora).toBe(false);
  });
  it("marcada para daqui a pouco: só o aviso de agora, com os minutos certos", () => {
    const r = R({ inicio: "2026-10-22T18:00:00Z", fim: "2026-10-22T18:45:00Z" });
    const agora = new Date("2026-10-22T17:20:00Z");
    expect(lembretesDevidos(r, agora)).toEqual({ vespera: false, hora: true });
    expect(textoHoraGrupo(r, lead, agora)).toMatch(/^\*Em 40 min \(15h\)\*/);
  });
  it("itens do Hoje: hoje, confirmar amanhã e como foi", () => {
    const agora = new Date("2026-10-21T13:00:00Z"); // 10h de 21/10
    const it = itensDeReuniao([
      R({ id: "amanha" }),
      R({ id: "hoje", inicio: "2026-10-21T17:00:00Z", fim: "2026-10-21T17:45:00Z" }),
      R({ id: "passou", inicio: "2026-10-21T11:00:00Z", fim: "2026-10-21T11:45:00Z" }),
      R({ id: "feita", estado: "realizada", inicio: "2026-10-20T11:00:00Z", fim: "2026-10-20T11:45:00Z" }),
    ], agora);
    expect(it.hoje.map((r) => r.id)).toEqual(["hoje"]);
    expect(it.confirmarAmanha.map((r) => r.id)).toEqual(["amanha"]);
    expect(it.comoFoi.map((r) => r.id)).toEqual(["passou"]);
  });
});

describe("textos: com o link, sem valor", () => {
  const SEM_VALOR = /R\$|reais|mensalidade/i;
  it("grupo: marcada, véspera; presencial leva endereço e mapa", () => {
    const t = textoMarcadaGrupo(R(), lead, "Roberto Lino");
    expect(t).toContain("*Reunião marcada*");
    expect(t).toContain("quinta, 22/10 às 15h (45 min)");
    expect(t).toContain("https://meet.google.com/abc-defg-hij");
    expect(t).toContain("Marcada por Roberto");
    const p = textoVesperaGrupo(R({ formato: "presencial", meetUrl: null, local: "Rua Um, 10" }), lead);
    expect(p).toContain("Presencial: Rua Um, 10 — https://www.google.com/maps/search/?api=1&query=Rua%20Um%2C%2010");
    for (const x of [t, p]) expect(x).not.toMatch(SEM_VALOR);
  });
  it("lead: confirmação e pedido de confirmação na véspera", () => {
    expect(mensagemConfirmacaoLead(R(), lead, true)).toMatch(/^Oi, Ana! Combinado: nossa conversa fica para quinta, 22\/10, às 15h, pelo Google Meet: https:\/\/meet/);
    expect(mensagemConfirmacaoLead(R(), lead, true)).toContain("convite no seu e-mail");
    expect(mensagemVesperaLead(R(), lead)).toContain("amanhã, às 15h");
  });
});

describe("hora dita no grupo", () => {
  it("15h, 15h30, 15:30, às 10, 3 da tarde; sem hora → null", () => {
    expect(horaPorFrase("marca reunião quinta 15h")).toBe("15:00");
    expect(horaPorFrase("quinta 15h30 no meet")).toBe("15:30");
    expect(horaPorFrase("dia 23 às 9:30")).toBe("09:30");
    expect(horaPorFrase("sexta às 10")).toBe("10:00");
    expect(horaPorFrase("amanhã às 3 da tarde")).toBe("15:00");
    expect(horaPorFrase("marca reunião com a loja quinta")).toBeNull();
  });
});

describe("Google: state assinado com o destino de volta", () => {
  it("volta para o Comercial; vencido ou adulterado não vale", () => {
    const st = assinarState("comercial", 1_700_000_000_000);
    expect(lerState(st, 1_700_000_000_000 + 60_000)).toEqual({ valido: true, destino: "comercial" });
    expect(lerState(st, 1_700_000_000_000 + 11 * 60_000).valido).toBe(false);
    expect(lerState(st.replace("comercial", "prospeccao"), 1_700_000_000_000 + 60_000).valido).toBe(false);
    expect(lerState(null).valido).toBe(false);
  });
});

describe("Loninho marca reunião", () => {
  const L = (id: string, empresa: string): LeadAssistente => ({ id, empresa, contatoNome: "Fulano", telefone: null, estagio: "contato" });
  const todos = [L("1", "Loja Exemplo"), L("2", "Telhas Beta")];
  const lista = leadsDoPedido(todos);
  const A = (o: Partial<AcaoIA>): AcaoIA => ({ tipo: "reuniao", lead_num: null, lead_texto: "Loja Exemplo", data: null, canal: null, resumo: null, empresa: null, contato: null, telefone: null, hora: null, formato: null, ...o });
  const plan = (a: AcaoIA, texto: string) => planejarPassos({ resposta: { acoes: [a] }, lista, todos, clientes: [], hoje: "2026-10-17", texto });
  it("data e hora resolvidas no código; Meet por padrão", () => {
    expect(plan(A({ data: "2026-10-30", hora: "11:00" }), "Loninho marca reunião com a Loja Exemplo quinta 15h")[0])
      .toMatchObject({ tipo: "reuniao", data: "2026-10-22", hora: "15:00", formato: "meet" });
    expect(plan(A({ formato: "presencial" }), "visita na Loja Exemplo sexta às 10")[0]).toMatchObject({ data: "2026-10-23", hora: "10:00", formato: "presencial" });
  });
  it("sem hora pergunta a hora; sem dia pergunta o dia", () => {
    expect(plan(A({}), "Loninho marca reunião com a Loja Exemplo quinta")[0]).toMatchObject({ tipo: "responder", texto: expect.stringContaining("Que horas") });
    expect(plan(A({}), "Loninho marca reunião com a Loja Exemplo")[0]).toMatchObject({ tipo: "responder", texto: expect.stringContaining("Para que dia") });
  });
});
