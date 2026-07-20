// POST /api/cs/calendario/pdf — PDF branded do calendário (padrão Lone Mídia): capa + uma página
// por peça com o detalhamento slide a slide (ARTE 1 CAPA, ARTE 2 CONTEÚDO, CTA, LEGENDA).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import type { PecaFinal } from "@/lib/cs/motor";

// Wordmark em CSS (não depende de imagem — a logo.png esticava/quebrava no PDF).
const LOGO = '<div class="brand"><span class="bmark">M</span><span class="bname">LONE MÍDIA</span></div>';

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
function diaSemana(data: string): string {
  const [y, m, d] = data.split("-").map(Number);
  if (!y || !m || !d) return "";
  return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || "";
}
const diaCurto = (data: string) => (diaSemana(data).split("-")[0] || "").toUpperCase();

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cliente = esc(body?.cliente || "Cliente");
  const nicho = esc(body?.nicho || "");
  const periodo = esc(body?.periodo || "");
  const modo = body?.modo === "mes" ? "Mês" : "Semana";
  const pecas = (body?.pecas as PecaFinal[]) || [];
  if (!pecas.length) return NextResponse.json({ error: "sem conteúdo pra gerar" }, { status: 400 });

  const logoImg = LOGO;

  // Capa: tabela-resumo
  const resumo = pecas.map((p) => `
    <div class="rrow">
      <div class="rdia">${esc(diaCurto(p.data))}</div>
      <div class="rmid"><div class="rt">${esc(p.titulo)}</div><div class="rs">${esc((p.objetivo_peca || "").slice(0, 80))}</div></div>
      <div class="rfmt">${esc(p.formato)}${p.duracao ? ` · ${esc(p.duracao)}` : ""}</div>
    </div>`).join("");

  const capa = `<section class="page cover">
    <div class="cov-logo">${logoImg}</div>
    <div class="cov-mid">
      <div class="pill">CALENDÁRIO DE CONTEÚDO · ${modo.toUpperCase()}</div>
      <h1>Calendário<br/>do <span>${modo}</span></h1>
      <p class="cov-sub">Conteúdos planejados com tema, objetivo, textos das artes, CTA e legenda prontos para publicação.</p>
      <div class="resumo">${resumo}</div>
    </div>
    <div class="cov-ft">
      <div><div class="lbl">PREPARADO PARA</div><div class="v1">${cliente}</div>${nicho ? `<div class="v2">${nicho}</div>` : ""}</div>
      <div class="tright"><div class="lbl">EMISSÃO</div><div class="v1">${periodo}</div></div>
    </div>
  </section>`;

  // Páginas por peça
  const paginas = pecas.map((p, i) => {
    const blocos = p.blocos.map((b, bi) => `
      <div class="bloco">
        <div class="brot"><span class="bnum">${bi + 1}</span>${esc(b.rotulo || "ARTE")}</div>
        ${b.objetivo ? `<div class="bfield"><span>OBJETIVO</span> ${esc(b.objetivo)}</div>` : ""}
        ${b.headline ? `<div class="btit">${esc(b.headline)}</div>` : ""}
        ${b.corpo ? `<div class="bsub">${esc(b.corpo)}</div>` : ""}
        ${b.topicos?.length ? `<ul class="btop">${b.topicos.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        ${b.direcao_arte ? `<div class="bdir"><span>🎨 DIREÇÃO DE ARTE</span> ${esc(b.direcao_arte)}</div>` : ""}
      </div>`).join("");
    return `<section class="page">
      <div class="ph"><div>${logoImg}</div><div class="ph-r">CALENDÁRIO DE CONTEÚDO<br/><b>${cliente} · ${esc(diaSemana(p.data))}</b></div></div>
      <div class="plabel">${esc(diaSemana(p.data).toUpperCase())} · ${esc(String(p.formato).toUpperCase())}</div>
      <h2>${esc(p.titulo)}</h2>
      <div class="ppills"><span>Formato: ${esc(p.formato)}</span>${p.duracao ? `<span>Duração: ${esc(p.duracao)}</span>` : ""}<span>${esc(p.blocos.length)} arte(s)</span></div>
      ${p.conceito_visual ? `<div class="conceito"><span>CONCEITO</span> ${esc(p.conceito_visual)}</div>` : ""}
      ${blocos}
      <div class="cta"><div class="cta-h">📣 CTA</div>${esc(p.cta)}</div>
      <div class="leg"><div class="leg-h">✍️ LEGENDA</div>${esc(p.legenda)}</div>
      <div class="pf"><span>LONE MÍDIA</span><span>Calendário de Conteúdo · ${cliente} · ${String(i + 2).padStart(2, "0")}</span></div>
    </section>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #e7ecf5; background: #0a0f1e; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { background: #0a0f1e; min-height: 100vh; padding: 40px 44px; page-break-after: always; position: relative; }
    .brand { display: inline-flex; align-items: center; gap: 8px; }
    .bmark { width: 26px; height: 26px; border-radius: 6px; background: #2f6bff; color: #fff; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; font-size: 15px; }
    .bname { color: #fff; font-weight: 800; letter-spacing: 1px; font-size: 15px; }
    .cov-logo { align-self: flex-start; }
    /* Capa */
    .cover { display: flex; flex-direction: column; }
    .cov-mid { margin-top: 90px; flex: 1; }
    .pill { display: inline-block; border: 1px solid #2a3a5e; color: #7aa2ff; font-size: 11px; letter-spacing: 1px; padding: 5px 12px; border-radius: 20px; }
    .cover h1 { font-size: 52px; line-height: 1.05; margin: 22px 0 14px; } .cover h1 span { color: #4f7cff; }
    .cov-sub { color: #93a3c0; max-width: 460px; font-size: 14px; line-height: 1.5; }
    .resumo { margin-top: 34px; max-width: 620px; }
    .rrow { display: flex; align-items: center; gap: 16px; background: #101830; border: 1px solid #1e2b48; border-radius: 12px; padding: 14px 18px; margin-bottom: 12px; }
    .rdia { color: #7aa2ff; font-weight: 700; font-size: 12px; width: 70px; letter-spacing: .5px; }
    .rmid { flex: 1; } .rt { font-weight: 700; font-size: 14px; } .rs { color: #8ea0c0; font-size: 12px; margin-top: 2px; }
    .rfmt { background: #16213c; border: 1px solid #26375c; border-radius: 20px; padding: 5px 12px; font-size: 11px; color: #cdd8ee; white-space: nowrap; }
    .cov-ft { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #1e2b48; padding-top: 18px; margin-top: 20px; }
    .cov-ft .lbl { color: #6b7c9e; font-size: 10px; letter-spacing: 2px; } .cov-ft .v1 { font-weight: 700; font-size: 15px; margin-top: 5px; } .cov-ft .v2 { color: #8ea0c0; font-size: 12px; } .tright { text-align: right; }
    /* Páginas */
    .ph { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 26px; }
    .ph-r { text-align: right; color: #6b7c9e; font-size: 10px; letter-spacing: 1px; line-height: 1.5; } .ph-r b { color: #b9c6e2; }
    .plabel { color: #4f7cff; font-size: 12px; letter-spacing: 1.5px; font-weight: 700; }
    h2 { font-size: 26px; line-height: 1.15; margin: 8px 0 14px; }
    .ppills { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 22px; } .ppills span { background: #101830; border: 1px solid #1e2b48; border-radius: 20px; padding: 5px 12px; font-size: 11px; color: #cdd8ee; }
    .bloco { background: #101830; border: 1px solid #1e2b48; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; page-break-inside: avoid; }
    .brot { color: #7aa2ff; font-size: 11px; letter-spacing: 1px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .bnum { background: #16213c; border: 1px solid #2a3a5e; color: #9ab4ff; width: 22px; height: 22px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
    .btit { font-weight: 700; font-size: 16px; margin: 8px 0 4px; border-left: 3px solid #4f7cff; padding-left: 10px; }
    .bsub { color: #b9c6e2; font-size: 13px; margin: 2px 0; }
    .btop { list-style: none; margin: 8px 0 2px; } .btop li { font-size: 13px; padding: 3px 0 3px 20px; position: relative; color: #dbe4f5; } .btop li:before { content: "✔"; color: #4f7cff; position: absolute; left: 0; }
    .bfield { font-size: 12px; color: #93a3c0; margin: 2px 0 6px; } .bfield span { color: #6b7c9e; letter-spacing: 1px; font-size: 10px; margin-right: 4px; }
    .bdir { font-size: 12.5px; color: #cdd8ee; margin-top: 10px; background: #0c142b; border: 1px solid #1a2848; border-radius: 8px; padding: 8px 10px; } .bdir span { color: #7aa2ff; letter-spacing: .5px; font-size: 10px; margin-right: 4px; font-weight: 700; }
    .conceito { font-size: 12.5px; color: #b9c6e2; background: #101830; border: 1px solid #1e2b48; border-radius: 8px; padding: 10px 12px; margin-bottom: 16px; } .conceito span { color: #7aa2ff; letter-spacing: 1px; font-size: 10px; margin-right: 6px; font-weight: 700; }
    .cta { border: 1px solid #2a3a5e; border-radius: 12px; padding: 14px 18px; margin: 18px 0 12px; font-size: 14px; font-weight: 600; }
    .cta-h { color: #4f7cff; font-size: 11px; letter-spacing: 1px; margin-bottom: 6px; font-weight: 700; }
    .leg { border: 1px dashed #2a3a5e; border-radius: 12px; padding: 14px 18px; font-size: 13px; color: #cdd8ee; white-space: pre-wrap; line-height: 1.55; }
    .leg-h { color: #7aa2ff; font-size: 11px; letter-spacing: 1px; margin-bottom: 6px; font-weight: 700; }
    .pf { display: flex; justify-content: space-between; color: #5c6b8c; font-size: 10px; border-top: 1px solid #1e2b48; margin-top: 22px; padding-top: 12px; }
  </style></head><body>${capa}${paginas}</body></html>`;

  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "Falha ao gerar PDF" }, { status: 502 });

  const fname = `calendario-${cliente.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
