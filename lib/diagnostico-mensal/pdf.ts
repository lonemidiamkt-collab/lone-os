// lib/diagnostico-mensal/pdf.ts — o PDF do diagnóstico mensal. Só desenha o que `analisar` devolveu.
//
// Estrutura do modelo do Império dos Pisos (Roberto, 19/10/2026): resumo com nota → anúncios →
// criativos → Instagram → conteúdo → plano de ação. Fundo claro (vai ser impresso e lido no celular),
// azul da marca #0d4af5.

import { analisar, brl, dm, inteiro, variacao, type Achado, type Analise, type DadosCliente, type Entidade } from "./analise";

const AZUL = "#0d4af5";
const TEXTO = "#0f172a";
const SUAVE = "#64748b";
const LINHA = "#e2e8f0";
const FUNDO = "#f8fafc";
const OK = "#15803d";
const ALERTA = "#b45309";
const CRITICO = "#b91c1c";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const corGrav = (g: Achado["gravidade"]) => (g === "alta" ? CRITICO : g === "media" ? ALERTA : SUAVE);

function setaVar(v: number | null, menorEMelhor: boolean): string {
  if (v == null) return `<span style="color:${SUAVE}">sem base de comparação</span>`;
  const bom = menorEMelhor ? v <= 0 : v >= 0;
  return `<span style="color:${bom ? OK : CRITICO}">${v > 0 ? "+" : ""}${inteiro(v)}% vs. período anterior</span>`;
}

const kpi = (rotulo: string, valor: string, sub: string) => `
  <div class="kpi"><div class="k-r">${esc(rotulo)}</div><div class="k-v">${valor}</div><div class="k-s">${sub}</div></div>`;

