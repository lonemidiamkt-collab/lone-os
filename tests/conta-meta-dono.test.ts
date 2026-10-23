// tests/conta-meta-dono.test.ts — 21/10/2026, auditoria de erro recuperável (item 3.3).
// Vincular na ficha uma conta de anúncio que já era de outro cliente passava a conta para este em
// silêncio (upsert por meta_account_id + gatilho): alerta de verba, digest e portal de um cliente iam
// para o outro. Aqui a DECISÃO que a rota /api/clients/update toma antes de gravar.

import { describe, expect, it } from "vitest";
import {
  consequenciaDaTransferencia, decidirVinculo, descreverDono, mapearDonos, normalizarContaMeta,
  type LinhaClienteConta,
} from "@/lib/clients/conta-meta";

const cli = (id: string, nome: string, conta: string | null, extra: Partial<LinhaClienteConta> = {}): LinhaClienteConta => ({
  id, name: nome, nome_fantasia: null, active: true, churned_at: null, meta_ad_account_id: conta, meta_ad_account_name: null, ...extra,
});

describe("conta Meta: de quem é", () => {
  it("normaliza: uma grafia só (act_<número>); vazio vira null", () => {
    expect(normalizarContaMeta("123")).toBe("act_123");
    expect(normalizarContaMeta(" act_123 ")).toBe("act_123");
    expect(normalizarContaMeta("")).toBeNull();
    expect(normalizarContaMeta(null)).toBeNull();
  });

  it("junta ficha e carteira de tráfego (com e sem act_) e marca onde cada um tem a conta", () => {
    const mapa = mapearDonos(
      [cli("a", "Bazar Ribeiro", "123"), cli("b", "Veneza", "act_999"), cli("c", "Antigo", "act_555", { active: false })],
      [{ client_id: "b", meta_account_id: "act_123" }, { client_id: "a", meta_account_id: "act_777" }],
    );
    const donos123 = mapa.get("act_123")!;
    expect(donos123.map((d) => [d.clientId, d.naFicha, d.noEspelho])).toEqual([["a", true, false], ["b", false, true]]);
    expect(donos123[0].contaNaFicha).toBe("123"); // grafia original, para devolver se a transferência falhar
    expect(mapa.get("act_555")![0].ativo).toBe(false);
  });

  it("descreve o dono do jeito que quem clica entende", () => {
    expect(descreverDono({ nome: "Bazar Ribeiro", ativo: true, naFicha: true })).toBe("é do cliente Bazar Ribeiro");
    expect(descreverDono({ nome: "Antigo", ativo: false, naFicha: true })).toMatch(/arquivado/);
    expect(descreverDono({ nome: "Veneza", ativo: true, naFicha: false })).toMatch(/alerta de verba de Veneza/);
    expect(consequenciaDaTransferencia([{ nome: "Bazar Ribeiro" }])).toMatch(/Bazar Ribeiro deixa de ter a conta: alerta de verba/);
  });
});

describe("conta Meta: decidir o vínculo (rota /api/clients/update)", () => {
  const donosDe = (conta: string, clientes: LinhaClienteConta[], espelho: { client_id: string; meta_account_id: string }[] = []) =>
    mapearDonos(clientes, espelho).get(conta) ?? [];

  it("o bug: conta de outro cliente ATIVO sem confirmação → recusa (409) dizendo de quem é", () => {
    const donos = donosDe("act_123", [cli("a", "Bazar Ribeiro", "act_123")], [{ client_id: "a", meta_account_id: "act_123" }]);
    const d = decidirVinculo({ clientId: "novo", contaAtual: null, contaNova: "act_123", donos, transferir: false });
    expect(d.acao).toBe("recusar");
    if (d.acao !== "recusar") return;
    expect(d.erro).toMatch(/é do cliente Bazar Ribeiro/);
    expect(d.erro).toMatch(/confirme a transferência/);
    expect(d.donos.map((x) => x.clientId)).toEqual(["a"]);
  });

  it("também pede confirmação para ex-cliente e para quem só tem a conta no alerta de verba", () => {
    const ex = donosDe("act_5", [cli("x", "Antigo", "act_5", { churned_at: "2026-09-01" })]);
    expect(decidirVinculo({ clientId: "n", contaAtual: null, contaNova: "act_5", donos: ex, transferir: false }).acao).toBe("recusar");
    const soEspelho = donosDe("act_6", [cli("y", "Veneza", "act_999")], [{ client_id: "y", meta_account_id: "act_6" }]);
    const d = decidirVinculo({ clientId: "n", contaAtual: null, contaNova: "act_6", donos: soEspelho, transferir: false });
    expect(d.acao === "recusar" && d.erro).toMatch(/alerta de verba de Veneza/);
  });

  it("com confirmação → transfere de quem tinha (a rota tira de lá antes de gravar aqui)", () => {
    const donos = donosDe("act_123", [cli("a", "Bazar Ribeiro", "act_123")]);
    const d = decidirVinculo({ clientId: "novo", contaAtual: "act_1", contaNova: "act_123", donos, transferir: true });
    expect(d).toMatchObject({ acao: "transferir", de: [{ clientId: "a", nome: "Bazar Ribeiro", naFicha: true }] });
  });

  it("conta livre → vincula; conta que só este cliente tem → vincula", () => {
    expect(decidirVinculo({ clientId: "c", contaAtual: null, contaNova: "act_1", donos: [], transferir: false })).toEqual({ acao: "vincular" });
    const proprio = donosDe("act_1", [], [{ client_id: "c", meta_account_id: "act_1" }]);
    expect(decidirVinculo({ clientId: "c", contaAtual: null, contaNova: "act_1", donos: proprio, transferir: false })).toEqual({ acao: "vincular" });
  });

  it("salvar o cadastro com a MESMA conta (o modal manda em todo salvamento) não toma a conta de ninguém", () => {
    // Dado legado: dois clientes com a mesma conta na ficha. Editar o nome de um não pode puxar
    // a conta do outro nem travar o salvamento.
    const donos = donosDe("act_123", [cli("a", "Bazar Ribeiro", "act_123"), cli("b", "Bazar Filial", "123")]);
    expect(decidirVinculo({ clientId: "b", contaAtual: "123", contaNova: "act_123", donos, transferir: false })).toEqual({ acao: "manter" });
  });
});
