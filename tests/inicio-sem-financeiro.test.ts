import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DADOS_VAZIOS, type ClienteRow, type Dados, type LeadRow } from "@/lib/inicio/dados";
import { montarInicio } from "@/lib/inicio/feed";
import type { Viewer } from "@/lib/inicio/tipos";

// Regra do CEO: o painel não mostra dinheiro da agência (MRR, ARR, LTV, fee, valor de contrato,
// orçamento de proposta). O Início lê a verba do cliente para calcular "% da verba" no alerta de
// saldo — esse número pode entrar na conta, nunca no JSON que vai para a tela.

const AGORA = new Date("2026-09-24T15:00:00Z");
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(AGORA); });
afterAll(() => { vi.useRealTimers(); });

const VERBA = 48_765.43;
const ORCAMENTO = 91_234.56;

const cliente = (id: string, o: Partial<ClienteRow> = {}): ClienteRow => ({
  id, name: id, nome_fantasia: null, logo: null, doc_logo: null, status: "active", active: true, churned_at: null,
  draft_status: null, paused_at: null, paused_until: null, created_at: "2026-01-01T00:00:00Z", assigned_social: "Carlos",
  assigned_traffic: "Julio", assigned_designer: "Rodrigo", service_type: "lone_growth", current_health_level: "risco",
  current_health_score: 40, last_client_msg_at: "2026-09-01T00:00:00Z", agente_ativo: true, meta_ad_account_id: "act_1",
  public_report_enabled: true, instagram_user: "x", last_post_date: "2026-09-20", ...o,
});

// Linha "suja": colunas financeiras a mais, como se alguém ampliasse o select por engano.
const sujo = <T,>(linha: T, extra: Record<string, unknown>) => ({ ...linha, ...extra }) as T;

const DADOS: Dados = {
  ...DADOS_VAZIOS,
  time: [{ nome: "Carlos", papel: "social" }, { nome: "Julio", papel: "traffic" }, { nome: "Ana", papel: "comercial" }],
  clientes: [sujo(cliente("a"), { monthly_budget: VERBA, fee: 5000, mrr: 5000, contract_value: 60000 })],
  contas: [{
    id: "c1", client_id: "a", meta_account_id: "act_1", account_status: 1, sync_error: null, last_balance: 120,
    is_prepaid: true, monthly_budget: VERBA, current_month_spend: 31_000.99, last_3d_avg_spend: 400,
  }],
  contratos: [sujo({ client_id: "a", end_date: "2026-10-01" }, { value: 60000, monthly_value: 5000 })],
  leads: [sujo<LeadRow>({
    id: "l1", contato_nome: "Maria", empresa: "Padaria", estagio: "proposta", responsavel: null,
    proximo_contato: "2026-09-20", reuniao_data: "2026-09-26", fechado_em: null,
  }, { valor_orcamento: ORCAMENTO })],
  ajustes: { ...DADOS_VAZIOS.ajustes, tokenMetaCritico: true },
};

const PROIBIDO = /mrr|arr\b|ltv|receita|faturamento|fee|valor|value|budget|verba_|orcamento_|spend|balance|R\$/i;

describe("Início — nenhum dado financeiro da agência no payload", () => {
  const papeis: Viewer[] = [
    { nome: "Roberto", papel: "admin" }, { nome: "Gestora", papel: "manager" }, { nome: "Julio", papel: "traffic" },
    { nome: "Carlos", papel: "social" }, { nome: "Rodrigo", papel: "designer" }, { nome: "Ana", papel: "comercial" },
  ];

  for (const v of papeis) {
    it(`${v.papel}: nenhuma chave nem valor de dinheiro no JSON`, () => {
      const json = JSON.stringify(montarInicio(DADOS, v, AGORA));
      const chaves = [...json.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
      expect(chaves.filter((k) => PROIBIDO.test(k))).toEqual([]);
      expect(json).not.toMatch(/R\$/);
      for (const n of [VERBA, ORCAMENTO, 31_000.99, 5000, 60000, 48765, 91234]) expect(json).not.toContain(String(n));
    });
  }

  it("o feed do tráfego ainda avisa do saldo — por % da verba, sem o valor", () => {
    const r = montarInicio(DADOS, { nome: "Julio", papel: "traffic" }, AGORA);
    const saldo = r.itens.find((i) => i.id.startsWith("saldo:"));
    expect(saldo?.motivo).toMatch(/% da verba/);
  });

  it("a leitura do banco não pede coluna de dinheiro da agência", () => {
    const fonte = readFileSync(path.resolve(__dirname, "../lib/inicio/carregar.ts"), "utf8");
    // "key, value" é o formato chave/valor de agency_settings (limiares de alerta), não dinheiro.
    const literais = [...fonte.matchAll(/select\((["`])([^"`]+)\1/g)].map((m) => m[2]).filter((s) => s !== "key, value");
    const constantes = [...fonte.matchAll(/const COLS_\w+ = "([^"]+)"/g)].map((m) => m[1]);
    expect(constantes.length).toBeGreaterThan(0);
    const selects = [...literais, ...constantes].join(",");
    expect(selects).not.toMatch(/valor_orcamento|mrr|\bfee\b|contract_value|monthly_value|\bvalue\b(?!s)|price|revenue/i);
    // A verba do cliente só é lida em ad_accounts, para o motor de saldo — nunca de clients.
    expect(fonte).not.toMatch(/COLS_CLIENTE = "[^"]*monthly_budget/);
  });
});
