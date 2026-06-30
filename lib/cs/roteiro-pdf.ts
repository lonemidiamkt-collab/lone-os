// lib/cs/roteiro-pdf.ts — HTML branded (Lone Mídia) de roteiro(s) de anúncio, p/ virar PDF
// via browserless (htmlToPdf). Usado no envio proativo de segunda E no on-demand do grupo.

import type { Roteiro } from "@/lib/cs/criativo";

const BRAND = "#0d4af5";

function esc(s: string): string {
  return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

/** Busca a logo Lone (asset estático do app) como data URI. "" se falhar (header vira só texto). */
export async function loadLoneLogo(): Promise<string> {
  try {
    const r = await fetch("http://localhost:3000/logo.png", { signal: AbortSignal.timeout(8000) });
    if (r.ok) return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { /* sem logo */ }
  return "";
}

function secao(roteiro: Roteiro, n: number, total: number): string {
  const etapas = roteiro.etapas
    .map(
      (e) => `
      <div class="etapa">
        <div class="tempo">${esc(e.tempo)}</div>
        <div class="corpo">
          <div class="nome">${esc(e.nome)}</div>
          <div class="texto">${esc(e.texto)}</div>
        </div>
      </div>`,
    )
    .join("");
  const breakCls = n > 0 ? " brk" : "";
  const titulo = total > 1 ? `Versão ${n + 1} — ${esc(roteiro.angulo)}` : esc(roteiro.angulo);
  return `
  <div class="versao${breakCls}">
    <div class="vtitle">${titulo}</div>
    <div class="tags">
      <span class="tag">Framework: ${esc(roteiro.framework)}</span>
      <span class="tag">Gatilhos: ${esc(roteiro.gatilhos.join(", "))}</span>
      <span class="tag">Arquétipo: ${esc(roteiro.arquetipo)}</span>
      <span class="tag">Funil: ${esc(roteiro.estagio_funil)}</span>
    </div>
    ${etapas}
    <div class="score">
      📊 <b>Scorecard: ${roteiro.scorecard}/100</b><br>
      ${roteiro.pontos_fortes ? `✅ ${esc(roteiro.pontos_fortes)}<br>` : ""}
      ${roteiro.sugestoes ? `🔧 ${esc(roteiro.sugestoes)}` : ""}
    </div>
  </div>`;
}

/** Monta o HTML A4 com 1+ roteiros (cada versão numa página). */
export function roteirosPdfHtml(cliente: string, roteiros: Roteiro[], logoDataUri: string, dataLabel: string): string {
  const secoes = roteiros.map((r, i) => secao(r, i, roteiros.length)).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111118; padding:48px 56px; font-size:14px; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid ${BRAND}; padding-bottom:18px; margin-bottom:22px; }
  .head img { height:40px; }
  .head .meta { text-align:right; color:#6b7280; font-size:11px; line-height:1.5; }
  h1 { font-size:22px; color:${BRAND}; margin-bottom:18px; }
  .vtitle { font-size:16px; font-weight:700; color:#111118; margin-bottom:12px; }
  .tags { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px; }
  .tag { background:${BRAND}1a; color:${BRAND}; border:1px solid ${BRAND}33; border-radius:8px; padding:4px 10px; font-size:11px; font-weight:600; }
  .etapa { display:flex; gap:14px; margin-bottom:14px; page-break-inside:avoid; }
  .tempo { flex:0 0 64px; color:${BRAND}; font-weight:700; font-size:12px; padding-top:2px; }
  .corpo { flex:1; border-left:2px solid #e5e7eb; padding-left:14px; }
  .nome { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#9ca3af; font-weight:700; margin-bottom:3px; }
  .texto { font-size:15px; line-height:1.45; color:#111118; }
  .score { margin-top:20px; background:#f3f4f6; border-radius:12px; padding:16px 18px; }
  .score b { color:${BRAND}; }
  .versao.brk { page-break-before: always; padding-top:8px; }
  .foot { margin-top:28px; border-top:1px solid #e5e7eb; padding-top:12px; color:#9ca3af; font-size:10px; text-align:center; }
  </style></head><body>
    <div class="head">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="Lone Mídia">` : `<div style="font-weight:800;color:${BRAND};font-size:20px;">Lone Mídia</div>`}
      <div class="meta">Roteiro de Anúncio<br>${esc(dataLabel)}<br>gravar até quarta</div>
    </div>
    <h1>${esc(cliente)}</h1>
    ${secoes}
    <div class="foot">Lone Mídia · Roteiro gerado pelo Agente Lone · revise antes de gravar</div>
  </body></html>`;
}

/** Atalho p/ um único roteiro (usado no proativo de segunda). */
export function roteiroPdfHtml(cliente: string, roteiro: Roteiro, logoDataUri: string, dataLabel: string): string {
  return roteirosPdfHtml(cliente, [roteiro], logoDataUri, dataLabel);
}
