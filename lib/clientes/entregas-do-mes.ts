// lib/clientes/entregas-do-mes.ts — "O QUE ENTREGAMOS NO MÊS" (Leva 7C, N21). Módulo PURO.
//
// O CS fechava o mês montando à mão o que foi feito para o cliente: contava posts no perfil, abria o
// gerenciador para o custo por conversa, lembrava da reunião. Agora o resumo se monta sozinho a partir
// do que o sistema já registra — posts REAIS (client_ig_posts), artes entregues, anúncios
// (metric_snapshots) contra a meta de custo do cliente (client_traffic_policy), reuniões realizadas e
// os criativos vencedores (creative_health) — e sai como PDF + um RASCUNHO de WhatsApp que o CS revisa
// e manda. Nada é enviado daqui.
//
// SÓ O RESULTADO DO PRÓPRIO CLIENTE. Nenhum valor da agência (fee, contrato) entra — nem existe na
// entrada. O investimento em anúncios é dinheiro do cliente e aparece porque sem ele o custo por
// conversa não se explica.
//
// Documento com dado faltando não vira placeholder: bloco sem dado some do PDF e vira "lacuna" na
// tela; mês sem nada para mostrar não gera PDF.

export interface PostMes { em: string; tipo: string | null; permalink: string | null }
export interface ReuniaoMes { em: string; titulo: string }
export interface VencedorMes { nome: string; evidencia: string | null }

export interface DadosEntregasMes {
  cliente: string;
  contato: string | null;
  mes: string;               // YYYY-MM
  hoje: string;              // YYYY-MM-DD (São Paulo)
  temTrafego: boolean;
  temSocial: boolean;
  /** O perfil do Instagram está vinculado (sem ele, 0 posts não quer dizer "não postou"). */
  instagramLigado: boolean;
  posts: PostMes[];
  /** Cards que o board registrou como publicados no mês (reserva quando o Instagram não está ligado). */
  cardsPublicados: number;
  artesEntregues: number;
  anuncios: { gasto: number; conversas: number; dias: number } | null;
  cplMeta: number | null;
  reunioes: ReuniaoMes[];
  vencedores: VencedorMes[];
}

export interface ResumoEntregasMes {
  cliente: string;
  mes: string;
  mesRotulo: string;        // "setembro de 2026"
  parcial: boolean;         // mês ainda em curso
  conteudo: { posts: number; reels: number; fonte: "instagram" | "board"; artes: number } | null;
  anuncios: { gasto: number; conversas: number; cpl: number | null; cplMeta: number | null; difPct: number | null } | null;
  reunioes: ReuniaoMes[];
  vencedores: VencedorMes[];
  /** O que faltou para o resumo ficar completo (vai para a TELA, nunca para o PDF). */
  lacunas: string[];
  /** Há o que mostrar? Sem nada, não tem PDF. */
  temConteudo: boolean;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function rotuloMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[(m || 1) - 1]} de ${a}`;
}

/** YYYY-MM válido; senão, o mês de `hoje`. */
export function mesValido(mes: string | null | undefined, hoje: string): string {
  return mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) && mes <= hoje.slice(0, 7) ? mes : hoje.slice(0, 7);
}

/** Primeiro e último dia do mês (YYYY-MM-DD). */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiro = (n: number) => n.toLocaleString("pt-BR");
const plural = (n: number, s: string, p: string) => `${inteiro(n)} ${n === 1 ? s : p}`;
const ddmm = (iso: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00-03:00`) : new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
};

