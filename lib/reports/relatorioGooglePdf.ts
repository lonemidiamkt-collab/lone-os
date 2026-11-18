// lib/reports/relatorioGooglePdf.ts — as folhas do GOOGLE no PDF do relatório do cliente (semanal e mensal):
// uma do Google Ads, uma do Perfil da Empresa (Google Meu Negócio). Puro: recebe o bloco pronto
// (lib/google/relatorio.ts) e devolve o miolo de cada folha; relatorioClientePdf.ts põe cabeçalho e rodapé.
//
// Mesmo desenho das folhas da Meta (02/10/2026): números numa faixa só com o principal em destaque, colunas por dia
// com a média do período anterior como linha de referência, blocos separados por linha fina. As classes de faixa,
// gráfico e lista são as do CSS de relatorioClientePdf.ts; aqui só o que é do Google.
//
// Bloco INDISPONÍVEL (conta vinculada mas sem leitura confiável) NÃO vai para o PDF do cliente — o motivo volta para
// o time em `avisos` (montarHtmlRelatorioCliente). PDF dizendo "não consegui ler" no grupo do cliente é pior que
// o bloco ausente; o time precisa saber, o cliente não.

import { formatarVariacao } from "@/components/ui/painel-comparativo-utils";
import { ticksRedondos, diaDaSemana, diaCurto, diaLongo } from "./relatorioCliente";
import {
  formatarValor,
  type RelatorioGoogle, type RelatorioGoogleAds, type RelatorioGooglePerfil, type KpiGoogle, type PontoGoogle,
} from "@/lib/google/relatorio";
import type { Vocabulario, Janela } from "./relatorioCliente";

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");
const media = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Cores de terceiro (marca do Google) — documento impresso, literal permitido. O resto vem do CSS da folha.
const GOOGLE_AZUL = "#4285F4";
const GOOGLE_VERDE = "#34A853";

export const NOTA_GOOGLE_ADS = "Números do Google Ads (coluna \"Conversões\" da conta: ações principais). As ações do quadro incluem as secundárias. Conversão pode ser atualizada pelo Google por alguns dias depois do clique.";
export const NOTA_GOOGLE_PERFIL = "Números do Perfil da Empresa no Google (Busca e Maps), contados pelo Google. O Google libera os números com alguns dias de atraso e não conta toques repetidos da mesma pessoa no mesmo dia.";

// ── Pedaços ──────────────────────────────────────────────────────────────────

function variacaoHtml(k: KpiGoogle, vocab: Vocabulario, moeda: string): string {
  if (k.valor == null || k.anterior == null || k.variacaoPct == null) return "";
  const legAnt = /\s/.test(vocab.legendaAnterior.trim()) ? "anterior" : vocab.legendaAnterior.toLowerCase();
  const txt = formatarVariacao(k.variacaoPct).replace(/^[+−-]/, "");
  const seta = txt === "0%" ? "" : k.variacaoPct > 0 ? "▲ " : "▼ ";
  return `<span class="delta delta-${k.tom}">${seta}${txt}</span><span class="antes">${esc(legAnt)}: ${esc(formatarValor(k.anterior, k.formato, moeda))}</span>`;
}

function faixa(kpis: KpiGoogle[], principal: string, vocab: Vocabulario, moeda = "BRL"): string {
  const cel = kpis.map((k) => `<div class="kpi${k.chave === principal ? " kpi-principal kpi-google" : ""}">
      <div class="rotulo">${esc(k.rotulo)}</div>
      <div class="kpi-valor">${esc(formatarValor(k.valor, k.formato, moeda))}</div>
      <div class="kpi-linha">${variacaoHtml(k, vocab, moeda)}</div>
      ${k.nota ? `<div class="kpi-nota">${esc(k.nota)}</div>` : ""}
    </div>`).join("");
  return `<section class="faixa" style="grid-template-columns: 1.25fr repeat(${Math.max(kpis.length - 1, 1)}, 1fr)">${cel}</section>`;
}

