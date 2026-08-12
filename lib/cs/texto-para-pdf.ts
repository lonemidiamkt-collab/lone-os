// lib/cs/texto-para-pdf.ts — texto colado no WhatsApp vira PDF com a cara da Lone.
//
// PRA QUE (Roberto, 10/08): "loninho, transforma esse roteiro em pdf pra eu enviar ao cliente
// varejão". Ele escreve o roteiro (ou pega pronto), cola no grupo e quer o documento diagramado
// pra mandar. Hoje o PDF de roteiro só existia quando a IA GERAVA o roteiro — o caminho inverso,
// que é o mais usado, não existia.
//
// NÃO REESCREVE O TEXTO. Aqui é diagramação, não redação: o que a pessoa colou é o que sai. Se a
// IA "melhorasse" a fala no caminho, o roteiro que o cliente recebe não seria o que foi aprovado —
// e ninguém perceberia, porque o PDF sai bonito de qualquer jeito.
//
// O parser só reconhece a ESTRUTURA que já se usa no dia a dia: blocos numerados, "Duração:",
// e "Texto na tela:". O que não encaixa vira parágrafo normal, nunca some.

export interface Bloco {
  titulo: string;
  /** Rótulo próprio da peça ("Criativo 1", "Vídeo 2"). Quando existe, substitui o número de ordem. */
  rotulo?: string;
  duracao?: string;
  /** "Ângulo: loja próxima + variedade" — a estratégia daquela peça, acima das falas. */
  angulo?: string;
  /** Falas/parágrafos, na ordem em que foram escritos. */
  paragrafos: string[];
  /** Linhas do "Texto na tela" — vão num bloco à parte, como no roteiro de verdade. */
  textoNaTela: string[];
}

const RX_TITULO = /^\s*(\d{1,2})[.)]\s*(.+)$/;

// Como a casa escreve de verdade: "Criativo 1 — Araruama, Saquarema e São Pedro".
//
// Antes só "1." e "1)" abriam bloco novo, então dois criativos numa mensagem viravam UM bloco só —
// o PDF do Imperio dos Pisos (12/08) saiu com Criativo 1 e Criativo 2 emendados num muro de texto.
// Aceita o travessão, dois-pontos ou nada depois do número, com ou sem markdown (**Criativo 1**).
const RX_PECA = /^\s*\**\s*(criativos?|v[íi]deos?|reels?|roteiros?|op[çc][õo]es?|op[çc][ãa]o|vers[ãa]o|varia[çc][ãa]o|an[úu]ncios?|posts?|st(?:ories|ory))\s*(\d{1,2})\s*\**\s*[—–\-:.)]*\s*(.*)$/i;

const RX_DURACAO = /^\s*dura[çc][ãa]o\s*:\s*(.+)$/i;
const RX_ANGULO = /^\s*\**\s*[âa]ngulo\s*\**\s*:\s*(.+)$/i;
const RX_TELA = /^\s*texto\s+na\s+tela\s*:?\s*(.*)$/i;

/** Tira negrito/itálico do WhatsApp e do markdown, que no PDF apareceriam como asterisco cru. */
function semMarcacao(s: string): string {
  return s.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1").replace(/_{1,2}([^_]+)_{1,2}/g, "$1").trim();
}

/**
 * Quebra o texto colado em blocos.
 *
 * Sem nenhum bloco numerado, devolve UM bloco com o texto inteiro — melhor um PDF de página única
 * do que recusar porque a pessoa não numerou.
 */
export function lerBlocos(texto: string): Bloco[] {
  const linhas = (texto || "").split("\n");
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  let naTela = false;

  const novo = (titulo: string, rotulo?: string): Bloco => ({ titulo, rotulo, paragrafos: [], textoNaTela: [] });

  // Duração escrita ANTES do primeiro criativo ("Duração: 30–35s" no topo) vale pra todas as peças
  // — é como a equipe escreve: define o tempo uma vez e depois lista os criativos.
  let duracaoGeral: string | undefined;

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.replace(/\s+$/, "");
    const vazia = !linha.trim();

    // "Criativo 1 — Araruama…" abre peça nova e guarda o rótulo próprio.
    const mPeca = RX_PECA.exec(linha);
    if (mPeca) {
      if (atual) blocos.push(atual);
      const familia = semMarcacao(mPeca[1]);
      const rotulo = `${familia.charAt(0).toUpperCase()}${familia.slice(1).toLowerCase()} ${mPeca[2]}`;
      atual = novo(semMarcacao(mPeca[3] || "").replace(/^["“”]|["“”]$/g, ""), rotulo);
      naTela = false;
      continue;
    }

    const mTitulo = RX_TITULO.exec(linha);
    if (mTitulo && mTitulo[2].trim().length > 3) {
      if (atual) blocos.push(atual);
      atual = novo(semMarcacao(mTitulo[2]));
      naTela = false;
      continue;
    }
    if (!atual) atual = novo("");

    const mDur = RX_DURACAO.exec(linha);
    if (mDur) {
      atual.duracao = mDur[1].trim();
      // Sem título e sem falas ainda = cabeçalho do documento, não peça. Vale pra todas.
      if (!atual.titulo && !atual.rotulo && !atual.paragrafos.length) duracaoGeral = atual.duracao;
      naTela = false;
      continue;
    }

    const mAng = RX_ANGULO.exec(linha);
    if (mAng) { atual.angulo = semMarcacao(mAng[1]); naTela = false; continue; }

    const mTela = RX_TELA.exec(linha);
    if (mTela) {
      naTela = true;
      if (mTela[1].trim()) atual.textoNaTela.push(mTela[1].trim());
      continue;
    }

    if (vazia) {
      // Linha em branco fecha o "texto na tela" — depois dela vem prosa de novo.
      naTela = false;
      continue;
    }

    // Aspas curvas do WhatsApp viram retas: no PDF elas aparecem como caixinha em algumas fontes.
    const limpa = semMarcacao(linha.trim()).replace(/[""]/g, '"').replace(/['']/g, "'");
    if (naTela) atual.textoNaTela.push(limpa);
    else atual.paragrafos.push(limpa);
  }
  if (atual) blocos.push(atual);

  const cheios = blocos.filter((b) => b.titulo || b.rotulo || b.paragrafos.length || b.textoNaTela.length);

  // Espalha a duração do topo pras peças que não declararam a sua.
  if (duracaoGeral) for (const b of cheios) if (!b.duracao) b.duracao = duracaoGeral;

  return cheios;
}

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BRAND = "#2b3cff";
// Paleta escura da plataforma (app/globals.css, bloco html.dark) — o documento que sai pro cliente
// usa as MESMAS cores da tela que a equipe olha o dia inteiro. Cor inventada aqui viraria "quase" a
// marca, que é pior que outra marca.
const FUNDO = "#060814";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";

