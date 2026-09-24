// A REVISÃO SEMANAL DE OPERAÇÃO em PDF (N31). Mesmo visual dos PDFs do time (resultadoDiaPdf,
// bomDiaPdf): fundo escuro, cartões, uma folha. Documento impresso: cor literal é permitida aqui.

import type { BlocoPessoa, Revisao } from "./revisaoSemanal";

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";
const CRITICO = "#f2616b";
const BOM = "#3ecf8e";

const MAX_ITENS = 6;

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function diaPorExtenso(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
}

function kpi(rotulo: string, valor: string, detalhe: string, cor = TEXTO): string {
  return `<div style="flex:1;background:${CARTAO};border:1px solid ${LINHA};border-radius:10px;padding:12px 14px">
    <div style="color:${SUAVE};font-size:10.5px;text-transform:uppercase;letter-spacing:.06em">${esc(rotulo)}</div>
    <div style="font-size:24px;font-weight:600;margin-top:4px;color:${cor}">${esc(valor)}</div>
    <div style="color:${SUAVE};font-size:11px;margin-top:2px">${esc(detalhe)}</div>
  </div>`;
}

function secao(titulo: string, cor: string, corpo: string): string {
  return `<h2 style="font-size:14.5px;margin:22px 0 8px;display:flex;align-items:center;gap:8px">
      <span style="width:4px;height:15px;border-radius:2px;background:${cor};display:inline-block"></span>${esc(titulo)}
    </h2>
    <div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:10px;padding:6px 16px">${corpo}</div>`;
}

function tabelaPosts(r: Revisao): string {
  const linhas = r.pessoas.filter((p) => p.posts.planejados + p.posts.noAr + p.posts.registrados > 0);
  if (!linhas.length) return `<p style="padding:12px 0;color:${SUAVE};font-size:12px">Nenhum post planejado nem publicado na semana.</p>`;
  const th = (t: string, dir = false) => `<th style="text-align:${dir ? "right" : "left"};font-weight:500;color:${SUAVE};font-size:10.5px;padding:8px 0 6px;border-bottom:1px solid ${LINHA}">${t}</th>`;
  const td = (v: string | number, cor = TEXTO, dir = true) => `<td style="text-align:${dir ? "right" : "left"};padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${cor}">${v}</td>`;
  const corpo = linhas.map((p) => `<tr>
      ${td(esc(p.pessoa), TEXTO, false)}
      ${td(p.posts.planejados)}
      ${td(p.posts.noAr, p.posts.noAr >= p.posts.planejados ? BOM : TEXTO)}
      ${td(p.posts.registrados, SUAVE)}
      ${td(p.posts.semPost, p.posts.semPost ? CRITICO : SUAVE)}
      ${td(p.posts.depoisDoDia, p.posts.depoisDoDia ? ALERTA : SUAVE)}
    </tr>`).join("");
  return `<table style="width:100%;border-collapse:collapse">
    <tr>${th("Social")}${th("Planejados", true)}${th("No ar", true)}${th("No quadro", true)}${th("Sem post", true)}${th("Depois do dia", true)}</tr>
    ${corpo}
  </table>`;
}

function lista(titulo: string, itens: string[], total: number, cor: string): string {
  if (!total) return "";
  const resto = total - itens.length;
  return `<div style="margin:6px 0 10px">
    <div style="font-size:11px;color:${cor};font-weight:600;margin-bottom:3px">${esc(titulo)} (${total})</div>
    ${itens.map((i) => `<div style="font-size:12px;padding:2px 0 2px 10px;color:${TEXTO}">${i}</div>`).join("")}
    ${resto > 0 ? `<div style="font-size:11px;padding:2px 0 0 10px;color:${SUAVE}">+${resto} ${resto === 1 ? "outro" : "outros"}</div>` : ""}
  </div>`;
}

