// tests/grupos-vinculo.test.ts — 25/10/2026, auditoria 9.1/9.2. Dados INVENTADOS.
//
// O QUE ACONTECIA: em /settings/grupos a sugestão de grupo de confiança "média" já vinha escolhida, e o
// "Salvar" mandava a tabela inteira — a rota gravava `whatsapp_group_jid` de TODAS as linhas. Quem
// entrava só para mudar uma verba gravava junto o grupo que ninguém conferiu.
// Aqui: a regra pura (o que mudou, de quem é o grupo) e a rota inteira contra um banco em memória.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  mudancasDaTela, conflitosDeGrupo, conflitosSemConfirmacao, lerVerbaMinima, resumoDaMudanca,
  type AlertasCliente, type EstadoLinha,
} from "@/lib/whatsapp/vinculo-grupo";

const ALERTAS: AlertasCliente = { verbaBaixa: true, verbaZerada: true, erroConta: true, semGasto: true, campanhaParada: false, metaErro: true };
const linha = (jid: string, verba = "", alertas = ALERTAS): EstadoLinha => ({ jid, verba, alertas: { ...alertas } });

describe("o que a tela grava", () => {
  it("o erro original: entrar para mudar a verba de um cliente sem grupo NÃO grava grupo nenhum", () => {
    const { mudancas, erros } = mudancasDaTela([
      { clientId: "a", nome: "Loja Alfa", base: linha(""), atual: linha("", "1.500") },
      { clientId: "b", nome: "Loja Beta", base: linha(""), atual: linha("") },
    ], () => null);
    expect(erros).toEqual([]);
    expect(mudancas).toEqual([{ clientId: "a", nome: "Loja Alfa", verbaMinima: 1500 }]);
    expect(mudancas[0]).not.toHaveProperty("grupo");
  });

  it("só o campo que mudou entra; linha intocada não entra", () => {
    const { mudancas } = mudancasDaTela([
      { clientId: "a", nome: "A", base: linha("g1@g.us", "1.500,00"), atual: linha("g1@g.us", "1500") },
      { clientId: "b", nome: "B", base: linha("g2@g.us"), atual: linha("g2@g.us", "", { ...ALERTAS, campanhaParada: true }) },
      { clientId: "c", nome: "C", base: linha(""), atual: linha("g3@g.us") },
    ], (j) => (j === "g3@g.us" ? "Grupo Gama" : null));
    expect(mudancas).toEqual([
      { clientId: "b", nome: "B", alertas: { ...ALERTAS, campanhaParada: true } },
      { clientId: "c", nome: "C", grupo: { jid: "g3@g.us", nome: "Grupo Gama" } },
    ]);
  });

  it("verba em pt-BR: '1.500' é mil e quinhentos (antes virava 1,5); o que não dá para entender não salva", () => {
    expect(lerVerbaMinima("1.500")).toBe(1500);
    expect(lerVerbaMinima("1.500,00")).toBe(1500);
    expect(lerVerbaMinima("R$ 250,5")).toBe(250.5);
    expect(lerVerbaMinima("")).toBeNull();
    expect(lerVerbaMinima("0")).toBeNull(); // 0 = sem limite próprio (herda o %)
    expect(lerVerbaMinima("mil")).toBeUndefined();
    const { mudancas, erros } = mudancasDaTela([{ clientId: "a", nome: "A", base: linha(""), atual: linha("", "1,500,00") }], () => null);
    expect(mudancas).toEqual([]);
    expect(erros[0].frase).toMatch(/Não entendi o valor/);
  });

  it("o resumo diz o que vai acontecer, em português", () => {
    const antes = { jid: null, nomeGrupo: null, verba: null, alertas: ALERTAS };
    expect(resumoDaMudanca({ clientId: "c", nome: "Loja Gama", grupo: { jid: "g@g.us", nome: "Gama - Marketing" } }, antes))
      .toEqual(['vincular Loja Gama → grupo "Gama - Marketing"']);
    expect(resumoDaMudanca({ clientId: "c", nome: "Loja Gama", grupo: { jid: null, nome: null } }, { ...antes, jid: "g@g.us", nomeGrupo: "Gama" })[0])
      .toMatch(/^desvincular Loja Gama do grupo "Gama"/);
    expect(resumoDaMudanca({ clientId: "c", nome: "Loja Gama", verbaMinima: 1500 }, antes)[0]).toMatch(/R\$\s1\.500,00/);
    expect(resumoDaMudanca({ clientId: "c", nome: "Loja Gama", alertas: { ...ALERTAS, semGasto: false, campanhaParada: true } }, antes))
      .toEqual(["Loja Gama: alertas — liga Parada; desliga S/gasto"]);
  });
});

