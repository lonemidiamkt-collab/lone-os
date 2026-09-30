// lib/automacoes/saude.ts — regra de saúde de cada job (puro, sem banco: testável e usado pela
// Central, pelo vigia e pelo registrar).

import { AUTOMACOES, cronsDe, proximaDeVarias, type Automacao } from "./registro";
import { causaDoErro, erroDoResumo, type CausaConhecida, type ChaveCausa } from "@/lib/ia/causa-erro";
import type { IaFora } from "@/lib/ia/saude-ia";

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

/** A causa conhecida da última falha de um job, se houver. Job parado não tem erro pra ler. */
function causaDoJob(l: LinhaPainel, resumos: Record<string, string | null>): CausaConhecida | null {
  return l.saude === "falhou" ? causaDoErro(resumos[l.id]) : null;
}

/** Bloco de UMA causa conhecida: o que é, o que fazer, e tudo o que parou por ela. */
function blocoDaCausa(causa: CausaConhecida, linhas: LinhaPainel[], ia: IaFora | null): string {
  const cabeca = ia ? `🔴 *${causa.titulo}* — desde ${quando(ia.desde)}` : `🔴 *${causa.titulo}*`;
  const parou: string[] = [];
  // As frentes que falharam ao vivo (o agente, a revisão de arte…) vêm primeiro: são as que o
  // cliente sente. As rotinas agendadas entram numa linha só — são consequência da mesma causa.
  for (const f of (ia?.porFrente ?? []).slice(0, 5)) parou.push(`• ${f.rotulo} — ${f.falhas} ${f.falhas === 1 ? "falha" : "falhas"}`);
  if (linhas.length) {
    const nomes = linhas.map((l) => l.nome).join(", ");
    parou.push(linhas.length === 1 ? `• rotina: ${nomes}` : `• ${linhas.length} rotinas: ${nomes}`);
  }
  return [cabeca, causa.explicacao, `👉 ${causa.acao}`, ...(parou.length ? ["", "O que parou:", ...parou] : [])].join("\n");
}

/** Bloco de um job com problema que não tem causa conhecida — mostra o erro, não o JSON. */
function blocoSolto(l: LinhaPainel, resumos: Record<string, string | null>): string {
  if (l.saude === "falhou") {
    const partes = [l.ultima ? `última: ${quando(l.ultima.em)}` : null, l.ultima?.status ? `HTTP ${l.ultima.status}` : null].filter(Boolean);
    // Antes: os primeiros 110 caracteres do corpo, que eram contadores ("ok":false,"pendentes":566…)
    // e cortavam o erro no meio. Agora a mensagem de erro, quando o corpo tem uma.
    const bruto = (resumos[l.id] ?? "").replace(/\s+/g, " ").trim();
    const r = (erroDoResumo(bruto) ?? bruto).slice(0, 180);
    return `🔴 *${l.nome}* — falhou\n${partes.join(" · ")}${r ? `\n_${r}_` : ""}`;
  }
  const desde = l.ultimoSucessoEm ? `sem sucesso desde ${quando(l.ultimoSucessoEm)}` : "nenhuma execução com sucesso registrada";
  return `🟡 *${l.nome}* — parado\n${desde} (agenda: ${l.agendaBRT})`;
}

/**
 * A mensagem do vigia no grupo administrativo. `resumos` = resumo da última falha, por job.
 *
 * Jobs que falharam pela MESMA causa conhecida viram um bloco só, com a ação — seis "falhou" com
 * JSON cortado eram, em 30/09, um saldo zerado na OpenAI. `ia` = a IA fora do ar (llm_calls), que
 * entra no bloco da causa dela mesmo que nenhuma rotina tenha falhado ainda.
 */
