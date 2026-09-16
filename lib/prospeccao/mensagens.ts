// lib/prospeccao/mensagens.ts — o que o agente diz. Templates do treinamento (§11–§15, §28–§29)
// preenchidos com dados PESQUISADOS; a IA só entra para redigir dentro de uma moldura
// (nutrição com contexto e respostas a perguntas simples) e o resultado passa por um validador.
//
// O que nunca sai daqui: emoji, preço, desconto, garantia, "faturamento", promessa de resultado,
// e "presente" sem `gift_reserved` (§12 da V2).

import type { ProspectRow, IntentLida } from "./tipos";
import { preencher, type ProspectConfig } from "./config";
import { primeiroNome, nomeProprio } from "./normalizar";
import { porExtensoSP, horaCurtaSP } from "./tempo";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const PROIBIDO = /\b(desconto|promo[cç][aã]o|R\$\s?\d|por apenas|garanti(a|mos|do)|ROI|retorno garantido|faturamento|fatura|contrato|proposta comercial)\b/i;

/** Validador de QUALQUER texto que vá ao prospect. */
export function textoSeguro(t: string | null | undefined, max = 700): { ok: boolean; motivo?: string } {
  if (!t || t.trim().length < 2) return { ok: false, motivo: "texto vazio" };
  if (t.length > max) return { ok: false, motivo: `texto longo demais (${t.length} > ${max})` };
  if (/\{\w+\}/.test(t)) return { ok: false, motivo: "placeholder não preenchido" };
  if (EMOJI.test(t)) return { ok: false, motivo: "emoji" };
  if (PROIBIDO.test(t)) return { ok: false, motivo: "cita preço/desconto/garantia/faturamento/contrato" };
  return { ok: true };
}

const decisorOuGenerico = (p: ProspectRow) =>
  p.decisor_nome && (p.decisor_confianca ?? 0) >= 0.5 ? nomeProprio(p.decisor_nome) : null;

const nomeParaFalar = (p: ProspectRow) => primeiroNome(p.decisor_nome) ?? "";

export function abordagemInicial(p: ProspectRow, cfg: ProspectConfig): string {
  const dec = decisorOuGenerico(p);
  const t = dec ? cfg.templates.abordagem_com_decisor : cfg.templates.abordagem_sem_decisor;
  return preencher(t, { decisor: dec ? `o ${dec}` : "", empresa: p.nome, apresentacao: cfg.identidade.apresentacao });
}

export const mensagemRecepcao = (p: ProspectRow, cfg: ProspectConfig) =>
  preencher(cfg.templates.recepcao_sobre_o_que, { empresa: p.nome });

export function followup(p: ProspectRow, cfg: ProspectConfig, n: number): string {
  const dec = decisorOuGenerico(p);
  const t = n <= 1 ? cfg.templates.followup_1 : n === 2 ? cfg.templates.followup_2 : cfg.templates.followup_3;
  return preencher(t, { decisor: dec ? `o ${dec}` : "o responsável", empresa: p.nome });
}

/** Ao chegar no decisor: contexto + especialização + gancho pesquisado + convite. */
export function mensagemDecisor(p: ProspectRow, cfg: ProspectConfig): string {
  const gancho = p.diagnostico?.gancho?.trim();
  return preencher(cfg.templates.decisor_contexto, {
    decisor: nomeParaFalar(p) || "",
    gancho: gancho ? `${gancho.replace(/\.?$/, ".")} ` : "",
    empresa: p.nome,
  }).replace(/^Que bom falar com você, \./, "Que bom falar com você.");
}

/** Convite: visita (≤ raio) ou Meet. Preferência, não obrigação — o prospect pode pedir o outro. */
export function convite(p: ProspectRow, cfg: ProspectConfig, forcar?: "visita" | "online"): { texto: string; tipo: "visita" | "online" } {
  const tipo = forcar ?? p.modalidade_preferida ?? ((p.distancia_km ?? Infinity) <= cfg.raio_visita_km ? "visita" : "online");
  if (tipo === "visita") {
    const comPresente = cfg.gift_available && p.gift_reserved;
    return { texto: preencher(comPresente ? cfg.templates.visita_presente : cfg.templates.visita, { empresa: p.nome }), tipo };
  }
  return { texto: preencher(cfg.templates.online, { empresa: p.nome }), tipo };
}

export function ofertaHorarios(opcoesIso: string[], cfg: ProspectConfig): string {
  const ext = opcoesIso.map(porExtensoSP);
  const opcoes = ext.length <= 1 ? ext.join("") : `${ext.slice(0, -1).join(", ")} ou ${ext[ext.length - 1]}`;
  return preencher(cfg.templates.oferta_horarios, { opcoes });
}

