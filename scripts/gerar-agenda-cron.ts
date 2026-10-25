// scripts/gerar-agenda-cron.ts — reescreve docs/CRON_SCHEDULE.md a partir de ops/crontab-producao.txt.
// Uso: npx tsx scripts/gerar-agenda-cron.ts

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gerarAgendaCron } from "../lib/automacoes/agenda-doc";

const raiz = path.resolve(__dirname, "..");
const texto = readFileSync(path.join(raiz, "ops/crontab-producao.txt"), "utf8");
writeFileSync(path.join(raiz, "docs/CRON_SCHEDULE.md"), gerarAgendaCron(texto));
console.log("docs/CRON_SCHEDULE.md atualizado.");
