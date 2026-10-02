// O STATUS DOS CLIENTES PELO RESULTADO, EM PDF.
//
// Roberto (02/10/2026), sobre a mensagem de sexta do tráfego: "algumas coisas não precisam ser
// textos e sim um pdf organizado daquele setor, por exemplo essa mensagem poderia ser em pdf". Ela
// saía como um texto de 1.771 caracteres no grupo de tráfego — e misturava "CPL acima do crítico"
// com "conta sem nenhum gasto" debaixo do mesmo "Resultados ruins". Sem gasto não é resultado ruim:
// é anúncio parado, e o motivo (conta desativada, pagamento pendente, sem saldo) é outra conversa.
//
// O PDF mostra o PANORAMA (todos os clientes de anúncio, por faixa) com as mudanças da semana
// destacadas. No grupo vai só a legenda com os números e a marcação do gestor.
//
// Mesma identidade visual do bom-dia, da véspera e do PDF de tarefas.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type FaixaStatus = "at_risk" | "average" | "good" | "parado";

export interface LinhaStatusCliente {
  cliente: string;
  faixa: FaixaStatus;
  motivo: string;
  /** Rótulo da faixa anterior, quando mudou nesta rodada. */
  antes?: string | null;
}

export interface DadosStatusClientes {
  /** "02/10/2026" */
  data: string;
  linhas: LinhaStatusCliente[];
  /** "Cliente (Bons resultados)" — arraste manual recente, mantido. */
  manuais: string[];
  /** "Cliente (motivo)" — não deu pra julgar. */
  semBase: string[];
}

const FAIXAS: { chave: FaixaStatus; titulo: string; icone: string; cor: string }[] = [
  { chave: "at_risk", titulo: "Resultados ruins", icone: "🔴", cor: "#f2616b" },
  { chave: "parado", titulo: "Sem anúncio rodando (7 dias sem gasto)", icone: "⏸️", cor: "#f0b357" },
  { chave: "average", titulo: "Resultados médios", icone: "🟠", cor: "#f0b357" },
  { chave: "good", titulo: "Bons resultados", icone: "🟢", cor: "#63d3a3" },
];

export const contarPorFaixa = (d: DadosStatusClientes) =>
  Object.fromEntries(FAIXAS.map((f) => [f.chave, d.linhas.filter((l) => l.faixa === f.chave).length])) as Record<FaixaStatus, number>;

function secao(f: (typeof FAIXAS)[number], linhas: LinhaStatusCliente[]): string {
  if (!linhas.length) return "";
  // Quem mudou primeiro: é o que o gestor precisa ver antes.
  const ord = [...linhas].sort((a, b) => Number(!!b.antes) - Number(!!a.antes) || a.cliente.localeCompare(b.cliente, "pt-BR"));
  const tr = ord.map((l) => `
    <tr>
      <td class="cli">${esc(l.cliente)}${l.antes ? `<span class="mudou">antes: ${esc(l.antes)}</span>` : ""}</td>
      <td class="mot">${esc(l.motivo)}</td>
    </tr>`).join("");
  return `
  <section>
    <h2 style="color:${f.cor}">${f.icone} ${esc(f.titulo)} <span class="qtd">${linhas.length}</span></h2>
    <table><tbody>${tr}</tbody></table>
  </section>`;
}

