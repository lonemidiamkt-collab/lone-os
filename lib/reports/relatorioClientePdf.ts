// lib/reports/relatorioClientePdf.ts — o HTML do relatório do cliente (semanal e mensal), que vira PDF
// no browserless (lib/traffic/renderPdf.ts). Puro: recebe o relatório pronto (relatorioCliente.ts) e o
// snapshot do Instagram, devolve a string.
//
// DESENHO (02/10/2026). Roberto, sobre o PDF de setembro da Madeireira D'Aldeia: "está bom de
// informações mas está bem bagunçado". Eram oito caixas com borda (nada se destacava porque tudo
// era caixa), um gráfico com duas linhas diárias em zigue-zague sobre grade tracejada, nome de
// campanha do Gerenciador indo pro cliente ("ADS - VIDEO - …", "CJ 01 - Whatsapp - … - aberto") e
// um cartão lateral que misturava "conjunto", números soltos e o melhor dia repetido. Agora:
//   • os números numa FAIXA só, com o resultado em destaque;
//   • colunas por dia, com a média do período anterior como uma linha de referência;
//   • nomes limpos (lib/reports/relatorioTextos.ts) com o formato numa etiqueta;
//   • seções separadas por espaço e uma linha fina — caixa só onde ela significa alguma coisa.
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
import { nomeLegivel, plural, generoQueSoma100, cidadeCurta, type FormatoAnuncio } from "./relatorioTextos";
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
    <div class="topo-dir"><span class="topo-titulo">${esc(titulo)}</span><span class="topo-periodo">${esc(o.janela.rotulo)}</span></div>
  </header>`;
}

function rodape(o: OpcoesRelatorio, pagina: number, total: number, nota: string): string {
  const [a, m, d] = o.geradoEm.split("-");
  return `<footer class="rodape">
    <div class="rodape-nota">${nota}</div>
    <div class="rodape-dir">Gerado pelo Lone OS em ${d}/${m}/${a}${total > 1 ? ` · ${pagina}/${total}` : ""}</div>
  </footer>`;
}

const ehDinheiro = (k: KpiRelatorio) => k.chave === "investimento" || k.chave === "custo";

function valorKpi(k: KpiRelatorio): string {
  if (k.valor == null) return "—";
  return ehDinheiro(k) ? formatarBRL(k.valor) : inteiro(k.valor);
}

/**
 * A variação com SETA e cor. A cor diz se foi bom ou ruim PRO CLIENTE (custo que sobe é ruim,
 * investimento é neutro) e a seta diz a direção — cor nunca sozinha.
 */
function variacaoHtml(k: KpiRelatorio, r: RelatorioAnuncios): string {
  // No mês, o nome do mês ("agosto: 177"); na semana, "anterior" — "semana anterior: R$ 592,05"
  // não cabia na caixa e saía cortado com reticências.
  const legAnt = /\s/.test(r.vocab.legendaAnterior.trim()) ? "anterior" : r.vocab.legendaAnterior.toLowerCase();
  if (k.valor == null) return k.chave === "alcance" ? `<span class="antes">não informado pela Meta</span>` : "";
  if (k.anterior == null || k.variacaoPct == null) {
    return r.anterior ? `<span class="antes">sem base de comparação</span>` : "";
  }
  const valorAnt = ehDinheiro(k) ? formatarBRL(k.anterior) : inteiro(k.anterior);
  const txt = formatarVariacao(k.variacaoPct).replace(/^[+−-]/, "");
  const seta = txt === "0%" ? "" : k.variacaoPct > 0 ? "▲ " : "▼ ";
  return `<span class="delta delta-${k.tom}">${seta}${txt}</span><span class="antes">${esc(legAnt)}: ${valorAnt}</span>`;
}

function faixaKpis(r: RelatorioAnuncios): string {
  // Alcance que a Meta não devolveu some do PDF (é logado no servidor): lacuna não vira "—".
  const ks = r.kpis.filter((k) => !(k.chave === "alcance" && k.valor == null));
  const celulas = ks.map((k) => `<div class="kpi${k.chave === "resultados" ? " kpi-principal" : ""}">
      <div class="rotulo">${esc(k.rotulo)}</div>
      <div class="kpi-valor">${valorKpi(k)}</div>
      <div class="kpi-linha">${variacaoHtml(k, r)}</div>
      ${k.nota ? `<div class="kpi-nota">${esc(k.nota)}</div>` : ""}
    </div>`).join("");
  return `<section class="faixa" style="grid-template-columns: 1.25fr repeat(${Math.max(ks.length - 1, 1)}, 1fr)">${celulas}</section>`;
}

const media = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * RESULTADO POR DIA EM COLUNAS. Uma coluna por dia na cor da marca; o período anterior entra como
 * UMA linha de referência (a média diária dele), não como uma segunda série em zigue-zague — a
 * comparação total já está na faixa de números. Grade em linha fina contínua, rótulo só onde
 * importa (o melhor dia; na semana, todos os 7).
 */
function grafico(r: RelatorioAnuncios): string {
  const s = r.serie;
  const n = s.length;
  if (n === 0) return "";
  const diasAnt = r.anterior?.dias ?? 0;
  const mediaAnt = r.totalAnterior != null && diasAnt > 0 ? r.totalAnterior / diasAnt : null;
  const mediaAtual = n > 0 ? r.total / n : 0;
  const maximo = Math.max(0, ...s.map((p) => p.atual), mediaAnt ?? 0);
  const ticks = ticksRedondos(maximo);
  const topo = ticks[ticks.length - 1] || 1;
  const pct = (v: number) => ((v / topo) * 100).toFixed(2);

  // Empate no topo é destaque pra todos os empatados: na Madeireira, 2/9 e 24/9 tiveram 10 conversas
  // e só o primeiro aparecia em destaque — o outro parecia "não ser o melhor".
  const melhor = r.melhorDia?.valor ?? 0;
  const picos = melhor > 0 ? s.filter((p) => p.atual === melhor).map((p) => p.dia) : [];
  const todosRotulos = n <= 10;
  const colunas = s.map((p, i) => {
    const ehPico = picos.includes(p.dia);
    const rotulo = (todosRotulos && p.atual > 0) || ehPico
      ? `<span class="c-valor${ehPico ? " c-valor-pico" : ""}">${inteiro(p.atual)}</span>` : "";
    // No mês, um rótulo por semana (1, 8, 15, 22, 29) e o último dia se estiver longe do anterior.
    const mostraX = todosRotulos || i % 7 === 0 || (i === n - 1 && (n - 1) % 7 >= 4);
    const x = mostraX
      ? `<span class="c-x${ehPico ? " c-x-pico" : ""}">${esc(todosRotulos ? diaDaSemana(p.dia) : diaCurto(p.dia))}</span>` : "";
    return `<div class="c-dia">
        <div class="c-barra${ehPico ? " c-pico" : ""}${p.atual === 0 ? " c-zero" : ""}" style="height:${p.atual > 0 ? pct(p.atual) : "0"}%">${rotulo}</div>
        ${x}
      </div>`;
  }).join("");

  const grade = ticks.map((t) => `<div class="c-linha" style="bottom:${pct(t)}%"><span>${inteiro(t)}</span></div>`).join("");
  const referencia = mediaAnt != null
    ? `<div class="c-ref" style="bottom:${pct(mediaAnt)}%"></div>` : "";

  const quanto = plural(melhor, r.palavras.um, r.palavras.varios);
  const sub = !picos.length
    ? `Nenhum dia com ${esc(r.palavras.varios)} no período`
    : picos.length === 1
      ? `Melhor dia: ${esc(diaLongo(picos[0]))}, com ${quanto}`
      : picos.length <= 3
        ? `Melhores dias: ${esc(picos.map(diaLongo).join(picos.length === 2 ? " e " : ", "))}, com ${quanto} cada`
        : `Melhor marca: ${quanto} num dia, alcançada ${picos.length} vezes`;
  const legenda = `<div class="legenda">
      <span><i class="leg-coluna"></i>${esc(r.vocab.legendaAtual)} · média ${media(mediaAtual)}/dia</span>
      ${mediaAnt != null ? `<span><i class="leg-ref"></i>Média ${esc(r.vocab.legendaAnterior.toLowerCase())} · ${media(mediaAnt)}/dia</span>` : ""}
    </div>`;

  return `<section class="bloco grafico">
    <div class="bloco-topo">
      <div><h2>${esc(r.palavras.Varios)} por dia</h2><div class="sub">${sub}</div></div>
      ${legenda}
    </div>
    <div class="c-area">
      ${grade}
      ${referencia}
      <div class="c-colunas">${colunas}</div>
    </div>
  </section>`;
}

const etiqueta = (f: FormatoAnuncio | null) => (f ? `<span class="etiqueta">${esc(f)}</span>` : "");

function miniatura(c: Criativo, i: number): string {
  return c.miniatura
    ? `<img class="mini" src="${esc(c.miniatura)}" alt="">`
    : `<div class="mini mini-vazia">${i + 1}º</div>`;
}

function criativosHtml(r: RelatorioAnuncios): string {
  if (!r.criativos.length) {
    return `<section class="bloco"><h2>Anúncios em destaque</h2>
      <div class="vazio">Nenhum anúncio registrou ${esc(r.palavras.varios)} no período.</div></section>`;
  }
  const linhas = r.criativos.map((c, i) => {
    const nl = nomeLegivel(c.nome);
    return `<div class="criativo">
      ${miniatura(c, i)}
      <div class="criativo-nome">${esc(nl.nome || c.nome)}${etiqueta(nl.formato)}</div>
      <div class="criativo-num">
        <b>${plural(c.resultados, r.palavras.um, r.palavras.varios)}</b>
        ${c.custo != null ? `<span>${formatarBRL(c.custo)} cada</span>` : ""}
      </div>
    </div>`;
  }).join("");
  return `<section class="bloco">
    <div class="bloco-topo"><div><h2>Anúncios que mais trouxeram ${esc(r.palavras.varios)}</h2>
      <div class="sub">Pelo número de ${esc(r.palavras.varios)} no período</div></div></div>
    <div class="criativos">${linhas}</div>
  </section>`;
}

function maisBaratoHtml(c: Conjunto, r: RelatorioAnuncios): string {
  const nl = nomeLegivel(c.nome);
  const barato = r.palavras.feminino ? "barata" : "barato";
  return `<div class="barato">
    <h2>Onde ${r.palavras.feminino ? "a" : "o"} ${esc(r.palavras.um)} saiu mais ${barato}</h2>
    <div class="barato-nome">${esc(nl.nome || c.nome)}${etiqueta(nl.formato)}</div>
    <div class="barato-valor">${formatarBRL(c.custo)} <span>${esc(r.palavras.porUm)}</span></div>
    <div class="barato-base">${plural(c.resultados, r.palavras.um, r.palavras.varios)} com ${formatarBRL(c.investimento)} investidos</div>
  </div>`;
}

function outrosNumerosHtml(r: RelatorioAnuncios): string {
  const linhas: [string, string][] = [
    ["Cliques no link", inteiro(r.cliquesLink)],
    ["Vezes que os anúncios apareceram", inteiro(r.impressoes)],
  ];
  return `<div class="outros">
    <div class="rotulo">Outros números do período</div>
    ${linhas.map(([k, v]) => `<div class="numero"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
  </div>`;
}

function destaquesHtml(r: RelatorioAnuncios): string {
  // "Nenhum anúncio trouxe conversa" só quando o período não teve conversa mesmo. Leitura por anúncio
  // que falhou — ou que veio vazia enquanto as campanhas somam resultado — omite a lista.
  const mostraCriativos = !r.criativosIndisponiveis && (r.criativos.length > 0 || r.total === 0);
  const lateral = `<section class="bloco lateral">
      ${r.conjunto ? maisBaratoHtml(r.conjunto, r) : ""}
      ${outrosNumerosHtml(r)}
    </section>`;
  return `<div class="duas${mostraCriativos ? "" : " duas-uma"}">
    ${mostraCriativos ? criativosHtml(r) : ""}
    ${lateral}
  </div>`;
}

function barraGenero(g: { mulheres: number; homens: number }): string {
  const s = generoQueSoma100(g.mulheres, g.homens);
  return `<div class="genero-barra">
      <div style="width:${s.mulheres}%;background:${C.mulheres}"></div>
      <div style="width:${s.homens}%;background:${C.marca}"></div>
    </div>
    <div class="genero-legenda">
      <div><span><i class="bolinha" style="background:${C.mulheres}"></i>Mulheres</span><b>${s.mulheres}%</b></div>
      <div><span><i class="bolinha" style="background:${C.marca}"></i>Homens</span><b>${s.homens}%</b></div>
    </div>`;
}

function barrasIdade(idades: { faixa: string; pct: number }[]): string {
  const maior = Math.max(1, ...idades.map((i) => i.pct));
  return idades.map((i) => `<div class="idade${i.pct === maior ? " idade-maior" : ""}${i.pct === 0 ? " idade-zero" : ""}">
      <span class="idade-faixa">${esc(i.faixa)}</span>
      <span class="idade-trilho"><span style="width:${i.pct > 0 ? Math.max(2, (i.pct / maior) * 100) : 0}%"></span></span>
      <span class="idade-pct">${formatarPctCurto(i.pct)}</span>
    </div>`).join("");
}

function publicoHtml(p: Publico, leitura: string | null, titulo: string, sub: string): string {
  return `<section class="bloco publico">
    <div class="bloco-topo"><div><h2>${esc(titulo)}</h2><div class="sub">${esc(sub)}</div></div></div>
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
  return `<section class="bloco publico">
    <div class="bloco-topo"><div><h2>Quem segue o perfil</h2><div class="sub">Seguidores por gênero, idade e cidade</div></div></div>
    <div class="publico-colunas">
      ${temGenero ? `<div class="publico-genero"><div class="rotulo">Gênero</div>${barraGenero({ mulheres: a.generoFemPct!, homens: a.generoMascPct! })}</div>` : ""}
      ${idades.length ? `<div class="publico-idade"><div class="rotulo">Faixa etária</div>${barrasIdade(idades)}</div>` : ""}
      ${a.cidades.length ? `<div class="publico-cidades"><div class="rotulo">Principais cidades</div>${a.cidades.map((c, i) => `<div class="cidade"><span class="cidade-n">${i + 1}</span><span class="cidade-nome">${esc(cidadeCurta(c.nome))}</span><b>${formatarPctCurto(c.pct)}</b></div>`).join("")}</div>` : ""}
    </div>
  </section>`;
}

function igPosts(snap: IgSnapshot): string {
  const posts = (snap.posts ?? []).slice(0, 6);
  if (!posts.length) {
    return `<section class="bloco"><h2>Posts do período</h2>
      <div class="vazio">Nenhum post publicado no período. Os números acima são do perfil como um todo.</div></section>`;
  }
  const quando = (iso: string | null) => (iso ? diaCurto(new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) : "");
  const cartoes = posts.map((p) => {
    const engaj = [
      p.curtidas != null ? plural(p.curtidas, "curtida", "curtidas") : "",
      p.comentarios ? plural(p.comentarios, "comentário", "comentários") : "",
    ].filter(Boolean).join(" · ");
    return `<div class="post">
      <div class="post-img">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" onerror="this.remove()">` : ""}</div>
      <div class="post-meta"><span>${esc(quando(p.data))}</span><span>${esc(engaj)}</span></div>
    </div>`;
  }).join("");
  return `<section class="bloco posts-bloco">
    <div class="bloco-topo"><div><h2>Posts do período</h2><div class="sub">Os que mais engajaram primeiro</div></div></div>
    <div class="posts posts-${posts.length > 3 ? "duas" : "uma"}">${cartoes}</div>
  </section>`;
}

function igKpis(snap: IgSnapshot, temAnuncios: boolean): string {
  const r = snap.resumo;
  const publico = snap.fonte === "publico";
  const fmt = (v: number | null | undefined) => (v == null ? "—" : inteiro(v));
  const ganhos = r?.seguidoresGanhos;
  const cel: { rotulo: string; valor: string; nota?: string; principal?: boolean }[] = [
    { rotulo: "Seguidores", valor: fmt(snap.conta?.seguidores), principal: true },
  ];
  if (!publico) cel.push({ rotulo: "Seguidores novos", valor: ganhos == null ? "—" : `${ganhos > 0 ? "+" : ""}${inteiro(ganhos)}` });
  if (!publico) cel.push({
    rotulo: "Alcance do perfil", valor: fmt(r?.alcance),
    nota: r?.alcanceJanelaDias ? `${r.alcanceJanelaDias} dias${temAnuncios ? " · inclui quem veio pelos anúncios" : ""}` : undefined,
  });
  cel.push({ rotulo: "Posts no período", valor: fmt(r?.postsNoPeriodo) });
  return `<section class="faixa" style="grid-template-columns: 1.25fr repeat(${cel.length - 1}, 1fr)">${cel.map((c) => `<div class="kpi${c.principal ? " kpi-principal" : ""}">
      <div class="rotulo">${esc(c.rotulo)}</div>
      <div class="kpi-valor">${esc(c.valor)}</div>
      ${c.nota ? `<div class="kpi-nota">${esc(c.nota)}</div>` : ""}
    </div>`).join("")}</section>`;
}

/** `clienteNome` = relatório só de Instagram: o nome do cliente é o título e o @ vem embaixo. */
function igConteudo(snap: IgSnapshot, geradoEm: string, clienteNome?: string): string {
  const dias = snap.periodo === "30d" ? 30 : snap.periodo === "14d" ? 14 : 7;
  const frase = resumoInstagram(dias, snap.resumo ?? null);
  // A janela do Instagram é "os últimos N dias até a geração", não o mês do relatório — escrito
  // por extenso pra ninguém achar que é setembro fechado.
  const [, m, d] = geradoEm.split("-");
  const titulo = clienteNome
    ? `<h1>${esc(clienteNome)}</h1><div class="arroba">@${esc(snap.conta?.username)}</div>`
    : `<h1>@${esc(snap.conta?.username)}</h1>`;
  return `<section class="abertura">
      <div class="olho olho-ig">Instagram · últimos ${esc(snap.periodoLabel ?? `${dias} dias`)}, até ${d}/${m}</div>
      ${titulo}
      ${frase ? `<p class="frase">${esc(frase)}</p>` : ""}
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
        <p class="frase">${esc(r.frase)}</p>
        ${antes ? `<p class="frase-sub">${esc(antes)}</p>` : ""}
      </section>
      ${faixaKpis(r)}
      ${grafico(r)}
      ${destaquesHtml(r)}
      ${r.publico ? publicoHtml(r.publico, r.leituraPublico, "Quem viu seus anúncios", "Pessoas alcançadas, por gênero e idade") : ""}
      __RODAPE__`);
  }
  if (ig) {
    folhas.push(`${cabecalho(o, titulo)}
      ${igConteudo(ig, o.geradoEm, r ? undefined : o.clienteNome)}
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
.folha { width: 210mm; min-height: 296.6mm; padding: 10mm 13mm 7mm; display: flex; flex-direction: column; gap: 5mm; }
.folha + .folha { break-before: page; }
section, .kpi, .criativo, .post { break-inside: avoid; }
h1 { font-size: 22pt; font-weight: 600; letter-spacing: -.025em; line-height: 1.08; }
h2 { font-size: 10.5pt; font-weight: 600; letter-spacing: -.01em; color: ${C.texto}; }
b { font-weight: 600; }
.sub { font-size: 7.8pt; color: ${C.suave}; margin-top: 2px; }
.rotulo { font-size: 6.6pt; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: ${C.suave}; }
.vazio { font-size: 8.5pt; color: ${C.suave}; padding: 8px 0 2px; }

/* Cabeçalho: marca à esquerda, tipo e período à direita, uma linha fina embaixo. */
.topo { display: flex; align-items: center; justify-content: space-between; padding-bottom: 3mm; border-bottom: 1px solid ${C.linha}; }
.marca { display: flex; align-items: center; gap: 8px; }
.logo { width: 24px; height: 24px; object-fit: contain; background: #000; border-radius: 6px; padding: 2px; }
.marca-nome { font-size: 9pt; font-weight: 600; letter-spacing: .06em; }
.topo-dir { display: flex; align-items: baseline; gap: 8px; }
.topo-titulo { font-size: 8.5pt; font-weight: 600; color: ${C.secundario}; }
.topo-periodo { font-size: 8.5pt; color: ${C.suave}; }

/* Abertura: o nome do cliente e a frase do período — sem caixa em volta. */
.abertura { display: flex; flex-direction: column; }
.olho { font-size: 7pt; font-weight: 600; letter-spacing: .13em; text-transform: uppercase; color: ${C.marcaClara}; margin-bottom: 5px; }
.olho-ig { color: ${C.instagram}; }
.arroba { font-size: 9pt; color: ${C.suave}; margin-top: 3px; }
.frase { margin-top: 3.5mm; font-size: 11.5pt; line-height: 1.45; color: ${C.secundario}; max-width: 165mm; text-wrap: pretty; }
.frase-sub { margin-top: 2px; font-size: 7.8pt; color: ${C.suave}; }

/* A FAIXA DE NÚMEROS: uma peça só, divisórias finas. É a única caixa da página. */
.faixa { display: grid; background: ${C.cartao}; border: 1px solid ${C.linha}; border-radius: 12px; overflow: hidden; }
.kpi { padding: 11px 14px 12px; min-width: 0; }
.kpi + .kpi { border-left: 1px solid ${C.linha}; }
.kpi-valor { font-size: 17pt; font-weight: 600; letter-spacing: -.025em; line-height: 1.1; margin-top: 6px; white-space: nowrap; }
.kpi-principal { background: linear-gradient(180deg, ${C.marca}24, ${C.marca}08); }
.kpi-principal .rotulo { color: ${C.marcaClara}; }
.kpi-principal .kpi-valor { font-size: 25pt; }
.kpi-linha { display: flex; flex-wrap: wrap; align-items: center; column-gap: 6px; row-gap: 1px; margin-top: 6px; min-height: 14px; }
.delta { font-size: 7.4pt; font-weight: 600; font-variant-numeric: tabular-nums; }
.delta-bom { color: ${C.bom}; }
.delta-ruim { color: ${C.atencao}; }
.delta-neutro { color: ${C.suave}; }
.antes { font-size: 7.2pt; color: ${C.suave}; white-space: nowrap; } /* quebra pra linha de baixo, nunca corta o número */
.kpi-nota { font-size: 6.6pt; color: ${C.suave}; margin-top: 4px; line-height: 1.3; white-space: normal; }

/* Blocos: separados por uma linha fina e espaço, sem moldura. */
.bloco { border-top: 1px solid ${C.linha}; padding-top: 3.2mm; min-width: 0; }
.bloco-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }

/* Colunas por dia. */
.grafico { flex: 1 1 0; min-height: 50mm; display: flex; flex-direction: column; }
.legenda { display: flex; gap: 14px; font-size: 7.4pt; color: ${C.suave}; white-space: nowrap; padding-top: 2px; }
.legenda span { display: inline-flex; align-items: center; gap: 6px; }
.leg-coluna { display: inline-block; width: 8px; height: 10px; border-radius: 2px 2px 0 0; background: ${C.marca}; }
.leg-ref { display: inline-block; width: 16px; height: 0; border-top: 1.5px dashed ${C.secundario}; }
.c-area { position: relative; flex: 1; margin: 18px 2px 20px 24px; min-height: 30mm; }
.c-linha { position: absolute; left: 0; right: 0; border-top: 1px solid ${C.linha}; }
.c-linha span { position: absolute; left: -24px; width: 18px; text-align: right; transform: translateY(-50%); font-size: 6.8pt; color: ${C.suave}; font-variant-numeric: tabular-nums; }
.c-ref { position: absolute; left: 0; right: 0; border-top: 1.5px dashed ${C.secundario}; opacity: .75; z-index: 2; }
.c-colunas { position: absolute; inset: 0; display: flex; align-items: stretch; gap: 2px; z-index: 1; }
.c-dia { flex: 1; position: relative; display: flex; align-items: flex-end; justify-content: center; min-width: 0; }
.c-barra { position: relative; width: 64%; max-width: 22px; background: ${C.marca}; border-radius: 3px 3px 0 0; opacity: .6; }
.c-pico { opacity: 1; }
.c-valor { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 3px; font-size: 7pt; font-weight: 500; color: ${C.secundario}; white-space: nowrap; }
.c-valor-pico { font-size: 8pt; font-weight: 700; color: ${C.texto}; }
.c-x { position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); font-size: 6.9pt; color: ${C.suave}; white-space: nowrap; }
.c-x-pico { color: ${C.texto}; font-weight: 600; }

/* Duas colunas: o que funcionou (lista) e onde saiu mais barato. */
.duas { display: grid; grid-template-columns: 1.5fr 1fr; gap: 8mm; }
.duas-uma { grid-template-columns: 1fr; }
.criativos { margin-top: 3mm; display: flex; flex-direction: column; }
.criativo { display: grid; grid-template-columns: 38px 1fr auto; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid ${C.linha}; }
.criativo:first-child { border-top: 0; padding-top: 0; }
.mini { width: 38px; height: 38px; border-radius: 7px; object-fit: cover; background: ${C.cartao2}; border: 1px solid ${C.linha}; }
.mini-vazia { display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 600; color: ${C.suave}; }
.criativo-nome { font-size: 8.6pt; font-weight: 500; line-height: 1.3; min-width: 0; }
.criativo-num { text-align: right; display: flex; flex-direction: column; font-variant-numeric: tabular-nums; }
.criativo-num b { font-size: 8.6pt; white-space: nowrap; }
.criativo-num span { font-size: 7.3pt; color: ${C.suave}; white-space: nowrap; }
.etiqueta { display: inline-block; margin-left: 6px; padding: 0 5px; border: 1px solid ${C.linha}; border-radius: 4px; font-size: 6.4pt; font-weight: 500; color: ${C.suave}; line-height: 12px; vertical-align: 1px; }
.lateral { display: flex; flex-direction: column; gap: 4mm; }
.barato-nome { font-size: 8.8pt; font-weight: 500; margin-top: 3mm; line-height: 1.3; }
.barato-valor { font-size: 17pt; font-weight: 600; letter-spacing: -.02em; margin-top: 3px; }
.barato-valor span { font-size: 8pt; font-weight: 400; color: ${C.suave}; letter-spacing: 0; }
.barato-base { font-size: 7.4pt; color: ${C.suave}; margin-top: 1px; }
.outros .rotulo { margin-bottom: 3px; }
.numero { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; border-top: 1px solid ${C.linha}; font-size: 7.8pt; color: ${C.suave}; }
.numero b { color: ${C.texto}; white-space: nowrap; font-variant-numeric: tabular-nums; }

/* Público. */
.leitura { margin-top: 2.5mm; font-size: 9.2pt; color: ${C.secundario}; }
.publico-colunas { display: flex; gap: 10mm; margin-top: 3.5mm; }
.publico-genero { flex: 0.75; min-width: 0; }
.publico-idade { flex: 1.3; min-width: 0; }
.publico-cidades { flex: 1; min-width: 0; }
.publico-colunas .rotulo { margin-bottom: 8px; }
.genero-barra { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: ${C.cartao2}; gap: 2px; }
.genero-legenda { display: flex; gap: 18px; margin-top: 9px; }
.genero-legenda div { display: flex; flex-direction: column; font-size: 7.5pt; color: ${C.suave}; }
.genero-legenda span { display: inline-flex; align-items: center; }
.genero-legenda b { font-size: 15pt; color: ${C.texto}; letter-spacing: -.02em; margin-top: 2px; }
.bolinha { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; }
.idade { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 7.5pt; color: ${C.suave}; }
.idade-faixa { width: 34px; flex-shrink: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.idade-trilho { flex: 1; height: 6px; background: ${C.cartao2}; border-radius: 999px; overflow: hidden; }
.idade-trilho span { display: block; height: 100%; background: ${C.marca}a6; border-radius: 999px; }
.idade-maior .idade-trilho span { background: ${C.marca}; }
.idade-maior { color: ${C.texto}; font-weight: 500; }
.idade-zero { opacity: .55; }
.idade-pct { width: 32px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.cidade { display: flex; align-items: center; gap: 7px; margin-bottom: 7px; font-size: 8pt; }
.cidade-n { width: 16px; height: 16px; border-radius: 50%; background: ${C.cartao2}; color: ${C.suave}; font-size: 7pt; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cidade-nome { flex: 1; min-width: 0; }
.cidade b { color: ${C.secundario}; font-weight: 500; font-variant-numeric: tabular-nums; }

/* Posts do Instagram: a arte INTEIRA (contain), sem cortar o topo nem o preço. */
.posts-bloco { flex: 1 1 auto; display: flex; flex-direction: column; }
.posts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 3mm; flex: 1; }
.posts-duas { grid-auto-rows: minmax(0, 1fr); }
.post { display: flex; flex-direction: column; min-height: 0; }
.post-img { position: relative; flex: 1; min-height: 38mm; background: ${C.cartao}; border: 1px solid ${C.linha}; border-radius: 8px; overflow: hidden; }
.posts-uma .post-img { aspect-ratio: 4 / 5; flex: none; }
.post-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.post-meta { display: flex; justify-content: space-between; gap: 6px; padding: 4px 1px 0; font-size: 7pt; color: ${C.suave}; white-space: nowrap; }
.post-meta span:first-child { color: ${C.secundario}; }

.rodape { margin-top: auto; padding-top: 3mm; border-top: 1px solid ${C.linha}; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
.rodape-nota { font-size: 6.6pt; color: ${C.suave}; line-height: 1.45; max-width: 128mm; }
.rodape-dir { font-size: 6.8pt; color: ${C.suave}; white-space: nowrap; }
`;
