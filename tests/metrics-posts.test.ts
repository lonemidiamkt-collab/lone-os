// Teste OFFLINE do cálculo de posts por mês/semana (só lógica pura, sem banco).
import { describe, it, expect } from "vitest";
import { semanasDoMes, distribuir, labelMes } from "@/lib/metrics/posts";

describe("semanasDoMes", () => {
  it("julho/2026 começa numa quarta e a 1ª semana fecha no domingo dia 5", () => {
    const s = semanasDoMes("2026-07", "2026-07-27");
    expect(s[0].inicio).toBe("2026-07-01");
    expect(s[0].fim).toBe("2026-07-05");
    expect(s[0].label).toBe("01–05/07");
  });

  it("a última semana é cortada no último dia do mês, não invade agosto", () => {
    const s = semanasDoMes("2026-07", "2026-07-27");
    expect(s[s.length - 1].fim).toBe("2026-07-31");
  });

  it("semana que ainda não terminou NÃO conta como encerrada", () => {
    // Em 27/07 (segunda), a semana 27/07–02/08 está em curso.
    const s = semanasDoMes("2026-07", "2026-07-27");
    const emCurso = s.find((x) => x.inicio <= "2026-07-27" && x.fim >= "2026-07-27")!;
    expect(emCurso.encerrada).toBe(false);
    expect(s[0].encerrada).toBe(true);
  });

  it("cobre o mês inteiro sem buraco nem sobreposição", () => {
    const s = semanasDoMes("2026-02", "2026-03-01"); // fevereiro
    expect(s[0].inicio).toBe("2026-02-01");
    expect(s[s.length - 1].fim).toBe("2026-02-28");
    for (let i = 1; i < s.length; i++) {
      const anterior = new Date(`${s[i - 1].fim}T00:00:00Z`);
      anterior.setUTCDate(anterior.getUTCDate() + 1);
      expect(s[i].inicio).toBe(anterior.toISOString().slice(0, 10));
    }
  });
});

describe("distribuir — onde ficou o buraco", () => {
  const semanas = semanasDoMes("2026-07", "2026-07-31");

  it("põe cada post na semana certa", () => {
    // Araruama Tintas: caso real, 8 posts em julho.
    const d = distribuir(semanas, ["2026-07-01", "2026-07-03", "2026-07-06", "2026-07-24"]);
    expect(d[0].posts).toBe(2); // 01 e 03 caem em 01–05
    expect(d.reduce((s, x) => s + x.posts, 0)).toBe(4);
  });

  it("aponta a semana ENCERRADA que ficou sem post — o que o dono quer ver", () => {
    const d = distribuir(semanas, ["2026-07-01", "2026-07-24"]);
    const vazias = d.filter((s) => s.encerrada && s.posts === 0).map((s) => s.label);
    expect(vazias.length).toBeGreaterThan(0);
    expect(vazias).not.toContain(d[0].label); // a primeira teve post
  });

  it("mês sem post nenhum marca todas as semanas encerradas", () => {
    const d = distribuir(semanas, []);
    expect(d.every((s) => s.posts === 0)).toBe(true);
  });

  it("não conta post de outro mês que passe por engano", () => {
    const d = distribuir(semanas, ["2026-06-30", "2026-08-01"]);
    expect(d.reduce((s, x) => s + x.posts, 0)).toBe(0);
  });
});

describe("labelMes", () => {
  it("escreve o mês por extenso em português", () => {
    expect(labelMes("2026-07")).toBe("julho/2026");
    expect(labelMes("2026-03")).toBe("março/2026");
  });
});
