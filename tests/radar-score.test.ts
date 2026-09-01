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
