// tests/entregas-do-mes.test.ts — "O que entregamos no mês" (Leva 7C, N21).

import { describe, it, expect } from "vitest";
import {
  entregasPdfHtml, limitesDoMes, mesValido, rascunhoWhatsApp, resumirMes, type DadosEntregasMes,
} from "@/lib/clientes/entregas-do-mes";

const base: DadosEntregasMes = {
  cliente: "Império & Cia", contato: "Ana Paula", mes: "2026-08", hoje: "2026-09-24",
  temTrafego: true, temSocial: true, instagramLigado: true,
  posts: [
    { em: "2026-08-02T15:00:00Z", tipo: "IMAGE", permalink: null },
    { em: "2026-08-05T15:00:00Z", tipo: "REELS", permalink: null },
    { em: "2026-08-09T15:00:00Z", tipo: "CAROUSEL_ALBUM", permalink: null },
  ],
  cardsPublicados: 2, artesEntregues: 5,
  anuncios: { gasto: 840, conversas: 100, dias: 31 }, cplMeta: 10,
  reunioes: [{ em: "2026-08-18T18:00:00Z", titulo: "Reunião mensal" }],
  vencedores: [{ nome: "Promo sábado", evidencia: "CPL 30% abaixo da meta" }],
};

describe("mês", () => {
  it("mês inválido ou futuro cai no mês de hoje; limites do mês", () => {
    expect(mesValido("2026-08", "2026-09-24")).toBe("2026-08");
    expect(mesValido("2026-13", "2026-09-24")).toBe("2026-09");
    expect(mesValido("2026-12", "2026-09-24")).toBe("2026-09");
    expect(mesValido(null, "2026-09-24")).toBe("2026-09");
    expect(limitesDoMes("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
  });
});

describe("resumo", () => {
  it("posts reais do Instagram, Reels, artes, CPL contra a meta", () => {
    const r = resumirMes(base);
    expect(r.conteudo).toEqual({ posts: 3, reels: 1, fonte: "instagram", artes: 5 });
    expect(r.anuncios).toMatchObject({ conversas: 100, cpl: 8.4, cplMeta: 10, difPct: -16 });
    expect(r.parcial).toBe(false);
    expect(r.lacunas).toEqual([]);
    expect(r.temConteudo).toBe(true);
  });

  it("sem Instagram vinculado: conta pelo quadro e avisa", () => {
    const r = resumirMes({ ...base, instagramLigado: false });
    expect(r.conteudo).toMatchObject({ posts: 2, fonte: "board" });
    expect(r.lacunas[0]).toMatch(/Instagram do cliente não vinculado/);
  });

  it("cliente só de social não fala de anúncio; só de tráfego não fala de post", () => {
    expect(resumirMes({ ...base, temTrafego: false }).anuncios).toBeNull();
    expect(resumirMes({ ...base, temSocial: false }).conteudo).toBeNull();
  });

  it("mês sem nada não tem PDF; tráfego sem dado vira lacuna, não zero", () => {
    const r = resumirMes({ ...base, posts: [], artesEntregues: 0, cardsPublicados: 0, anuncios: null, reunioes: [], vencedores: [] });
    expect(r.temConteudo).toBe(false);
    expect(r.lacunas.some((l) => /Sem dados de anúncios/.test(l))).toBe(true);
  });
});

describe("rascunho e PDF", () => {
  it("rascunho com o que tem, sem emoji, primeiro nome do contato", () => {
    const txt = rascunhoWhatsApp(resumirMes(base), base.contato);
    expect(txt.startsWith("Oi, Ana! Passando o resumo do que entregamos em agosto para Império & Cia:")).toBe(true);
    expect(txt).toContain("• 3 posts no ar (1 Reels)");
    expect(txt).toContain("• 5 artes produzidas");
    expect(txt).toContain("• 100 conversas iniciadas");
    expect(txt).toMatch(/R\$\s?8,40 por conversa — 16% abaixo da meta de R\$\s?10,00/);
    expect(txt).toContain('Criativo que mais trouxe resultado: "Promo sábado"');
    expect(txt).toContain("• 1 reunião (18/08)");
    expect(txt).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("mês em curso diz 'até agora'", () => {
    expect(rascunhoWhatsApp(resumirMes({ ...base, mes: "2026-09" }), null)).toMatch(/^Oi! Passando o resumo do que entregamos até agora em setembro/);
  });

  it("PDF escapa o nome e não leva lacuna nem placeholder", () => {
    const html = entregasPdfHtml(resumirMes({ ...base, cplMeta: null }), "", "24/09/2026");
    expect(html).toContain("Império &amp; Cia");
    expect(html).not.toContain("Sem meta de custo");
    expect(html).not.toMatch(/undefined|null|NaN/);
    expect(html).toContain("Documento gerado pelo Lone OS em 24/09/2026");
  });
});
