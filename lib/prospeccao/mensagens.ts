// lib/prospeccao/mensagens.ts — o que a Rafaela diz.
//
// A lógica pedida pelo Roberto (16/09): CONTEXTO + INTENÇÃO + HISTÓRICO + ESTÁGIO + DADOS → o
// estágio decide o OBJETIVO da próxima mensagem → o template dá os LIMITES → a IA escreve a
// mensagem natural. Template em modo `diretriz` = a IA redige; modo `fixo` = sai como está
// (confirmações, opt-out, lembretes). Em qualquer modo o texto passa pelo validador, e o fixo é a
// reserva quando a IA falha ou é reprovada.
//
// O que nunca sai daqui: emoji, preço, desconto, garantia, "faturamento", promessa de resultado,
// familiaridade inventada, dado que não está em FATOS, e "presente" sem `gift_reserved`.

import type { ProspectRow, IntentLida } from "./tipos";
import { preencher, type ProspectConfig, type ChaveTemplate, type Template } from "./config";
import { primeiroNome, nomeDeTratamento, artigoDe, primeiraPessoa } from "./normalizar";
import { porExtensoSP, horaCurtaSP, dataCurtaSP, componentesSP } from "./tempo";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const PROIBIDO = /\b(desconto|promo[cç][aã]o|R\$\s?\d|por apenas|garanti(a|mos|do)|ROI|retorno garantido|faturamento|fatura|contrato|proposta comercial)\b/i;

/** Validador de QUALQUER texto que vá ao prospect. */
export function textoSeguro(t: string | null | undefined, max = 800): { ok: boolean; motivo?: string } {
  if (!t || t.trim().length < 2) return { ok: false, motivo: "texto vazio" };
  if (t.length > max) return { ok: false, motivo: `texto longo demais (${t.length} > ${max})` };
  if (/\{\w+\}/.test(t)) return { ok: false, motivo: "placeholder não preenchido" };
  if (EMOJI.test(t)) return { ok: false, motivo: "emoji" };
  if (PROIBIDO.test(t)) return { ok: false, motivo: "cita preço/desconto/garantia/faturamento/contrato" };
  return { ok: true };
}

export type Historico = { autor: string; texto: string }[];

export interface ContextoRedacao {
  p: ProspectRow;
  cfg: ProspectConfig;
  historico?: Historico;
  ultimaMensagem?: string | null;
  intent?: IntentLida | null;
  agora?: Date;
  /** Valores extras para {chaves}: opcao1, opcao2, quando, data, hora, link, endereco, contexto, oportunidade… */
  valores?: Record<string, string | number | null | undefined>;
  /** Força o modo (o simulador/prévia usa "fixo" para não gastar IA). */
  forcarModo?: Template["modo"];
  /** Origem da chamada de IA (llm_calls). */
  origem?: string;
}

export const saudacaoDoDia = (agora = new Date()) => { const h = componentesSP(agora).hora; return h < 12 ? "bom dia" : h < 18 ? "boa tarde" : "boa noite"; };

const decisorConfiavel = (p: ProspectRow) => (p.decisor_nome && (p.decisor_confianca ?? 0) >= 0.5 ? nomeDeTratamento(primeiraPessoa(p.decisor_nome)) : null);
export const nomeParaFalar = (p: ProspectRow) => primeiroNome(primeiraPessoa(p.decisor_nome)) ?? "";

/** Um gancho verificado vira frase "por/pela …" quando existe; nada quando não existe. */
function ganchoFrase(p: ProspectRow): string | null {
  const g = p.diagnostico?.gancho?.trim();
  if (!g) return null;
  // "Vi que vocês têm duas lojas…" → "porque vi que vocês têm duas lojas…"
  const limpo = g.replace(/\.?$/, "");
  return /^(por|pela|pelo|porque)\b/i.test(limpo) ? limpo : `porque ${limpo.charAt(0).toLowerCase()}${limpo.slice(1)}`;
}

