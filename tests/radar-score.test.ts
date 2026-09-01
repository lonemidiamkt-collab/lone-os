import { describe, it, expect } from "vitest";
import { mediana, outlierRatio, calcularScore, taxaEngajamento } from "@/lib/radar/score";

const post = (likes: number, comments = 0, followers = 10000, postedAt?: string) =>
  ({ likes, comments, followers, postedAt });

describe("radar: o que merece atenção", () => {
  it("perfil pequeno com post excepcional ganha de perfil gigante em rotina", () => {
    // O erro que a proposta pede pra não cometer: classificar por número absoluto.
    const gigante = post(100_000, 500, 2_000_000, new Date().toISOString());
    const pequeno = post(7_500, 300, 15_000, new Date().toISOString());
    const rotinaGigante = Array.from({ length: 10 }, () => post(95_000, 480, 2_000_000));
    const rotinaPequeno = Array.from({ length: 10 }, () => post(600, 20, 15_000));

    const sg = calcularScore(gigante, rotinaGigante);
    const sp = calcularScore(pequeno, rotinaPequeno);
    expect(sp.valor).toBeGreaterThan(sg.valor);
    expect(sp.outlierRatio!).toBeGreaterThan(10);
  });

  it("usa MEDIANA, não média — o outlier não pode puxar a própria base", () => {
    // Posts 5,7,4,8,6 e um de 78. Média = 18 (o 78 se auto-dilui); mediana = 6.
    const hist = [post(5), post(7), post(4), post(8), post(6)];
    expect(mediana(hist.map((h) => h.likes))).toBe(6);
    const r = outlierRatio(post(78), hist);
    expect(r).toBeGreaterThan(10);   // ~13x, a leitura certa
  });

  it("comentário pesa mais que curtida", () => {
    const so_likes = calcularScore(post(100, 0), Array.from({ length: 6 }, () => post(20, 0)));
    const com_coment = calcularScore(post(100, 50), Array.from({ length: 6 }, () => post(20, 0)));
    expect(com_coment.valor).toBeGreaterThan(so_likes.valor);
  });

  it("sem base para comparar, não dá nota — marca como sem base", () => {
    // Perfil recém-cadastrado com 3 posts: taxas erráticas. Deixar competir enche o primeiro
    // relatório de ruído, que é quando a confiança na ferramenta se decide.
    const s = calcularScore(post(500, 10), [post(20), post(30), post(25)]);
    expect(s.temBase).toBe(false);
    expect(s.valor).toBe(0);
    expect(s.outlierRatio).toBeNull();
  });

  it("mediana zero não vira divisão por zero", () => {
    expect(outlierRatio(post(50), Array.from({ length: 8 }, () => post(0, 0)))).toBeNull();
  });

  it("post velho perde para post recente com o mesmo desempenho", () => {
    const hist = Array.from({ length: 8 }, () => post(100, 5));
    const hoje = new Date("2026-09-01T12:00:00Z");
    const novo = calcularScore(post(900, 50, 10000, "2026-08-31T12:00:00Z"), hist, hoje);
    const velho = calcularScore(post(900, 50, 10000, "2026-06-01T12:00:00Z"), hist, hoje);
    expect(novo.valor).toBeGreaterThan(velho.valor);
  });

  it("perfil sem seguidores não quebra a taxa", () => {
    expect(taxaEngajamento({ likes: 10, comments: 2, followers: 0 })).toBeNull();
  });
});

import { avaliarCandidato, diversificar, faixaDePerfil } from "@/lib/radar/score";

// Na primeira descoberta real, a busca trouxe `revestimentosprime`: 9 seguidores, mediana de 1
// curtida, melhor post com 3. O cálculo diz "3x" e, sem piso absoluto, ele competiria com uma loja
// de 42 mil seguidores que fez 23x. Um post de 3 curtidas não é tendência de mercado.
describe("radar: separar sinal de ruído", () => {
  it("ratio alto em perfil minúsculo não vira candidato", () => {
    const v = avaliarCandidato({ engajamento: 3, followers: 9, outlierRatio: 3, postsNaBaseline: 12 });
    expect(v.aceito).toBe(false);
    expect(v.motivo).toMatch(/pequeno demais/i);
  });

  // O piso NÃO escala com seguidores. A primeira versão exigia 2000 interações de conta acima de 1
  // milhão, e medindo no acervo real ZERO conteúdos passavam — inclusive os bons. Para perfil
  // grande o ratio já é o filtro, porque a mediana dele já é alta.
  it("conta grande com post excepcional passa", () => {
    const v = avaliarCandidato({ engajamento: 900, followers: 2_800_000, outlierRatio: 4.2, postsNaBaseline: 25 });
    expect(v.aceito).toBe(true);
  });

  it("mas a loja pequena de verdade passa", () => {
    // revestprime.revestimentos: 2.512 seguidores, 5,5x, 58 interações — achado real da descoberta.
    const v = avaliarCandidato({ engajamento: 58, followers: 2512, outlierRatio: 5.5, postsNaBaseline: 12 });
    expect(v.aceito).toBe(true);
  });

  it("histórico curto não recebe veredito", () => {
    const v = avaliarCandidato({ engajamento: 900, followers: 20000, outlierRatio: 9, postsNaBaseline: 3 });
    expect(v.aceito).toBe(false);
    expect(v.motivo).toMatch(/histórico/i);
  });

  it("desempenho normal do próprio perfil não é notícia", () => {
    // Portobello com 1,4x: muitos likes absolutos, nada excepcional PARA ELA.
    const v = avaliarCandidato({ engajamento: 15000, followers: 663000, outlierRatio: 1.4, postsNaBaseline: 25 });
    expect(v.aceito).toBe(false);
  });

  it("faixas por tamanho de perfil", () => {
    expect(faixaDePerfil(2512)).toBe("micro");
    expect(faixaDePerfil(42423)).toBe("small");
    expect(faixaDePerfil(136488)).toBe("medium");
    expect(faixaDePerfil(1962099)).toBe("enterprise");
  });
});

describe("radar: um perfil não toma conta do relatório", () => {
  const item = (perfil: string, followers: number, score: number) => ({ item: `${perfil}-${score}`, perfil, followers, score });

  it("no máximo 2 posts por perfil", () => {
    const r = diversificar([
      item("lojaA", 8000, 90), item("lojaA", 8000, 88), item("lojaA", 8000, 86), item("lojaA", 8000, 84),
      item("lojaB", 12000, 70), item("lojaC", 30000, 60),
    ], { limite: 10, porPerfil: 2 });
    expect(r.filter((x) => String(x).startsWith("lojaA"))).toHaveLength(2);
    expect(r).toHaveLength(4);
  });

  it("conta gigante entra, mas não domina", () => {
    // O valor do radar é achar a loja pequena que acertou; quem quer saber o que a Leroy postou já
    // sabe onde olhar.
    const gigantes = Array.from({ length: 10 }, (_, i) => item(`grande${i}`, 2_000_000, 95 - i));
    const pequenas = Array.from({ length: 10 }, (_, i) => item(`pequena${i}`, 9_000, 80 - i));
    const r = diversificar([...gigantes, ...pequenas], { limite: 10, tetoGrandes: 0.2 });
    const qtdGrandes = r.filter((x) => String(x).startsWith("grande")).length;
    expect(qtdGrandes).toBeLessThanOrEqual(2);
    expect(r).toHaveLength(10);
  });
});
