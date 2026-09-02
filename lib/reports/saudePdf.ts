// A saúde da carteira em PDF, separada por pessoa.
//
// PRA QUE (Roberto, 02/09, olhando o digest de saúde no grupo): "essa mensagem quero separado em
// pdf por pessoa que é responsável".
//
// A mensagem tinha 17 clientes em risco num bloco sem dono nenhum, seguidos de outra lista com
// dono — dois formatos diferentes para o mesmo problema, e ninguém sabendo o que era seu. Um
// cliente há 56 dias sem postar tinha o mesmo peso visual de um há 22.
//
// Agora: um arquivo por responsável, com a carteira DELE, do pior para o melhor. No grupo vai só
// a manchete com a menção que notifica. Mesma decisão do PDF de tarefas — ver tarefasPdf.ts.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";
const CRITICO = "#f2616b";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ClienteSaude {
  cliente: string;
  /**
   * Dias sem postar MEDIDOS NO INSTAGRAM do cliente.
   *   número → tantos dias parado;
   *   null   → não postou nenhuma vez (o Instagram foi lido e não havia post);
   *   undefined → NÃO MEDIDO. Este cliente entrou por outro sinal (reclamação, pausa de pauta) e
   *     nada deve ser dito sobre a postagem dele.
   *
   * A distinção entre `null` e `undefined` não é preciosismo — é o que impede uma acusação falsa.
   * O digest antigo calculava "dias sem post" a partir de `content_cards.status = published`, o
   * mesmo campo que em agosto registrou 24 publicações contra 451 posts reais no Instagram. Com
   * ele, o Império dos Pisos saía como "sem post registrado" no PDF do Thiago — quando o que
   * estava vazio era o board, não o perfil do cliente.
   */
  diasSemPostar?: number | null;
  /** O que pesa além do silêncio: reclamação, pausa de pauta. Vazio quando não há. */
  motivos: string[];
  /** true quando o problema é de CADASTRO (sem Instagram vinculado), não de trabalho. */
  semInstagram?: boolean;
  /** A conta TEM publicações que não conseguimos listar (falta acesso à Página na Meta).
   *  Quando presente, traz quantos posts a conta tem — a prova de que o cliente está postando. */
  ilegivel?: { postsNaConta: number } | null;
  /** O mesmo Instagram está cadastrado em outro(s) cliente(s): os posts caem num só e este parece
   *  parado. Traz os nomes dos outros, que é o que a pessoa precisa para resolver. */
  contaDividida?: string[] | null;
}

export interface BlocoSaude {
  pessoa: string;              // "sem dono" quando não deu pra resolver
  clientes: ClienteSaude[];
}

/** Ordem de gravidade: nunca postou primeiro, depois mais dias parados, e por fim o que não foi
 *  medido (entrou por reclamação) e o que é pendência de cadastro. */
export function ordenar(cs: ClienteSaude[]): ClienteSaude[] {
  const peso = (c: ClienteSaude) => {
    if (c.semInstagram || c.ilegivel || c.contaDividida?.length) return -2; // pendência técnica: por último
    if (c.diasSemPostar === undefined) return -1; // não medido: antes do cadastro, depois dos dias
    if (c.diasSemPostar === null) return Infinity; // Instagram lido e vazio: o pior caso
    return c.diasSemPostar;
  };
  return [...cs].sort((a, b) => peso(b) - peso(a));
}

export function saudePessoaPdfHtml(bloco: BlocoSaude, logo: string, hoje: string): string {
  return saudePdfHtml([bloco], logo, hoje, bloco.pessoa);
}

