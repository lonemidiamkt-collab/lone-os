// Os saldos das contas de anúncio em UM PDF, no lugar de uma mensagem por conta.
//
// PRA QUE (Roberto, 02/09): "por que você não cria um PDF e envia mostrando pro gestor de tráfego —
// a conta X está zerada, a Y tem só isso de saldo — em vez de mandar vários, que fica tudo poluído?"
//
// O digest mandava cabeçalho + uma mensagem por conta com problema. Numa segunda com 8 contas no
// vermelho são 9 mensagens seguidas no grupo, e o efeito é o mesmo de sempre: o time rola sem ler.
// Aqui a mesma informação cabe numa página, ordenada pelo que precisa de ação primeiro, com o total
// que ninguém conseguia somar de cabeça lendo mensagem por mensagem.

import type { DigestAccount } from "@/lib/budgets/alert-engine";

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const OK = "#6ddba0";
const ALERTA = "#f0b357";
const CRITICO = "#f2616b";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COR: Record<string, string> = { critical: CRITICO, warning: ALERTA, error: SUAVE, ok: OK };
const ROTULO: Record<string, string> = {
  critical: "precisa de recarga", warning: "acabando", error: "sem leitura", ok: "ok",
};

/** "acaba hoje", "1 dia", "3 dias" — nunca 0.0105709106462 dias. */
function diasLegiveis(d: number | null): string {
  if (d === null || !Number.isFinite(d) || d < 0) return "";
  if (d < 1) return "acaba hoje no ritmo atual";
  const n = Math.floor(d);
  return `${n} dia${n === 1 ? "" : "s"} no ritmo atual`;
}

/** Ordem de leitura: quem precisa de ação primeiro. Dentro do grupo, o mais vazio na frente. */
function ordenar(contas: DigestAccount[]): DigestAccount[] {
  const peso: Record<string, number> = { critical: 0, warning: 1, error: 2, ok: 3 };
  return [...contas].sort((a, b) => {
    const d = (peso[a.alert.severity] ?? 9) - (peso[b.alert.severity] ?? 9);
    if (d !== 0) return d;
    return (a.available ?? Infinity) - (b.available ?? Infinity);
  });
}

export function saldosPdfHtml(contas: DigestAccount[], logo: string, quando: string): string {
  const lista = ordenar(contas);
  const criticas = lista.filter((c) => c.alert.severity === "critical");
  const atencao = lista.filter((c) => c.alert.severity === "warning");
  const semLeitura = lista.filter((c) => c.alert.severity === "error");
  const total = lista.reduce((s, c) => s + (c.available ?? 0), 0);

  const linha = (c: DigestAccount) => {
    const cor = COR[c.alert.severity] ?? SUAVE;
    const pct = c.alert.pctRemaining !== null ? `${c.alert.pctRemaining.toFixed(0)}% da verba` : "sem verba definida";
    // Dias restantes é o número que decide se dá pra esperar até amanhã ou não — e por isso precisa
    // ser lido de relance. O cálculo vem em fração (0.0105709106462…), e imprimir isso cru ocupa
    // meia linha dizendo menos que "acaba hoje".
    const dias = diasLegiveis(c.daysRemaining);
    return `<tr>
      <td style="padding:9px 0;border-bottom:1px solid ${LINHA}">
        <div style="font-size:13px;color:${TEXTO};font-weight:600">${esc(c.clientName)}</div>
        <div style="font-size:10.5px;color:${SUAVE}">${esc(c.alert.reason)}${dias ? ` · ${dias}` : ""}</div>
      </td>
      <td style="padding:9px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap">
        <div style="font-size:15px;font-weight:800;color:${cor}">${esc(brl(c.available))}</div>
        <div style="font-size:10.5px;color:${SUAVE}">${esc(pct)}</div>
      </td>
    </tr>`;
  };

  const bloco = (titulo: string, cor: string, itens: DigestAccount[], nota?: string) => itens.length ? `
    <h2 style="color:${cor};font-size:14px;margin:22px 0 4px">${esc(titulo)} <span style="color:${SUAVE};font-weight:400">· ${itens.length}</span></h2>
    ${nota ? `<p style="font-size:10.5px;color:${SUAVE};margin-bottom:6px">${esc(nota)}</p>` : ""}
    <table style="width:100%;border-collapse:collapse">${itens.map(linha).join("")}</table>` : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:${FUNDO}; }
    body { font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:${TEXTO};
           padding:44px 52px; font-size:14px; min-height:100vh; }
    .head { display:flex; align-items:center; justify-content:space-between;
            border-bottom:2px solid ${BRAND}; padding-bottom:16px; margin-bottom:22px; }
    .head img { height:34px; }
  </style></head><body>
    <div class="head">
      ${logo ? `<img src="${logo}" alt="Lone Mídia">` : `<div style="font-weight:800;font-size:19px">Lone Mídia</div>`}
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Saldo das contas<br>${esc(quando)}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">Saldo das contas de anúncio</h1>
    <p style="color:${SUAVE};font-size:12.5px;margin-bottom:20px">
      ${lista.length} contas · ${esc(brl(total))} disponível somando todas
    </p>

    <div style="display:flex;gap:9px;flex-wrap:wrap">
      ${[[criticas.length, "Precisam de recarga", CRITICO],
         [atencao.length, "Acabando", ALERTA],
         [lista.length - criticas.length - atencao.length - semLeitura.length, "Tranquilas", OK],
         [semLeitura.length, "Sem leitura", SUAVE]]
        .filter(([n]) => Number(n) > 0)
        .map(([n, rot, cor]) => `
        <div style="flex:1;min-width:110px;background:${CARTAO};border:1px solid ${LINHA};border-radius:8px;padding:13px 15px">
          <div style="font-size:23px;font-weight:800;color:${cor};letter-spacing:-.02em">${n}</div>
          <div style="font-size:10.5px;color:${SUAVE};margin-top:2px">${rot}</div>
        </div>`).join("")}
    </div>

    ${bloco("Precisam de recarga", CRITICO, criticas, "Sem saldo o anúncio para, e o cliente percebe antes da gente.")}
    ${bloco("Acabando", ALERTA, atencao, "Dá pra avisar o cliente agora e evitar a parada.")}
    ${bloco("Sem leitura", SUAVE, semLeitura, "A Meta não devolveu o saldo — pode ser acesso revogado, não necessariamente conta vazia.")}

    <div style="margin-top:30px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;text-align:center">
      Lone Mídia · ${esc(quando)} · contas tranquilas ficam fora da lista de propósito
    </div>
  </body></html>`;
}

/** A mensagem curta que acompanha o PDF. O documento carrega o detalhe; aqui vai só a manchete. */
export function legendaSaldos(contas: DigestAccount[]): string {
  const criticas = contas.filter((c) => c.alert.severity === "critical");
  const atencao = contas.filter((c) => c.alert.severity === "warning");
  if (!criticas.length && !atencao.length) {
    return `💰 *Saldo das contas* — todas as ${contas.length} contas com saldo tranquilo. Detalhe no PDF.`;
  }
  const partes = [
    criticas.length ? `${criticas.length} precisa${criticas.length > 1 ? "m" : ""} de recarga` : "",
    atencao.length ? `${atencao.length} acabando` : "",
  ].filter(Boolean).join(" · ");
  const nomes = criticas.slice(0, 4).map((c) => c.clientName).join(", ");
  return `💰 *Saldo das contas* — ${partes}.` +
    (nomes ? `\n${nomes}${criticas.length > 4 ? ` e mais ${criticas.length - 4}` : ""}.` : "") +
    `\nO PDF tem a lista completa com valor e dias restantes.`;
}