export function confirmacao(p: ProspectRow, cfg: ProspectConfig, r: { quandoIso: string; tipo: "visita" | "online"; link?: string | null }): string {
  const nome = nomeParaFalar(p);
  const quando = porExtensoSP(r.quandoIso);
  if (r.tipo === "visita") {
    return preencher(cfg.templates.confirmacao_visita, {
      nome, quando, endereco: p.endereco ? `, em ${p.endereco}` : "",
    }).replace(/^Fechado, \./, "Fechado.");
  }
  const t = r.link ? cfg.templates.confirmacao_online : cfg.templates.confirmacao_online_sem_link;
  return preencher(t, { nome, quando, duracao: cfg.duracao_reuniao_min, link: r.link ?? "" }).replace(/^Fechado, \./, "Fechado.");
}

export const respostaERobo = (cfg: ProspectConfig) => preencher(cfg.templates.e_robo, {});
export const respostaPreco = (p: ProspectRow, cfg: ProspectConfig) => preencher(cfg.templates.preco, { empresa: p.nome });
export const respostaNaoPerturbe = (cfg: ProspectConfig) => preencher(cfg.templates.nao_perturbe, {});
export const respostaSemInteresse = (p: ProspectRow, cfg: ProspectConfig) =>
  preencher(cfg.templates.sem_interesse, { nome: nomeParaFalar(p) }).replace(/^Entendido, \./, "Entendido.");
export const respostaRetornarDepois = (cfg: ProspectConfig, quandoTexto: string) =>
  preencher(cfg.templates.retornar_depois, { quando: quandoTexto });

export const lembrete24h = (p: ProspectRow, cfg: ProspectConfig, reuniaoIso: string) =>
  preencher(cfg.templates.lembrete_24h, { nome: nomeParaFalar(p) || "tudo bem?", hora: horaCurtaSP(reuniaoIso) }).replace(/^Olá tudo bem\?,/, "Olá,");
export const lembrete1h = (p: ProspectRow, cfg: ProspectConfig, reuniaoIso: string) =>
  preencher(cfg.templates.lembrete_1h, {
    nome: nomeParaFalar(p) || "Olá", hora: horaCurtaSP(reuniaoIso),
    link: p.meet_url ? ` Segue o link: ${p.meet_url}` : "",
  });

/** Texto humano para "volto a falar com você …" a partir da data resolvida. */
export function quandoPorExtenso(d: Date): string {
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}`;
}

// ─── Redação com IA (moldura fechada) ─────────────────────────────────────────

const SISTEMA_REDATOR = `Você redige mensagens de WhatsApp em nome do assistente comercial da Lone Mídia (agência de marketing de Araruama/RJ, especializada em empresas da construção civil, que atende mais de 70 empresas do segmento). A conversa é com um empresário do ramo. O Roberto Lino é quem faz a reunião.

