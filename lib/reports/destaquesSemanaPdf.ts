// O PDF DE DESTAQUES DO TRÁFEGO — toda segunda, 11h, no grupo de tráfego.
//
// Mesmo desenho do comparativo que o Roberto pediu em 05/10 (sexta × fim de semana): faixa de
// números da carteira em cima, depois quem melhorou nas duas pontas, quem piorou nas duas, e quem
// parou de gastar. Regra de quem entra em cada lista: lib/traffic/destaques-semana.ts.

import type { DestaquesSemana, LinhaDestaque } from "@/lib/traffic/destaques-semana";

const C = {
  fundo: "#111318", cartao: "#181b22", linha: "#272b36", linhaFina: "#20242e",
  texto: "#eef0f6", secundario: "#c5c9d3", suave: "#9ca3b4", marca: "#2b3cff", marcaClara: "#5a68ff",
  bom: "#4ADE80", ruim: "#F2616B", atencao: "#FBB13C",
};

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
/** "+12%" / "−9%" com sinal de menos de verdade. */
const sinal = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(Math.round(p))}%`;
const diaMes = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export interface OpcoesDestaques {
  dados: DestaquesSemana;
  atual: { de: string; ate: string };
  anterior: { de: string; ate: string };
  geradoEm: string; // DD/MM/AAAA
  /** Quantos mostrar por lista; o resto vira "e mais N". */
  limite?: number;
}

function tabela(linhas: LinhaDestaque[], cor: string, limite: number): string {
  const mostradas = linhas.slice(0, limite);
  const maxAbs = Math.max(1, ...mostradas.map((l) => Math.abs(l.varCusto)));
  const tr = mostradas.map((l) => `<tr${l.poucoVolume ? ' class="pouco"' : ""}>
      <td class="cli">${esc(l.cliente)}${l.poucoVolume ? '<span class="tag">pouco volume</span>' : ""}</td>
      <td class="n">${int(l.conversasAnterior)} → ${int(l.conversasAtual)}</td>
      <td class="d" style="color:${cor}">${sinal(l.varConversas)}</td>
      <td class="n">${brl(l.custoAnterior)} → ${brl(l.custoAtual)}</td>
      <td class="barra"><span style="width:${Math.max(4, (Math.abs(l.varCusto) / maxAbs) * 100).toFixed(0)}%;background:${cor}"></span><b style="color:${cor}">${sinal(l.varCusto)}</b></td>
    </tr>`).join("");
  const resto = linhas.length - mostradas.length;
  return `<table>
    <thead><tr><th>Cliente</th><th>Conversas na semana</th><th>Volume</th><th>Custo por conversa</th><th>Custo</th></tr></thead>
    <tbody>${tr}</tbody>
  </table>${resto > 0 ? `<p class="resto">e mais ${resto} ${resto === 1 ? "cliente" : "clientes"} nesta lista</p>` : ""}`;
}

export function destaquesSemanaHtml(o: OpcoesDestaques): string {
  const { dados: d } = o;
  const lim = o.limite ?? 25;
  const k = d.carteira;
  const varCusto = k.custoAtual != null && k.custoAnterior ? (k.custoAtual / k.custoAnterior - 1) * 100 : null;
  const varConv = k.conversasAnterior > 0 ? (k.conversasAtual / k.conversasAnterior - 1) * 100 : null;
  const varGasto = k.gastoAnterior > 0 ? (k.gastoAtual / k.gastoAnterior - 1) * 100 : null;
  const periodo = `${diaMes(o.atual.de)} a ${diaMes(o.atual.ate)}`;
  const periodoAnt = `${diaMes(o.anterior.de)} a ${diaMes(o.anterior.ate)}`;

  const secao = (titulo: string, sub: string, corpo: string) => `<section class="bloco"><h2>${titulo}</h2><div class="sub">${sub}</div>${corpo}</section>`;
  const vazio = (t: string) => `<p class="vazio">${t}</p>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@page { size: A4; margin: 0; }
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
html, body { background:${C.fundo}; }
body { color:${C.texto}; font-family:Inter,-apple-system,Arial,sans-serif; font-size:9.5pt; }
/* clone: o recuo de cima e de baixo se repete em cada página — sem isso a página 2 começava colada na borda. */
.folha { width:210mm; min-height:296.6mm; padding:11mm 13mm 9mm; display:flex; flex-direction:column; gap:5mm; -webkit-box-decoration-break:clone; box-decoration-break:clone; }
.topo { display:flex; justify-content:space-between; align-items:center; padding-bottom:3mm; border-bottom:1px solid ${C.linha}; }
.marca { font-size:9pt; font-weight:600; letter-spacing:.06em; }
.topo span { font-size:8.5pt; color:${C.suave}; }
.olho { font-size:7pt; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:${C.marcaClara}; margin-bottom:5px; }
h1 { font-size:20pt; font-weight:600; letter-spacing:-.02em; line-height:1.1; }
.frase { margin-top:3mm; font-size:10.5pt; color:${C.secundario}; line-height:1.45; max-width:172mm; }
.faixa { display:grid; grid-template-columns:repeat(4,1fr); background:${C.cartao}; border:1px solid ${C.linha}; border-radius:12px; overflow:hidden; }
.k { padding:10px 13px; } .k + .k { border-left:1px solid ${C.linha}; }
.k .r { font-size:6.6pt; font-weight:600; letter-spacing:.09em; text-transform:uppercase; color:${C.suave}; }
.k .v { font-size:18pt; font-weight:600; letter-spacing:-.02em; margin-top:5px; }
.k .s { font-size:7.3pt; color:${C.suave}; margin-top:3px; }
h2 { font-size:10.5pt; font-weight:600; } .sub { font-size:7.8pt; color:${C.suave}; margin-top:2px; }
.bloco { border-top:1px solid ${C.linha}; padding-top:3.2mm; }
.bloco h2, .bloco .sub, thead { break-after:avoid; } tr { break-inside:avoid; }
table { width:100%; border-collapse:collapse; margin-top:3mm; font-variant-numeric:tabular-nums; }
th { text-align:left; font-size:6.6pt; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:${C.suave}; padding:0 6px 6px 0; border-bottom:1px solid ${C.linha}; }
td { padding:6px 6px 6px 0; border-bottom:1px solid ${C.linhaFina}; vertical-align:middle; white-space:nowrap; }
td.cli { font-weight:500; white-space:normal; }
.tag { display:inline-block; margin-left:6px; padding:0 5px; border:1px solid ${C.linha}; border-radius:4px; font-size:6.3pt; color:${C.suave}; line-height:12px; vertical-align:1px; font-weight:400; }
tr.pouco td { color:${C.suave}; } tr.pouco td.cli { color:${C.secundario}; }
td.d { font-weight:600; font-size:8.4pt; }
td.barra { width:34mm; }
td.barra span { display:inline-block; height:7px; opacity:.75; border-radius:0 3px 3px 0; vertical-align:middle; max-width:22mm; }
td.barra b { margin-left:6px; font-weight:600; font-size:8.4pt; }
.resto, .vazio { font-size:7.8pt; color:${C.suave}; margin-top:2.5mm; }
.parados { margin-top:3mm; display:flex; flex-wrap:wrap; gap:4px 18px; font-size:8.4pt; }
.parados span { color:${C.suave}; }
.nota { font-size:7.6pt; color:${C.suave}; line-height:1.5; }
.rodape { margin-top:auto; padding-top:3mm; border-top:1px solid ${C.linha}; display:flex; justify-content:space-between; font-size:6.8pt; color:${C.suave}; }
</style></head><body><div class="folha">
<header class="topo"><div class="marca">LONE MÍDIA</div><span>Uso interno · tráfego</span></header>
<section>
  <div class="olho">Semana ${periodo} × ${periodoAnt}</div>
  <h1>Destaques do tráfego</h1>
  <p class="frase">${d.melhoraram.length} ${d.melhoraram.length === 1 ? "cliente melhorou" : "clientes melhoraram"} nas duas pontas (mais conversas e custo menor) e ${d.pioraram.length} ${d.pioraram.length === 1 ? "piorou" : "pioraram"} nas duas (menos conversas e custo maior). Semana fechada contra a anterior, de segunda a domingo.</p>