describe("de quem é o grupo", () => {
  const VENEZA = "120363000000000001@g.us";
  const donos = [
    { clientId: "v1", nome: "Veneza Estofados", jid: VENEZA, ativo: true },
    { clientId: "v2", nome: "Veneza Estofados - Nova Iguaçu", jid: VENEZA, ativo: true },
    { clientId: "x", nome: "Loja Xis", jid: "x@g.us", ativo: true },
  ];

  it("compartilhamento que já existe (Veneza + Nova Iguaçu) não quebra: manter o grupo não é conflito", () => {
    expect(conflitosDeGrupo(donos, [{ clientId: "v2", jid: VENEZA }])).toEqual([]);
  });

  it("cliente novo no grupo de outro: conflito com TODOS os donos, e só passa com os dois confirmados", () => {
    const c = conflitosDeGrupo(donos, [{ clientId: "n", nome: "Loja Nova", jid: VENEZA }]);
    expect(c).toHaveLength(1);
    expect(c[0].outros.map((o) => o.clientId).sort()).toEqual(["v1", "v2"]);
    expect(conflitosSemConfirmacao(c, () => ["v1"])).toHaveLength(1);
    expect(conflitosSemConfirmacao(c, () => ["v1", "v2"])).toHaveLength(0);
  });

  it("troca no mesmo salvamento não acusa (A sai do grupo, B entra)", () => {
    expect(conflitosDeGrupo(donos, [
      { clientId: "x", jid: null },
      { clientId: "n", nome: "Loja Nova", jid: "x@g.us" },
    ])).toEqual([]);
  });

  it("dois clientes indo para o mesmo grupo livre no mesmo salvamento também pede confirmação", () => {
    const c = conflitosDeGrupo([], [{ clientId: "a", nome: "A", jid: "livre@g.us" }, { clientId: "b", nome: "B", jid: "livre@g.us" }]);
    expect(c.map((x) => x.clientId)).toEqual(["a", "b"]);
  });
});

// ─── A rota inteira, contra um banco em memória ───────────────────────────────

type Linha = Record<string, unknown>;
const db: Record<string, Linha[]> = {};
const updatesEmClients: Linha[] = [];
let falharConfigDe: string | null = null;

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "update" | "upsert" = "select";
  private dados: Linha | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  not(c: string) { this.filtros.push((r) => r[c] != null); return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  upsert(d: Linha) { this.op = "upsert"; this.dados = d; return this; }
  then<T>(ok: (r: { data: Linha[] | null; error: { message: string } | null }) => T, erro?: (e: unknown) => T) { return this.exec().then(ok, erro); }
  private async exec(): Promise<{ data: Linha[] | null; error: { message: string } | null }> {
    const t = db[this.tabela];
    if (this.op === "upsert") {
      if (falharConfigDe && this.dados!.client_id === falharConfigDe) return { data: null, error: { message: "falha simulada" } };
      const ja = t.find((r) => r.client_id === this.dados!.client_id);
      if (ja) Object.assign(ja, this.dados); else t.push({ ...this.dados });
      return { data: null, error: null };
    }
    const alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") {
      if (this.tabela === "clients") updatesEmClients.push({ ...this.dados });
      alvo.forEach((r) => Object.assign(r, this.dados));
    }
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t) } }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "roberto@lone", isAdmin: true }) }));
vi.mock("@/lib/whatsapp/evolution", () => ({ listGroups: async () => ({ ok: true, data: [] }) }));

const { POST } = await import("@/app/api/clients/group-mapping/route");

const V1 = "11111111-1111-4111-8111-111111111111"; // Veneza Estofados
const V2 = "22222222-2222-4222-8222-222222222222"; // Veneza Estofados - Nova Iguaçu (mesmo grupo, de propósito)
const N = "33333333-3333-4333-8333-333333333333";  // cliente novo, sem grupo
const GV = "120363000000000001@g.us";

