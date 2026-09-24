// lib/crm/proposta.ts — GERADOR DE PROPOSTA EM PDF (Leva 7C, N29). Módulo PURO.
//
// Depois da reunião, o Roberto montava a proposta do zero num editor. O diagnóstico que o Piloto SDR
// já fez do prospect (por que prospectar, oportunidades, a presença digital que foi LIDA) é o miolo de
// uma proposta — aqui ele vira um PDF com a cara da Lone: o que vimos, onde está a oportunidade, o que
// a Lone faz no pacote escolhido e os próximos passos.
//
// SEM R$. Nenhum preço, nenhuma estimativa de faturamento (a faixa "provável R$ 100–300 mil/mês" é
// leitura interna do ICP e nunca vai para o prospect). Valor se conversa na reunião. O que o sistema
// conta é "proposta enviada" — a data, não o valor.

export type PacoteProposta = "lone_growth" | "assessoria_trafego" | "assessoria_social" | "assessoria_design";

export const PACOTES_PROPOSTA: Record<PacoteProposta, { nome: string; entregas: string[] }> = {
  lone_growth: {
    nome: "Lone Growth — anúncios + conteúdo",
    entregas: [
      "Gestão de anúncios no Meta (Instagram e Facebook) com meta de custo por conversa",
      "Planejamento e produção de conteúdo para o Instagram (artes, legendas e calendário do mês)",
      "Criativos testados e trocados pelo que dá resultado",
      "Portal de resultados com os números em tempo real",
      "Reunião mensal de resultados e próximos passos",
    ],
  },
  assessoria_trafego: {
    nome: "Assessoria de Tráfego",
    entregas: [
      "Gestão de anúncios no Meta (Instagram e Facebook) com meta de custo por conversa",
      "Criativos testados e trocados pelo que dá resultado",
      "Portal de resultados com os números em tempo real",
      "Reunião mensal de resultados e próximos passos",
    ],
  },
  assessoria_social: {
    nome: "Assessoria de Social",
    entregas: [
      "Planejamento e produção de conteúdo para o Instagram (artes, legendas e calendário do mês)",
      "Perfil organizado: bio, destaques e fixados",
      "Reunião mensal de resultados e próximos passos",
    ],
  },
  assessoria_design: {
    nome: "Assessoria de Design",
    entregas: [
      "Artes para redes sociais e materiais da marca",
      "Identidade visual aplicada com consistência",
      "Pedidos de arte com prazo combinado",
    ],
  },
};

/** O que fica pronto no setup, por pacote (a promessa tem que caber no que foi vendido). */
const PRIMEIROS_15: Record<PacoteProposta, string> = {
  lone_growth: "perfil organizado, primeiras artes e anúncios no ar",
  assessoria_trafego: "conta de anúncios organizada e primeiros anúncios no ar",
  assessoria_social: "perfil organizado e primeiras artes no feed",
  assessoria_design: "identidade revisada e primeiras artes entregues",
};

export function pacoteProposta(p: unknown): PacoteProposta {
  return typeof p === "string" && p in PACOTES_PROPOSTA ? (p as PacoteProposta) : "lone_growth";
}

export interface DadosProposta {
  empresa: string;
  decisor: string | null;
  cidade: string | null;
  segmento: string | null;
  porQue: string | null;
  oportunidades: string[];
  /** Fatos lidos (seguidores, posts por semana, nota no Google, anuncia ou não) — nunca estimativa. */
  presenca: { seguidores: number | null; postsPorSemana: number | null; googleNota: number | null; googleAvaliacoes: number | null; anuncia: boolean | null };
  pacote: PacoteProposta;
}

/** O que falta para a proposta não sair oca (a rota devolve isto em vez de gerar). */
export function faltandoNaProposta(d: DadosProposta): string[] {
  const f: string[] = [];
  if (!d.empresa.trim()) f.push("nome da empresa");
  if (!d.oportunidades.length && !d.porQue) f.push("diagnóstico (rode \"Pesquisar de novo\" na ficha do prospect)");
  return f;
}

