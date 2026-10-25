// tests/alarmes-rodada.test.ts — quem a rodada julga e o que decide (lib/traffic/alarmes/rodada.ts).

import { describe, it, expect } from "vitest";
import { montarContas, decidirRodada, gastoPorDia, type ContaAlarme } from "@/lib/traffic/alarmes/rodada";
import { diasAntes, type DiaCampanha } from "@/lib/traffic/alarmes/sem-conversa";

const agora = new Date("2026-10-23T17:00:00Z"); // 14h em São Paulo
const HOJE = "2026-10-23";

const cliente = (o: Record<string, unknown> = {}) => ({
  id: "c1", name: "Reformar construção", nome_fantasia: null, assigned_traffic: "Julio", service_type: "lone_growth",
  active: true, churned_at: null, paused_at: null, paused_until: null, monthly_budget: 4000, ...o,
});
const conta = (o: Record<string, unknown> = {}) => ({
  client_id: "c1", meta_account_id: "act_1", account_status: 1, monthly_budget: 4000, is_prepaid: true, last_balance: 3000, ...o,
});

describe("quem a rodada julga", () => {
  it("cliente ativo com tráfego contratado entra, com a verba da conta e a meta de custo", () => {
    const [c] = montarContas({ contas: [conta()], clientes: [cliente()], politicas: [{ client_id: "c1", cpl_meta: 6.92 }], ocultasJson: null, agora });
    expect(c).toMatchObject({ nome: "Reformar construção", gestor: "Julio", verba: 4000, cplMeta: 6.92, contaAtiva: true, saldo: 3000 });
  });

  it("só social (o contrato decide, não a conta Meta), pausado, ex-cliente e conta oculta ficam de fora", () => {
    const fora = (cli: Record<string, unknown>, ocultas: string | null = null) =>
      montarContas({ contas: [conta()], clientes: [cliente(cli)], politicas: [], ocultasJson: ocultas, agora }).length;
    expect(fora({ service_type: "social_media" })).toBe(0);
    expect(fora({ paused_at: "2026-10-01T00:00:00Z", paused_until: null })).toBe(0);
    expect(fora({ active: false })).toBe(0);
    expect(fora({}, JSON.stringify(["act_1"]))).toBe(0);
    expect(fora({})).toBe(1);
  });

  it("verba: a da conta de anúncio; sem ela, a do cadastro; zero nas duas = sem verba", () => {
    const v = (contaV: number | null, cliV: number | null) =>
      montarContas({ contas: [conta({ monthly_budget: contaV })], clientes: [cliente({ monthly_budget: cliV })], politicas: [], ocultasJson: null, agora })[0].verba;
    expect(v(1000, 1500)).toBe(1000);
    expect(v(null, 1000)).toBe(1000); // MAX Contabilidade, 25/10/2026
    expect(v(0, 0)).toBeNull();
  });
});

const base: ContaAlarme = {
  clientId: "c1", nome: "Reformar construção", gestor: "Julio", metaAccountId: "act_1",
  verba: 4000, isPrepaid: true, saldo: 3000, contaAtiva: true, cplMeta: 6.92,
};
function historico(): DiaCampanha[] {
  return diasAntes(HOJE, 14).flatMap((data) => [{ data, campanhaId: "msg", gasto: 120, conversas: 14 }]);
}