const pedir = (mappings: Linha[]) => POST(new NextRequest("http://x/api/clients/group-mapping", { method: "POST", body: JSON.stringify({ mappings }) }));
const cliente = (id: string) => db.clients.find((c) => c.id === id)!;

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  updatesEmClients.length = 0;
  falharConfigDe = null;
  db.clients = [
    { id: V1, name: "VENEZA ESTOFADOS", nome_fantasia: null, active: true, churned_at: null, whatsapp_group_jid: GV, whatsapp_group_name: "Veneza estofados - Marketing" },
    { id: V2, name: "Veneza Estofados - Nova Iguaçu", nome_fantasia: null, active: true, churned_at: null, whatsapp_group_jid: GV, whatsapp_group_name: "Veneza estofados - Marketing" },
    { id: N, name: "Loja Nova", nome_fantasia: null, active: true, churned_at: null, whatsapp_group_jid: null, whatsapp_group_name: null },
  ];
  db.client_alert_config = [{ client_id: V2, verba_minima: 300, destino: "interno", alert_sem_gasto: true }];
});

describe("POST /api/clients/group-mapping", () => {
  it("o erro original: mudar só a verba não escreve grupo nenhum (nem em quem está sem grupo)", async () => {
    const r = await pedir([{ clientId: N, verbaMinima: 1500 }]);
    expect(r.status).toBe(200);
    expect(updatesEmClients).toEqual([]);
    expect(cliente(N).whatsapp_group_jid).toBeNull();
    expect(db.client_alert_config.find((c) => c.client_id === N)).toMatchObject({ verba_minima: 1500 });
    // Só a coluna que veio: o destino e os alertas não são regravados.
    expect(db.client_alert_config.find((c) => c.client_id === N)).not.toHaveProperty("destino");
    expect(db.client_alert_config.find((c) => c.client_id === N)).not.toHaveProperty("alert_sem_gasto");
  });

  it("grupo de outro cliente sem confirmação: 409 dizendo de quem é, e NADA é gravado (nem a config da mesma leva)", async () => {
    const r = await pedir([
      { clientId: N, groupJid: GV, groupName: "Veneza estofados - Marketing" },
      { clientId: V2, verbaMinima: 999 },
    ]);
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toMatch(/já é de (VENEZA ESTOFADOS e Veneza Estofados - Nova Iguaçu|Veneza Estofados - Nova Iguaçu e VENEZA ESTOFADOS)\. Vincular Loja Nova a ele/);
    expect(j.codigo).toBe("grupo_de_outro_cliente");
    expect(updatesEmClients).toEqual([]);
    expect(cliente(N).whatsapp_group_jid).toBeNull();
    expect(db.client_alert_config.find((c) => c.client_id === V2)!.verba_minima).toBe(300);
  });

  it("confirmado na tela (com os dois donos): compartilha", async () => {
    const r = await pedir([{ clientId: N, groupJid: GV, groupName: "Veneza estofados - Marketing", compartilharCom: [V1, V2] }]);
    expect(r.status).toBe(200);
    expect(cliente(N).whatsapp_group_jid).toBe(GV);
  });

  it("confirmação pela metade não basta", async () => {
    expect((await pedir([{ clientId: N, groupJid: GV, compartilharCom: [V1] }])).status).toBe(409);
  });

  it("os compartilhamentos que já existem não quebram: regravar o mesmo grupo (tela antiga) não acusa nem reescreve", async () => {
    const r = await pedir([
      { clientId: V1, groupJid: GV, groupName: "Veneza estofados - Marketing" },
      { clientId: V2, groupJid: GV, groupName: "Veneza estofados - Marketing", alerts: { semGasto: false } },
    ]);
    expect(r.status).toBe(200);
    expect(updatesEmClients).toEqual([]);
    expect(cliente(V1).whatsapp_group_jid).toBe(GV);
    expect(cliente(V2).whatsapp_group_jid).toBe(GV);
    expect(db.client_alert_config.find((c) => c.client_id === V2)).toMatchObject({ alert_sem_gasto: false, verba_minima: 300 });
  });

  it("9.2: parte salvou, parte não — 207 com quem falhou (antes: 200 e 'N salvos')", async () => {
    falharConfigDe = V2;
    const r = await pedir([{ clientId: N, verbaMinima: 100 }, { clientId: V2, verbaMinima: 200 }]);
    expect(r.status).toBe(207);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.salvos).toEqual([N]);
    expect(j.falhas).toEqual([{ clientId: V2, nome: "Veneza Estofados - Nova Iguaçu", erro: "alertas: falha simulada" }]);
  });

  it("nada salvou: 500 com o motivo (o chamar mostra a frase)", async () => {
    falharConfigDe = N;
    const r = await pedir([{ clientId: N, verbaMinima: 100 }]);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/^Nada foi salvo: N?.*falha simulada/);
  });
});
