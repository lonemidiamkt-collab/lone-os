// tests/relatorio-so-com-contrato.test.ts — o relatório do mês só fala de anúncio com quem CONTRATOU
// tráfego (auditoria 21/10/2026, item 5.4).
//
// O erro original: o mensal sai pra todo cliente com conta OU Instagram vinculado, e a folha de
// anúncios era montada sempre que havia conta de anúncio. Cliente só de social com conta vinculada
// (o Dumar) recebia, no PDF do mês, a página de campanhas que não contratou.

import { describe, it, expect, vi, beforeEach } from "vitest";

const lerRelatorioAnuncios = vi.fn();
const relatorioClienteHtml = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/reports/relatorioClienteDados", () => ({ lerRelatorioAnuncios: (...a: unknown[]) => lerRelatorioAnuncios(...a) }));
vi.mock("@/lib/reports/relatorioClientePdf", () => ({ relatorioClienteHtml: (...a: unknown[]) => relatorioClienteHtml(...a) }));
vi.mock("@/lib/meta/igSnapshot", () => ({
  getIgSnapshotCached: async () => ({ mapped: true, error: null, conta: { username: "loja" } }),
}));
vi.mock("@/lib/cs/roteiro-pdf", () => ({ loadLoneLogo: async () => "logo" }));
vi.mock("@/lib/traffic/renderPdf", () => ({ htmlToPdf: async () => ({ ok: true, buffer: Buffer.from("") }) }));

import {
  contaDeAnunciosDoRelatorio, motivoSemRelatorio, montarHtmlRelatorioCliente, type ReportClientRow,
} from "@/lib/traffic/weekly-report";

const base: ReportClientRow = {
  id: "c1", name: "Dumar", nome_fantasia: null, service_type: "assessoria_social",
  meta_ad_account_id: "act_2350633382029247", ig_business_account_id: "ig1",
};

beforeEach(() => {
  lerRelatorioAnuncios.mockReset().mockResolvedValue({ campanhas: [] });
  relatorioClienteHtml.mockReset().mockReturnValue("<html></html>");
});

describe("contaDeAnunciosDoRelatorio", () => {
  it("só social com conta vinculada → sem conta no relatório", () => {
    expect(contaDeAnunciosDoRelatorio(base)).toBeNull();
  });
  it("com contrato de tráfego → a conta entra", () => {
    expect(contaDeAnunciosDoRelatorio({ ...base, service_type: "lone_growth" })).toBe("act_2350633382029247");
  });
  it("contrato de tráfego sem conta → nada a ler", () => {
    expect(contaDeAnunciosDoRelatorio({ ...base, service_type: "assessoria_trafego", meta_ad_account_id: null })).toBeNull();
  });
});

describe("montarHtmlRelatorioCliente", () => {
  it("cliente só de social: não lê anúncio e o PDF sai só com o Instagram", async () => {
    const r = await montarHtmlRelatorioCliente("tok", base, 30);
    expect(r.ok).toBe(true);
    expect(lerRelatorioAnuncios).not.toHaveBeenCalled();
    expect(relatorioClienteHtml).toHaveBeenCalledWith(expect.objectContaining({ anuncios: null }));
  });

  it("cliente de tráfego: a folha de anúncios continua", async () => {
    await montarHtmlRelatorioCliente("tok", { ...base, service_type: "assessoria_trafego" }, 30);
    expect(lerRelatorioAnuncios).toHaveBeenCalledTimes(1);
  });

  it("só social sem Instagram: erro que diz por quê, não um PDF de anúncios", () => {
    expect(motivoSemRelatorio({ ...base })).toContain("contrato não inclui tráfego");
    expect(motivoSemRelatorio({ ...base, service_type: "assessoria_trafego" })).toBe("sem veiculação nem Instagram no período");
    expect(motivoSemRelatorio({ ...base, meta_ad_account_id: null })).toBe("cliente sem tráfego nem Instagram");
  });
});
