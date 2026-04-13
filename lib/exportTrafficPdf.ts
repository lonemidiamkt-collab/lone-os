/**
 * Premium Traffic Report PDF — styled like the Ortobom report
 * Opens in a new tab for print/save as PDF
 */

import type { AdCampaign } from "@/lib/types";

export interface TrafficReportData {
  clientName: string;
  period: string; // "01/11/25 - 30/11/25"
  // Aggregate metrics
  reach: number;
  impressions: number;
  clicks: number;
  messages: number;
  spend: number;
  // Cost metrics
  costPerMessage: number;
  costPerClick: number;
  cpm: number;
  // Optional video metrics
  videoViews25?: number;
  videoViews50?: number;
  videoViews75?: number;
  videoViews95?: number;
  // Campaign breakdown
  campaigns: {
    name: string;
    objective: string;
    spend: number;
    impressions: number;
    clicks: number;
    messages: number;
    costPerMessage: number;
    cpm: number;
    status: string;
  }[];
  // Demographics / Audience
  demographics?: {
    ageRanges: { range: string; percentage: number }[];
    genderSplit: { women: number; men: number };
  };
  // Observations
  observations?: string;
}

/** Returns the raw HTML string for a report */
export function buildTrafficReportHtml(data: TrafficReportData): string {
  const formatCurrency = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatNum = (v: number) => v.toLocaleString("pt-BR");
  const logoUrl = `${window.location.origin}/logo.png`;

  // Demographics section
  const hasDemographics = data.demographics && data.demographics.ageRanges.length > 0;
  const maxAgePct = hasDemographics ? Math.max(...data.demographics!.ageRanges.map((a) => a.percentage)) : 0;
  const demoHtml = hasDemographics ? (() => {
    const d = data.demographics!;
    const wPct = d.genderSplit.women;
    const mPct = d.genderSplit.men;
    const circumference = 2 * Math.PI * 54;
    const womenArc = (wPct / 100) * circumference;
    const menArc = (mPct / 100) * circumference;

    const ageBars = d.ageRanges.map((a) => `
      <div class="age-bar-container">
        <div class="age-label">${a.range}</div>
        <div class="age-bar-bg">
          <div class="age-bar-fill" style="width:${Math.max((a.percentage / maxAgePct) * 100, 8)}%;">
            <span class="age-bar-pct">${a.percentage.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    `).join("");

    return `
    <div class="demo-section">
      <div class="section-title">Público — Dados Demográficos</div>
      <div class="demo-grid">
        <div class="demo-chart">
          <p style="font-size:10px;font-weight:700;color:#3b6ff5;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Faixa Etária</p>
          ${ageBars}
        </div>
        <div class="demo-gender">
          <p style="font-size:10px;font-weight:700;color:#3b6ff5;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Gênero</p>
          <div class="gender-ring">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#1a1a24" stroke-width="12"/>
              <circle cx="60" cy="60" r="54" fill="none" stroke="#e84393" stroke-width="12"
                stroke-dasharray="${womenArc} ${circumference}" stroke-linecap="round"/>
              <circle cx="60" cy="60" r="54" fill="none" stroke="#0d4af5" stroke-width="12"
                stroke-dasharray="${menArc} ${circumference}" stroke-dashoffset="-${womenArc}" stroke-linecap="round"/>
            </svg>
            <div class="center-text">
              <div style="font-size:9px;font-weight:800;color:#ffffff;">Total</div>
              <div style="font-size:7px;color:#a1a1aa;">100%</div>
            </div>
          </div>
          <div class="gender-legend">
            <span><span class="dot" style="background:#e84393;"></span> ${wPct.toFixed(1)}% Mulheres</span>
            <span><span class="dot" style="background:#0d4af5;"></span> ${mPct.toFixed(1)}% Homens</span>
          </div>
        </div>
      </div>
    </div>`;
  })() : "";

  const campaignRows = data.campaigns
    .filter((c) => c.status === "active" || c.spend > 0)
    .sort((a, b) => b.messages - a.messages)
    .map(
      (c) => `
        <tr>
          <td style="padding:3px 6px;font-weight:500;color:#e4e4e7;border-bottom:1px solid #1a1a24;font-size:9px;">${c.name}</td>
          <td style="padding:3px 6px;text-align:center;color:#a1a1aa;border-bottom:1px solid #1a1a24;">${formatCurrency(c.spend)}</td>
          <td style="padding:3px 6px;text-align:center;color:#a1a1aa;border-bottom:1px solid #1a1a24;">${formatNum(c.impressions)}</td>
          <td style="padding:3px 6px;text-align:center;color:#a1a1aa;border-bottom:1px solid #1a1a24;">${formatNum(c.clicks)}</td>
          <td style="padding:3px 6px;text-align:center;font-weight:600;color:#3b6ff5;border-bottom:1px solid #1a1a24;">${formatNum(c.messages)}</td>
          <td style="padding:3px 6px;text-align:center;color:#a1a1aa;border-bottom:1px solid #1a1a24;">${c.messages > 0 ? formatCurrency(c.costPerMessage) : "—"}</td>
        </tr>`
    )
    .join("");

  const hasVideo = data.videoViews25 && data.videoViews25 > 0;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório Meta Ads — ${data.clientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    html, body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #e4e4e7;
      background: #09090b !important;
      background-color: #09090b !important;
    }

    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px 30px;
    }

    /* Header */
    .report-header {
      text-align: center;
      margin-bottom: 16px;
    }
    .report-header .date-badge {
      display: inline-block;
      background: #0d4af5;
      color: white;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    .report-header h1 {
      font-size: 20px;
      font-weight: 900;
      color: #ffffff;
      text-transform: uppercase;
      letter-spacing: -0.02em;
      margin-bottom: 4px;
    }
    .report-header .meta-badge {
      display: inline-block;
      background: #0d4af5;
      color: white;
      padding: 4px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .report-header .client-name {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* KPI Row */
    .kpi-row {
      display: flex;
      gap: 0;
      margin-bottom: 14px;
    }
    .kpi-box {
      flex: 1;
      text-align: center;
      padding: 10px 6px;
      border: 2px solid #0d4af5;
      background: #0f0f14;
    }
    .kpi-box:first-child { border-radius: 8px 0 0 8px; }
    .kpi-box:last-child { border-radius: 0 8px 8px 0; }
    .kpi-box:not(:last-child) { border-right: none; }
    .kpi-label {
      font-size: 8px;
      font-weight: 700;
      color: #3b6ff5;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 3px;
    }
    .kpi-value {
      font-size: 14px;
      font-weight: 800;
      color: #ffffff;
    }

    /* Cost Metrics */
    .cost-section {
      border: 2px solid #0d4af5;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-around;
      align-items: center;
      background: #0f0f14;
    }
    .cost-item {
      text-align: center;
    }
    .cost-value {
      font-size: 20px;
      font-weight: 800;
      color: #3b6ff5;
    }
    .cost-value.highlight {
      font-size: 22px;
      color: #0d4af5;
    }
    .cost-label {
      font-size: 10px;
      color: #a1a1aa;
      margin-top: 2px;
      font-weight: 500;
    }

    /* Video Funnel */
    .video-section {
      margin-bottom: 10px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      color: #ffffff;
    }
    .funnel {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .funnel-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .funnel-value {
      width: 60px;
      text-align: right;
      font-size: 12px;
      font-weight: 700;
      color: #e4e4e7;
    }
    .funnel-bar {
      flex: 1;
      height: 22px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 10px;
    }
    .funnel-pct {
      font-size: 10px;
      font-weight: 700;
      color: white;
    }

    /* Campaign Table */
    .campaign-section {
      margin-bottom: 10px;
    }
    .campaign-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .campaign-table th {
      padding: 4px 6px;
      text-align: center;
      font-size: 8px;
      font-weight: 700;
      color: white;
      background: #0d4af5;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .campaign-table th:first-child { text-align: left; border-radius: 6px 0 0 0; }
    .campaign-table th:last-child { border-radius: 0 6px 0 0; }
    .campaign-table tr:nth-child(even) { background: #0f0f14; }
    .campaign-table tr:nth-child(odd) { background: #09090b; }

    /* Observations */
    .observations {
      background: #0f0f14;
      border-left: 3px solid #0d4af5;
      padding: 8px 12px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 10px;
    }
    .observations h3 {
      font-size: 9px;
      font-weight: 700;
      color: #3b6ff5;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .observations p {
      font-size: 10px;
      line-height: 1.4;
      color: #d4d4d8;
    }

    /* Demographics */
    .demo-section { margin-bottom: 10px; }
    .demo-grid {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .demo-chart {
      flex: 1;
    }
    .demo-gender {
      width: 140px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .gender-ring {
      position: relative;
      width: 90px;
      height: 90px;
    }
    .gender-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .gender-ring .center-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    .gender-legend {
      display: flex;
      gap: 10px;
      font-size: 9px;
      font-weight: 600;
      color: #d4d4d8;
    }
    .gender-legend .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 3px;
      vertical-align: middle;
    }
    .age-bar-container {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
    }
    .age-label {
      width: 40px;
      font-size: 9px;
      font-weight: 600;
      color: #a1a1aa;
      text-align: right;
    }
    .age-bar-bg {
      flex: 1;
      height: 16px;
      background: #1a1a24;
      border-radius: 4px;
      overflow: hidden;
    }
    .age-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #0d4af5, #3b6ff7);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 6px;
      min-width: 24px;
    }
    .age-bar-pct {
      font-size: 8px;
      font-weight: 700;
      color: white;
    }

    /* Footer */
    .report-footer {
      text-align: center;
      padding-top: 10px;
      border-top: 1px solid #1a1a24;
      margin-top: 12px;
    }
    .footer-logo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .footer-logo .logo-box {
      width: 44px;
      height: 44px;
      background: #000000;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .footer-logo .logo-text {
      font-weight: 800;
      font-size: 16px;
      color: #ffffff;
      letter-spacing: -0.02em;
    }
    .footer-logo .logo-sub {
      font-size: 10px;
      color: #3b6ff5;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      font-weight: 600;
    }

    /* Print */
    @media print {
      html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; background: #09090b !important; background-color: #09090b !important; }
      .page { padding: 12px 20px; background: #09090b !important; }
      .kpi-box { background: #0f0f14 !important; }
      .cost-section { background: #0f0f14 !important; }
      .campaign-table th { background: #0d4af5 !important; }
      .campaign-table tr:nth-child(even) { background: #0f0f14 !important; }
      .campaign-table tr:nth-child(odd) { background: #09090b !important; }
      .observations { background: #0f0f14 !important; }
      .age-bar-bg { background: #1a1a24 !important; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:16px;background:#0d4af5;">
    <button onclick="window.print()" style="padding:10px 32px;background:#09090b;color:#ffffff;border:1px solid #3b6ff5;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:0.03em;">
      Salvar como PDF / Imprimir
    </button>
  </div>

  <div class="page">
    <!-- Header -->
    <div class="report-header">
      <div style="width:60px;height:60px;background:#000;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:10px;">
        <img src="${logoUrl}" alt="Lone" style="width:46px;height:46px;object-fit:contain;"/>
      </div>
      <div class="date-badge">${data.period}</div>
      <h1>Relatório de Campanhas</h1>
      <div class="meta-badge">META ADS</div>
      <div class="client-name">${data.clientName}</div>
    </div>

    <!-- KPI Row -->
    <div class="kpi-row">
      <div class="kpi-box">
        <div class="kpi-label">Alcance</div>
        <div class="kpi-value">${formatNum(data.reach)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Impressões</div>
        <div class="kpi-value">${formatNum(data.impressions)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Cliques Link</div>
        <div class="kpi-value">${formatNum(data.clicks)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Mensagens</div>
        <div class="kpi-value">${formatNum(data.messages)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Investimento</div>
        <div class="kpi-value">${formatCurrency(data.spend)}</div>
      </div>
    </div>

    <!-- Cost Metrics -->
    <div class="cost-section">
      <div class="cost-item">
        <div class="cost-value highlight">${formatCurrency(data.costPerMessage)}</div>
        <div class="cost-label">C. por mensagem</div>
      </div>
      <div class="cost-item">
        <div class="cost-value">${formatCurrency(data.costPerClick)}</div>
        <div class="cost-label">C. por clique</div>
      </div>
      <div class="cost-item">
        <div class="cost-value">${formatCurrency(data.cpm)}</div>
        <div class="cost-label">C. por mil impressões</div>
      </div>
    </div>

    ${hasVideo ? `
    <!-- Video Funnel -->
    <div class="video-section">
      <div class="section-title">Reprodução de Vídeo</div>
      <div class="funnel">
        <div class="funnel-row">
          <div class="funnel-value">${formatNum(data.videoViews25!)}</div>
          <div class="funnel-bar" style="background:linear-gradient(90deg,#0d4af5,#3b6ff7);width:100%;">
            <div class="funnel-pct">25%</div>
          </div>
        </div>
        <div class="funnel-row">
          <div class="funnel-value">${formatNum(data.videoViews50!)}</div>
          <div class="funnel-bar" style="background:linear-gradient(90deg,#0d4af5,#3b6ff7);width:80%;">
            <div class="funnel-pct">50%</div>
          </div>
        </div>
        <div class="funnel-row">
          <div class="funnel-value">${formatNum(data.videoViews75!)}</div>
          <div class="funnel-bar" style="background:linear-gradient(90deg,#0d4af5,#3b6ff7);width:60%;">
            <div class="funnel-pct">75%</div>
          </div>
        </div>
        <div class="funnel-row">
          <div class="funnel-value">${formatNum(data.videoViews95!)}</div>
          <div class="funnel-bar" style="background:linear-gradient(90deg,#0d4af5,#3b6ff7);width:45%;">
            <div class="funnel-pct">95%</div>
          </div>
        </div>
      </div>
    </div>
    ` : ""}

    ${demoHtml}

    <!-- Campaign Breakdown -->
    ${campaignRows ? `
    <div class="campaign-section">
      <div class="section-title">Desempenho por Campanha</div>
      <table class="campaign-table">
        <thead>
          <tr>
            <th>Campanha</th>
            <th>Investimento</th>
            <th>Impressões</th>
            <th>Cliques</th>
            <th>Mensagens</th>
            <th>C./Msg</th>
          </tr>
        </thead>
        <tbody>
          ${campaignRows}
        </tbody>
      </table>
    </div>
    ` : ""}

    ${data.observations ? `
    <div class="observations">
      <h3>Observações do Gestor</h3>
      <p>${data.observations.replace(/\n/g, "<br/>")}</p>
    </div>
    ` : ""}

    <!-- Glossary -->
    <div style="margin-top:8px;margin-bottom:6px;">
      <div class="section-title" style="margin-bottom:2px;">Tira Dúvidas</div>
      <div style="font-size:8px;line-height:1.6;color:#a1a1aa;columns:2;column-gap:16px;">
        <p><strong style="color:#3b6ff5;">CPA</strong> = Custo por aquisição</p>
        <p><strong style="color:#3b6ff5;">CPC</strong> = Custo por clique</p>
        <p><strong style="color:#3b6ff5;">CPM</strong> = Custo por mil impressões</p>
        <p><strong style="color:#3b6ff5;">CTR</strong> = % cliques sobre visualizações</p>
        <p><strong style="color:#3b6ff5;">Impressões</strong> = Vezes que os anúncios foram vistos</p>
        <p><strong style="color:#3b6ff5;">Alcance</strong> = Pessoas únicas alcançadas</p>
        <p><strong style="color:#3b6ff5;">Conversões</strong> = Ações valiosas (compras, leads, msgs)</p>
        <p><strong style="color:#3b6ff5;">Frequência</strong> = Média de exibições por pessoa</p>
      </div>
    </div>

    <!-- Disclaimer -->
    <div style="margin-top:6px;padding:6px 10px;background:#0f0f14;border-left:2px solid #0d4af5;border-radius:4px;font-size:7px;color:#a1a1aa;line-height:1.5;">
      <strong style="color:#3b6ff5;">⚠ Nota:</strong>
      Valores extraídos da API do Meta Ads — variação de até 15% em relação ao Gerenciador de Anúncios devido a janelas de atribuição e delays de processamento.
    </div>

    <!-- Footer -->
    <div class="report-footer">
      <div class="footer-logo">
        <div class="logo-box"><img src="${logoUrl}" alt="L" style="width:34px;height:34px;object-fit:contain;"/></div>
        <div>
          <div class="logo-text">LONE MÍDIA</div>
          <div class="logo-sub">Assessoria</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}

export function exportTrafficReportPdf(data: TrafficReportData) {
  const html = buildTrafficReportHtml(data);

  // Try window.open first; if blocked by popup blocker, fall back to Blob download
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${data.clientName.replace(/\s+/g, "-").toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Export all client reports as a ZIP file with separate HTML files per client
 */
export async function exportAllTrafficReportsZip(
  reports: { clientName: string; data: TrafficReportData }[]
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const report of reports) {
    const html = buildTrafficReportHtml(report.data);
    const fileName = `relatorio-${report.clientName.replace(/\s+/g, "-").toLowerCase()}.html`;
    zip.file(fileName, html);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
  a.download = `relatorios-trafego-${today}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build TrafficReportData from AdCampaign[] for a specific client/account
 */
export function buildTrafficReportData(
  clientName: string,
  campaigns: AdCampaign[],
  periodLabel: string,
  observations?: string,
  demographics?: TrafficReportData["demographics"],
  dateRange?: { startStr: string; endStr: string },
): TrafficReportData {
  // Use all campaigns passed in (already filtered by caller)
  const reportCampaigns = campaigns;

  // Aggregate from dailyMetrics if date range provided (for mock data accuracy)
  let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0, totalMessages = 0;

  if (dateRange) {
    reportCampaigns.forEach((c) => {
      const days = c.dailyMetrics.filter((d) => d.date >= dateRange.startStr && d.date <= dateRange.endStr);
      days.forEach((d) => {
        totalSpend += d.spend;
        totalImpressions += d.impressions;
        totalClicks += d.clicks;
        totalMessages += d.messages ?? 0;
      });
      const ratio = days.length / Math.max(c.dailyMetrics.length, 1);
      totalReach += Math.round(c.reach * ratio);
    });
  } else {
    totalSpend = reportCampaigns.reduce((s, c) => s + c.spend, 0);
    totalImpressions = reportCampaigns.reduce((s, c) => s + c.impressions, 0);
    totalReach = reportCampaigns.reduce((s, c) => s + c.reach, 0);
    totalClicks = reportCampaigns.reduce((s, c) => s + c.clicks, 0);
    totalMessages = reportCampaigns.reduce((s, c) => s + (c.messages ?? 0), 0);
  }

  return {
    clientName,
    period: periodLabel,
    reach: totalReach,
    impressions: totalImpressions,
    clicks: totalClicks,
    messages: totalMessages,
    spend: totalSpend,
    costPerMessage: totalMessages > 0 ? totalSpend / totalMessages : 0,
    costPerClick: totalClicks > 0 ? totalSpend / totalClicks : 0,
    cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
    campaigns: reportCampaigns.map((c) => ({
      name: c.name,
      objective: c.objective,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      messages: c.messages ?? 0,
      costPerMessage: (c.messages ?? 0) > 0 ? c.spend / (c.messages ?? 1) : 0,
      cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
      status: c.status,
    })),
    demographics,
    observations,
  };
}
