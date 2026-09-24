// lib/reports/relatorioClientePdf.ts — o HTML do relatório do cliente (semanal e mensal), que vira PDF
// no browserless (lib/traffic/renderPdf.ts). Puro: recebe o relatório pronto (relatorioCliente.ts) e o
// snapshot do Instagram, devolve a string.
//
// Mesmo desenho do portal do cliente e do painel comparativo (tema escuro): cartões, número grande
// com o selo de variação, gráfico do período (linha cheia) sobre o anterior (tracejado), público com
// barra de gênero e faixas etárias com percentual.
//
// Documento impresso: cor literal é permitida aqui (skill designer, exceção de PDF). Os valores são
// os tokens do tema escuro de app/globals.css, pra o PDF ter a cara do portal.
//
// PÁGINA. Cada .folha tem a altura de uma A4 e é uma coluna flex: o gráfico estica pra ocupar o que
// sobra (o PDF antigo deixava meia página vazia embaixo). Com Instagram, a folha 2 é do Instagram —
// decisão antiga que continua valendo: anúncio e perfil não se misturam na mesma página.

import type { IgSnapshot, IgAudiencia } from "@/lib/meta/igSnapshot";
import { formatarVariacao } from "@/components/ui/painel-comparativo-utils";
import { formatarBRL } from "@/lib/portal/formatos";
import { resumoInstagram } from "@/lib/portal/formatDelta";
import {
  ticksRedondos, diaDaSemana, diaCurto, diaLongo, formatarPctCurto,
  type RelatorioAnuncios, type KpiRelatorio, type Criativo, type Conjunto, type Publico, type Janela,
} from "./relatorioCliente";

// Tokens do tema escuro (app/globals.css) — literais porque é documento impresso.
const C = {
  fundo: "#111318",
  cartao: "#181b22",
  cartao2: "#1d2029",
  linha: "#272b36",
  texto: "#eef0f6",
  secundario: "#c5c9d3",
  suave: "#9ca3b4",
  marca: "#2b3cff",
  marcaClara: "#5a68ff",
  mulheres: "#8b5cf6", // chart-4, a mesma cor de "Mulheres" no portal
  bom: "#4ADE80",
  atencao: "#FBB13C",
  instagram: "#c13584", // cor de marca de terceiro (Instagram)
};

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");

export interface OpcoesRelatorio {
  clienteNome: string;
  /** data: URI da logo (loadLoneLogo) ou URL absoluta. "" = só o nome em texto. */
  logo: string;
  /** Data de geração, AAAA-MM-DD (São Paulo). */
  geradoEm: string;
  anuncios: RelatorioAnuncios | null;
  instagram?: IgSnapshot | null;
  /** Janela pedida — usada no cabeçalho quando não há anúncios (cliente só de Instagram). */
  janela: Janela;
}

// ── Pedaços ──────────────────────────────────────────────────────────────────

function cabecalho(o: OpcoesRelatorio, titulo: string): string {
  const marca = o.logo
    ? `<img class="logo" src="${esc(o.logo)}" alt=""><span class="marca-nome">LONE MÍDIA</span>`
    : `<span class="marca-nome">LONE MÍDIA</span>`;
  return `<header class="topo">
    <div class="marca">${marca}</div>
    <div class="topo-dir"><div class="topo-titulo">${esc(titulo)}</div><div class="topo-periodo">${esc(o.janela.rotulo)}</div></div>
  </header>`;
}

function rodape(o: OpcoesRelatorio, pagina: number, total: number, nota: string): string {
  const [a, m, d] = o.geradoEm.split("-");
  return `<footer class="rodape">
    <div class="rodape-nota">${nota}</div>
    <div class="rodape-dir">Gerado pelo Lone OS em ${d}/${m}/${a}${total > 1 ? ` · ${pagina}/${total}` : ""}</div>
  </footer>`;
}

function valorKpi(k: KpiRelatorio): string {
  if (k.valor == null) return "—";
  return k.chave === "investimento" || k.chave === "custo" ? formatarBRL(k.valor) : inteiro(k.valor);
}

