// Períodos de planejamento. A quinzena entrou a pedido do Roberto — entre "semana que vem" e
// "mês inteiro" faltava o meio-termo. E a detecção precisa acertar o modo: no dia 20 o time
// pediu MENSAL quatro vezes e recebeu SEMANAL nas sete gerações.
import { describe, it, expect } from "vitest";

// Mesma regra do inbound.
function modoCalendario(text: string): "semana" | "quinzena" | "mes" {
  const t = text.toLowerCase();
  if (/\b(quinzen[aal]|quinzenal|15\s*dias|duas semanas|2 semanas)\b/.test(t)) return "quinzena";
  return /\b(m[êe]s|mensal|do m[êe]s|pr[óo]ximo m[êe]s)\b/.test(t) ? "mes" : "semana";
}

describe("modoCalendario", () => {
  it("MENSAL — o pedido que falhou 4 vezes no dia 20", () => {
    expect(modoCalendario("lone, monta o calendario mensal do max contabilidade")).toBe("mes");
    expect(modoCalendario("Lone, monta o calendário mensal do Max")).toBe("mes");
    expect(modoCalendario("loninho monta o calendario do mes do imperio")).toBe("mes");
  });

  it("QUINZENAL — o modo novo", () => {
    for (const t of ["loninho faz o planejamento quinzenal do portuga",
                     "monta a quinzena do imperio",
                     "faz o planejamento de 15 dias",
                     "monta as duas semanas do CIIL"]) {
      expect(modoCalendario(t)).toBe("quinzena");
    }
  });

  it("quinzena ganha de mês quando os dois aparecem", () => {
    // "planejamento quinzenal do mês que vem" é quinzena, não mês.
    expect(modoCalendario("faz o planejamento quinzenal do mes que vem")).toBe("quinzena");
  });

  it("sem indicação → semana (o padrão do playbook)", () => {
    expect(modoCalendario("loninho faz planejamento da semana para o portuga pneus")).toBe("semana");
    expect(modoCalendario("lone, manda o calendario do max")).toBe("semana");
  });
});
