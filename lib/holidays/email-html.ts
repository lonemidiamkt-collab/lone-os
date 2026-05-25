/**
 * Renderiza o calendário do mês como HTML inline pra ser embutido em emails.
 *
 * Uso primário: anexar ao fim do content_html dos broadcasts em vez de PDF.
 * Motivo: @react-pdf/renderer 4.5 não funciona server-side em Next.js 15
 * (React error #31 mesmo em PDFs triviais).
 *
 * Toda a estilização é inline (compatível com Gmail, Outlook, Apple Mail).
 * Tabelas + inline CSS = padrão ouro de email HTML.
 */

import { getAllObservances, observancesForLocation, type Holiday } from "./brasil-api";
import { getDescriptionFor } from "./descriptions";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTHS_SHORT_UPPER = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// Paleta — branco/cinza pra máxima compatibilidade de email (sem dark mode)
const C = {
  bg: "#ffffff",
  bgAlt: "#f8fafc",
  text: "#0f172a",
  textMuted: "#64748b",
  textLight: "#94a3b8",
  border: "#e2e8f0",
  brand: "#0d4af5",
  national: "#dc2626",
  nationalBg: "#fef2f2",
  estadual: "#ea580c",
  estadualBg: "#fff7ed",
  municipal: "#65a30d",
  municipalBg: "#f7fee7",
  comemorativa: "#0d4af5",
  comemorativaBg: "#eff6ff",
};

interface BuildOptions {
  year: number;
  month: number;          // 1-12
  region?: string;
  /** Filtra profissões pra esses nichos. */
  nichos?: string[];
  uf?: string;
  city?: string;
}

type StyleKey = "national" | "estadual" | "municipal" | "comemorativa";
function styleKeyFor(category: Holiday["category"]): StyleKey {
  if (category === "national") return "national";
  if (category === "estadual") return "estadual";
  if (category === "municipal") return "municipal";
  return "comemorativa";
}
function colorPair(key: StyleKey): { fg: string; bg: string } {
  if (key === "national") return { fg: C.national, bg: C.nationalBg };
  if (key === "estadual") return { fg: C.estadual, bg: C.estadualBg };
  if (key === "municipal") return { fg: C.municipal, bg: C.municipalBg };
  return { fg: C.comemorativa, bg: C.comemorativaBg };
}
function pillLabelFor(category: Holiday["category"]): string {
  switch (category) {
    case "national": return "Feriado nacional";
    case "estadual": return "Feriado estadual";
    case "municipal": return "Feriado municipal";
    case "awareness_month": return "Mês de conscientização";
    case "comercial": return "Data comercial";
    case "cultural": return "Data cultural";
    case "profissao": return "Dia profissional";
    default: return "Data comemorativa";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[m]!);
}

function filterByNichosLocal(observances: Holiday[], nichos: string[]): Holiday[] {
  return observances.filter((o) => {
    if (o.category !== "profissao") return true;
    if (!o.nichos || o.nichos.length === 0) return true;
    return o.nichos.some((n) => nichos.includes(n));
  });
}

