// lib/reports/relatorioCrmPdf.ts — a folha "ATENDIMENTO E VENDAS" do PDF do relatório (semanal e mensal), com os
// números do CRM do cliente (Âncora, Kommo ou API aberta — lib/crm-externo). Puro: recebe o bloco pronto
// (lib/crm-externo/relatorio.ts) e devolve o miolo; relatorioClientePdf.ts põe cabeçalho e rodapé.
//
// Mesmo desenho das folhas da Meta e do Google: os números numa faixa com o principal em destaque, blocos
// separados por linha fina, classes do CSS de relatorioClientePdf.ts. Aqui só o que é do CRM.
//
// Bloco indisponível NÃO entra (o motivo vai para o time em `avisos`); só o que o CRM respondeu aparece.

import { formatarVariacao } from "@/components/ui/painel-comparativo-utils";
import { formatarCrm, formatarCentavos, formatarDuracao, type KpiCrm, type RelatorioCrm } from "@/lib/crm-externo/relatorio";

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");

export const NOTA_CRM = "Números do CRM do cliente, contados pelo próprio CRM. Tempo de resposta e ciclo são medianas (metade foi mais rápida, metade mais lenta). O funil é o retrato do dia em que o relatório foi gerado.";

function variacaoHtml(k: KpiCrm, legenda: string): string {
  if (k.valor == null || k.anterior == null || k.variacaoPct == null) return "";
  const txt = formatarVariacao(k.variacaoPct).replace(/^[+−-]/, "");
  const seta = txt === "0%" ? "" : k.variacaoPct > 0 ? "▲ " : "▼ ";
  return `<span class="delta delta-${k.tom}">${seta}${txt}</span><span class="antes">${esc(legenda)}: ${esc(formatarCrm(k.anterior, k.formato))}</span>`;
}

function faixa(kpis: KpiCrm[], principal: string, legenda: string): string {
  const cel = kpis.map((k) => `<div class="kpi${k.chave === principal ? " kpi-principal" : ""}">
      <div class="rotulo">${esc(k.rotulo)}</div>
      <div class="kpi-valor">${esc(formatarCrm(k.valor, k.formato))}</div>
      <div class="kpi-linha">${variacaoHtml(k, legenda)}</div>
      ${k.nota ? `<div class="kpi-nota">${esc(k.nota)}</div>` : ""}
    </div>`).join("");
  return `<section class="faixa" style="grid-template-columns: 1.25fr repeat(${Math.max(kpis.length - 1, 1)}, 1fr)">${cel}</section>`;
}

function barra(rotulo: string, valor: number, total: number, classe = ""): string {
  const p = total > 0 ? (valor / total) * 100 : 0;
  return `<div class="idade ${classe}"><span class="crm-rot">${esc(rotulo)}</span><span class="idade-trilho"><span style="width:${p.toFixed(1)}%"></span></span><span class="crm-num">${inteiro(valor)}</span></div>`;
}

export function folhaCrm(r: RelatorioCrm | null | undefined, clienteNome: string): string | null {
  if (!r || r.semDados) return null;
  const k = (c: string) => r.kpis.find((x) => x.chave === c);
  const ordem = ["vendas", "leads", "resposta", "faturamento", "orcamentos"];
  const faixaKpis = ordem.map(k).filter((x): x is KpiCrm => !!x).slice(0, 5);
  const principal = faixaKpis[0]?.chave ?? "";
  const legAnt = /\s/.test(r.vocab.legendaAnterior.trim()) ? "anterior" : r.vocab.legendaAnterior.toLowerCase();
  const antes = r.anterior && r.kpis.some((x) => x.anterior != null) ? `Comparado com ${r.anterior.rotulo}.` : "";

  const resposta = r.resposta ? (() => {
    const t = r.resposta.boa + r.resposta.atencao + r.resposta.estourada;
    return `<section class="bloco"><h2>Primeira resposta ao lead</h2>
      <div class="sub">${inteiro(t)} lead${t === 1 ? "" : "s"} respondido${t === 1 ? "" : "s"} no período${r.resposta.p90Seg != null ? ` · 9 em cada 10 em até ${esc(formatarDuracao(r.resposta.p90Seg))}` : ""}</div>
      <div class="crm-barras">
        ${barra("Menos de 5 min", r.resposta.boa, t, "crm-boa")}
        ${barra("5 a 10 min", r.resposta.atencao, t, "crm-atencao")}
        ${barra("Mais de 10 min", r.resposta.estourada, t, "crm-estourada")}
      </div></section>`;
  })() : "";

  const outros: [string, string][] = [];
  const add = (c: string) => { const x = k(c); if (x && !faixaKpis.includes(x)) outros.push([x.rotulo, formatarCrm(x.valor, x.formato)]); };
  ["faturamento", "orcamentos", "ciclo", "conversao", "resposta_boa", "perdidos"].forEach(add);
  if (r.recuperadas) outros.push(["Vendas recuperadas", `${inteiro(r.recuperadas.negocios)} · ${formatarCentavos(r.recuperadas.valorCentavos)}`]);
  if (r.abertos) outros.push(["Em negociação agora", `${inteiro(r.abertos.quantidade)}${r.abertos.valorCentavos ? ` · ${formatarCentavos(r.abertos.valorCentavos)}` : ""}`]);
  const lateral = outros.length ? `<section class="bloco lateral"><div class="outros"><div class="rotulo">Outros números</div>
      ${outros.map(([a, b]) => `<div class="numero"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div></section>` : "";

  const funil = r.funil?.length ? (() => {
    const etapas = r.funil.slice(0, 10);
    const maior = Math.max(...etapas.map((e) => e.negocios));
    return `<section class="bloco"><h2>Funil agora</h2>
      <div class="sub">Negócios em aberto em cada etapa, no dia do relatório${r.funil.length > etapas.length ? ` · ${r.funil.length - etapas.length} etapa(s) menor(es) fora da lista` : ""}</div>
      <div class="crm-barras crm-funil">${etapas.map((e) => barra(e.etapa, e.negocios, maior)).join("")}</div></section>`;
  })() : "";

  const meio = resposta || lateral ? `<div class="duas${resposta && lateral ? "" : " duas-uma"}">${resposta}${lateral}</div>` : "";
  return `<section class="abertura">
      <div class="olho olho-crm">Atendimento e vendas · ${esc(r.rotuloProvedor)} · ${esc(r.janela.rotulo)}</div>
      <h1>${esc(clienteNome)}</h1>
      <p class="frase">${esc(r.frase)}</p>
      ${antes ? `<p class="frase-sub">${esc(antes)}</p>` : ""}
    </section>
    ${faixaKpis.length ? faixa(faixaKpis, principal, legAnt) : ""}
    ${meio}
    ${funil}`;
}

// Cores de estado (impresso — literal permitido, igual às do Google). O resto vem do CSS da folha.
export const CSS_CRM = `
.olho-crm { color: #2BB673; }
.crm-barras { margin-top: 3.5mm; }
.crm-rot { width: 120px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crm-funil .crm-rot { width: 170px; }
.crm-num { width: 36px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.crm-boa .idade-trilho span { background: #2BB673 !important; }
.crm-atencao .idade-trilho span { background: #E8A33D !important; }
.crm-estourada .idade-trilho span { background: #E5534B !important; }
`;
