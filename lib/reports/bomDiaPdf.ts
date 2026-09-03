// O BOM-DIA EM PDF, um por pessoa.
//
// PRA QUE (Roberto, 03/09): "continua mandando textões, já falei sobre a estrutura de pdfs".
//
// O bom-dia tinha 2.314 caracteres em 45 linhas e misturava duas coisas: o PANORAMA da operação
// (28 esperando ok, 39 artes prontas, 42 sem post planejado) e a LISTA de cada pessoa. O panorama
// serve ao gestor e cabe em quatro linhas; a lista é trabalho, e trabalho de outra pessoa é o que
// faz o time parar de ler.
//
// Agora: manchete curta no grupo com os números e a menção de cada um, e um PDF por pessoa com o
// que é dela. Mesma decisão do PDF de tarefas, do de saúde e do de postagem.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";
const CRITICO = "#f2616b";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ItemDia {
  cliente: string;
  /** Já em verbo: "postar", "mandar pro cliente", "dar um oi". */
  acao: string;
  dias: number;
}

export interface BlocoDia {
  pessoa: string;
  itens: ItemDia[];
  /** Quantos ficaram fora do corte da lista. */
  resto?: number;
}

/** Acima disto, o item vira vermelho. Se tudo é urgente, nada é. */
const DIAS_CRITICO = 7;

export function bomDiaPessoaPdfHtml(bloco: BlocoDia, logo: string, hoje: string): string {
  const dia = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long",
  });
  const criticos = bloco.itens.filter((i) => i.dias >= DIAS_CRITICO).length;

  const linha = (i: ItemDia) => {
    const cor = i.dias >= 30 ? CRITICO : i.dias >= DIAS_CRITICO ? ALERTA : SUAVE;
    const quando = i.dias === 0 ? "hoje" : `há ${i.dias} dia${i.dias === 1 ? "" : "s"}`;
    return `<tr>
      <td style="padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${TEXTO}">
        ${esc(i.cliente)}<span style="color:${SUAVE}"> · ${esc(i.acao)}</span>
      </td>
      <td style="padding:7px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap;
                 font-size:11.5px;color:${cor};font-weight:600">${esc(quando)}</td>
    </tr>`;
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
    table tr:last-child td { border-bottom:none !important; }
  </style></head><body>
    <div class="head">
      ${logo ? `<img src="${logo}" alt="Lone Mídia">` : `<div style="font-weight:800;font-size:19px">Lone Mídia</div>`}
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Seu dia<br>${esc(dia)}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">${esc(bloco.pessoa)}, seu dia</h1>
    <p style="color:${SUAVE};font-size:12.5px;margin-bottom:22px">
      ${bloco.itens.length} ${bloco.itens.length === 1 ? "item" : "itens"}${criticos ? ` · ${criticos} passando de uma semana` : ""}
    </p>

    <div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:10px;padding:4px 16px">
      <table style="width:100%;border-collapse:collapse">
        ${[...bloco.itens].sort((a, b) => b.dias - a.dias).map(linha).join("")}
      </table>
    </div>
    ${bloco.resto ? `<p style="color:${SUAVE};font-size:11px;margin-top:10px">…e mais ${bloco.resto} de menor urgência.</p>` : ""}

    <div style="margin-top:26px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;text-align:center">
      Lone Mídia · mova o card no board que eu paro de cobrar · ou me avise no grupo
    </div>
  </body></html>`;
}

/** A legenda curta que acompanha o PDF no grupo. */
export function legendaBomDia(bloco: BlocoDia, mencao: string): string {
  const quem = mencao || bloco.pessoa;
  const pior = [...bloco.itens].sort((a, b) => b.dias - a.dias)[0];
  const n = bloco.itens.length + (bloco.resto ?? 0);
  if (!pior) return `☀️ ${quem} — nada pendente hoje. Bom dia!`;
  return `☀️ ${quem} — *${n} ${n === 1 ? "item" : "itens"}* hoje`
    + (pior.dias >= DIAS_CRITICO ? `; o mais antigo é *${pior.cliente}*, há ${pior.dias} dias.` : ".");
}

/**
 * A manchete do grupo: o PANORAMA, sem a lista de ninguém.
 *
 * Quatro linhas no máximo. O que o gestor precisa saber de manhã é o tamanho de cada fila — quem
 * resolve o quê está no PDF de cada um.
 */
export function manchetePanorama(p: {
  data: string;
  esperandoOk: number;
  emProducao: number;
  artesProntas: number;
  semPostPlanejado: number;
  esfriando: number;
  encalhados: number;
}): string {
  const l = [`☀️ *Bom dia, time!* (${p.data})`, ""];
  const filas: string[] = [];
  if (p.esperandoOk) filas.push(`📋 ${p.esperandoOk} esperando ok/não`);
  if (p.artesProntas) filas.push(`✅ ${p.artesProntas} arte(s) pronta(s) só pra postar`);
  if (p.emProducao) filas.push(`🎨 ${p.emProducao} em produção`);
  if (p.semPostPlanejado) filas.push(`📭 ${p.semPostPlanejado} sem post planejado`);
  if (p.esfriando) filas.push(`👀 ${p.esfriando} esfriando`);
  if (p.encalhados) filas.push(`🧹 ${p.encalhados} encalhados (+30d)`);
  l.push(filas.length ? filas.join(" · ") : "Nada em fila — dia limpo! 🚀");
  l.push("", "_Mandei o de cada um em PDF abaixo._");
  return l.join("\n");
}
