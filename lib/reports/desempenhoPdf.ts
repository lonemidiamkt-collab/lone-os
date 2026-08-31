// lib/reports/desempenhoPdf.ts — o desempenho da semana em PDF, no design system da casa.
//
// PRA QUE (Roberto, 31/08): "você envia muitas mensagens nos grupos da equipe, é muito textão.
// Algumas coisas podem ser resumidas e outras em PDFs mais básicos".
//
// Duas peças, mesma base de dados:
//   CEO      — o que está bom e o que preocupa, sem nome de pessoa. É leitura de negócio.
//   FUNÇÃO   — o cartão de uma pessoa: as metas dela, o que foi bem e o que precisa de atenção.
//
// A regra que separa as duas: número que expõe pessoa fica no PDF DELA. O do CEO fala da operação.

import type { BlocoFuncao, Meta, VisaoCeo } from "./desempenho";

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const OK = "#6ddba0";
const ALERTA = "#f0b357";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Bateu a meta? Depende de qual lado é o bom — retrabalho menor é melhor, entrega maior é melhor.
 * `null` quando não há veredito a dar: métrica sem base para medir, ou de acompanhamento (por onde
 * ninguém é cobrado). Dizer "fora da meta" nesses casos é acusar alguém pela lacuna do sistema.
 */
function bateu(m: Meta): boolean | null {
  if (m.valor === null || m.semBase || m.informativa) return null;
  return m.melhorQuando === "maior" ? m.valor >= m.alvo : m.valor <= m.alvo;
}

const BASE_CSS = `
  @page { margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:${FUNDO}; }
  body { font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:${TEXTO};
         padding:44px 52px; font-size:14px; min-height:100vh; }
  .head { display:flex; align-items:center; justify-content:space-between;
          border-bottom:2px solid ${BRAND}; padding-bottom:16px; margin-bottom:24px; }
  .head img { height:34px; }
  .head .meta { text-align:right; color:${SUAVE}; font-size:11px; line-height:1.6; }
  h1 { font-size:26px; letter-spacing:-.02em; margin-bottom:6px; }
  .sub { color:${SUAVE}; font-size:13px; margin-bottom:26px; }
  h2 { font-size:15px; margin-bottom:12px; letter-spacing:-.01em; }
  .foot { margin-top:32px; border-top:1px solid ${LINHA}; padding-top:12px;
          color:${SUAVE}; font-size:10px; text-align:center; }
`;

function cabecalho(logo: string, tipo: string, periodo: string): string {
  return `<div class="head">
    ${logo ? `<img src="${logo}" alt="Lone Mídia">` : `<div style="font-weight:800;font-size:19px">Lone Mídia</div>`}
    <div class="meta">${esc(tipo)}<br>${esc(periodo)}</div>
  </div>`;
}

/** PDF do CEO: o que está bom, o que preocupa, e o tamanho da carteira. Sem nome de pessoa. */
export function ceoPdfHtml(v: VisaoCeo, logo: string): string {
  const linha = (i: { numero: string; texto: string }, cor: string) => `
    <div style="display:flex;gap:14px;align-items:baseline;padding:11px 16px;background:${CARTAO};
                border:1px solid ${LINHA};border-left:3px solid ${cor};border-radius:0 8px 8px 0;margin-bottom:8px">
      <span style="font-size:23px;font-weight:800;color:${cor};min-width:64px;letter-spacing:-.02em">${esc(i.numero)}</span>
      <span style="font-size:13.5px;color:${TEXTO};line-height:1.5">${esc(i.texto)}</span>
    </div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    ${cabecalho(logo, "Resumo da semana", v.rotulo)}
    <h1>Como foi a semana</h1>
    <p class="sub">Leitura da operação — produção, prazo e o que ficou para trás.</p>

    <h2 style="color:${OK}">O que está bom</h2>
    ${v.bom.length ? v.bom.map((i) => linha(i, OK)).join("") :
      `<p style="color:${SUAVE};font-size:13px;margin-bottom:8px">Sem destaque positivo nesta semana.</p>`}

    <h2 style="color:${ALERTA};margin-top:24px">O que preocupa</h2>
    ${v.preocupa.length ? v.preocupa.map((i) => linha(i, ALERTA)).join("") :
      `<p style="color:${SUAVE};font-size:13px">Nada fora do lugar nesta semana.</p>`}

    <div style="display:flex;gap:10px;margin-top:26px">
      ${[["Clientes ativos", v.carteira.ativos], ["Sem peça há 4 semanas", v.carteira.semConteudo],
         ["Pedidos esperando decisão", v.carteira.pedidosAbertos]].map(([l, n]) => `
        <div style="flex:1;background:${CARTAO};border:1px solid ${LINHA};border-radius:8px;padding:14px 16px">
          <div style="font-size:24px;font-weight:800;letter-spacing:-.02em">${n}</div>
          <div style="font-size:11px;color:${SUAVE};margin-top:3px">${l}</div>
        </div>`).join("")}
    </div>

    <div class="foot">Lone Mídia · gerado automaticamente · ${esc(v.rotulo)}</div>
  </body></html>`;
}

