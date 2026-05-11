// Portal público de resultados — /relatorio/[token]
// Server Component: todos os cálculos (SVG, donut, barras) feitos no servidor.
// TODO: substituir MOCK_DATA pela busca real no Supabase via token.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Relatório — Lone Mídia",
  robots: { index: false, follow: false },
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface KpiEntry {
  value: string;
  delta_pct: number;
  direction: "positive" | "negative" | "neutral";
}

interface ReportData {
  client: { name: string; segment: string; whatsapp_team: string };
  period: { label: string };
  generated_at: string;
  next_update: string;
  manager_message: string | null;
  kpis: { messages: KpiEntry; spend: KpiEntry; cpa: KpiEntry; reach: KpiEntry };
  chart: { days: string[]; values: number[]; peak_index: number; peak_label: string };
  winning_set: { name: string; cpa: string; performance: "good" | "warn" | "bad" };
  summary: { clicks: string; impressions: string; peak_messages: string };
  gender: { female_pct: number; male_pct: number };
  age_ranges: { label: string; pct: number }[];
}

// ─── Dados mockados ────────────────────────────────────────────────────────────
// Quando a integração real for feita, esta constante será substituída pela
// resposta do Supabase usando `token` como chave.

const MOCK_DATA: ReportData = {
  client: {
    name: "Calábria Decorações",
    segment: "Decoração",
    whatsapp_team: "+5521999999999",
  },
  period: { label: "04/05/2026 – 10/05/2026" },
  generated_at: "11/05/2026 às 06:00 BRT",
  next_update: "18/05/2026 às 06:00 BRT",
  manager_message: null,
  kpis: {
    messages: { value: "142",       delta_pct: 18,  direction: "positive" },
    spend:    { value: "R$ 612,00", delta_pct: 5,   direction: "neutral"  },
    cpa:      { value: "R$ 4,31",   delta_pct: -12, direction: "positive" },
    reach:    { value: "38.247",    delta_pct: 22,  direction: "positive" },
  },
  chart: {
    days:       ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    values:     [14, 22, 31, 24, 18, 20, 13],
    peak_index: 2,
    peak_label: "Ter",
  },
  winning_set: {
    name:        "Açaí · Lojistas Maricá+RDO",
    cpa:         "R$ 3,87",
    performance: "good",
  },
  summary: {
    clicks:        "1.864",
    impressions:   "94.713",
    peak_messages: "31 (Ter)",
  },
  gender:     { female_pct: 54.2, male_pct: 45.8 },
  age_ranges: [
    { label: "18-24",   pct: 8.2  },
    { label: "25-34",   pct: 28.7 },
    { label: "35-44",   pct: 24.5 },
    { label: "45-54",   pct: 19.1 },
    { label: "55-64",   pct: 11.4 },
    { label: "65+",     pct: 7.1  },
    { label: "Unknown", pct: 1.0  },
  ],
};

// ─── Helpers de cálculo (server-side) ─────────────────────────────────────────

function toY(v: number, dataMax: number, yTop = 40, yBottom = 220): number {
  return yBottom - (v / dataMax) * (yBottom - yTop);
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2);
    const cp1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2);
    const cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2);
    const cp2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function deltaColor(direction: KpiEntry["direction"]): string {
  if (direction === "positive") return "#22C55E";
  if (direction === "negative") return "#EF4444";
  return "#6B7280";
}

function deltaArrow(pct: number): string {
  return pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
}

