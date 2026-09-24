// components/traffic/investimento.ts — regras puras do Controle de Investimento (/traffic).
// Ficam fora da página pra terem teste: pacing que mente e valor mal lido já aconteceram aqui.

/**
 * Lê valor digitado em reais. Aceita "1.500,50", "1500,50", "1500.50", "1,500.50" e "R$ 1.500".
 * O antigo tirava todo ponto e lia "1500.50" como 150050.
 */
export function parseBRL(raw: string): number {
  const s = (raw ?? "").replace(/[^0-9,.\-]/g, "");
  if (!s) return 0;
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  let normal: string;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // Os dois aparecem: o que vem por último é o decimal, o outro é milhar.
    normal = ultimaVirgula > ultimoPonto
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (ultimaVirgula >= 0) {
    normal = s.replace(/,(?=.*,)/g, "").replace(",", ".");
  } else if (ultimoPonto >= 0) {
    const pontos = s.split(".").length - 1;
    const depois = s.length - ultimoPonto - 1;
    // "1.500" (milhar pt-BR) vs "1500.50" (decimal): um ponto seguido de 3 dígitos é milhar.
    normal = pontos > 1 || depois === 3 ? s.replace(/\./g, "") : s;
  } else {
    normal = s;
  }
  const n = parseFloat(normal);
  return Number.isFinite(n) ? n : 0;
}

export type StatusPacing = "ok" | "warning" | "critical" | "slow" | "parado" | "sem_dados";

/**
 * Saúde do ritmo de gasto no mês. `gasto` null = não sabemos (sincronização falhou ou conta sem
 * dado) — nunca vira "no ritmo". Gasto zero depois do dia 2 é conta parada, não ritmo bom.
 */
export function statusPacing(p: {
  verba: number;
  gasto: number | null;
  dia: number;
  diasNoMes: number;
}): StatusPacing {
  const { verba, gasto, dia, diasNoMes } = p;
  if (gasto === null) return "sem_dados";
  if (verba <= 0) return "ok";
  if (gasto === 0) return dia > 2 ? "parado" : "ok";
  const esperado = verba * (dia / diasNoMes);
  const desvio = esperado > 0 ? ((gasto - esperado) / esperado) * 100 : 0;
  const mediaDia = dia > 0 ? gasto / dia : 0;
  const restante = Math.max(0, verba - gasto);
  const fimProjetado = mediaDia > 0 ? dia + Math.floor(restante / mediaDia) : diasNoMes;
  if (desvio > 30 || fimProjetado < 25) return "critical";
  if (desvio > 15) return "warning";
  if (desvio < -15) return "slow";
  return "ok";
}

/** Classes de token por status (sem cor literal; lone-* não aceita /opacidade). */
export const PACING_UI: Record<StatusPacing, { label: string; texto: string; fundo: string; borda: string; barra: string }> = {
  ok:        { label: "No ritmo esperado",               texto: "text-primary",          fundo: "bg-primary/10",     borda: "border-primary/25",          barra: "bg-primary" },
  warning:   { label: "Acima do ritmo — atenção",        texto: "text-lone-warning",     fundo: "bg-lone-warning-bg", borda: "border-lone-warning-border", barra: "bg-lone-warning" },
  critical:  { label: "Verba acabando rápido",           texto: "text-destructive",      fundo: "bg-destructive/10", borda: "border-destructive/25",      barra: "bg-destructive" },
  slow:      { label: "Abaixo do ritmo — campanha travada", texto: "text-lone-info", fundo: "bg-lone-info-bg",   borda: "border-lone-info-border",    barra: "bg-lone-info" },
  parado:    { label: "Parado — sem gasto no mês",       texto: "text-destructive",      fundo: "bg-destructive/10", borda: "border-destructive/25",      barra: "bg-destructive" },
  sem_dados: { label: "Sem dados de gasto",              texto: "text-muted-foreground", fundo: "bg-muted",          borda: "border-border",              barra: "bg-muted-foreground" },
};

/** Dias de `hoje` até `data` (ambos "YYYY-MM-DD"), sem fuso no meio: aritmética de calendário. */
export function diasEntre(hoje: string, data: string): number | null {
  const a = Date.parse(`${hoje}T00:00:00Z`);
  const b = Date.parse(`${data}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Dia da semana (0=dom) de uma data "YYYY-MM-DD" de calendário. */
export function diaDaSemana(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/** Segunda-feira da semana de `ymd` ("YYYY-MM-DD"). Domingo pertence à semana que termina nele. */
export function segundaDaSemana(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" de `n` dias antes de `ymd`. */
export function diasAntes(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
