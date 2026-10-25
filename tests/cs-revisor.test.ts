// Teste OFFLINE do revisor CS (sem IA).
// Desenho do Roberto: o executor produz, o Loninho revisa com olho de CS e só então libera.
// Aqui se testa a REGRA de liberação e como o veredito é contado ao time.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { liberado, revisaoQueFalhou, textoDoVeredito, type RevisaoCS } from "@/lib/cs/revisor";

const rev = (o: Partial<RevisaoCS> = {}): RevisaoCS =>
  ({ veredito: "aprovado", motivo: "encaixa com o cliente", ajustes: [], nota: 85, ...o });

describe("liberado — o que pode ir pro cliente", () => {
  it("aprovado com nota boa vai", () => {
    expect(liberado(rev({ nota: 92 }))).toBe(true);
  });

  it("'ajustar' NÃO vai pro cliente — volta pro executor", () => {
    expect(liberado(rev({ veredito: "ajustar", nota: 75 }))).toBe(false);
  });

  it("'refazer' não vai", () => {
    expect(liberado(rev({ veredito: "refazer", nota: 30 }))).toBe(false);
  });

  it("aprovado com nota baixa não vai — a nota é a última barreira", () => {
    expect(liberado(rev({ veredito: "aprovado", nota: 45 }))).toBe(false);
  });
});

describe("textoDoVeredito — o time vê a decisão e pode discordar", () => {
  it("nota alta: fala curto", () => {
    expect(textoDoVeredito(rev({ nota: 95 }), "Imperio")).toContain("pode mandar");
  });

  it("aprovado com ressalva: diz o porquê", () => {
    const t = textoDoVeredito(rev({ nota: 70, motivo: "gancho podia ser mais forte" }), "CIIL");
    expect(t).toContain("dá pra usar");
    expect(t).toContain("gancho");
  });

  it("ajustar: lista o que mudar, item a item", () => {
    const t = textoDoVeredito(rev({
      veredito: "ajustar", motivo: "não cita o produto que ele vende",
      ajustes: ["trocar 'serviços' por 'porcelanato'", "incluir o preço da promoção"],
    }), "Imperio");
    expect(t).toContain("Quase lá");
    expect(t).toContain("porcelanato");
    expect(t).toContain("preço");
  });

  it("refazer: assume que vai refazer, não empurra pro time", () => {
    const t = textoDoVeredito(rev({ veredito: "refazer", motivo: "fala de outro negócio", nota: 20 }), "Portuga");
    expect(t).toContain("Vou refazer");
  });
});

// 25/10/2026 (auditoria 11.5): o revisor que caiu virava "aprovado" com nota 70 e o roteiro saía com
// "revisei aqui e tá pronto pro cliente" — o mesmo "✅ sem ter visto" que originou a regra.
describe("revisor que caiu não vira 'pronto pro cliente'", () => {
  it("a falha é 'não revisado', nunca 'aprovado'", () => {
    const r = revisaoQueFalhou();
    expect(r.veredito).toBe("nao_revisado");
    expect(liberado(r)).toBe(false);
  });

  it("o time lê que precisa conferir", () => {
    const t = textoDoVeredito(revisaoQueFalhou(), "Imperio");
    expect(t).toMatch(/Não consegui revisar/);
    expect(t).toMatch(/confere antes de mandar pro cliente/);
    expect(t).not.toMatch(/pode mandar|dá pra usar/);
  });

  it("o inbound tem a fala própria do não revisado no roteiro", () => {
    const inbound = readFileSync(path.resolve(__dirname, "../app/api/cs/inbound/route.ts"), "utf8");
    expect(inbound).toContain('revisao.veredito === "nao_revisado"');
    expect(inbound).toContain("*não consegui revisar*");
  });
});