export function resumirMes(d: DadosEntregasMes): ResumoEntregasMes {
  const lacunas: string[] = [];
  const parcial = d.mes === d.hoje.slice(0, 7);

  let conteudo: ResumoEntregasMes["conteudo"] = null;
  if (d.temSocial) {
    const doInstagram = d.instagramLigado;
    const posts = doInstagram ? d.posts.length : d.cardsPublicados;
    const reels = doInstagram ? d.posts.filter((p) => /reel|video/i.test(p.tipo ?? "")).length : 0;
    if (!doInstagram) lacunas.push("Instagram do cliente não vinculado: a contagem de posts vem do quadro, não do perfil.");
    if (posts > 0 || d.artesEntregues > 0) conteudo = { posts, reels, fonte: doInstagram ? "instagram" : "board", artes: d.artesEntregues };
    else lacunas.push("Nenhum post nem arte registrados no mês.");
  }

  let anuncios: ResumoEntregasMes["anuncios"] = null;
  if (d.temTrafego) {
    if (!d.anuncios || d.anuncios.gasto <= 0) {
      lacunas.push("Sem dados de anúncios no mês (conta não vinculada ou sem veiculação).");
    } else {
      const cpl = d.anuncios.conversas > 0 ? d.anuncios.gasto / d.anuncios.conversas : null;
      const difPct = cpl !== null && d.cplMeta ? Math.round(((cpl - d.cplMeta) / d.cplMeta) * 100) : null;
      if (!d.cplMeta) lacunas.push("Sem meta de custo por conversa cadastrada para comparar.");
      anuncios = { gasto: d.anuncios.gasto, conversas: d.anuncios.conversas, cpl, cplMeta: d.cplMeta, difPct };
    }
  }

  const reunioes = [...d.reunioes].sort((a, b) => a.em.localeCompare(b.em));
  const vencedores = d.vencedores.slice(0, 3);
  const temConteudo = !!conteudo || !!anuncios || reunioes.length > 0;
  return { cliente: d.cliente, mes: d.mes, mesRotulo: rotuloMes(d.mes), parcial, conteudo, anuncios, reunioes, vencedores, lacunas, temConteudo };
}

/** "16% abaixo da meta de R$ 10,00" / "8% acima da meta…" / "na meta". */
export function fraseMeta(a: NonNullable<ResumoEntregasMes["anuncios"]>): string | null {
  if (a.difPct === null || !a.cplMeta) return null;
  if (a.difPct === 0) return `na meta de ${brl(a.cplMeta)}`;
  return `${Math.abs(a.difPct)}% ${a.difPct < 0 ? "abaixo" : "acima"} da meta de ${brl(a.cplMeta)}`;
}

/** O RASCUNHO para o CS revisar e mandar. Tom da Lone, sem emoji, com o que tem — nada inventado. */
export function rascunhoWhatsApp(r: ResumoEntregasMes, contato: string | null): string {
  const primeiro = (contato ?? "").trim().split(/\s+/)[0];
  const quando = r.parcial ? `até agora em ${r.mesRotulo.split(" de ")[0]}` : `em ${r.mesRotulo.split(" de ")[0]}`;
  const linhas: string[] = [`Oi${primeiro ? `, ${primeiro}` : ""}! Passando o resumo do que entregamos ${quando} para ${r.cliente}:`];

  if (r.conteudo) {
    linhas.push("", "*Conteúdo*");
    if (r.conteudo.posts) linhas.push(`• ${plural(r.conteudo.posts, "post no ar", "posts no ar")}${r.conteudo.reels ? ` (${plural(r.conteudo.reels, "Reels", "Reels")})` : ""}`);
    if (r.conteudo.artes) linhas.push(`• ${plural(r.conteudo.artes, "arte produzida", "artes produzidas")}`);
  }
  if (r.anuncios) {
    linhas.push("", "*Anúncios*");
    linhas.push(`• ${plural(r.anuncios.conversas, "conversa iniciada", "conversas iniciadas")}`);
    if (r.anuncios.cpl !== null) {
      const meta = fraseMeta(r.anuncios);
      linhas.push(`• ${brl(r.anuncios.cpl)} por conversa${meta ? ` — ${meta}` : ""}`);
    }
    if (r.vencedores.length) linhas.push(`• Criativo que mais trouxe resultado: "${r.vencedores[0].nome}"`);
  }
  if (r.reunioes.length) {
    linhas.push("", "*Reuniões*");
    linhas.push(`• ${plural(r.reunioes.length, "reunião", "reuniões")} (${r.reunioes.map((x) => ddmm(x.em)).join(", ")})`);
  }
  linhas.push("", "O relatório completo vai em PDF aqui. Qualquer dúvida, é só chamar!");
  return linhas.join("\n");
}

const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * HTML A4 do PDF (vira arquivo em lib/traffic/renderPdf → htmlToPdf). Cores literais são permitidas
 * aqui: é documento impresso (regra do design system). Mesmo visual claro dos PDFs do CS.
 */