function perfColor(p: ReportData["winning_set"]["performance"]): string {
  if (p === "good") return "#22C55E";
  if (p === "warn") return "#EAB308";
  return "#EF4444";
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function Chart({ chart }: { chart: ReportData["chart"] }) {
  const XS: number[] = [110, 220, 330, 440, 550, 660, 770];
  const dataMax = Math.max(30, ...chart.values);
  const pts = chart.values.map((v, i) => [XS[i], toY(v, dataMax)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1][0]} 220 L ${pts[0][0]} 220 Z`;
  const [px, py] = pts[chart.peak_index];

  return (
    <svg
      viewBox="0 0 800 280"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%", display: "block" }}
      role="img"
      aria-label="Gráfico de mensagens por dia da semana"
    >
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#2B3CFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#2B3CFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grade */}
      {[40, 100, 160, 220].map((y) => (
        <line key={y} x1="84" y1={y} x2="790" y2={y}
              stroke="#1A1F33" strokeWidth="1" strokeDasharray="3,5" />
      ))}

      {/* Rótulos Y */}
      {[["30", 43], ["20", 103], ["10", 163]].map(([lbl, y]) => (
        <text key={lbl} x="76" y={y} fill="#6B7280" fontSize="11"
              textAnchor="end" dominantBaseline="middle">{lbl}</text>
      ))}

      {/* Área + curva */}
      <path d={area} fill="url(#ag)" stroke="none" />
      <path d={line} fill="none" stroke="#2B3CFF"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Pontos */}
      {pts.map(([x, y], i) =>
        i === chart.peak_index
          ? <circle key={i} cx={x} cy={y} r="6" fill="white" stroke="#2B3CFF" strokeWidth="3" />
          : <circle key={i} cx={x} cy={y} r="4" fill="#2B3CFF" />
      )}

      {/* Tooltip do pico */}
      <rect x={px - 30} y={py - 36} width="60" height="22" rx="11" fill="#2B3CFF" />
      <text x={px} y={py - 21} fill="white" fontSize="11" fontWeight="700"
            textAnchor="middle" dominantBaseline="middle">
        {chart.values[chart.peak_index]} msgs
      </text>

      {/* Labels X */}
      {chart.days.map((day, i) => (
        <text key={i} x={XS[i]} y="252"
              fill={i === chart.peak_index ? "#2B3CFF" : "#8b91a1"}
              fontSize="12"
              fontWeight={i === chart.peak_index ? "700" : "400"}
              textAnchor="middle">
          {day}
        </text>
      ))}
    </svg>
  );
}

function Donut({ female_pct, male_pct }: ReportData["gender"]) {
  const R    = 55;
  const circ = 2 * Math.PI * R;
  const arc  = (female_pct / 100) * circ;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width="120" height="120" viewBox="0 0 140 140"
           role="img" aria-label="Distribuição por gênero">
        <title>Distribuição por gênero</title>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#2D3445" strokeWidth="22" />
        <circle cx="70" cy="70" r={R} fill="none" stroke="#2B3CFF" strokeWidth="22"
                transform="rotate(-90 70 70)"
                strokeDasharray={`${arc.toFixed(1)} ${circ.toFixed(1)}`} />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { color: "#2B3CFF", label: "Mulheres", pct: female_pct },
          { color: "#2D3445", label: "Homens",   pct: male_pct   },
        ].map(({ color, label, pct }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} aria-hidden="true" />
            <span style={{ color: "#6B7280", flex: 1 }}>{label}</span>
            <span style={{ fontWeight: 700, color: "#0B0E1E" }}>{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgeBars({ ranges }: { ranges: ReportData["age_ranges"] }) {
  const maxPct = Math.max(...ranges.map((a) => a.pct));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {ranges.map(({ label, pct }) => {
        const w = ((pct / maxPct) * 96).toFixed(1);
        return (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "56px 1fr 44px", alignItems: "center", gap: 10, fontSize: 12 }}>
            <span style={{ color: "#6B7280" }}>{label}</span>
            <div style={{ background: "#EDEFF3", height: 8, borderRadius: 6, overflow: "hidden" }} aria-hidden="true">
              <div style={{ width: `${w}%`, height: "100%", borderRadius: 6, background: "#2B3CFF" }} />
            </div>
            <span style={{ fontWeight: 700, textAlign: "right", color: "#0B0E1E" }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function RelatorioPub({ params }: { params: { token: string } }) {
  // TODO: const data = await fetchReportByToken(params.token)
  // TODO: if (!data) notFound()
  void params.token;
  const D = MOCK_DATA;

  const kpiDefs: { key: keyof ReportData["kpis"]; label: string; first?: boolean }[] = [
    { key: "messages", label: "Mensagens recebidas", first: true },
    { key: "spend",    label: "Investimento" },
    { key: "cpa",      label: "Custo por conversa" },
    { key: "reach",    label: "Pessoas alcançadas" },
  ];

  const waText = encodeURIComponent(
    `Olá! Sou ${D.client.name} e gostaria de falar sobre meu relatório.`
  );
  const waHref = `https://wa.me/${D.client.whatsapp_team.replace(/\D/g, "")}?text=${waText}`;

  return (
    <>
      <style>{`
        /* ── Reset & base ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .rp-root {
          height: 100vh; overflow: hidden;
          background: #060814; color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-size: 14px; line-height: 1.4;
          display: flex; flex-direction: column;
        }
        /* ── Header ── */
        .rp-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 28px; height: 60px; flex-shrink: 0;
          border-bottom: 1px solid #1A1F33;
        }
        .rp-logo { display: flex; align-items: center; gap: 10px; }
        .rp-logo-icon {
          width: 42px; height: 42px; background: #2B3CFF; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 900; font-style: italic; color: #fff; flex-shrink: 0;
        }
        .rp-logo-name { font-size: 14px; font-weight: 800; letter-spacing: 2.5px; }
        .rp-hdr-client { text-align: right; }
        .rp-hdr-name   { font-size: 13px; font-weight: 700; }
        .rp-hdr-period { font-size: 11px; color: #6B7280; margin-top: 2px; }
        /* ── Hero ── */
        .rp-hero {
          display: flex; align-items: center; justify-content: space-between;
          padding: 13px 28px; border-bottom: 1px solid #1A1F33;
          flex-shrink: 0; gap: 24px;
        }
        .rp-label-blue {
          font-size: 11px; font-weight: 700; letter-spacing: 2px;
          color: #2B3CFF; text-transform: uppercase; margin-bottom: 3px;
        }
        .rp-hero-title {
          font-size: 36px; font-weight: 800; letter-spacing: -1px;
          line-height: 1.1; margin-bottom: 3px;
        }
        .rp-hero-sub  { font-size: 13px; color: #8b91a1; }
        .rp-hero-msg  { font-size: 13px; color: #8b91a1; font-style: italic; margin-top: 4px; }
        /* ── KPIs ── */
        .rp-kpi-row { display: flex; gap: 10px; flex-shrink: 0; }
        .rp-kpi {
          background: #0B0E1E; border: 1px solid #1A1F33;
          border-radius: 9px; padding: 11px 15px; min-width: 142px;
        }
        .rp-kpi.first { border-left: 3px solid #2B3CFF; }
        .rp-kpi-lbl   { font-size: 10px; color: #8b91a1; margin-bottom: 3px; }
        .rp-kpi-val   { font-size: 21px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
        .rp-kpi-delta { font-size: 10px; margin-top: 3px; display: flex; align-items: center; gap: 3px; }
        .rp-kpi-num   { font-weight: 700; }
        .rp-kpi-aux   { color: #6B7280; }
        /* ── Grid ── */
        .rp-grid {
          display: grid; grid-template-columns: 1.55fr 1fr;
          gap: 18px; padding: 13px 28px;
          flex: 1; min-height: 0; overflow: hidden;
        }
        .rp-col-l {
          display: flex; flex-direction: column;
          gap: 10px; min-height: 0; overflow: hidden;
        }
        .rp-col-r {
          display: flex; flex-direction: column;
          gap: 10px; min-height: 0; overflow: hidden;
        }
        /* ── Section header ── */
        .rp-sec-hdr {
          display: flex; align-items: flex-end;
          justify-content: space-between; flex-shrink: 0;
        }
        .rp-sec-title { font-size: 17px; font-weight: 700; margin-top: 2px; }
        .rp-pill {
          background: #0B0E1E; border: 1px solid #1A1F33;
          border-radius: 999px; padding: 5px 13px;
          font-size: 11px; color: #8b91a1;
          display: flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0;
        }
        .rp-pill-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #2B3CFF; flex-shrink: 0;
        }
        /* ── Chart card ── */
        .rp-chart-card {
          background: #0B0E1E; border: 1px solid #1A1F33;
          border-radius: 12px; padding: 16px 20px;
          flex: 1; min-height: 0; overflow: hidden;
          display: flex; align-items: stretch;
        }
        /* ── Bottom cards ── */
        .rp-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex-shrink: 0; }
        .rp-card   { background: #0B0E1E; border: 1px solid #1A1F33; border-radius: 10px; padding: 13px 15px; }
        .rp-winner-top { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 9px; }
        .rp-winner-icon {
          width: 28px; height: 28px; background: rgba(43,60,255,.12);
          border-radius: 6px; display: flex; align-items: center;
          justify-content: center; font-size: 14px; flex-shrink: 0;
        }
        .rp-winner-tag {
          font-size: 9.5px; font-weight: 700; letter-spacing: 2px;
          color: #2B3CFF; text-transform: uppercase; line-height: 1.35;
        }
        .rp-winner-name { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
        .rp-winner-cpa  { font-size: 12px; color: #8b91a1; display: flex; align-items: center; gap: 6px; }
        .rp-perf-dot    { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .rp-sum-lbl     { margin-bottom: 6px; }
        .rp-sum-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 0; border-bottom: 1px solid #1A1F33; font-size: 12px;
          list-style: none;
        }
        .rp-sum-item:last-child { border-bottom: none; padding-bottom: 0; }
        .rp-sum-item-lbl { color: #8b91a1; }
        .rp-sum-item-val { font-weight: 700; }
        /* ── Demo card ── */
        .rp-demo {
          background: #fff; color: #0B0E1E;
          border-radius: 12px; padding: 18px 20px;
          flex: 1; min-height: 0; overflow: hidden;
          display: flex; flex-direction: column; gap: 14px;
        }
        .rp-demo-lbl {
          font-size: 10px; font-weight: 700; letter-spacing: 2px;
          color: #8b91a1; text-transform: uppercase; margin-bottom: 8px;
        }
        /* ── Footer ── */
        .rp-footer {
          border-top: 1px solid #1A1F33; padding: 10px 28px; flex-shrink: 0;
          display: grid; grid-template-columns: 1fr auto 1fr;
          align-items: center; gap: 16px;
        }
        .rp-f-meta    { font-size: 11px; color: #6B7280; }
        .rp-f-meta-sm { font-size: 10px; color: #6B7280; }
        .rp-f-center  { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
        .rp-f-logo    {
          width: 24px; height: 24px; background: #2B3CFF; border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 900; font-style: italic; color: #fff; flex-shrink: 0;
        }
        .rp-f-logo-name { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; }
        .rp-f-right  { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .rp-f-client { font-size: 11px; color: #6B7280; }
        .rp-btn-wa {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 15px; background: #0B0E1E; border: 1px solid #1A1F33;
          border-radius: 999px; font-size: 11px; font-weight: 600; color: #fff;
          text-decoration: none;
        }
        .rp-wa-dot { width: 8px; height: 8px; border-radius: 50%; background: #22C55E; flex-shrink: 0; }
        /* ── Mobile ── */
        @media (max-width: 768px) {
          .rp-root    { height: auto; overflow: auto; font-size: 12px; }
          .rp-header  { height: auto; padding: 12px 16px; }
          .rp-hero    { flex-direction: column; padding: 14px 16px; gap: 14px; }
          .rp-hero-title { font-size: 26px; }
          .rp-kpi-row { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; width: 100%; }
          .rp-kpi     { min-width: 0; }
          .rp-kpi-val { font-size: 17px; }
          .rp-grid    { grid-template-columns: 1fr; padding: 14px 16px; overflow: visible; flex: none; }
          .rp-col-l, .rp-col-r { overflow: visible; }
          .rp-chart-card { height: 200px; flex: none; }
          .rp-bottom  { grid-template-columns: 1fr; }
          .rp-footer  { grid-template-columns: 1fr; padding: 14px 16px; gap: 10px; }
          .rp-f-center { order: -1; }
          .rp-f-right  { align-items: flex-start; }
        }
      `}</style>

      <div className="rp-root">

        {/* ── Header ── */}
        <header className="rp-header" role="banner">
          <div className="rp-logo">
            <div className="rp-logo-icon" aria-hidden="true">M</div>
            <span className="rp-logo-name">LONE MÍDIA</span>
          </div>
          <div className="rp-hdr-client">
            <div className="rp-hdr-name">{D.client.segment} — {D.client.name}</div>
            <div className="rp-hdr-period">{D.period.label}</div>
          </div>
        </header>

        {/* ── Hero + KPIs ── */}
        <section className="rp-hero" aria-label="Resumo do período">
          <div>
            <div className="rp-label-blue">RESULTADO SEMANAL</div>
            <h1 className="rp-hero-title">{D.client.name}</h1>
            <p className="rp-hero-sub">Resultado dos seus anúncios no período selecionado</p>
            {D.manager_message && (
              <p className="rp-hero-msg">&ldquo;{D.manager_message}&rdquo;</p>
            )}
          </div>
          <div className="rp-kpi-row" role="list" aria-label="KPIs do período">
            {kpiDefs.map(({ key, label, first }) => {
              const k = D.kpis[key];
              const col = deltaColor(k.direction);
              return (
                <div key={key} className={`rp-kpi${first ? " first" : ""}`} role="listitem">
                  <div className="rp-kpi-lbl">{label}</div>
                  <div className="rp-kpi-val">{k.value}</div>
                  <div className="rp-kpi-delta">
                    <span className="rp-kpi-num" style={{ color: col }}>
                      {deltaArrow(k.delta_pct)} {Math.abs(k.delta_pct)}%
                    </span>
                    <span className="rp-kpi-aux">vs semana anterior</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Grid principal ── */}
        <main className="rp-grid" role="main">

          {/* Coluna esquerda */}
          <div className="rp-col-l">
            <div className="rp-sec-hdr">
              <div>
                <div className="rp-label-blue">EVOLUÇÃO</div>
                <div className="rp-sec-title">Mensagens por Dia</div>
              </div>
              <div className="rp-pill">
                <span className="rp-pill-dot" aria-hidden="true" />
                Pico: <strong>{D.chart.peak_label}</strong>&nbsp;·&nbsp;
                {D.chart.values[D.chart.peak_index]} mensagens
              </div>
            </div>

            <div className="rp-chart-card">
              <Chart chart={D.chart} />
            </div>

            <div className="rp-bottom">
              <article className="rp-card" aria-label="Conjunto com melhor resultado">
                <div className="rp-winner-top">
                  <div className="rp-winner-icon" aria-hidden="true">🏆</div>
                  <div className="rp-winner-tag">CONJUNTO COM MELHOR RESULTADO</div>
                </div>
                <div className="rp-winner-name">{D.winning_set.name}</div>
                <div className="rp-winner-cpa">
                  {D.winning_set.cpa} por conversa
                  <span className="rp-perf-dot"
                        style={{ background: perfColor(D.winning_set.performance) }}
                        aria-hidden="true" />
                </div>
              </article>

              <article className="rp-card" aria-label="Resumo do período">
                <div className="rp-label-blue rp-sum-lbl">RESUMO DO PERÍODO</div>
                <ul style={{ listStyle: "none" }}>
                  {[
                    ["Cliques no link",     D.summary.clicks],
                    ["Total de impressões", D.summary.impressions],
                    ["Pico de mensagens",   D.summary.peak_messages],
                  ].map(([lbl, val]) => (
                    <li key={lbl} className="rp-sum-item">
                      <span className="rp-sum-item-lbl">{lbl}</span>
                      <span className="rp-sum-item-val">{val}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>

          {/* Coluna direita — demografia */}
          <div className="rp-col-r">
            <div className="rp-sec-hdr">
              <div>
                <div className="rp-label-blue">PÚBLICO ALCANÇADO</div>
                <div className="rp-sec-title">Dados Demográficos</div>
              </div>
            </div>

            <div className="rp-demo" role="region" aria-label="Dados demográficos">
              <div>
                <div className="rp-demo-lbl">GÊNERO</div>
                <Donut {...D.gender} />
              </div>
              <div>
                <div className="rp-demo-lbl">FAIXA ETÁRIA</div>
                <AgeBars ranges={D.age_ranges} />
              </div>
            </div>
          </div>

        </main>

        {/* ── Footer ── */}
        <footer className="rp-footer" role="contentinfo">
          <div>
            <div className="rp-f-meta">Gerado via Lone OS · lonemidia.com</div>
            <div className="rp-f-meta-sm">
              Dados atualizados em {D.generated_at} · Próxima atualização: {D.next_update}
            </div>
            <div className="rp-f-meta-sm">
              Atribuição: 7 dias de clique + 1 dia de visualização
            </div>
          </div>
          <div className="rp-f-center">
            <div className="rp-f-logo" aria-hidden="true">M</div>
            <span className="rp-f-logo-name">LONE MÍDIA</span>
          </div>
          <div className="rp-f-right">
            <div className="rp-f-client">{D.client.name} · {D.period.label}</div>
            <a href={waHref} className="rp-btn-wa" aria-label="Falar com a equipe pelo WhatsApp">
              <span className="rp-wa-dot" aria-hidden="true" />
              Falar com a equipe
            </a>
          </div>
        </footer>

      </div>
    </>
  );
}
