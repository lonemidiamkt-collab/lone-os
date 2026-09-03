// A ATA DA REUNIÃO EM PDF.
//
// PRA QUE (Roberto, 04/09): "você cria um PDF e armazena ele dentro do sistema também".
//
// O PDF existe para o uso que o banco não atende: ler fora do sistema, mandar para alguém, anexar
// numa conversa. Por isso ele traz a análise E a transcrição inteira — quem abre o arquivo não tem
// como voltar ao banco para ver o que ficou de fora.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";
const CRITICO = "#f2616b";
const OK = "#4ade80";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface AtaReuniao {
  cliente: string;
  quando: string;              // ISO
  responsavel: string | null;
  resumo: string;
  decisoes: string[];
  proximasAcoes: { acao: string; responsavel: string | null; prazo: string | null }[];
  pendenciasCliente: { item: string; impacto: string | null }[];
  pontosAtencao: string[];
  sugestoesBriefing: { regra: string; motivo: string }[];
  clima: "positivo" | "neutro" | "preocupado" | "insatisfeito";
  transcricao: string;
}

const COR_CLIMA: Record<AtaReuniao["clima"], string> = {
  positivo: OK, neutro: SUAVE, preocupado: ALERTA, insatisfeito: CRITICO,
};

const ROTULO_CLIMA: Record<AtaReuniao["clima"], string> = {
  positivo: "Cliente positivo", neutro: "Clima neutro",
  preocupado: "Cliente preocupado", insatisfeito: "Cliente insatisfeito",
};

function bloco(titulo: string, itens: string[], cor = TEXTO): string {
  if (!itens.length) return "";
  return `<div style="margin-bottom:20px">
    <h2 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${SUAVE};margin-bottom:8px">${esc(titulo)}</h2>
    <div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:10px;padding:12px 16px">
      ${itens.map((i) => `<p style="font-size:12.5px;color:${cor};margin:0 0 7px;line-height:1.55">• ${i}</p>`).join("")}
    </div>
  </div>`;
}

export function reuniaoPdfHtml(a: AtaReuniao, logo: string): string {
  const d = new Date(a.quando);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  const acoes = a.proximasAcoes.map((x) =>
    `${esc(x.acao)}${x.responsavel ? ` <span style="color:${SUAVE}">— ${esc(x.responsavel)}</span>` : ""}${x.prazo ? ` <span style="color:${ALERTA}">(${esc(x.prazo)})</span>` : ""}`);
  const pend = a.pendenciasCliente.map((x) =>
    `${esc(x.item)}${x.impacto ? `<br><span style="color:${SUAVE};font-size:11.5px">↳ ${esc(x.impacto)}</span>` : ""}`);
  const sug = a.sugestoesBriefing.map((x) =>
    `${esc(x.regra)}<br><span style="color:${SUAVE};font-size:11.5px">↳ ${esc(x.motivo)}</span>`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    @page { margin: 0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { background:${FUNDO}; }
    body { font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:${TEXTO};
           padding:44px 52px; font-size:14px; }
    .head { display:flex; align-items:center; justify-content:space-between;
            border-bottom:2px solid ${BRAND}; padding-bottom:16px; margin-bottom:22px; }
    .head img { height:34px; }
    /* A transcrição pode ter muitas páginas — quebrar dentro de uma frase é aceitável, dentro de
       um bloco de análise não. */
    .transc { white-space:pre-wrap; word-break:break-word; }
  </style></head><body>
    <div class="head">
      ${logo ? `<img src="${logo}" alt="Lone Mídia">` : `<div style="font-weight:800;font-size:19px">Lone Mídia</div>`}
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Ata de reunião<br>${esc(dia)} · ${esc(hora)}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">${esc(a.cliente)}</h1>
    <p style="color:${SUAVE};font-size:12.5px;margin-bottom:6px">
      ${a.responsavel ? `Conduzida por ${esc(a.responsavel)} · ` : ""}<span style="color:${COR_CLIMA[a.clima]}">${ROTULO_CLIMA[a.clima]}</span>
    </p>
    <p style="font-size:13.5px;color:${TEXTO};margin-bottom:24px;line-height:1.6">${esc(a.resumo)}</p>

    ${bloco("Decisões", a.decisoes.map(esc))}
    ${bloco("O que a Lone vai fazer", acoes)}
    ${bloco("O que o cliente ficou de fazer", pend)}
    ${bloco("Pontos de atenção", a.pontosAtencao.map(esc), ALERTA)}
    ${bloco("Sugestões pro briefing", sug)}

    <div style="margin-top:28px;border-top:1px solid ${LINHA};padding-top:16px">
      <h2 style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${SUAVE};margin-bottom:10px">
        Transcrição completa
      </h2>
      <div class="transc" style="font-size:11.5px;color:${SUAVE};line-height:1.65">${esc(a.transcricao)}</div>
    </div>

    <div style="margin-top:26px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;text-align:center">
      Lone Mídia · documento interno · a transcrição também fica na aba do cliente no Lone OS
    </div>
  </body></html>`;
}