export function entregasPdfHtml(r: ResumoEntregasMes, logoDataUri: string, geradoEm: string): string {
  const BRAND = "#0d4af5";
  const kpi = (valor: string, rotulo: string, sub?: string | null) =>
    `<div class="kpi"><div class="v">${esc(valor)}</div><div class="l">${esc(rotulo)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>`;

  const blocos: string[] = [];
  if (r.conteudo) {
    const k = [
      r.conteudo.posts ? kpi(inteiro(r.conteudo.posts), r.conteudo.posts === 1 ? "post no ar" : "posts no ar", r.conteudo.reels ? `${inteiro(r.conteudo.reels)} em Reels` : r.conteudo.fonte === "board" ? "registrados no quadro" : "no perfil do Instagram") : "",
      r.conteudo.artes ? kpi(inteiro(r.conteudo.artes), r.conteudo.artes === 1 ? "arte produzida" : "artes produzidas") : "",
    ].join("");
    blocos.push(`<section><h2>Conteúdo</h2><div class="grid">${k}</div></section>`);
  }
  if (r.anuncios) {
    const meta = fraseMeta(r.anuncios);
    const k = [
      kpi(inteiro(r.anuncios.conversas), r.anuncios.conversas === 1 ? "conversa iniciada" : "conversas iniciadas"),
      r.anuncios.cpl !== null ? kpi(brl(r.anuncios.cpl), "por conversa", meta) : "",
      kpi(brl(r.anuncios.gasto), "investidos em anúncios"),
    ].join("");
    const venc = r.vencedores.length
      ? `<h3>Criativos que mais trouxeram resultado</h3><ul>${r.vencedores.map((v) => `<li><b>${esc(v.nome)}</b>${v.evidencia ? ` — ${esc(v.evidencia)}` : ""}</li>`).join("")}</ul>`
      : "";
    blocos.push(`<section><h2>Anúncios</h2><div class="grid">${k}</div>${venc}</section>`);
  }
  if (r.reunioes.length) {
    blocos.push(`<section><h2>Reuniões</h2><ul>${r.reunioes.map((x) => `<li>${esc(ddmm(x.em))} — ${esc(x.titulo)}</li>`).join("")}</ul></section>`);
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { margin: 18mm 16mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111118; font-size:10.5pt; line-height:1.55; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:2pt solid ${BRAND}; padding-bottom:10pt; margin-bottom:16pt; }
  .head img { height:28pt; }
  .head .meta { text-align:right; color:#6b7280; font-size:8.5pt; line-height:1.5; }
  .eyebrow { font-size:8pt; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; }
  h1 { font-size:18pt; font-weight:600; letter-spacing:-.01em; margin:2pt 0 14pt; }
  h2 { font-size:12pt; font-weight:600; color:${BRAND}; margin-bottom:8pt; break-after:avoid; }
  h3 { font-size:10pt; font-weight:600; margin:10pt 0 4pt; }
  section { break-inside:avoid; margin-bottom:16pt; }
  .grid { display:flex; gap:8pt; flex-wrap:wrap; }
  .kpi { flex:1 1 30%; border:0.75pt solid #e5e7eb; border-radius:8pt; padding:9pt 11pt; break-inside:avoid; }
  .kpi .v { font-size:17pt; font-weight:600; letter-spacing:-.01em; }
  .kpi .l { color:#374151; font-size:9pt; }
  .kpi .s { color:#6b7280; font-size:8pt; margin-top:2pt; }
  ul { padding-left:14pt; } li { margin:2pt 0; }
  .nota { color:#6b7280; font-size:8.5pt; margin-top:4pt; }
  .foot { margin-top:22pt; border-top:0.75pt solid #e5e7eb; padding-top:8pt; color:#9ca3af; font-size:7.5pt; text-align:center; }
  </style></head><body>
    <div class="head">
      ${logoDataUri ? `<img src="${logoDataUri}" alt="Lone Mídia">` : `<div style="font-weight:700;color:${BRAND};font-size:14pt;">Lone Mídia</div>`}
      <div class="meta">O que entregamos no mês<br>${esc(r.mesRotulo)}${r.parcial ? " (parcial)" : ""}</div>
    </div>
    <div class="eyebrow">Resumo do mês</div>
    <h1>${esc(r.cliente)}</h1>
    ${blocos.join("")}
    ${r.parcial ? `<p class="nota">Mês em andamento: números até ${esc(geradoEm)}.</p>` : ""}
    <div class="foot">Lone Mídia · Documento gerado pelo Lone OS em ${esc(geradoEm)}</div>
  </body></html>`;
}