REGRAS ABSOLUTAS:
- Português do Brasil, tom humano e direto, 1 a 3 frases, no máximo 350 caracteres.
- Nunca use emoji.
- Nunca fale de preço, desconto, condição comercial, contrato, proposta, garantia, ROI ou resultado prometido.
- Nunca invente dado sobre a empresa: use SOMENTE os fatos listados em "FATOS VERIFICADOS". Se não houver fato útil, não cite nada específico.
- Nunca diga que o faturamento foi estimado nem mencione faturamento.
- Não se passe pelo Roberto; você é da equipe dele.
- O objetivo é sempre levar para uma conversa de 20 minutos com o Roberto (visita ou Google Meet), sem pressionar.
- Se a pergunta exigir informação que você não tem, responda que o Roberto explica na conversa.`;

interface RedacaoParams {
  p: ProspectRow;
  cfg: ProspectConfig;
  objetivo: string;
  historico: { autor: string; texto: string }[];
  ultimaMensagem?: string | null;
  origem: string;
}

function fatosVerificados(p: ProspectRow): string[] {
  const f: string[] = [];
  if (p.segmento) f.push(`segmento: ${p.segmento}`);
  if (p.cidade) f.push(`cidade: ${p.cidade}${p.uf ? `/${p.uf}` : ""}`);
  if (p.google_avaliacoes) f.push(`Google: ${p.google_nota ?? "?"} estrelas, ${p.google_avaliacoes} avaliações`);
  if (p.presenca?.instagram_followers) f.push(`Instagram @${p.instagram}: ${p.presenca.instagram_followers} seguidores`);
  if ((p.unidades ?? 0) >= 2) f.push(`${p.unidades} unidades`);
  if (p.diagnostico?.gancho) f.push(`gancho já validado: ${p.diagnostico.gancho}`);
  if (p.contexto_comercial?.resumo) f.push(`última conversa: ${p.contexto_comercial.resumo}`);
  if (p.contexto_comercial?.objecao) f.push(`objeção anterior: ${p.contexto_comercial.objecao}`);
  if (p.contexto_comercial?.proxima_abordagem) f.push(`próxima abordagem combinada: ${p.contexto_comercial.proxima_abordagem}`);
  return f;
}

/** Redige uma resposta curta. Devolve null se a IA não estiver configurada ou o texto não passar no validador. */
export async function redigirComIA(r: RedacaoParams): Promise<string | null> {
  const { chatJson, isOpenAIConfigured } = await import("@/lib/ai/openai");
  if (!isOpenAIConfigured()) return null;
  const hist = r.historico.slice(-8).map((h) => `${h.autor === "prospect" ? "PROSPECT" : "AGENTE"}: ${h.texto}`).join("\n");
  const user =
    `EMPRESA: ${r.p.nome}\nDECISOR: ${r.p.decisor_nome ? nomeProprio(r.p.decisor_nome) : "não identificado"}\n` +
    `FATOS VERIFICADOS:\n${fatosVerificados(r.p).map((f) => `- ${f}`).join("\n") || "- (nenhum)"}\n\n` +
    `HISTÓRICO:\n${hist || "(sem histórico)"}\n\n` +
    (r.ultimaMensagem ? `ÚLTIMA MENSAGEM DO PROSPECT: ${r.ultimaMensagem}\n\n` : "") +
    `OBJETIVO DESTA MENSAGEM: ${r.objetivo}\n\nEscreva só a mensagem.`;
  const res = await chatJson<{ mensagem: string }>({
    model: "gpt-4o-mini", system: SISTEMA_REDATOR, user, schemaName: "mensagem_sdr",
    schema: { type: "object", additionalProperties: false, properties: { mensagem: { type: "string" } }, required: ["mensagem"] },
    maxTokens: 300, temperature: 0.4, origem: r.origem,
  });
  const texto = res.ok ? res.data?.mensagem?.trim() : null;
  if (!texto) return null;
  const v = textoSeguro(texto, 450);
  if (!v.ok) { console.warn(`[prospeccao/mensagens] IA reprovada (${v.motivo}): ${texto.slice(0, 80)}`); return null; }
  return texto;
}

/** Nutrição (§29): volta com o contexto da última conversa, nunca "só passando pra saber". */
export async function mensagemNutricao(p: ProspectRow, cfg: ProspectConfig, historico: { autor: string; texto: string }[]): Promise<string | null> {
  const ctx = p.contexto_comercial ?? {};
  const objetivo = ctx.proxima_abordagem
    ? `Retomar a conversa: ${ctx.proxima_abordagem}. Pergunte sobre isso de forma genuína e, se couber, proponha a conversa com o Roberto.`
    : ctx.motivo_retorno
      ? `Retomar a conversa lembrando que o prospect pediu contato depois (${ctx.motivo_retorno}). Pergunte como ficou e proponha a conversa com o Roberto.`
      : "Retomar o contato de forma leve, citando o segmento da empresa, e propor a conversa com o Roberto.";
  const t = await redigirComIA({ p, cfg, objetivo, historico, origem: "prospeccao:nutricao" });
  if (t) return t;
  // Sem IA: template honesto, ainda com o contexto quando existe.
  const nome = nomeParaFalar(p);
  if (ctx.motivo_retorno) return `${nome ? `${nome}, ` : ""}quando conversamos você comentou: ${ctx.motivo_retorno}. Como ficou? Se fizer sentido, o Roberto pode passar aí ou fazer uma conversa rápida.`;
  return null;
}

/** Resposta a "quer saber mais" / pergunta simples dentro do playbook. */
export async function respostaSaberMais(p: ProspectRow, cfg: ProspectConfig, historico: { autor: string; texto: string }[], ultima: string, intent: IntentLida): Promise<string | null> {
  const objetivo = intent.intent === "QUER_SABER_MAIS"
    ? "Explicar em 2 frases o que a Lone faz (assessoria de marketing especializada em construção civil: conteúdo, anúncios e geração de demanda pelo WhatsApp) e convidar para a conversa de 20 minutos com o Roberto."
    : "Responder à pergunta do prospect de forma honesta e curta, sem inventar, e trazer de volta para a conversa com o Roberto.";
  return redigirComIA({ p, cfg, objetivo, historico, ultimaMensagem: ultima, origem: "prospeccao:resposta" });
}