function grafico(a: Analise, rotulo: string): string {
  const s = a.semanas;
  if (!s.length) return "";
  const W = 620, H = 150, base = 120, esq = 8;
  const max = Math.max(1, ...s.map((x) => x.resultados));
  const largura = (W - esq) / s.length;
  const barras = s.map((x, i) => {
    const h = Math.round((x.resultados / max) * 90);
    const x0 = esq + i * largura + largura * 0.2;
    return `<rect x="${x0}" y="${base - h}" width="${largura * 0.6}" height="${h}" rx="3" fill="${AZUL}"/>
      <text x="${x0 + largura * 0.3}" y="${base - h - 5}" font-size="11" text-anchor="middle" fill="${TEXTO}" font-weight="700">${inteiro(x.resultados)}</text>
      <text x="${x0 + largura * 0.3}" y="${base + 14}" font-size="10" text-anchor="middle" fill="${SUAVE}">${esc(x.rotulo)}</text>
      <text x="${x0 + largura * 0.3}" y="${base + 28}" font-size="10" text-anchor="middle" fill="${SUAVE}">${x.cpl ? esc(brl(x.cpl)) : "—"}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H + 12}" width="100%" role="img" aria-label="${esc(rotulo)} por semana">${barras}</svg>
    <div class="leg">Barras: ${esc(rotulo)} na semana (a partir da data indicada) · abaixo, custo por resultado</div>`;
}

function tabelaEntidades(titulo: string, lista: Entidade[], rotulo: string, destaque: string): string {
  if (!lista.length) return "";
  return `<div class="bloco"><div class="sub" style="color:${destaque}">${esc(titulo)}</div>
    <table><thead><tr><th>Anúncio</th><th class="n">Investido</th><th class="n">${esc(rotulo)}</th><th class="n">Custo</th></tr></thead><tbody>
    ${lista.map((e) => `<tr><td>${esc(e.nome.length > 56 ? e.nome.slice(0, 54) + "…" : e.nome)}<div class="camp">${esc(e.campanha ?? "")}</div></td>
      <td class="n">${esc(brl(e.invest))}</td><td class="n">${inteiro(e.resultados)}</td>
      <td class="n"><b>${e.resultados ? esc(brl(e.invest / e.resultados)) : "—"}</b></td></tr>`).join("")}
    </tbody></table></div>`;
}

function cartaoAchado(a: Achado, i: number): string {
  return `<div class="ach" style="border-left-color:${corGrav(a.gravidade)}">
    <div class="ach-t"><span class="num">${String(i + 1).padStart(2, "0")}</span> ${esc(a.titulo)}
      <span class="tag" style="color:${corGrav(a.gravidade)}">${a.gravidade === "alta" ? "Urgente" : a.gravidade === "media" ? "Importante" : "Info"}</span></div>
    <div class="ach-e">${esc(a.evidencia)}</div>
    <div class="ach-g"><b>Por que pesa:</b> ${esc(a.porque)}</div>
    <div class="ach-g"><b>Correção:</b> ${esc(a.acao)}</div></div>`;
}

export function diagnosticoMensalHtml(d: DadosCliente, logo: string, geradoEm = new Date()): { html: string; analise: Analise } {
  const a = analisar(d);
  const R = d.rotulo;
  const per = `${dm(d.periodo.de)} a ${dm(d.periodo.ate)}/${d.periodo.ate.slice(0, 4)}`;
  const temAds = a.atual.invest > 0;
  const ig = d.ig;
  const fontes = [temAds ? "Meta Ads" : "", ig ? "Instagram" : ""].filter(Boolean).join(", ") || "Sem fonte com dados";
  const cplRot = R === "conversas" ? "conversa" : R.replace(/s$/, "");
  const chaveNota = a.nota == null ? "—" : String(a.nota);

  const dimensoes = a.dimensoes.map((x) => `
    <div class="dim"><div class="dim-n">${esc(x.nome)} <span class="peso">peso ${x.peso}%</span></div>
      <div class="barra"><div style="width:${x.nota == null ? 0 : x.nota * 10}%;background:${x.nota == null ? LINHA : x.nota >= 7 ? OK : x.nota >= 5 ? ALERTA : CRITICO}"></div></div>
      <div class="dim-m">${x.nota == null ? "não avaliado" : `${x.nota}/10`} · ${esc(x.motivo)}</div></div>`).join("");

  const principais = a.achados.slice(0, 6);
  const cap = temAds
    ? `${inteiro(a.atual.resultados)} ${R} com ${brl(a.atual.invest)} investidos${a.atual.cpl ? `, ${brl(a.atual.cpl)} por ${cplRot}` : ""}.`
    : "Sem investimento em anúncios no período.";

  const paginaAds = temAds ? `
    <section class="pg">
      <div class="eyebrow">02 · Anúncios · Meta Ads</div>
      <h2>${a.atual.resultados >= a.anterior.resultados ? "Resultado do mês" : "O mês em números"}</h2>
      <p class="lead">${esc(per)} contra o período anterior (${dm(d.anterior.de)} a ${dm(d.anterior.ate)}).</p>
      <div class="kpis">
        ${kpi("Investimento", esc(brl(a.atual.invest)), setaVar(variacao(a.atual.invest, a.anterior.invest), false))}
        ${kpi(R[0].toUpperCase() + R.slice(1), inteiro(a.atual.resultados), setaVar(variacao(a.atual.resultados, a.anterior.resultados), false))}
        ${kpi(`Custo por ${cplRot}`, a.atual.cpl ? esc(brl(a.atual.cpl)) : "—", setaVar(variacao(a.atual.cpl, a.anterior.cpl), true))}
        ${kpi("Custo por mil", a.atual.cpm ? esc(brl(a.atual.cpm)) : "—", setaVar(variacao(a.atual.cpm, a.anterior.cpm), true))}
        ${kpi("Impressões", inteiro(a.atual.impressoes), setaVar(variacao(a.atual.impressoes, a.anterior.impressoes), false))}
        ${kpi("CTR", a.atual.ctr != null ? `${a.atual.ctr.toString().replace(".", ",")}%` : "—", setaVar(variacao(a.atual.ctr, a.anterior.ctr), false))}
      </div>
      <div class="sub">${esc(R[0].toUpperCase() + R.slice(1))} por semana</div>
      ${grafico(a, R)}
      ${d.metaCpl ? `<p class="nota">Meta de custo cadastrada para esta conta: ${esc(brl(d.metaCpl))} por ${esc(cplRot)}.</p>` : `<p class="nota">Esta conta não tem meta de custo cadastrada: a comparação é com o próprio histórico.</p>`}
      ${a.campeoes.length ? tabelaEntidades(`Anúncios mais baratos do mês (mínimo ${5} ${R})`, a.campeoes, R, OK) : `<p class="nota">${rotuloSemAnuncio(d)}</p>`}
      ${a.piores.length ? tabelaEntidades("Anúncios mais caros do mês", a.piores, R, CRITICO) : ""}
    </section>` : "";

  const paginaIg = ig ? `
    <section class="pg">
      <div class="eyebrow">03 · Instagram · @${esc(ig.usuario ?? "")}</div>
      <h2>${ig.postsNoPeriodo >= 10 ? "Perfil ativo" : "Perfil com pouca publicação"}</h2>
      <p class="lead">${ig.seguidores != null ? `${inteiro(ig.seguidores)} seguidores. ` : ""}${ig.parcial ? "Leitura parcial: a conta ainda não está liberada para métricas completas." : "Leitura completa da conta."}</p>
      <div class="kpis">
        ${kpi("Posts no período", inteiro(ig.postsNoPeriodo), ig.postsNoAnterior != null ? `${inteiro(ig.postsNoAnterior)} no mês anterior` : `esperado ~13 (seg/qua/sex)`)}
        ${kpi("Alcance", ig.alcance != null ? inteiro(ig.alcance) : "—", ig.alcanceJanelaDias ? `contas, janela de ${ig.alcanceJanelaDias} dias` : "indisponível")}
        ${kpi("Novos seguidores", ig.seguidoresGanhos != null ? inteiro(ig.seguidoresGanhos) : "—", "saldo do período")}
        ${kpi("Curtidas + comentários", inteiro(ig.engajamento), "soma dos posts do período")}
      </div>
      ${ig.posts.length ? `<div class="sub">Posts de maior alcance</div>
      <table><thead><tr><th>Post</th><th>Formato</th><th class="n">Alcance</th><th class="n">Curtidas + com.</th></tr></thead><tbody>
      ${[...ig.posts].sort((x, y) => (y.alcance ?? 0) - (x.alcance ?? 0)).slice(0, 5).map((p) => `<tr><td>${p.data ? dm(p.data.slice(0, 10)) : "—"}</td>
        <td>${/VIDEO|REEL/i.test(p.tipo) ? "Reel" : /CAROUSEL/i.test(p.tipo) ? "Carrossel" : "Imagem"}</td>
        <td class="n">${p.alcance != null ? inteiro(p.alcance) : "—"}</td><td class="n">${inteiro(p.engajamento)}</td></tr>`).join("")}
      </tbody></table>` : `<p class="nota">Nenhum post com métrica no período.</p>`}
      ${a.achados.filter((x) => x.area === "instagram").map((x, i) => cartaoAchado(x, i)).join("")}
    </section>` : "";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0 }
    * { margin:0; padding:0; box-sizing:border-box }
    body { font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:${TEXTO}; font-size:12.5px; line-height:1.5; background:#fff }
    .pg { padding:40px 46px 56px; page-break-after:always; min-height:1120px; position:relative }
    .pg:last-child { page-break-after:auto }
    .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:26px }
    .top img { height:30px }
    .eyebrow { font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:${AZUL}; font-weight:700; margin-bottom:6px }
    h1 { font-size:30px; letter-spacing:-.02em; line-height:1.15; margin-bottom:6px }
    h2 { font-size:22px; letter-spacing:-.015em; margin-bottom:4px }
    .lead { color:${SUAVE}; margin-bottom:16px; font-size:13px }
    .meta { display:flex; gap:26px; margin:12px 0 20px; font-size:11.5px; color:${SUAVE} }
    .meta b { display:block; color:${TEXTO}; font-size:12.5px }
    .nota-g { display:flex; align-items:center; gap:18px; background:${FUNDO}; border:1px solid ${LINHA}; border-radius:12px; padding:16px 20px; margin-bottom:18px }
    .nota-n { font-size:44px; font-weight:800; color:${AZUL}; letter-spacing:-.03em; line-height:1 }
    .nota-n small { font-size:15px; color:${SUAVE}; font-weight:600 }
    .dim { margin-bottom:9px }
    .dim-n { font-weight:700; font-size:12px } .peso { color:${SUAVE}; font-weight:400; font-size:10.5px; margin-left:6px }
    .barra { height:6px; background:${LINHA}; border-radius:4px; margin:3px 0 2px; overflow:hidden } .barra div { height:100%; border-radius:4px }
    .dim-m { font-size:11px; color:${SUAVE} }
    .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px }
    .kpi { border:1px solid ${LINHA}; border-radius:10px; padding:11px 13px; background:${FUNDO} }
    .k-r { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:${SUAVE} } .k-v { font-size:22px; font-weight:800; letter-spacing:-.02em; margin:2px 0 }
    .k-s { font-size:10.5px }
    .sub { font-size:13px; font-weight:700; margin:16px 0 6px }
    .leg, .nota { font-size:10.5px; color:${SUAVE}; margin-top:4px }
    table { width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:6px }
    th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:${SUAVE}; padding:5px 6px; border-bottom:1px solid ${LINHA} }
    td { padding:6px; border-bottom:1px solid ${LINHA}; vertical-align:top } .n { text-align:right; white-space:nowrap } .camp { font-size:10px; color:${SUAVE} }
    .ach { border:1px solid ${LINHA}; border-left:4px solid ${SUAVE}; border-radius:0 10px 10px 0; padding:10px 14px; margin-bottom:9px; page-break-inside:avoid }
    .ach-t { font-weight:700; font-size:13px; display:flex; gap:8px; align-items:baseline } .num { color:${AZUL} } .tag { margin-left:auto; font-size:10px; text-transform:uppercase; letter-spacing:.08em }
    .ach-e { margin-top:3px } .ach-g { font-size:11.5px; color:${SUAVE}; margin-top:3px } .ach-g b { color:${TEXTO} }
    ul.lista { padding-left:18px } ul.lista li { margin-bottom:7px }
    .plano { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:12px }
    .plano > div { border:1px solid ${LINHA}; border-radius:10px; padding:12px 14px; background:${FUNDO} }
    .plano h3 { font-size:13px; color:${AZUL}; margin-bottom:6px } .plano li { margin:0 0 6px 15px; font-size:11.5px }
    .rodape { position:absolute; left:46px; right:46px; bottom:22px; font-size:10px; color:${SUAVE}; border-top:1px solid ${LINHA}; padding-top:7px; display:flex; justify-content:space-between }
  </style></head><body>

  <section class="pg">
    <div class="top">${logo ? `<img src="${logo}" alt="Lone Mídia">` : `<b>Lone Mídia</b>`}<span style="color:${SUAVE};font-size:11px">Diagnóstico mensal</span></div>
    <div class="eyebrow">01 · Resumo executivo</div>
    <h1>${esc(d.nome)}</h1>
    <p class="lead">${esc(cap)}</p>
    <div class="meta"><div><b>${esc(d.nome)}</b>Cliente</div><div><b>${esc(per)}</b>Período</div><div><b>${esc(d.servico)}</b>Serviço</div><div><b>${esc(fontes)}</b>Fontes</div></div>
    <div class="nota-g"><div class="nota-n">${chaveNota}<small>/100</small></div>
      <div><b style="font-size:15px">${esc(a.veredito)}</b><div style="color:${SUAVE};font-size:11.5px">Nota sobre as dimensões com dado. O que não tem evidência fica sem nota e não entra na conta.</div></div></div>
    <div class="sub" style="margin-top:0">Nota por dimensão</div>
    ${dimensoes}
    <div class="sub">${principais.length === 1 ? "O ponto que mais pede ação" : principais.length ? `Os ${principais.length} pontos que mais pedem ação` : "Pontos de ação"}</div>
    ${principais.length ? principais.map((x, i) => `<div class="ach" style="border-left-color:${corGrav(x.gravidade)}"><div class="ach-t"><span class="num">${String(i + 1).padStart(2, "0")}</span> ${esc(x.titulo)}</div><div class="ach-e">${esc(x.evidencia)}</div></div>`).join("")
      : `<p class="nota">Nenhum ponto fora do lugar neste período.</p>`}
    <div class="rodape"><span>Lone Mídia · Diagnóstico mensal · ${esc(d.nome)} · ${esc(per)}</span><span>01</span></div>
  </section>

  ${paginaAds}
  ${paginaIg}

  <section class="pg">
    <div class="eyebrow">04 · Diagnóstico completo</div>
    <h2>O que encontramos, com evidência</h2>
    <p class="lead">Cada ponto traz o número que o sustenta, por que pesa e a correção.</p>
    ${a.achados.length ? a.achados.map((x, i) => cartaoAchado(x, i)).join("") : `<p class="nota">Nenhum ponto fora do lugar neste período.</p>`}
    <div class="sub">Conteúdo e crescimento do Instagram</div>
    <ul class="lista">${a.conteudo.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="rodape"><span>Lone Mídia · Diagnóstico mensal · ${esc(d.nome)} · ${esc(per)}</span><span>04</span></div>
  </section>

  <section class="pg">
    <div class="eyebrow">05 · Plano de ação</div>
    <h2>O que fazer primeiro</h2>
    <p class="lead">Ordem por impacto: a primeira semana corrige o que está custando dinheiro agora.</p>
    <div class="plano">
      <div><h3>Próximos 7 dias</h3><ul>${a.plano.seteDias.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h3>Em 30 dias</h3><ul>${a.plano.trintaDias.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h3>Em 90 dias</h3><ul>${a.plano.noventaDias.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>
    <p class="nota" style="margin-top:22px">Gerado automaticamente pelo Lone OS em ${esc(geradoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }))} a partir dos dados da Meta e do Instagram já coletados.
      Não inclui Google, concorrência nem atendimento no WhatsApp: esses pontos dependem de análise manual e ficam sem nota.</p>
    <div class="rodape"><span>Lone Mídia · Diagnóstico mensal · ${esc(d.nome)} · ${esc(per)}</span><span>05</span></div>
  </section>
  </body></html>`;
  return { html, analise: a };
}

function rotuloSemAnuncio(d: DadosCliente): string {
  return d.rotulo !== "conversas"
    ? `O ranking por anúncio só existe para contas que medem conversas; esta mede ${d.rotulo}.`
    : "Nenhum anúncio chegou a 5 resultados no período: pouco dado para apontar campeão.";
}

/** A frase que acompanha o PDF no grupo: nome, nota e a manchete. */
export function legendaCliente(d: DadosCliente, a: Analise): string {
  const urgentes = a.achados.filter((x) => x.gravidade === "alta").length;
  const linha = a.atual.invest > 0
    ? `${brl(a.atual.invest)} → ${inteiro(a.atual.resultados)} ${d.rotulo}${a.atual.cpl ? ` · ${brl(a.atual.cpl)} cada` : ""}`
    : "sem anúncio no período";
  return `📊 *${d.nome}* — ${a.nota != null ? `${a.nota}/100 · ${a.veredito}` : a.veredito}\n${linha}${urgentes ? `\n🔴 ${urgentes} ponto${urgentes > 1 ? "s" : ""} urgente${urgentes > 1 ? "s" : ""}` : ""}`;
}
