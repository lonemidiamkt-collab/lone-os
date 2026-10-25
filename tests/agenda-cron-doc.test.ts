// tests/agenda-cron-doc.test.ts — docs/CRON_SCHEDULE.md acompanha o retrato do crontab.
//
// O documento à mão parou em 13/05/2026 com 9 linhas; o servidor passou de 80. Agora ele é gerado
// (lib/automacoes/agenda-doc.ts) e este teste quebra quando fica para trás. Para atualizar:
//   npx tsx scripts/gerar-agenda-cron.ts

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gerarAgendaCron, lerLinhasCrontab } from "@/lib/automacoes/agenda-doc";

const RAIZ = path.resolve(__dirname, "..");
const crontab = readFileSync(path.join(RAIZ, "ops/crontab-producao.txt"), "utf8");

describe("agenda do servidor", () => {
  it("docs/CRON_SCHEDULE.md é o gerado a partir do retrato (rode scripts/gerar-agenda-cron.ts)", () => {
    expect(readFileSync(path.join(RAIZ, "docs/CRON_SCHEDULE.md"), "utf8")).toBe(gerarAgendaCron(crontab));
  });

  it("toda linha do crontab aparece, nenhuma fora do registro", () => {
    const doc = gerarAgendaCron(crontab);
    const linhas = lerLinhasCrontab(crontab);
    expect(linhas.length).toBeGreaterThan(60);
    for (const l of linhas) expect(doc, l.bruta).toContain(`\`${l.cron}\``);
    expect(doc).not.toContain("## Fora do registro");
  });

  it("marca as rotinas que põem um agente de IA para rodar", () => {
    const doc = gerarAgendaCron(crontab);
    expect(doc).toMatch(/cs-releitura` \| Releitura do ciclo \|/);
    expect(doc).toMatch(/Rotinas que usam IA:\*\* \d+/);
  });
});
