// lib/clientes/ficha-uma-pagina.ts — A FICHA DE UMA PÁGINA DO CLIENTE (Leva 7C, N23). Módulo PURO.
//
// Tudo que alguém precisa para criar para este cliente, numa folha: quem ele é (posicionamento),
// como fala (tom), o que NUNCA dizer (palavras proibidas, concorrentes), o que vende (produtos e os
// destaques do momento), as regras que o Agente aprendeu e a marca (logo e paleta). Hoje isso está
// espalhado em quatro tabelas e três seções da aba Marca & Briefing; o freelancer novo e o designer
// de fim de semana não acham. A ficha sai na tela e em PDF de UMA página.
//
// Nada inventado: campo vazio some da folha e vira "falta" na tela. Nenhum preço (o catálogo tem
// preço de produto; a ficha é sobre marca e linguagem, não sobre tabela).

export interface RegraFicha { texto: string; escopo: string | null }
export interface CorFicha { hex: string; papel: string }

export interface DadosFicha {
  cliente: string;
  nicho: string | null;
  instagram: string | null;
  /** data: URI da logo (a rota baixa e embute — o renderizador de PDF não alcança o storage). */
  logo: string | null;
  resumo: string | null;
  posicionamento: string | null;
  tom: string | null;
  publico: string[];
  palavrasProibidas: string[];
  concorrentesEvitar: string[];
  produtos: string[];
  destaques: string[];
  ctas: string[];
  regras: RegraFicha[];
  paleta: CorFicha[];
  tipografia: string | null;
  evitarVisual: string[];
  contato: string | null;
}

export interface FichaMontada extends DadosFicha {
  /** Campos que faltam para a ficha ficar completa (tela, nunca PDF). */
  faltando: string[];
  /** Tem o mínimo para valer um PDF (posicionamento ou tom, e mais alguma coisa). */
  suficiente: boolean;
}

/** Limites da folha: uma página é uma página. O resto fica na aba Marca & Briefing. */
export const LIMITES = { produtos: 12, destaques: 5, regras: 8, publico: 5, ctas: 4, proibidas: 20, paleta: 6 } as const;

const TOM_CADASTRO: Record<string, string> = { formal: "Formal", funny: "Descontraído, com humor", authoritative: "Autoridade, especialista", casual: "Próximo e casual" };

