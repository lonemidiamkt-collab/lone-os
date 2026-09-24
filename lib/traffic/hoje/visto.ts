// lib/traffic/hoje/visto.ts — A REGRA DO "VISTO". Puro: nenhum I/O aqui (quem lê o banco é ./vistos).
//
// POR QUE (Leva 4, 24/09/2026): o mesmo problema de um cliente aparecia em ~5 lugares — a aba Hoje,
// a Defesa Ativa, o alerta de saldo no WhatsApp, o PDF do diagnóstico e o feed do Início. O gestor
// via, resolvia na cabeça, e o sistema continuava cobrando em todos os canais.
//
// A REGRA, numa frase: um alerta marcado como visto fica quieto por 24 horas, a menos que piore.
//   1. Chave = cliente + tipo (conta, saldo, entrega, ...). Uma conta por cliente (trigger de
//      ad_accounts), e todo canal fala por cliente — então a chave não carrega a conta.
//   2. Vale até `until` (padrão: 24h depois de marcado; o máximo aceito é 72h).
//   3. Cai NA HORA se a gravidade atual for maior que a do momento em que foi visto
//      (info → atenção → crítico). Visto em "saldo baixo" não cala "saldo zerado".
//   4. Melhorar não reabre: visto em crítico continua valendo se o alerta cair pra atenção.
//   5. Sem tabela (migração ainda não aplicada) ou com erro de leitura, ninguém está "visto" — os
//      alertas continuam saindo. Na dúvida, avisar.

import type { NivelAlerta, TipoAlerta, VistoInfo } from "./tipos";
import { NIVEIS_ALERTA, TIPOS_ALERTA } from "./tipos";

export const VISTO_HORAS = 24;
export const VISTO_MAX_HORAS = 72;
const HORA_MS = 3_600_000;

export const RANK_NIVEL: Record<NivelAlerta, number> = { info: 1, warning: 2, critical: 3 };

/** Linha de traffic_alert_acks (o que importa dela). */
export interface VistoRow {
  client_id: string;
  tipo: string;
  nivel: string;
  seen_by?: string | null;
  seen_by_name?: string | null;
  seen_at: string;
  until?: string | null;
}

export type MapaVistos = Map<string, VistoRow>;

export function chaveVisto(clientId: string, tipo: TipoAlerta | string): string {
  return `${clientId}|${tipo}`;
}

export function ehTipoAlerta(t: unknown): t is TipoAlerta {
  return typeof t === "string" && (TIPOS_ALERTA as readonly string[]).includes(t);
}

export function ehNivelAlerta(n: unknown): n is NivelAlerta {
  return typeof n === "string" && (NIVEIS_ALERTA as readonly string[]).includes(n);
}

/** Nível gravado fora do esperado conta como o mais baixo (não cala nada acima de info). */
function nivelGravado(n: string): NivelAlerta {
  return ehNivelAlerta(n) ? n : "info";
}

/** Até quando o visto vale, em ms. `until` vence; sem ele, 24h depois de marcado. */
export function fimDoVisto(v: Pick<VistoRow, "seen_at" | "until">): number {
  if (v.until) {
    const t = Date.parse(v.until);
    if (Number.isFinite(t)) return t;
  }
  const visto = Date.parse(v.seen_at);
  return Number.isFinite(visto) ? visto + VISTO_HORAS * HORA_MS : -Infinity;
}

/** O visto ainda cala um alerta que está AGORA nesta gravidade? */
export function vistoVale(v: VistoRow, nivelAtual: NivelAlerta, agora: Date = new Date()): boolean {
  if (agora.getTime() >= fimDoVisto(v)) return false;
  return RANK_NIVEL[nivelAtual] <= RANK_NIVEL[nivelGravado(v.nivel)];
}

/** Prazo de um visto marcado agora. Horas fora de 1..72 viram o padrão (24h). */
export function prazoDoVisto(agora: Date, horas?: number | null): string {
  const h = typeof horas === "number" && Number.isFinite(horas) && horas >= 1 && horas <= VISTO_MAX_HORAS
    ? horas : VISTO_HORAS;
  return new Date(agora.getTime() + h * HORA_MS).toISOString();
}