/** Monta o A4 com a marca da Lone. `tipo` vira o rótulo do cabeçalho ("Roteiro de Vídeo"). */
export function blocosPdfHtml(
  cliente: string,
  blocos: Bloco[],
  logoDataUri: string,
  dataLabel: string,
  tipo = "Roteiro de Vídeo",
): string {
  const secoes = blocos.map((b, i) => `
    <section class="bloco">
      <div class="cab">
        <span class="num">${esc(b.rotulo || String(i + 1).padStart(2, "0"))}</span>
        <h2>${esc(b.titulo || (b.rotulo ? "" : "Roteiro"))}</h2>
        ${b.duracao ? `<span class="dur">${esc(b.duracao)}</span>` : ""}
      </div>
      ${b.angulo ? `<div class="ang"><span>Ângulo</span> ${esc(b.angulo)}</div>` : ""}
      ${b.paragrafos.map((p) => `<p>${esc(p)}</p>`).join("")}
      ${b.textoNaTela.length ? `
        <div class="tela">
          <div class="tela-tit">Texto na tela</div>
          ${b.textoNaTela.map((t) => `<div class="tela-l">${esc(t)}</div>`).join("")}
        </div>` : ""}
    </section>`).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  /* FUNDO ESCURO EM TODA A PÁGINA. Só pintar o body deixaria faixa branca embaixo quando o
     conteúdo não enche a folha — e é exatamente o caso de um roteiro curto. */
  html, body { background:${FUNDO}; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:${TEXTO}; padding:44px 52px; font-size:14px; min-height:100vh; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid ${BRAND}; padding-bottom:16px; margin-bottom:20px; }
  .head img { height:38px; }
  .head .meta { text-align:right; color:${SUAVE}; font-size:11px; line-height:1.5; }
  /* Azul da marca sobre fundo escuro perde legibilidade no título grande — o branco carrega o
     nome do cliente e o azul fica nos detalhes, onde ainda contrasta. */
  h1 { font-size:23px; color:${TEXTO}; margin-bottom:22px; letter-spacing:-.01em; }
  /* O bloco não se parte no meio — roteiro cortado vira dois pela metade quando alguém imprime.
     Mas também NÃO força página nova a cada um: com três roteiros curtos isso deixava três
     páginas quase vazias, e um documento que o cliente recebe cheio de branco parece rascunho.
     Quem decide a quebra é o conteúdo. */
  section.bloco { page-break-inside: avoid; margin-bottom:30px; }
  .cab { display:flex; align-items:baseline; gap:10px; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid ${LINHA}; }
  /* Cabe tanto "01" quanto "Criativo 1" — sem quebrar a linha do título ao lado. */
  .num { color:${BRAND}; font-weight:800; font-size:13px; letter-spacing:.04em; white-space:nowrap; }
  .cab h2 { font-size:16px; font-weight:700; flex:1; color:${TEXTO}; }
  .dur { color:${SUAVE}; font-size:11px; white-space:nowrap; }
  /* O ângulo é a ESTRATÉGIA da peça, não fala pra gravar. Fica claramente separado do texto falado
     pra ninguém ler "loja próxima + variedade + preço" no vídeo. */
  .ang { font-size:12px; color:${SUAVE}; margin:-4px 0 12px; line-height:1.5; }
  .ang span { color:${BRAND}; font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:.06em; margin-right:6px; }
  /* Um pouco mais de entrelinha que no claro: texto claro sobre fundo escuro "borra" quando as
     linhas ficam apertadas, e este documento é lido em voz alta na gravação. */
  p { font-size:14.5px; line-height:1.7; margin-bottom:11px; color:${TEXTO}; }
  .tela { margin-top:14px; background:${CARTAO}; border-left:3px solid ${BRAND}; border-radius:0 8px 8px 0; padding:12px 16px; }
  .tela-tit { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:${BRAND}; font-weight:700; margin-bottom:6px; }
  .tela-l { font-size:13.5px; line-height:1.6; color:${TEXTO}; }
  .foot { margin-top:26px; border-top:1px solid ${LINHA}; padding-top:12px; color:${SUAVE}; font-size:10px; text-align:center; }
  </style></head><body>
    <div class="head">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="Lone Mídia">` : `<div style="font-weight:800;color:${TEXTO};font-size:20px;">Lone Mídia</div>`}
      <div class="meta">${esc(tipo)}<br>${esc(dataLabel)}</div>
    </div>
    <h1>${esc(cliente)}</h1>
    ${secoes}
    <div class="foot">Lone Mídia · ${esc(cliente)} · ${esc(dataLabel)}</div>
  </body></html>`;
}