export function textoVigia(
  linhas: LinhaPainel[],
  resumos: Record<string, string | null> = {},
  urlCentral?: string,
  ia: IaFora | null = null,
): string {
  const porCausa = new Map<ChaveCausa, { causa: CausaConhecida; linhas: LinhaPainel[] }>();
  if (ia) porCausa.set(ia.causa.chave, { causa: ia.causa, linhas: [] });
  const soltas: LinhaPainel[] = [];
  for (const l of linhas) {
    const c = causaDoJob(l, resumos);
    if (!c) { soltas.push(l); continue; }
    const g = porCausa.get(c.chave) ?? { causa: c, linhas: [] };
    g.linhas.push(l);
    porCausa.set(c.chave, g);
  }

  const blocos = [
    ...[...porCausa.values()].map((g) => blocoDaCausa(g.causa, g.linhas, ia?.causa.chave === g.causa.chave ? ia : null)),
    ...soltas.map((l) => blocoSolto(l, resumos)),
  ];
  // Um bloco de causa já tem título próprio; o genérico só aparece quando há mais de um assunto.
  const titulo = blocos.length > 1
    ? `⚠️ *${blocos.length} problemas nas automações*`
    : soltas.length === 1 ? "⚠️ *Uma automação com problema*" : null;
  return [...(titulo ? [titulo, ""] : []), blocos.join("\n\n"), ...(urlCentral ? ["", `Central: ${urlCentral}`] : [])].join("\n");
}

/**
 * O que o vigia manda agora e o que marca como avisado. Cada job (e cada causa de IA fora, com a
 * chave `ia:<causa>`) é lembrado no máximo uma vez a cada `repetirAposMs`.
 *
 * Um grupo de causa conhecida sai inteiro quando QUALQUER parte dele venceu o prazo — senão o
 * grupo chegaria picado: 4 rotinas hoje, as outras 2 amanhã, cada vez parecendo um problema novo.
 */
export function avisoDoVigia(p: {
  comProblema: LinhaPainel[];
  resumos: Record<string, string | null>;
  ultimoAlerta: ReadonlyMap<string, string | null>;
  ia: IaFora | null;
  /** Última chamada de IA que deu certo (llm_calls). Ver a regra de "a causa já passou" abaixo. */
  ultimoOkIa?: string | null;
  agora: Date;
  repetirAposMs: number;
  urlCentral?: string;
}): { texto: string | null; marcar: string[] } {
  const vencido = (chave: string) => {
    const t = p.ultimoAlerta.get(chave);
    return !t || p.agora.getTime() - new Date(t).getTime() >= p.repetirAposMs;
  };

  // A CAUSA JÁ PASSOU (30/09, 12h05): o saldo foi recarregado às 11h49 e, 16 min depois, o vigia
  // mandou "OpenAI sem crédito — recarregar" — o último erro das rotinas ainda era o da manhã.
  // Rotina que falhou por causa da OpenAI ANTES de a IA voltar a responder não é problema de agora:
  // volta sozinha no próximo horário. Não entra e não é marcada — se falhar de novo, avisa.
  const okIa = p.ultimoOkIa ? new Date(p.ultimoOkIa).getTime() : NaN;
  const jaPassou = (l: LinhaPainel, c: CausaConhecida) =>
    c.chave.startsWith("openai-") && !Number.isNaN(okIa) && !!l.ultima && okIa > new Date(l.ultima.em).getTime();

  const porCausa = new Map<ChaveCausa, LinhaPainel[]>();
  const soltas: LinhaPainel[] = [];
  for (const l of p.comProblema) {
    const c = causaDoJob(l, p.resumos);
    if (c && jaPassou(l, c)) continue;
    if (c) porCausa.set(c.chave, [...(porCausa.get(c.chave) ?? []), l]);
    else soltas.push(l);
  }

  const incluir: LinhaPainel[] = [];
  const marcar: string[] = [];
  let ia: IaFora | null = null;
  const chaves = new Set<ChaveCausa>([...porCausa.keys(), ...(p.ia ? [p.ia.causa.chave] : [])]);
  for (const chave of chaves) {
    const linhas = porCausa.get(chave) ?? [];
    const iaDaqui = p.ia?.causa.chave === chave ? p.ia : null;
    if (!linhas.some((l) => vencido(l.id)) && !(iaDaqui && vencido(`ia:${chave}`))) continue;
    incluir.push(...linhas);
    marcar.push(...linhas.map((l) => l.id));
    if (iaDaqui) { ia = iaDaqui; marcar.push(`ia:${chave}`); }
  }
  for (const l of soltas) if (vencido(l.id)) { incluir.push(l); marcar.push(l.id); }

  if (!incluir.length && !ia) return { texto: null, marcar: [] };
  return { texto: textoVigia(incluir, p.resumos, p.urlCentral, ia), marcar };
}