const limpa = (xs: (string | null | undefined)[] | null | undefined, max: number): string[] => {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const x of xs ?? []) {
    const t = (x ?? "").replace(/\s+/g, " ").trim();
    if (!t || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
};

export const hexValido = (h: string) => /^#[0-9a-f]{6}$/i.test(h.trim());

/** Tom: o do briefing (texto do cliente) vale mais que a etiqueta do cadastro. */
export function tomDaFicha(briefing: string | null | undefined, cadastro: string | null | undefined): string | null {
  const b = (briefing ?? "").trim();
  if (b) return b;
  const c = (cadastro ?? "").trim();
  return c ? TOM_CADASTRO[c] ?? c : null;
}

export function montarFicha(d: DadosFicha): FichaMontada {
  const f: DadosFicha = {
    ...d,
    publico: limpa(d.publico, LIMITES.publico),
    palavrasProibidas: limpa(d.palavrasProibidas, LIMITES.proibidas),
    concorrentesEvitar: limpa(d.concorrentesEvitar, LIMITES.proibidas),
    produtos: limpa(d.produtos, LIMITES.produtos),
    destaques: limpa(d.destaques, LIMITES.destaques),
    ctas: limpa(d.ctas, LIMITES.ctas),
    regras: d.regras.filter((r) => r.texto?.trim()).slice(0, LIMITES.regras),
    paleta: d.paleta.filter((c) => hexValido(c.hex)).slice(0, LIMITES.paleta),
    evitarVisual: limpa(d.evitarVisual, 5),
  };
  const faltando = [
    !f.logo && "Logo",
    !f.posicionamento && "Posicionamento",
    !f.tom && "Tom de voz",
    !f.palavrasProibidas.length && "Palavras proibidas (ou confirmar que não há)",
    !f.produtos.length && "Produtos",
    !f.paleta.length && "Paleta de cores (ler o estilo visual)",
  ].filter(Boolean) as string[];
  const blocos = [f.posicionamento, f.tom, f.produtos.length, f.regras.length, f.palavrasProibidas.length, f.paleta.length].filter(Boolean).length;
  return { ...f, faltando, suficiente: !!(f.posicionamento || f.tom) && blocos >= 2 };
}

const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lista = (xs: string[]) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const chips = (xs: string[], cls = "") => `<div class="chips">${xs.map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join("")}</div>`;

/**
 * HTML A4 de UMA página (vira PDF em lib/traffic/renderPdf). Cor literal é permitida aqui — é
 * documento impresso; a paleta mostrada é DADO do cliente. Duas colunas: a da esquerda é linguagem
 * (posicionamento, tom, proibidas), a da direita é o que vender e a marca.
 */
export function fichaPdfHtml(f: FichaMontada, geradoEm: string, logoLone: string): string {
  const BRAND = "#0d4af5";
  const bloco = (titulo: string, corpo: string) => `<section><h2>${esc(titulo)}</h2>${corpo}</section>`;
  const esquerda = [
    f.posicionamento ? bloco("Posicionamento", `<p>${esc(f.posicionamento)}</p>`) : "",
    f.tom ? bloco("Tom de voz", `<p>${esc(f.tom)}</p>`) : "",
    f.publico.length ? bloco("Para quem fala", lista(f.publico)) : "",
    (f.palavrasProibidas.length || f.concorrentesEvitar.length) ? bloco("Nunca usar",
      (f.palavrasProibidas.length ? chips(f.palavrasProibidas, "nao") : "") +
      (f.concorrentesEvitar.length ? `<p class="sub">Não citar: ${esc(f.concorrentesEvitar.join(", "))}</p>` : "")) : "",
    f.regras.length ? bloco("Regras do cliente", lista(f.regras.map((r) => r.texto))) : "",
  ].join("");
  const direita = [
    f.produtos.length ? bloco("Produtos e serviços", chips(f.produtos)) : "",
    f.destaques.length ? bloco("Em destaque agora", lista(f.destaques)) : "",
    f.ctas.length ? bloco("Chamadas que funcionam", lista(f.ctas)) : "",
    f.paleta.length ? bloco("Paleta", `<div class="paleta">${f.paleta.map((c) => `<div class="cor"><span class="amostra" style="background:${esc(c.hex)}"></span><span>${esc(c.hex.toUpperCase())}<br><small>${esc(c.papel)}</small></span></div>`).join("")}</div>`
      + (f.tipografia ? `<p class="sub">Tipografia: ${esc(f.tipografia)}</p>` : "")
      + (f.evitarVisual.length ? `<p class="sub">Evitar no visual: ${esc(f.evitarVisual.join("; "))}</p>` : "")) : "",
    f.contato ? bloco("Fecho das legendas", `<p>${esc(f.contato)}</p>`) : "",
  ].join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 12mm 12mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { height:100%; }
  body { font-family: Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111118; font-size:9pt; line-height:1.45; }
  .head { display:flex; align-items:center; gap:12pt; border-bottom:1.5pt solid ${BRAND}; padding-bottom:8pt; margin-bottom:10pt; }
  .head .logo { width:46pt; height:46pt; object-fit:contain; border:0.75pt solid #e5e7eb; border-radius:6pt; padding:3pt; background:#ffffff; }
  .head .nome { flex:1; }
  .head h1 { font-size:16pt; font-weight:600; letter-spacing:-.01em; }
  .head .meta { color:#6b7280; font-size:8pt; }
  .head .lone { height:18pt; }
  .resumo { color:#374151; margin-bottom:8pt; }
  .cols { display:flex; gap:14pt; }
  .col { flex:1; min-width:0; }
  section { break-inside:avoid; margin-bottom:8pt; }
  h2 { font-size:8pt; letter-spacing:.08em; text-transform:uppercase; color:${BRAND}; font-weight:600; margin-bottom:3pt; }
  ul { padding-left:11pt; } li { margin:1pt 0; }
  .chips { display:flex; flex-wrap:wrap; gap:3pt; }
  .chip { border:0.75pt solid #e5e7eb; border-radius:10pt; padding:1pt 6pt; font-size:8pt; }
  .chip.nao { border-color:#fecaca; color:#b91c1c; }
  .sub { color:#6b7280; font-size:8pt; margin-top:3pt; }
  .paleta { display:flex; flex-wrap:wrap; gap:6pt; }
  .cor { display:flex; align-items:center; gap:4pt; font-size:7.5pt; }
  .amostra { width:16pt; height:16pt; border-radius:4pt; border:0.75pt solid #e5e7eb; display:inline-block; }
  .foot { position:fixed; bottom:0; left:0; right:0; text-align:center; color:#9ca3af; font-size:7pt; }
  </style></head><body>
    <div class="head">
      ${f.logo ? `<img class="logo" src="${f.logo}" alt="Logo">` : ""}
      <div class="nome">
        <h1>${esc(f.cliente)}</h1>
        <div class="meta">${[f.nicho, f.instagram ? `@${f.instagram.replace(/^@/, "")}` : null].filter(Boolean).map((x) => esc(x!)).join(" · ")}</div>
      </div>
      ${logoLone ? `<img class="lone" src="${logoLone}" alt="Lone Mídia">` : ""}
    </div>
    ${f.resumo ? `<p class="resumo">${esc(f.resumo)}</p>` : ""}
    <div class="cols"><div class="col">${esquerda}</div><div class="col">${direita}</div></div>
    <div class="foot">Ficha do cliente · Lone Mídia · gerada pelo Lone OS em ${esc(geradoEm)} · uso interno e de fornecedores da marca</div>
  </body></html>`;
}