export function saudePdfHtml(blocos: BlocoSaude[], logo: string, hoje: string, dono?: string): string {
  const dia = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long",
  });
  const todos = blocos.flatMap((b) => b.clientes);
  const graves = todos.filter((c) => !c.semInstagram && !c.ilegivel && !c.contaDividida?.length && c.diasSemPostar !== undefined
    && (c.diasSemPostar === null || c.diasSemPostar >= 30)).length;

  const linha = (c: ClienteSaude) => {
    // Mesmo Instagram em dois cadastros. Nomear o outro cliente é o que torna isso resolvível:
    // sem o nome, "conta duplicada" manda a pessoa procurar agulha no palheiro.
    if (c.contaDividida?.length) {
      return `<tr>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${SUAVE}">
          ${esc(c.cliente)}<span style="color:${SUAVE}"> · mesmo Instagram de ${esc(c.contaDividida.join(", "))}</span>
        </td>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap;
                   font-size:11.5px;color:${SUAVE}">cadastro duplicado</td>
      </tr>`;
    }
    // A conta posta e a gente não enxerga. Dizer o NÚMERO de posts é o que impede que isso seja
    // lido como cobrança: fica claro que o cliente trabalhou e o acesso é que falta.
    if (c.ilegivel) {
      return `<tr>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${SUAVE}">
          ${esc(c.cliente)}<span style="color:${SUAVE}"> · ${c.ilegivel.postsNaConta} posts na conta</span>
        </td>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap;
                   font-size:11.5px;color:${SUAVE}">sem acesso pra ler as publicações</td>
      </tr>`;
    }
    // Cadastro incompleto não é falha de quem posta: cor neutra e texto que diz o que fazer.
    if (c.semInstagram) {
      return `<tr>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${SUAVE}">
          ${esc(c.cliente)}
        </td>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap;
                   font-size:11.5px;color:${SUAVE}">falta vincular o Instagram</td>
      </tr>`;
    }
    const d = c.diasSemPostar;
    // Não medido: a direita mostra o MOTIVO pelo qual ele está aqui, nunca um número de dias que
    // não foi apurado. Dizer "sem post registrado" para quem só reclamou é inventar um segundo
    // problema — e uma cobrança falsa custa a confiança em todas as outras.
    if (d === undefined) {
      return `<tr>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${TEXTO}">
          ${esc(c.cliente)}
        </td>
        <td style="padding:7px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap;
                   font-size:11.5px;color:${ALERTA};font-weight:600">${esc(c.motivos[0] || "pede atenção")}</td>
      </tr>`;
    }
    const cor = d === null || d >= 30 ? CRITICO : d >= 14 ? ALERTA : SUAVE;
    const quando = d === null ? "sem post registrado" : `${d} dia${d === 1 ? "" : "s"} sem postar`;
    return `<tr>
      <td style="padding:7px 0;border-bottom:1px solid ${LINHA};font-size:12.5px;color:${TEXTO}">
        ${esc(c.cliente)}${c.motivos.length ? `<span style="color:${SUAVE}"> · ${esc(c.motivos.join(" · "))}</span>` : ""}
      </td>
      <td style="padding:7px 0;border-bottom:1px solid ${LINHA};text-align:right;white-space:nowrap;
                 font-size:11.5px;color:${cor};font-weight:600">${esc(quando)}</td>
    </tr>`;
  };

  const bloco = (b: BlocoSaude) => {
    const cabecalho = dono ? "" : `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px">
        <h2 style="font-size:16px;letter-spacing:-.01em">${esc(b.pessoa)}</h2>
        <span style="font-size:11px;color:${SUAVE}">${b.clientes.length} cliente${b.clientes.length > 1 ? "s" : ""}</span>
      </div>`;
    return `<div style="margin-bottom:22px">
      ${cabecalho}
      <div style="background:${CARTAO};border:1px solid ${LINHA};border-radius:10px;padding:4px 16px">
        <table style="width:100%;border-collapse:collapse">${ordenar(b.clientes).map(linha).join("")}</table>
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
      <div style="text-align:right;color:${SUAVE};font-size:11px;line-height:1.6">Saúde da carteira<br>${esc(dia)}</div>
    </div>

    <h1 style="font-size:24px;letter-spacing:-.02em;margin-bottom:5px">
      ${dono ? `${esc(dono)}, seus clientes pedindo atenção` : "Clientes pedindo atenção"}
    </h1>
    <p style="color:${SUAVE};font-size:12.5px;margin-bottom:22px">
      ${todos.length} cliente${todos.length > 1 ? "s" : ""}${graves ? ` · ${graves} há mais de um mês sem post` : ""}
    </p>

    ${blocos.map(bloco).join("")}

    <div style="margin-top:26px;border-top:1px solid ${LINHA};padding-top:12px;color:${SUAVE};font-size:10px;text-align:center">
      Lone Mídia · leio direto do Instagram do cliente · se já postou e não aparece aqui, me avisa no grupo
    </div>
  </body></html>`;
}

/** A legenda que acompanha o PDF de UMA pessoa. Curta: o documento tem o resto. */
export function legendaSaude(bloco: BlocoSaude, mencao: string): string {
  const reais = bloco.clientes.filter((c) => !c.semInstagram && !c.ilegivel && !c.contaDividida?.length);
  const pior = ordenar(reais)[0];
  const quem = mencao || bloco.pessoa;
  if (!reais.length) {
    // Só pendência de cadastro: não é cobrança de postagem, e chamar assim seria injusto.
    const semAcesso = bloco.clientes.filter((c) => c.ilegivel).length;
    return semAcesso
      ? `📋 ${quem} — ${semAcesso} cliente${semAcesso > 1 ? "s" : ""} postando, mas sem acesso pra eu ler. É liberação na Meta, não é cobrança.`
      : `📋 ${quem} — ${bloco.clientes.length} cliente${bloco.clientes.length > 1 ? "s" : ""} esperando o Instagram ser vinculado.`;
  }
  const detalhe = pior.diasSemPostar === undefined
    ? `*${pior.cliente}* ${pior.motivos[0] || "pede atenção"}`
    : pior.diasSemPostar === null
      ? `*${pior.cliente}* segue sem nenhum post registrado`
      : `o mais parado é *${pior.cliente}*, há ${pior.diasSemPostar} dias`;
  return `🩺 ${quem} — *${reais.length} cliente${reais.length > 1 ? "s" : ""}* pedindo atenção; ${detalhe}.`;
}
