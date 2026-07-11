// lib/traffic/igReportSection.ts — HTML do relatório de Instagram orgânico (seguidores + seguidores
// ganhos + alcance + engajamento + público do perfil + posts mais engajados). Design system do app
// (bg #060814, card #0b0e1e, primary #2b3cff, border #1a1f33). Dois formatos:
//   igSectionHtml(snap)  → só os blocos internos, pra ENCAIXAR no PDF de tráfego (cliente com os dois).
//   buildIgOnlyHtml(...)  → documento completo, pro cliente que é SÓ social mídia.

import type { IgSnapshot, IgAudiencia } from "@/lib/meta/igSnapshot";

// Paleta = design system do Lone OS (app/globals.css)
const C = { bg: "#060814", card: "#0b0e1e", card2: "#0e1226", border: "#1a1f33", primary: "#2b3cff", text: "#eef0f6", muted: "#8b91a1", faint: "#5b6172" };
const IG = "#c13584"; // magenta do Instagram — acento da seção orgânica (distingue de Anúncios = azul)

function reportBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_PORTAL_DOMAIN || process.env.NEXT_PUBLIC_SITE_URL || "https://painel.lonemidia.com";
}

const fmtBR = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const fmtSigned = (n: number | null | undefined) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toLocaleString("pt-BR"));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

function kpiCard(label: string, value: string, accent = false): string {
  return `
    <div style="width:calc(25% - 7.5px);background:${C.card};border:1px solid ${accent ? IG : C.border};border-radius:12px;padding:13px 15px;">
      <div style="font-size:9.5px;color:${C.muted};margin-bottom:6px;line-height:1.3;">${label}</div>
      <div style="font-size:${accent ? "24px" : "20px"};font-weight:${accent ? "900" : "800"};color:${accent ? "#fff" : C.text};letter-spacing:-.02em;line-height:1;">${value}</div>
    </div>`;
}

function igKpis(snap: IgSnapshot): string {
  const r = snap.resumo;
  return [
    kpiCard("Seguidores", fmtBR(snap.conta?.seguidores), true),
    kpiCard("Seguidores ganhos", fmtSigned(r?.seguidoresGanhos ?? null)),
    kpiCard("Alcance", fmtBR(r?.alcance ?? null)),
    kpiCard("Engajamento total", fmtBR(r?.engajamento ?? null)),
    kpiCard("Curtidas", fmtBR(r?.curtidas ?? null)),
    kpiCard("Comentários", fmtBR(r?.comentarios ?? null)),
    kpiCard("Posts no período", fmtBR(r?.postsNoPeriodo ?? null)),
  ].join("");
}

