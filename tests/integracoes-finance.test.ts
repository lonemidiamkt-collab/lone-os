import { describe, expect, it } from "vitest";
import { assinar, conferirAssinatura } from "@/lib/crm/site-lead";
import { CAMINHO_CLIENTES, diaSP, mensagemAssinada, montarClientesParaFinance, type LinhaCliente, type LinhaSaida } from "@/lib/integracoes/finance-clientes";

const base: LinhaCliente = {
  id: "c1", name: "  Loja   Exemplo ", service_type: "lone_growth", lifecycle: "ativo", active: true, draft_status: null,
  join_date: "2026-08-01", activated_at: null, paused_at: null, paused_until: null, churned_at: null,
  churn_category: null, churn_reason: null, source_lead_id: null,
};

describe("pacote de clientes para o financeiro", () => {
  it("leva só situação: nenhuma chave de valor, contato ou documento", () => {
    const [c] = montarClientesParaFinance([base], []);
    expect(Object.keys(c).sort()).toEqual(
      ["ativo", "categoriaSaida", "ciclo", "entrouEm", "id", "leadId", "motivoSaida", "nome", "pausadoAte", "pausadoDesde", "rascunho", "saida", "saiuEm", "servico"].sort(),
    );
    expect(JSON.stringify(c)).not.toMatch(/valor|value|budget|phone|telefone|email|cnpj|cpf/i);
    expect(c.nome).toBe("Loja Exemplo");
  });

  it("saída: data em São Paulo, motivo encurtado e rascunho de onboarding marcado", () => {
    const [c] = montarClientesParaFinance([{ ...base, active: false, lifecycle: "inativo", churned_at: "2026-10-01T02:00:00Z", churn_reason: "x".repeat(500), draft_status: "pending_invite" }], []);
    expect(c.saiuEm).toBe("2026-09-30"); // 02h UTC = 23h do dia anterior em SP
    expect(c.motivoSaida).toHaveLength(200);
    expect(c.ativo).toBe(false);
    expect(c.rascunho).toBe(true);
  });

  it("usa a saída mais recente que não foi cancelada", () => {
    const saidas: LinhaSaida[] = [
      { client_id: "c1", estado: "confirmado", iniciativa: "cliente", motivo: "antiga", solicitado_em: "2026-09-01", encerra_em: "2026-09-30", cancelado_em: null, created_at: "2026-09-01T10:00:00Z" },
      { client_id: "c1", estado: "termo_enviado", iniciativa: "cliente", motivo: "nova", solicitado_em: "2026-10-10", encerra_em: "2026-11-09", cancelado_em: null, created_at: "2026-10-10T10:00:00Z" },
      { client_id: "c1", estado: "rascunho", iniciativa: "lone", motivo: "cancelada", solicitado_em: "2026-10-15", encerra_em: "2026-11-15", cancelado_em: "2026-10-16T10:00:00Z", created_at: "2026-10-15T10:00:00Z" },
    ];
    const [c] = montarClientesParaFinance([base], saidas);
    expect(c.saida).toEqual({ estado: "termo_enviado", iniciativa: "cliente", motivo: "nova", solicitadoEm: "2026-10-10", encerraEm: "2026-11-09" });
  });

  it("entrada cai para a ativação quando não há data de entrada", () => {
    const [c] = montarClientesParaFinance([{ ...base, join_date: null, activated_at: "2026-07-15T15:00:00Z" }], []);
    expect(c.entrouEm).toBe("2026-07-15");
    expect(diaSP(null)).toBeNull();
    expect(diaSP("lixo")).toBeNull();
  });
});

describe("assinatura da leitura", () => {
  const segredo = "s".repeat(40);
  const corpo = mensagemAssinada(CAMINHO_CLIENTES);
  it("método + caminho assinados, janela de 5 minutos", () => {
    const agora = 1_800_000_000_000;
    const ts = String(agora);
    expect(corpo).toBe("GET /api/integracoes/finance/clientes");
    expect(conferirAssinatura({ segredo, timestamp: ts, assinatura: assinar(segredo, ts, corpo), corpo, agora })).toEqual({ ok: true });
    expect(conferirAssinatura({ segredo, timestamp: ts, assinatura: assinar(segredo, ts, corpo), corpo, agora: agora + 6 * 60_000 }).ok).toBe(false);
    expect(conferirAssinatura({ segredo, timestamp: ts, assinatura: assinar("outro".repeat(10), ts, corpo), corpo, agora }).ok).toBe(false);
    expect(conferirAssinatura({ segredo, timestamp: ts, assinatura: assinar(segredo, ts, "GET /api/outra"), corpo, agora }).ok).toBe(false);
  });
});
