// lib/portal/formatos.ts — números, datas e contas pequenas das telas do portal do cliente.
// Puro (sem React): testado em tests/portal-formatos.test.ts. Tudo em pt-BR, com o nome da coisa
// junto do número — o tooltip antigo mostrava a chave crua ("messages : 29").

export type MetricaDiaria = "messages" | "clicks" | "spend" | "reach";

// ── Números ──────────────────────────────────────────────────────────────────

export const formatarNumero = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** "950", "1,2 mil", "3,4 mi" — pra eixo e cartão pequeno. */
export const formatarCompacto = (n: number) =>
  n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const formatarBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 850", "R$ 1,2 mil" — eixo do gráfico de investimento. */
export function formatarBRLCompacto(n: number): string {
  if (Math.abs(n) < 1000) return `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
  return `R$ ${formatarCompacto(n)}`;
}

/** "4,2%" (uma casa abaixo de 10%, nenhuma acima). */
export function formatarPct(pct: number): string {
  const casas = Math.abs(pct) < 10 && pct !== 0 ? 1 : 0;
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

const plural = (n: number, um: string, varios: string) => (Math.round(n) === 1 ? um : varios);

export const ROTULO_METRICA: Record<MetricaDiaria, string> = {
  messages: "Mensagens",
  clicks: "Cliques",
  spend: "Investido",
  reach: "Alcance",
};

/** Valor com a unidade por extenso: "29 conversas", "1 clique", "R$ 120,50", "1.234 pessoas". */
export function formatarMetrica(metrica: MetricaDiaria, n: number): string {
  switch (metrica) {
    case "messages": return `${formatarNumero(n)} ${plural(n, "conversa", "conversas")}`;
    case "clicks":   return `${formatarNumero(n)} ${plural(n, "clique", "cliques")}`;
    case "spend":    return formatarBRL(n);
    case "reach":    return `${formatarNumero(n)} ${plural(n, "pessoa", "pessoas")}`;
  }
}

/** Rótulo do eixo Y: compacto, com R$ só no investimento. */
export function formatarEixo(metrica: MetricaDiaria, n: number): string {
  return metrica === "spend" ? formatarBRLCompacto(n) : formatarCompacto(n);
}

// ── Datas (YYYY-MM-DD lidas ao meio-dia UTC: o mesmo dia no servidor e no celular) ──

const meioDia = (ymd: string) => new Date(`${ymd.slice(0, 10)}T12:00:00Z`);

/** "22 set" */
export function rotuloDia(ymd: string): string {
  return meioDia(ymd)
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" })
    .replace(/\./g, "").replace(/ de /g, " ");
}

/** "seg, 22 set" */
export function rotuloDiaLongo(ymd: string): string {
  const semana = meioDia(ymd).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(/\./g, "");
  return `${semana}, ${rotuloDia(ymd)}`;
}

/** Hoje em São Paulo, "YYYY-MM-DD". */
export function hojeEmSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Primeiro dia de uma janela de `dias` dias terminando hoje (inclusive). */
export function inicioDaJanela(dias: number, agora: Date = new Date()): string {
  const d = meioDia(hojeEmSP(agora));
  d.setUTCDate(d.getUTCDate() - (dias - 1));
  return d.toISOString().slice(0, 10);
}

// ── Série diária ─────────────────────────────────────────────────────────────

/** Dia de maior valor. null se não houver nenhum valor acima de zero. */
export function melhorDia(dias: readonly string[], valores: readonly (number | null)[]): { dia: string; valor: number } | null {
  let melhor: { dia: string; valor: number } | null = null;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (v != null && v > 0 && dias[i] && (!melhor || v > melhor.valor)) melhor = { dia: dias[i], valor: v };
  }
  return melhor;
}

// ── Instagram ────────────────────────────────────────────────────────────────

interface PostEngajamento { curtidas: number | null; comentarios: number | null; alcance: number | null }

/**
 * Taxa de engajamento do período. "Engajamento 22" ao lado de "Curtidas 22" não dizia nada (era a
 * soma curtidas + comentários). Agora é taxa:
 *  - base "alcance": interações dos posts ÷ pessoas alcançadas por esses mesmos posts;
 *  - base "seguidores" (perfil sem alcance por post, ex. leitura pública): média de interações por
 *    post ÷ seguidores — a conta usual de mercado.
 * null quando não há post no período ou base pra dividir.
 */
export function taxaEngajamento(
  posts: readonly PostEngajamento[],
  seguidores: number | null | undefined,
): { pct: number; base: "alcance" | "seguidores" } | null {
  if (!posts.length) return null;
  const interacoes = (p: PostEngajamento) => (p.curtidas ?? 0) + (p.comentarios ?? 0);

  const comAlcance = posts.filter((p) => (p.alcance ?? 0) > 0);
  if (comAlcance.length) {
    const alcance = comAlcance.reduce((s, p) => s + (p.alcance ?? 0), 0);
    return { pct: (comAlcance.reduce((s, p) => s + interacoes(p), 0) / alcance) * 100, base: "alcance" };
  }
  if (seguidores && seguidores > 0) {
    const media = posts.reduce((s, p) => s + interacoes(p), 0) / posts.length;
    return { pct: (media / seguidores) * 100, base: "seguidores" };
  }
  return null;
}

/** Faixas etárias em ordem de idade ("13-17", "18-24" … "65+"), não de tamanho. */
export function ordenarFaixas<T extends { faixa: string }>(faixas: readonly T[]): T[] {
  const inicio = (f: string) => parseInt(f, 10) || 0;
  return [...faixas].sort((a, b) => inicio(a.faixa) - inicio(b.faixa));
}

// ── Janela de dias (conteúdo entregue) ───────────────────────────────────────

/** Dia (YYYY-MM-DD) em São Paulo de uma data pura ou de um timestamp ISO. */
export function diaEmSP(data: string): string {
  if (data.length <= 10) return data;
  const t = Date.parse(data);
  return Number.isFinite(t) ? hojeEmSP(new Date(t)) : data.slice(0, 10);
}

/** A data cai nos últimos `dias` dias (hoje incluso)? Data futura (agendada) não conta como entregue. */
export function dentroDaJanela(data: string | null | undefined, dias: number, agora: Date = new Date()): boolean {
  if (!data) return false;
  const dia = diaEmSP(data);
  return dia >= inicioDaJanela(dias, agora) && dia <= hojeEmSP(agora);
}
