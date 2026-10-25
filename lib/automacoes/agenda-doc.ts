// lib/automacoes/agenda-doc.ts — gera docs/CRON_SCHEDULE.md a partir do retrato do crontab. Puro.
//
// O documento à mão parou em 13/05/2026 com 9 linhas, enquanto o servidor passou de 80. Agora ele sai
// do retrato (ops/crontab-producao.txt) + o registro da Central de Automações (nome e horário de
// Brasília) + o catálogo de agentes (qual IA cada rotina põe para rodar). O teste
// tests/agenda-cron-doc.test.ts quebra quando o arquivo fica para trás; para regenerar:
//   npx tsx scripts/gerar-agenda-cron.ts

import path from "node:path";
import { AUTOMACOES, FAMILIAS, type Automacao, type Familia } from "./registro";
import { AGENTES, type Agente } from "@/lib/agentes/catalogo";

export interface LinhaCrontab { cron: string; chave: string; metodo?: string; bruta: string }

/** As linhas de job do crontab (comentário e linha vazia ficam de fora). Mesma leitura do teste do registro. */
export function lerLinhasCrontab(texto: string): LinhaCrontab[] {
  return texto
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((bruta) => {
      const t = bruta.split(/\s+/);
      const cron = t.slice(0, 5).join(" ");
      const cmd: string[] = [];
      for (const tok of t.slice(5)) { if (tok.startsWith(">") || tok.startsWith("2>")) break; cmd.push(tok); }
      const base = path.basename(cmd[0] ?? "");
      if (base === "cron-call.sh") return { cron, chave: cmd[1], metodo: cmd[2] ?? "POST", bruta };
      return { cron, chave: [base, ...cmd.slice(1)].join(" "), bruta };
    });
}

const chaveDe = (a: Automacao) => a.comando ?? a.endpoint ?? a.id;

function agentesDaRotina(id: string): string[] {
  return (AGENTES as readonly Agente[])
    .filter((ag) => ag.gatilhos.some((g) => g.tipo === "cron" && g.automacao === id))
    .map((ag) => ag.nome);
}

const celula = (s: string) => s.replace(/\|/g, "\\|");

/** Para ordenar pelo horário de Brasília: o que roda o dia todo vem primeiro, depois pela hora e minuto. */
function chaveHorario(cron: string): number {
  const [min, hora] = cron.split(" ");
  const h = /^\d+/.exec(hora)?.[0];
  const m = Number(/^\d+/.exec(min)?.[0] ?? 0);
  if (h === undefined) return -1;
  return ((Number(h) - 3 + 24) % 24) * 60 + m;
}

export function gerarAgendaCron(crontabTexto: string): string {
  const linhas = lerLinhasCrontab(crontabTexto);
  const porFamilia = new Map<Familia | "Fora do registro", string[]>();
  let comIa = 0;
  const rotinasComIa = new Set<string>();

  const ordenadas = [...linhas].sort((x, y) => chaveHorario(x.cron) - chaveHorario(y.cron));
  for (const l of ordenadas) {
    const a = AUTOMACOES.find((x) => chaveDe(x) === l.chave);
    const familia: Familia | "Fora do registro" = a?.familia ?? "Fora do registro";
    const ias = a ? agentesDaRotina(a.id) : [];
    if (ias.length && a && !rotinasComIa.has(a.id)) { rotinasComIa.add(a.id); comIa++; }
    const chamada = l.metodo ? `\`${l.metodo} /api/system/${l.chave}\`` : `\`${l.chave}\``;
    const nome = a ? `${a.nome}${a.enviaParaCliente ? " · **fala com cliente**" : ""}${a.controlavel ? "" : " · só crontab"}` : "—";
    const linha = `| ${celula(a?.agendaBRT ?? "—")} | \`${l.cron}\` | ${celula(nome)} | ${chamada} | ${celula(ias.join(", ") || "—")} |`;
    porFamilia.set(familia, [...(porFamilia.get(familia) ?? []), linha]);
  }

  const secoes: string[] = [];
  for (const f of [...FAMILIAS, "Fora do registro"] as const) {
    const ls = porFamilia.get(f);
    if (!ls?.length) continue;
    secoes.push([
      `## ${f}`,
      "",
      "| Quando (Brasília) | Crontab (UTC) | Rotina | O que o servidor chama | Agente de IA |",
      "|---|---|---|---|---|",
      ...ls,
      "",
    ].join("\n"));
  }

  const rotinas = new Set(linhas.map((l) => AUTOMACOES.find((x) => chaveDe(x) === l.chave)?.id).filter(Boolean)).size;

  return [
    "# Agenda do servidor (crontab) — Lone OS",
    "",
    "> Gerado a partir de `ops/crontab-producao.txt` (o retrato do crontab do VPS), de `lib/automacoes/registro.ts`",
    "> (nome e horário de Brasília) e de `lib/agentes/catalogo.ts` (o agente de IA que cada rotina põe para rodar).",
    "> Não edite à mão: rode `npx tsx scripts/gerar-agenda-cron.ts`. O teste `tests/agenda-cron-doc.test.ts`",
    "> quebra quando este arquivo fica para trás do retrato.",
    "",
    `**Linhas no crontab:** ${linhas.length} · **Rotinas:** ${rotinas} · **Rotinas que usam IA:** ${comIa}`,
    "",
    "- O servidor roda em UTC puro. Horário de Brasília = UTC − 3h (sem horário de verão).",
    "- Ligar, desligar, pausar, rodar agora e ver o histórico: Central de Automações (`/automations`).",
    "  As marcadas “só crontab” não passam pela Central: param só editando o crontab.",
    "- Os agentes de IA, com o estado de cada um: Central de Agentes (`/agentes`).",
    "- Mexeu no crontab? Atualize o registro no mesmo commit; depois do deploy, regenere o retrato",
    "  (`crontab -l > ops/crontab-producao.txt`) e este arquivo.",
    "",
    ...secoes,
  ].join("\n");
}
