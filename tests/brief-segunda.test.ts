import { describe, it, expect } from "vitest";
import { montarBrief, linhasDaConta, escolherProposta, ehAprovacaoDeProposta, ehRecusaDeProposta, type ContaDoBrief } from "@/lib/traffic/brief-segunda";

const conta = (x: Partial<ContaDoBrief>): ContaDoBrief => ({ cliente: "Império", status: "good", gasto7d: 300, conversas7d: 60, cpl7d: 5, cplMeta: 8, vencedor: null, atencao: [], oportunidade: null, ...x });

describe("brief de segunda", () => {
  it("cinco linhas por conta: estado, vencedor, atenção, oportunidade, o que fazer", () => {
    const t = linhasDaConta(conta({ vencedor: { adId: "1", adName: "ADS - PISO", evidencia: "R$ 3,90 por conversa — 51% abaixo da meta", variacao: { nome: "Cenário", muda: "o fundo", mantem: "preço e CTA", testa: "se o cenário mexe no CTR" } }, atencao: [{ adName: "ADS - CIMENTO", evidencia: "R$ 40 sem conversa" }], oportunidade: "mover verba do conjunto X" }));
    const linhas = t.split("\n");
    expect(linhas).toHaveLength(6); // nome + 5
    expect(linhas[1]).toContain("bons resultados · R$ 300,00 em 7d · 60 conversas · R$ 5,00/conversa (meta R$ 8,00)");
    expect(linhas[2]).toMatch(/^🏆 ADS - PISO/); expect(linhas[3]).toMatch(/^⚠️ ADS - CIMENTO/); expect(linhas[4]).toMatch(/^💡 mover verba/);
    expect(linhas[5]).toBe('→ testar "Cenário" (o fundo)');
  });
  it("termina em ação: a proposta é o primeiro vencedor com hipótese pronta, e pede 'pode'", () => {
    const contas = [conta({ cliente: "A" }), conta({ cliente: "B", vencedor: { adId: "9", adName: "ADS - B", evidencia: "e", variacao: { nome: "Sem preço", muda: "tira o preço", mantem: "resto", testa: "fricção" } } })];
    const p = escolherProposta(contas);
    expect(p?.cliente).toBe("B");
    const texto = montarBrief({ contas, semanaLabel: "14/09", nomeGestor: "Julio", proposta: p });
    expect(texto).toContain("Julio, encontrei 1 coisa que importa");
    expect(texto).toContain("*Posso mandar para o designer?*");
    expect(texto.indexOf("*B*")).toBeLessThan(texto.indexOf("*A*")); // vencedor primeiro
  });
  it("'pode' / 'manda' aprovam; 'não' / 'segura' recusam; 'pode ser que…' não é aprovação", () => {
    for (const t of ["pode", "Pode sim", "manda", "bora", "ok"]) expect(ehAprovacaoDeProposta(t), t).toBe(true);
    for (const t of ["não", "Nao, segura", "deixa quieto"]) expect(ehRecusaDeProposta(t), t).toBe(true);
    expect(ehAprovacaoDeProposta("pode ser que amanhã")).toBe(true); // reply à proposta com "pode…" conta — a mensagem citada é a âncora
    expect(ehAprovacaoDeProposta("acho que não")).toBe(false);
  });
});