</section>
<section class="faixa">
  <div class="k"><div class="r">Melhoraram</div><div class="v" style="color:${C.bom}">${d.melhoraram.length}</div><div class="s">de ${d.avaliados} comparáveis</div></div>
  <div class="k"><div class="r">Pioraram</div><div class="v" style="color:${d.pioraram.length ? C.ruim : C.texto}">${d.pioraram.length}</div><div class="s">${d.mistos} com resultado misto</div></div>
  <div class="k"><div class="r">Custo por conversa</div><div class="v">${k.custoAtual != null ? brl(k.custoAtual) : "—"}</div><div class="s">${k.custoAnterior != null ? `carteira · antes ${brl(k.custoAnterior)}${varCusto != null ? ` · ${sinal(varCusto)}` : ""}` : "carteira"}</div></div>
  <div class="k"><div class="r">Conversas</div><div class="v">${int(k.conversasAtual)}</div><div class="s">carteira · antes ${int(k.conversasAnterior)}${varConv != null ? ` · ${sinal(varConv)}` : ""}${varGasto != null ? ` · gasto ${sinal(varGasto)}` : ""}</div></div>
</section>
${secao("Melhoraram nas duas pontas", "Mais conversas e custo por conversa menor · quem tem volume primeiro, depois a maior mudança somando as duas pontas",
  d.melhoraram.length ? tabela(d.melhoraram, C.bom, lim) : vazio("Nenhum cliente melhorou nas duas pontas nesta semana."))}