/** Colunas por dia — a mesma leitura do gráfico da Meta (média do anterior como linha de referência). */
function colunas(serie: PontoGoogle[], titulo: string, um: string, varios: string, vocab: Vocabulario, anterior: Janela | null): string {
  const n = serie.length;
  if (!n) return "";
  const total = serie.reduce((s, p) => s + p.atual, 0);
  const temAnt = serie.some((p) => p.anterior != null);
  const totalAnt = temAnt ? serie.reduce((s, p) => s + (p.anterior ?? 0), 0) : null;
  const mediaAnt = totalAnt != null && anterior ? totalAnt / Math.max(anterior.dias, 1) : null;
  const maximo = Math.max(0, ...serie.map((p) => p.atual), mediaAnt ?? 0);
  const ticks = ticksRedondos(maximo);
  const topo = ticks[ticks.length - 1] || 1;
  const pct = (v: number) => ((v / topo) * 100).toFixed(2);
  const melhor = Math.max(0, ...serie.map((p) => p.atual));
  const picos = melhor > 0 ? serie.filter((p) => p.atual === melhor).map((p) => p.dia) : [];
  const todos = n <= 10;
  const cols = serie.map((p, i) => {
    const pico = picos.includes(p.dia);
    const rot = (todos && p.atual > 0) || pico ? `<span class="c-valor${pico ? " c-valor-pico" : ""}">${inteiro(p.atual)}</span>` : "";
    const mostraX = todos || i % 7 === 0 || (i === n - 1 && (n - 1) % 7 >= 4);
    const x = mostraX ? `<span class="c-x${pico ? " c-x-pico" : ""}">${esc(todos ? diaDaSemana(p.dia) : diaCurto(p.dia))}</span>` : "";
    return `<div class="c-dia"><div class="c-barra c-google${pico ? " c-pico" : ""}" style="height:${p.atual > 0 ? pct(p.atual) : "0"}%">${rot}</div>${x}</div>`;
  }).join("");
  const grade = ticks.map((t) => `<div class="c-linha" style="bottom:${pct(t)}%"><span>${inteiro(t)}</span></div>`).join("");
  const ref = mediaAnt != null ? `<div class="c-ref" style="bottom:${pct(mediaAnt)}%"></div>` : "";
  const qtd = (v: number) => `${inteiro(v)} ${v === 1 ? um : varios}`;
  const sub = !picos.length ? `Nenhum dia com ${esc(varios)} no período`
    : picos.length === 1 ? `Melhor dia: ${esc(diaLongo(picos[0]))}, com ${qtd(melhor)}`
      : picos.length <= 3 ? `Melhores dias: ${esc(picos.map(diaLongo).join(picos.length === 2 ? " e " : ", "))}, com ${qtd(melhor)} cada`
        : `Melhor marca: ${qtd(melhor)} num dia, alcançada ${picos.length} vezes`;
  return `<section class="bloco grafico">
    <div class="bloco-topo">
      <div><h2>${esc(titulo)}</h2><div class="sub">${sub}</div></div>
      <div class="legenda">
        <span><i class="leg-coluna leg-google"></i>${esc(vocab.legendaAtual)} · média ${media(total / n)}/dia</span>
        ${mediaAnt != null ? `<span><i class="leg-ref"></i>Média ${esc(vocab.legendaAnterior.toLowerCase())} · ${media(mediaAnt)}/dia</span>` : ""}
      </div>
    </div>
    <div class="c-area">${grade}${ref}<div class="c-colunas">${cols}</div></div>
  </section>`;
}

