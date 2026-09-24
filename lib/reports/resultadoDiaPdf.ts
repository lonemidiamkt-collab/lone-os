// RESULTADO DE ONTEM EM PDF — quem pede atenção e quem foi bem, numa folha.
//
// PRA QUE (Roberto, 24/09): a lista de queda chegava como textão no grupo (24 linhas) e só falava
// do lado ruim. Agora: legenda curta no grupo com os números e o PDF com os dois lados.
// Mesmo visual do PDF do bom-dia (lib/reports/bomDiaPdf.ts).

import { ROTULO_RESULTADO } from "@/lib/meta/resultado";
import type { FoiBem } from "@/lib/traffic/resultado-dia";

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";
const CRITICO = "#f2616b";
const BOM = "#3ecf8e";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export interface QuedaDia {
  nome: string;
  sintoma: string;
  severidade: string;
}

export function diaPorExtenso(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit",
  });
}

export function resultadoDiaPdfHtml(quedas: QuedaDia[], bons: FoiBem[], ontem: string, logo: string): string {
  const quedaLinha = (q: QuedaDia) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${LINHA};font-size:12.5px">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;
              background:${q.severidade === "critical" ? CRITICO : ALERTA}"></span>${esc(q.nome)}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid ${LINHA};text-align:right;font-size:12px;color:${SUAVE}">${esc(q.sintoma)}</td>
    </tr>`;

  const bomLinha = (b: FoiBem) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${LINHA};font-size:12.5px">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:8px;background:${BOM}"></span>${esc(b.nome)}
        <div style="color:${BOM};font-size:11px;margin:3px 0 0 15px">${esc(b.motivos.join(" · "))}</div>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid ${LINHA};text-align:right;font-size:11.5px;color:${SUAVE};line-height:1.5;white-space:nowrap">
        <b style="color:${TEXTO}">${b.conversas}</b> ${ROTULO_RESULTADO[b.tipo ?? "mensagens"].varios} <span>(média ${b.mediaConversas.toLocaleString("pt-BR")})</span><br>
        ${brl(b.custo)} por ${ROTULO_RESULTADO[b.tipo ?? "mensagens"].um} <span>(média ${brl(b.mediaCusto)})</span>
      </td>
    </tr>`;

  const bloco = (titulo: string, cor: string, vazio: string, linhas: string) => `
    <h2 style="font-size:15px;margin:22px 0 8px;display:flex;align-items:center;gap:8px">
      <span style="width:4px;height:16px;border-radius:2px;background:${cor};display:inline-block"></span>${titulo}
    </h2>
    <div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:10px;padding:4px 16px">
      ${linhas ? `<table style="width:100%;border-collapse:collapse">${linhas}</table>`
               : `<p style="padding:12px 0;color:${SUAVE};font-size:12px">${vazio}</p>`}
    </div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:${FUNDO}; }
    body { font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:${TEXTO};
           padding:44px 52px; font-size:14px; min-height:100vh; }
    .head { display:flex; align-items:center; justify-content:space-between;
            border-bottom:2px solid ${BRAND}; padding-bottom:16px; margin-bottom:22px; }
    .head img { height:34px; }
    table tr:last-child td { border-bottom:none !important; }
  </style></head><body>
    <div class="head">
      ${logo ? `<img src="${logo}" alt="Lone Mídia">` : `<div style="font-weight:700;font-size:19px">Lone Mídia</div>`}
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Tráfego<br>${esc(diaPorExtenso(ontem))}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">Resultado de ontem</h1>
    <p style="color:${SUAVE};font-size:12.5px">
      ${quedas.length} ${quedas.length === 1 ? "pede" : "pedem"} atenção · ${bons.length} ${bons.length === 1 ? "foi bem" : "foram bem"}
    </p>

    ${bloco(`Pedem atenção (${quedas.length})`, CRITICO, "Nenhuma queda relevante. 👏", quedas.map(quedaLinha).join(""))}
    ${bloco(`Foram bem (${bons.length})`, BOM, "Nenhum cliente acima da própria média ontem.", bons.map(bomLinha).join(""))}

    <div style="margin-top:26px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;text-align:center">
      Comparado com a média dos 7 dias anteriores da própria conta · quem foi bem é bom assunto pro cliente e candidato a mais verba
    </div>
  </body></html>`;
}

/** Legenda curta que acompanha o PDF no grupo. */
export function legendaResultadoDia(quedas: QuedaDia[], bons: FoiBem[], ontem: string): string {
  const partes = [
    quedas.length ? `⚠️ ${quedas.length} ${quedas.length === 1 ? "pede" : "pedem"} atenção` : null,
    bons.length ? `✅ ${bons.length} ${bons.length === 1 ? "foi bem" : "foram bem"}` : null,
  ].filter(Boolean);
  const destaque = bons[0] ? `\nDestaque: *${bons[0].nome}* — ${bons[0].motivos[0]}` : "";
  return `📊 *Resultado de ontem* (${diaPorExtenso(ontem)})\n${partes.join(" · ")}${destaque}\nDetalhes no PDF.`;
}

/** Plano B se o PDF não sair: o texto de sempre, agora com o lado bom. */
export function textoResultadoDia(quedas: QuedaDia[], bons: FoiBem[], ontem: string): string {
  return [
    `📊 *Resultado de ontem* (${diaPorExtenso(ontem)})`,
    ...(quedas.length ? ["", `⚠️ *Pedem atenção (${quedas.length})*`, ...quedas.map((q) => `• *${q.nome}* — ${q.sintoma}`)] : []),
    ...(bons.length ? ["", `✅ *Foram bem (${bons.length})*`, ...bons.map((b) => `• *${b.nome}* — ${b.motivos.join(" · ")}`)] : []),
    "", "Comparado com a média dos 7 dias anteriores da própria conta.",
  ].join("\n");
}