/** PDF de uma pessoa: as metas da função dela, o que foi bem e o que precisa de atenção. */
export function funcaoPdfHtml(b: BlocoFuncao, periodo: string, logo: string): string {
  const rotuloFuncao = { designer: "Designer", social: "Social Media", trafego: "Tráfego Pago" }[b.funcao];

  const meta = ([nome, m]: [string, Meta]) => {
    const ok = bateu(m);
    const sufixo = m.unidade === "%" ? "%" : m.unidade === "dias" ? " dias" : "";

    // Sem base: mostra o motivo no lugar do número. Um "0%" ali seria lido como desempenho zero.
    if (m.valor === null || m.semBase) {
      return `<div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:8px;padding:15px 17px">
        <div style="font-size:11.5px;color:${SUAVE};margin-bottom:7px">${esc(nome)}</div>
        <div style="font-size:19px;font-weight:700;color:${SUAVE};letter-spacing:-.02em">—</div>
        <div style="font-size:10.5px;color:${SUAVE};margin-top:5px">${esc(m.semBase || "sem dado nesta semana")}</div>
      </div>`;
    }

    // Acompanhamento: tem número, não tem veredito. Devolver arte pra ajuste é o trabalho de quem
    // revisa — marcar isso como "fora da meta" pune justamente quem confere antes do cliente ver.
    const cor = ok === null ? TEXTO : ok ? OK : ALERTA;
    const selo = ok === null
      ? `<span style="font-size:10.5px;color:${SUAVE}">acompanhamento</span>`
      : `<span style="font-size:10.5px;color:${ok ? OK : ALERTA}">${ok ? "✓ na meta" : "fora da meta"}</span>`;
    const rodape = ok === null && m.informativa
      ? "sem meta — número de acompanhamento"
      : m.melhorQuando === "maior" ? `meta: ${m.alvo}${sufixo} ou mais` : `meta: até ${m.alvo}${sufixo}`;

    return `<div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:8px;padding:15px 17px">
      <div style="font-size:11.5px;color:${SUAVE};margin-bottom:7px">${esc(nome)}</div>
      <div style="display:flex;align-items:baseline;gap:9px">
        <span style="font-size:27px;font-weight:800;color:${cor};letter-spacing:-.02em">${m.valor}${sufixo}</span>
        ${selo}
      </div>
      <div style="font-size:10.5px;color:${SUAVE};margin-top:5px">${esc(rodape)}</div>
    </div>`;
  };

  const lista = (itens: string[], cor: string, titulo: string) => itens.length ? `
    <h2 style="color:${cor};margin-top:24px">${titulo}</h2>
    ${itens.map((t) => `<div style="padding:9px 15px;background:${CARTAO};border:1px solid ${LINHA};
      border-left:3px solid ${cor};border-radius:0 8px 8px 0;margin-bottom:7px;font-size:13px">${esc(t)}</div>`).join("")}` : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${BASE_CSS}
    .metas { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  </style></head><body>
    ${cabecalho(logo, `Desempenho · ${rotuloFuncao}`, periodo)}
    <h1>${esc(b.pessoa)}</h1>
    <p class="sub">Como foi a sua semana, nas métricas da sua função.</p>
    <div class="metas">${Object.entries(b.metas).map(meta).join("")}</div>
    ${lista(b.destaques, OK, "Foi bem")}
    ${lista(b.atencao, ALERTA, "Merece atenção")}
    <div class="foot">Lone Mídia · ${esc(periodo)} · as metas saem da média da própria operação e são revisadas com o time</div>
  </body></html>`;
}
