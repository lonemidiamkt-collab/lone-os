import type { AdCampaign } from "@/lib/types";

export interface TrafficReportData {
  clientName: string;
  period: string;
  reach: number;
  impressions: number;
  clicks: number;
  messages: number;
  spend: number;
  costPerMessage: number;
  costPerClick: number;
  cpm: number;
  // Champion adset — the best-performing (cheapest) adset across all campaigns
  bestAdsetCpa?: number;
  bestAdsetName?: string;
  videoViews25?: number;
  videoViews50?: number;
  videoViews75?: number;
  videoViews95?: number;
  campaigns: {
    name: string;
    objective: string;
    spend: number;
    impressions: number;
    clicks: number;
    messages: number;
    costPerMessage: number;
    cheapestAdSetCostPerMessage?: number;
    cheapestAdSetName?: string;
    cpm: number;
    status: string;
  }[];
  demographics?: {
    ageRanges: { range: string; percentage: number }[];
    genderSplit: { women: number; men: number };
  };
  observations?: string;
}

const fmt = (v: number | undefined | null) => {
  const n = v ?? 0;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (v: number | undefined | null) => (v ?? 0).toLocaleString("pt-BR");
const safeVal = (v: number | undefined | null, fallback = "—") =>
  !v || v === 0 ? fallback : fmt(v);

export function buildTrafficReportHtml(data: TrafficReportData): string {
  const logoUrl = `${window.location.origin}/logo.png`;

  const hasBestAdset = data.bestAdsetCpa && data.bestAdsetCpa > 0;
  const hasVideo = !!(data.videoViews25 && data.videoViews25 > 0);

  // ── Demographics ──────────────────────────────────────────────────────────
  const hasDemographics = !!(data.demographics && data.demographics.ageRanges.length > 0);
  const maxAgePct = hasDemographics ? Math.max(...data.demographics!.ageRanges.map((a) => a.percentage)) : 0;

  const demoHtml = hasDemographics ? (() => {
    const d = data.demographics!;
    const circumference = 2 * Math.PI * 46;
    const wArc = (d.genderSplit.women / 100) * circumference;

    const ageBars = d.ageRanges.map((a) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span style="width:38px;font-size:10px;color:#6b7280;text-align:right;flex-shrink:0;">${a.range}</span>
        <div style="flex:1;height:14px;background:#f3f4f6;border-radius:3px;overflow:hidden;">
          <div style="width:${Math.max((a.percentage / maxAgePct) * 100, 6)}%;height:100%;background:#0d4af5;border-radius:3px;display:flex;align-items:center;justify-content:flex-end;padding-right:4px;">
            <span style="font-size:8px;font-weight:700;color:#fff;">${a.percentage.toFixed(1)}%</span>
          </div>
        </div>
      </div>`).join("");

    return `
    <section style="margin-bottom:20px;">
      <div class="section-head">Público — Dados Demográficos</div>
      <div style="display:flex;gap:24px;align-items:flex-start;margin-top:10px;">
        <div style="flex:1;">${ageBars}</div>
        <div style="width:120px;display:flex;flex-direction:column;align-items:center;gap:6px;">
          <span style="font-size:9px;font-weight:700;color:#0d4af5;text-transform:uppercase;letter-spacing:.06em;">Gênero</span>
          <div style="position:relative;width:80px;height:80px;">
            <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg);">
              <circle cx="50" cy="50" r="46" fill="none" stroke="#f3f4f6" stroke-width="8"/>
              <circle cx="50" cy="50" r="46" fill="none" stroke="#e84393" stroke-width="8"
                stroke-dasharray="${wArc} ${circumference}"/>
              <circle cx="50" cy="50" r="46" fill="none" stroke="#0d4af5" stroke-width="8"
                stroke-dasharray="${circumference - wArc} ${circumference}" stroke-dashoffset="-${wArc}"/>
            </svg>
          </div>
          <div style="font-size:9px;color:#374151;display:flex;flex-direction:column;gap:3px;align-items:center;">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e84393;margin-right:4px;vertical-align:middle;"></span>${d.genderSplit.women.toFixed(1)}% Mulheres</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0d4af5;margin-right:4px;vertical-align:middle;"></span>${d.genderSplit.men.toFixed(1)}% Homens</span>
          </div>
        </div>
      </div>
    </section>`;
  })() : "";

  // ── Campaign rows ─────────────────────────────────────────────────────────
  const activeCampaigns = data.campaigns
    .filter((c) => c.status === "active" || c.spend > 0)
    .sort((a, b) => (b.messages ?? 0) - (a.messages ?? 0));

  const campaignRows = activeCampaigns.map((c, i) => {
    const rowBg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    const cpm = c.messages > 0 ? fmt(c.costPerMessage) : "—";
    const isBest = hasBestAdset &&
      c.cheapestAdSetCostPerMessage !== undefined &&
      c.cheapestAdSetCostPerMessage > 0 &&
      Math.abs(c.cheapestAdSetCostPerMessage - (data.bestAdsetCpa ?? 0)) < 0.01;
    return `
      <tr style="background:${rowBg};">
        <td style="padding:7px 10px;font-size:10px;font-weight:${isBest ? "700" : "500"};color:#111827;border-bottom:1px solid #e5e7eb;">
          ${c.name}
          ${isBest ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:5px;">⭐ CAMPEÃO</span>` : ""}
        </td>
        <td style="padding:7px 10px;text-align:right;font-size:10px;color:#374151;border-bottom:1px solid #e5e7eb;">${fmt(c.spend)}</td>
        <td style="padding:7px 10px;text-align:right;font-size:10px;color:#374151;border-bottom:1px solid #e5e7eb;">${fmtNum(c.impressions)}</td>
        <td style="padding:7px 10px;text-align:right;font-size:10px;color:#374151;border-bottom:1px solid #e5e7eb;">${fmtNum(c.clicks)}</td>
        <td style="padding:7px 10px;text-align:right;font-size:10px;font-weight:600;color:#0d4af5;border-bottom:1px solid #e5e7eb;">${fmtNum(c.messages)}</td>
        <td style="padding:7px 10px;text-align:right;font-size:10px;color:#374151;border-bottom:1px solid #e5e7eb;">${cpm}</td>
      </tr>
      ${c.cheapestAdSetName && c.cheapestAdSetCostPerMessage ? `
      <tr style="background:${rowBg};">
        <td colspan="6" style="padding:3px 10px 7px 22px;font-size:9px;color:#6b7280;border-bottom:1px solid #e5e7eb;">
          ↳ Conjunto campeão: <strong style="color:#374151;">${c.cheapestAdSetName}</strong> &nbsp;·&nbsp; ${fmt(c.cheapestAdSetCostPerMessage)}/msg
        </td>
      </tr>` : ""}`;
  }).join("");

  // ── Video funnel ──────────────────────────────────────────────────────────
  const videoHtml = hasVideo ? `
    <section style="margin-bottom:20px;">
      <div class="section-head">Reprodução de Vídeo</div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:5px;">
        ${[
          { label: "25%", val: data.videoViews25!, w: 100 },
          { label: "50%", val: data.videoViews50!, w: 78 },
          { label: "75%", val: data.videoViews75!, w: 58 },
          { label: "95%", val: data.videoViews95!, w: 40 },
        ].map(r => `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:28px;font-size:9px;font-weight:700;color:#6b7280;">${r.label}</span>
          <span style="width:64px;font-size:10px;font-weight:600;color:#111827;text-align:right;">${fmtNum(r.val)}</span>
          <div style="flex:1;height:16px;background:#f3f4f6;border-radius:3px;overflow:hidden;">
            <div style="width:${r.w}%;height:100%;background:linear-gradient(90deg,#0d4af5,#5b8bf7);border-radius:3px;"></div>
          </div>
        </div>`).join("")}
      </div>
    </section>` : "";

  // ── Highlights ───────────────────────────────────────────────────────────
  const highlights: { num: string; text: string; sub?: string }[] = [];
  if (hasBestAdset) {
    highlights.push({
      num: "01",
      text: `Custo Campeão: <strong style="color:#0d4af5;">${fmt(data.bestAdsetCpa)}</strong> por mensagem`,
      sub: data.bestAdsetName ? `Conjunto: ${data.bestAdsetName}` : undefined,
    });
  }
  highlights.push(
    { num: hasBestAdset ? "02" : "01", text: `Mensagens geradas no período: <strong style="color:#0d4af5;">${fmtNum(data.messages)}</strong>` },
    { num: hasBestAdset ? "03" : "02", text: `Investimento total: <strong style="color:#0d4af5;">${fmt(data.spend)}</strong>` },
    { num: hasBestAdset ? "04" : "03", text: `Custo médio por mensagem: <strong style="color:#374151;">${safeVal(data.costPerMessage)}</strong>` },
  );

  const highlightsHtml = highlights.map((h, i) => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;${i < highlights.length - 1 ? "border-bottom:1px solid #e5e7eb;" : ""}">
      <span style="min-width:28px;height:28px;background:#0d4af5;color:#fff;border-radius:50%;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${h.num}</span>
      <div>
        <p style="font-size:11px;color:#111827;line-height:1.5;">${h.text}</p>
        ${h.sub ? `<p style="font-size:9px;color:#6b7280;margin-top:2px;">${h.sub}</p>` : ""}
      </div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório de Performance — ${data.clientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html,body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:#ffffff; color:#111827; }
    .page { max-width:780px; margin:0 auto; padding:32px 36px; }
    .section-head {
      font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
      color:#0d4af5; padding-bottom:6px; border-bottom:2px solid #0d4af5; margin-bottom:0;
    }
    @media print {
      html,body { background:#ffffff !important; }
      .no-print { display:none !important; }
      .page { padding:20px 24px; }
    }
  </style>
</head>
<body>

<div class="no-print" style="text-align:center;padding:14px;background:#0d4af5;">
  <button onclick="window.print()" style="padding:9px 28px;background:#fff;color:#0d4af5;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.02em;">
    Salvar como PDF / Imprimir
  </button>
</div>

<div class="page">

  <!-- ── HEADER ─────────────────────────────────────────────────── -->
  <header style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid #111827;margin-bottom:24px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:48px;height:48px;background:#000;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        <img src="${logoUrl}" alt="Lone" style="width:38px;height:38px;object-fit:contain;"/>
      </div>
      <div>
        <div style="font-size:16px;font-weight:900;color:#111827;letter-spacing:-.01em;">LONE MÍDIA</div>
        <div style="font-size:9px;font-weight:600;color:#0d4af5;text-transform:uppercase;letter-spacing:.12em;">Assessoria &amp; Marketing</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;">Relatório de Performance</div>
      <div style="font-size:9px;color:#9ca3af;margin-top:2px;">META ADS</div>
    </div>
  </header>

  <!-- ── CLIENT + PERIOD ────────────────────────────────────────── -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;">
    <div>
      <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Cliente</div>
      <div style="font-size:22px;font-weight:800;color:#111827;letter-spacing:-.02em;">${data.clientName}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Período</div>
      <div style="font-size:13px;font-weight:600;color:#374151;">${data.period}</div>
    </div>
  </div>

  <!-- ── KPI STRIP ──────────────────────────────────────────────── -->
  <div style="display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
    ${[
      { label: "Alcance", val: fmtNum(data.reach) },
      { label: "Impressões", val: fmtNum(data.impressions) },
      { label: "Cliques", val: fmtNum(data.clicks) },
      { label: "Mensagens", val: fmtNum(data.messages), highlight: true },
      { label: "Investimento", val: fmt(data.spend) },
    ].map((k, i) => `
      <div style="padding:12px 8px;text-align:center;${i < 4 ? "border-right:1px solid #e5e7eb;" : ""}${k.highlight ? "background:#eff6ff;" : ""}">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${k.highlight ? "#0d4af5" : "#9ca3af"};margin-bottom:4px;">${k.label}</div>
        <div style="font-size:15px;font-weight:800;color:${k.highlight ? "#0d4af5" : "#111827"};">${k.val}</div>
      </div>`).join("")}
  </div>

  <!-- ── DESTAQUES DA SEMANA ────────────────────────────────────── -->
  <section style="margin-bottom:24px;">
    <div class="section-head">Destaques do Período</div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:0 14px;">
      ${highlightsHtml}
    </div>
  </section>

  <!-- ── COST METRICS ───────────────────────────────────────────── -->
  <section style="margin-bottom:24px;">
    <div class="section-head">Custo por Resultado</div>
    <div style="display:grid;grid-template-columns:repeat(${hasBestAdset ? 4 : 3},1fr);border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
      ${hasBestAdset ? `
      <div style="padding:14px 10px;text-align:center;border-right:1px solid #e5e7eb;background:#fffbeb;">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#92400e;margin-bottom:4px;">⭐ Custo Campeão</div>
        <div style="font-size:18px;font-weight:800;color:#b45309;">${fmt(data.bestAdsetCpa)}</div>
        ${data.bestAdsetName ? `<div style="font-size:8px;color:#a16207;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${data.bestAdsetName.slice(0, 26)}</div>` : ""}
      </div>` : ""}
      <div style="padding:14px 10px;text-align:center;${hasBestAdset ? "border-right:1px solid #e5e7eb;" : "border-right:1px solid #e5e7eb;"}">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:4px;">C. Médio/Mensagem</div>
        <div style="font-size:18px;font-weight:800;color:#111827;">${safeVal(data.costPerMessage)}</div>
      </div>
      <div style="padding:14px 10px;text-align:center;border-right:1px solid #e5e7eb;">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:4px;">C. por Clique</div>
        <div style="font-size:18px;font-weight:800;color:#111827;">${safeVal(data.costPerClick)}</div>
      </div>
      <div style="padding:14px 10px;text-align:center;">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:4px;">CPM</div>
        <div style="font-size:18px;font-weight:800;color:#111827;">${safeVal(data.cpm)}</div>
      </div>
    </div>
  </section>

  ${campaignRows ? `
  <!-- ── CAMPAIGN TABLE ─────────────────────────────────────────── -->
  <section style="margin-bottom:24px;">
    <div class="section-head">Desempenho por Campanha</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;font-family:'Inter',sans-serif;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 10px;text-align:left;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Campanha</th>
          <th style="padding:8px 10px;text-align:right;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Investimento</th>
          <th style="padding:8px 10px;text-align:right;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Impressões</th>
          <th style="padding:8px 10px;text-align:right;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Cliques</th>
          <th style="padding:8px 10px;text-align:right;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#0d4af5;border-bottom:1px solid #e5e7eb;">Mensagens</th>
          <th style="padding:8px 10px;text-align:right;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:1px solid #e5e7eb;">C./Msg</th>
        </tr>
      </thead>
      <tbody>
        ${campaignRows}
      </tbody>
    </table>
  </section>
  ` : ""}

  ${videoHtml}
  ${demoHtml}

  ${data.observations ? `
  <!-- ── OBSERVATIONS ──────────────────────────────────────────── -->
  <section style="margin-bottom:24px;">
    <div class="section-head">Observações do Gestor</div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:12px 14px;">
      <p style="font-size:11px;line-height:1.7;color:#374151;">${data.observations.replace(/\n/g, "<br/>")}</p>
    </div>
  </section>
  ` : ""}

  <!-- ── GLOSSARY ───────────────────────────────────────────────── -->
  <section style="margin-bottom:20px;">
    <div class="section-head">Tira Dúvidas</div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;">
      ${[
        ["CPA", "Custo por aquisição"],
        ["CPC", "Custo por clique"],
        ["CPM", "Custo por mil impressões"],
        ["CTR", "% de cliques sobre visualizações"],
        ["Impressões", "Vezes que os anúncios foram vistos"],
        ["Alcance", "Pessoas únicas alcançadas"],
        ["Mensagens", "Conversas iniciadas via WhatsApp/Messenger"],
        ["Frequência", "Média de exibições por pessoa"],
      ].map(([k, v]) => `
        <div style="padding:4px 0;border-bottom:1px solid #f3f4f6;">
          <span style="font-size:9px;font-weight:700;color:#0d4af5;">${k}</span>
          <span style="font-size:9px;color:#6b7280;"> — ${v}</span>
        </div>`).join("")}
    </div>
  </section>

  <!-- ── DISCLAIMER ─────────────────────────────────────────────── -->
  <div style="padding:8px 12px;background:#f9fafb;border-left:3px solid #0d4af5;border-radius:4px;margin-bottom:20px;">
    <p style="font-size:8px;color:#6b7280;line-height:1.6;">
      <strong style="color:#0d4af5;">Nota:</strong>
      Valores extraídos da API do Meta Ads. Pode haver variação de até 15% em relação ao Gerenciador de Anúncios
      devido a janelas de atribuição e delays de processamento.
    </p>
  </div>

  <!-- ── FOOTER ─────────────────────────────────────────────────── -->
  <footer style="display:flex;align-items:center;justify-content:space-between;padding-top:16px;border-top:1px solid #e5e7eb;">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:32px;height:32px;background:#000;border-radius:7px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${logoUrl}" alt="Lone" style="width:24px;height:24px;object-fit:contain;"/>
      </div>
      <div>
        <div style="font-size:12px;font-weight:800;color:#111827;">LONE MÍDIA</div>
        <div style="font-size:8px;color:#0d4af5;text-transform:uppercase;letter-spacing:.1em;">Assessoria &amp; Marketing</div>
      </div>
    </div>
    <div style="font-size:8px;color:#9ca3af;">Lone Mídia © 2026 — Relatório gerado via Lone OS</div>
  </footer>

</div>
</body>
</html>`;
}

export function exportTrafficReportPdf(data: TrafficReportData) {
  const html = buildTrafficReportHtml(data);
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

export function buildTrafficReportData(
  clientName: string,
  campaigns: AdCampaign[],
  periodLabel: string,
  observations?: string,
  demographics?: TrafficReportData["demographics"],
  dateRange?: { startStr: string; endStr: string },
): TrafficReportData {
  const reportCampaigns = campaigns;

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

  // Champion adset: the adset with the lowest cost-per-message across all campaigns
  const adsetCandidates = reportCampaigns
    .filter((c) => (c.cheapestAdSetCostPerMessage ?? 0) > 0)
    .map((c) => ({
      cpa: c.cheapestAdSetCostPerMessage!,
      name: c.cheapestAdSetName ?? "",
    }));
  const bestAdset = adsetCandidates.length > 0
    ? adsetCandidates.reduce((min, x) => x.cpa < min.cpa ? x : min)
    : null;

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
    bestAdsetCpa: bestAdset?.cpa,
    bestAdsetName: bestAdset?.name,
    campaigns: reportCampaigns.map((c) => ({
      name: c.name,
      objective: c.objective,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      messages: c.messages ?? 0,
      costPerMessage: (c.messages ?? 0) > 0 ? c.spend / (c.messages ?? 1) : 0,
      cheapestAdSetCostPerMessage: c.cheapestAdSetCostPerMessage,
      cheapestAdSetName: c.cheapestAdSetName,
      cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
      status: c.status,
    })),
    demographics,
    observations,
  };
}
