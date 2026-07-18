// lib/fichaViva/crescimento-pdf.ts — PDF NAVY de CRESCIMENTO do cliente (faturamento/ticket/vendas
// mês a mês), com gráficos SVG, comparação de trimestres e destaques. Identidade Lone Mídia.
// Renderizado por browserless (lib/traffic/renderPdf). Dados reais de client_financial_results.

export interface CrescimentoRow {
  month: string;              // "YYYY-MM"
  revenue: number;            // faturamento
  vendas: number | null;      // nº de vendas/cupons/atendimentos (pode faltar)
  ticket: number | null;      // faturamento / vendas
}

const BRAND = "#5A68FF";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Compacto e ADAPTATIVO: >=1M vira "1,05M"; >=mil vira "159 mil"; senão o valor cheio. Assim clientes
// abaixo de R$ 1M não viram todos "R$ 0,08M" (que perdia precisão).
const brlShort = (n: number) => {
  if (n >= 1_000_000) return "R$ " + (n / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "M";
  if (n >= 1_000) return "R$ " + Math.round(n / 1_000).toLocaleString("pt-BR") + " mil";
  return "R$ " + Math.round(n).toLocaleString("pt-BR");
};
const inte = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const mesLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${MESES[parseInt(mm, 10) - 1] ?? mm}/${y.slice(2)}`;
};
const mesCurto = (m: string) => {
  const [, mm] = m.split("-");
  const l = MESES[parseInt(mm, 10) - 1] ?? mm;
  return l.charAt(0).toUpperCase() + l.slice(1);
};

// Gráfico de barras (faturamento por mês) em SVG.
function barChart(rows: CrescimentoRow[]): string {
  const W = 820, H = 260, padB = 34, padT = 30;
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  const bw = Math.min(84, (W - 20) / rows.length - 14);
  const gap = (W - 20) / rows.length;
  const bars = rows.map((r, i) => {
    const h = ((r.revenue / max) * (H - padB - padT));
    const x = 10 + i * gap + (gap - bw) / 2;
    const y = H - padB - h;
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="url(#bg)"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" fill="#c7ccf5" font-size="12.5" font-weight="700" text-anchor="middle">${brlShort(r.revenue)}</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(H - 12).toFixed(1)}" fill="#8b91a1" font-size="12" text-anchor="middle">${mesCurto(r.month)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7cff"/><stop offset="1" stop-color="#3f4fd6"/></linearGradient></defs>
    ${bars}</svg>`;
}

// Gráfico de linha (ticket médio) em SVG.
function lineChart(rows: CrescimentoRow[]): string {
  const pts = rows.filter((r) => r.ticket != null) as (CrescimentoRow & { ticket: number })[];
  if (pts.length < 2) return "";
  const W = 820, H = 240, padB = 34, padT = 34, padX = 24;
  const max = Math.max(...pts.map((p) => p.ticket)) * 1.08;
  const min = Math.min(...pts.map((p) => p.ticket)) * 0.92;
  const x = (i: number) => padX + (i * (W - padX * 2)) / (pts.length - 1);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padB - padT);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.ticket).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
  const dots = pts.map((p, i) => `
    <circle cx="${x(i).toFixed(1)}" cy="${y(p.ticket).toFixed(1)}" r="4.5" fill="#0B0E1E" stroke="${BRAND}" stroke-width="2.5"/>
    <text x="${x(i).toFixed(1)}" y="${(y(p.ticket) - 12).toFixed(1)}" fill="#c7ccf5" font-size="12" font-weight="700" text-anchor="middle">${brl(p.ticket).replace(",00", "")}</text>
    <text x="${x(i).toFixed(1)}" y="${(H - 10).toFixed(1)}" fill="#8b91a1" font-size="12" text-anchor="middle">${mesCurto(p.month)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="la" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BRAND}" stop-opacity="0.28"/><stop offset="1" stop-color="${BRAND}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#la)"/><path d="${line}" fill="none" stroke="${BRAND}" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg>`;
}

