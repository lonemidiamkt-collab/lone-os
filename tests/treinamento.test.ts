import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { IDENTIDADE, PROCESSOS, SISTEMA, CONDUTA } from "@/lib/cs/treinamento";

// O agente não pode saber MENOS que o manual: todo módulo do /sobre tem que ter uma linha no
// treinamento. E os fatos do Playbook que viraram código continuam no texto — para ele explicar.

describe("treinamento base do Loninho", () => {
  it("cobre todos os módulos do manual /sobre", () => {
    const sobre = readFileSync("app/sobre/page.tsx", "utf8");
    const ids = [...sobre.matchAll(/^\s{4}id: "([a-z-]+)",\s*$/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    const nomes: Record<string, RegExp> = {
      dashboard: /Dashboard/, clientes: /Clientes & Onboarding/, trafego: /Tráfego Pago/, social: /Social Media/,
      designer: /\*Designer\*/, tarefas: /Tarefas/, contratos: /Contratos/, comunicados: /Comunicados/, prospeccao: /Prospecção/, ceo: /Área CEO/, sobre: /Sobre o Sistema/,
    };
    for (const id of ids) {
      expect(nomes[id], `módulo "${id}" do manual sem regex no teste`).toBeTruthy();
      expect(SISTEMA, `módulo "${id}" não está no treinamento`).toMatch(nomes[id]);
    }
  });

  it("os fatos do Playbook estão lá, com os números certos", () => {
    expect(PROCESSOS).toMatch(/segunda = post estratégico simples · quarta = vídeo\/Reels/);
    expect(PROCESSOS).toMatch(/entre os dias 22 e 25/);
    expect(PROCESSOS).toMatch(/mínimo 1 dia útil/);
    expect(PROCESSOS).toMatch(/até 15h/);
    expect(PROCESSOS).toMatch(/8h às 18h/);
    expect(PROCESSOS).toMatch(/entre os dias 15 e 22/);
    expect(PROCESSOS).toMatch(/Julio e Roberto/);
    expect(PROCESSOS).toMatch(/tráfego CONTRATADO/);
    expect(PROCESSOS).toMatch(/não existe botão de aprovar no portal/);
  });

  it("conduta: não chuta sobre o sistema e não fala com o cliente por conta própria", () => {
    expect(CONDUTA).toMatch(/NÃO tem visão do código nem do deploy/);
    expect(IDENTIDADE).toMatch(/Araruama/);
    expect(IDENTIDADE).toMatch(/Com o cliente você só fala quando o processo\s+manda/);
    expect(CONDUTA).toMatch(/Regra permanente só com ok de gestor/);
  });
});
