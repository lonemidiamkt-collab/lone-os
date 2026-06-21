/**
 * HTML "premium" do calendário de feriados/datas do mês, pensado pra virar PDF
 * via chromium (browserless) e ser enviado ao cliente. Replica o layout do antigo
 * gerador @react-pdf (capa centralizada + calendário grande + página de cards),
 * que quebra em produção (React #31). Tema ESCURO.
 *
 * Retorna um documento HTML completo (não um fragmento). String vazia se o mês
 * não tiver nenhuma observance.
 */

import { getAllObservances, type Holiday } from "./brasil-api";
import { getDescriptionFor } from "./descriptions";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEKDAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// Paleta escura premium
const P = {
  page: "#0a0a0f",
  panel: "#15151f",
  panelAlt: "#0f0f17",
  border: "#26263a",
  text: "#f5f5f7",
  muted: "#9a9aa8",
  faint: "#6b6b7a",
  blue: "#2f6bff",
  blueFill: "#1d2c5c",
  blueBorder: "#3b6cff",
  blueText: "#bcd0ff",
  red: "#e24b4a",
  redFill: "#3a1a1a",
  redBorder: "#e24b4a",
  redText: "#f7a8a7",
};

export interface ClientCalendarOpts {
  year: number;
  month: number; // 1-12
  region?: string;
}

