// tests/automacoes-registro.test.ts — o registro da Central bate com o crontab de produção.
//
// O que isto protege: job novo no crontab sem entrada na Central (some da tela e do vigia),
// Ensaio apontando para um parâmetro que a rota não lê (o "ensaio" mandaria de verdade), e
// "parado" com prazo menor que o intervalo real do cron (alarme falso todo fim de semana).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { AUTOMACOES, cronsDe, proximaDeVarias, type Automacao } from "@/lib/automacoes/registro";

const RAIZ = path.resolve(__dirname, "..");

// O registro descreve o crontab DEPOIS do deploy em curso; o retrato pode estar um passo atrás.
// Só estas diferenças são aceitas. Depois de regenerar o retrato do servidor, podem sair daqui.
const EM_TRANSICAO: { saindo: string[]; entrando: string[] } = {
  saindo: [],
  entrando: [],
};

interface LinhaCron { cron: string; chave: string; metodo?: string; bruta: string }

function lerCrontab(): LinhaCron[] {
  return readFileSync(path.join(RAIZ, "ops/crontab-producao.txt"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((bruta) => {
      const t = bruta.split(/\s+/);
      const cron = t.slice(0, 5).join(" ");
      const cmd: string[] = [];
      for (const tok of t.slice(5)) { if (tok.startsWith(">") || tok.startsWith("2>")) break; cmd.push(tok); }
      const base = path.basename(cmd[0]);
      if (base === "cron-call.sh") return { cron, chave: cmd[1], metodo: cmd[2] ?? "POST", bruta };
      return { cron, chave: [base, ...cmd.slice(1)].join(" "), bruta };
    });
}

// Linha de script → o comando; linha de cron-call.sh → o endpoint.
const chaveDe = (a: Automacao) => a.comando ?? a.endpoint ?? a.id;
const achar = (chave: string) => AUTOMACOES.find((a) => chaveDe(a) === chave);

describe("registro × crontab de produção", () => {
  const crontab = lerCrontab();

  it("o retrato do crontab foi lido", () => {
    expect(crontab.length).toBeGreaterThan(60);
  });

  it("toda linha do crontab tem entrada no registro, com o mesmo horário e método", () => {
    const faltando: string[] = [];
    for (const l of crontab) {
      const a = achar(l.chave);
      const aceita = EM_TRANSICAO.saindo.includes(l.chave) || EM_TRANSICAO.saindo.includes(`${l.chave}@${l.cron}`);
      if (!a || !cronsDe(a).includes(l.cron)) {
        if (!aceita) faltando.push(l.bruta);
        continue;
      }
      if (l.metodo) expect(a.metodo, l.bruta).toBe(l.metodo);
    }
    expect(faltando).toEqual([]);
  });

  it("toda entrada do registro está no crontab (ou entrando neste deploy)", () => {
    const sobrando: string[] = [];
    for (const a of AUTOMACOES) {
      for (const c of cronsDe(a)) {
        const noCron = crontab.some((l) => l.chave === chaveDe(a) && l.cron === c);
        const aceita = EM_TRANSICAO.entrando.includes(a.id) || EM_TRANSICAO.entrando.includes(`${a.id}@${c}`);
        if (!noCron && !aceita) sobrando.push(`${a.id} @ ${c}`);
      }
    }
    expect(sobrando).toEqual([]);
  });
});

describe("coerência de cada entrada", () => {
  it("ids únicos", () => {
    const ids = AUTOMACOES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo endpoint existe como rota", () => {
    for (const a of AUTOMACOES.filter((x) => x.endpoint)) {
      const rota = path.join(RAIZ, "app/api/system", a.endpoint!.split("?")[0], "route.ts");
      expect(existsSync(rota), `${a.id} → ${rota}`).toBe(true);
    }
  });

  it("Ensaio só onde a rota lê o parâmetro de teste", () => {
    for (const a of AUTOMACOES) {
      expect(a.suportaEnsaio, a.id).toBe(!!a.ensaio);
      if (!a.ensaio) continue;
      expect(a.endpoint, `${a.id} tem ensaio mas não tem endpoint`).toBeTruthy();
      const fonte = readFileSync(path.join(RAIZ, "app/api/system", a.endpoint!.split("?")[0], "route.ts"), "utf8");
      const nome = a.ensaio.split("=")[0];
      expect(fonte.includes(`get("${nome}")`), `${a.id}: a rota não lê ?${nome}`).toBe(true);
    }
  });

  it("envia para cliente ⇔ destino é cliente ou prospect", () => {
    for (const a of AUTOMACOES) {
      expect(a.enviaParaCliente, a.id).toBe(a.destino === "grupos dos clientes" || a.destino === "prospects");
    }
  });

  it("controlável ⇔ passa pelo cron-call.sh; scripts que registram passam o CRON_JOB certo", () => {
    for (const a of AUTOMACOES.filter((x) => !x.controlavel)) {
      expect(a.endpoint, a.id).toBeUndefined();
      expect(a.comando, a.id).toBeTruthy();
    }
    const cm = readFileSync(path.join(RAIZ, "scripts/client-messages.sh"), "utf8");
    expect(cm).toContain('CRON_JOB="client-messages-${KIND}"');
    const rm = readFileSync(path.join(RAIZ, "scripts/relatorio-mensal.sh"), "utf8");
    expect(rm).toContain("CRON_JOB=relatorio-mensal ");
    expect(AUTOMACOES.find((a) => a.id === "relatorio-mensal")?.controlavel).toBe(true);
  });

  it("\"parado\" nunca dispara no intervalo normal do cron (fim de semana incluso), nem demora demais", () => {
    const inicio = new Date("2026-09-01T00:00:00Z").getTime();
    const fim = inicio + 100 * 86400_000;
    for (const a of AUTOMACOES) {
      const crons = cronsDe(a);
      let t = new Date(inicio);
      let anterior = proximaDeVarias(crons, t).getTime();
      let maiorGap = 0;
      while (anterior < fim) {
        t = new Date(anterior);
        const prox = proximaDeVarias(crons, t).getTime();
        maiorGap = Math.max(maiorGap, prox - anterior);
        anterior = prox;
      }
      const limite = a.maxSilencioHoras * 3600_000;
      expect(limite, `${a.id}: maior intervalo ${maiorGap / 3600_000}h`).toBeGreaterThanOrEqual(maiorGap + 3600_000);
      expect(limite, `${a.id}: maior intervalo ${maiorGap / 3600_000}h`).toBeLessThanOrEqual(maiorGap + 48 * 3600_000);
    }
  });
});
