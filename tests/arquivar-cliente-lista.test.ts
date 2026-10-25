// @vitest-environment node
// tests/arquivar-cliente-lista.test.ts — 24/10/2026, auditoria de erro recuperável (item 3.7).
// Arquivar pela lista: sem realtime, o cliente continuava na tela; arquivar de novo regravava a data
// de saída e mandava o aviso de churn DE NOVO ao grupo. Agora a rota recusa o repetido, a lista tira
// o cliente na hora e oferece "Desfazer" (que reabre o ciclo e avisa o grupo que foi engano).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";
import { podeArquivar, podeReativar, PRAZO_DESFAZER_MIN, textoArquivamentoDesfeito } from "@/lib/clients/arquivar";

const banco = bancoEmMemoria();
const espias = vi.hoisted(() => ({ enviar: vi.fn(async (..._args: unknown[]) => ({})), historico: vi.fn(async (..._args: unknown[]) => {}), link: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "roberto@lone", isAdmin: true }) }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: espias.enviar }));
vi.mock("@/lib/clients/historico", () => ({ registrarHistorico: espias.historico }));
vi.mock("@/lib/portal/link-automatico", () => ({ dispararLinkDoPortal: espias.link }));
process.env.CS_CADASTRO_GROUP_JID = "grupo-cadastro@g.us";

const { POST } = await import("@/app/api/clients/[id]/lifecycle/route");
const ID = "11111111-1111-4111-8111-111111111111";
const pedir = (corpo: Record<string, unknown>) =>
  POST(new NextRequest(`http://x/api/clients/${ID}/lifecycle`, { method: "POST", body: JSON.stringify(corpo) }), { params: Promise.resolve({ id: ID }) });
const cliente = () => banco.db.clients.find((c) => c.id === ID)!;

beforeEach(() => {
  banco.limpar();
  espias.enviar.mockClear(); espias.historico.mockClear(); espias.link.mockClear();
  banco.db.clients = [{ id: ID, name: "Padaria do Zé", nome_fantasia: "Padaria do Zé", active: true, churned_at: null, lifecycle: "ativo" }];
  banco.db.client_lifecycles = [{ id: "ciclo-1", client_id: ID, ciclo: 1, iniciou_em: "2026-01-10", encerrou_em: null, offboarding_id: null, motivo: null }];
  banco.db.team_members = [{ email: "roberto@lone", name: "Roberto" }];
});

describe("regra: arquivar e desfazer", () => {
  it("já arquivado: recusa dizendo desde quando, e que o grupo não foi avisado de novo", () => {
    const d = podeArquivar({ active: false, churned_at: "2026-10-20T15:00:00Z", name: "Padaria", nome_fantasia: null });
    expect(d).toMatchObject({ ok: false, status: 409 });
    expect(!d.ok && d.erro).toMatch(/já está arquivado desde 20\/10\/2026/);
    expect(!d.ok && d.erro).toMatch(/grupo não foi avisado de novo/);
  });

  it("ativo: pode arquivar; inexistente: 404", () => {
    expect(podeArquivar({ active: true, churned_at: null })).toEqual({ ok: true });
    expect(podeArquivar(null)).toMatchObject({ ok: false, status: 404 });
  });

  it("desfazer só vale logo depois de arquivar", () => {
    const agora = new Date("2026-10-24T15:00:00Z");
    const recente = { active: false, churned_at: "2026-10-24T14:59:00Z" };
    const velho = { active: false, churned_at: new Date(agora.getTime() - (PRAZO_DESFAZER_MIN + 1) * 60000).toISOString() };
    expect(podeReativar(recente, { desfazer: true, agora })).toEqual({ ok: true });
    expect(podeReativar(velho, { desfazer: true, agora })).toMatchObject({ ok: false, status: 409 });
    expect(podeReativar(velho, { agora })).toEqual({ ok: true }); // Reativar comum continua livre
    expect(podeReativar({ active: true, churned_at: null }, { agora })).toMatchObject({ ok: false, status: 409 });
  });

  it("o aviso do desfazer diz ao grupo para desconsiderar a saída", () => {
    expect(textoArquivamentoDesfeito({ cliente: "Padaria", porQuem: "Roberto" })).toMatch(/continua cliente[\s\S]*Desconsiderem o aviso de saída/);
  });
});

describe("/api/clients/[id]/lifecycle", () => {
  it("arquivar duas vezes: a 2ª é recusada e o aviso de churn sai uma vez só", async () => {
    const r1 = await pedir({ action: "archive", category: "preco" });
    expect(r1.status).toBe(200);
    expect(cliente().active).toBe(false);
    const saida = cliente().churned_at;
    expect(espias.enviar).toHaveBeenCalledTimes(1);

    const r2 = await pedir({ action: "archive", category: "preco" });
    expect(r2.status).toBe(409);
    expect((await r2.json()).error).toMatch(/já está arquivado/);
    expect(espias.enviar).toHaveBeenCalledTimes(1);
    expect(cliente().churned_at).toBe(saida);
  });

  it("desfazer: volta ativo, reabre o ciclo, avisa o grupo que foi engano e não dispara link do portal", async () => {
    await pedir({ action: "archive", category: "preco" });
    expect(banco.db.client_lifecycles[0].encerrou_em).not.toBeNull();
    espias.enviar.mockClear();

    const r = await pedir({ action: "reactivate", desfazer: true });
    expect(r.status).toBe(200);
    expect(cliente().active).toBe(true);
    expect(cliente().churned_at).toBeNull();
    expect(banco.db.client_lifecycles[0].encerrou_em).toBeNull();
    expect(espias.enviar).toHaveBeenCalledTimes(1);
    expect(espias.enviar.mock.calls[0][1]).toMatch(/continua cliente/);
    expect(espias.link).not.toHaveBeenCalled();
  });
});

describe("lista de clientes", () => {
  const src = readFileSync("app/clients/page.tsx", "utf8");
  it("tira o arquivado da tela na hora (sem depender do realtime) e oferece Desfazer", () => {
    expect(src).toMatch(/patchClientLocal\(alvo\.id, \{ active: false/);
    expect(src).toMatch(/label: "Desfazer"/);
    expect(src).toMatch(/action: "reactivate", desfazer: true/);
  });
});