function isNational(c: Holiday["category"]): boolean {
  return c === "national" || c === "estadual" || c === "municipal";
}
function catLabel(c: Holiday["category"]): string {
  switch (c) {
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
function monthCells(year: number, month: number): Array<number | null> {
  const m0 = month - 1;
  const firstWd = new Date(Date.UTC(year, m0, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export async function buildClientCalendarHtml(opts: ClientCalendarOpts): Promise<string> {
  const all = await getAllObservances(opts.year);
  const prefix = `${opts.year}-${String(opts.month).padStart(2, "0")}-`;
  // Só nacionais + comemorativas (sem estaduais/municipais, que dependem de cidade).
  const inMonth = all.filter((o) => o.date.startsWith(prefix) && o.category !== "estadual" && o.category !== "municipal");
  if (inMonth.length === 0) return "";

  const monthly = inMonth.filter((o) => o.monthLong);
  const daily = inMonth.filter((o) => !o.monthLong).sort((a, b) => a.date.localeCompare(b.date));

  // dia → é nacional? (pra cor da célula)
  const natByDay = new Set<number>();
  const comByDay = new Set<number>();
  for (const o of daily) {
    const d = parseInt(o.date.slice(8, 10), 10);
    if (!Number.isFinite(d)) continue;
    if (isNational(o.category)) natByDay.add(d); else comByDay.add(d);
  }

  const monthLabel = MONTHS[opts.month - 1];
  const region = opts.region ?? "BRASIL";
  const hasNational = natByDay.size > 0;

  // ── Grade do calendário ──────────────────────────────────────
  const cells = monthCells(opts.year, opts.month);
  const cellHtml = cells.map((day) => {
    if (day === null) return `<div class="cell empty"></div>`;
    if (natByDay.has(day)) return `<div class="cell nat">${day}</div>`;
    if (comByDay.has(day)) return `<div class="cell com">${day}</div>`;
    return `<div class="cell">${day}</div>`;
  }).join("");

  const legend = [
    hasNational ? `<span class="lg"><i style="background:${P.red}"></i>Feriado nacional</span>` : "",
    `<span class="lg"><i style="background:${P.blue}"></i>Data comemorativa</span>`,
  ].filter(Boolean).join("");

  // ── Cards ────────────────────────────────────────────────────
  const cardsHtml = [...monthly, ...daily].map((o) => {
    const nat = isNational(o.category);
    const fill = nat ? P.red : P.blue;
    const day = o.monthLong ? null : parseInt(o.date.slice(8, 10), 10);
    const wdIdx = o.monthLong ? null : new Date(o.date + "T12:00:00Z").getUTCDay();
    const weekday = wdIdx !== null ? WEEKDAYS_FULL[wdIdx] : "Mês inteiro";
    const desc = getDescriptionFor(o.name, o.category, o.nichos);
    const dateBlock = day !== null
      ? `<div class="dnum">${String(day).padStart(2, "0")}</div><div class="dmon">${MONTHS_SHORT[opts.month - 1]}</div>`
      : `<div class="dmon big">${MONTHS_SHORT[opts.month - 1]}</div>`;
    return `
    <div class="card">
      <div class="date" style="background:${fill}">${dateBlock}</div>
      <div class="body">
        <span class="pill" style="background:${fill}">${catLabel(o.category).toUpperCase()}</span>
        <div class="title">${escapeHtml(o.name)}</div>
        <div class="wd">${weekday}</div>
        <div class="desc">${escapeHtml(desc)}</div>
      </div>
    </div>`;
  }).join("");

  // ── Documento ────────────────────────────────────────────────
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${P.page}; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, Helvetica, sans-serif; color: ${P.text}; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm 15mm; background: ${P.page}; }
  .cover { page-break-after: always; display: flex; flex-direction: column; }
  .brand { text-align: center; color: ${P.blue}; font-weight: 800; font-size: 17px; letter-spacing: 3px; }
  .rule { height: 2px; background: ${P.blue}; margin: 14px 0 30px; border-radius: 2px; }
  .htitle { text-align: center; font-size: 64px; font-weight: 800; letter-spacing: 2px; line-height: 1; }
  .hsub { text-align: center; color: ${P.blue}; font-weight: 700; font-size: 14px; letter-spacing: 4px; margin-top: 12px; }
  .hcap { text-align: center; color: ${P.muted}; font-size: 12px; margin-top: 8px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 34px; }
  .wdh { background: ${P.blue}; color: #fff; font-size: 12px; font-weight: 700; text-align: center; padding: 10px 0; border-radius: 5px; letter-spacing: 0.5px; }
  .cell { height: 74px; display: flex; align-items: center; justify-content: center; font-size: 16px; color: ${P.muted}; background: ${P.panelAlt}; border: 1px solid transparent; border-radius: 5px; }
  .cell.empty { background: transparent; }
  .cell.com { background: ${P.blueFill}; border-color: ${P.blueBorder}; color: ${P.blueText}; font-weight: 700; }
  .cell.nat { background: ${P.redFill}; border-color: ${P.redBorder}; color: ${P.redText}; font-weight: 700; }
  .legend { display: flex; gap: 22px; margin-top: 22px; }
  .lg { display: flex; align-items: center; font-size: 11px; color: ${P.muted}; }
  .lg i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; margin-right: 7px; }
  .chead { display: flex; justify-content: space-between; align-items: center; }
  .chead .b { color: ${P.blue}; font-weight: 800; font-size: 13px; letter-spacing: 2px; }
  .chead .r { color: ${P.muted}; font-size: 11px; }
  .cbar { background: ${P.blue}; color: #fff; font-weight: 700; font-size: 15px; padding: 12px 16px; border-radius: 6px; margin: 18px 0 18px; }
  .card { display: flex; margin-bottom: 10px; border-radius: 6px; overflow: hidden; break-inside: avoid; }
  .date { width: 66px; flex: 0 0 66px; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 0; }
  .date .dnum { font-size: 24px; font-weight: 800; line-height: 1; }
  .date .dmon { font-size: 9px; letter-spacing: 1px; margin-top: 5px; }
  .date .dmon.big { font-size: 11px; padding: 8px 0; }
  .body { flex: 1; background: ${P.panel}; border: 1px solid ${P.border}; border-left: 0; border-radius: 0 6px 6px 0; padding: 11px 16px; }
  .pill { display: inline-block; color: #fff; font-size: 9px; font-weight: 700; letter-spacing: 1px; padding: 3px 9px; border-radius: 10px; margin-bottom: 6px; }
  .title { font-size: 16px; font-weight: 700; color: ${P.text}; }
  .wd { font-size: 11px; color: ${P.muted}; font-style: italic; margin: 2px 0 5px; }
  .desc { font-size: 11px; color: ${P.muted}; line-height: 1.5; }
  .foot { color: ${P.faint}; font-size: 9px; text-align: center; margin-top: auto; padding-top: 26px; }
</style></head><body>
  <section class="page cover">
    <div class="brand">LONE MÍDIA</div>
    <div class="rule"></div>
    <div class="htitle">FERIADOS</div>
    <div class="hsub">${escapeHtml(monthLabel.toUpperCase())} ${opts.year} · ${escapeHtml(region)}</div>
    <div class="hcap">Feriados nacionais e datas comemorativas</div>
    <div class="grid">
      ${WEEKDAYS.map((w) => `<div class="wdh">${w}</div>`).join("")}
      ${cellHtml}
    </div>
    <div class="legend">${legend}</div>
    <div class="foot">LONE MÍDIA · Feriados — ${escapeHtml(monthLabel)} ${opts.year} · ${escapeHtml(region)}</div>
  </section>
  <section class="page">
    <div class="chead"><span class="b">LONE MÍDIA</span><span class="r">${escapeHtml(monthLabel)} ${opts.year} · ${escapeHtml(region)}</span></div>
    <div class="cbar">Feriados e Datas de ${escapeHtml(monthLabel)} ${opts.year} — ${escapeHtml(region)}</div>
    ${cardsHtml}
  </section>
</body></html>`;
}
