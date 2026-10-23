// lib/crm/relatorio-mensal-html.ts — o desenho do relatório mensal de vendas (A4, 2–3 páginas) que vira PDF no browserless.
// Sem JavaScript: barras em CSS, tudo inline. Duas versões do MESMO relatório:
//   • grupo de vendas → quantidades e taxas, NENHUM valor em R$ (tests/comercial-relatorio-mensal.test.ts confere);
//   • Roberto → a mesma coisa + a página "Dinheiro" (vendido, implantação, ticket, meta, ponderado).

import { brl } from "@/lib/crm/meta";
import { textoFracao } from "@/lib/crm/taxas";
import { nomeDoMes, mesAnterior, mesSeguinte, type RelatorioMensal } from "@/lib/crm/relatorio-mensal";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function variacao(atual: number, anterior: number, mes: string): string {
  const d = atual - anterior;
  if (anterior === 0 && atual === 0) return "";
  if (d === 0) return `igual a ${nomeDoMes(mesAnterior(mes))}`;
  return `${d > 0 ? "+" : "−"}${Math.abs(d)} vs ${nomeDoMes(mesAnterior(mes))}`;
}

const CSS = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Montserrat", "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 11.5px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .topo { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #2B3CFF; padding-bottom: 10px; margin-bottom: 16px; }
  .marca { font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #2B3CFF; }
  h1 { font-size: 22px; margin: 2px 0 0; letter-spacing: -.01em; }
  .data { font-size: 10.5px; color: #475569; text-align: right; }
  .frase { font-size: 15px; font-weight: 600; margin: 0 0 14px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }
  .tile { border: 1px solid #dde3ee; border-radius: 10px; padding: 10px 12px; background: #f6f8fc; }
  .tile .rot { font-size: 9.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #475569; }
  .tile .num { font-size: 24px; font-weight: 700; margin-top: 4px; letter-spacing: -.02em; }
  .tile .sub { font-size: 10px; color: #475569; margin-top: 2px; }
  h2 { font-size: 13.5px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #dde3ee; }
  .apoio { color: #475569; font-size: 10.5px; margin: -4px 0 8px; }
  .linha { display: grid; grid-template-columns: 120px 1fr 44px; align-items: center; gap: 10px; margin: 5px 0; }
  .barra { height: 12px; background: #e8ecf5; border-radius: 6px; overflow: hidden; }
  .barra > div { height: 100%; background: #2B3CFF; border-radius: 6px; }
  .barra > div.ok { background: #157038; }
  .num-dir { text-align: right; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: #475569; font-weight: 600; padding: 5px 6px; border-bottom: 1px solid #dde3ee; }
  td { padding: 6px; border-bottom: 1px solid #eef1f7; }
  td.n, th.n { text-align: right; }
  .vazio { color: #475569; font-style: italic; }
  .grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .chips span { display: inline-block; border: 1px solid #dde3ee; border-radius: 999px; padding: 3px 10px; margin: 0 6px 6px 0; font-size: 10.5px; }
  .quebra { break-before: page; }
  .ok-txt { color: #157038; font-weight: 600; }
  .alerta-txt { color: #92400e; font-weight: 600; }
  .rodape { margin-top: 18px; padding-top: 8px; border-top: 1px solid #dde3ee; color: #475569; font-size: 9.5px; }
  .dinheiro { border: 2px solid #2B3CFF; border-radius: 12px; padding: 14px 16px; }
`;

export function htmlRelatorioMensal(r: RelatorioMensal, opts: { privado: boolean; geradoEm: string }): string {
  const z = r.resumo;
  const maxFunil = Math.max(1, ...r.funil.map((f) => f.n));
  const funil = r.funil.map((f, i) => {
    const ant = i > 0 ? r.funil[i - 1].n : 0;
    const passagem = i > 0 && ant > 0 ? `<div style="margin:-3px 0 4px 130px;font-size:9.5px;color:#475569">${Math.round((f.n / ant) * 100)}% da etapa anterior</div>` : "";
    return `<div class="linha"><span>${esc(f.rotulo)}</span><div class="barra"><div class="${f.rotulo === "Contrato" ? "ok" : ""}" style="width:${f.n ? Math.max(3, (f.n / maxFunil) * 100) : 0}%"></div></div><span class="num-dir">${f.n}</span></div>${passagem}`;
  }).join("");

  const vendas = r.vendas.length
    ? `<table><thead><tr><th>Cliente</th><th>Origem</th><th>Quem vendeu</th><th class="n">Ciclo</th><th>No Lone OS</th></tr></thead><tbody>${r.vendas.map((v) =>
        `<tr><td><strong>${esc(v.nome)}</strong></td><td>${esc(v.origem)}</td><td>${esc(v.responsavel)}</td><td class="n">${v.cicloDias == null ? "—" : plural(v.cicloDias, "dia", "dias")}</td><td>${v.virouCliente ? '<span class="ok-txt">já é cliente</span>' : '<span class="alerta-txt">falta virar cliente</span>'}</td></tr>`).join("")}</tbody></table>`
    : `<p class="vazio">Nenhuma venda fechada em ${nomeDoMes(r.mes)}.</p>`;

  const origens = r.origens.length
    ? `<table><thead><tr><th>Origem</th><th class="n">Leads</th><th class="n">Chegaram a proposta</th><th class="n">Contratos</th></tr></thead><tbody>${r.origens.map((g) =>
        `<tr><td>${esc(g.chave)}</td><td class="n">${g.leads}</td><td class="n">${g.oportunidades}</td><td class="n"><strong>${g.ganhos}</strong>${g.fracao.pct !== null ? ` <span style="color:#475569">(${g.fracao.pct}%)</span>` : ""}</td></tr>`).join("")}</tbody></table>`
    : `<p class="vazio">Nenhum lead novo em ${nomeDoMes(r.mes)}.</p>`;

  const perdas = r.perdas.length
    ? r.perdas.map((p) => `<div class="linha"><span>${esc(p.motivo)}</span><div class="barra"><div style="width:${(p.n / Math.max(...r.perdas.map((x) => x.n))) * 100}%;background:#b91c1c"></div></div><span class="num-dir">${p.n}</span></div>`).join("")
    : `<p class="vazio">Nenhum negócio marcado como perdido em ${nomeDoMes(r.mes)}. Marcar o que morreu (sem resposta, sem verba…) mantém a taxa de fechamento honesta.</p>`;

  const rt = r.ritmo;
  const ritmo = `<div class="tiles">
    <div class="tile"><div class="rot">Toques feitos</div><div class="num">${rt.toques}</div><div class="sub">WhatsApp, ligação, visita</div></div>
    <div class="tile"><div class="rot">Propostas enviadas</div><div class="num">${rt.propostas}</div></div>
    <div class="tile"><div class="rot">Reuniões</div><div class="num">${rt.reunioesRealizadas}</div><div class="sub">${plural(rt.reunioesMarcadas, "marcada", "marcadas")} no mês · ${plural(rt.naoVeio, "não veio", "não vieram")}</div></div>
    <div class="tile"><div class="rot">1ª resposta</div><div class="num">${rt.primeiraRespostaHoras == null ? "—" : rt.primeiraRespostaHoras < 1 ? `${Math.round(rt.primeiraRespostaHoras * 60)} min` : `${rt.primeiraRespostaHoras.toLocaleString("pt-BR")} h`}</div><div class="sub">${rt.primeiraRespostaN ? `média de ${plural(rt.primeiraRespostaN, "lead", "leads")} do site/anúncio` : "nenhum lead do site/anúncio"}</div></div>
  </div>`;

  const px = r.proximo;
  const proximo = `<div class="grade2">
    <div>
      <p class="apoio">Negócios abertos por etapa</p>
      <div class="chips">${px.abertasPorEtapa.length ? px.abertasPorEtapa.map((e) => `<span><strong>${e.n}</strong> ${esc(e.rotulo)}</span>`).join("") : '<span class="vazio">nenhum</span>'}</div>
      <p class="apoio" style="margin-top:10px">Reuniões já marcadas</p>
      ${px.reunioes.length ? `<table><tbody>${px.reunioes.map((m) => `<tr><td>${esc(m.nome)}</td><td class="n">${dm(m.dia)}</td></tr>`).join("")}</tbody></table>` : '<p class="vazio">Nenhuma reunião marcada ainda.</p>'}
    </div>
    <div>
      <p class="apoio">Parados há mais tempo — o próximo passo é destravar</p>
      ${px.parados.length ? `<table><thead><tr><th>Negócio</th><th>Etapa</th><th class="n">Parado</th></tr></thead><tbody>${px.parados.map((q) => `<tr><td>${esc(q.nome)}</td><td>${esc(q.etapa)}</td><td class="n">${plural(q.dias, "dia", "dias")}</td></tr>`).join("")}</tbody></table>` : '<p class="vazio">Nada parado.</p>'}
    </div>
  </div>`;

  const d = r.dinheiro;
  const dinheiro = opts.privado
    ? `<div class="quebra"></div><h2>Dinheiro — só para você</h2><div class="dinheiro"><div class="tiles" style="margin:0">
        <div class="tile"><div class="rot">Vendido no mês</div><div class="num">${brl(d.vendido)}</div><div class="sub">mensalidade nova (MRR)</div></div>
        <div class="tile"><div class="rot">Meta do mês</div><div class="num">${d.meta == null ? "—" : brl(d.meta)}</div><div class="sub">${d.meta ? `${Math.round((d.vendido / d.meta) * 100)}% atingido` : "meta não definida"}</div></div>
        <div class="tile"><div class="rot">Ticket médio</div><div class="num">${d.ticket == null ? "—" : brl(d.ticket)}</div><div class="sub">implantação: ${brl(d.implantacao)}</div></div>
        <div class="tile"><div class="rot">Ponderado aberto</div><div class="num">${brl(d.ponderadoAberto)}</div><div class="sub">mensalidade × chance dos abertos</div></div>
      </div></div>`
    : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de vendas — ${esc(r.rotulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="topo"><div><div class="marca">Lone Mídia · Comercial</div><h1>Relatório de vendas — ${esc(r.rotulo)}</h1></div><div class="data">gerado em ${esc(opts.geradoEm)}${opts.privado ? "<br><strong>versão do Roberto</strong>" : ""}</div></div>
<p class="frase">${esc(z.frase)}</p>
<div class="tiles">
  <div class="tile"><div class="rot">Vendas fechadas</div><div class="num">${z.vendas}</div><div class="sub">${variacao(z.vendas, z.vendasAnterior, r.mes) || "&nbsp;"}</div></div>
  <div class="tile"><div class="rot">Oportunidades novas</div><div class="num">${z.oportunidades}</div><div class="sub">chegaram a proposta${z.oportunidadesAnterior || z.oportunidades ? ` · ${variacao(z.oportunidades, z.oportunidadesAnterior, r.mes)}` : ""}</div></div>
  <div class="tile"><div class="rot">Oportunidades → contrato</div><div class="num">${z.conversao.de ? textoFracao(z.conversao) : "—"}</div><div class="sub">${z.conversao.de ? (z.conversao.pct === null ? "viraram contrato" : `${z.conversao.n} de ${z.conversao.de}`) : "sem oportunidade no mês"}${z.cicloDias != null ? ` · ciclo médio ${plural(z.cicloDias, "dia", "dias")}` : ""}</div></div>
  <div class="tile"><div class="rot">Leads novos</div><div class="num">${z.leads}</div><div class="sub">${variacao(z.leads, z.leadsAnterior, r.mes) || "&nbsp;"}</div></div>
</div>
<h2>Funil do mês</h2><p class="apoio">Dos ${plural(z.leads, "lead que entrou", "leads que entraram")} em ${nomeDoMes(r.mes)}: até onde cada um já chegou</p>
${funil}
<h2>Vendas fechadas</h2>${vendas}
${z.fechamento.de ? `<p class="apoio" style="margin-top:6px">Dos negócios decididos no mês, ${textoFracao(z.fechamento)} foram ganhos.</p>` : ""}
<div class="quebra"></div>
<h2>De onde veio</h2><p class="apoio">Leads que entraram em ${nomeDoMes(r.mes)}, por origem</p>${origens}
<div class="grade2"><div><h2>Por que perdemos</h2>${perdas}</div><div><h2>Rota Lagos</h2><p>${plural(r.rota.visitas, "loja visitada virou lead", "lojas visitadas viraram lead")} no mês; ${plural(r.rota.oportunidades, "chegou", "chegaram")} a proposta.</p></div></div>
<h2>Ritmo do time</h2>${ritmo}
<h2>Para ${nomeDoMes(mesSeguinte(r.mes))}</h2>${proximo}
${dinheiro}
<div class="rodape">Números do Comercial da Lone (comercial.lonemidia.com), registrados pelo sistema. Oportunidade = lead que chegou a proposta. Com menos de 5 casos, a taxa aparece como "X de Y", sem porcentagem.</div>
</body></html>`;
}
