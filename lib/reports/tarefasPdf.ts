// As tarefas do dia em PDF, separadas por pessoa.
//
// PRA QUE (Roberto, 02/09, olhando a cobrança no grupo): "precisamos arrumar essas mensagens, seria
// melhor em PDF? separar por funcionário e marcar eles".
//
// A mensagem tinha 40+ linhas e três defeitos: listava "Rodrigo" e "designer" como pessoas
// diferentes (é a mesma), escrevia o nome sem marcar ninguém de verdade, e despejava tudo de todo
// mundo num bloco só — cada um tinha que caçar a própria parte no meio da lista dos outros.
//
// Agora: PDF com tudo separado por pessoa, e no grupo vai só a manchete de cada um, com menção que
// notifica. Quem quer o detalhe abre o documento.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";
const CRITICO = "#f2616b";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface TarefaPdf {
  titulo: string;
  cliente?: string | null;
  vencimento: string;      // YYYY-MM-DD
  diasAtraso: number;      // negativo = ainda vai vencer
}

export interface BlocoPessoa {
  pessoa: string;          // "sem dono" quando não deu pra resolver
  tarefas: TarefaPdf[];
}

export function tarefasPdfHtml(blocos: BlocoPessoa[], logo: string, hoje: string): string {
  const dia = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long",
  });
  const total = blocos.reduce((s, b) => s + b.tarefas.length, 0);
  const atrasadas = blocos.flatMap((b) => b.tarefas).filter((t) => t.diasAtraso > 0).length;

  const linha = (t: TarefaPdf) => {
    const cor = t.diasAtraso > 30 ? CRITICO : t.diasAtraso > 0 ? ALERTA : SUAVE;
    const quando = t.diasAtraso > 0
      ? `venceu há ${t.diasAtraso} dia${t.diasAtraso === 1 ? "" : "s"}`
      : t.diasAtraso === 0 ? "vence hoje" : "vence amanhã";
    return `<tr>
      <td style="padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${TEXTO}">
        ${esc(t.titulo)}${t.cliente ? `<span style="color:${SUAVE}"> · ${esc(t.cliente)}</span>` : ""}
      </td>
      <td style="padding:7px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap;
                 font-size:11.5px;color:${cor};font-weight:600">${esc(quando)}</td>
    </tr>`;
  };

  const bloco = (b: BlocoPessoa) => {
    const velhas = b.tarefas.filter((t) => t.diasAtraso > 30).length;
    return `<div style="margin-bottom:22px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px">
        <h2 style="font-size:16px;letter-spacing:-.01em">${esc(b.pessoa)}</h2>
        <span style="font-size:11px;color:${SUAVE}">
          ${b.tarefas.length} tarefa${b.tarefas.length > 1 ? "s" : ""}${velhas ? ` · ${velhas} parada${velhas > 1 ? "s" : ""} há mais de um mês` : ""}
        </span>
      </div>
      <div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:10px;padding:4px 16px">
        <table style="width:100%;border-collapse:collapse">${b.tarefas.map(linha).join("")}</table>
      </div>
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
    table tr:last-child td { border-bottom:none !important; }
  </style></head><body>
    <div class="head">
      ${logo ? `<img src="${logo}" alt="Lone Mídia">` : `<div style="font-weight:800;font-size:19px">Lone Mídia</div>`}
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Tarefas em aberto<br>${esc(dia)}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">O que falta fechar</h1>
    <p style="color:${SUAVE};font-size:12.5px;margin-bottom:22px">
      ${total} tarefa${total > 1 ? "s" : ""} · ${atrasadas} com prazo vencido
    </p>

    ${blocos.map(bloco).join("")}

    <div style="margin-top:26px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;text-align:center">
      Lone Mídia · marque como feita em Tarefas que a cobrança para · ou avise no grupo que eu marco
    </div>
  </body></html>`;
}

/** A manchete de cada um no grupo. O detalhe está no PDF; aqui vai o que decide o dia. */
export function legendaTarefas(blocos: BlocoPessoa[], mencoes: Map<string, string>): string {
  const linhas = blocos.map((b) => {
    const marca = mencoes.get(b.pessoa) || b.pessoa;
    const atrasadas = b.tarefas.filter((t) => t.diasAtraso > 0);
    const maisVelha = atrasadas.sort((a, b2) => b2.diasAtraso - a.diasAtraso)[0];
    if (!atrasadas.length) return `${marca} — ${b.tarefas.length} pra hoje/amanhã.`;
    return `${marca} — ${atrasadas.length} atrasada${atrasadas.length > 1 ? "s" : ""}` +
      (maisVelha ? `, a mais antiga há ${maisVelha.diasAtraso} dias.` : ".");
  });
  return ["⏰ *Tarefas em aberto*", "", ...linhas, "", "O PDF tem a lista de cada um."].join("\n");
}
