// A REVISÃO AUTOMÁTICA DA ARTE, EM PDF — quando a lista passa do que cabe numa mensagem.
//
// Roberto (02/10/2026): "algumas coisas não precisam ser textos e sim um pdf organizado daquele
// setor". A revisão saía como texto de até 1.300 caracteres no grupo de Artes e dizia "achei 16
// pontos" listando só 8 — o WhatsApp corta, e o fim da lista ninguém lia. Lista curta continua indo
// como texto (lib/cs/formato-aviso.ts decide pelo volume).
//
// Mesma identidade visual dos outros PDFs do Lone OS.

const BRAND = "#2b3cff";
const FUNDO = "#060814";
const CARTAO = "#0b0e1e";
const LINHA = "#1a1f33";
const TEXTO = "#eef0f6";
const SUAVE = "#8b91a1";
const ALERTA = "#f0b357";

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface DadosRevisaoArte {
  cliente: string;
  peca: string;
  designer: string;
  social: string;
  artes: number;
  /** Já agrupados ("Artes 1, 2 e 3: …"). */
  problemas: string[];
}

export function revisaoArtePdfHtml(d: DadosRevisaoArte, logo: string, hoje: string): string {
  const quem = [d.designer && `Designer: ${d.designer}`, d.social && `Social: ${d.social}`].filter(Boolean).join(" · ");
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
  .sub { color:${SUAVE}; font-size:10.5px; margin-top:3px; }
  section { background:${CARTAO}; border:1px solid ${LINHA}; border-radius:8px; padding:12px 14px; margin-bottom:12px; }
  h2 { font-size:11.5px; margin:0 0 9px; color:${ALERTA}; }
  ol { margin:0; padding-left:18px; }
  li { padding:5px 0; border-bottom:1px solid ${LINHA}; line-height:1.45; }
  li:last-child { border-bottom:0; }
  .aviso { color:${SUAVE}; font-size:10px; line-height:1.5; }
  .rodape { color:${SUAVE}; font-size:9.5px; margin-top:12px; text-align:center; }
</style></head><body>
  <div class="topo">
    <div>
      <h1>Revisão automática — ${esc(d.cliente)}</h1>
      <div class="sub">${esc(d.peca)} · ${d.artes} ${d.artes === 1 ? "arte" : "artes"} conferidas${quem ? ` · ${esc(quem)}` : ""}</div>
    </div>
    ${logo ? `<img src="${logo}" alt="Lone Mídia">` : ""}
  </div>
  <section>
    <h2>⚠️ ${d.problemas.length} ${d.problemas.length === 1 ? "ponto" : "pontos"} pra conferir antes de ir ao cliente</h2>
    <ol>${d.problemas.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
  </section>
  <p class="aviso">A revisão compara o que está VISÍVEL na arte com o briefing e as regras do cliente. Pode errar — confira na fonte antes de corrigir. Arte com tudo certo não gera aviso, só um comentário no card.</p>
  <div class="rodape">Gerado pelo Lone OS em ${esc(hoje)}</div>
</body></html>`;
}

/** Legenda do grupo: quem, qual peça e quantos pontos — sem abrir o arquivo. */
export function legendaRevisaoArte(d: DadosRevisaoArte): string {
  const quem = [d.designer && `designer *${d.designer}*`, d.social && `social *${d.social}*`].filter(Boolean).join(" · ");
  return `🔍 *Revisão automática — ${d.cliente}*\n*${d.peca}*: ${d.problemas.length} ${d.problemas.length === 1 ? "ponto" : "pontos"} pra conferir${quem ? ` — ${quem}` : ""}. A lista está no PDF.`;
}
