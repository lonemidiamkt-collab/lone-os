// POST /api/cs/calendario/pdf — gera o PDF branded do calendário (padrão Lone) pra download.
// Recebe o plano já aprovado (cliente, periodo, objetivo, decisoes, pecas) e renderiza via browserless.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Peca { data: string; formato: string; titulo: string; gancho: string; apoio: string; cta: string; legenda: string; sugestao_design: string }
interface Decisao { data: string; pilar: string; objetivo: string; posicaoFunil: string; porQueAgora: string; tema: string; angulo: string }

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cliente = esc(body?.cliente || "Cliente");
  const periodo = esc(body?.periodo || "");
  const obj = body?.objetivo as { objetivoPrincipal?: string; narrativa?: string; mixPilares?: { autoridade: number; aproximacao: number; comercial: number } } | undefined;
  const decisoes = (body?.decisoes as Decisao[]) || [];
  const pecas = (body?.pecas as Peca[]) || [];
  if (!pecas.length && !decisoes.length) return NextResponse.json({ error: "sem conteúdo pra gerar" }, { status: 400 });

  const logo = await loadLoneLogo();
  const decDe = (data: string) => decisoes.find((d) => d.data === data);

  const cards = pecas.map((p) => {
    const d = decDe(p.data);
    return `<div class="card">
      <div class="tags"><span class="dia">${esc(p.data)}</span><span>${esc(p.formato)}</span>${d ? `<span class="pilar ${esc(d.pilar)}">${esc(d.pilar)}</span><span>${esc(d.objetivo)}</span><span>funil: ${esc(d.posicaoFunil)}</span>` : ""}</div>
      <div class="titulo">${esc(p.titulo)}</div>
      <div class="row"><b>Gancho:</b> ${esc(p.gancho)}</div>
      <div class="row"><b>Apoio:</b> ${esc(p.apoio)}</div>
      <div class="row"><b>CTA:</b> ${esc(p.cta)}</div>
      <div class="leg"><b>Legenda:</b> ${esc(p.legenda)}</div>
      <div class="leg"><b>Design:</b> ${esc(p.sugestao_design)}</div>
      ${d ? `<div class="pq">💡 <b>Por que agora:</b> ${esc(d.porQueAgora)}</div>` : ""}
    </div>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; color: #0f172a; }
    .hd { background: #0b1e3f; color: #fff; padding: 28px 32px; }
    .hd img { height: 28px; margin-bottom: 12px; }
    .hd h1 { margin: 0; font-size: 22px; } .hd .sub { opacity: .8; font-size: 13px; margin-top: 4px; }
    .obj { background: #f1f5f9; padding: 16px 32px; font-size: 13px; }
    .obj b { color: #0b1e3f; } .obj .nar { font-style: italic; color: #475569; margin-top: 4px; }
    .wrap { padding: 20px 32px; } .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; font-size: 11px; margin-bottom: 8px; }
    .tags span { background: #f1f5f9; border-radius: 4px; padding: 2px 7px; } .tags .dia { background: #0b1e3f; color: #fff; font-weight: 700; }
    .pilar.autoridade { background: #dbeafe; color: #1d4ed8; } .pilar.aproximacao { background: #fef3c7; color: #b45309; } .pilar.comercial { background: #d1fae5; color: #047857; }
    .titulo { font-weight: 700; font-size: 15px; margin-bottom: 6px; } .row { font-size: 13px; margin: 2px 0; } .row b, .leg b, .pq b { color: #0b1e3f; }
    .leg { font-size: 12px; color: #334155; margin-top: 6px; white-space: pre-wrap; }
    .pq { font-size: 12px; color: #475569; border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 6px; }
    .ft { text-align: center; font-size: 10px; color: #94a3b8; padding: 12px; }
  </style></head><body>
    <div class="hd">${logo ? `<img src="${logo}"/>` : ""}<h1>Calendário estratégico — ${cliente}</h1><div class="sub">${periodo}</div></div>
    ${obj ? `<div class="obj"><b>Objetivo:</b> ${esc(obj.objetivoPrincipal)}<div class="nar">“${esc(obj.narrativa)}”</div>${obj.mixPilares ? `<div style="margin-top:4px;font-size:11px;color:#64748b">Mix: ${obj.mixPilares.autoridade}/${obj.mixPilares.aproximacao}/${obj.mixPilares.comercial} (autoridade/aproximação/comercial)</div>` : ""}</div>` : ""}
    <div class="wrap">${cards}</div>
    <div class="ft">Gerado pela Lone — motor de decisão de conteúdo</div>
  </body></html>`;

  const pdf = await htmlToPdf(html);
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "Falha ao gerar PDF" }, { status: 502 });

  const fname = `calendario-${cliente.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}"` },
  });
}