function kpiHtml(k: KpiRelatorio, r: RelatorioAnuncios): string {
  const cor = k.tom === "bom" ? C.bom : k.tom === "ruim" ? C.atencao : C.suave;
  const selo = k.variacaoPct != null
    ? `<span class="selo" style="color:${cor};border-color:${cor}55;background:${cor}14">${formatarVariacao(k.variacaoPct)}</span>`
    : "";
  // Curto de propósito: "Comparado com 7 a 13 set" já está na frase do topo.
  const antes = k.valor == null
    ? (k.chave === "alcance" ? "não informado pela Meta" : "")
    : k.anterior != null
      ? `anterior: ${k.chave === "investimento" || k.chave === "custo" ? formatarBRL(k.anterior) : inteiro(k.anterior)}`
      : r.anterior ? "sem base de comparação" : "";
  return `<div class="kpi${k.chave === "resultados" ? " kpi-destaque" : ""}">
    <div class="rotulo">${esc(k.rotulo)}</div>
    <div class="kpi-valor">${valorKpi(k)}</div>
    <div class="kpi-linha">${selo}<span class="kpi-antes">${antes}</span></div>
    ${k.nota ? `<div class="kpi-nota">${esc(k.nota)}</div>` : ""}
  </div>`;
}

/**
 * Resultado por dia: o período (linha cheia + área) sobre o anterior (tracejado). Eixo a partir do
 * zero com passos redondos e linha RETA entre os dias — sem curva que passe por valor que não existiu.
 * Desenho em HTML + SVG esticável (viewBox 0–100, stroke que não escala): o gráfico ocupa a altura
 * que sobrar na folha sem distorcer texto nem espessura de linha.
 */
