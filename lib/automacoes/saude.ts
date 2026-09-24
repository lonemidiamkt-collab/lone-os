// lib/automacoes/saude.ts — regra de saúde de cada job (puro, sem banco: testável e usado pela
// Central, pelo vigia e pelo registrar).

import { AUTOMACOES, cronsDe, proximaDeVarias, type Automacao } from "./registro";

export type Saude = "ok" | "falhou" | "parado" | "desligado" | "sem-registro";

/** Linha devolvida por public.automation_resumo(). */
export interface ResumoJob {
  job: string;
  ultima_em: string | null;
  ultima_ok: boolean | null;
  ultima_skipped: boolean | null;
  ultima_status: number | null;
  ultima_duracao_ms: number | null;
  ultima_real_ok: boolean | null;
  ultimo_sucesso_em: string | null;
  ok_7d: number | null;
  erro_7d: number | null;
  pulado_7d: number | null;
}

/** Linha de automation_settings. */
export interface ConfigJob {
  job: string;
  enabled: boolean;
  paused_until: string | null;
  updated_by: string | null;
  updated_at: string | null;
  ultimo_alerta_em: string | null;
}

export interface LinhaPainel extends Automacao {
  saude: Saude;
  proxima: string | null;
  ultima: { em: string; ok: boolean | null; pulado: boolean; status: number | null; duracaoMs: number | null } | null;
  ultimoSucessoEm: string | null;
  semana: { ok: number; erro: number; pulado: number };
  config: { ligado: boolean; pausadoAte: string | null; alteradoPor: string | null; alteradoEm: string | null };
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** Pausado = paused_until no futuro. Religar grava paused_until = agora (marca a retomada). */
export function estaPausado(c: Pick<ConfigJob, "paused_until"> | null | undefined, agora: Date): boolean {
  return !!c?.paused_until && ms(c.paused_until) > agora.getTime();
}

/** Pode rodar agora? Sem linha de configuração = ligado. */
export function podeRodar(c: Pick<ConfigJob, "enabled" | "paused_until"> | null | undefined, agora: Date): { rodar: boolean; motivo?: string } {
  if (!c) return { rodar: true };
  if (c.enabled === false) return { rodar: false, motivo: "desligado na Central de Automações" };
  if (estaPausado(c, agora)) {
    const ate = new Date(c.paused_until as string).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    return { rodar: false, motivo: `pausado até ${ate}` };
  }
  return { rodar: true };
}

/**
 * - desligado: alguém desligou/pausou na Central;
 * - sem-registro: roda direto pelo crontab (script) e nunca reportou execução;
 * - falhou: a última execução de verdade (não pulada, não ensaio) deu erro;
 * - parado: nenhum sucesso há mais de maxSilencioHoras, contando a partir do mais recente entre o
 *   último sucesso, a retomada (religar/fim da pausa) e o início do monitoramento — para a Central
 *   recém-instalada não acusar tudo de "parado" na primeira hora.
 */
export function calcularSaude(
  a: Automacao,
  r: ResumoJob | null | undefined,
  c: ConfigJob | null | undefined,
  agora: Date,
  inicioMonitoramento: string | null,
): Saude {
  if (a.controlavel && c && (c.enabled === false || estaPausado(c, agora))) return "desligado";
  if (!r && !a.controlavel) return "sem-registro";
  if (r?.ultima_real_ok === false) return "falhou";
  const refs = [ms(r?.ultimo_sucesso_em), ms(c?.paused_until), ms(inicioMonitoramento)].filter((n) => !Number.isNaN(n));
  const ref = refs.length ? Math.max(...refs) : agora.getTime();
  return agora.getTime() - ref > a.maxSilencioHoras * 3600_000 ? "parado" : "ok";
}

export function montarLinhas(
  resumos: ResumoJob[],
  configs: ConfigJob[],
  agora: Date,
  inicioMonitoramento: string | null,
  registro: Automacao[] = AUTOMACOES,
): LinhaPainel[] {
  const porJob = new Map(resumos.map((r) => [r.job, r]));
  const cfgPorJob = new Map(configs.map((c) => [c.job, c]));
  return registro.map((a) => {
    const r = porJob.get(a.id) ?? null;
    const c = cfgPorJob.get(a.id) ?? null;
    let proxima: string | null = null;
    try { proxima = proximaDeVarias(cronsDe(a), agora).toISOString(); } catch { proxima = null; }
    return {
      ...a,
      saude: calcularSaude(a, r, c, agora, inicioMonitoramento),
      proxima,
      ultima: r?.ultima_em
        ? { em: r.ultima_em, ok: r.ultima_ok, pulado: !!r.ultima_skipped, status: r.ultima_status, duracaoMs: r.ultima_duracao_ms }
        : null,
      ultimoSucessoEm: r?.ultimo_sucesso_em ?? null,
      semana: { ok: r?.ok_7d ?? 0, erro: r?.erro_7d ?? 0, pulado: r?.pulado_7d ?? 0 },
      config: {
        ligado: !c || (c.enabled !== false && !estaPausado(c, agora)),
        pausadoAte: c && estaPausado(c, agora) ? c.paused_until : null,
        alteradoPor: c?.updated_by ?? null,
        alteradoEm: c?.updated_by ? c.updated_at : null,
      },
    };
  });
}

/**
 * O `ok` de primeiro nível de um corpo JSON — mesmo truncado (o cron-call.sh manda só o começo).
 * `{"ok":true,"detalhe":[{"ok":false}]}` é sucesso: só a chave do topo conta.
 */
export function okNoTopo(texto: string): boolean | null {
  try {
    const d = JSON.parse(texto);
    return d && typeof d === "object" && !Array.isArray(d) && typeof d.ok === "boolean" ? d.ok : null;
  } catch { /* truncado: segue na varredura */ }
  let prof = 0;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === "{" || ch === "[") { prof++; continue; }
    if (ch === "}" || ch === "]") { prof--; continue; }
    if (ch !== '"') continue;
    let j = i + 1, s = "";
    while (j < texto.length && texto[j] !== '"') {
      if (texto[j] === "\\") { s += texto[j + 1] ?? ""; j += 2; } else { s += texto[j]; j++; }
    }
    if (j >= texto.length) return null;
    if (prof === 1 && s === "ok") {
      const resto = texto.slice(j + 1).replace(/^\s*/, "");
      if (resto.startsWith(":")) {
        const v = resto.slice(1).replace(/^\s*/, "");
        if (v.startsWith("true")) return true;
        if (v.startsWith("false")) return false;
        return null;
      }
    }
    i = j;
  }
  return null;
}