/** Os valores das {chaves} para este prospect, agora. */
export function valoresDe(p: ProspectRow, cfg: ProspectConfig, agora = new Date(), extra: ContextoRedacao["valores"] = {}): Record<string, string | number | null | undefined> {
  const dec = decisorConfiavel(p);
  const gancho = ganchoFrase(p);
  return {
    saudacao: saudacaoDoDia(agora),
    agente: cfg.identidade.nome,
    cargo: cfg.identidade.cargo,
    responsavel: cfg.identidade.quem_faz_reuniao,
    empresas_atendidas: cfg.identidade.empresas_atendidas,
    nome: nomeParaFalar(p) || null,
    decisor: dec,
    /** "o Marcelo" / "a Mariana" — para templates fixos; a IA cuida do gênero sozinha. */
    o_decisor: dec ? `${artigoDe(dec)} ${dec}` : null,
    ele_ela: dec ? (artigoDe(dec) === "a" ? "ela" : "ele") : "ele",
    empresa: p.nome,
    cidade: p.cidade,
    segmento: p.segmento ? p.segmento.toLowerCase() : null,
    gancho,
    oportunidade: p.diagnostico?.oportunidades?.[0] ? p.diagnostico.oportunidades[0].replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase()) : null,
    contexto: p.contexto_comercial?.motivo_retorno ?? null,
    endereco: p.endereco,
    ...extra,
  };
}

/** Chaves que, vazias, tornam uma variação inelegível (a frase ficaria sem sentido). */
const CHAVES_DE_DADO = new Set(["gancho", "decisor", "o_decisor", "cidade", "oportunidade", "endereco", "link", "opcao1", "opcao2", "contexto", "quando", "nome"]);
const chavesDe = (t: string) => Array.from(t.matchAll(/\{(\w+)\}/g)).map((m) => m[1]);
const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Texto fixo: escolhe entre fixo + variações a que tem todos os dados; estável por prospect. */
export function textoFixo(t: Template, p: ProspectRow, valores: Record<string, unknown>): string {
  const candidatos = [t.fixo, ...(t.variacoes ?? [])].filter((x) => x && x.trim());
  const elegiveis = candidatos.filter((c) => chavesDe(c).every((k) => !CHAVES_DE_DADO.has(k) || (valores[k] !== null && valores[k] !== undefined && valores[k] !== "")));
  const lista = elegiveis.length ? elegiveis : candidatos.slice(0, 1);
  const escolhido = lista[hash(p.id) % lista.length] ?? t.fixo;
  return limparPreenchido(preencher(escolhido, valores as Record<string, string | number | null | undefined>));
}