/** Fatos da presença digital, em frases. Só o que foi lido. */
export function fatosDaPresenca(p: DadosProposta["presenca"]): string[] {
  const out: string[] = [];
  if (p.seguidores != null) out.push(`${p.seguidores.toLocaleString("pt-BR")} seguidores no Instagram${p.postsPorSemana != null ? `, ${p.postsPorSemana.toLocaleString("pt-BR")} posts por semana` : ""}`);
  if (p.googleNota != null && p.googleAvaliacoes != null) out.push(`Nota ${p.googleNota.toLocaleString("pt-BR")} no Google, com ${p.googleAvaliacoes.toLocaleString("pt-BR")} avaliações`);
  if (p.anuncia === true) out.push("Já anuncia no Meta");
  if (p.anuncia === false) out.push("Não encontramos anúncios ativos no Meta");
  return out;
}

/** Tira qualquer menção a dinheiro que tenha escapado para o diagnóstico (a regra é: proposta sem R$). */
export function semDinheiro(t: string): string {
  return t.replace(/R\$\s?[\d.,]+(\s?(mil|milhões|mi|k))?(\s?\/\s?m[eê]s)?/gi, "").replace(/\s{2,}/g, " ").replace(/\(\s*\)/g, "").trim();
}

const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML A4 (vira PDF em lib/traffic/renderPdf). Cor literal permitida: documento impresso. */
export function propostaPdfHtml(d: DadosProposta, logoLone: string, geradoEm: string): string {
  const BRAND = "#0d4af5";
  const pac = PACOTES_PROPOSTA[d.pacote];
  const fatos = fatosDaPresenca(d.presenca);
  const oport = d.oportunidades.map(semDinheiro).filter(Boolean);
  const porQue = d.porQue ? semDinheiro(d.porQue) : null;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { margin: 20mm 18mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111118; font-size:10.5pt; line-height:1.6; }
  .head { display:flex; align-items:center; justify-content:space-between; border-bottom:2pt solid ${BRAND}; padding-bottom:10pt; margin-bottom:18pt; }
  .head img { height:28pt; }
  .head .meta { text-align:right; color:#6b7280; font-size:8.5pt; }
  .eyebrow { font-size:8pt; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; }
  h1 { font-size:20pt; font-weight:600; letter-spacing:-.01em; margin:2pt 0 4pt; }
  .para { color:#374151; margin-bottom:16pt; }
  h2 { font-size:12pt; font-weight:600; color:${BRAND}; margin-bottom:6pt; break-after:avoid; }
  section { break-inside:avoid; margin-bottom:16pt; }
  ul { padding-left:14pt; } li { margin:3pt 0; }
  .pacote { border:0.75pt solid #e5e7eb; border-radius:8pt; padding:12pt 14pt; }
  .pacote .nome { font-weight:600; margin-bottom:4pt; }
  .passos li { margin:4pt 0; }
  .foot { margin-top:24pt; border-top:0.75pt solid #e5e7eb; padding-top:8pt; color:#9ca3af; font-size:7.5pt; text-align:center; }
  </style></head><body>
    <div class="head">
      ${logoLone ? `<img src="${logoLone}" alt="Lone Mídia">` : `<div style="font-weight:700;color:${BRAND};font-size:14pt;">Lone Mídia</div>`}
      <div class="meta">Proposta comercial<br>${esc(geradoEm)}</div>
    </div>
    <div class="eyebrow">Proposta para</div>
    <h1>${esc(d.empresa)}</h1>
    <p class="para">${d.decisor ? `A/C ${esc(d.decisor)}` : ""}${d.decisor && (d.segmento || d.cidade) ? " · " : ""}${esc([d.segmento, d.cidade].filter(Boolean).join(" · "))}</p>

    ${fatos.length || porQue ? `<section><h2>O que vimos</h2>${porQue ? `<p>${esc(porQue)}</p>` : ""}${fatos.length ? `<ul>${fatos.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}</section>` : ""}
    ${oport.length ? `<section><h2>Onde está a oportunidade</h2><ul>${oport.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></section>` : ""}
    <section><h2>O que a Lone faz por ${esc(d.empresa)}</h2>
      <div class="pacote"><div class="nome">${esc(pac.nome)}</div><ul>${pac.entregas.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>
    </section>
    <section><h2>Próximos passos</h2>
      <ol class="passos" style="padding-left:14pt">
        <li>Alinhamos o escopo e os valores na conversa com vocês.</li>
        <li>Cadastro e acessos por um link seguro — leva poucos minutos.</li>
        <li>Nos primeiros 15 dias: ${esc(PRIMEIROS_15[d.pacote])}.</li>
      </ol>
    </section>
    <div class="foot">Lone Mídia · Documento gerado pelo Lone OS em ${esc(geradoEm)}</div>
  </body></html>`;
}