export function statusClientesPdfHtml(d: DadosStatusClientes, logo: string): string {
  const n = contarPorFaixa(d);
  const mudaram = d.linhas.filter((l) => l.antes).length;
  const notas = [
    d.manuais.length ? `<p><b>Mantidos como o gestor deixou</b> (arraste recente, vale 7 dias): ${d.manuais.map(esc).join(", ")}.</p>` : "",
    d.semBase.length ? `<p><b>Sem base para julgar:</b> ${d.semBase.map(esc).join("; ")}.</p>` : "",
  ].join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { margin:0; background:${FUNDO}; color:${TEXTO};
         font-family: Inter, -apple-system, "Segoe UI", Arial, sans-serif; font-size:11.5px; }
  .topo { display:flex; align-items:center; justify-content:space-between;
          border-bottom:2px solid ${BRAND}; padding-bottom:10px; margin-bottom:14px; }
  .topo img { height:22px; }
  h1 { font-size:17px; margin:0; letter-spacing:-.01em; }
  .data { color:${SUAVE}; font-size:10px; }
  .placar { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:14px; }
  .placar div { background:${CARTAO}; border:1px solid ${LINHA}; border-radius:8px; padding:9px 11px; }
  .placar b { display:block; font-size:19px; font-variant-numeric: tabular-nums; }
  .placar span { color:${SUAVE}; font-size:10px; }
  .intro { color:${SUAVE}; margin:0 0 14px; font-size:10.5px; }
  section { background:${CARTAO}; border:1px solid ${LINHA}; border-radius:8px;
            padding:12px 14px; margin-bottom:12px; break-inside: avoid; }
  h2 { font-size:11.5px; margin:0 0 9px; display:flex; align-items:center; gap:7px; }
  .qtd { background:${LINHA}; color:${TEXTO}; border-radius:20px; padding:1px 8px; font-size:10px; font-weight:400; }
  table { width:100%; border-collapse:collapse; }
  td { padding:6px 0; border-bottom:1px solid ${LINHA}; vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  .cli { font-weight:500; width:38%; padding-right:10px; }
  .mudou { display:block; color:${BRAND}; font-weight:400; font-size:9.5px; margin-top:2px; filter:brightness(1.6); }
  .mot { color:${SUAVE}; font-size:10.5px; }
  .notas { color:${SUAVE}; font-size:10px; line-height:1.5; }
  .notas p { margin:0 0 6px; }
  .rodape { color:${SUAVE}; font-size:9.5px; margin-top:12px; text-align:center; }
</style></head><body>
  <div class="topo">
    <div>
      <h1>Status dos clientes pelo resultado do anúncio</h1>
      <div class="data">${esc(d.data)} · CPL dos últimos 7 dias × meta de cada cliente</div>
    </div>
    ${logo ? `<img src="${logo}" alt="Lone Mídia">` : ""}
  </div>

  <div class="placar">
    <div><b style="color:#f2616b">${n.at_risk}</b><span>ruins</span></div>
    <div><b style="color:#f0b357">${n.parado}</b><span>sem anúncio rodando</span></div>
    <div><b style="color:#f0b357">${n.average}</b><span>médios</span></div>
    <div><b style="color:#63d3a3">${n.good}</b><span>bons</span></div>
  </div>
  <p class="intro">${mudaram ? `${mudaram} ${mudaram === 1 ? "cliente mudou" : "clientes mudaram"} de faixa nesta rodada — aparecem primeiro em cada grupo, com a faixa anterior.` : "Ninguém mudou de faixa nesta rodada."} Discordou de algum? Arraste no Status Clientes — o arraste vale 7 dias antes da próxima reavaliação.</p>

  ${FAIXAS.map((f) => secao(f, d.linhas.filter((l) => l.faixa === f.chave))).join("")}
  ${notas ? `<section class="notas">${notas}</section>` : ""}

  <div class="rodape">Gerado pelo Lone OS</div>
</body></html>`;
}

/** A legenda do grupo: os números sem abrir o arquivo, e quem precisa olhar. */
export function legendaStatusClientes(d: DadosStatusClientes, gestorTrecho: string): string {
  const n = contarPorFaixa(d);
  const mudaram = d.linhas.filter((l) => l.antes).length;
  const placar = [
    n.at_risk ? `🔴 ${n.at_risk} ruins` : "",
    n.parado ? `⏸️ ${n.parado} sem anúncio rodando` : "",
    n.average ? `🟠 ${n.average} médios` : "",
    n.good ? `🟢 ${n.good} bons` : "",
  ].filter(Boolean).join(" · ");
  return `📊 *Status dos clientes pelo resultado* — ${d.data}${gestorTrecho ? ` · ${gestorTrecho}` : ""}\n`
    + `${placar || "nenhum cliente de anúncio avaliado"}\n`
    + `${mudaram ? `${mudaram} ${mudaram === 1 ? "mudou" : "mudaram"} de faixa.` : "Ninguém mudou de faixa."} O detalhe está no PDF.`;
}