function buildMonthCells(year: number, month: number): Array<number | null> {
  const monthIdx0 = month - 1;
  const firstDayWeekday = new Date(Date.UTC(year, monthIdx0, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDayWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Gera HTML inline-style do calendário do mês.
 * Retorna string vazia se não houver observances no período.
 */
export async function renderMonthCalendarHtml(opts: BuildOptions): Promise<string> {
  const all = await getAllObservances(opts.year);
  const prefix = `${opts.year}-${String(opts.month).padStart(2, "0")}-`;
  let inMonth = all.filter((o) => o.date.startsWith(prefix));

  if (opts.uf || opts.city) {
    inMonth = observancesForLocation(inMonth, { uf: opts.uf, city: opts.city });
  } else {
    inMonth = inMonth.filter((o) => o.category !== "estadual" && o.category !== "municipal");
  }
  if (opts.nichos && opts.nichos.length > 0) {
    inMonth = filterByNichosLocal(inMonth, opts.nichos);
  }

  if (inMonth.length === 0) return "";

  const monthLabel = MONTHS[opts.month - 1];
  const region = opts.region ?? "BRASIL";
  const awareness = inMonth.filter((o) => o.monthLong);
  const dailyDates = inMonth.filter((o) => !o.monthLong).sort((a, b) => a.date.localeCompare(b.date));

  // Mapa dia → categoria predominante
  const PRIO: Record<StyleKey, number> = { national: 4, estadual: 3, municipal: 2, comemorativa: 1 };
  const dayCategory: Record<number, StyleKey> = {};
  for (const o of dailyDates) {
    const day = parseInt(o.date.slice(8, 10), 10);
    if (!Number.isFinite(day)) continue;
    const key = styleKeyFor(o.category);
    if (!dayCategory[day] || PRIO[key] > PRIO[dayCategory[day]]) dayCategory[day] = key;
  }

  const cells = buildMonthCells(opts.year, opts.month);
  const weekRows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weekRows.push(cells.slice(i, i + 7));

  // ── Calendário (tabela 7 cols) ──────────────────────────────
  const calendarHtml = `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:2px;margin:0 0 16px;">
  <tr>
    ${WEEKDAYS.map((w) => `<td style="background:${C.brand};color:#fff;font-size:11px;font-weight:600;padding:8px 0;text-align:center;letter-spacing:0.5px;border-radius:4px;">${w}</td>`).join("")}
  </tr>
  ${weekRows.map((week) => `
  <tr>
    ${week.map((day) => {
      if (day === null) return `<td style="height:54px;background:transparent;"></td>`;
      const cat = dayCategory[day];
      const colors = cat ? colorPair(cat) : null;
      const bg = colors ? colors.bg : C.bgAlt;
      const fg = colors ? colors.fg : C.textMuted;
      const fontWeight = colors ? "700" : "400";
      const borderColor = colors ? colors.fg : "transparent";
      return `<td align="center" valign="middle" style="height:54px;background:${bg};color:${fg};font-size:13px;font-weight:${fontWeight};border:1px solid ${borderColor};border-radius:4px;">${day}</td>`;
    }).join("")}
  </tr>`).join("")}
</table>`;

  // ── Legenda ──────────────────────────────────────────────────
  const legendItems: string[] = [];
  if (Object.values(dayCategory).includes("national")) legendItems.push(`<span style="display:inline-block;width:10px;height:10px;background:${C.national};border-radius:50%;margin-right:5px;vertical-align:middle;"></span>Feriado nacional`);
  if (Object.values(dayCategory).includes("estadual")) legendItems.push(`<span style="display:inline-block;width:10px;height:10px;background:${C.estadual};border-radius:50%;margin-right:5px;vertical-align:middle;"></span>Feriado estadual`);
  if (Object.values(dayCategory).includes("municipal")) legendItems.push(`<span style="display:inline-block;width:10px;height:10px;background:${C.municipal};border-radius:50%;margin-right:5px;vertical-align:middle;"></span>Feriado municipal`);
  if (Object.values(dayCategory).includes("comemorativa")) legendItems.push(`<span style="display:inline-block;width:10px;height:10px;background:${C.comemorativa};border-radius:50%;margin-right:5px;vertical-align:middle;"></span>Data comemorativa`);
  const legendHtml = legendItems.length > 0 ? `<p style="font-size:11px;color:${C.textMuted};margin:0 0 20px;">${legendItems.join('  &nbsp;&nbsp;  ')}</p>` : "";

  // ── Awareness banners ────────────────────────────────────────
  const awarenessHtml = awareness.length === 0 ? "" : `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
  ${awareness.map((a) => `
  <tr>
    <td style="border-left:3px solid #ec4899;background:#fdf2f8;padding:10px 14px;font-size:11px;color:#831843;">
      <strong style="display:block;font-size:9px;color:#ec4899;letter-spacing:1px;margin-bottom:2px;">MÊS DE CONSCIENTIZAÇÃO</strong>
      ${escapeHtml(a.name)}
    </td>
  </tr>`).join("")}
</table>`;

  // ── Cards detalhados ─────────────────────────────────────────
  const cardsHtml = [...awareness, ...dailyDates].map((o) => {
    const styleKey = styleKeyFor(o.category);
    const { fg, bg } = colorPair(styleKey);
    const day = o.monthLong ? null : parseInt(o.date.slice(8, 10), 10);
    const monthAbbr = MONTHS_SHORT_UPPER[opts.month - 1];
    const weekdayIdx = o.monthLong ? null : new Date(o.date + "T12:00:00Z").getUTCDay();
    const weekday = weekdayIdx !== null ? WEEKDAYS_FULL[weekdayIdx] : "Mês inteiro";
    const description = getDescriptionFor(o.name, o.category, o.nichos);
    const pillLabel = pillLabelFor(o.category);
    const locationSuffix = o.category === "municipal" && o.cities && o.cities.length > 0
      ? ` · ${o.cities.join(", ")}`
      : o.category === "estadual" && o.uf
      ? ` · ${o.uf}`
      : "";

    return `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;">
  <tr>
    <td width="60" valign="top" style="background:${fg};color:#fff;text-align:center;padding:8px 0;border-radius:4px 0 0 4px;">
      ${day !== null ? `<div style="font-size:22px;font-weight:700;line-height:1;">${String(day).padStart(2, "0")}</div><div style="font-size:9px;letter-spacing:1px;margin-top:4px;">${monthAbbr}</div>` : `<div style="font-size:11px;letter-spacing:1px;padding:14px 0;">${monthAbbr}</div>`}
    </td>
    <td valign="top" style="background:${C.bg};border-left:0;border-top:1px solid ${C.border};border-right:1px solid ${C.border};border-bottom:1px solid ${C.border};border-radius:0 4px 4px 0;padding:10px 14px;">
      <div style="display:inline-block;background:${fg};color:#fff;font-size:9px;font-weight:600;letter-spacing:1px;padding:2px 8px;border-radius:10px;margin-bottom:4px;">${pillLabel.toUpperCase()}</div>
      <div style="color:${C.text};font-size:14px;font-weight:700;margin:2px 0;">${escapeHtml(o.name)}${escapeHtml(locationSuffix)}</div>
      <div style="color:${C.textMuted};font-size:11px;font-style:italic;margin-bottom:4px;">${weekday}</div>
      <div style="color:${C.textMuted};font-size:11px;line-height:1.5;">${escapeHtml(description)}</div>
    </td>
  </tr>
</table>`;
  }).join("");

  // ── Container final ──────────────────────────────────────────
  return `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:32px 0 0;border-top:2px solid ${C.brand};padding-top:24px;">
  <tr>
    <td>
      <h2 style="color:${C.text};font-size:18px;font-weight:700;margin:0 0 4px;letter-spacing:0.5px;">FERIADOS E DATAS COMEMORATIVAS</h2>
      <p style="color:${C.brand};font-size:12px;font-weight:600;letter-spacing:1px;margin:0 0 16px;">${escapeHtml(monthLabel.toUpperCase())} ${opts.year} · ${escapeHtml(region)}</p>
      ${calendarHtml}
      ${legendHtml}
      ${awarenessHtml}
      ${cardsHtml}
      <p style="color:${C.textLight};font-size:10px;text-align:center;margin:24px 0 0;">Gerado por Lone Mídia · Calendário interno do mês</p>
    </td>
  </tr>
</table>`;
}