describe("o que a rodada decide", () => {
  it("leitura que falhou não é julgada (nunca vira 'zero conversa')", () => {
    const r = decidirRodada({ contas: [base], leitura: new Map(), semConversaAbertos: [], verbaDoMes: [], hoje: HOJE, horaSP: 14 });
    expect(r.lidas).toBe(0);
    expect(r.falhasLeitura).toEqual(["Reformar construção"]);
    expect(r.semConversa).toHaveLength(0);
  });

  it("sem episódio aberto → novo; com episódio aberto → lembrete; 2 conversas → fecha os abertos", () => {
    const zerado = new Map([["act_1", [...historico(), { data: HOJE, campanhaId: "msg", gasto: 60, conversas: 0 }]]]);
    expect(decidirRodada({ contas: [base], leitura: zerado, semConversaAbertos: [], verbaDoMes: [], hoje: HOJE, horaSP: 14 }).semConversa[0].decisao).toBe("novo");
    const aberto = [{ id: "e1", meta_account_id: "act_1", tipo: "sem_conversa" }];
    expect(decidirRodada({ contas: [base], leitura: zerado, semConversaAbertos: aberto, verbaDoMes: [], hoje: HOJE, horaSP: 14 }).semConversa[0].decisao).toBe("lembrete");
    const voltou = new Map([["act_1", [...historico(), { data: HOJE, campanhaId: "msg", gasto: 60, conversas: 3 }]]]);
    const r = decidirRodada({ contas: [base], leitura: voltou, semConversaAbertos: aberto, verbaDoMes: [], hoje: HOJE, horaSP: 14 });
    expect(r.fechar).toEqual([{ conta: base, ids: ["e1"] }]);
    expect(r.semConversa).toHaveLength(0);
  });

  it("verba: avisa uma vez por mês por nível; 'estourou' depois de 'estourando' ainda sai", () => {
    const leitura = new Map([["act_1", [
      ...diasAntes(HOJE, 22).map((data) => ({ data, campanhaId: "msg", gasto: 185, conversas: 20 })),
      { data: HOJE, campanhaId: "msg", gasto: 60, conversas: 5 },
    ]]]);
    const estourou = decidirRodada({ contas: [base], leitura, semConversaAbertos: [], verbaDoMes: [], hoje: HOJE, horaSP: 14 });
    expect(estourou.ritmoAvisar.map((x) => x.tipo)).toEqual(["verba_estourou"]);
    const jaAvisado = decidirRodada({ contas: [base], leitura, semConversaAbertos: [], verbaDoMes: [{ id: "v1", meta_account_id: "act_1", tipo: "verba_estourou" }], hoje: HOJE, horaSP: 14 });
    expect(jaAvisado.ritmoAvisar).toHaveLength(0);
    const soEstourando = decidirRodada({ contas: [base], leitura, semConversaAbertos: [], verbaDoMes: [{ id: "v2", meta_account_id: "act_1", tipo: "verba_estourando" }], hoje: HOJE, horaSP: 14 });
    expect(soEstourando.ritmoAvisar.map((x) => x.tipo)).toEqual(["verba_estourou"]);
  });

  it("'estourou' fecha quando a conta para de gastar depois do meio-dia (pausaram)", () => {
    const leitura = new Map([["act_1", diasAntes(HOJE, 22).map((data) => ({ data, campanhaId: "msg", gasto: 185, conversas: 20 }))]]);
    const aberto = [{ id: "v1", meta_account_id: "act_1", tipo: "verba_estourou", resolvido_em: null }];
    expect(decidirRodada({ contas: [base], leitura, semConversaAbertos: [], verbaDoMes: aberto, hoje: HOJE, horaSP: 14 }).ritmoResolver).toEqual([{ conta: base, ids: ["v1"] }]);
    expect(decidirRodada({ contas: [base], leitura, semConversaAbertos: [], verbaDoMes: aberto, hoje: HOJE, horaSP: 9 }).ritmoResolver).toHaveLength(0);
  });
});

describe("gastoPorDia", () => {
  it("soma as campanhas do dia e põe zero no dia sem linha", () => {
    expect(gastoPorDia([
      { data: "2026-10-21", campanhaId: "a", gasto: 10, conversas: 1 },
      { data: "2026-10-21", campanhaId: "b", gasto: 5.5, conversas: 0 },
    ], ["2026-10-20", "2026-10-21"])).toEqual([0, 15.5]);
  });
});