${secao("Pioraram nas duas pontas", "Menos conversas e custo por conversa maior · quem tem volume primeiro, depois a maior mudança somando as duas pontas",
  d.pioraram.length ? tabela(d.pioraram, C.ruim, lim) : vazio("Nenhum cliente piorou nas duas pontas nesta semana."))}
${d.pararam.length ? secao("Pararam de gastar", "Tinham anúncio rodando na semana anterior e não gastaram nada nesta",
  `<div class="parados">${d.pararam.map((p) => `<div>${esc(p.cliente)} <span>· antes: ${brl(p.gastoAnterior)}, ${int(p.conversasAnterior)} conversas</span></div>`).join("")}</div>`) : ""}
<section class="bloco nota">
  <p><b>Pouco volume</b> = menos de 10 conversas na semana anterior: a porcentagem fica grande com pouco, vale como sinal. Só entra na comparação quem teve pelo menos 3 conversas em cada semana.</p>
</section>
<footer class="rodape"><span>Números da Meta (Gerenciador de Anúncios), dias fechados.</span><span>Gerado pelo Lone OS em ${esc(o.geradoEm)}</span></footer>
</div></body></html>`;
}

/** A legenda no grupo: os números sem abrir o arquivo. */
export function legendaDestaques(o: OpcoesDestaques, gestorTrecho = ""): string {
  const { dados: d } = o;
  const k = d.carteira;
  const custo = k.custoAtual != null && k.custoAnterior
    ? `Carteira: custo por conversa ${brl(k.custoAnterior)} → ${brl(k.custoAtual)} (${sinal((k.custoAtual / k.custoAnterior - 1) * 100)}).` : "";
  return `📊 *Destaques do tráfego* — semana ${diaMes(o.atual.de)} a ${diaMes(o.atual.ate)}${gestorTrecho ? ` · ${gestorTrecho}` : ""}\n`
    + `🟢 ${d.melhoraram.length} melhoraram · 🔴 ${d.pioraram.length} pioraram${d.pararam.length ? ` · ⏸️ ${d.pararam.length} pararam de gastar` : ""}\n`
    + `${custo} O detalhe está no PDF.`;
}
