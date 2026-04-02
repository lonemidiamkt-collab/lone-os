/**
 * PDF Export via browser print dialog.
 * Opens a styled print window — user can save as PDF or print.
 */

interface ReportSection {
  label: string;
  value: string | number;
  type?: "text" | "score" | "metric";
}

interface ExportOptions {
  title: string;
  subtitle?: string;
  clientName: string;
  period: string;
  createdBy: string;
  createdAt: string;
  sections: ReportSection[];
  footer?: string;
}

export function exportReportAsPdf(options: ExportOptions) {
  const { title, subtitle, clientName, period, createdBy, createdAt, sections, footer } = options;
  const logoUrl = `${window.location.origin}/logo.png`;

  const metricsHtml = sections
    .filter((s) => s.type === "metric")
    .map(
      (s) =>
        `<div class="metric-box">
          <div class="metric-value">${s.value}</div>
          <div class="metric-label">${s.label}</div>
        </div>`
    )
    .join("");

  const scoresHtml = sections
    .filter((s) => s.type === "score")
    .map(
      (s) =>
        `<div class="score-row">
          <span class="score-label">${s.label}</span>
          <span class="score-value">${"★".repeat(Number(s.value))}${"☆".repeat(5 - Number(s.value))}</span>
        </div>`
    )
    .join("");

  const textsHtml = sections
    .filter((s) => !s.type || s.type === "text")
    .map(
      (s) =>
        `<div class="text-section">
          <h3>${s.label}</h3>
          <p>${String(s.value).replace(/\n/g, "<br/>")}</p>
        </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title} — ${clientName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #e4e4e7;
      background: #09090b !important;
      background-color: #09090b !important;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 3px solid #0a34f5;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 24px;
      color: #3b6ff5;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-size: 14px;
      color: #a1a1aa;
    }
    .meta {
      display: flex;
      gap: 30px;
      margin-bottom: 30px;
      padding: 16px;
      background: #0f0f14;
      border-radius: 8px;
      border: 1px solid #1a1a24;
    }
    .meta-item {
      font-size: 13px;
      color: #e4e4e7;
    }
    .meta-item strong {
      display: block;
      font-size: 11px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 30px;
    }
    .metric-box {
      text-align: center;
      padding: 16px 8px;
      border: 1px solid #1a1a24;
      border-radius: 8px;
      background: #0f0f14;
    }
    .metric-value {
      font-size: 22px;
      font-weight: 700;
      color: #3b6ff5;
    }
    .metric-label {
      font-size: 11px;
      color: #a1a1aa;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .score-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #1a1a24;
    }
    .score-label {
      font-size: 13px;
      min-width: 160px;
      color: #e4e4e7;
    }
    .score-value {
      font-size: 18px;
      color: #f5a623;
      letter-spacing: 2px;
    }
    .scores-block {
      margin-bottom: 30px;
    }
    .text-section {
      margin-bottom: 20px;
    }
    .text-section h3 {
      font-size: 13px;
      color: #3b6ff5;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #1a1a24;
    }
    .text-section p {
      font-size: 14px;
      line-height: 1.6;
      color: #d4d4d8;
    }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #1a1a24;
      font-size: 11px;
      color: #71717a;
      text-align: center;
    }
    @media print {
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; background: #09090b !important; background-color: #09090b !important; padding: 20px; }
      .meta { background: #0f0f14 !important; }
      .metric-box { background: #0f0f14 !important; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:20px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#09090b;color:#ffffff;border:1px solid #3b6ff5;border-radius:6px;font-size:14px;cursor:pointer;font-weight:700;">
      Salvar como PDF / Imprimir
    </button>
  </div>

  <div class="header">
    <div style="width:60px;height:60px;background:#000;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:10px;">
      <img src="${logoUrl}" alt="Lone" style="width:46px;height:46px;object-fit:contain;"/>
    </div>
    <h1>${title}</h1>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
  </div>

  <div class="meta">
    <div class="meta-item"><strong>Cliente</strong> ${clientName}</div>
    <div class="meta-item"><strong>Período</strong> ${period}</div>
    <div class="meta-item"><strong>Responsável</strong> ${createdBy}</div>
    <div class="meta-item"><strong>Data</strong> ${createdAt}</div>
  </div>

  ${metricsHtml ? `<div class="metrics-grid">${metricsHtml}</div>` : ""}
  ${scoresHtml ? `<div class="scores-block">${scoresHtml}</div>` : ""}
  ${textsHtml}

  <div class="footer">
    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="width:44px;height:44px;background:#000000;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${logoUrl}" alt="Lone" style="width:34px;height:34px;object-fit:contain;"/>
      </div>
      <div>
        <div style="font-weight:800;font-size:16px;color:#ffffff;">LONE MÍDIA</div>
        <div style="font-size:10px;color:#3b6ff5;text-transform:uppercase;letter-spacing:0.15em;font-weight:600;">Assessoria</div>
      </div>
    </div>
    <div>${footer ?? "Lone Mídia © 2026 — Relatório gerado via Lone OS"}</div>
  </div>
</body>
</html>`;

  // Try window.open first; if blocked by popup blocker, fall back to Blob download
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    // Fallback: download as HTML file the user can open and print
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${clientName.replace(/\s+/g, "-").toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
