// lib/fichaViva/estrutura-pdf.ts — HTML da "Estrutura Comercial" (Ficha Viva) no visual NAVY da
// Lone Mídia (fundo #060814, azul #2B3CFF, logo). Vira PDF via htmlToPdf (browserless). Documento
// INTERNO da agência (o cliente respondeu; a Lone entrega a estrutura + scripts).

export interface EstruturaAnalise {
  diagnostico: string;
  swot: { forcas: string[]; fraquezas: string[]; oportunidades: string[]; ameacas: string[] };
  prioridades: string[];
  scripts: string[];
}

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

function swotBox(titulo: string, itens: string[], cor: string): string {
  const lis = itens.length ? itens.map((i) => `<li>${esc(i)}</li>`).join("") : "<li style='opacity:.5'>—</li>";
  return `<div class="sw" style="border-color:${cor}33;background:${cor}12">
    <h4 style="color:${cor}">${titulo}</h4><ul style="--dot:${cor}">${lis}</ul></div>`;
}

/** Monta o HTML navy da estrutura comercial. `logoDataUri` "" = cai pro wordmark em texto. */
export function estruturaPdfHtml(clienteNome: string, a: EstruturaAnalise, dataLabel: string, logoDataUri: string): string {
  const prioridades = a.prioridades.length
    ? `<ol>${a.prioridades.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : "";
  const scripts = a.scripts.length
    ? a.scripts.map((s) => `<div class="script">${esc(s)}</div>`).join("") : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body {
    font-family:'Montserrat',-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
    background:
      radial-gradient(900px 520px at 82% -6%, rgba(43,60,255,.20), transparent 58%),
      radial-gradient(760px 520px at -6% 6%, rgba(43,60,255,.12), transparent 55%),
      #060814;
    color:#EEF0F6; padding:44px 52px; font-size:13px; line-height:1.55;
  }
  .top { display:flex; align-items:center; justify-content:space-between; margin-bottom:26px; }
  .brand img { height:26px; }
  .brand .word { font-weight:800; letter-spacing:.14em; font-size:16px; color:#fff; }
  .top .meta { text-align:right; font-size:10px; letter-spacing:.16em; color:#5b628f; line-height:1.7; }
  .top .meta b { color:#8b91a1; font-weight:600; }
  .kicker { font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:#5A68FF; font-weight:700; }
  h1 { font-size:26px; font-weight:800; letter-spacing:-.02em; margin:8px 0 4px; }
  h1 span { color:#5A68FF; }
  .sub { color:#8b91a1; font-size:13px; margin-bottom:22px; }
  .card { background:#0B0E1E; border:1px solid #1A1F33; border-radius:14px; padding:18px 20px; margin-bottom:14px; }
  .card h3 { font-size:14px; font-weight:700; margin-bottom:8px; }
  .card h3 .pin { color:#5A68FF; }
  .lead { background:linear-gradient(150deg,#101638,#0A0D22); border:1.5px solid #2B3CFF; border-radius:15px; padding:18px 20px; margin-bottom:16px; box-shadow:0 0 0 1px rgba(43,60,255,.2); }
  .lead .t { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#5A68FF; font-weight:800; margin-bottom:8px; }
  .lead p { font-size:14px; color:#EEF0F6; }
  .swot { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
  .sw { border:1px solid; border-radius:13px; padding:14px 16px; }
  .sw h4 { font-size:11px; letter-spacing:.08em; text-transform:uppercase; font-weight:800; margin-bottom:9px; }
  .sw ul { list-style:none; }
  .sw li { font-size:12.5px; color:#EEF0F6; padding:4px 0 4px 15px; position:relative; }
  .sw li::before { content:""; position:absolute; left:0; top:9px; width:5px; height:5px; border-radius:50%; background:var(--dot); }
  ol { margin-left:18px; } ol li { font-size:13px; color:#D6D9E3; padding:3px 0; }
  .script { background:#0A0D22; border:1px solid #1A1F33; border-radius:11px; padding:12px 14px; margin-top:9px; font-size:12.5px; color:#D6D9E3; }
  .foot { margin-top:26px; padding-top:14px; border-top:1px solid #1A1F33; display:flex; justify-content:space-between; font-size:10px; color:#5b628f; letter-spacing:.06em; }
  </style></head><body>
    <div class="top">
      <div class="brand">${logoDataUri ? `<img src="${logoDataUri}" alt="Lone Mídia">` : `<div class="word">LONE MÍDIA</div>`}</div>
      <div class="meta">ESTRUTURA COMERCIAL · EMISSÃO<br><b>${esc(dataLabel)}</b></div>
    </div>

    <div class="kicker">Ficha Viva 360 · Raio-X Comercial</div>
    <h1>Estrutura comercial de <span>${esc(clienteNome)}</span></h1>
    <p class="sub">Diagnóstico, forças e fraquezas, prioridades de 90 dias e scripts — a partir do que o cliente informou.</p>

    <div class="lead"><div class="t">A leitura que importa</div><p>${esc(a.diagnostico)}</p></div>

    <div class="swot">
      ${swotBox("Forças", a.swot.forcas, "#26D07C")}
      ${swotBox("Fraquezas", a.swot.fraquezas, "#FF5B6E")}
      ${swotBox("Oportunidades", a.swot.oportunidades, "#5A68FF")}
      ${swotBox("Ameaças", a.swot.ameacas, "#FFB454")}
    </div>

    ${prioridades ? `<div class="card"><h3><span class="pin">◆</span> Prioridades — próximos 90 dias</h3>${prioridades}</div>` : ""}
    ${scripts ? `<div class="card"><h3><span class="pin">◆</span> Scripts prontos</h3>${scripts}</div>` : ""}

    <div class="foot"><span>Lone Mídia · Assessoria de Marketing &amp; Performance</span><span>Ficha Viva 360</span></div>
  </body></html>`;
}