/** Sucesso = HTTP 2xx e o corpo não diz {"ok": false}. */
export function okDaResposta(status: number | null | undefined, corpo: string | null | undefined, corpoOk?: boolean | null): boolean {
  if (!status || status < 200 || status >= 300) return false;
  if (typeof corpoOk === "boolean") return corpoOk;
  return okNoTopo(corpo ?? "") !== false;
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** A mensagem do vigia no grupo administrativo. `resumos` = resumo da última falha, por job. */
export function textoVigia(linhas: LinhaPainel[], resumos: Record<string, string | null> = {}, urlCentral?: string): string {
  const blocos = linhas.map((l) => {
    if (l.saude === "falhou") {
      const partes = [l.ultima ? `última: ${quando(l.ultima.em)}` : null, l.ultima?.status ? `HTTP ${l.ultima.status}` : null].filter(Boolean);
      const r = (resumos[l.id] ?? "").replace(/\s+/g, " ").trim().slice(0, 110);
      return `🔴 *${l.nome}* — falhou\n${partes.join(" · ")}${r ? `\n_${r}_` : ""}`;
    }
    const desde = l.ultimoSucessoEm ? `sem sucesso desde ${quando(l.ultimoSucessoEm)}` : "nenhuma execução com sucesso registrada";
    return `🟡 *${l.nome}* — parado\n${desde} (agenda: ${l.agendaBRT})`;
  });
  const titulo = linhas.length === 1 ? "⚠️ *Uma automação com problema*" : `⚠️ *${linhas.length} automações com problema*`;
  return [titulo, "", blocos.join("\n\n"), ...(urlCentral ? ["", `Central: ${urlCentral}`] : [])].join("\n");
}
