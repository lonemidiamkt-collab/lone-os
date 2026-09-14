import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { avaliarCriativo, baselineDaConta, janela, type DiaCriativo } from "@/lib/traffic/creative-health";

// GOLDEN: quatro anúncios reais (meta_entity_snapshots, 14/09/2026) com a política do cliente.
// Rotulados pelo que os números dizem; o Julio confirma/corrige ao longo do shadow de 14 dias.
const golden = JSON.parse(readFileSync("tests/golden/creative-health.json", "utf8")) as {
  anuncios: { ad: string; nome: string; politica: { cplAlerta: number; cplCritico: number; convMin: number }; serie: DiaCriativo[] }[];
};
const HOJE = "2026-09-14";
const por = (nome: string) => golden.anuncios.find((a) => a.nome.includes(nome))!;
const baseline = baselineDaConta(golden.anuncios, HOJE);

describe("saúde do criativo — nunca por uma métrica só", () => {
  it("'SE VOCÊ ESTÁ PRECISANDO': CTR caiu e o custo por conversa disparou → CRITICAL com evidência dos dois", () => {
    const a = por("SE VOCÊ ESTÁ PRECISANDO");
    const r = avaliarCriativo({ adId: a.ad, serie: a.serie, hoje: HOJE, politica: a.politica, baseline });
    expect(r.estado).toBe("CRITICAL");
    expect(r.sinais.map((s) => s.chave)).toEqual(expect.arrayContaining(["cpl_subindo"]));
    expect(r.sinais.length).toBeGreaterThanOrEqual(2);
    expect(r.evidencias.join(" ")).toMatch(/Custo por conversa subiu \+\d+%/);
    expect(r.confianca).toBeGreaterThan(0.5);
    expect(r.vencedor.sim).toBe(false);
  });

  it("'TERMOGENICO': CTR caiu mas o custo por conversa MELHOROU → no máximo WATCH, nunca crítico", () => {
    const a = por("TERMOGENICO");
    const r = avaliarCriativo({ adId: a.ad, serie: a.serie, hoje: HOJE, politica: a.politica, baseline });
    expect(["HEALTHY", "WATCH"]).toContain(r.estado);
    // 1 dia, 621 impressões e 1 conversa nos "últimos 3 dias" não são amostra para nenhum sinal
    expect(r.sinais.map((s) => s.chave)).not.toContain("cpl_subindo");
    expect(r.sinais.map((s) => s.chave)).not.toContain("ctr_caindo");
  });

  it("'CONSTRUINDO OU REFORMANDO': 20 dias estável → idade conta como sinal fraco, sem alarme", () => {
    const a = por("CONSTRUINDO OU REFORMANDO");
    const r = avaliarCriativo({ adId: a.ad, serie: a.serie, hoje: HOJE, politica: a.politica, baseline });
    expect(["HEALTHY", "WATCH"]).toContain(r.estado);
    expect(r.severidade).toBeLessThan(40);
  });

  it("'SEU LAR MERECE': R$ 43 em 7 dias para 1 conversa com meta de R$ 3,39 → CRITICAL por conta esperada × entregue, não por CPL de 1 conversa", () => {
    const a = por("SEU LAR MERECE");
    const r = avaliarCriativo({ adId: a.ad, serie: a.serie, hoje: HOJE, politica: a.politica, baseline });
    expect(r.estado).toBe("CRITICAL");
    expect(r.sinais.map((s) => s.chave)).toContain("poucas_conversas");
    expect(r.evidencias.join(" ")).toMatch(/1 conversa com R\$ 43,\d\d em 7 dias — pela meta de R\$ 3,39 eram esperadas ~1\d/);
  });

  it("amostra mínima: 2 dias e R$ 12 não dão veredito", () => {
    const serie: DiaCriativo[] = [{ data: "2026-09-13", spend: 6, impressions: 800, clicks: 8, conversions: 0 }, { data: "2026-09-14", spend: 6, impressions: 700, clicks: 5, conversions: 1 }];
    const r = avaliarCriativo({ adId: "novo", serie, hoje: HOJE, politica: { cplAlerta: 8, cplCritico: 12, convMin: 8 } });
    expect(r.estado).toBe("SEM_AMOSTRA");
    expect(r.evidencias[0]).toMatch(/Amostra insuficiente/);
    expect(r.confianca).toBe(0);
  });

  it("frequência só é sinal quando MEDIDA; sem ela não é zero", () => {
    const a = por("CONSTRUINDO OU REFORMANDO");
    const sem = avaliarCriativo({ adId: a.ad, serie: a.serie, hoje: HOJE, politica: a.politica, baseline });
    const com = avaliarCriativo({ adId: a.ad, serie: a.serie, hoje: HOJE, politica: a.politica, baseline, freq7d: 4.8 });
    expect(sem.sinais.map((s) => s.chave)).not.toContain("frequencia_alta");
    expect(com.sinais.find((s) => s.chave === "frequencia_alta")?.forte).toBe(true);
  });

  it("vencedor pela régua do CLIENTE: CPL 30% abaixo da meta, conversas mínimas e gasto de decisão", () => {
    const serie: DiaCriativo[] = Array.from({ length: 10 }, (_, i) => ({ data: `2026-09-${String(5 + i).padStart(2, "0")}`, spend: 30, impressions: 3000, clicks: 90, conversions: 8 }));
    const r = avaliarCriativo({ adId: "x", serie, hoje: HOJE, politica: { cplAlerta: 8, cplCritico: 12, convMin: 8 }, baseline: { ctrMediano: 1.5, cpmMediano: 10, cplMediano: 7 } });
    expect(r.estado).toBe("HEALTHY");
    expect(r.vencedor.sim).toBe(true);
    expect(r.vencedor.evidencias[0]).toMatch(/por conversa nos últimos 7 dias — \d+% abaixo da meta/);
    // mesma peça, cliente com meta apertada (R$ 4): não é vencedora
    const r2 = avaliarCriativo({ adId: "x", serie, hoje: HOJE, politica: { cplAlerta: 4, cplCritico: 6, convMin: 8 } });
    expect(r2.vencedor.sim).toBe(false);
  });

  it("janela: só dias com gasto; CPL indefinido sem conversa (não zero)", () => {
    const j = janela([{ data: "2026-09-13", spend: 10, impressions: 1000, clicks: 10, conversions: 0 }, { data: "2026-09-14", spend: 0, impressions: 0, clicks: 0, conversions: 0 }], "2026-09-12", "2026-09-14");
    expect(j.dias).toBe(1);
    expect(j.cpl).toBeNull();
    expect(j.ctr).toBe(1);
  });
});