function grafico(r: RelatorioAnuncios): string {
  const s = r.serie;
  const n = s.length;
  if (n === 0) return "";
  const maximo = Math.max(0, ...s.map((p) => p.atual), ...s.map((p) => p.anterior ?? 0));
  const ticks = ticksRedondos(maximo);
  const topo = ticks[ticks.length - 1] || 1;
  const X = (i: number) => ((i + 0.5) / n) * 100;
  const Y = (v: number) => (1 - v / topo) * 100;
  const f = (v: number) => v.toFixed(3);

  const linhaAtual = s.map((p, i) => `${i ? "L" : "M"}${f(X(i))},${f(Y(p.atual))}`).join(" ");
  const area = n > 1 ? `${linhaAtual} L${f(X(n - 1))},100 L${f(X(0))},100 Z` : "";
  let linhaAnt = "";
  let aberto = false;
  s.forEach((p, i) => {
    if (p.anterior == null) { aberto = false; return; }
    linhaAnt += `${aberto ? "L" : "M"}${f(X(i))},${f(Y(p.anterior))} `;
    aberto = true;
  });

  const grade = ticks.map((t) => `<div class="g-linha" style="top:${f(Y(t))}%"></div><div class="g-y" style="top:${f(Y(t))}%">${inteiro(t)}</div>`).join("");

  const pico = r.melhorDia?.dia;
  const mostraValores = n <= 16;
  const pontos = s.map((p, i) => {
    const ehPico = p.dia === pico;
    if (!mostraValores && !ehPico) return "";
    const rotulo = mostraValores || ehPico
      ? `<div class="g-valor${ehPico ? " g-valor-pico" : ""}" style="left:${f(X(i))}%;top:${f(Y(p.atual))}%">${inteiro(p.atual)}</div>`
      : "";
    return `<div class="g-ponto${ehPico ? " g-ponto-pico" : ""}" style="left:${f(X(i))}%;top:${f(Y(p.atual))}%"></div>${rotulo}`;
  }).join("");

  const passo = n <= 10 ? 1 : Math.ceil(n / 8);
  const eixoX = s.map((p, i) => (i % passo === 0
    ? `<div class="g-x${p.dia === pico ? " g-x-pico" : ""}" style="left:${f(X(i))}%">${esc(n <= 10 ? diaDaSemana(p.dia) : diaCurto(p.dia))}</div>`
    : "")).join("");

  const temAnterior = s.some((p) => p.anterior != null);
  const legenda = `<div class="legenda">
      <span><i class="leg-cheia"></i>${esc(r.vocab.legendaAtual)} · ${inteiro(r.total)}</span>
      ${temAnterior && r.totalAnterior != null ? `<span><i class="leg-tracejada"></i>${esc(r.vocab.legendaAnterior)} · ${inteiro(r.totalAnterior)}</span>` : ""}
    </div>`;

  const sub = r.melhorDia
    ? `Melhor dia: ${esc(diaLongo(r.melhorDia.dia))}, com ${inteiro(r.melhorDia.valor)} ${r.melhorDia.valor === 1 ? esc(r.palavras.um) : esc(r.palavras.varios)}`
    : `Nenhum dia com ${esc(r.palavras.varios)} no período`;

  return `<section class="cartao grafico">
    <div class="cartao-topo">
      <div><h2>${esc(r.palavras.Varios)} por dia</h2><div class="sub">${sub}</div></div>
      ${legenda}
    </div>
    <div class="g-area">
      ${grade}
      <svg class="g-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="g-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${C.marca}" stop-opacity="0.28"/><stop offset="100%" stop-color="${C.marca}" stop-opacity="0"/>
        </linearGradient></defs>
        ${area ? `<path d="${area}" fill="url(#g-grad)" stroke="none"/>` : ""}
        ${linhaAnt ? `<path d="${linhaAnt.trim()}" fill="none" stroke="${C.suave}" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` : ""}
        ${n > 1 ? `<path d="${linhaAtual}" fill="none" stroke="${C.marca}" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
      </svg>
      ${pontos}
      ${eixoX}
    </div>
  </section>`;
}

function miniatura(c: Criativo, i: number): string {
  return c.miniatura
    ? `<img class="mini" src="${esc(c.miniatura)}" alt="">`
    : `<div class="mini mini-vazia">${i + 1}º</div>`;
}

function criativosHtml(r: RelatorioAnuncios): string {
  if (!r.criativos.length) {
    return `<section class="cartao lista"><h2>Anúncios em destaque</h2>
      <div class="vazio">Nenhum anúncio registrou ${esc(r.palavras.varios)} no período.</div></section>`;
  }
  const itens = r.criativos.map((c, i) => `<div class="criativo">
      ${miniatura(c, i)}
      <div class="criativo-texto">
        <div class="criativo-nome">${esc(c.nome)}</div>
        <div class="criativo-meta"><b>${inteiro(c.resultados)} ${c.resultados === 1 ? esc(r.palavras.um) : esc(r.palavras.varios)}</b>${c.custo != null ? ` · ${formatarBRL(c.custo)} ${esc(r.palavras.porUm)}` : ""}</div>
      </div>
    </div>`).join("");
  return `<section class="cartao lista">
    <h2>Anúncios que mais trouxeram ${esc(r.palavras.varios)}</h2>
    <div class="sub">Os ${r.criativos.length === 1 ? "" : `${r.criativos.length} `}primeiros do período, pelo número de ${esc(r.palavras.varios)}</div>
    <div class="criativos">${itens}</div>
  </section>`;
}

function conjuntoHtml(c: Conjunto, r: RelatorioAnuncios): string {
  return `<div class="conjunto">
    <div class="rotulo">Conjunto com menor ${esc(r.palavras.custo.toLowerCase())}</div>
    <div class="conjunto-nome">${esc(c.nome)}</div>
    ${c.campanha ? `<div class="conjunto-camp">Campanha ${esc(c.campanha)}</div>` : ""}
    <div class="conjunto-valor">${formatarBRL(c.custo)} <span>${esc(r.palavras.porUm)}</span></div>
    <div class="conjunto-camp">${inteiro(c.resultados)} ${c.resultados === 1 ? esc(r.palavras.um) : esc(r.palavras.varios)} com ${formatarBRL(c.investimento)} investidos</div>
  </div>`;
}

function maisNumerosHtml(r: RelatorioAnuncios): string {
  const linhas: [string, string][] = [
    ["Cliques no link", inteiro(r.cliquesLink)],
    ["Vezes que os anúncios apareceram", inteiro(r.impressoes)],
  ];
  if (r.melhorDia) linhas.push(["Melhor dia", `${diaLongo(r.melhorDia.dia)} · ${inteiro(r.melhorDia.valor)}`]);
  return `<div class="numeros">${linhas.map(([k, v]) => `<div class="numero"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>`;
}

function destaquesHtml(r: RelatorioAnuncios): string {
  // "Nenhum anúncio trouxe conversa" só quando o período não teve conversa mesmo. Leitura por anúncio
  // que falhou — ou que veio vazia enquanto as campanhas somam resultado — omite o cartão.
  const mostraCriativos = !r.criativosIndisponiveis && (r.criativos.length > 0 || r.total === 0);
  return `<div class="linha-cartoes">
    ${mostraCriativos ? criativosHtml(r) : ""}
    <section class="cartao lateral">
      ${r.conjunto ? conjuntoHtml(r.conjunto, r) : `<div class="rotulo">Mais números do período</div>`}
      ${maisNumerosHtml(r)}
    </section>
  </div>`;
}

function barraGenero(g: { mulheres: number; homens: number }): string {
  return `<div class="genero-barra">
      <div style="width:${g.mulheres}%;background:${C.mulheres}"></div>
      <div style="width:${g.homens}%;background:${C.marca}"></div>
    </div>
    <div class="genero-legenda">
      <div><span class="bolinha" style="background:${C.mulheres}"></span>Mulheres<b>${formatarPctCurto(g.mulheres)}</b></div>
      <div><span class="bolinha" style="background:${C.marca}"></span>Homens<b>${formatarPctCurto(g.homens)}</b></div>
    </div>`;
}

function barrasIdade(idades: { faixa: string; pct: number }[]): string {
  const maior = Math.max(1, ...idades.map((i) => i.pct));
  return idades.map((i) => `<div class="idade${i.pct === maior ? " idade-maior" : ""}">
      <span class="idade-faixa">${esc(i.faixa)}</span>
      <span class="idade-trilho"><span style="width:${i.pct > 0 ? Math.max(2, (i.pct / maior) * 100) : 0}%"></span></span>
      <span class="idade-pct">${formatarPctCurto(i.pct)}</span>
    </div>`).join("");
}

function publicoHtml(p: Publico, leitura: string | null, titulo: string, sub: string): string {
  return `<section class="cartao publico">
    <div class="cartao-topo"><div><h2>${esc(titulo)}</h2><div class="sub">${esc(sub)}</div></div></div>
    ${leitura ? `<div class="leitura">${esc(leitura)}</div>` : ""}
    <div class="publico-colunas">
      ${p.genero ? `<div class="publico-genero"><div class="rotulo">Gênero</div>${barraGenero(p.genero)}</div>` : ""}
      ${p.idades.length ? `<div class="publico-idade"><div class="rotulo">Faixa etária</div>${barrasIdade(p.idades)}</div>` : ""}
    </div>
  </section>`;
}

// ── Instagram ────────────────────────────────────────────────────────────────

function igAudiencia(a: IgAudiencia): string {
  const temGenero = a.generoFemPct != null && a.generoMascPct != null;
  const idades = [...a.idades].sort((x, y) => (parseInt(x.faixa, 10) || 0) - (parseInt(y.faixa, 10) || 0));
  if (!temGenero && !idades.length && !a.cidades.length) return "";
  return `<section class="cartao publico">
    <div class="cartao-topo"><div><h2>Quem segue o perfil</h2><div class="sub">Seguidores por gênero, idade e cidade</div></div></div>
    <div class="publico-colunas">
      ${temGenero ? `<div class="publico-genero"><div class="rotulo">Gênero</div>${barraGenero({ mulheres: a.generoFemPct!, homens: a.generoMascPct! })}</div>` : ""}
      ${idades.length ? `<div class="publico-idade"><div class="rotulo">Faixa etária</div>${barrasIdade(idades)}</div>` : ""}
      ${a.cidades.length ? `<div class="publico-cidades"><div class="rotulo">Principais cidades</div>${a.cidades.map((c, i) => `<div class="cidade"><span class="cidade-n">${i + 1}</span><span class="cidade-nome">${esc(c.nome)}</span><b>${formatarPctCurto(c.pct)}</b></div>`).join("")}</div>` : ""}
    </div>
  </section>`;
}

function igPosts(snap: IgSnapshot): string {
  const posts = (snap.posts ?? []).slice(0, 6);
  if (!posts.length) {
    return `<section class="cartao"><h2>Posts do período</h2>
      <div class="vazio">Nenhum post publicado no período. Os números acima são do perfil como um todo.</div></section>`;
  }
  const quando = (iso: string | null) => (iso ? diaCurto(new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) : "");
  const cartoes = posts.map((p) => `<div class="post">
      <div class="post-img">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" onerror="this.remove()">` : ""}</div>
      <div class="post-meta"><span>${esc(quando(p.data))}</span><span>${p.curtidas != null ? `${inteiro(p.curtidas)} curtidas` : ""}${p.comentarios != null ? ` · ${inteiro(p.comentarios)} coment.` : ""}</span></div>
    </div>`).join("");
  return `<section class="cartao posts-cartao${posts.length > 3 ? " estica" : ""}">
    <h2>Posts no ar no período</h2>
    <div class="sub">Os que mais engajaram primeiro</div>
    <div class="posts posts-${posts.length > 3 ? "duas" : "uma"}">${cartoes}</div>
  </section>`;
}

function igKpis(snap: IgSnapshot, temAnuncios: boolean): string {
  const r = snap.resumo;
  const publico = snap.fonte === "publico";
  const k = (rotulo: string, valor: string, nota?: string) =>
    `<div class="kpi"><div class="rotulo">${esc(rotulo)}</div><div class="kpi-valor">${esc(valor)}</div>${nota ? `<div class="kpi-nota">${esc(nota)}</div>` : ""}</div>`;
  const fmt = (v: number | null | undefined) => (v == null ? "—" : inteiro(v));
  const ganhos = r?.seguidoresGanhos;
  return `<div class="kpis">
    ${k("Seguidores", fmt(snap.conta?.seguidores))}
    ${publico ? "" : k("Seguidores novos", ganhos == null ? "—" : `${ganhos > 0 ? "+" : ""}${inteiro(ganhos)}`)}
    ${publico ? "" : k("Alcance do perfil", fmt(r?.alcance), r?.alcanceJanelaDias ? `Últimos ${r.alcanceJanelaDias} dias${temAnuncios ? " · inclui quem veio pelos anúncios" : ""}` : undefined)}
    ${k("Posts no período", fmt(r?.postsNoPeriodo))}
  </div>`;
}

/** `clienteNome` = relatório só de Instagram: o nome do cliente é o título e o @ vem embaixo. */
function igConteudo(snap: IgSnapshot, clienteNome?: string): string {
  const dias = snap.periodo === "30d" ? 30 : snap.periodo === "14d" ? 14 : 7;
  const frase = resumoInstagram(dias, snap.resumo ?? null);
  const titulo = clienteNome
    ? `<h1>${esc(clienteNome)}</h1><div class="sub" style="font-size:9pt;margin-top:2px">@${esc(snap.conta?.username)}</div>`
    : `<h1 class="h1-menor">@${esc(snap.conta?.username)}</h1>`;
  return `<section class="abertura">
      <div class="olho" style="color:${C.instagram}">Instagram · últimos ${esc(snap.periodoLabel ?? `${dias} dias`)}</div>
      ${titulo}
      ${frase ? `<div class="frase frase-ig">${esc(frase)}</div>` : ""}
    </section>
    ${igKpis(snap, !clienteNome)}
    ${igPosts(snap)}
    ${snap.audiencia ? igAudiencia(snap.audiencia) : ""}`;
}

// ── Documento ────────────────────────────────────────────────────────────────

const NOTA_META = "Números da Meta (Gerenciador de Anúncios), com atribuição de 7 dias após o clique. Pode haver pequena diferença em relação ao Gerenciador por atraso de processamento.";
const NOTA_IG = "Números do Instagram (Meta). O alcance do perfil inclui quem chegou pelos anúncios — não some com o alcance dos anúncios.";
const NOTA_SO_IG = "Números do Instagram (Meta). Seguidores e público do perfil são de hoje; alcance e posts, da janela indicada no topo.";

export function relatorioClienteHtml(o: OpcoesRelatorio): string {
  const r = o.anuncios;
  const ig = o.instagram && o.instagram.mapped && !o.instagram.error && o.instagram.conta ? o.instagram : null;
  const titulo = r ? r.vocab.titulo : o.janela.tipo === "semana" ? "Relatório semanal" : "Relatório mensal";
  const folhas: string[] = [];

  if (r) {
    const antes = r.anterior ? `Comparado com ${r.anterior.rotulo}.` : "";
    folhas.push(`${cabecalho(o, titulo)}
      <section class="abertura">
        <div class="olho">Resultado dos anúncios · ${esc(r.janela.rotulo)}</div>
        <h1>${esc(o.clienteNome)}</h1>
        <div class="frase">${esc(r.frase)}${antes ? `<div class="frase-sub">${esc(antes)}</div>` : ""}</div>
      </section>
      <div class="kpis">${r.kpis
        // Alcance que a Meta não devolveu some do PDF (é logado no servidor): lacuna não vira "—".
        .filter((k) => !(k.chave === "alcance" && k.valor == null))
        .map((k) => kpiHtml(k, r)).join("")}</div>
      ${grafico(r)}
      ${destaquesHtml(r)}
      ${r.publico ? publicoHtml(r.publico, r.leituraPublico, "Quem viu seus anúncios", `Pessoas alcançadas, por gênero e idade. Faixa com 0% não foi alcançada no período.`) : ""}
      __RODAPE__`);
  }
  if (ig) {
    folhas.push(`${cabecalho(o, titulo)}
      ${igConteudo(ig, r ? undefined : o.clienteNome)}
      __RODAPE__`);
  }

  const total = folhas.length;
  const corpo = folhas.map((f, i) => `<div class="folha">${f.replace("__RODAPE__", rodape(o, i + 1, total, i === 0 && r ? NOTA_META : r ? NOTA_IG : NOTA_SO_IG))}</div>`).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)} — ${esc(o.clienteNome)}</title>
<style>${CSS}</style></head>
<body>${corpo}</body></html>`;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@page { size: A4; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { background: ${C.fundo}; color: ${C.texto}; font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 9.5pt; line-height: 1.4; }
.folha { width: 210mm; min-height: 296.6mm; padding: 9mm 12mm 7mm; display: flex; flex-direction: column; gap: 2.8mm; }
.folha + .folha { break-before: page; }
section, .kpi, .criativo, .post { break-inside: avoid; }
h1 { font-size: 20pt; font-weight: 600; letter-spacing: -.02em; line-height: 1.1; }
h1.h1-menor { font-size: 17pt; }
h2 { font-size: 10.5pt; font-weight: 600; letter-spacing: -.01em; }
b { font-weight: 600; }
.sub { font-size: 7.8pt; color: ${C.suave}; margin-top: 1px; }
.rotulo { font-size: 6.8pt; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: ${C.suave}; }
.olho { font-size: 7pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: ${C.marcaClara}; margin-bottom: 4px; }
.vazio { font-size: 8.5pt; color: ${C.suave}; padding: 10px 0 4px; }

.topo { display: flex; align-items: center; justify-content: space-between; padding-bottom: 2.5mm; border-bottom: 1px solid ${C.linha}; }
.marca { display: flex; align-items: center; gap: 8px; }
.logo { width: 26px; height: 26px; object-fit: contain; background: #000; border-radius: 6px; padding: 2px; }
.marca-nome { font-size: 9.5pt; font-weight: 600; letter-spacing: .04em; }
.topo-dir { text-align: right; }
.topo-titulo { font-size: 8.5pt; font-weight: 500; color: ${C.secundario}; }
.topo-periodo { font-size: 7.5pt; color: ${C.suave}; }

.abertura { padding-top: 1mm; }
.frase { margin-top: 2.5mm; padding: 9px 14px; background: ${C.cartao}; border: 1px solid ${C.linha}; border-left: 3px solid ${C.marca}; border-radius: 10px; font-size: 10.5pt; line-height: 1.45; color: ${C.texto}; }
.frase-ig { border-left-color: ${C.instagram}; }
.frase-sub { font-size: 7.5pt; color: ${C.suave}; margin-top: 3px; }

.cartao { background: ${C.cartao}; border: 1px solid ${C.linha}; border-radius: 12px; padding: 12px 14px; }
.cartao-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }

.kpis { display: flex; gap: 3mm; }
.kpi { flex: 1; min-width: 0; background: ${C.cartao}; border: 1px solid ${C.linha}; border-radius: 12px; padding: 10px 12px; }
.kpi-destaque { border-color: ${C.marca}88; }
.kpi-valor { font-size: 18pt; font-weight: 600; letter-spacing: -.02em; line-height: 1.15; margin-top: 4px; white-space: nowrap; }
.kpi-destaque .kpi-valor { font-size: 21pt; }
.kpi-linha { display: flex; align-items: center; gap: 5px; margin-top: 5px; min-height: 15px; }
.selo { font-size: 7.3pt; font-weight: 600; border: 1px solid; border-radius: 999px; padding: 0 6px; line-height: 14px; white-space: nowrap; }
.kpi-antes { font-size: 7pt; color: ${C.suave}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpi-nota { font-size: 6.6pt; color: ${C.suave}; margin-top: 4px; line-height: 1.3; }

.grafico { flex: 1 1 0; min-height: 44mm; display: flex; flex-direction: column; }
.legenda { display: flex; gap: 12px; font-size: 7.5pt; color: ${C.suave}; white-space: nowrap; padding-top: 2px; }
.legenda span { display: inline-flex; align-items: center; gap: 5px; }
.leg-cheia { display: inline-block; width: 16px; height: 0; border-top: 2.4px solid ${C.marca}; border-radius: 2px; }
.leg-tracejada { display: inline-block; width: 16px; height: 0; border-top: 1.5px dashed ${C.suave}; }
.g-area { position: relative; flex: 1; margin: 20px 4px 18px 26px; min-height: 24mm; }
.g-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.g-linha { position: absolute; left: 0; right: 0; border-top: 1px dashed ${C.linha}; }
.g-y { position: absolute; left: -26px; width: 20px; text-align: right; transform: translateY(-50%); font-size: 6.8pt; color: ${C.suave}; }
.g-x { position: absolute; top: calc(100% + 6px); transform: translateX(-50%); font-size: 7pt; color: ${C.suave}; white-space: nowrap; }
.g-x-pico { color: ${C.texto}; font-weight: 600; }
.g-ponto { position: absolute; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; border-radius: 50%; background: ${C.marca}; border: 1.5px solid ${C.cartao}; }
.g-ponto-pico { width: 10px; height: 10px; margin: -5px 0 0 -5px; background: ${C.texto}; border: 2.5px solid ${C.marca}; }
.g-valor { position: absolute; transform: translate(-50%, -100%); margin-top: -6px; padding: 0 3px; border-radius: 3px; background: ${C.cartao}; font-size: 7.3pt; font-weight: 500; color: ${C.secundario}; white-space: nowrap; }
.g-valor-pico { color: ${C.texto}; font-weight: 600; font-size: 8pt; }

.linha-cartoes { display: flex; gap: 3mm; }
.lista { flex: 1.45; min-width: 0; display: flex; flex-direction: column; }
.lateral { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.criativos { flex: 1; margin-top: 7px; display: flex; flex-direction: column; justify-content: space-evenly; gap: 6px; }
.criativo { display: flex; align-items: center; gap: 10px; }
.mini { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: ${C.cartao2}; border: 1px solid ${C.linha}; }
.mini-vazia { display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 600; color: ${C.suave}; }
.criativo-texto { flex: 1; min-width: 0; }
.criativo-nome { font-size: 8.5pt; font-weight: 500; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.criativo-meta { font-size: 7.5pt; color: ${C.suave}; margin-top: 1px; }
.criativo-meta b { color: ${C.texto}; }
.conjunto { padding-bottom: 8px; border-bottom: 1px solid ${C.linha}; }
.conjunto-nome { font-size: 9.5pt; font-weight: 600; margin-top: 4px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.conjunto-camp { font-size: 7.2pt; color: ${C.suave}; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conjunto-valor { font-size: 15pt; font-weight: 600; letter-spacing: -.02em; margin-top: 6px; }
.conjunto-valor span { font-size: 8pt; font-weight: 400; color: ${C.suave}; letter-spacing: 0; }
.numeros { display: flex; flex-direction: column; }
.numero { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px solid ${C.linha}; font-size: 8pt; color: ${C.suave}; }
.numero:last-child { border-bottom: 0; }
.numero b { color: ${C.texto}; white-space: nowrap; }

.leitura { margin-top: 5px; font-size: 9pt; color: ${C.secundario}; }
.publico-colunas { display: flex; gap: 22px; margin-top: 7px; }
.publico-genero { flex: 0.8; min-width: 0; }
.publico-idade { flex: 1.3; min-width: 0; }
.publico-cidades { flex: 1; min-width: 0; }
.publico-colunas .rotulo { margin-bottom: 7px; }
.genero-barra { display: flex; height: 9px; border-radius: 999px; overflow: hidden; background: ${C.cartao2}; }
.genero-legenda { display: flex; gap: 16px; margin-top: 8px; }
.genero-legenda div { display: flex; flex-direction: column; font-size: 7.5pt; color: ${C.suave}; }
.genero-legenda b { font-size: 14pt; color: ${C.texto}; letter-spacing: -.02em; margin-top: 1px; }
.bolinha { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
.idade { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; font-size: 7.5pt; color: ${C.suave}; }
.idade-faixa { width: 30px; flex-shrink: 0; }
.idade-trilho { flex: 1; height: 6px; background: ${C.cartao2}; border-radius: 999px; overflow: hidden; }
.idade-trilho span { display: block; height: 100%; background: ${C.marca}99; border-radius: 999px; }
.idade-maior .idade-trilho span { background: ${C.marca}; }
.idade-maior { color: ${C.texto}; }
.idade-pct { width: 34px; text-align: right; flex-shrink: 0; }
.cidade { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; font-size: 8pt; }
.cidade-n { width: 16px; height: 16px; border-radius: 50%; background: ${C.cartao2}; color: ${C.suave}; font-size: 7pt; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cidade-nome { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cidade b { color: ${C.secundario}; font-weight: 500; }

.posts-cartao { display: flex; flex-direction: column; }
.posts-cartao.estica { flex: 1 1 auto; }
.posts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 9px; }
.posts-duas { flex: 1; grid-auto-rows: minmax(0, 1fr); }
.post { background: ${C.cartao2}; border: 1px solid ${C.linha}; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
.post-img { background: ${C.linha}; position: relative; }
.posts-uma .post-img { aspect-ratio: 4 / 5; }
.posts-duas .post-img { flex: 1; min-height: 32mm; }
.post-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.post-meta { display: flex; justify-content: space-between; gap: 6px; padding: 6px 8px; font-size: 7pt; color: ${C.suave}; white-space: nowrap; }

.rodape { margin-top: auto; padding-top: 2.5mm; border-top: 1px solid ${C.linha}; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
.rodape-nota { font-size: 6.6pt; color: ${C.suave}; line-height: 1.45; max-width: 128mm; }
.rodape-dir { font-size: 6.8pt; color: ${C.suave}; white-space: nowrap; }
`;
