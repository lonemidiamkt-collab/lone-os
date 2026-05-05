import type { AdCampaign } from "@/lib/types";

export interface TrafficReportData {
  clientName: string;
  period: string;
  periodDays?: number;
  reach: number;
  impressions: number;
  clicks: number;
  messages: number;
  spend: number;
  costPerMessage: number;
  costPerClick: number;
  cpm: number;
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
  return `R$&nbsp;${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (v: number | undefined | null) => (v ?? 0).toLocaleString("pt-BR");
const safeVal = (v: number | undefined | null) =>
  !v || v === 0 ? "—" : fmt(v);
const pad2 = (n: number) => String(n).padStart(2, "0");

export function buildTrafficReportHtml(data: TrafficReportData): string {
  const logoUrl = `${window.location.origin}/logo.png`;
  const isCompact = (data.periodDays ?? 30) <= 7;

  const hasBestAdset = !!(data.bestAdsetCpa && data.bestAdsetCpa > 0);
  const hasVideo = !isCompact && !!(data.videoViews25 && data.videoViews25 > 0);
  const hasDemographics = !isCompact && !!(data.demographics && data.demographics.ageRanges.length > 0);

  // ── KPI rows (numbered, like "cenas") ───────────────────────────────────
  const kpiItems: { label: string; value: string; sub?: string; champion?: boolean }[] = [
    { label: "Alcance", value: fmtNum(data.reach) + " pessoas" },
    { label: "Impressões", value: fmtNum(data.impressions) },
    { label: "Cliques no link", value: fmtNum(data.clicks) },
    { label: "Mensagens iniciadas", value: fmtNum(data.messages) },
    { label: "Investimento total", value: fmt(data.spend) },
    { label: "Custo médio por mensagem", value: safeVal(data.costPerMessage) },
  ];
  if (hasBestAdset) {
    kpiItems.push({
      label: "Custo Campeão — melhor conjunto",
      value: fmt(data.bestAdsetCpa),
      sub: data.bestAdsetName ?? undefined,
      champion: true,
    });
  }

  const kpiRows = kpiItems.map((item, i) => `
    <div style="display:flex;align-items:flex-start;gap:0;${item.champion ? "border-left:3px solid #0d4af5;" : "border-left:3px solid transparent;"}${i < kpiItems.length - 1 ? "border-bottom:1px solid #1a1a2e;" : ""}">
      <div style="min-width:52px;padding:14px 12px;font-size:11px;font-weight:800;color:#3b6ff5;flex-shrink:0;">${pad2(i + 1)}</div>
      <div style="flex:1;padding:14px 0;border-left:1px solid #1a1a2e;">
        <div style="padding-left:16px;">
          <span style="font-size:11px;color:#a1a1aa;">${item.label}</span>
          <span style="font-size:11px;color:#1a1a2e;"> · </span>
          <span style="font-size:13px;font-weight:700;color:${item.champion ? "#3b6ff5" : "#ffffff"};">${item.value}</span>
          ${item.sub ? `<div style="font-size:9px;color:#52525b;margin-top:2px;">${item.sub}</div>` : ""}
        </div>
      </div>
    </div>`).join("");

  // ── Campaign rows ────────────────────────────────────────────────────────
  const activeCampaigns = data.campaigns
    .filter((c) => c.status === "active")
    .sort((a, b) => (b.messages ?? 0) - (a.messages ?? 0));

  const isCampaignChampion = (c: typeof activeCampaigns[number]) =>
    hasBestAdset &&
    (c.cheapestAdSetCostPerMessage ?? 0) > 0 &&
    Math.abs((c.cheapestAdSetCostPerMessage ?? 0) - (data.bestAdsetCpa ?? 0)) < 0.01;

  const campRows = activeCampaigns.map((c, i) => {
    const isChamp = isCampaignChampion(c);
    const isLast = i === activeCampaigns.length - 1;
    return `
    <div style="display:flex;align-items:flex-start;gap:0;${isChamp ? "border-left:3px solid #0d4af5;" : "border-left:3px solid transparent;"}${!isLast ? "border-bottom:1px solid #1a1a2e;" : ""}">
      <div style="min-width:52px;padding:12px;font-size:11px;font-weight:800;color:#3b6ff5;flex-shrink:0;">${pad2(i + 1)}</div>
      <div style="flex:1;padding:12px 0 12px 16px;border-left:1px solid #1a1a2e;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <span style="font-size:11px;font-weight:${isChamp ? "700" : "500"};color:#e4e4e7;">${c.name}</span>
            ${isChamp ? `<span style="display:inline-block;background:#0d4af5;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:3px;margin-left:6px;vertical-align:middle;letter-spacing:.04em;">CAMPEÃO</span>` : ""}
            ${c.cheapestAdSetName ? `<div style="font-size:9px;color:#52525b;margin-top:2px;">↳ ${c.cheapestAdSetName}${c.cheapestAdSetCostPerMessage ? ` · ${fmt(c.cheapestAdSetCostPerMessage)}/msg` : ""}</div>` : ""}
          </div>
          <div style="display:flex;gap:16px;flex-shrink:0;">
            <div style="text-align:right;">
              <div style="font-size:8px;color:#52525b;text-transform:uppercase;letter-spacing:.06em;">Invest.</div>
              <div style="font-size:11px;font-weight:600;color:#a1a1aa;">${fmt(c.spend)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:8px;color:#52525b;text-transform:uppercase;letter-spacing:.06em;">Mensagens</div>
              <div style="font-size:11px;font-weight:700;color:#3b6ff5;">${fmtNum(c.messages)}</div>
            </div>
            <div style="text-align:right;padding-right:12px;">
              <div style="font-size:8px;color:#52525b;text-transform:uppercase;letter-spacing:.06em;">C./Msg</div>
              <div style="font-size:11px;font-weight:600;color:${isChamp ? "#3b6ff5" : "#a1a1aa"};">${c.messages > 0 ? fmt(c.costPerMessage) : "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");

  // ── Demographics ─────────────────────────────────────────────────────────
  const maxAgePct = hasDemographics ? Math.max(...data.demographics!.ageRanges.map((a) => a.percentage)) : 0;
  const demoHtml = hasDemographics ? (() => {
    const d = data.demographics!;
    const circumference = 2 * Math.PI * 46;
    const wArc = (d.genderSplit.women / 100) * circumference;
    const ageBars = d.ageRanges.map((a, i) => `
      <div style="display:flex;align-items:flex-start;gap:0;${i < d.ageRanges.length - 1 ? "border-bottom:1px solid #1a1a2e;" : ""}border-left:3px solid transparent;">
        <div style="min-width:52px;padding:10px 12px;font-size:11px;font-weight:800;color:#3b6ff5;">${pad2(i + 1)}</div>
        <div style="flex:1;padding:10px 16px;border-left:1px solid #1a1a2e;display:flex;align-items:center;gap:10px;">
          <span style="width:36px;font-size:10px;color:#a1a1aa;flex-shrink:0;">${a.range}</span>
          <div style="flex:1;height:12px;background:#0f0f14;border-radius:3px;overflow:hidden;">
            <div style="width:${Math.max((a.percentage / maxAgePct) * 100, 5)}%;height:100%;background:linear-gradient(90deg,#0d4af5,#3b6ff7);border-radius:3px;"></div>
          </div>
          <span style="font-size:10px;font-weight:700;color:#e4e4e7;width:36px;text-align:right;">${a.percentage.toFixed(1)}%</span>
        </div>
      </div>`).join("");
    return `
    <section style="margin-bottom:24px;">
      <div class="sec-label">Público — Dados Demográficos</div>
      <div class="sec-title">Faixa Etária</div>
      <div class="table-block">${ageBars}</div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:16px;padding:12px 16px;background:#0f0f14;border-radius:8px;border:1px solid #1a1a2e;">
        <div style="position:relative;width:64px;height:64px;flex-shrink:0;">
          <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg);">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#1a1a2e" stroke-width="8"/>
            <circle cx="50" cy="50" r="46" fill="none" stroke="#e84393" stroke-width="8" stroke-dasharray="${wArc} ${circumference}"/>
            <circle cx="50" cy="50" r="46" fill="none" stroke="#0d4af5" stroke-width="8" stroke-dasharray="${circumference - wArc} ${circumference}" stroke-dashoffset="-${wArc}"/>
          </svg>
        </div>
        <div style="display:flex;gap:20px;">
          <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e84393;margin-right:5px;vertical-align:middle;"></span><span style="font-size:11px;color:#e4e4e7;">${d.genderSplit.women.toFixed(1)}% Mulheres</span></div>
          <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0d4af5;margin-right:5px;vertical-align:middle;"></span><span style="font-size:11px;color:#e4e4e7;">${d.genderSplit.men.toFixed(1)}% Homens</span></div>
        </div>
      </div>
    </section>`;
  })() : "";

  // ── Video ────────────────────────────────────────────────────────────────
  const videoHtml = hasVideo ? `
    <section style="margin-bottom:24px;">
      <div class="sec-label">Reprodução de Vídeo</div>
      <div class="sec-title">Funil de Retenção</div>
      <div class="table-block">
        ${[
          { pct: "25%", val: data.videoViews25! },
          { pct: "50%", val: data.videoViews50! },
          { pct: "75%", val: data.videoViews75! },
          { pct: "95%", val: data.videoViews95! },
        ].map((r, i, arr) => `
        <div style="display:flex;align-items:center;gap:0;${i < arr.length - 1 ? "border-bottom:1px solid #1a1a2e;" : ""}border-left:3px solid transparent;">
          <div style="min-width:52px;padding:12px;font-size:11px;font-weight:800;color:#3b6ff5;">${r.pct}</div>
          <div style="flex:1;padding:12px 16px;border-left:1px solid #1a1a2e;display:flex;align-items:center;gap:10px;">
            <span style="font-size:12px;font-weight:600;color:#e4e4e7;width:60px;">${fmtNum(r.val)}</span>
            <div style="flex:1;height:10px;background:#0f0f14;border-radius:3px;overflow:hidden;">
              <div style="width:${[100, 78, 58, 38][i]}%;height:100%;background:linear-gradient(90deg,#0d4af5,#3b6ff7);border-radius:3px;"></div>
            </div>
          </div>
        </div>`).join("")}
      </div>
    </section>` : "";

  // ── Observations ─────────────────────────────────────────────────────────
  const obsHtml = data.observations ? `
    <section style="margin-bottom:24px;">
      <div class="sec-label">Observações</div>
      <div class="sec-title">Análise do Gestor</div>
      <div style="border-left:3px solid #0d4af5;padding:14px 16px;background:#0f0f14;border-radius:0 8px 8px 0;border:1px solid #1a1a2e;border-left:3px solid #0d4af5;">
        <p style="font-size:11px;line-height:1.8;color:#a1a1aa;">${data.observations.replace(/\n/g, "<br/>")}</p>
      </div>
    </section>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório de Performance — ${data.clientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:#09090b; color:#e4e4e7; }
    .page { max-width:820px; margin:0 auto; padding:0 0 40px; }
    .sec-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#3b6ff5; margin-bottom:4px; }
    .sec-title { font-size:18px; font-weight:800; color:#ffffff; margin-bottom:10px; letter-spacing:-.01em; }
    .table-block { border:1px solid #1a1a2e; border-radius:8px; overflow:hidden; }
    section { padding:0 32px; }
    @media print {
      html,body { background:#09090b !important; }
      .no-print { display:none !important; }
      .page { padding-bottom:20px; }
    }
  </style>
</head>
<body>

<div class="no-print" style="text-align:center;padding:12px;background:#0d4af5;">
  <button onclick="window.print()" style="padding:8px 28px;background:#09090b;color:#fff;border:1px solid #3b6ff5;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">
    Salvar como PDF / Imprimir
  </button>
</div>

<div class="page">

  <!-- ══ HEADER ══════════════════════════════════════════════════════════ -->
  <div style="border-top:3px solid #0d4af5;background:#09090b;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1a1a2e;margin-bottom:32px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
        <img src="${logoUrl}" alt="Lone" style="width:28px;height:28px;object-fit:contain;"/>
      </div>
      <span style="font-size:14px;font-weight:800;color:#fff;letter-spacing:-.01em;">LONE MÍDIA</span>
    </div>
    <span style="font-size:11px;color:#52525b;">Relatório de Performance — ${data.clientName}</span>
  </div>

  <!-- ══ TITLE BLOCK ═══════════════════════════════════════════════════════ -->
  <section style="margin-bottom:28px;">
    <div class="sec-label">${isCompact ? "Resultado Rápido — 7 dias" : "Relatório de Performance"}</div>
    <div style="font-size:28px;font-weight:900;letter-spacing:-.02em;margin-bottom:6px;">
      <span style="color:#ffffff;">${data.clientName}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:#52525b;margin-bottom:14px;">
      <span>${data.period}</span>
      <span>·</span>
      <span>Meta Ads</span>
      <span>·</span>
      <span>${activeCampaigns.length} campanha${activeCampaigns.length !== 1 ? "s" : ""} ativa${activeCampaigns.length !== 1 ? "s" : ""}</span>
      ${hasBestAdset ? `<span>·</span><span style="color:#3b6ff5;font-weight:600;">Custo Campeão ${fmt(data.bestAdsetCpa)}</span>` : ""}
      ${isCompact ? `<span>·</span><span style="color:#52525b;font-style:italic;">Versão compacta</span>` : ""}
    </div>
    <div style="height:2px;background:#0d4af5;border-radius:1px;"></div>
  </section>

  <!-- ══ MÉTRICAS GERAIS ════════════════════════════════════════════════ -->
  <section style="margin-bottom:28px;">
    <div class="sec-label">Métricas Gerais</div>
    <div class="sec-title">Resultados do Período</div>
    <div class="table-block">
      <div style="display:flex;padding:8px 0 8px 52px;border-bottom:1px solid #1a1a2e;background:#0f0f14;">
        <div style="flex:1;padding:0 16px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#3b6ff5;">Indicador</div>
        <div style="min-width:160px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#3b6ff5;padding-right:12px;text-align:right;">Valor</div>
      </div>
      ${kpiRows}
    </div>
  </section>

  <!-- ══ CAMPANHAS ══════════════════════════════════════════════════════ -->
  ${campRows ? `
  <section style="margin-bottom:28px;">
    <div class="sec-label">Desempenho por Campanha</div>
    <div class="sec-title">Campanhas Ativas</div>
    <div class="table-block">
      ${campRows}
    </div>
  </section>
  ` : ""}

  ${videoHtml}
  ${demoHtml}
  ${obsHtml}

  ${!isCompact ? `
  <!-- ══ GLOSSÁRIO ═════════════════════════════════════════════════════ -->
  <section style="margin-bottom:28px;">
    <div class="sec-label">Tira Dúvidas</div>
    <div class="sec-title">Glossário</div>
    <div class="table-block">
      ${[
        ["CPM", "Custo por mil impressões"],
        ["CPC", "Custo por clique no link"],
        ["C./Msg", "Custo por mensagem iniciada (WhatsApp/Messenger)"],
        ["Alcance", "Pessoas únicas que viram o anúncio"],
        ["Impressões", "Total de vezes que o anúncio foi exibido"],
        ["Frequência", "Média de exibições por pessoa"],
        ["Conjunto Campeão", "O adset com menor custo por mensagem no período"],
      ].map(([k, v], i, arr) => `
        <div style="display:flex;align-items:flex-start;gap:0;border-left:3px solid transparent;${i < arr.length - 1 ? "border-bottom:1px solid #1a1a2e;" : ""}">
          <div style="min-width:52px;padding:10px 12px;font-size:11px;font-weight:800;color:#3b6ff5;">${pad2(i + 1)}</div>
          <div style="flex:1;padding:10px 16px;border-left:1px solid #1a1a2e;">
            <span style="font-size:11px;font-weight:700;color:#e4e4e7;">${k}</span>
            <span style="font-size:11px;color:#52525b;"> — ${v}</span>
          </div>
        </div>`).join("")}
    </div>
  </section>
  ` : ""}

  <!-- ══ DISCLAIMER ════════════════════════════════════════════════════ -->
  <section style="margin-bottom:28px;">
    <div style="border-left:3px solid #0d4af5;padding:10px 14px;background:#0f0f14;border-radius:0 6px 6px 0;border:1px solid #1a1a2e;border-left:3px solid #0d4af5;">
      <p style="font-size:9px;line-height:1.7;color:#52525b;">
        <strong style="color:#3b6ff5;">Nota:</strong>
        Valores extraídos diretamente da API do Meta Ads Manager. Pode haver variação de até 15%
        em relação ao Gerenciador de Anúncios devido a janelas de atribuição e delays de processamento.
      </p>
    </div>
  </section>

  <!-- ══ FOOTER ═════════════════════════════════════════════════════════ -->
  <div style="padding:16px 32px 0;border-top:1px solid #1a1a2e;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:9px;color:#3f3f46;">Relatório — ${data.clientName} / ${data.period}</span>
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:28px;height:28px;background:#000;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${logoUrl}" alt="Lone" style="width:22px;height:22px;object-fit:contain;"/>
      </div>
      <span style="font-size:12px;font-weight:800;color:#ffffff;">LONE MÍDIA</span>
    </div>
    <span style="font-size:9px;color:#3f3f46;">Lone Mídia / Relatório de Performance</span>
  </div>

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
  periodDays?: number,
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

  const adsetCandidates = reportCampaigns
    .filter((c) => (c.cheapestAdSetCostPerMessage ?? 0) > 0)
    .map((c) => ({ cpa: c.cheapestAdSetCostPerMessage!, name: c.cheapestAdSetName ?? "" }));
  const bestAdset = adsetCandidates.length > 0
    ? adsetCandidates.reduce((min, x) => x.cpa < min.cpa ? x : min)
    : null;

  return {
    clientName,
    period: periodLabel,
    periodDays,
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
