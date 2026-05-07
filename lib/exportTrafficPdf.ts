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
  dailyMessages?: { date: string; messages: number }[];
}

const fmt = (v: number | undefined | null) => {
  const n = v ?? 0;
  return `R$&nbsp;${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (v: number | undefined | null) => (v ?? 0).toLocaleString("pt-BR");
const safeVal = (v: number | undefined | null) =>
  !v || v === 0 ? "—" : fmt(v);
const pad2 = (n: number) => String(n).padStart(2, "0");

// ── Client report chart helpers ───────────────────────────────────────────────

function svgLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cpx = ((pts[i].x + pts[i + 1].x) / 2).toFixed(1);
    d += ` C ${cpx},${pts[i].y.toFixed(1)} ${cpx},${pts[i + 1].y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function toDayLabel(dateStr: string, periodDays: number): string {
  const d = new Date(dateStr + "T12:00:00");
  if (periodDays <= 10) return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildDailyChart(daily: { date: string; messages: number }[], periodDays: number): string {
  if (daily.length < 2) return "";
  const W = 740, H = 190, padL = 34, padR = 12, padT = 32, padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = daily.length;
  const maxVal = Math.max(...daily.map(d => d.messages), 1);
  const chartMax = maxVal * 1.15;

  const pts = daily.map((d, i) => ({
    x: padL + (i / (n - 1)) * plotW,
    y: padT + (1 - d.messages / chartMax) * plotH,
    messages: d.messages,
    date: d.date,
  }));

  const peakIdx = daily.reduce((mi, d, i, a) => d.messages > a[mi].messages ? i : mi, 0);
  const peak = pts[peakIdx];

  const linePath = svgLinePath(pts);
  const areaPath = `${linePath} L ${pts[n - 1].x.toFixed(1)},${H - padB} L ${pts[0].x.toFixed(1)},${H - padB} Z`;

  const gridLines = [0.33, 0.66, 1.0].map(pct => {
    const y = (padT + (1 - pct) * plotH).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#1c1c28" stroke-width="1" stroke-dasharray="3,5"/>
      <text x="${padL - 5}" y="${(+y + 3.5).toFixed(1)}" font-size="8" fill="#3f3f46" text-anchor="end">${Math.round(maxVal * pct)}</text>`;
  }).join("");

  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const xLabels = pts.map((p, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return "";
    const isPeak = i === peakIdx;
    return `<text x="${p.x.toFixed(1)}" y="${H - padB + 18}" font-size="${isPeak ? 9 : 8.5}" fill="${isPeak ? "#4d7af7" : "#52525b"}" font-weight="${isPeak ? "700" : "400"}" text-anchor="middle">${toDayLabel(p.date, periodDays)}</text>`;
  }).join("");

  const dots = pts.map((p, i) =>
    i === peakIdx ? "" : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#3b6ff5" opacity="0.7"/>`
  ).join("");

  const cw = 70;
  const cx = Math.min(Math.max(peak.x - cw / 2, padL), W - padR - cw);
  const cy = peak.y - 34;
  const peakEl = `
    <line x1="${peak.x.toFixed(1)}" y1="${(cy + 20).toFixed(1)}" x2="${peak.x.toFixed(1)}" y2="${(peak.y - 8).toFixed(1)}" stroke="#0d4af5" stroke-width="1" stroke-dasharray="2,3" opacity="0.5"/>
    <rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${cw}" height="20" rx="10" fill="#0d4af5"/>
    <text x="${(cx + cw / 2).toFixed(1)}" y="${(cy + 13.5).toFixed(1)}" font-size="9.5" font-weight="700" fill="#fff" text-anchor="middle">${fmtNum(peak.messages)} msgs</text>
    <circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="8" fill="#09090b" stroke="#0d4af5" stroke-width="2"/>
    <circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="3.5" fill="#ffffff"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px;display:block;overflow:visible;">
  <defs>
    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d4af5" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0d4af5" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${gridLines}
  <path d="${areaPath}" fill="url(#cg)"/>
  <path d="${linePath}" fill="none" stroke="#0d4af5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  ${dots}
  ${peakEl}
  ${xLabels}
</svg>`;
}

export function buildTrafficReportHtml(data: TrafficReportData, autoPrint = false): string {
  const logoUrl = `${window.location.origin}/logo.png`;
  const isCompact = (data.periodDays ?? 30) <= 7;

  const hasBestAdset = !!(data.bestAdsetCpa && data.bestAdsetCpa > 0);
  const hasVideo = !isCompact && !!(data.videoViews25 && data.videoViews25 > 0);
  // Demographics shown for ALL period lengths — user requirement: unconditional
  const hasDemographics = !!(data.demographics && data.demographics.ageRanges.length > 0);
  const hasEvolution = !isCompact && (data.dailyMessages?.length ?? 0) >= 7;

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
    <div data-pb style="display:flex;align-items:flex-start;gap:0;${item.champion ? "border-left:3px solid #0d4af5;" : "border-left:3px solid transparent;"}${i < kpiItems.length - 1 ? "border-bottom:1px solid #1a1a2e;" : ""}">
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
    <div data-pb style="display:flex;align-items:flex-start;gap:0;${isChamp ? "border-left:3px solid #0d4af5;" : "border-left:3px solid transparent;"}${!isLast ? "border-bottom:1px solid #1a1a2e;" : ""}">
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
  const demoHtml = hasDemographics ? (() => {
    const d = data.demographics!;
    const maxAgePct = Math.max(...d.ageRanges.map((a) => a.percentage), 1);
    const r = 36;
    const circumference = 2 * Math.PI * r;
    const menArc = (d.genderSplit.men / 100) * circumference;
    const womenArc = (d.genderSplit.women / 100) * circumference;
    const ageBars = d.ageRanges.map((a) => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="width:34px;font-size:10px;color:#52525b;flex-shrink:0;font-weight:500;">${a.range}</span>
        <div style="flex:1;height:6px;background:#efefef;border-radius:3px;overflow:hidden;">
          <div style="width:${Math.max(Math.round((a.percentage / maxAgePct) * 100), 5)}%;height:100%;background:#0d4af5;border-radius:3px;"></div>
        </div>
        <span style="font-size:10px;font-weight:700;color:#1a1a2e;width:38px;text-align:right;">${a.percentage.toFixed(1)}%</span>
      </div>`).join("");
    return `
    <section data-pb style="margin-bottom:24px;">
      <div class="sec-label">Público — Dados Demográficos</div>
      <div class="sec-title">Perfil do Público</div>
      <div style="background:#ffffff;border-radius:10px;padding:20px 24px;border:1px solid #e4e4e7;">
        <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
          <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:12px;min-width:110px;">
            <div style="font-size:9px;font-weight:700;color:#52525b;letter-spacing:.06em;text-transform:uppercase;">Gênero</div>
            <div style="position:relative;width:88px;height:88px;">
              <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg);">
                <circle cx="50" cy="50" r="${r}" fill="none" stroke="#efefef" stroke-width="14"/>
                <circle cx="50" cy="50" r="${r}" fill="none" stroke="#0d4af5" stroke-width="14"
                  stroke-dasharray="${menArc.toFixed(2)} ${circumference.toFixed(2)}"/>
                <circle cx="50" cy="50" r="${r}" fill="none" stroke="#3f3f46" stroke-width="14"
                  stroke-dasharray="${womenArc.toFixed(2)} ${circumference.toFixed(2)}"
                  stroke-dashoffset="${(-menArc).toFixed(2)}"/>
              </svg>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;align-self:stretch;">
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:9px;height:9px;border-radius:50%;background:#0d4af5;flex-shrink:0;"></div>
                <span style="font-size:10px;color:#1a1a2e;flex:1;">Homens</span>
                <span style="font-size:11px;font-weight:700;color:#1a1a2e;">${d.genderSplit.men.toFixed(1)}%</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:9px;height:9px;border-radius:50%;background:#3f3f46;flex-shrink:0;"></div>
                <span style="font-size:10px;color:#1a1a2e;flex:1;">Mulheres</span>
                <span style="font-size:11px;font-weight:700;color:#1a1a2e;">${d.genderSplit.women.toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <div style="flex:1;min-width:180px;">
            <div style="font-size:9px;font-weight:700;color:#52525b;letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px;">Faixa Etária</div>
            ${ageBars}
          </div>
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
        <div data-pb style="display:flex;align-items:center;gap:0;${i < arr.length - 1 ? "border-bottom:1px solid #1a1a2e;" : ""}border-left:3px solid transparent;">
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

${autoPrint ? "" : `
<div class="no-print" style="position:sticky;top:0;z-index:999;display:flex;align-items:center;justify-content:space-between;padding:10px 24px;background:#09090b;border-bottom:1px solid #1a1a2e;">
  <span style="font-size:11px;color:#52525b;">Lone Mídia — Relatório de Performance</span>
  <button onclick="window.print()" style="display:flex;align-items:center;gap:7px;padding:7px 18px;background:#0d4af5;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.01em;">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Baixar PDF
  </button>
</div>`}

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
  ${hasEvolution ? buildWeeklyEvolutionSection(data.dailyMessages!) : ""}
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
        <div data-pb style="display:flex;align-items:flex-start;gap:0;border-left:3px solid transparent;${i < arr.length - 1 ? "border-bottom:1px solid #1a1a2e;" : ""}">
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
${autoPrint ? `<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 600); });</script>` : ""}
</body>
</html>`;
}

export async function exportTrafficReportPdf(data: TrafficReportData) {
  const { downloadAsPdf } = await import("@/lib/htmlToPdf");
  const html = buildTrafficReportHtml(data, false);
  const filename = `relatorio-${data.clientName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  await downloadAsPdf(html, filename);
}

// ── Client-facing report ──────────────────────────────────────────────────────

function buildWeeklyEvolutionSection(daily: { date: string; messages: number }[]): string {
  if (daily.length < 7) return "";
  const daysPerWeek = Math.ceil(daily.length / 4);
  const WEEK_LABELS = ["1ª Sem.", "2ª Sem.", "3ª Sem.", "4ª Sem.", "5ª Sem."];
  const weeks: { label: string; messages: number }[] = [];
  for (let i = 0; i < daily.length; i += daysPerWeek) {
    const slice = daily.slice(i, i + daysPerWeek);
    const total = slice.reduce((s, d) => s + d.messages, 0);
    weeks.push({ label: WEEK_LABELS[weeks.length] ?? `Sem. ${weeks.length + 1}`, messages: total });
  }
  const maxMsgs = Math.max(...weeks.map((w) => w.messages), 1);
  const bars = weeks.map((w) => {
    const heightPct = Math.max(Math.round((w.messages / maxMsgs) * 100), 4);
    const isBest = w.messages === maxMsgs;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;">
      <div style="font-size:9px;font-weight:${isBest ? "700" : "500"};color:${isBest ? "#e4e4e7" : "#71717a"};">${fmtNum(w.messages)}</div>
      <div style="width:100%;height:64px;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${heightPct}%;background:${isBest ? "linear-gradient(180deg,#0d4af5,#1a5fff)" : "#1c1c28"};border-radius:4px 4px 0 0;min-height:4px;"></div>
      </div>
      <div style="font-size:9px;color:#52525b;white-space:nowrap;">${w.label}</div>
    </div>`;
  }).join("");
  return `
<div data-pb style="padding:0 32px;margin-bottom:20px;">
  <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:10px;">
    <div>
      <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3b6ff5;">Crescimento</div>
      <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-.01em;">Evolução Semanal</div>
    </div>
    <div style="font-size:9px;color:#52525b;">${weeks.length} semanas · ${daily.length} dias</div>
  </div>
  <div style="background:#0a0a0d;border:1px solid #1a1a2e;border-radius:10px;padding:16px 12px 10px;">
    <div style="display:flex;gap:6px;align-items:flex-end;">${bars}</div>
  </div>
</div>`;
}

function buildClientDemographicsSection(demographics: TrafficReportData["demographics"]): string {
  if (!demographics || demographics.ageRanges.length === 0) return "";
  const d = demographics;
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const menArc = (d.genderSplit.men / 100) * circumference;
  const womenArc = (d.genderSplit.women / 100) * circumference;
  const maxAgePct = Math.max(...d.ageRanges.map((a) => a.percentage), 1);
  const ageBars = d.ageRanges.map((a) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">
      <span style="width:34px;font-size:10px;color:#52525b;flex-shrink:0;font-weight:500;">${a.range}</span>
      <div style="flex:1;height:6px;background:#efefef;border-radius:3px;overflow:hidden;">
        <div style="width:${Math.max(Math.round((a.percentage / maxAgePct) * 100), 5)}%;height:100%;background:#0d4af5;border-radius:3px;"></div>
      </div>
      <span style="font-size:10px;font-weight:700;color:#1a1a2e;width:38px;text-align:right;">${a.percentage.toFixed(1)}%</span>
    </div>`).join("");
  return `
<div data-pb style="padding:0 32px;margin-bottom:20px;">
  <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3b6ff5;margin-bottom:6px;">Público Alcançado</div>
  <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-.01em;margin-bottom:12px;">Dados Demográficos</div>
  <div style="background:#ffffff;border-radius:12px;padding:20px 24px;border:1px solid #e4e4e7;">
    <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap;">
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:12px;min-width:110px;">
        <div style="font-size:9px;font-weight:700;color:#52525b;letter-spacing:.06em;text-transform:uppercase;">Gênero</div>
        <div style="position:relative;width:88px;height:88px;">
          <svg viewBox="0 0 100 100" style="width:100%;height:100%;transform:rotate(-90deg);">
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="#efefef" stroke-width="14"/>
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="#0d4af5" stroke-width="14"
              stroke-dasharray="${menArc.toFixed(2)} ${circumference.toFixed(2)}"/>
            <circle cx="50" cy="50" r="${r}" fill="none" stroke="#3f3f46" stroke-width="14"
              stroke-dasharray="${womenArc.toFixed(2)} ${circumference.toFixed(2)}"
              stroke-dashoffset="${(-menArc).toFixed(2)}"/>
          </svg>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-self:stretch;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:9px;height:9px;border-radius:50%;background:#0d4af5;flex-shrink:0;"></div>
            <span style="font-size:10px;color:#1a1a2e;flex:1;">Homens</span>
            <span style="font-size:11px;font-weight:700;color:#1a1a2e;">${d.genderSplit.men.toFixed(1)}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:9px;height:9px;border-radius:50%;background:#3f3f46;flex-shrink:0;"></div>
            <span style="font-size:10px;color:#1a1a2e;flex:1;">Mulheres</span>
            <span style="font-size:11px;font-weight:700;color:#1a1a2e;">${d.genderSplit.women.toFixed(1)}%</span>
          </div>
        </div>
      </div>
      <div style="flex:1;min-width:180px;">
        <div style="font-size:9px;font-weight:700;color:#52525b;letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px;">Faixa Etária</div>
        ${ageBars}
      </div>
    </div>
  </div>
</div>`;
}

export function buildClientReportHtml(data: TrafficReportData, autoPrint = false): string {
  const logoUrl = `${window.location.origin}/logo.png`;
  const daily = data.dailyMessages ?? [];
  const hasChart = daily.length >= 2;
  const periodDays = data.periodDays ?? 30;
  const hasBestAdset = !!(data.bestAdsetCpa && data.bestAdsetCpa > 0);

  const chart = hasChart ? buildDailyChart(daily, periodDays) : "";

  const peakDay = daily.length > 0
    ? daily.reduce((m, d) => d.messages > m.messages ? d : m, daily[0])
    : null;
  const peakLabel = peakDay ? toDayLabel(peakDay.date, periodDays) : null;

  const periodTitle = periodDays <= 7 ? "Resultado Semanal"
    : periodDays <= 31 ? "Resultado Mensal"
    : `Resultado — ${periodDays} dias`;

  const actionBar = autoPrint ? "" : `
<div class="no-print" style="position:sticky;top:0;z-index:999;display:flex;align-items:center;justify-content:space-between;padding:10px 24px;background:#09090b;border-bottom:1px solid #1a1a2e;">
  <span style="font-size:11px;color:#52525b;">Lone Mídia — Relatório do Cliente</span>
  <button onclick="window.print()" style="display:flex;align-items:center;gap:7px;padding:7px 18px;background:#0d4af5;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Baixar PDF
  </button>
</div>`;

  const kpis = [
    { label: "Mensagens recebidas", value: fmtNum(data.messages), accent: true },
    { label: "Investimento", value: fmt(data.spend), accent: false },
    { label: "Custo por conversa", value: safeVal(data.costPerMessage), accent: false },
    { label: "Pessoas alcançadas", value: fmtNum(data.reach), accent: false },
  ];

  const kpiCards = kpis.map(k => `
    <div style="flex:1;background:#0d0d10;border:1px solid ${k.accent ? "#0d4af5" : "#1a1a2e"};border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;color:#52525b;margin-bottom:7px;line-height:1.3;">${k.label}</div>
      <div style="font-size:${k.accent ? "26px" : "20px"};font-weight:${k.accent ? "900" : "800"};color:${k.accent ? "#fff" : "#d4d4d8"};letter-spacing:-.02em;line-height:1;">${k.value}</div>
    </div>`).join("");

  const summaryRows = [
    ["Cliques no link", fmtNum(data.clicks)],
    ["Total de impressões", fmtNum(data.impressions)],
    ...(peakDay ? [["Pico de mensagens", `${fmtNum(peakDay.messages)} (${peakLabel})`]] : []),
  ].map(([label, value]) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a1a2e;">
      <span style="font-size:10px;color:#52525b;">${label}</span>
      <span style="font-size:11px;font-weight:600;color:#a1a1aa;">${value}</span>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório — ${data.clientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:#09090b; color:#e4e4e7; }
    .page { max-width:820px; margin:0 auto; padding-bottom:32px; }
    @media print {
      html, body { background:#09090b !important; }
      .no-print { display:none !important; }
      @page { margin:0; size:A4; }
    }
  </style>
</head>
<body>
${actionBar}
<div class="page">

  <!-- HEADER -->
  <div style="border-top:3px solid #0d4af5;padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1a1a2e;">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:28px;height:28px;background:#000;border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        <img src="${logoUrl}" style="width:22px;height:22px;object-fit:contain;" alt=""/>
      </div>
      <span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:-.01em;">LONE MÍDIA</span>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;font-weight:600;color:#a1a1aa;">${data.clientName}</div>
      <div style="font-size:9px;color:#52525b;margin-top:1px;">${data.period}</div>
    </div>
  </div>

  <!-- HERO -->
  <div style="padding:22px 32px 0;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#3b6ff5;margin-bottom:5px;">${periodTitle}</div>
    <div style="font-size:28px;font-weight:900;letter-spacing:-.025em;color:#fff;line-height:1;">${data.clientName}</div>
    <div style="font-size:11px;color:#52525b;margin-top:4px;">Resultado dos seus anúncios no período selecionado</div>
  </div>

  <div style="margin:16px 32px;height:2px;background:linear-gradient(90deg,#0d4af5 0%,#1a1a2e 65%);border-radius:1px;"></div>

  <!-- KPIs -->
  <div style="padding:0 32px;display:flex;gap:10px;margin-bottom:20px;">
    ${kpiCards}
  </div>

  <!-- CHART -->
  ${hasChart ? `
  <div style="padding:0 32px;margin-bottom:20px;">
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:10px;">
      <div>
        <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3b6ff5;">Evolução</div>
        <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-.01em;">Mensagens por Dia</div>
      </div>
      ${peakDay ? `
      <div style="display:flex;align-items:center;gap:6px;background:#0d4af515;border:1px solid #0d4af530;border-radius:20px;padding:5px 12px;margin-bottom:2px;">
        <div style="width:6px;height:6px;border-radius:50%;background:#0d4af5;flex-shrink:0;"></div>
        <span style="font-size:10px;color:#71717a;">Pico: <strong style="color:#e4e4e7;">${peakLabel} · ${fmtNum(peakDay.messages)} mensagens</strong></span>
      </div>` : ""}
    </div>
    <div style="background:#0a0a0d;border:1px solid #1a1a2e;border-radius:10px;padding:16px 10px 4px;overflow:hidden;">
      ${chart}
    </div>
  </div>` : ""}

  <!-- WEEKLY EVOLUTION (for periods >= 14 days) -->
  ${periodDays >= 14 ? buildWeeklyEvolutionSection(daily) : ""}

  <!-- CHAMPION + SUMMARY -->
  <div data-pb style="padding:0 32px;display:flex;gap:12px;margin-bottom:20px;">
    ${hasBestAdset ? `
    <div style="flex:1;background:#0d0d10;border:1px solid #1a1a2e;border-radius:10px;padding:14px 16px;display:flex;align-items:flex-start;gap:10px;">
      <div style="width:32px;height:32px;background:#0d4af515;border:1px solid #0d4af530;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0d4af5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
      </div>
      <div style="min-width:0;flex:1;">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3b6ff5;margin-bottom:4px;">Conjunto com Melhor Resultado</div>
        <div style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;">${data.bestAdsetName ?? "—"}</div>
        <div style="font-size:11px;color:#71717a;">${fmt(data.bestAdsetCpa)} por conversa</div>
      </div>
    </div>` : ""}
    <div style="flex:1;background:#0d0d10;border:1px solid #1a1a2e;border-radius:10px;padding:14px 16px;">
      <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#3b6ff5;margin-bottom:10px;">Resumo do Período</div>
      ${summaryRows}
    </div>
  </div>

  <!-- DEMOGRAPHICS -->
  ${buildClientDemographicsSection(data.demographics)}

  <!-- FOOTER -->
  <div style="margin:0 32px;padding-top:12px;border-top:1px solid #1a1a2e;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:9px;color:#3f3f46;">Gerado via Lone OS · lonemidia.com</span>
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="width:20px;height:20px;background:#000;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <img src="${logoUrl}" style="width:16px;height:16px;object-fit:contain;" alt=""/>
      </div>
      <span style="font-size:10px;font-weight:800;color:#fff;letter-spacing:-.01em;">LONE MÍDIA</span>
    </div>
    <span style="font-size:9px;color:#3f3f46;">${data.clientName} · ${data.period}</span>
  </div>

</div>
${autoPrint ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},600);});</script>` : ""}
</body>
</html>`;
}

export async function exportClientReportPdf(data: TrafficReportData) {
  const { downloadAsPdf } = await import("@/lib/htmlToPdf");
  const html = buildClientReportHtml(data, false);
  const filename = `resultado-${data.clientName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  await downloadAsPdf(html, filename);
}

export async function exportAllTrafficReportsZip(
  reports: { clientName: string; data: TrafficReportData }[],
  onProgress?: (current: number, total: number, clientName: string) => void,
) {
  const [{ default: JSZip }, { htmlToPdfBlob }] = await Promise.all([
    import("jszip"),
    import("@/lib/htmlToPdf"),
  ]);
  const zip = new JSZip();
  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    onProgress?.(i + 1, reports.length, report.clientName);
    try {
      const html = buildClientReportHtml(report.data);
      const pdfBlob = await htmlToPdfBlob(html);
      const fileName = `relatorio-${report.clientName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      zip.file(fileName, pdfBlob);
    } catch (err) {
      console.error(`[ZIP] Erro ao gerar PDF de ${report.clientName}:`, err);
    }
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

  // Aggregate daily messages across all campaigns for the chart
  const allDates = new Set<string>();
  reportCampaigns.forEach(c => (c.dailyMetrics ?? []).forEach(d => allDates.add(d.date)));
  const sortedDates = Array.from(allDates).sort();
  const chartDates = dateRange
    ? sortedDates.filter(d => d >= dateRange.startStr && d <= dateRange.endStr)
    : sortedDates;
  const dailyMessages = chartDates.map(date => ({
    date,
    messages: reportCampaigns.reduce((sum, c) => {
      const dm = (c.dailyMetrics ?? []).find(d => d.date === date);
      return sum + (dm?.messages ?? 0);
    }, 0),
  }));

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
    dailyMessages,
  };
}
