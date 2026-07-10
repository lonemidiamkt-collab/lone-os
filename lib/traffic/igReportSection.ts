// lib/traffic/igReportSection.ts — HTML do relatório de Instagram orgânico (seguidores + alcance/
// curtidas/comentários do período + destaques). Dois formatos, mesmo visual do relatório de tráfego:
//   igSectionHtml(snap)  → só os blocos internos, pra ENCAIXAR no PDF de tráfego (cliente com os dois).
//   buildIgOnlyHtml(...)  → documento completo, pro cliente que é SÓ social mídia.

import type { IgSnapshot } from "@/lib/meta/igSnapshot";

const IG = "#c13584"; // magenta do Instagram (usado só nos acentos; o resto segue o tema do relatório)

function reportBaseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_PORTAL_DOMAIN || process.env.NEXT_PUBLIC_SITE_URL || "https://painel.lonemidia.com";
}

const fmtBR = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

function igKpiCards(snap: IgSnapshot): string {
  const kpis: [string, string, boolean][] = [
    ["Seguidores", fmtBR(snap.conta?.seguidores), true],
    ["Alcance (7 dias)", fmtBR(snap.resumo?.alcance ?? null), false],
    ["Curtidas no período", fmtBR(snap.resumo?.curtidas), false],
    ["Comentários", fmtBR(snap.resumo?.comentarios), false],
  ];
  return kpis.map(([label, value, accent]) => `
    <div style="flex:1;background:#0d0d10;border:1px solid ${accent ? IG : "#1a1a2e"};border-radius:10px;padding:14px 16px;">
      <div style="font-size:10px;color:#52525b;margin-bottom:7px;line-height:1.3;">${label}</div>
      <div style="font-size:${accent ? "26px" : "20px"};font-weight:${accent ? "900" : "800"};color:${accent ? "#fff" : "#d4d4d8"};letter-spacing:-.02em;line-height:1;">${value}</div>
    </div>`).join("");
}

function igPostsGrid(snap: IgSnapshot): string {
  const posts = (snap.posts ?? []).slice(0, 4);
  if (posts.length === 0) return "";
  return `
  <div style="padding:0 32px;margin-bottom:20px;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${IG};margin-bottom:10px;">Destaques do período</div>
    <div style="display:flex;gap:10px;">
      ${posts.map((p) => `
      <div style="flex:1;background:#0a0a0d;border:1px solid #1a1a2e;border-radius:10px;overflow:hidden;">
        ${p.thumb ? `<img src="${p.thumb}" style="width:100%;height:110px;object-fit:cover;display:block;" alt=""/>` : `<div style="width:100%;height:110px;background:#1a1a2e;"></div>`}
        <div style="padding:8px 10px;font-size:10px;color:#a1a1aa;display:flex;gap:9px;flex-wrap:wrap;">
          <span>❤ ${fmtBR(p.curtidas)}</span><span>💬 ${fmtBR(p.comentarios)}</span>${p.views != null ? `<span>▶ ${fmtBR(p.views)}</span>` : ""}
        </div>
      </div>`).join("")}
    </div>
  </div>`;
}

/** Só os blocos internos (título + KPIs + destaques) pra encaixar no relatório de tráfego. */
export function igSectionHtml(snap: IgSnapshot): string {
  if (!snap.mapped || snap.error || !snap.conta) return "";
  return `
  <div style="margin:8px 32px 16px;height:2px;background:linear-gradient(90deg,${IG} 0%,#1a1a2e 65%);border-radius:1px;"></div>
  <div style="padding:0 32px 2px;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:${IG};margin-bottom:5px;">Instagram Orgânico</div>
    <div style="font-size:18px;font-weight:900;letter-spacing:-.02em;color:#fff;line-height:1;">@${snap.conta.username}</div>
    <div style="font-size:11px;color:#52525b;margin-top:4px;">Alcance, curtidas e comentários dos seus posts nos últimos 7 dias</div>
  </div>
  <div style="padding:12px 32px 0;display:flex;gap:10px;margin-bottom:16px;">
    ${igKpiCards(snap)}
  </div>
  ${igPostsGrid(snap)}`;
}

/** Documento completo (cliente só-social): header + seção de IG + rodapé, no mesmo tema. */
export function buildIgOnlyHtml(clientName: string, period: string, snap: IgSnapshot): string {
  const logoUrl = `${reportBaseUrl()}/logo.png`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório — ${clientName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    html, body { font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; background:#09090b; color:#e4e4e7; }
    .page { max-width:820px; margin:0 auto; padding-bottom:32px; }
    @media print { html, body { background:#09090b !important; } @page { margin:0; size:A4; } }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div style="border-top:3px solid ${IG};padding:14px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1a1a2e;">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:28px;height:28px;background:#000;border-radius:6px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
        <img src="${logoUrl}" style="width:22px;height:22px;object-fit:contain;" alt=""/>
      </div>
      <span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:-.01em;">LONE MÍDIA</span>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;font-weight:600;color:#a1a1aa;">${clientName}</div>
      <div style="font-size:9px;color:#52525b;margin-top:1px;">${period}</div>
    </div>
  </div>

  <!-- HERO -->
  <div style="padding:22px 32px 0;">
    <div style="font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:${IG};margin-bottom:5px;">Resultado Semanal</div>
    <div style="font-size:28px;font-weight:900;letter-spacing:-.025em;color:#fff;line-height:1;">${clientName}</div>
    <div style="font-size:11px;color:#52525b;margin-top:4px;">Resultado do seu Instagram no período selecionado</div>
  </div>

  ${igSectionHtml(snap)}

  <!-- FOOTER -->
  <div style="margin:8px 32px 0;padding-top:12px;border-top:1px solid #1a1a2e;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-size:9px;color:#3f3f46;">Gerado via Lone OS · lonemidia.com</span>
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="width:20px;height:20px;background:#000;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <img src="${logoUrl}" style="width:16px;height:16px;object-fit:contain;" alt=""/>
      </div>
      <span style="font-size:10px;font-weight:800;color:#fff;letter-spacing:-.01em;">LONE MÍDIA</span>
    </div>
    <span style="font-size:9px;color:#3f3f46;">${clientName} · ${period}</span>
  </div>

</div>
</body>
</html>`;
}