function blocoPendencias(p: BlocoPessoa): string {
  const cards = p.cardsAtrasados.slice(0, MAX_ITENS).map((c) =>
    `${esc(c.cliente)} — ${esc(c.titulo)} <span style="color:${SUAVE}">· ${esc(c.etapa)} · ${plural(c.dias, "dia", "dias")}</span>`);
  const reun = p.reunioesPendentes.slice(0, MAX_ITENS).map((m) => `${esc(m.cliente)} <span style="color:${SUAVE}">· ${esc(m.motivo)}</span>`);
  const tar = p.tarefasVencidas.slice(0, MAX_ITENS).map((t) =>
    `${esc(t.titulo)}${t.cliente && !t.titulo.toLowerCase().includes(t.cliente.toLowerCase()) ? ` <span style="color:${SUAVE}">· ${esc(t.cliente)}</span>` : ""} <span style="color:${SUAVE}">· venceu há ${plural(t.dias, "dia", "dias")}</span>`);
  const feitas = p.reunioesFeitas.length
    ? `<div style="font-size:11.5px;color:${BOM};margin:4px 0 8px">Reuniões feitas: ${esc(p.reunioesFeitas.join(", "))}</div>` : "";
  return `<div style="padding:10px 0;border-bottom:1px solid ${LINHA}">
    <div style="font-size:13.5px;font-weight:600;margin-bottom:2px">${esc(p.pessoa)}</div>
    ${feitas}
    ${lista("Cards com prazo vencido", cards, p.cardsAtrasados.length, CRITICO)}
    ${lista("Reuniões pendentes", reun, p.reunioesPendentes.length, ALERTA)}
    ${lista("Tarefas vencidas", tar, p.tarefasVencidas.length, ALERTA)}
  </div>`;
}

export function revisaoSemanalPdfHtml(r: Revisao, logo: string, falhas: string[] = []): string {
  const t = r.totais;
  const comPendencia = r.pessoas.filter((p) =>
    p.cardsAtrasados.length + p.reunioesPendentes.length + p.tarefasVencidas.length + p.reunioesFeitas.length > 0);
  const atrasos = t.cardsAtrasados + t.tarefasVencidas;

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
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Operação · uso interno<br>gerado ${esc(diaPorExtenso(r.hoje))}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">Revisão da semana</h1>
    <p style="color:${SUAVE};font-size:12.5px">Segunda a domingo, ${esc(r.semana.rotulo)}</p>

    <div style="display:flex;gap:10px;margin-top:18px">
      ${kpi("Posts no ar", String(t.noAr), `de ${plural(t.planejados, "planejado", "planejados")} no quadro`, t.noAr >= t.planejados ? BOM : TEXTO)}
      ${kpi("Registrados no quadro", String(t.registrados), "cards marcados No ar")}
      ${kpi("Atrasos agora", String(atrasos), `${plural(t.cardsAtrasados, "card", "cards")} · ${plural(t.tarefasVencidas, "tarefa", "tarefas")}`, atrasos ? ALERTA : BOM)}
      ${kpi("Reuniões feitas", String(t.reunioesFeitas), `${plural(t.reunioesPendentes, "pendente", "pendentes")}`)}
    </div>

    ${secao("Postagens por social", BRAND, tabelaPosts(r))}
    ${secao("Pendências por responsável", ALERTA, comPendencia.length
      ? comPendencia.map(blocoPendencias).join("")
      : `<p style="padding:12px 0;color:${SUAVE};font-size:12px">Nenhuma pendência. 👏</p>`)}

    <div style="margin-top:22px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;line-height:1.6">
      No ar = post publicado no Instagram (o que o cliente vê). No quadro = card marcado No ar. Sem post = planejado na semana que não saiu,
      só de cliente com Instagram vinculado${t.clientesSemInstagram ? ` (${plural(t.clientesSemInstagram, "cliente está", "clientes estão")} sem Instagram vinculado e fica${t.clientesSemInstagram === 1 ? "" : "m"} de fora)` : ""}.
      Depois do dia = post que casou com um card e saiu depois da data planejada. Atrasos = cards com prazo vencido com o designer,
      em revisão ou com o cliente, e tarefas vencidas, contados hoje.
      ${falhas.length ? `<br><span style="color:${ALERTA}">Não consegui ler: ${esc(falhas.join("; "))}. Os números dessa parte podem estar incompletos.</span>` : ""}
    </div>
  </body></html>`;
}
