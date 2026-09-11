// A VÉSPERA EM PDF.
//
// PRA QUE (Roberto, 11/09): "ainda seguimos com muitas informações de aviso que são vários sendo
// enviados por mensagem sendo que poderia estar sendo enviado por pdf que seria muito mais
// organizado."
//
// A véspera de sexta saiu com 11 clientes sem pauta, 1 sem arte e o placar — texto tão longo que o
// WhatsApp cortou com "Ler mais". Quem estava no fim da lista simplesmente não foi lido, e o fim
// da lista é onde ficam os casos mais antigos.
//
// A decisão de mandar em PDF ou em texto NÃO é deste arquivo: é de lib/cs/formato-aviso.ts, que
// olha o volume. Véspera com três clientes continua indo como texto, que é onde texto ganha.
//
// Mesma identidade visual do bom-dia, do PDF de tarefas e do de saúde.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ItemVespera {
  nome: string;
  /** Quem responde por esse cliente. */
  social: string;
}

export interface DadosVespera {
  /** "sexta 11/09" */
  diaLabel: string;
  semCard: ItemVespera[];
  semArte: ItemVespera[];
  /** Clientes com vídeo na quarta. */
  video: string[];
  prontos: number;
  esperados: number;
}

function secao(titulo: string, icone: string, itens: ItemVespera[], cor: string): string {
  if (!itens.length) return "";
  const linhas = itens.map((i) => `
    <tr>
      <td class="cli">${esc(i.nome)}</td>
      <td class="dono">${esc(i.social)}</td>
    </tr>`).join("");
  return `
  <section>
    <h2 style="color:${cor}">${icone} ${esc(titulo)} <span class="qtd">${itens.length}</span></h2>
    <table><tbody>${linhas}</tbody></table>
  </section>`;
}

/** O HTML do PDF da véspera. Uma página, sem rolagem lateral. */
export function vesperaPdfHtml(d: DadosVespera, logo: string, hoje: string): string {
  const pct = d.esperados > 0 ? Math.round((d.prontos / d.esperados) * 100) : 0;
  const videoHtml = d.video.length
    ? `
  <section>
    <h2 style="color:${SUAVE}">🎬 Amanhã é quarta — o roteiro já está pronto? <span class="qtd">${d.video.length}</span></h2>
    <table><tbody>${d.video.map((n) => `<tr><td class="cli" colspan="2">${esc(n)}</td></tr>`).join("")}</tbody></table>
  </section>`
    : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { margin:0; background:${FUNDO}; color:${TEXTO};
         font-family: Inter, -apple-system, "Segoe UI", Arial, sans-serif; font-size:11.5px; }
  .topo { display:flex; align-items:center; justify-content:space-between;
          border-bottom:2px solid ${BRAND}; padding-bottom:10px; margin-bottom:16px; }
  .topo img { height:22px; }
  h1 { font-size:17px; margin:0; letter-spacing:-.01em; }
  .data { color:${SUAVE}; font-size:10px; }
  .intro { color:${SUAVE}; margin:0 0 16px; font-size:11px; }
  section { background:${CARTAO}; border:1px solid ${LINHA}; border-radius:8px;
            padding:12px 14px; margin-bottom:12px; break-inside: avoid; }
  h2 { font-size:11.5px; margin:0 0 9px; display:flex; align-items:center; gap:7px; }
  .qtd { background:${LINHA}; color:${TEXTO}; border-radius:20px;
         padding:1px 8px; font-size:10px; font-weight:400; }
  table { width:100%; border-collapse:collapse; }
  td { padding:5px 0; border-bottom:1px solid ${LINHA}; vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  .cli { font-weight:500; }
  .dono { color:${SUAVE}; text-align:right; white-space:nowrap; font-size:10.5px; }
  .placar { display:flex; align-items:center; gap:12px; background:${CARTAO};
            border:1px solid ${LINHA}; border-radius:8px; padding:12px 14px; }
  .placar .n { font-size:22px; font-weight:600; color:${pct >= 70 ? "#63d3a3" : ALERTA}; }
  .placar .l { color:${SUAVE}; font-size:11px; }
  .barra { flex:1; height:5px; background:${LINHA}; border-radius:3px; overflow:hidden; }
  .barra i { display:block; height:100%; width:${pct}%; background:${pct >= 70 ? "#63d3a3" : ALERTA}; }
  .rodape { color:${SUAVE}; font-size:9.5px; margin-top:14px; text-align:center; }
</style></head><body>
  <div class="topo">
    <div>
      <h1>Véspera de ${esc(d.diaLabel)}</h1>
      <div class="data">Amanhã tem post — o que dá pra adiantar hoje</div>
    </div>
    ${logo ? `<img src="${logo}" alt="Lone Mídia">` : ""}
  </div>

  <p class="intro">Cada linha é um cliente que precisa de alguma coisa antes de amanhã cedo.</p>

  ${secao("Sem pauta/card pra amanhã", "⚠️", d.semCard, ALERTA)}
  ${secao("Card criado, mas arte ainda não entregue", "🎨", d.semArte, ALERTA)}
  ${videoHtml}

  <div class="placar">
    <div>
      <div class="n">${d.prontos}/${d.esperados}</div>
      <div class="l">já prontos</div>
    </div>
    <div class="barra"><i></i></div>
  </div>

  <div class="rodape">Gerado pelo Lone OS em ${esc(hoje)}</div>
</body></html>`;
}

/** A legenda curta que acompanha o PDF no grupo. O número tem que aparecer sem abrir o arquivo. */
export function legendaVespera(d: DadosVespera): string {
  const pend = d.semCard.length + d.semArte.length;
  return `🗓️ *Véspera de ${d.diaLabel}* — ${pend} ${pend === 1 ? "cliente precisa" : "clientes precisam"} de atenção hoje.`
    + `\nJá prontos: *${d.prontos}/${d.esperados}*. A lista está no PDF.`;
}
