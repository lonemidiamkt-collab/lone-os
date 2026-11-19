// Aba "Atendimento e vendas" do portal (18/11/2026, visual do painel novo): roda o componente com a API simulada.
// O que importa: os números do CRM aparecem nos cartões do painel; período que não pôde ser lido diz "atualizando",
// nunca zero; nome de etapa vira texto (não HTML). Nomes e números inventados.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { deAncora } from "@/lib/crm-externo/metricas";
import { montarRelatorioCrm } from "@/lib/crm-externo/relatorio";
import { janelaDoRelatorio, janelaAnterior } from "@/lib/reports/relatorioCliente";

const api = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
const { default: PortalCrm } = await import("@/components/portal/PortalCrm");

const janela = janelaDoRelatorio("2026-11-09", "2026-11-15");
const metricas = deAncora({
  resumo: { receita_janela: 1_250_000, vendas_janela: 5, leads_janela: 40, coorte: { leads: 40, convertidos: 6 },
    funil_por_etapa: [{ stage_id: "s1", negocios: 7 }] },
  atendimento: { sla: { mediana_secs: 180, p90_secs: 900, respondidas: 28, faixas: { boa: 20, atencao: 5, estourada: 3 } } },
  recuperadas: null,
  etapas: [{ id: "s1", nome: "<b>Proposta</b>", posicao: 1, funil: "f1" }],
});
const relatorio = montarRelatorioCrm({ provedor: "ancora", janela, anterior: janelaAnterior(janela), atual: metricas, doAnterior: null });

beforeEach(() => api.chamar.mockReset());

describe("aba Atendimento e vendas", () => {
  it("mostra os números nos cartões, as faixas de resposta e o funil", async () => {
    api.chamar.mockResolvedValue({ ok: true, status: 200, erro: null, data: { conectado: true, relatorio, indisponivel: false } });
    render(<PortalCrm token="t1" />);
    expect(await screen.findByText("Vendas")).toBeTruthy();
    expect(screen.getByText("Leads")).toBeTruthy();
    expect(screen.getByText("3 min")).toBeTruthy();
    expect(screen.getByText("Menos de 5 min")).toBeTruthy();
    expect(screen.getByText("<b>Proposta</b>")).toBeTruthy(); // texto, não HTML
    expect(screen.getByText(/Do seu CRM \(Âncora CRM\)/)).toBeTruthy();
    expect(api.chamar).toHaveBeenCalledWith("/api/portal/t1/crm", { period_kind: "last_week" });
  });

  it("CRM que não respondeu: 'atualizando', sem cartão com zero", async () => {
    api.chamar.mockResolvedValue({ ok: true, status: 200, erro: null, data: { conectado: true, relatorio: null, indisponivel: true } });
    render(<PortalCrm token="t1" />);
    await waitFor(() => expect(screen.getByText(/estão sendo atualizados/)).toBeTruthy());
    expect(screen.queryByText("Vendas")).toBeNull();
  });

  it("falha de rede: aviso com tentar de novo", async () => {
    api.chamar.mockResolvedValue({ ok: false, status: 0, erro: null, data: null });
    render(<PortalCrm token="t1" />);
    await waitFor(() => expect(screen.getByText(/Verifique sua conexão/)).toBeTruthy());
    expect(screen.getByText("Tentar de novo")).toBeTruthy();
  });
});