export function crescimentoPdfHtml(cliente: string, rowsIn: CrescimentoRow[], dataLabel: string, logoDataUri: string): string {
  const rows = [...rowsIn].sort((a, b) => a.month.localeCompare(b.month));
  const totalFat = rows.reduce((s, r) => s + r.revenue, 0);
  const comVendas = rows.filter((r) => r.vendas != null) as (CrescimentoRow & { vendas: number })[];
  const totalVendas = comVendas.reduce((s, r) => s + r.vendas, 0);
  const hasVendas = comVendas.length >= 2;
  const ticketMedio = hasVendas && totalVendas > 0 ? totalFat / totalVendas : null;
  const mediaMes = rows.length ? totalFat / rows.length : 0;

  // crescimento 1º→último mês
  const primeiro = rows[0], ultimo = rows[rows.length - 1];
  const cresc = primeiro && ultimo && primeiro.revenue > 0 ? Math.round((ultimo.revenue / primeiro.revenue - 1) * 100) : null;

  // destaques
  const maxFat = rows.reduce((a, b) => (b.revenue > a.revenue ? b : a), rows[0]);
  const maxVen = comVendas.length ? comVendas.reduce((a, b) => (b.vendas > a.vendas ? b : a)) : null;
  const maxTk = comVendas.filter((r) => r.ticket != null).length
    ? comVendas.filter((r) => r.ticket != null).reduce((a, b) => ((b.ticket ?? 0) > (a.ticket ?? 0) ? b : a)) : null;

  const kpiCard = (label: string, valor: string, sub: string) =>
    `<div class="kpi"><div class="kl">${label}</div><div class="kv">${valor}</div><div class="ks">${sub}</div></div>`;

  const periodo = rows.length ? `${mesLabel(primeiro.month)} — ${mesLabel(ultimo.month)}` : "";

  // tabela mês a mês
  const linhas = rows.map((r) => `
    <tr>
      <td class="mes">${mesCurto(r.month)} <span>${r.month.slice(0, 4)}</span></td>
      ${hasVendas ? `<td class="num">${r.vendas != null ? inte(r.vendas) : "—"}</td>` : ""}
      ${hasVendas ? `<td class="num">${r.ticket != null ? brl(r.ticket) : "—"}</td>` : ""}
      <td class="num strong">${brl(r.revenue)}</td>
    </tr>`).join("");

  const totalRow = `<tr class="total">
    <td>Total · ${rows.length} ${rows.length === 1 ? "mês" : "meses"}</td>
    ${hasVendas ? `<td class="num">${inte(totalVendas)}</td>` : ""}
    ${hasVendas ? `<td class="num">${ticketMedio != null ? brl(ticketMedio) : "—"}</td>` : ""}
    <td class="num strong">${brl(totalFat)}</td>
  </tr>`;

  // leitura
  const leitura = cresc == null ? "" :
    cresc > 3 ? `O faturamento cresceu <b>+${cresc}%</b> de ${mesCurto(primeiro.month)} a ${mesCurto(ultimo.month)} — trajetória de alta consistente.`
    : cresc < -3 ? `O faturamento recuou <b>${cresc}%</b> no período — vamos reverter isso juntos com as ações certas.`
    : `O faturamento ficou estável (${cresc >= 0 ? "+" : ""}${cresc}%) no período — base sólida pra escalar.`;

  // Sem web-font (Montserrat): o Chrome embutia ~400KB de fonte no PDF, deixando pesado/travado pra
  // abrir. Fonte de sistema = PDF leve (~40KB) e geração rápida (sem esperar rede). Visual mantém a
  // pegada premium pelos pesos/cores.
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:A4; margin:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif; color:#EEF0F6; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  /* Fundo SÓLIDO (não gradiente de página inteira) — gradiente A4 vira imagem pesada no PDF e trava
     a visualização. Sólido = PDF leve e rápido de abrir. */
  .page { width:210mm; min-height:297mm; padding:18mm 15mm; position:relative; overflow:hidden;
    background:#070b1a; page-break-after:always; }
  .page:last-child { page-break-after:auto; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
  .brand { display:flex; align-items:center; gap:9px; }
  .brand img { height:26px; }
  .brand .word { font-weight:800; letter-spacing:.13em; font-size:15px; }
  .top .meta { text-align:right; font-size:9.5px; letter-spacing:.15em; color:#6a719c; line-height:1.8; text-transform:uppercase; }
  .kicker { font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:${BRAND}; font-weight:700; margin-bottom:10px; }
  h1 { font-size:38px; font-weight:800; line-height:1.05; letter-spacing:-.5px; }
  h1 span { color:${BRAND}; }
  h2 { font-size:23px; font-weight:800; letter-spacing:-.3px; }
  .sub { color:#9096b8; font-size:12.5px; margin-top:12px; line-height:1.5; max-width:520px; }
  .kpis { display:flex; gap:14px; margin-top:30px; }
  .kpi { flex:1; background:#0B0E1E; border:1px solid #1c2136; border-radius:14px; padding:18px 18px 16px; }
  .kpi .kl { font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:#6a719c; font-weight:600; }
  .kpi .kv { font-size:24px; font-weight:800; margin-top:8px; letter-spacing:-.5px; }
  .kpi .ks { font-size:10.5px; color:#9096b8; margin-top:5px; }
  .cover-foot { position:absolute; left:15mm; right:15mm; bottom:16mm; display:flex; justify-content:space-between; border-top:1px solid #1c2136; padding-top:14px; }
  .cover-foot .l { font-size:9.5px; letter-spacing:.14em; text-transform:uppercase; color:#6a719c; }
  .cover-foot .l b { display:block; color:#c7ccf5; font-size:12px; letter-spacing:0; text-transform:none; margin-top:3px; }
  .card { background:#0B0E1E; border:1px solid #1c2136; border-radius:16px; padding:20px 22px; margin-top:18px; }
  .card .ct { font-size:12px; font-weight:700; }
  .card .cs { font-size:10.5px; color:#8b91a1; margin-top:2px; margin-bottom:14px; }
  .reading { background:linear-gradient(135deg,rgba(90,104,255,.10),rgba(90,104,255,.03)); border:1px solid rgba(90,104,255,.22); border-radius:14px; padding:16px 18px; margin-top:18px; font-size:13px; line-height:1.6; color:#d7daf0; }
  .reading b { color:#fff; }
  table { width:100%; border-collapse:collapse; margin-top:6px; }
  th { text-align:right; font-size:9.5px; letter-spacing:.1em; text-transform:uppercase; color:#6a719c; font-weight:600; padding:0 4px 12px; border-bottom:1px solid #1c2136; }
  th:first-child { text-align:left; }
  td { padding:13px 4px; font-size:13px; border-bottom:1px solid #14182b; }
  td.mes { font-weight:700; } td.mes span { color:#6a719c; font-weight:600; font-size:11px; margin-left:4px; }
  td.num { text-align:right; color:#c7ccf5; } td.strong { font-weight:800; color:#fff; }
  tr.total td { border-top:2px solid #2a3050; border-bottom:none; font-weight:800; padding-top:15px; background:rgba(90,104,255,.05); }
  .destaques { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px; }
  .dq { background:#0B0E1E; border:1px solid #1c2136; border-radius:14px; padding:16px 18px; }
  .dq .dl { font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; color:#6a719c; font-weight:600; }
  .dq .dv { font-size:21px; font-weight:800; margin-top:6px; letter-spacing:-.4px; }
  .dq .ds { font-size:11px; color:${BRAND}; font-weight:700; margin-top:3px; }
  .foot { position:absolute; left:15mm; right:15mm; bottom:12mm; font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:#4a5075; display:flex; justify-content:space-between; }
</style></head><body>

  <!-- CAPA -->
  <div class="page">
    <div class="top">
      <div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="Lone Mídia">` : `<span class="word">LONE MÍDIA</span>`}</div>
      <div class="meta">Relatório de Crescimento<br><b style="color:#8b91a1">${dataLabel}</b></div>
    </div>
    <div style="margin-top:120px">
      <div class="kicker">Relatório de Crescimento · Cliente</div>
      <h1>${cliente}<br><span>em números</span></h1>
      <p class="sub">Evolução real de faturamento${hasVendas ? ", ticket médio e volume de vendas" : ""} no período, com os destaques que contam a história do crescimento.</p>
    </div>
    <div class="kpis">
      ${kpiCard("Faturamento no período", brl(totalFat), `Média de ${brl(mediaMes)}/mês`)}
      ${hasVendas ? kpiCard("Vendas no período", inte(totalVendas), periodo) : kpiCard("Meses acompanhados", String(rows.length), periodo)}
      ${ticketMedio != null ? kpiCard("Ticket médio", brl(ticketMedio), cresc != null ? `Crescimento ${cresc >= 0 ? "+" : ""}${cresc}%` : "") : kpiCard("Crescimento no período", cresc != null ? `${cresc >= 0 ? "+" : ""}${cresc}%` : "—", `${mesCurto(primeiro?.month || "")} → ${mesCurto(ultimo?.month || "")}`)}
    </div>
    <div class="cover-foot">
      <div class="l">Preparado por<b>Lone Mídia · Marketing & Performance</b></div>
      <div class="l" style="text-align:right">Período<b>${periodo}</b></div>
    </div>
  </div>

  <!-- PANORAMA + GRÁFICO -->
  <div class="page">
    <div class="top"><div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="">` : `<span class="word">LONE MÍDIA</span>`}</div><div class="meta">Panorama do período</div></div>
    <div class="kicker">Panorama</div>
    <h2>Como o faturamento evoluiu</h2>
    ${leitura ? `<div class="reading">${leitura}</div>` : ""}
    <div class="card">
      <div class="ct">Faturamento mensal</div>
      <div class="cs">${periodo} · cada barra é o faturamento do mês</div>
      ${barChart(rows)}
    </div>
    <div class="card">
      <div class="ct">Dados mês a mês</div>
      <div class="cs">Faturamento${hasVendas ? ", vendas e ticket médio" : ""} de cada mês</div>
      <table>
        <thead><tr><th>Mês</th>${hasVendas ? "<th>Vendas</th><th>Ticket médio</th>" : ""}<th>Faturamento</th></tr></thead>
        <tbody>${linhas}${totalRow}</tbody>
      </table>
    </div>
    <div class="foot"><span>Lone Mídia · Relatório de Crescimento</span><span>${cliente}</span></div>
  </div>

  ${(lineChart(rows) || maxFat) ? `
  <!-- TICKET + DESTAQUES -->
  <div class="page">
    <div class="top"><div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="">` : `<span class="word">LONE MÍDIA</span>`}</div><div class="meta">Destaques do período</div></div>
    <div class="kicker">Destaques</div>
    <h2>Os recordes que contam a história</h2>
    ${lineChart(rows) ? `<div class="card"><div class="ct">Evolução do ticket médio</div><div class="cs">Tendência — cada venda valendo mais mês a mês</div>${lineChart(rows)}</div>` : ""}
    <div class="destaques">
      <div class="dq"><div class="dl">💰 Maior faturamento</div><div class="dv">${brl(maxFat.revenue)}</div><div class="ds">${mesLabel(maxFat.month)}</div></div>
      ${maxVen ? `<div class="dq"><div class="dl">🛒 Maior volume de vendas</div><div class="dv">${inte(maxVen.vendas)}</div><div class="ds">${mesLabel(maxVen.month)}</div></div>` : `<div class="dq"><div class="dl">📈 Crescimento no período</div><div class="dv">${cresc != null ? `${cresc >= 0 ? "+" : ""}${cresc}%` : "—"}</div><div class="ds">${mesCurto(primeiro?.month || "")} → ${mesCurto(ultimo?.month || "")}</div></div>`}
      ${maxTk && maxTk.ticket != null ? `<div class="dq"><div class="dl">🎯 Maior ticket médio</div><div class="dv">${brl(maxTk.ticket)}</div><div class="ds">${mesLabel(maxTk.month)}</div></div>` : ""}
      <div class="dq"><div class="dl">🏆 Faturamento total</div><div class="dv">${brlShort(totalFat)}</div><div class="ds">${rows.length} ${rows.length === 1 ? "mês" : "meses"} acompanhados</div></div>
    </div>
    <div class="reading" style="margin-top:22px">Esses números mostram um cliente <b>em ascensão</b>. Com as ações certas de marketing e oferta, o próximo degrau de faturamento é uma consequência natural do que já está sendo construído.</div>
    <div class="foot"><span>Lone Mídia · Relatório de Crescimento</span><span>${cliente}</span></div>
  </div>` : ""}

</body></html>`;
}