/** Frases que ficaram tortas por chave vazia ("Oi, ! Tudo bem?" → "Oi! Tudo bem?"). */
function limparPreenchido(t: string): string {
  return t
    .replace(/, !\s/g, "! ").replace(/, \./g, ".").replace(/, ,/g, ",")
    .replace(/\bcom o \?/g, "com o responsável?").replace(/\bcom o \./g, "com o responsável.")
    .replace(/\bvi \.\s*/g, "").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const REGRAS_DURAS = `REGRAS ABSOLUTAS (valem acima de qualquer diretriz):
- Português do Brasil, tom de WhatsApp: natural, objetivo, cordial. Frases curtas. 1 a 4 frases por mensagem, no máximo 600 caracteres. Pode usar quebra de linha entre ideias.
- Você é mulher e assina como {agente}. Fale em nome da Lone; NUNCA finja ser o {responsavel} nem diga que é ele.
- Nunca use emoji.
- Nunca fale de preço, valores, desconto, condição comercial, contrato, proposta, garantia, ROI ou resultado prometido.
- Nunca invente familiaridade ("como combinamos", "lembra de mim") nem fatos: use SOMENTE o que está em FATOS VERIFICADOS. Sem fato útil, não cite nada específico da empresa.
- Nunca mencione faturamento nem estimativas.
- Nunca repita uma mensagem que já está no HISTÓRICO nem a apresentação inteira da Lone se ela já foi feita nesta conversa.
- Não pressione. Não pareça telemarketing. Não use linguagem corporativa ("soluções", "sinergia", "alavancar").
- Sem elogios exagerados ("incrível", "maravilhoso", "parabéns"): cite o fato de forma neutra.
- Cumprimento ("Oi, tudo bem?") só na primeira mensagem da conversa ou quando a última troca foi há mais de um dia. No meio da conversa, vá direto ao ponto.
- Se a apresentação da Lone (nome, "mais de 70 empresas") já aparece no HISTÓRICO, não a repita — vá direto ao assunto.
- Escreva só a mensagem, sem aspas, sem assinatura extra, sem explicações.`;

/** A IA escreve dentro da diretriz. Devolve null se não houver IA ou o texto for reprovado. */
export async function redigirComDiretriz(chave: ChaveTemplate, t: Template, ctx: ContextoRedacao, valores: Record<string, unknown>): Promise<string | null> {
  const { chatJson, isOpenAIConfigured } = await import("@/lib/ai/openai");
  if (!isOpenAIConfigured() || !t.diretriz.trim()) return null;
  const { p, cfg } = ctx;
  const v = valores as Record<string, string | number | null | undefined>;
  const fatos: string[] = [];
  if (p.segmento) fatos.push(`segmento: ${p.segmento}`);
  if (p.cidade) fatos.push(`cidade: ${p.cidade}${p.uf ? `/${p.uf}` : ""}`);
  if (p.google_avaliacoes) fatos.push(`Google: ${p.google_nota ?? "?"} estrelas, ${p.google_avaliacoes} avaliações`);
  if (p.presenca?.instagram_followers) fatos.push(`Instagram @${p.instagram}: ${p.presenca.instagram_followers} seguidores`);
  if ((p.unidades ?? 0) >= 2) fatos.push(`${p.unidades} unidades`);
  if (v.gancho) fatos.push(`gancho validado ({gancho}): ${v.gancho}`);
  if (v.oportunidade) fatos.push(`oportunidade identificada ({oportunidade}): ${v.oportunidade}`);
  if (p.contexto_comercial?.resumo) fatos.push(`última conversa: ${p.contexto_comercial.resumo}`);
  if (p.contexto_comercial?.objecao) fatos.push(`objeção anterior: ${p.contexto_comercial.objecao}`);
  if (v.contexto) fatos.push(`o prospect comentou ({contexto}): ${v.contexto}`);
  const dados = Object.entries(v).filter(([k, x]) => x !== null && x !== undefined && x !== "" && !["gancho", "oportunidade", "contexto"].includes(k)).map(([k, x]) => `{${k}} = ${x}`).join("\n");
  const hist = (ctx.historico ?? []).slice(-8).map((h) => `${h.autor === "prospect" ? "PROSPECT" : cfg.identidade.nome.toUpperCase()}: ${h.texto}`).join("\n");
  const system = `${cfg.identidade.persona}\n\n${preencher(REGRAS_DURAS, { agente: cfg.identidade.nome, responsavel: cfg.identidade.quem_faz_reuniao })}`;
  const user =
    `DIRETRIZ DESTA MENSAGEM (${chave}):\n${preencher(t.diretriz, v)}\n\n` +
    `DADOS (use as chaves como referência do que existe):\n${dados}\n\n` +
    `FATOS VERIFICADOS sobre a empresa:\n${fatos.length ? fatos.map((f) => `- ${f}`).join("\n") : "- (nenhum fato específico — não cite nada da empresa além do nome)"}\n\n` +
    `HISTÓRICO DA CONVERSA:\n${hist || "(primeira mensagem)"}\n\n` +
    (ctx.ultimaMensagem ? `ÚLTIMA MENSAGEM DO PROSPECT: ${ctx.ultimaMensagem}\n\n` : "") +
    (ctx.intent ? `INTENÇÃO LIDA: ${ctx.intent.intent}\n\n` : "") +
    `Escreva a mensagem.`;
  const r = await chatJson<{ mensagem: string }>({
    model: cfg.modelo_redacao || "gpt-4o", system, user, schemaName: "mensagem_sdr",
    schema: { type: "object", additionalProperties: false, properties: { mensagem: { type: "string" } }, required: ["mensagem"] },
    maxTokens: 400, temperature: 0.5, origem: ctx.origem ?? `prospeccao:redigir:${chave}`,
  });
  const texto = r.ok ? r.data?.mensagem?.trim() : null;
  if (!texto) return null;
  const val = textoSeguro(texto, 700);
  if (!val.ok) { console.warn(`[prospeccao/mensagens] IA reprovada em ${chave} (${val.motivo}): ${texto.slice(0, 80)}`); return null; }
  return texto;
}

/**
 * A mensagem para um template, respeitando o modo. Sempre devolve algo utilizável: diretriz → IA;
 * IA indisponível/reprovada → texto fixo (variação elegível); fixo → variação elegível.
 */
export async function redigir(chave: ChaveTemplate, ctx: ContextoRedacao): Promise<string> {
  const t = ctx.cfg.templates[chave];
  const agora = ctx.agora ?? new Date();
  const valores = valoresDe(ctx.p, ctx.cfg, agora, ctx.valores);
  const modo = ctx.forcarModo ?? t.modo;
  if (modo === "diretriz") {
    const ia = await redigirComDiretriz(chave, t, ctx, valores);
    if (ia) return ia;
  }
  return textoFixo(t, ctx.p, valores);
}

// ─── Atalhos por momento da conversa ─────────────────────────────────────────

export const abordagemInicial = (ctx: ContextoRedacao) => redigir(decisorConfiavel(ctx.p) ? "abordagem_com_decisor" : "abordagem_sem_decisor", ctx);
export const mensagemRecepcao = (ctx: ContextoRedacao) => redigir("recepcao_sobre_o_que", ctx);
export const mensagemDecisor = (ctx: ContextoRedacao) => redigir("decisor_contexto", ctx);
export const respostaSaberMais = (ctx: ContextoRedacao) => redigir("saber_mais", ctx);
export const perguntaCidade = (ctx: ContextoRedacao) => redigir("interesse_cidade", ctx);
export const respostaERobo = (ctx: ContextoRedacao) => redigir("e_robo", ctx);
export const respostaPreco = (ctx: ContextoRedacao) => redigir("preco", ctx);
export const respostaJaTemAgencia = (ctx: ContextoRedacao) => redigir("ja_tem_agencia", ctx);
export const respostaNaoPerturbe = (ctx: ContextoRedacao) => redigir("nao_perturbe", ctx);
export const respostaSemInteresse = (ctx: ContextoRedacao) => redigir("sem_interesse", ctx);
export const respostaRetornarDepois = (ctx: ContextoRedacao, quandoTexto: string) => redigir("retornar_depois", { ...ctx, valores: { ...ctx.valores, quando: quandoTexto } });
export const mensagemRetorno = (ctx: ContextoRedacao, quandoTexto: string) => redigir("retorno", { ...ctx, valores: { ...ctx.valores, quando: quandoTexto } });
export const ofertaPeriodo = (ctx: ContextoRedacao) => redigir("oferta_periodo", ctx);
export const confirmacaoVisitaOk = (ctx: ContextoRedacao) => redigir("confirmacao_visita_ok", ctx);
export const lembrete24hOk = (ctx: ContextoRedacao) => redigir("lembrete_24h_ok", ctx);

/** Follow-ups 1/2/3: o 1 tem versão para o próprio decisor (quando já se falou com ele). */
export function followup(ctx: ContextoRedacao, n: number, comDecisor = false): Promise<string> {
  const chave: ChaveTemplate = n <= 1 ? (comDecisor ? "followup_1_decisor" : "followup_1") : n === 2 ? "followup_2" : "followup_3";
  return redigir(chave, ctx);
}

/** Convite: visita (≤ raio) ou Meet. Preferência, não obrigação. Presente só se disponível E reservado. */
export function convite(ctx: ContextoRedacao, forcar?: "visita" | "online"): { texto: Promise<string>; tipo: "visita" | "online" } {
  const { p, cfg } = ctx;
  const tipo = forcar ?? p.modalidade_preferida ?? ((p.distancia_km ?? Infinity) <= cfg.raio_visita_km ? "visita" : "online");
  const chave: ChaveTemplate = tipo === "online" ? "online" : cfg.gift_available && p.gift_reserved ? "visita_presente" : "visita";
  return { texto: redigir(chave, ctx), tipo };
}

export function ofertaHorarios(ctx: ContextoRedacao, opcoesIso: string[]): Promise<string> {
  const ext = opcoesIso.map(porExtensoSP);
  const valores = { ...ctx.valores, opcao1: ext[0] ?? null, opcao2: ext[1] ?? null, opcoes: ext.length <= 1 ? ext.join("") : `${ext.slice(0, -1).join(", ")} ou ${ext[ext.length - 1]}` };
  if (ext.length === 1) {
    const t = { ...ctx.cfg.templates.oferta_horarios, fixo: "Perfeito. Dei uma olhada aqui na agenda dele. Tenho {opcao1}. Fica bom para você?", variacoes: [] };
    return Promise.resolve(textoFixo(t, ctx.p, valoresDe(ctx.p, ctx.cfg, ctx.agora, valores)));
  }
  return redigir("oferta_horarios", { ...ctx, valores });
}

export function confirmacao(ctx: ContextoRedacao, r: { quandoIso: string; tipo: "visita" | "online"; link?: string | null }): Promise<string> {
  const valores = { ...ctx.valores, quando: porExtensoSP(r.quandoIso), data: dataCurtaSP(r.quandoIso), hora: horaCurtaSP(r.quandoIso), link: r.link ?? null };
  const chave: ChaveTemplate = r.tipo === "visita" ? "confirmacao_visita" : r.link ? "confirmacao_online" : "confirmacao_online_sem_link";
  return redigir(chave, { ...ctx, valores });
}

export const lembrete24h = (ctx: ContextoRedacao, reuniaoIso: string) => redigir("lembrete_24h", { ...ctx, valores: { ...ctx.valores, hora: horaCurtaSP(reuniaoIso), data: dataCurtaSP(reuniaoIso) } });
export const lembrete1h = (ctx: ContextoRedacao, reuniaoIso: string) => redigir("lembrete_1h", { ...ctx, valores: { ...ctx.valores, hora: horaCurtaSP(reuniaoIso), link: ctx.p.meet_url ? `\nDeixo o Meet aqui para facilitar: ${ctx.p.meet_url}` : "" } });

/** "em 15 de outubro" a partir da data resolvida. */
export function quandoPorExtenso(d: Date): string {
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}`;
}

/** Nutrição (§29): volta com o contexto da última conversa, nunca "só passando pra saber". */
export async function mensagemNutricao(ctx: ContextoRedacao): Promise<string | null> {
  const c = ctx.p.contexto_comercial ?? {};
  const contexto = c.motivo_retorno ?? c.proxima_abordagem ?? c.resumo ?? null;
  if (!contexto) return null; // sem contexto real não há retorno honesto — quem chama avisa o Roberto
  const quando = c.retornar_em ? quandoPorExtenso(new Date(c.retornar_em)) : "agora";
  return mensagemRetorno({ ...ctx, valores: { ...ctx.valores, contexto } }, quando);
}
