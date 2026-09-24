// tests/trafego-visto-canais.test.ts — o "visto" cala o alerta de saldo no WhatsApp (sync-saldos) e
// o Início; sem a tabela (migração ainda não aplicada) tudo sai como antes.

import { describe, it, expect, vi, beforeEach } from "vitest";

let acks: { data: unknown[] | null; error: { code?: string; message: string } | null } = { data: [], error: null };
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => ({
      select: () => {
        if (tabela === "traffic_alert_acks") return Promise.resolve(acks);
        // budget_alert_log: ninguém avisado hoje
        return { eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) };
      },
    }),
  },
}));
vi.mock("@/lib/whatsapp/evolution", () => ({ sendGroupText: async () => ({ ok: true }) }));

import { alertasPendentes, type AlertSettings } from "@/lib/traffic/sync-core";
import { carregarVistos, tabelaAusente } from "@/lib/traffic/hoje/vistos";
import type { DigestAccount } from "@/lib/budgets/alert-engine";
import { DADOS_VAZIOS, type ClienteRow, type Dados } from "@/lib/inicio/dados";
import { montarInicio } from "@/lib/inicio/feed";
import { mapaDeVistos, ocultarVistosNoInicio } from "@/lib/traffic/hoje/visto";

const settings: AlertSettings = { enabled: true, groupJid: "g@g.us", warningPct: 20, criticalPct: 5, mode: "digest" };
const AGORA = "2026-09-24T15:00:00.000Z";
const conta = (id: string, severity: "critical" | "warning"): DigestAccount => ({
  clientName: `Cliente ${id}`, metaAccountId: `act_${id}`, isPrepaid: true, available: 10, daysRemaining: 1,
  avgDailySpend: 50, currency: "BRL", alert: { severity, reason: "saldo baixo", pctRemaining: 5 },
  adAccountId: `uuid-${id}`, clientId: id,
});
const visto = (client_id: string, nivel: string, horasAtras = 1) => ({
  client_id, tipo: "saldo", nivel, seen_by: "julio@x", seen_by_name: "Julio",
  seen_at: new Date(Date.parse(AGORA) - horasAtras * 3_600_000).toISOString(), until: null,
});

beforeEach(() => { acks = { data: [], error: null }; });

describe("WhatsApp de saldo (sync-saldos) respeita o visto", () => {
  it("saldo visto em atenção não sai; o outro cliente sai", async () => {
    acks = { data: [visto("a", "warning")], error: null };
    const r = await alertasPendentes([conta("a", "warning"), conta("b", "warning")], settings, AGORA);
    expect(r.map((x) => x.snap.clientId)).toEqual(["b"]);
  });

  it("piorou (atenção → crítico) sai mesmo visto", async () => {
    acks = { data: [visto("a", "warning")], error: null };
    const r = await alertasPendentes([conta("a", "critical")], settings, AGORA);
    expect(r).toHaveLength(1);
  });

  it("visto de mais de 24h não cala", async () => {
    acks = { data: [visto("a", "critical", 25)], error: null };
    expect(await alertasPendentes([conta("a", "critical")], settings, AGORA)).toHaveLength(1);
  });

  it("sem a tabela (migração não aplicada) tudo sai como antes", async () => {
    acks = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.traffic_alert_acks' in the schema cache" } };
    expect(await alertasPendentes([conta("a", "warning")], settings, AGORA)).toHaveLength(1);
    expect(await carregarVistos()).toMatchObject({ disponivel: false });
    expect(tabelaAusente(acks.error)).toBe(true);
    expect(tabelaAusente({ code: "57014", message: "timeout" })).toBe(false);
  });
});

describe("Início respeita o visto", () => {
  const AGORA_D = new Date(AGORA);
  const cliente = (id: string): ClienteRow => ({
    id, name: id, nome_fantasia: null, logo: null, doc_logo: null, status: "active", active: true, churned_at: null,
    draft_status: null, paused_at: null, paused_until: null, created_at: "2026-01-01T00:00:00Z", assigned_social: null,
    assigned_traffic: "Julio", assigned_designer: null, service_type: "assessoria_trafego", current_health_level: "saudavel",
    current_health_score: 90, last_client_msg_at: null, agente_ativo: false, meta_ad_account_id: "act_1",
    public_report_enabled: false, instagram_user: null, last_post_date: null,
  });
  const dados: Dados = {
    ...DADOS_VAZIOS,
    time: [{ nome: "Julio", papel: "traffic" }],
    clientes: [cliente("a"), cliente("b")],
    contas: ["a", "b"].map((id) => ({
      id: `c-${id}`, client_id: id, meta_account_id: `act_${id}`, account_status: 1, sync_error: null, last_balance: 0,
      is_prepaid: true, monthly_budget: 3000, current_month_spend: 100, last_3d_avg_spend: 100,
    })),
  };
  const saldos = (ocultar?: Parameters<typeof montarInicio>[4]) =>
    montarInicio(dados, { nome: "Julio", papel: "traffic" }, AGORA_D, [], ocultar)
      .itens.filter((i) => i.id.startsWith("saldo:")).map((i) => i.cliente?.id).sort();

  it("saldo zerado visto em crítico some do feed; o do outro cliente fica", () => {
    expect(saldos()).toEqual(["a", "b"]);
    const mapa = mapaDeVistos([visto("a", "critical")]);
    expect(saldos(ocultarVistosNoInicio(mapa, AGORA_D))).toEqual(["b"]);
  });

  it("visto em atenção não esconde o crítico", () => {
    const mapa = mapaDeVistos([visto("a", "warning")]);
    expect(saldos(ocultarVistosNoInicio(mapa, AGORA_D))).toEqual(["a", "b"]);
  });
});
