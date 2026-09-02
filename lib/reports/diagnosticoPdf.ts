// O diagnóstico diário de tráfego em PDF.
//
// Roberto (02/09): "seria interessante esses avisos das 8 funções serem todos os dias em PDF".
//
// A ordem das seções é a ordem do estrago: conta parada perde o dia inteiro de verba, anúncio
// queimando perde por dia, criativo cansado perde aos poucos. Quem ler os três primeiros itens e
// parar por aí já resolveu o que mais custa.

import type { Diagnostico, ItemDiagnostico } from "@/lib/traffic/diagnostico";

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
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const corPrioridade = (p: number) => (p >= 80 ? CRITICO : p >= 60 ? ALERTA : SUAVE);

export function diagnosticoPdfHtml(d: Diagnostico, logo: string): string {
  const dia = new Date(`${d.data}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long",
  });

  const totalItens = d.funcoes.reduce((s, f) => s + f.itens.length, 0);
  const criticos = d.funcoes.flatMap((f) => f.itens).filter((i) => i.prioridade >= 80).length;
  // Quanto de verba está passando pelos problemas apontados. É o número que justifica parar e olhar.
  const emJogo = d.funcoes
    .filter((f) => f.nome === "Desperdício" || f.nome === "Contas sem entrega")
    .flatMap((f) => f.itens).reduce((s, i) => s + (i.emJogoDia ?? 0), 0);

  const item = (i: ItemDiagnostico) => `
    <div style="padding:11px 15px;background:${CARTAO};border:1px solid ${LINHA};
                border-left:3px solid ${corPrioridade(i.prioridade)};border-radius:0 8px 8px 0;margin-bottom:7px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
        <span style="font-size:13px;font-weight:700;color:${TEXTO}">${esc(i.cliente)}</span>
        ${i.emJogoDia ? `<span style="font-size:10.5px;color:${SUAVE};white-space:nowrap">${esc(brl(i.emJogoDia))}/dia em jogo</span>` : ""}
      </div>
      <div style="font-size:12.5px;color:${TEXTO};margin-top:3px;line-height:1.5">${esc(i.achado)}</div>
      ${i.acao ? `<div style="font-size:11.5px;color:${SUAVE};margin-top:4px">→ ${esc(i.acao)}</div>` : ""}
    </div>`;

  const secao = (f: Diagnostico["funcoes"][0]) => {
    if (!f.itens.length) {
      // Seção vazia é boa notícia e merece uma linha — some-la faria parecer que não foi verificada.
      return `<div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:700;color:${OK}">✓ ${esc(f.nome)}</div>
        <div style="font-size:11px;color:${SUAVE}">${esc(f.pergunta)} — nada encontrado.</div>
      </div>`;
    }
    const mostrar = f.itens.slice(0, 6);
    const resto = f.itens.length - mostrar.length;
    return `<div style="margin-bottom:20px">
      <h2 style="font-size:14px;margin-bottom:2px;color:${corPrioridade(mostrar[0].prioridade)}">
        ${esc(f.nome)} <span style="color:${SUAVE};font-weight:400">· ${f.itens.length}</span>
      </h2>
      <p style="font-size:11px;color:${SUAVE};margin-bottom:8px">${esc(f.pergunta)}</p>
      ${mostrar.map(item).join("")}
      ${resto > 0 ? `<div style="font-size:11px;color:${SUAVE};padding-left:4px">e mais ${resto} — o painel tem a lista completa.</div>` : ""}
    </div>`;
  };

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
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Diagnóstico de tráfego<br>${esc(dia)}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">O que precisa da sua atenção</h1>
    <p style="color:${SUAVE};font-size:12.5px;margin-bottom:18px">
      ${d.contasAtivas} contas · ${esc(brl(d.gastoOntem))} investidos ontem · ${totalItens} pontos encontrados
    </p>

    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:22px">
      ${[[criticos, "Precisam de ação hoje", criticos > 0 ? CRITICO : OK],
         [totalItens - criticos, "Para olhar quando der", SUAVE],
         [emJogo > 0 ? brl(emJogo) : "—", "Por dia nos itens críticos", emJogo > 0 ? ALERTA : SUAVE]]
        .map(([n, rot, cor]) => `
        <div style="flex:1;min-width:130px;background:${CARTAO};border:1px solid ${LINHA};border-radius:8px;padding:13px 15px">
          <div style="font-size:21px;font-weight:800;color:${cor};letter-spacing:-.02em">${n}</div>
          <div style="font-size:10.5px;color:${SUAVE};margin-top:2px">${rot}</div>
        </div>`).join("")}
    </div>

    ${d.funcoes.map(secao).join("")}

    <div style="margin-top:26px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;line-height:1.6">
      Lone Mídia · gerado automaticamente a partir dos dados da Meta de ontem.<br>
      O sistema LÊ a Meta e recomenda; quem executa é o gestor. Pausar e mexer em verba pelo sistema
      depende da camada de política por cliente, que ainda não existe.
    </div>
  </body></html>`;
}

/** A mensagem que acompanha o PDF: a manchete, não a lista. */
export function legendaDiagnostico(d: Diagnostico): string {
  const itens = d.funcoes.flatMap((f) => f.itens);
  const criticos = itens.filter((i) => i.prioridade >= 80);
  if (!itens.length) return `📊 *Diagnóstico de tráfego* — ${d.contasAtivas} contas, nada fora do lugar hoje.`;

  const topo = criticos.slice(0, 3).map((i) => `• ${i.cliente}`).join("\n");
  return [
    `📊 *Diagnóstico de tráfego* — ${itens.length} pontos, ${criticos.length} pedindo ação hoje.`,
    topo ? `\n${topo}` : "",
    "\nO PDF tem o que fazer em cada um.",
  ].filter(Boolean).join("");
}
