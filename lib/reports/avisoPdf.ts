// lib/reports/avisoPdf.ts — QUALQUER aviso longo do agente vira PDF, sem reescrever quem o monta.
//
// PRA QUE (Roberto, 11/09/2026, sobre o setup de cliente novo): "e sobre essas mensagens, teria
// como transformar em pdf?"
//
// Medido no banco, últimos 14 dias, mensagens ao grupo interno:
//   task-reminders  média 2.908 chars, máximo 3.588 — 6 de 6 acima do limite
//   setup-7dias     média 1.343, máximo 1.755      — 10 de 11 acima
//   cs-saude        média 1.674                     — 4 de 4 acima
//   cs-datas        1.555 · cs-pendencias 955 · cs-pauta 907 · revisao-mensagem 1.092
// Quinze origens produzem mensagem que o WhatsApp corta com "Ler mais".
//
// Escrever um gerador de PDF sob medida para cada uma é exatamente como chegamos aqui — véspera de
// um jeito, bom-dia de outro, e as outras treze sem nenhum. Este arquivo recebe o texto JÁ PRONTO,
// no formato do WhatsApp, e o diagrama. Quem monta o aviso não muda.
//
// O RISCO REAL não é ficar feio: é PERDER LINHA em silêncio. O PDF sai bonito faltando um parágrafo
// e ninguém confere. Por isso o conversor nunca descarta conteúdo — o que não reconhece vira
// parágrafo comum, e há teste garantindo que toda linha de entrada aparece na saída.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Marcação do WhatsApp → HTML. Aplicada DEPOIS do escape, nunca antes. */
function inline(s: string): string {
  return esc(s)
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/_([^_\n]+)_/g, "<i>$1</i>")
    .replace(/~([^~\n]+)~/g, "<s>$1</s>");
}

type Linha =
  | { tipo: "titulo"; texto: string }
  | { tipo: "item"; texto: string }
  | { tipo: "divisor" }
  | { tipo: "paragrafo"; texto: string };

/**
 * Classifica cada linha do aviso. Nada é descartado: linha que não casa com nenhum padrão vira
 * parágrafo. Linha em branco some — é separador, não conteúdo.
 */
export function lerLinhas(texto: string): Linha[] {
  const out: Linha[] = [];
  for (const bruta of (texto ?? "").split("\n")) {
    const l = bruta.trim();
    if (!l) continue;
    if (/^[─—_-]{3,}$/.test(l)) { out.push({ tipo: "divisor" }); continue; }
    if (/^[•\-*]\s+/.test(l)) { out.push({ tipo: "item", texto: l.replace(/^[•\-*]\s+/, "") }); continue; }
    // Título: linha inteira em negrito, com ou sem emoji na frente. É como o agente marca seção.
    const soNegrito = l.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}\s]*)\*([^*]+)\*\s*$/u);
    if (soNegrito) { out.push({ tipo: "titulo", texto: `${soNegrito[1]}${soNegrito[2]}`.trim() }); continue; }
    out.push({ tipo: "paragrafo", texto: l });
  }
  return out;
}

/**
 * O HTML do PDF de um aviso interno.
 *
 * `titulo` vai no cabeçalho e some do corpo se for a primeira linha do texto — senão apareceria
 * duas vezes, que é o tipo de detalhe que faz o documento parecer automático.
 */
export function avisoPdfHtml(titulo: string, texto: string, logo: string, quando: string): string {
  const linhas = lerLinhas(texto);

  // TIRA O TÍTULO REPETIDO. A primeira linha do aviso quase sempre repete o título com um
  // complemento — "🚀 *Setup de cliente novo* — os 7 primeiros dias". Deixar as duas faz o
  // documento parecer gerado sem ninguém olhar. O complemento vira subtítulo, que é onde ele serve.
  let subtitulo = "";
  const primeira = linhas[0];
  if (primeira && primeira.tipo !== "divisor") {
    const limpo = (t: string) => t
      .replace(/[*_~]/g, "")
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
      .replace(/\s+/g, " ").trim().toLowerCase();
    const alvo = limpo(titulo);
    const dela = limpo(primeira.texto);
    if (alvo && dela.startsWith(alvo)) {
      subtitulo = primeira.texto
        .replace(/[*_~]/g, "")
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
        .trim()
        .slice(titulo.length)
        .replace(/^[\s—–-]+/, "")
        .trim();
      linhas.shift();
    }
  }

  const corpo: string[] = [];
  let emLista = false;
  const fecharLista = () => { if (emLista) { corpo.push("</ul>"); emLista = false; } };

  for (const l of linhas) {
    if (l.tipo === "item") {
      if (!emLista) { corpo.push('<ul class="itens">'); emLista = true; }
      corpo.push(`<li>${inline(l.texto)}</li>`);
      continue;
    }
    fecharLista();
    if (l.tipo === "titulo") corpo.push(`<h2>${inline(l.texto)}</h2>`);
    else if (l.tipo === "divisor") corpo.push('<hr class="div">');
    else corpo.push(`<p>${inline(l.texto)}</p>`);
  }
  fecharLista();

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { margin:0; background:${FUNDO}; color:${TEXTO};
         font-family: Inter, -apple-system, "Segoe UI", Arial, sans-serif; font-size:11.5px; line-height:1.55; }
  .topo { display:flex; align-items:center; justify-content:space-between;
          border-bottom:2px solid ${BRAND}; padding-bottom:10px; margin-bottom:18px; }
  .topo img { height:22px; }
  h1 { font-size:17px; margin:0; letter-spacing:-.01em; }
  .quando { color:${SUAVE}; font-size:10px; margin-top:2px; }
  h2 { font-size:12px; margin:20px 0 8px; padding:8px 12px; background:${CARTAO};
       border-left:3px solid ${BRAND}; border-radius:0 5px 5px 0; break-after: avoid; }
  h2:first-child { margin-top:0; }
  p { margin:0 0 9px; }
  .itens { margin:0 0 12px; padding:0; list-style:none; }
  .itens li { position:relative; padding:4px 0 4px 16px; border-bottom:1px solid ${LINHA}; }
  .itens li:last-child { border-bottom:0; }
  .itens li::before { content:"›"; position:absolute; left:2px; color:${BRAND}; font-weight:600; }
  b { color:#fff; font-weight:600; }
  i { color:${SUAVE}; font-style:normal; }
  hr.div { border:0; border-top:1px solid ${LINHA}; margin:18px 0; }
  .rodape { color:${SUAVE}; font-size:9.5px; margin-top:20px; padding-top:10px;
            border-top:1px solid ${LINHA}; text-align:center; }
</style></head><body>
  <div class="topo">
    <div>
      <h1>${esc(titulo)}</h1>
      <div class="quando">${subtitulo ? `${esc(subtitulo)} · ` : ""}${esc(quando)}</div>
    </div>
    ${logo ? `<img src="${logo}" alt="Lone Mídia">` : ""}
  </div>
  ${corpo.join("\n  ")}
  <div class="rodape">Gerado pelo Lone OS · ${esc(quando)}</div>
</body></html>`;
}