export function mapaDeVistos(rows: readonly VistoRow[] | null | undefined): MapaVistos {
  const mapa: MapaVistos = new Map();
  for (const r of rows ?? []) {
    if (!r?.client_id || !r.tipo) continue;
    const k = chaveVisto(r.client_id, r.tipo);
    const atual = mapa.get(k);
    // Chave é única no banco; se vier repetida, fica a mais recente.
    if (!atual || Date.parse(r.seen_at) > Date.parse(atual.seen_at)) mapa.set(k, r);
  }
  return mapa;
}

/** O visto que ainda vale para (cliente, tipo) nesta gravidade — ou null. */
export function vistoDe(
  mapa: MapaVistos, clientId: string | null | undefined, tipo: TipoAlerta, nivelAtual: NivelAlerta, agora: Date = new Date(),
): VistoRow | null {
  if (!clientId) return null;
  const v = mapa.get(chaveVisto(clientId, tipo));
  return v && vistoVale(v, nivelAtual, agora) ? v : null;
}

export function estaVisto(
  mapa: MapaVistos, clientId: string | null | undefined, tipo: TipoAlerta, nivelAtual: NivelAlerta, agora: Date = new Date(),
): boolean {
  return vistoDe(mapa, clientId, tipo, nivelAtual, agora) !== null;
}

/** Para a tela: quem, quando, até quando. */
export function infoDoVisto(v: VistoRow): VistoInfo {
  return {
    por: v.seen_by_name || v.seen_by || null,
    em: v.seen_at,
    ate: new Date(fimDoVisto(v)).toISOString(),
    nivel: nivelGravado(v.nivel),
  };
}

// ── Tradução de cada fonte para (tipo, nível) ──────────────────────────────

/** anomaly_alerts.severity → nível. critical = crítico; high = atenção; medium = info. */
export function nivelDaAnomalia(sev: string | null | undefined): NivelAlerta {
  if (sev === "critical") return "critical";
  if (sev === "high") return "warning";
  return "info";
}

/** Problema do Início (lib/inicio/tipos.ts) → tipo do visto. Os demais problemas não são de tráfego. */
export function tipoDoProblemaInicio(problema: string): TipoAlerta | null {
  return problema === "saldo" || problema === "conta" || problema === "entrega" ? problema : null;
}

/**
 * Função do diagnóstico diário (lib/traffic/diagnostico.ts, pelo nome) → tipo e nível. "Merece mais
 * verba" é notícia boa: não é alerta, nunca é calada.
 */
export const DIAGNOSTICO_TIPO: Record<string, { tipo: TipoAlerta; nivel: NivelAlerta } | "dica"> = {
  "Contas sem entrega":       { tipo: "entrega", nivel: "warning" },
  "Anomalias":                { tipo: "entrega", nivel: "warning" },
  "Desperdício":              { tipo: "desperdicio", nivel: "warning" },
  "Acima da meta do cliente": { tipo: "acima_meta", nivel: "warning" },
  "Criativo cansado":         { tipo: "fadiga", nivel: "info" },
  "Verba mal distribuída":    { tipo: "verba", nivel: "info" },
  "Merece mais verba":        "dica",
};

interface DiagnosticoMinimo {
  funcoes: { nome: string; itens: { clientId: string }[] }[];
}

/**
 * O diagnóstico sem os itens já vistos — é o que vai no PDF diário do grupo de tráfego. Não mexe no
 * texto de nada: só tira item. O diagnóstico não guarda a gravidade da anomalia, então cada item
 * conta com o nível do tipo (tabela acima).
 */
export function filtrarDiagnosticoVisto<D extends DiagnosticoMinimo>(d: D, mapa: MapaVistos, agora: Date = new Date()): D {
  if (mapa.size === 0) return d;
  return {
    ...d,
    funcoes: d.funcoes.map((f) => {
      const t = DIAGNOSTICO_TIPO[f.nome];
      if (!t || t === "dica") return f;
      return { ...f, itens: f.itens.filter((i) => !estaVisto(mapa, i.clientId, t.tipo, t.nivel, agora)) };
    }),
  };
}