// Público do perfil: gênero (barras) + faixa etária (barras) + top 3 cidades.
function igAudienciaHtml(a: IgAudiencia): string {
  const temGenero = a.generoMascPct != null || a.generoFemPct != null;
  const temIdade = a.idades.length > 0;
  const temCidade = a.cidades.length > 0;
  if (!temGenero && !temIdade && !temCidade) return "";

  const barra = (label: string, valuePct: number, cor: string) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <span style="width:64px;font-size:10px;color:${C.muted};flex-shrink:0;">${label}</span>
      <div style="flex:1;height:6px;background:${C.border};border-radius:3px;overflow:hidden;">
        <div style="width:${Math.max(Math.round(valuePct), 2)}%;height:100%;background:${cor};border-radius:3px;"></div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${C.text};width:42px;text-align:right;">${valuePct.toFixed(1)}%</span>
    </div>`;

  const maxIdade = temIdade ? Math.max(...a.idades.map((x) => x.pct), 1) : 1;
  const generoCol = temGenero ? `
    <div style="min-width:150px;">
      <div style="font-size:9px;font-weight:700;color:${C.faint};letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">Gênero</div>
      ${a.generoMascPct != null ? barra("Homens", a.generoMascPct, C.primary) : ""}
      ${a.generoFemPct != null ? barra("Mulheres", a.generoFemPct, IG) : ""}
    </div>` : "";
  const idadeCol = temIdade ? `
    <div style="flex:1;min-width:170px;">
      <div style="font-size:9px;font-weight:700;color:${C.faint};letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">Faixa etária</div>
      ${a.idades.slice(0, 6).map((x) => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="width:44px;font-size:10px;color:${C.muted};flex-shrink:0;">${x.faixa}</span>
          <div style="flex:1;height:6px;background:${C.border};border-radius:3px;overflow:hidden;">
            <div style="width:${Math.max(Math.round((x.pct / maxIdade) * 100), 3)}%;height:100%;background:${C.primary};border-radius:3px;"></div>
          </div>
          <span style="font-size:10px;font-weight:700;color:${C.text};width:42px;text-align:right;">${x.pct.toFixed(1)}%</span>
        </div>`).join("")}
    </div>` : "";
  const cidadeCol = temCidade ? `
    <div style="min-width:160px;">
      <div style="font-size:9px;font-weight:700;color:${C.faint};letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;">Principais cidades</div>
      ${a.cidades.map((c, i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;">
          <span style="width:16px;height:16px;border-radius:50%;background:${IG}22;color:${IG};font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</span>
          <span style="flex:1;font-size:10.5px;color:${C.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.nome}</span>
          <span style="font-size:10px;font-weight:700;color:${C.muted};">${c.pct.toFixed(1)}%</span>
        </div>`).join("")}
    </div>` : "";

  return `
  <div style="padding:0 32px;margin-bottom:20px;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${IG};margin-bottom:10px;">Público do Instagram</div>
    <div style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:18px 22px;">
      <div style="display:flex;gap:26px;align-items:flex-start;flex-wrap:wrap;">
        ${generoCol}${idadeCol}${cidadeCol}
      </div>
    </div>
  </div>`;
}

function igPostsGrid(snap: IgSnapshot): string {
  const posts = (snap.posts ?? []).slice(0, 4); // já vêm ordenados por engajamento
  if (posts.length === 0) return "";
  return `
  <div style="padding:0 32px;margin-bottom:20px;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${IG};margin-bottom:10px;">Posts com mais engajamento</div>
    <div style="display:flex;gap:10px;">
      ${posts.map((p) => `
      <div style="flex:1;background:${C.card};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
        ${p.thumb ? `<img src="${p.thumb}" style="width:100%;height:112px;object-fit:cover;display:block;" alt=""/>` : `<div style="width:100%;height:112px;background:${C.border};"></div>`}
        <div style="padding:8px 11px;font-size:10px;color:${C.muted};display:flex;gap:10px;flex-wrap:wrap;">
          <span>❤ ${fmtBR(p.curtidas)}</span><span>💬 ${fmtBR(p.comentarios)}</span>${p.views != null ? `<span>▶ ${fmtBR(p.views)}</span>` : ""}
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

// Faixa que abre a seção — título grande com acento (usado por Anúncios/Instagram no relatório).
function sectionBand(kicker: string, titulo: string, cor: string, sub: string): string {
  return `
  <div style="margin:6px 32px 14px;height:2px;background:linear-gradient(90deg,${cor} 0%,${C.border} 62%);border-radius:1px;"></div>
  <div style="padding:0 32px 4px;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:${cor};margin-bottom:5px;">${kicker}</div>
    <div style="font-size:19px;font-weight:900;letter-spacing:-.02em;color:#fff;line-height:1;">${titulo}</div>
    <div style="font-size:11px;color:${C.muted};margin-top:4px;">${sub}</div>
  </div>`;
}

/** Só os blocos internos (faixa + KPIs + público + destaques) pra encaixar no relatório de tráfego. */
export function igSectionHtml(snap: IgSnapshot): string {
  if (!snap.mapped || snap.error || !snap.conta) return "";
  const label = snap.periodoLabel || "período";
  const sub = snap.fonte === "publico"
    ? `Seguidores e engajamento dos seus posts nos últimos ${label} (dados públicos do perfil)`
    : `Alcance, seguidores, engajamento e público do seu perfil nos últimos ${label}`;
  return `
  ${sectionBand("Instagram Orgânico · " + label, "@" + snap.conta.username, IG, sub)}
  <div style="padding:12px 32px 0;display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
    ${igKpis(snap)}
  </div>
  ${snap.audiencia ? igAudienciaHtml(snap.audiencia) : ""}
  ${igPostsGrid(snap)}`;
}

/** Documento completo (cliente só-social): header + seção de IG + rodapé, no design system do app. */
export function buildIgOnlyHtml(clientName: string, period: string, snap: IgSnapshot): string {
  const logoUrl = `${reportBaseUrl()}/logo.png`;
  const label = snap.periodoLabel || "período";
  const periodTitle = label === "7 dias" ? "Resultado Semanal" : label === "30 dias" ? "Resultado Mensal" : `Resultado — ${label}`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório — ${clientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:${C.bg}; color:${C.text}; }
    .page { max-width:820px; margin:0 auto; padding-bottom:32px; }
    @media print { html, body { background:${C.bg} !important; } @page { margin:0; size:A4; } }
  </style>
</head>
<body>
<div class="page">
  <!-- HEADER -->
  <div style="border-top:3px solid ${IG};padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${C.border};">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:28px;height:28px;background:#000;border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        <img src="${logoUrl}" style="width:22px;height:22px;object-fit:contain;" alt=""/>
      </div>
      <span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:-.01em;">LONE MÍDIA</span>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;font-weight:600;color:${C.muted};">${clientName}</div>
      <div style="font-size:9px;color:${C.faint};margin-top:1px;">${period}</div>
    </div>
  </div>
  <!-- HERO -->
  <div style="padding:22px 32px 4px;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:${IG};margin-bottom:5px;">${periodTitle}</div>
    <div style="font-size:28px;font-weight:900;letter-spacing:-.025em;color:#fff;line-height:1;">${clientName}</div>
    <div style="font-size:11px;color:${C.muted};margin-top:4px;">Resultado do seu Instagram no período selecionado</div>
  </div>
  ${igSectionHtml(snap)}
  <!-- FOOTER -->
  <div style="margin:8px 32px 0;padding-top:12px;border-top:1px solid ${C.border};display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:9px;color:${C.faint};">Gerado via Lone OS · lonemidia.com</span>
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="width:20px;height:20px;background:#000;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <img src="${logoUrl}" style="width:16px;height:16px;object-fit:contain;" alt=""/>
      </div>
      <span style="font-size:10px;font-weight:800;color:#fff;letter-spacing:-.01em;">LONE MÍDIA</span>
    </div>
    <span style="font-size:9px;color:${C.faint};">${clientName} · ${period}</span>
  </div>
</div>
</body>
</html>`;
}
