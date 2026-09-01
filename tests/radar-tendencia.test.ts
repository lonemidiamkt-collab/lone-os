import { describe, it, expect } from "vitest";
import { semelhanca, agruparPorSemelhanca, candidatas, avaliarForca, assinatura } from "@/lib/radar/tendencia";

const item = (mecanismo: string, perfil: string, outlier = 5, quando = new Date().toISOString()) =>
  ({ mediaId: `${perfil}-${mecanismo.slice(0, 5)}`, perfil, nicho: "Construção e materiais",
     mecanismo, tema: "", formato: "outro", hookTipo: "indefinido", outlier, quando });

// A v1 agrupava por nicho+formato, e "institucional" virava tendência. Formato é recipiente:
// carrossel, Reel e institucional não são movimento de mercado. Mecanismo é o que se replica.
describe("tendência é mecanismo, não formato", () => {
  it("junta conteúdos que fazem a mesma coisa com palavras diferentes", () => {
    const a = "história de legado e tempo de mercado da empresa";
    const b = "legado da empresa, história de décadas no mercado";
    expect(semelhanca(a, b)).toBeGreaterThan(0.34);
  });

  it("não junta mecanismos diferentes que dividem o formato", () => {
    // Os dois seriam "institucional" na v1 e virariam uma tendência falsa.
    const legado = "história de legado e tempo de mercado da empresa";
    const evento = "anúncio de participação em feira do setor";
    expect(semelhanca(legado, evento)).toBeLessThan(0.34);
  });

  it("dois institucionais sem mecanismo comum NÃO viram tendência", () => {
    const grupos = agruparPorSemelhanca([
      item("história de legado e tempo de mercado", "casasbahia"),
      item("anúncio de participação em feira do setor", "canadiansolar"),
    ]);
    expect(grupos).toHaveLength(2);
    expect(candidatas(grupos).every((c) => c.perfisDistintos < 2)).toBe(true);
  });

  it("mesmo mecanismo em perfis diferentes vira tendência", () => {
    const c = candidatas(agruparPorSemelhanca([
      item("história de legado e tempo de mercado da empresa", "casasbahia"),
      item("legado da empresa com décadas de história no mercado", "votorantim"),
    ]));
    expect(c).toHaveLength(1);
    expect(c[0].perfisDistintos).toBe(2);
  });
});

describe("tendência tem ciclo de vida", () => {
  const agora = new Date("2026-09-01T12:00:00Z");

  it("sinal isolado não é tendência", () => {
    const c = candidatas([[item("qualquer mecanismo aqui", "loja")]])[0];
    expect(avaliarForca(c, agora).status).toBe("signal");
  });

  it("tendência que parou de aparecer perde força", () => {
    // Sem isto, dois conteúdos de 40 dias atrás mantinham a tendência viva pra sempre, gerando a
    // mesma pauta toda semana.
    const velho = "2026-07-15T12:00:00Z";
    const c = candidatas([[
      item("história de legado da empresa", "a", 8, velho),
      item("história de legado da empresa", "b", 6, velho),
    ]])[0];
    expect(avaliarForca(c, agora).status).toBe("dead");
  });

  it("confirmação recente em vários perfis fica forte", () => {
    const hoje = "2026-08-30T12:00:00Z";
    const itens = ["a", "b", "c", "d", "e", "f"].map((p) => item("transformação antes e depois do ambiente", p, 12, hoje));
    const r = avaliarForca(candidatas([itens])[0], agora);
    expect(r.status).toBe("strong");
    expect(r.forca).toBeGreaterThanOrEqual(70);
  });

  it("assinatura é estável entre execuções", () => {
    expect(assinatura("história de legado da empresa")).toBe(assinatura("legado história empresa da"));
  });
});

import { extrairHandles } from "@/lib/radar/discovery";

// O extrator pegou a palavra "que" de uma frase e o sistema foi validar na Meta uma conta @que,
// com 92 mil seguidores e nada a ver com construção. Palavra solta do texto não é um @.
describe("extrair handles do texto da busca", () => {
  it("ignora palavra comum solta", () => {
    const r = extrairHandles("perfis que valem a pena: uma loja com mais de mil seguidores");
    expect(r).not.toContain("que");
    expect(r).not.toContain("uma");
    expect(r).not.toContain("loja");
  });

  it("pega handle de empresa de verdade", () => {
    const r = extrairHandles("@lojasconstrular, villarejorevestimentos, instagram.com/moura.revestimentos");
    expect(r).toContain("lojasconstrular");
    expect(r).toContain("villarejorevestimentos");
    expect(r).toContain("moura.revestimentos");
  });

  it("não confunde o domínio com um perfil", () => {
    expect(extrairHandles("veja em instagram.com/reel/ABC123")).not.toContain("instagram");
  });
});

import { tendenciasCrossNiche } from "@/lib/radar/tendencia";

// Na primeira rodada real, "mito_verdade" apareceu na Tintas Coral (construção) e na Casas Bahia
// (móveis), 2,8x cada. Separados por nicho viravam dois sinais soltos e nenhuma tendência. Mas o
// mesmo mecanismo atravessando mercados é sinal MAIS forte: é movimento de consumo de conteúdo, não
// modismo de um mercado.
describe("tendência que atravessa mercados", () => {
  const it2 = (mec: string, perfil: string, nicho: string) =>
    ({ mediaId: `${perfil}`, perfil, nicho, mecanismo: mec, tema: "", formato: "outro",
       hookTipo: "indefinido", outlier: 2.8, quando: new Date().toISOString() });

  it("mesmo mecanismo em nichos diferentes vira tendência geral", () => {
    const r = tendenciasCrossNiche([
      it2("mito_verdade", "tintascoral", "Construção e materiais"),
      it2("mito_verdade", "casasbahia", "Móveis e decoração"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].nicho).toBe("*");
    expect(r[0].perfisDistintos).toBe(2);
  });

  it("dois do MESMO nicho não entram aqui — já são cobertos pelo agrupamento normal", () => {
    const r = tendenciasCrossNiche([
      it2("mito_verdade", "a", "Construção e materiais"),
      it2("mito_verdade", "b", "Construção e materiais"),
    ]);
    expect(r).toHaveLength(0);
  });

  it("descrição em texto livre não atravessa nicho — não é comparável", () => {
    const r = tendenciasCrossNiche([
      it2("história de legado da empresa", "a", "Construção e materiais"),
      it2("história de legado da empresa", "b", "Móveis e decoração"),
    ]);
    expect(r).toHaveLength(0);
  });
});