const fmtQtd = (v: number) => (Number.isInteger(v) ? inteiro(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

function deltaCurto(atual: number, anterior: number | null): string {
  if (anterior == null || anterior === 0) return "";
  const p = ((atual - anterior) / anterior) * 100;
  if (Math.abs(p) < 1) return `<span class="delta delta-neutro">=</span>`;
  return `<span class="delta delta-${p > 0 ? "bom" : "ruim"}">${p > 0 ? "▲" : "▼"} ${formatarVariacao(p).replace(/^[+−-]/, "")}</span>`;
}

// ── Google Ads ───────────────────────────────────────────────────────────────

function adsFolha(r: RelatorioGoogleAds, clienteNome: string): string {
  const k = (c: string) => r.kpis.find((x) => x.chave === c);
  const temConv = (k("conversoes")?.valor ?? 0) > 0 || (k("conversoes")?.anterior ?? 0) > 0;
  const principal = temConv ? "conversoes" : "cliques";
  const ordem = temConv
    ? ["conversoes", "investimento", "custo_conversao", "cliques", "ligacoes"]
    : ["cliques", "investimento", "cpc", "impressoes", "ligacoes"];
  const faixaKpis = ordem.map(k).filter((x): x is KpiGoogle => !!x);
  const antes = r.anterior && r.kpis.some((x) => x.anterior != null) ? `Comparado com ${r.anterior.rotulo}.` : "";

  const acoes = r.acoes.length
    ? `<div class="g-lista">${r.acoes.slice(0, 7).map((a) => `<div class="numero"><span>${esc(a.rotulo)}</span><b>${fmtQtd(a.todas)} ${deltaCurto(a.todas, a.anterior)}</b></div>`).join("")}</div>`
    : `<div class="vazio">Nenhuma ação de conversão registrada pelo Google Ads no período.</div>`;
  const outros: [string, string][] = [
    ["Impressões", formatarValor(k("impressoes")?.valor ?? null, "inteiro")],
    ["Taxa de cliques (CTR)", formatarValor(k("ctr")?.valor ?? null, "pct")],
    ["Custo por clique", formatarValor(k("cpc")?.valor ?? null, "dinheiro", r.moeda)],
  ];
  if (temConv) outros.unshift(["Cliques", formatarValor(k("cliques")?.valor ?? null, "inteiro")]);
  if (k("valor")) outros.push(["Valor das conversões", formatarValor(k("valor")!.valor, "dinheiro", r.moeda)]);

  const camps = r.campanhas.slice(0, 6);
  const tabela = camps.length ? `<section class="bloco">
      <h2>Campanhas</h2><div class="sub">Por investimento no período</div>
      <table class="g-tabela"><thead><tr><th>Campanha</th><th>Tipo</th><th>Investido</th><th>Cliques</th><th>Conversões</th><th>Custo/conv.</th></tr></thead>
      <tbody>${camps.map((c) => `<tr><td>${esc(c.nome)}</td><td>${esc(c.canal)}</td><td>${esc(formatarValor(c.custo, "dinheiro", r.moeda))}</td><td>${inteiro(c.cliques)}</td><td>${fmtQtd(c.conversoes)}</td><td>${esc(formatarValor(c.custoPorConversao, "dinheiro", r.moeda))}</td></tr>`).join("")}</tbody></table>
      ${r.campanhas.length > camps.length ? `<div class="sub">+ ${r.campanhas.length - camps.length} campanha(s) com investimento menor</div>` : ""}
    </section>` : "";

  return `<section class="abertura">
      <div class="olho olho-google">Google Ads · ${esc(r.janela.rotulo)}</div>
      <h1>${esc(clienteNome)}</h1>
      <p class="frase">${esc(r.frase)}</p>
      ${antes ? `<p class="frase-sub">${esc(antes)}</p>` : ""}
    </section>
    ${faixa(faixaKpis, principal, r.vocab, r.moeda)}
    ${temConv ? colunas(r.serieConversoes, "Conversões por dia", "conversão", "conversões", r.vocab, r.anterior) : colunas(r.serieCliques, "Cliques por dia", "clique", "cliques", r.vocab, r.anterior)}
    <div class="duas">
      <section class="bloco"><h2>O que os anúncios geraram</h2><div class="sub">Ações registradas pelo Google Ads (inclui as secundárias)</div>${acoes}</section>
      <section class="bloco lateral"><div class="outros"><div class="rotulo">Outros números do período</div>
        ${outros.map(([a, b]) => `<div class="numero"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div></section>
    </div>
    ${tabela}`;
}

// ── Perfil da Empresa ────────────────────────────────────────────────────────

function barra(rotulo: string, valor: number, total: number): string {
  const p = total > 0 ? (valor / total) * 100 : 0;
  return `<div class="idade"><span class="g-rot">${esc(rotulo)}</span><span class="idade-trilho"><span class="g-trilho" style="width:${p.toFixed(1)}%"></span></span><span class="idade-pct">${Math.round(p)}%</span></div>`;
}

function perfilFolha(r: RelatorioGooglePerfil, clienteNome: string): string {
  const v = r.visualizacoes;
  const antes = r.anterior && r.kpis.some((x) => x.anterior != null) ? `Comparado com ${r.anterior.rotulo}.` : "";
  const termos = r.termos.length
    ? `<div class="g-lista">${r.termos.map((t, i) => `<div class="numero"><span>${i + 1}. ${esc(t.termo)}</span><b>${t.valor != null ? inteiro(t.valor) : t.limiar != null ? `menos de ${inteiro(t.limiar)}` : "—"}</b></div>`).join("")}</div>`
    : `<div class="vazio">O Google ainda não liberou os termos de busca do mês.</div>`;
  return `<section class="abertura">
      <div class="olho olho-google-perfil">Perfil da Empresa no Google · ${esc(r.janela.rotulo)}</div>
      <h1>${esc(clienteNome)}</h1>
      <p class="frase">${esc(r.frase)}</p>
      ${antes || r.nota ? `<p class="frase-sub">${esc([r.nota, antes].filter(Boolean).join(" "))}</p>` : ""}
    </section>
    ${faixa(r.kpis, "acoes", r.vocab)}
    ${colunas(r.serieAcoes, "Contatos pelo perfil por dia", "contato", "contatos", r.vocab, r.anterior)}
    <div class="duas">
      <section class="bloco"><h2>Onde o perfil apareceu</h2><div class="sub">${inteiro(v.total)} visualizações no período</div>
        <div class="g-barras">
          ${barra("Busca do Google", v.busca, v.total)}
          ${barra("Google Maps", v.mapas, v.total)}
          <div class="g-sep"></div>
          ${barra("Celular", v.celular, v.total)}
          ${barra("Computador", v.computador, v.total)}
        </div>
      </section>
      <section class="bloco"><h2>Buscas que mostraram o perfil</h2><div class="sub">${r.termosMes ? `Em ${esc(r.termosMes)} — o Google fecha os termos por mês` : "O Google fecha os termos por mês"}</div>${termos}</section>
    </div>`;
}

/** As folhas do Google, já na ordem (Ads, depois Perfil). Cada uma com a nota do rodapé. */
export function folhasGoogle(g: RelatorioGoogle | null | undefined, clienteNome: string): { miolo: string; nota: string }[] {
  if (!g) return [];
  const out: { miolo: string; nota: string }[] = [];
  if (g.ads && !g.ads.semVeiculacao) out.push({ miolo: adsFolha(g.ads, clienteNome), nota: NOTA_GOOGLE_ADS });
  if (g.perfil && !g.perfil.semDados) out.push({ miolo: perfilFolha(g.perfil, clienteNome), nota: NOTA_GOOGLE_PERFIL });
  return out;
}

export const CSS_GOOGLE = `
.olho-google { color: ${GOOGLE_AZUL}; }
.olho-google-perfil { color: ${GOOGLE_VERDE}; }
.kpi-google { background: linear-gradient(180deg, ${GOOGLE_AZUL}24, ${GOOGLE_AZUL}08); }
.kpi-google .rotulo { color: ${GOOGLE_AZUL}; }
.c-google { background: ${GOOGLE_AZUL}; }
.leg-google { background: ${GOOGLE_AZUL}; }
.g-lista { margin-top: 2.5mm; }
.g-lista .numero b { display: inline-flex; gap: 6px; align-items: baseline; }
.g-barras { margin-top: 3.5mm; }
.g-rot { width: 92px; flex-shrink: 0; white-space: nowrap; }
.g-trilho { background: ${GOOGLE_VERDE} !important; }
.g-sep { height: 6px; }
.g-tabela { width: 100%; border-collapse: collapse; margin-top: 2.5mm; font-size: 7.6pt; font-variant-numeric: tabular-nums; }
.g-tabela th { text-align: right; font-size: 6.4pt; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; opacity: .7; padding: 0 0 4px 8px; }
.g-tabela th:first-child, .g-tabela td:first-child { text-align: left; padding-left: 0; }
.g-tabela td { text-align: right; padding: 4px 0 4px 8px; border-top: 1px solid rgba(255,255,255,.08); white-space: nowrap; }
.g-tabela td:first-child { white-space: normal; max-width: 70mm; }
`;
