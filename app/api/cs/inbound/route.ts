export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { parseUpsert, isTrivial, isLoneTeam, ehNomeEquipeLone, type EvolutionUpsert } from "@/lib/cs/ingest";
import { classifyBlock, type ClassifierContext } from "@/lib/cs/classifier";
import { csSendGroupText, csSendGroupDocument, csFetchMediaBase64, csFindGroupByName } from "@/lib/cs/notify";
import { transcribeAudio } from "@/lib/cs/transcribe";
import { describeImage } from "@/lib/cs/vision";
import {
  ehOnboardingTrigger, parseOnboardingTrigger, onboardingWelcome, onboardingQuestion,
  onboardingDone, estruturarBriefing, ONBOARDING_TOTAL, type BriefingEstruturado,
} from "@/lib/cs/onboarding";
import { tipoToArea, resolveResponsavel } from "@/lib/cs/routing";
import { gerarBriefing, formatBriefing } from "@/lib/cs/briefing";
import { verificarDemanda, A2_TRUST_FROM } from "@/lib/cs/verifier";
import { interpretarResposta } from "@/lib/cs/interpreter";
import { detectarAprovacao } from "@/lib/cs/aprovacao";
import { sugerirResposta } from "@/lib/cs/resposta";
import { sincronizarBriefingAprendido } from "@/lib/cs/briefing-sync";
import { conversarComEquipe } from "@/lib/cs/conversa";
import { analisarSentimentoCliente } from "@/lib/cs/sentimento";
import { detectarEventoFuturo, pareceTerData } from "@/lib/cs/evento";
import { montarSnapshotCS } from "@/lib/cs/snapshot";
import { ehPerguntaProLone, ehVisaoGeralDemandas } from "@/lib/cs/intent";
import { gerarRoteiros, formatRoteiro, extrairPreferenciaRoteiro } from "@/lib/cs/criativo";
import { planejarPeriodo, executarPlano, datasDoPeriodo } from "@/lib/cs/motor";
import { calendarioPdfHtml } from "@/lib/cs/calendario-pdf";
import { roteirosPdfHtml, loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { spNow } from "@/lib/cs/vigilancia";
import { loadBriefingForClient, loadRoteiroPrefs, loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { ehComandoAusencia, parseAusencia } from "@/lib/cs/ausencia";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { criarCardDemanda, criarCardsPauta } from "@/lib/cs/card";
import { parsePautaItens, gerarPautaSemanal, datasProximaSemana, formatPauta } from "@/lib/cs/pauta";
import { proximasDatas, formatDataCurta, tagsDoNicho, dataEncaixa } from "@/lib/cs/datas";
import type { CsDemandType } from "@/lib/cs/taxonomy";

// Janela de coalescência (debounce): mensagens do mesmo autor+grupo dentro desta janela
// enriquecem a demanda pendente em vez de criar/postar uma nova (evita spam de rajada).
// 30 min (decisão S10: ≤30min + mesmo tópico = ajuste) — 90s perdia o caso real de cliente que
// manda o complemento minutos depois ("apagar o link" → 24 min → "eliminar a imagem").
const COALESCE_WINDOW_S = 1800;

// Webhook INBOUND do Agente CS — `messages.upsert` da Evolution (monitor[IA]). Suggest-only:
// A0 filtra → A1 classifica → A3 redige o briefing (regras do cliente) → posta a sugestão no
// grupo interno NOMEANDO o responsável (assigned_*). Card só nasce no "ok <código>".

const CLIENT_COLS =
  "id, name, nome_fantasia, nicho, campaign_briefing, fixed_briefing, assigned_social, assigned_designer, assigned_traffic, agente_ativo";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CS_INBOUND_SECRET;
  if (!secret) return false;
  // Query string aceita por compatibilidade (o webhook da Evolution está configurado com
  // ?secret=) — migrar pro header x-cs-secret e aí remover o fallback. Comparação constant-time.
  const got = req.headers.get("x-cs-secret") || req.nextUrl.searchParams.get("secret") || "";
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const splitEnv = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const teamJids = () => splitEnv(process.env.CS_LONE_TEAM_JIDS);
const pilotGroupAllowlist = () => splitEnv(process.env.CS_PILOT_GROUP_JIDS);
const internalGroupJid = () => process.env.CS_INTERNAL_GROUP_JID || null; // grupo de ARTES (produção/cobranças/lembretes)
// Grupo de TRÁFEGO (anúncios/estratégia — onde está o Julio). Se não configurado, cai no de artes.
const trafficGroupJid = () => process.env.CS_TRAFFIC_GROUP_JID || internalGroupJid();
// Grupos INTERNOS de comando (artes + tráfego): onde o time responde ok/não/ajustar e dá comandos.
// Ambos são "internos" (não classificam demanda de cliente).
const isInternalCmdGroup = (jid: string) => jid === internalGroupJid() || jid === trafficGroupJid();
// Grupo EQUIPE: papo descontraído (a Lone é "parte do time" — bom dia, piada, técnica quando precisa).
// Conversa sim; comandos de demanda (ok/não) não. Não classifica demanda de cliente.
const teamGroupJid = () => process.env.CS_TEAM_GROUP_JID || null;
const isTeamGroup = (jid: string) => !!teamGroupJid() && jid === teamGroupJid();
// Onde a Lone NÃO trata mensagem como pedido de cliente (grupos internos + equipe).
const isNaoClassifica = (jid: string) => isInternalCmdGroup(jid) || isTeamGroup(jid);
// Grupos SANDBOX (fase de teste): ali o agente trata mensagem da EQUIPE como se fosse pedido de
// cliente (ignora o filtro de equipe) e CLASSIFICA demanda mesmo sendo o grupo interno — pra o time
// testar o fluxo inteiro (inclusive imagem) num grupo só. Vazio em produção real.
const testGroupJids = () => splitEnv(process.env.CS_TEST_GROUP_JIDS);
const ehSandbox = (jid: string) => testGroupJids().includes(jid);

type ClientRow = Record<string, unknown>;
const nomeOf = (c?: ClientRow | null) =>
  ((c?.nome_fantasia as string) || (c?.name as string) || "Cliente");

// Briefing do cliente pros prompts: FIXO (marca — regras duráveis) + CAMPANHA (o mês). O `||`
// antigo descartava o fixed_briefing inteiro sempre que havia campaign_briefing — A1/A3 perdiam
// "nunca usar vermelho / tom formal" etc. Slice defensivo por bloco (tokens do mini).
const briefingCompleto = (c?: ClientRow | null): string | undefined => {
  const fixo = ((c?.fixed_briefing as string) || "").trim();
  const camp = ((c?.campaign_briefing as string) || "").trim();
  return [
    fixo && `FIXO (marca, sempre vale): ${fixo.slice(0, 1500)}`,
    camp && `CAMPANHA ATUAL: ${camp.slice(0, 1500)}`,
  ].filter(Boolean).join("\n\n") || undefined;
};

// T7: variações pra confirmação/descarte não parecerem script. T9: descarte admite aprendizado.
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
function ackCriado(resumo: string, resp?: string | null): string {
  return pick([
    `Fechou! Criei o card *${resumo}*${resp ? ` pro ${resp}` : ""}.`,
    `Show, *${resumo}* já tá no Kanban${resp ? ` com o ${resp}` : ""}.`,
    `Combinado — mandei *${resumo}* pra produção.`,
    `Beleza, *${resumo}* criado${resp ? ` pro ${resp}` : ""}. Tamo junto.`,
    `Pronto, subi o card *${resumo}*.`,
  ]);
}
function ackDescartado(resumo: string): string {
  return pick([
    `Beleza, tirei *${resumo}* da fila — você cuida então. Anotei pra não confundir esse tipo de novo.`,
    `Tranquilo, deixo *${resumo}* de fora. Vou ficar esperto pra não te chamar à toa.`,
    `Fechou, descartei *${resumo}*. Valeu o toque — assim eu aprendo.`,
  ]);
}

// Sem código nas mensagens: a equipe RESPONDE (reply) a sugestão com "ok"/"não". Código vira
// opcional só por legado/hábito.
function parseDecision(text: string): { acao: "confirmar" | "descartar"; codigo?: string } | null {
  // Tolera pontuação/variantes ("Ok!", "okay", "sim.", "confirmado"). Código é hex de 4 chars
  // (randomBytes(2)) — antes [a-z0-9]{3,8} pegava "ok pode" como código "pode" (nunca casava).
  const m = text.trim().match(/^(ok|okay|sim|confirmar|confirma|confirmado|nao|não|descartar|descarta|descartado)(?:\s+([a-f0-9]{4}))?[\s!.,;…]*$/i);
  if (!m) return null;
  const acao = /^(ok|okay|sim|confirm)/i.test(m[1]) ? "confirmar" : "descartar";
  return { acao, codigo: m[2]?.toLowerCase() };
}

// "ajustar <o que mudar>" — refina o briefing antes de criar o card (anexa VERBATIM, não re-gera).
function parseAjuste(text: string): { instrucao: string } | null {
  const m = text.trim().match(/^(ajustar|ajusta|ajuste)\s+([\s\S]+)$/i);
  if (!m) return null;
  return { instrucao: m[2].trim() };
}

// Heurística: a mensagem parece um PEDIDO NOVO (não uma resposta à demanda pendente)? Se sim e
// não for reply, não chama o interpretador — manda direto pro fluxo de classificação (nova demanda).
function pareceNovoPedido(text: string): boolean {
  const t = text.toLowerCase();
  return /\bcliente\b.*\b(pediu|solicit|quer|querem|precisa|mandou|pedindo)\b/.test(t)
    || /^\s*(preciso|precisamos|quero|queremos|faz|fazer|cria|criar|monta|montar|manda|fa[çc]a)\b.*\b(arte|post|an[úu]ncio|story|stories|panfleto|banner|card|pe[çc]a|cria[çc][aã]o|flyer|reels|v[íi]deo)/.test(t)
    || /\b(nova arte|outra arte|novo pedido|nova demanda|outra demanda|nova pe[çc]a)\b/.test(t);
}

// ── Agente "Lone": pedido de ROTEIRO no grupo. Dispara só quando CHAMAM o Lone + falam de roteiro
// (evita falso-positivo, já que "Lone" aparece muito em conversa). Ex.: "Lone, faz um roteiro pro Império".
function ehPedidoRoteiro(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /\b(roteiro|roteiros|an[úu]ncio|anuncio|criativo|script|vsl)\b/.test(t);
}

// "Lone, monta/faz o calendário [mensal/semanal] do X" → gera o calendário estratégico e manda o PDF.
function ehPedidoCalendario(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /\b(calend[áa]rio|planejamento)\b/.test(t) && /\b(monta|montar|faz|fazer|gera|gerar|cria|criar|prepara|preparar|manda|mandar)\b/.test(t);
}
function modoCalendario(text: string): "semana" | "mes" {
  return /\b(m[êe]s|mensal|do m[êe]s|pr[óo]ximo m[êe]s)\b/.test(text.toLowerCase()) ? "mes" : "semana";
}

// Follow-up de ajuste num roteiro recém-enviado ("ajusta o gancho", "mais curto", "refaz o CTA").
// NÃO exige "lone" (a equipe responde direto ao "me diz o que ajustar"). Só vale se houver roteiro recente.
function ehAjusteRoteiro(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(refaz|refazer|refa[çc]a|ajusta|ajustar|ajuste|muda|mudar|troca|trocar|encurta|encurtar|melhora|melhorar|reescreve|reescrever)\b/.test(t)
    || /\b(mais|menos)\s+(curto|longo|forte|direto|formal|informal|leve|emocional|agressivo)\b/.test(t)
    || /\boutro\s+(gancho|cta|[âa]ngulo|angulo|produto|tom)\b/.test(t);
}

const normNome = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Palavras genéricas do nome que não identificam o cliente (não casar só por elas).
const STOP_NOME = new Set([
  "solar", "energia", "material", "materiais", "construcao", "construcoes", "pisos", "piso",
  "moveis", "loja", "lojas", "ltda", "comercio", "distribuidora", "grupo", "store", "shop",
  "oficial", "centro", "casa", "ribeiro", "bazar",
  // Palavras GENÉRICAS do dia a dia da agência que também aparecem em NOME de cliente
  // (ex.: "Farmácia - Arte em Manipulação") — não podem identificar cliente, senão qualquer
  // pedido com "arte"/"post"/"vídeo" vaza pro cliente errado. Erro crítico observado 08/jul.
  "arte", "artes", "post", "posts", "video", "videos", "design", "studio", "estudio",
  "midia", "social", "marketing", "digital", "agencia", "cartaz", "banner", "promocao",
  "promocoes", "criativo", "conteudo", "reels", "stories", "story", "feed", "anuncio",
  "anuncios", "panfleto", "flyer",
]);

// Pergunta de STATUS ao Lone ("Lone, sabe me dizer se a demanda do Léo Carros foi feita?").
// Sem isso o agente ficava MUDO: a pergunta não casa com nenhum comando e caía no skip do
// grupo interno — a pessoa mandava "?" e nada. Resposta determinística, sem IA.
function ehPerguntaStatus(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /\b(status|andamento|cad[êe]|foi feit[ao]|j[áa] foi|j[áa] fez|j[áa] saiu|j[áa] criou|j[áa] criaram|como (t[áa]|est[áa])|sabe (me )?dizer|ficou pront[oa]|t[áa] pront[oa]|entregue|entregaram|entregou)\b/.test(t);
}

const STATUS_CARD_LABEL: Record<string, string> = {
  ideas: "Ideias (fila)", script: "Roteiro", in_production: "Produção", blocked: "Travado",
  approval: "Aprovação Social Media", client_approval: "Aprovação do cliente", scheduled: "Agendado", published: "Publicado",
};

// Comando de MOVER um card ("Lone, marca a arte do X como pronta / manda pro social / põe em
// produção / agenda"). Retorna o status-alvo + se marca a ENTREGA do designer. null = não é mover.
// Exige verbo + alvo (card/arte) + status claro — sem status, NÃO age (evita mexer no card errado).
function ehComandoMoverCard(text: string): { status: string; delivered: boolean } | null {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return null;
  const verbo = /\b(marca|marque|move|mover|manda|mande|passa|passe|p[õo]e|poe|coloca|coloque|bota|finaliza|conclui)\b/.test(t);
  const alvo = /\b(card|arte|post|criativo|pe[çc]a|demanda)\b/.test(t);
  if (!verbo || !alvo) return null;
  if (/\bpront[oa]|entregue|finaliz|termin|feit[oa]|conclu[ií]/.test(t)) return { status: "approval", delivered: true };
  if (/\bprodu[çc][ãa]o|produzir|produzindo/.test(t)) return { status: "in_production", delivered: false };
  if (/\bsocial|aprova[çc][ãa]o|revis/.test(t)) return { status: "approval", delivered: false };
  if (/\bagend/.test(t)) return { status: "scheduled", delivered: false };
  if (/\bpublic|postad|postou|postar/.test(t)) return { status: "published", delivered: false };
  return null;
}

// Raio-X do cliente ("Lone, me dá um raio-x do Contele" / "resumo do X" / "panorama da X").
// Resumo completo do cliente (demandas, produção, entregas, reclamação, atividade). Determinístico.
function ehPedidoRaioX(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /\b(raio-?x|panorama|resum[oã]|me (fala|conta|resume) (sobre|do|da)|como (anda|vai|est[áa] indo))\b/.test(t);
}

// A equipe está FALANDO com a Lone? (menciona "lone" e não é só o nome "Lone Mídia"). Fallback
// conversacional: se ninguém dos comandos casou, ela responde no tom da casa em vez de ficar muda.
function ehFalaComAgente(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /\blone\b/.test(t) && !/\blone\s*m[íi]dia\b/.test(t);
}

// Continuidade de conversa: quem a Lone respondeu e quando (memória do PROCESSO — o app é 1 container
// long-running; some no deploy, ok). Numa conversa em andamento, o follow-up ("e do Pedro?") é
// respondido mesmo sem "Lone" nem palavra operacional. Janela curta pra não virar tagarela.
const conversaAtiva = new Map<string, number>(); // `${groupJid}|${authorJid}` → epoch ms do último papo
const JANELA_CONVERSA_MS = 5 * 60 * 1000;
const chaveConversa = (g: string, a?: string | null) => `${g}|${a || ""}`;
function emConversa(groupJid: string, authorJid?: string | null): boolean {
  const t = conversaAtiva.get(chaveConversa(groupJid, authorJid));
  return !!t && Date.now() - t < JANELA_CONVERSA_MS;
}

// ── MEMÓRIA CURTA + ANTI-FRAGMENTAÇÃO do papo (processo Node persistente; some no deploy, ok) ──
// O container roda um processo só, então Map em memória sobrevive entre requests. A resposta sai
// pela Evolution (não pela resposta HTTP), então dá pra DEBOUNCE: espera a rajada de balões parar
// e responde UMA vez, com as últimas mensagens do grupo como memória (não repete, não perde o fio).
type HistItem = { quem: string; texto: string; at: number };
const histGrupo = new Map<string, HistItem[]>(); // groupJid → últimas mensagens (equipe + Lone)
const HIST_MAX = 12;
function pushHist(jid: string, quem: string, texto: string) {
  const arr = histGrupo.get(jid) ?? [];
  arr.push({ quem, texto: texto.slice(0, 300), at: Date.now() });
  while (arr.length > HIST_MAX) arr.shift();
  histGrupo.set(jid, arr);
}
function histTexto(jid: string): string {
  const arr = histGrupo.get(jid) ?? [];
  return arr.slice(-6).map((m) => `${m.quem}: ${m.texto}`).join("\n");
}
// Debounce por (grupo+autor): acumula os balões picados e só processa quando o autor para de digitar.
type PendPapo = { timer: ReturnType<typeof setTimeout>; partes: string[] };
const pendPapo = new Map<string, PendPapo>();
const PAPO_DEBOUNCE_MS = 2600;

// ── TERMÔMETRO DE SATISFAÇÃO ── lê a mensagem do CLIENTE e, se houver insatisfação/risco de churn,
// avisa o time (grupo Equipe) pra agir cedo. Cooldown por cliente pra não spammar. Fire-and-forget.
const satisfacaoCooldown = new Map<string, number>(); // clientId → epoch ms do último alerta
const SATISFACAO_COOLDOWN_MS = 6 * 60 * 60 * 1000;     // 6h por cliente
async function checarSatisfacao(
  client: { id: string; name?: string | null; nome_fantasia?: string | null; assigned_social?: string | null },
  mensagem: string,
) {
  try {
    if (!isOpenAIConfigured() || !mensagem || mensagem.trim().length < 6) return;
    const last = satisfacaoCooldown.get(client.id);
    if (last && Date.now() - last < SATISFACAO_COOLDOWN_MS) return; // já alertei esse cliente há pouco
    const r = await analisarSentimentoCliente(mensagem);
    if (!r.ok || !r.data) return;
    const s = r.data;
    const alerta = s.churn || (s.sentimento === "negativo" && (s.risco === "medio" || s.risco === "alto"));
    if (!alerta) return;
    satisfacaoCooldown.set(client.id, Date.now());
    const nome = client.nome_fantasia || client.name || "Cliente";
    const social = client.assigned_social ? `@${String(client.assigned_social).split(" ")[0]} ` : "";
    const nivel = s.churn ? "🚨 *Risco de o cliente sair*" : s.risco === "alto" ? "🔴 *Cliente insatisfeito*" : "🟠 *Atenção com o cliente*";
    const dest = teamGroupJid() || internalGroupJid();
    if (dest) {
      const aviso = `${nivel} — *${nome}*\n${social}O cliente falou algo que parece insatisfação:\n"${mensagem.slice(0, 180)}"\n\n_Por quê: ${s.motivo}_\nDá uma olhada no grupo dele antes que aperte. 🙏`;
      await csSendGroupText(dest, aviso).catch(() => {});
    }
    await supabaseAdmin.from("notifications").insert({
      type: "content",
      title: `${s.churn ? "🚨 Risco de churn" : "⚠️ Cliente pode estar insatisfeito"} — ${nome}`,
      body: `"${mensagem.slice(0, 140)}" — ${s.motivo}`,
      client_id: client.id,
    }).then(() => {}, () => {});
    console.log(`[CS/inbound] termômetro: ${nome} sentimento=${s.sentimento} risco=${s.risco} churn=${s.churn}`);
  } catch (e) {
    console.error("[CS/inbound] checarSatisfacao erro:", e);
  }
}

// Auto-marca uma TAREFA como feita quando alguém avisa no grupo que concluiu ("já fiz a arte da
// Imperio"). Casa a referência com uma tarefa ABERTA — prioriza a do próprio autor e/ou o cliente
// citado. Só marca com âncora forte (evita marcar a errada). Devolve o título marcado ou null.
async function marcarTarefaFeita(autor: string | null | undefined, ref: string): Promise<string | null> {
  try {
    const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const r = norm(ref);
    if (r.length < 3) return null;
    const { data } = await supabaseAdmin.from("tasks")
      .select("id, title, client_name, assigned_to").neq("status", "done").limit(200);
    if (!data || data.length === 0) return null;
    const autorPrimeiro = norm(autor || "").split(" ")[0];
    const refWords = new Set(r.split(/\W+/).filter((w) => w.length >= 4));
    let best: { id: string; title: string; score: number } | null = null;
    for (const t of data) {
      const cliN = norm((t.client_name as string) || "");
      const mine = !!autorPrimeiro && norm(t.assigned_to as string).includes(autorPrimeiro);
      const cliInRef = cliN.length >= 3 && r.includes(cliN);
      let overlap = 0;
      for (const w of norm(t.title as string).split(/\W+/)) if (w.length >= 4 && refWords.has(w)) overlap++;
      const forte = cliInRef || (mine && overlap >= 1) || overlap >= 2;
      const score = overlap + (cliInRef ? 3 : 0) + (mine ? 1 : 0);
      if (forte && (!best || score > best.score)) best = { id: t.id as string, title: t.title as string, score };
    }
    if (!best) return null;
    await supabaseAdmin.from("tasks").update({ status: "done" }).eq("id", best.id);
    console.log(`[CS/inbound] tarefa marcada feita via chat: "${best.title}"`);
    return best.title;
  } catch (e) {
    console.error("[CS/inbound] marcarTarefaFeita erro:", e);
    return null;
  }
}

// Time postou uma IMAGEM no grupo do cliente (provável arte entregue/postada fora do botão) → avança
// o card do cliente automaticamente. CONSERVADOR: só age se houver EXATAMENTE UM card candidato (arte
// já entregue pelo designer, ainda parado em produção/aprovação) — assim nunca marca o card errado.
async function autoAvancarPorArteNoGrupo(groupJid: string, autorNome?: string | null) {
  try {
    const { data: cli } = await supabaseAdmin
      .from("clients").select("id, name, nome_fantasia").eq("whatsapp_group_jid", groupJid).maybeSingle();
    if (!cli) return;
    const { data: cards } = await supabaseAdmin
      .from("content_cards").select("id, title, status")
      .eq("client_id", cli.id as string)
      .not("designer_delivered_at", "is", null)
      .in("status", ["in_production", "approval"])
      .is("archived_at", null);
    if (!cards || cards.length !== 1) return; // 0 ou vários → não arrisca marcar o errado
    const card = cards[0];
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("content_cards").update({
      status: "client_approval",
      social_confirmed_at: nowIso,
      social_confirmed_by: autorNome || "CS",
      status_changed_at: nowIso,
    }).eq("id", card.id as string);
    await supabaseAdmin.from("card_comments").insert({
      card_id: card.id as string, author: "🤖 CS", role: "system",
      text: `➡️ Vi a arte no grupo do cliente → movi *${card.title as string}* pra *Aprovação Cliente* automaticamente. Se não era essa, é só voltar o status.`,
    }).then(() => {}, () => {});
    console.log(`[CS/inbound] auto-avancei card por arte no grupo do cliente: "${card.title}"`);
  } catch (e) {
    console.error("[CS/inbound] autoAvancarPorArteNoGrupo erro:", e);
  }
}

// Processa o papo (após o debounce): responde UMA vez, com memória curta do grupo. Roda fora do
// ciclo do webhook (o reply sai pela Evolution), então nunca segura a resposta HTTP.
async function responderPapo(p: {
  groupJid: string; authorJid?: string | null; authorName?: string | null;
  quotedMsgId?: string | null; texto: string; chamadoDireto: boolean; descontraido: boolean;
}) {
  try {
    const historico = histTexto(p.groupJid);       // memória = mensagens ANTERIORES
    pushHist(p.groupJid, p.authorName || "Alguém", p.texto);
    const snap = await montarSnapshotCS();
    const conv = await conversarComEquipe({
      mensagem: p.texto, autor: p.authorName || "", contexto: snap.texto,
      descontraido: p.descontraido, historico: historico || undefined,
    });
    // Avisaram que uma tarefa foi feita? Marca no sistema (fecha o loop da cobrança).
    let marcada: string | null = null;
    if (conv.ok && conv.data?.tarefa_feita) marcada = await marcarTarefaFeita(p.authorName, conv.data.tarefa_feita);
    if (conv.ok && conv.data?.ignorar === true && !p.chamadoDireto && !marcada) {
      console.log(`[CS/inbound] conversa ignorada (não era pra Lone): "${p.texto.slice(0, 40)}"`);
      return;
    }
    const resp0 = (conv.ok && conv.data?.resposta) ? conv.data.resposta : "Opa! Tô por aqui 👋 me chama que eu ajudo.";
    // Se marquei a tarefa e a resposta não deixou isso claro, confirmo.
    const resp = marcada && !/marqu|marcad|feita|conclu/i.test(resp0)
      ? `${resp0}\n\n✅ Marquei "${marcada}" como feita no sistema.` : resp0;
    await csSendGroupText(p.groupJid, resp, p.quotedMsgId || undefined);
    pushHist(p.groupJid, "Você (Lone)", resp);      // lembra o que ELA disse → não repete
    conversaAtiva.set(chaveConversa(p.groupJid, p.authorJid), Date.now());
    const ensino = conv.ok ? conv.data?.ensino : null;
    if (ensino?.cliente && ensino?.regra) {
      const alvo = await resolveClientePorNome(ensino.cliente);
      if (alvo) {
        const textoRegra = ensino.regra.trim().slice(0, 200);
        const { data: ex } = await supabaseAdmin.from("cs_client_rules")
          .select("id").eq("client_id", alvo.id).eq("texto", textoRegra).eq("ativo", true).limit(1);
        if (!ex || ex.length === 0) {
          await supabaseAdmin.from("cs_client_rules").insert({
            client_id: alvo.id, texto: textoRegra, escopo: "sempre", origem: "aprendido",
            source_message: p.texto, author: p.authorName || p.authorJid,
            expires_at: ehFatoTemporario(textoRegra) ? new Date(Date.now() + 14 * 86400000).toISOString() : null,
          });
          await sincronizarBriefingAprendido(alvo.id);
          console.log(`[CS/inbound] aprendi conversando (${alvo.nome}): ${textoRegra}`);
        }
      }
    }
    console.log(`[CS/inbound] conversa (debounced) com ${p.authorName || "equipe"}: "${p.texto.slice(0, 50)}"`);
  } catch (e) {
    console.error("[CS/inbound] responderPapo erro:", e);
  }
}

// Radar de datas ("Lone, que datas vêm aí?" / "datas comemorativas do mês"). Determinístico.
function ehPerguntaDatas(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /(datas? comemorativ|que datas|datas (da semana|do m[eê]s|chegando|vindo|v[eê]m)|pr[oó]ximas? datas|calend[aá]rio de datas|alguma data (boa|chegando|vindo|a[ií]))/.test(t);
}

// Ideias de post ("Lone, me dá ideias de post pro Contele" / "o que postar na Farmácia?").
function ehPedidoIdeias(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /(ideias? (de|pra|para) (post|conte[uú]do)|me d[aá] (uma[s]? )?ideia|inspira[çc][aã]o|sugest([aã]o|[oõ]es) de (post|conte[uú]do)|o que postar)/.test(t);
}

// Equipe pedindo pra CRIAR uma demanda ("Lone, cria uma demanda na [cliente] sobre X").
// Roda DEPOIS do roteiro (roteiro tem precedência em "anúncio/criativo").
function ehPedidoCriarDemanda(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  const acao = /\b(cria|criar|crie|cadastra|cadastrar|abre|abrir|abra|monta|montar|adiciona|adicionar|coloca|colocar|registra|registrar|lan[çc]a|lan[çc]ar)\b/.test(t);
  const obj = /\b(demanda|demandas|card|cards|pedido|tarefa|pe[çc]a|cria[çc][aã]o|arte|post|story|stories|panfleto|banner|reels|v[íi]deo)\b/.test(t);
  return acao && obj;
}
// Assunto da demanda = o que vem depois de "sobre" (ou a mensagem toda como contexto).
function extrairAssunto(text: string): string {
  const m = text.match(/\bsobre\s+(.+)$/i);
  return (m?.[1] || text).trim().slice(0, 140);
}

// Preposições/artigos que NÃO distinguem cliente (evita "em"/"de" casarem palavra do nome).
const PREP_NOME = new Set(["em", "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "no", "na", "com", "para", "pra", "pro", "por"]);

// Acha o cliente citado na mensagem por PALAVRA INTEIRA (não substring — "vida" não casa
// "atividade", "wt" não casa no meio de outra palavra). Pontua por nº de palavras distintivas do
// nome que aparecem como PALAVRA no texto (tolerando singular/plural). Retorna null se NENHUM casar
// OU se houver EMPATE no topo entre 2 clientes (ambíguo → o chamador pergunta "de qual cliente?",
// melhor que chutar o errado — era a raiz do vazamento WT→Farmácia).
async function resolveClientePorNome(text: string): Promise<{ id: string; nome: string; nicho?: string } | null> {
  const { data: clients } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, nicho, industry").or("active.is.null,active.eq.true");
  const palavras = new Set(normNome(text).split(/\s+/).filter(Boolean));
  const casa = (w: string) =>
    palavras.has(w) || (w.endsWith("s") && palavras.has(w.slice(0, -1))) || palavras.has(w + "s");
  const scored: { id: string; nome: string; nicho?: string; score: number; chars: number }[] = [];
  for (const c of clients ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "";
    const words = normNome(nome).split(/\s+/).filter((w) => w.length >= 2 && !STOP_NOME.has(w) && !PREP_NOME.has(w));
    let score = 0, chars = 0;
    for (const w of words) if (casa(w)) { score++; chars += w.length; }
    if (score > 0) scored.push({ id: c.id as string, nome, nicho: (c.nicho as string) || (c.industry as string) || undefined, score, chars });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score || b.chars - a.chars);
  // Empate no topo (mesmo nº de palavras) → ambíguo: pergunta em vez de arriscar o cliente errado.
  if (scored.length > 1 && scored[1].score === scored[0].score) return null;
  const top = scored[0];
  return { id: top.id, nome: top.nome, nicho: top.nicho };
}

// Monta a demanda a partir do PEDIDO da equipe (texto livre) + cliente já resolvido: roda o A3,
// insere a demanda pendente e posta o "NOVO PEDIDO" no grupo. Reusado pelo comando direto e pela
// conclusão do "aguardando_cliente" (quando o time responde o nome depois). Retorna null se falhou.
async function montarDemandaComando(
  c: Record<string, unknown>, requestText: string, quem: string, messageId: string | undefined, groupJid: string,
): Promise<{ titulo: string; cliente: string } | null> {
  const clienteNome = nomeOf(c);
  const clienteBriefing = await loadBriefingCombinado(c.id as string, briefingCompleto(c));
  const csRules = await fetchClientCsRules(c.id as string);
  const regrasFmt = csRules.filter((rr) => rr.escopo !== "roteiro").map((rr) => `${rr.texto} (${rr.escopo})`);
  const assunto = extrairAssunto(requestText);
  const tipo: CsDemandType = "arte_nova";
  const a3 = await gerarBriefing({
    clienteNome, clienteNicho: c.nicho as string, clienteBriefing, regras: regrasFmt,
    tipo, urgencia: "media", resumo: assunto, mensagemOriginal: requestText,
  });
  const briefingTxt = a3.ok && a3.data ? formatBriefing(a3.data) : `${assunto}\nPedido da equipe: "${requestText}"`;
  const titulo = a3.ok && a3.data ? a3.data.titulo : assunto;
  const responsavel = resolveResponsavel(tipoToArea(tipo), {
    assigned_social: c.assigned_social as string, assigned_designer: c.assigned_designer as string, assigned_traffic: c.assigned_traffic as string,
  });
  const codigo = randomBytes(2).toString("hex");
  const { data: novaDem, error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
    codigo, group_jid: groupJid, client_id: c.id as string, cliente_nome: clienteNome,
    author: quem, message_id: messageId, message_text: requestText,
    tipo, urgencia: "media", confianca: 1, resumo: titulo, briefing: briefingTxt, responsavel, status: "pendente",
  }).select("id").single();
  if (insErr || !novaDem) {
    console.error("[CS/inbound] montarDemandaComando:", insErr?.message);
    await csSendGroupText(groupJid, `Eita, não consegui montar a demanda do *${clienteNome}* agora 😕 tenta de novo?`);
    return null;
  }
  const a3d = a3.ok ? a3.data : null;
  const txt = `🆕 *NOVO PEDIDO — ${clienteNome}*\n👤 ${responsavel}${quem ? ` · pedido por ${quem}` : ""}\n\n📩 Pedido:\n*${titulo}*\n\n${a3d ? `📋 ${a3d.briefing.trim()}\n_${a3d.formato_sugerido} · prazo ${a3d.prazo_sugerido}_` : `📋 _"${requestText}"_`}\n\n👉 Responde aqui: *ok* (crio o card) · *não* (deixa pra lá) · *ajustar*`;
  const rsug = await csSendGroupText(groupJid, txt);
  if (rsug.ok && rsug.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: rsug.id }).eq("id", novaDem.id);
  console.log(`[CS/inbound] demanda montada → ${clienteNome}: ${titulo} (${codigo})`);
  return { titulo, cliente: clienteNome };
}

// Acha a demanda alvo da resposta — SEM chute: 1) reply na sugestão (se já foi decidida, sinaliza
// pro handler AVISAR em vez de agir — reply que não casa com sugestão nenhuma é conversa, não
// comando); 2) código (legado); 3) sem reply/código, só quando existe EXATAMENTE 1 pendente
// recente (<2h). O fallback antigo ("última pendente global") confirmava a demanda ERRADA quando
// havia 2+ pendentes ou no retry do webhook — card criado que ninguém aprovou.
interface AlvoDemanda {
  demanda: Record<string, unknown> | null;
  jaDecidida?: Record<string, unknown> | null;
  ambiguas?: number;
  candidatas?: Record<string, unknown>[];
}
async function acharDemanda(quotedMsgId?: string, codigo?: string): Promise<AlvoDemanda> {
  if (quotedMsgId) {
    const { data } = await supabaseAdmin.from("cs_demandas").select("*")
      .eq("msg_id_sugestao", quotedMsgId).eq("status", "pendente").maybeSingle();
    if (data) return { demanda: data };
    const { data: dec } = await supabaseAdmin.from("cs_demandas").select("*")
      .eq("msg_id_sugestao", quotedMsgId).neq("status", "pendente")
      .order("decided_at", { ascending: false }).limit(1).maybeSingle();
    return { demanda: null, jaDecidida: dec ?? null };
  }
  if (codigo) {
    const { data } = await supabaseAdmin.from("cs_demandas").select("*").eq("codigo", codigo).eq("status", "pendente").maybeSingle();
    return { demanda: data ?? null };
  }
  const desde = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: pend } = await supabaseAdmin.from("cs_demandas").select("*")
    .eq("status", "pendente").gte("created_at", desde)
    .order("created_at", { ascending: false }).limit(5);
  if (pend && pend.length === 1) return { demanda: pend[0] };
  return { demanda: null, ambiguas: pend?.length ?? 0, candidatas: pend ?? [] };
}

// Reencontra a demanda PENDENTE citada num reply pelo TEXTO citado — usado quando o id do quote NÃO
// bate com o msg_id_sugestao (o COMPLEMENTO reposta e sobrescreve o id, ou o formato do id difere
// entre envio e reply). Corrige o "dei ok num reply e ele ignorou". O texto citado tem
// "NOVO PEDIDO — {cliente}" / "COMPLEMENTO — {cliente}" + o resumo.
async function acharDemandaPorTexto(quotedText: string): Promise<Record<string, unknown> | null> {
  const q = quotedText.toLowerCase();
  const { data: pend } = await supabaseAdmin.from("cs_demandas").select("*")
    .eq("status", "pendente").order("created_at", { ascending: false }).limit(40);
  if (!pend?.length) return null;
  // 1) o RESUMO da demanda aparece no texto citado (sinal forte e específico).
  const porResumo = pend.filter((d) => {
    const r = ((d.resumo as string) || "").trim().toLowerCase();
    return r.length >= 6 && q.includes(r);
  });
  if (porResumo.length) return porResumo[0];
  // 2) senão, o cliente_nome aparece E é o ÚNICO pendente desse cliente (evita ambiguidade).
  const porCliente = pend.filter((d) => {
    const cn = ((d.cliente_nome as string) || "").trim().toLowerCase();
    return cn.length >= 4 && q.includes(cn);
  });
  if (porCliente.length === 1) return porCliente[0];
  return null;
}

// ─── Desambiguação humana: quando há VÁRIOS pedidos abertos, em vez de "responde na mensagem"
// (seco/robótico), o agente LISTA por nome e aceita número / nome / "todas". ───
function listarPendentes(cands: Record<string, unknown>[]): string {
  const linhas = cands.slice(0, 5)
    .map((d, i) => `*${i + 1})* ${(d.resumo as string) || (d.message_text as string) || "pedido"} _(${(d.cliente_nome as string) || "cliente"})_`)
    .join("\n");
  return `Tenho *${cands.length}* pedidos abertos aqui:\n${linhas}\n\nResponde o *número*, o *nome*, ou *todas* — que eu já crio o card certinho. 😉`;
}

// Retorna as demandas escolhidas na mensagem: "todas"/"as duas" → todas; "1"/"1 e 2" → índices;
// nome (palavra ≥4 chars que aparece no resumo/cliente) → as que casam; null se não deu pra saber.
function selecionarDemandas(text: string, cands: Record<string, unknown>[]): Record<string, unknown>[] | "todas" | null {
  const t = text.trim().toLowerCase();
  if (/\b(todas|todos|as\s+duas|os\s+dois|ambas|ambos|as\s+2|os\s+2|tudo)\b/.test(t)) return "todas";
  const nums = [...new Set((t.match(/\b[1-9]\b/g) || []).map(Number))].filter((n) => n >= 1 && n <= cands.length);
  if (nums.length) return nums.map((n) => cands[n - 1]);
  const STOP = new Set(["card", "cria", "criar", "crie", "arte", "post", "pra", "para", "com", "que", "esse", "essa", "isso", "aquele", "aquela", "pedido", "cliente", "fazer", "faz", "manda", "pode", "quero", "esses", "essas"]);
  const palavras = t.split(/[\s,.!?]+/).filter((w) => w.length >= 4 && !STOP.has(w));
  if (palavras.length) {
    const hits = cands.filter((d) => {
      const alvo = `${(d.resumo as string) || ""} ${(d.cliente_nome as string) || ""}`.toLowerCase();
      return palavras.some((w) => alvo.includes(w));
    });
    if (hits.length) return hits;
  }
  return null;
}

// A mensagem parece uma CONFIRMAÇÃO livre (sem ser o "ok" exato do parseDecision)?
function ehConfirmacaoLivre(text: string): boolean {
  if (parseDecision(text)?.acao === "confirmar") return true;
  const t = text.trim().toLowerCase();
  return /\b(pode criar|cria(r)? o card|crie o card|cria esse|cria isso|pode fazer|manda ver|t[aá] certo|est[aá] tudo certo|tudo certo|fechou|pode mandar|aprovad[oa]|pode ir)\b/.test(t);
}

// A mensagem parece SÓ uma seleção (pós-listagem): "1", "1 e 2", "as duas", "todas".
function pareceSelecao(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/^\s*[1-9]([\s,e]+[1-9])*\s*$/.test(t)) return true;
  return /\b(todas|todos|as\s+duas|os\s+dois|ambas|ambos|as\s+2|os\s+2)\b/.test(t);
}

// Onboarding: acha o cliente pelo nome ou cria um mínimo (clients só exige `name`), linkando o grupo.
// Match RÍGIDO (mín. 4 chars + proporção de tamanho): substring crua fazia "Casa Nova" casar com
// "Nova" e REPONTAVA o grupo do cliente antigo — contaminação silenciosa de demandas/relatórios.
async function ensureClienteOnboarding(nome: string, groupJid: string): Promise<{ id: string; nome: string } | null> {
  const t = (nome || "").trim();
  if (t) {
    const { data: all } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, whatsapp_group_jid").or("active.is.null,active.eq.true");
    const nt = normNome(t);
    const casa = (x: string) => x.length >= 4 && nt.length >= 4 &&
      (x === nt || ((x.includes(nt) || nt.includes(x)) && Math.min(x.length, nt.length) / Math.max(x.length, nt.length) >= 0.5));
    const hit = (all ?? []).find((c) => casa(normNome((c.name as string) || "")) || casa(normNome((c.nome_fantasia as string) || "")));
    if (hit) {
      const jidAtual = (hit.whatsapp_group_jid as string) || null;
      if (jidAtual && jidAtual !== groupJid) {
        // Homônimo JÁ mapeado em outro grupo — NÃO repontar (derrubaria o mapeamento do antigo).
        // Provavelmente é cliente novo de nome parecido → cria novo.
        console.warn(`[CS/onboarding] "${t}" casa com cliente já mapeado em outro grupo — criando cliente novo`);
      } else {
        await supabaseAdmin.from("clients").update({ whatsapp_group_jid: groupJid }).eq("id", hit.id);
        return { id: hit.id as string, nome: (hit.nome_fantasia as string) || (hit.name as string) };
      }
    }
  }
  const { data: novo, error } = await supabaseAdmin
    .from("clients").insert({ name: t || "Novo cliente", whatsapp_group_jid: groupJid, status: "onboarding" })
    .select("id, name").maybeSingle();
  if (error || !novo) { console.error("[CS/onboarding] criar cliente:", error?.message); return null; }
  return { id: novo.id as string, nome: novo.name as string };
}

// Salva o briefing do onboarding como nova versão CURRENT em client_briefings.
async function salvarBriefingOnboarding(clientId: string, est: BriefingEstruturado): Promise<boolean> {
  const { data: maxv } = await supabaseAdmin
    .from("client_briefings").select("version").eq("client_id", clientId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((maxv?.version as number) ?? 0) + 1;
  await supabaseAdmin.from("client_briefings").update({ is_current: false }).eq("client_id", clientId).eq("is_current", true);
  const { error } = await supabaseAdmin.from("client_briefings").insert({
    client_id: clientId, version, is_current: true,
    resumo_estrategico: est.resumo_estrategico, contato: est.contato, posicionamento: est.posicionamento,
    produtos: est.produtos, produtos_destaque_atual: est.produtos_destaque_atual,
    publico_alvo: est.publico_alvo, dores: est.dores, tom_voz: est.tom_voz,
    observacoes_estrategicas: est.observacoes_estrategicas,
    palavras_proibidas: est.palavras_proibidas, concorrentes_evitar_mencionar: est.concorrentes_evitar_mencionar,
    ganchos: est.ganchos, ctas: est.ctas,
  });
  if (error) { console.error("[CS/onboarding] salvar briefing:", error.message); return false; }
  return true;
}

// Fato com prazo embutido ("semana que vem", "até dia 15") não pode virar regra ETERNA da memória
// do cliente — ganha TTL de 14 dias. "a partir de hoje/amanhã" é mudança permanente, não casa.
function ehFatoTemporario(texto: string): boolean {
  if (/a partir de/i.test(texto)) return false;
  return /semana que vem|essa semana|esta semana|este m[êe]s|esse m[êe]s|pr[óo]xim[ao]s? (semana|m[êe]s)|at[ée] (o )?dia \d|s[óo] (essa|esta) semana|f[ée]rias|recesso|balan[çc]o/i.test(texto);
}

// Pra cobrança/status: acha entre os cards recentes do cliente o mais relacionado ao tema
// (>=2 palavras distintivas em comum com o título). Evita cobrar algo já entregue.
async function acharCardRelacionado(
  clientId: string, topic: string,
): Promise<{ id: string; title: string; status: string; social_media: string | null; designer_delivered_at: string | null; ambiguo: boolean } | null> {
  const { data: cards } = await supabaseAdmin
    .from("content_cards").select("id, title, status, social_media, designer_delivered_at")
    .eq("client_id", clientId).is("archived_at", null)
    .order("created_at", { ascending: false }).limit(25);
  if (!cards || !cards.length) return null;
  const tw = normNome(topic).split(/\s+/).filter((w) => w.length >= 4);
  if (!tw.length) return null;
  const scored = cards
    .map((card) => ({ c: card, score: tw.filter((w) => normNome((card.title as string) || "").includes(w)).length }))
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const best = scored[0];
  // Ambíguo: 2+ cards com o MESMO score máximo (não dá pra saber qual arte é) → o chamador pergunta.
  const ambiguo = scored.length > 1 && scored[1].score === best.score;
  return {
    id: (best.c.id as string),
    title: (best.c.title as string) || "arte",
    status: (best.c.status as string) || "—",
    social_media: (best.c.social_media as string) || null,
    designer_delivered_at: (best.c.designer_delivered_at as string) || null,
    ambiguo,
  };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as EvolutionUpsert | null;
  if (!payload) return NextResponse.json({ ok: true, skip: "corpo inválido" });

  const msg = parseUpsert(payload);
  if (!msg) return NextResponse.json({ ok: true, skip: "não é mensagem de grupo com texto" });
  if (msg.fromMe) return NextResponse.json({ ok: true, skip: "própria mensagem" });

  // Cap defensivo: texto gigante (colado/encaminhado) viraria milhares de tokens em cada estágio.
  if (msg.text.length > 4000) msg.text = msg.text.slice(0, 4000);

  // ─── Claim ATÔMICO por message_id: a Evolution reenvia o webhook enquanto os handlers lentos
  // (IA, 5-20s) ainda rodam — o check-then-insert antigo deixava passar duplicata (2 sugestões,
  // 2 cards, tokens 2x). Insert-first: o reenvio conflita no PK (23505) e morre aqui, antes de
  // gastar 1 token. Fail-open se a tabela não existir (migration 058 ainda não aplicada). ───
  if (msg.messageId) {
    const { error: claimErr } = await supabaseAdmin
      .from("cs_processed_messages")
      .insert({ message_id: msg.messageId, group_jid: msg.groupJid });
    if (claimErr?.code === "23505") return NextResponse.json({ ok: true, skip: "message_id já processado (claim)" });
    if (claimErr) console.warn("[CS/inbound] claim indisponível (migration 058?):", claimErr.message);
  }

  // ─── Corpus de estilo (passo 1 do aprendizado de estilo do CS) ───
  // Guarda uma amostra das mensagens de texto dos grupos pra depois a IA aprender o TOM de cada
  // grupo/cliente e do time da Lone. Fire-and-forget (não bloqueia o webhook). RLS ligado: só o
  // service_role lê (conversa de cliente é sensível). Retenção/poda vem numa próxima etapa.
  if (msg.text && msg.text.trim().length >= 3) {
    void supabaseAdmin.from("cs_message_corpus").insert({
      group_jid: msg.groupJid,
      is_team: isLoneTeam(msg.authorJid, teamJids()),
      author_jid: msg.authorJid ?? null,
      author_name: msg.authorName ?? null,
      text: msg.text.slice(0, 2000),
    }).then(() => {}, () => {});
  }

  try {
  // Diagnóstico (fase de piloto): toda mensagem REALMENTE recebida do webhook fica visível no log —
  // grupo, autor, se é imagem/áudio. Sem isso, mensagem descartada (allowlist/equipe) sumia sem
  // rastro e a gente ficava adivinhando se o webhook entregou.
  const naAllow = pilotGroupAllowlist();
  console.log(`[CS/inbound] recv grupo=${msg.groupJid}${naAllow.length && !naAllow.includes(msg.groupJid) ? "(fora-allowlist)" : ""} autor="${msg.authorName || msg.authorJid}"${msg.isImage ? " [img]" : ""}${msg.isAudio ? " [audio]" : ""} texto="${msg.text.slice(0, 60)}"`);

  // ─── Onboarding em andamento neste grupo? A mensagem do cliente é uma RESPOSTA do onboarding. ───
  // Vem ANTES da allowlist: o grupo do cliente novo pode ainda não estar na allowlist.
  {
    const { data: sess } = await supabaseAdmin
      .from("cs_onboarding_sessions").select("*").eq("group_jid", msg.groupJid).eq("status", "coletando").maybeSingle();
    // Resposta de onboarding por NOTA DE VOZ (comum em briefing longo): transcreve AQUI — o bloco
    // geral de transcrição roda depois da allowlist, e grupo em onboarding pode nem estar nela;
    // sem isso o áudio sumia em silêncio e a sessão travava no mesmo passo.
    if (sess && msg.isAudio && !msg.text && !isLoneTeam(msg.authorJid, teamJids()) && isOpenAIConfigured()) {
      const media = await csFetchMediaBase64(payload.data ?? {});
      if (media.base64 && media.base64.length <= 8_000_000) {
        msg.text = await transcribeAudio(media.base64, media.mimetype);
      }
    }
    if (sess && !isLoneTeam(msg.authorJid, teamJids()) && !isTrivial(msg.text)) {
      const cliente = (sess.cliente_nome as string) || "cliente";
      const answers = ((sess.answers as Array<{ pergunta: string; resposta: string }>) ?? []);
      const step = (sess.step as number) ?? 0;
      answers.push({ pergunta: onboardingQuestion(step, cliente), resposta: msg.text });
      const next = step + 1;
      if (next < ONBOARDING_TOTAL) {
        await supabaseAdmin.from("cs_onboarding_sessions").update({ step: next, answers, updated_at: new Date().toISOString() }).eq("id", sess.id);
        await csSendGroupText(msg.groupJid, onboardingQuestion(next, cliente));
        return NextResponse.json({ ok: true, onboarding: "pergunta", step: next });
      }
      // Última resposta → agradece, estrutura e salva o briefing, avisa a equipe.
      await csSendGroupText(msg.groupJid, onboardingDone());
      let salvou = false;
      const est = await estruturarBriefing(cliente, answers);
      if (est.ok && est.data && sess.client_id) salvou = await salvarBriefingOnboarding(sess.client_id as string, est.data);
      await supabaseAdmin.from("cs_onboarding_sessions").update({ status: "concluido", answers, updated_at: new Date().toISOString() }).eq("id", sess.id);
      const internalFim = internalGroupJid();
      if (internalFim) await csSendGroupText(internalFim, `✅ Onboarding da *${cliente}* concluído!${salvou ? " Montei o briefing — revisa a ficha do cliente. O Lone Criativo já consegue gerar roteiro. 🎬" : " (não consegui salvar o briefing automático — confere os dados.)"}`);
      console.log(`[CS/inbound] onboarding concluído → ${cliente} (briefing salvo=${salvou})`);
      return NextResponse.json({ ok: true, onboarding: "concluido", cliente });
    }
  }

  const allow = pilotGroupAllowlist();
  if (allow.length > 0 && !allow.includes(msg.groupJid)) {
    return NextResponse.json({ ok: true, skip: "fora da allowlist do piloto" });
  }

  // ─── Nota de voz: baixa o áudio (Evolution) e TRANSCREVE (Whisper) → segue o fluxo com o texto.
  // Sem isso o agente é cego pra demanda mandada por áudio (muito comum no WhatsApp do cliente). ───
  if (msg.isAudio && !msg.text) {
    if (!isOpenAIConfigured()) return NextResponse.json({ ok: true, skip: "áudio mas IA off" });
    const media = await csFetchMediaBase64(payload.data ?? {});
    if (!media.base64) {
      console.warn("[CS/inbound] áudio sem mídia:", media.error);
      return NextResponse.json({ ok: true, skip: "áudio sem mídia" });
    }
    // Áudio de 1h+ estouraria memória e o limite do Whisper (~25MB) — demanda real é curta.
    if (media.base64.length > 8_000_000) return NextResponse.json({ ok: true, skip: "áudio muito longo" });
    msg.text = await transcribeAudio(media.base64, media.mimetype);
    if (!msg.text) return NextResponse.json({ ok: true, skip: "áudio sem transcrição" });
    console.log(`[CS/inbound] 🎤 áudio transcrito (${msg.authorName || "?"}): "${msg.text.slice(0, 80)}"`);
  }

  // ─── Reply direto numa SUGESTÃO do agente? Então é resposta de DEMANDA (ok/não/ajustar/
  // linguagem natural) — nunca roteiro/comando. Sem esta guarda, "ajustar <instrução>" era
  // sequestrado pelo handler de ajuste de roteiro (ehAjusteRoteiro casa ajusta/muda/troca em
  // qualquer posição) e o ajuste da demanda se perdia em silêncio. ───
  let demandaDaSugestao: Record<string, unknown> | null = null;
  if (msg.quotedMsgId && isInternalCmdGroup(msg.groupJid)) {
    const { data } = await supabaseAdmin.from("cs_demandas").select("*")
      .eq("msg_id_sugestao", msg.quotedMsgId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    demandaDaSugestao = data ?? null;
  }
  // Fallback por TEXTO citado: o id do quote MUITAS vezes não bate (COMPLEMENTO troca o
  // msg_id_sugestao; ou o id de envio difere do stanzaId do reply). Reencontra a demanda pendente
  // pelo cliente/resumo citado — corrige "dei ok num reply de ontem e ele ignorou".
  if (!demandaDaSugestao && msg.quotedText && isInternalCmdGroup(msg.groupJid)) {
    demandaDaSugestao = await acharDemandaPorTexto(msg.quotedText);
  }

  // ─── Agente "Lone": pedido de CALENDÁRIO ("Lone, monta o calendário mensal do X") ───
  // Gera o calendário estratégico e manda o PDF no grupo. Geração é longa → ack + background.
  if (!demandaDaSugestao && isInternalCmdGroup(msg.groupJid) && ehPedidoCalendario(msg.text)) {
    const quemCal = msg.authorName || "";
    if (!isOpenAIConfigured()) {
      await csSendGroupText(msg.groupJid, "Tô sem acesso à IA agora pra montar o calendário 😕 já já volto.");
      return NextResponse.json({ ok: true, calendario: "sem_ia" });
    }
    const alvo = await resolveClientePorNome(msg.text);
    if (!alvo) {
      await csSendGroupText(msg.groupJid, "Bora! 📅 De qual cliente é o calendário? Me diz o nome que eu já monto.");
      return NextResponse.json({ ok: true, calendario: "sem_cliente" });
    }
    const modo = modoCalendario(msg.text);
    await csSendGroupText(msg.groupJid, `Fechou${quemCal ? `, ${quemCal}` : ""}! 📅 Montando o calendário ${modo === "mes" ? "mensal" : "da semana"} do *${alvo.nome}*… leva ~1 min, já te mando o PDF. 😉`);
    void (async () => {
      try {
        const { periodo, datas } = datasDoPeriodo(modo);
        const r = await planejarPeriodo(alvo.id, periodo, datas);
        if (!r.ok || !r.plano || !r.nome) {
          await csSendGroupText(msg.groupJid, `Eita, não consegui montar o calendário do *${alvo.nome}* agora 😕 ${r.error ? `(${r.error}) ` : ""}me chama de novo daqui a pouco?`);
          return;
        }
        const pecas = await executarPlano(r.nome, r.plano.diagnostico, r.plano.decisoes);
        const pdf = await htmlToPdf(calendarioPdfHtml({ cliente: r.nome, nicho: alvo.nicho, periodo, modo, pecas }));
        if (pdf.ok && pdf.buffer) {
          await csSendGroupText(msg.groupJid, `📅 Pronto! Calendário ${modo === "mes" ? "mensal" : "da semana"} do *${alvo.nome}* — ${pecas.length} peça(s), cada uma com direção de arte pro designer:`);
          await csSendGroupDocument(msg.groupJid, pdf.buffer.toString("base64"), `Calendario ${alvo.nome} - ${periodo}.pdf`);
        } else {
          await csSendGroupText(msg.groupJid, `Montei o calendário do *${alvo.nome}* mas o PDF falhou 😕 — abre em *Planejamento* no sistema que tá lá.`);
        }
      } catch {
        await csSendGroupText(msg.groupJid, `Deu ruim ao montar o calendário do *${alvo.nome}* 😕 tenta de novo?`);
      }
    })();
    return NextResponse.json({ ok: true, calendario: "montando", cliente: alvo.nome });
  }

  // ─── Agente "Lone": pedido de ROTEIRO no grupo interno ("Lone, faz um roteiro pro [cliente]") ───
  // Reconhece o pedido, acha o cliente, lê o briefing e devolve os roteiros. Se faltar briefing, pede.
  // Cada pedido vira corpus (cs_roteiro_pedidos) p/ ir aprendendo o estilo de cada cliente.
  const pedeRot = !demandaDaSugestao && isInternalCmdGroup(msg.groupJid) && ehPedidoRoteiro(msg.text);
  // "ajusta/muda/troca…" só é ajuste de ROTEIRO se EXISTE roteiro recente (30 min). Checar ANTES
  // de reivindicar a mensagem: sem contexto, o fluxo segue (antes: return silencioso que engolia
  // respostas de demanda e poluía o corpus cs_roteiro_pedidos).
  let roteiroRecente: { clientId: string; nome: string; pedido: string } | null = null;
  // Veto: "ajusta/muda" que fala de ARTE/CARD/LOGO/DESIGNER ou REATRIBUI pra alguém ("muda pro
  // Pedro") é ajuste de DEMANDA, não de roteiro — não pode ser sequestrado como ajuste de roteiro.
  const pareceOpDeDemanda = /\b(arte|artes|card|cards|design|designer|demanda|logo|banner|panfleto|flyer)\b/i.test(msg.text)
    || /\b(pro|pra|para\s+[oa])\s+[A-ZÀ-Ú]/.test(msg.text);
  if (!demandaDaSugestao && !pedeRot && !pareceOpDeDemanda && isInternalCmdGroup(msg.groupJid) && ehAjusteRoteiro(msg.text)) {
    const desde30 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: ult } = await supabaseAdmin.from("cs_roteiro_pedidos")
      .select("client_id, cliente_nome, pedido").not("client_id", "is", null).gte("created_at", desde30)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (ult?.client_id) {
      roteiroRecente = { clientId: ult.client_id as string, nome: ult.cliente_nome as string, pedido: (ult.pedido as string) || "—" };
    }
  }
  const ajusteRot = roteiroRecente != null;
  if (pedeRot || ajusteRot) {
    if (!isOpenAIConfigured()) {
      await csSendGroupText(msg.groupJid, "Tô sem acesso à IA agora pra montar roteiro 😕 já já volto.");
      return NextResponse.json({ ok: true, roteiro: "sem_ia" });
    }
    const quem = msg.authorName || "";
    // Dedup atômico: o roteiro leva ~15s e a Evolution reenvia o webhook. Inserir o message_id
    // (unique) AGORA "trava" o pedido — o reenvio conflita (23505) e não regenera nem reposta.
    let pedidoId: string | null = null;
    if (msg.messageId) {
      const { data: claim, error: claimErr } = await supabaseAdmin
        .from("cs_roteiro_pedidos")
        .insert({ message_id: msg.messageId, pedido: msg.text, solicitante: quem || msg.authorJid })
        .select("id").maybeSingle();
      if (claimErr?.code === "23505") return NextResponse.json({ ok: true, roteiro: "dedup" });
      pedidoId = claim?.id ?? null; // outro erro → segue sem corpus (best-effort)
    }
    let alvo = pedeRot ? await resolveClientePorNome(msg.text) : null;
    let pedidoRoteiro = msg.text;
    if (!alvo && roteiroRecente) {
      // Follow-up de ajuste: o roteiro recente (já validado lá em cima) é o contexto.
      alvo = { id: roteiroRecente.clientId, nome: roteiroRecente.nome, nicho: undefined };
      pedidoRoteiro = `O roteiro anterior era sobre: ${roteiroRecente.pedido}. A equipe pediu este AJUSTE: ${msg.text}`;
    }
    if (!alvo) {
      await csSendGroupText(msg.groupJid, "Bora! 🎬 De qual cliente é o roteiro? Me diz o nome que eu já monto.");
      return NextResponse.json({ ok: true, roteiro: "sem_cliente" });
    }
    const { briefing, temBriefing } = await loadBriefingForClient({ clientId: alvo.id, nome: alvo.nome, nicho: alvo.nicho });
    const preferencias = await loadRoteiroPrefs(alvo.id); // estilo já aprendido deste cliente
    const r = await gerarRoteiros({ briefing, pedido: pedidoRoteiro, preferencias });
    if (!r.ok || !r.data) {
      await csSendGroupText(msg.groupJid, `Eita, não consegui montar o roteiro do *${alvo.nome}* agora 😕 me chama de novo daqui a pouco?`);
      return NextResponse.json({ ok: true, roteiro: "erro", cliente: alvo.nome });
    }
    if (pedidoId) await supabaseAdmin.from("cs_roteiro_pedidos")
      .update({ client_id: alvo.id, cliente_nome: alvo.nome, roteiros: r.data.roteiros, scorecard: r.data.roteiros[0]?.scorecard ?? null }).eq("id", pedidoId);
    if (r.data.precisa_briefing) {
      const perg = r.data.perguntas.length ? "\n" + r.data.perguntas.map((p) => `• ${p}`).join("\n") : "";
      await csSendGroupText(msg.groupJid, `Pra fazer um roteiro afiado do *${alvo.nome}* eu preciso de um pouco mais:${perg}\n\nMe passa isso (ou preenche o briefing dele na plataforma) que eu mando na hora. 🙌`);
      return NextResponse.json({ ok: true, roteiro: "precisa_briefing", cliente: alvo.nome });
    }
    const versoes = r.data.roteiros.slice(0, 2);
    const obs = temBriefing ? "" : " _(ainda sem briefing salvo — fiz no meu melhor, vale revisar)_";
    const now = spNow();
    const dataLabel = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const logo = await loadLoneLogo();
    const pdf = await htmlToPdf(roteirosPdfHtml(alvo.nome, versoes, logo, dataLabel));
    await csSendGroupText(msg.groupJid, `🎬 Bora${quem ? `, ${quem}` : ""}! Montei ${versoes.length > 1 ? `${versoes.length} versões` : "1 versão"} de roteiro pro *${alvo.nome}*${obs} — segue o PDF organizado pra já mandar pro cliente:`);
    if (pdf.ok && pdf.buffer) {
      await csSendGroupDocument(msg.groupJid, pdf.buffer.toString("base64"), `Roteiro ${alvo.nome} - ${dataLabel}.pdf`);
    } else {
      // Fallback: PDF falhou → manda em texto pra não deixar o time sem nada.
      for (const [i, rot] of versoes.entries()) await csSendGroupText(msg.groupJid, formatRoteiro(rot, alvo.nome, i + 1));
    }
    await csSendGroupText(msg.groupJid, "Me diz o que ajustar (gancho, CTA, mais curto, outro produto…) que eu refaço — assim eu vou pegando o estilo de cada cliente. 😉");
    // Loop de aprendizado: mina uma preferência DURÁVEL de estilo da mensagem e guarda (dedup p/ texto).
    const pref = await extrairPreferenciaRoteiro(msg.text);
    if (pref) {
      const { data: ex } = await supabaseAdmin.from("cs_client_rules")
        .select("id").eq("client_id", alvo.id).eq("texto", pref).eq("ativo", true).limit(1);
      if (!ex || ex.length === 0) {
        await supabaseAdmin.from("cs_client_rules").insert({ client_id: alvo.id, texto: pref, escopo: "roteiro", origem: "aprendido", source_message: msg.text, author: quem || msg.authorJid });
        console.log(`[CS/inbound] aprendi preferência de roteiro (${alvo.nome}): ${pref}`);
      }
    }
    console.log(`[CS/inbound] roteiro on-demand → ${alvo.nome} (${r.data.roteiros.length} versões) p/ ${quem}`);
    return NextResponse.json({ ok: true, roteiro: "ok", cliente: alvo.nome, n: r.data.roteiros.length });
  }

  // ─── Agente "Lone": RAIO-X do cliente ("Lone, me dá um raio-x do Contele") ───
  // Resumo completo pro gestor/social bater o olho: demandas, produção, entregas, reclamação,
  // atividade e regras aprendidas. Determinístico (sem IA).
  if (!demandaDaSugestao && isInternalCmdGroup(msg.groupJid) && ehPedidoRaioX(msg.text)) {
    const alvo = await resolveClientePorNome(msg.text);
    if (!alvo) {
      await csSendGroupText(msg.groupJid, "De qual cliente é o raio-x? Me diz o nome. 😉");
      conversaAtiva.set(chaveConversa(msg.groupJid, msg.authorJid), Date.now());
      return NextResponse.json({ ok: true, raiox: "sem_cliente" });
    }
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const [cliRow, dems, cards, ultReclam, regras] = await Promise.all([
      supabaseAdmin.from("clients").select("assigned_social, last_client_msg_at, fixed_briefing").eq("id", alvo.id).maybeSingle(),
      supabaseAdmin.from("cs_demandas").select("status").eq("client_id", alvo.id).gte("created_at", d30),
      supabaseAdmin.from("content_cards").select("status, designer_delivered_at, client_approved_at").eq("client_id", alvo.id).is("archived_at", null),
      supabaseAdmin.from("cs_demandas").select("resumo, created_at").eq("client_id", alvo.id).eq("tipo", "reclamacao").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("cs_client_rules").select("id", { count: "exact", head: true }).eq("client_id", alvo.id).eq("ativo", true),
    ]);
    const demArr = dems.data ?? [];
    const pend = demArr.filter((x) => x.status === "pendente").length;
    const conf = demArr.filter((x) => x.status === "confirmada").length;
    const cardArr = cards.data ?? [];
    const emProd = cardArr.filter((k) => k.status === "in_production").length;
    const entregues7 = cardArr.filter((k) => k.designer_delivered_at && (k.designer_delivered_at as string) >= d7).length;
    const aguardando = cardArr.filter((k) => ["approval", "client_approval"].includes(k.status as string)).length;
    const publicados = cardArr.filter((k) => k.status === "published").length;
    const lastMsg = cliRow.data?.last_client_msg_at as string | undefined;
    const diasQuieto = lastMsg ? Math.floor((Date.now() - new Date(lastMsg).getTime()) / 86400000) : null;
    const temBriefing = !!(cliRow.data?.fixed_briefing as string)?.trim();
    const social = (cliRow.data?.assigned_social as string) || "—";

    // Instagram (do cache, 7d) — resultado REAL no raio-x. Best-effort (nem todo cliente tem).
    const { data: igSnapRow } = await supabaseAdmin.from("client_ig_snapshots")
      .select("data").eq("client_id", alvo.id).eq("period_kind", "7d").maybeSingle();
    const igD = igSnapRow?.data as { conta?: { username?: string; seguidores?: number | null }; resumo?: { alcance?: number | null; seguidoresGanhos?: number | null; engajamento?: number | null; postsNoPeriodo?: number | null }; fonte?: string } | undefined;
    let igLinha = "";
    if (igD?.conta) {
      const nfIg = (n?: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));
      const parts = [`${nfIg(igD.conta.seguidores)} seguidores`];
      if (igD.fonte !== "publico") {
        if (igD.resumo?.seguidoresGanhos != null) parts.push(`${igD.resumo.seguidoresGanhos >= 0 ? "+" : ""}${nfIg(igD.resumo.seguidoresGanhos)}/sem`);
        if (igD.resumo?.alcance != null) parts.push(`alcance ${nfIg(igD.resumo.alcance)}`);
      }
      parts.push(`engaj. ${nfIg(igD.resumo?.engajamento)}`, `${nfIg(igD.resumo?.postsNoPeriodo)} posts (7d)`);
      igLinha = `📸 *Instagram* @${igD.conta.username || ""}: ${parts.join(" · ")}`;
    }

    const linhas = [
      `📊 *Raio-X — ${alvo.nome}*`,
      `👤 Social: ${social}${temBriefing ? " · briefing ✅" : " · *sem briefing* ⚠️"}`,
      ``,
      `*Últimos 30 dias:* ${demArr.length} demanda${demArr.length !== 1 ? "s" : ""}${pend ? ` · ${pend} pendente${pend > 1 ? "s" : ""}` : ""}${conf ? ` · ${conf} confirmada${conf > 1 ? "s" : ""}` : ""}`,
      `*Produção agora:* ${emProd} em produção · ${aguardando} aguardando aprovação`,
      `*Entregas (7d):* ${entregues7} · *Publicados:* ${publicados}`,
      igLinha,
      diasQuieto == null ? `*Atividade:* sem registro de mensagem do cliente ainda` : `*Última fala do cliente:* há ${diasQuieto} dia${diasQuieto !== 1 ? "s" : ""}${diasQuieto >= 7 ? " ⚠️ (esfriando)" : ""}`,
      (regras.count ?? 0) > 0 ? `*Regras aprendidas:* ${regras.count}` : "",
      ultReclam.data ? `\n🔴 *Última reclamação:* ${ultReclam.data.resumo} (${new Date(ultReclam.data.created_at as string).toLocaleDateString("pt-BR")})` : "",
    ].filter(Boolean);
    await csSendGroupText(msg.groupJid, linhas.join("\n"));
    console.log(`[CS/inbound] raio-x → ${alvo.nome}`);
    return NextResponse.json({ ok: true, raiox: "ok", cliente: alvo.nome });
  }

  // ─── Agente "Lone": pergunta de STATUS ("Lone, a demanda do Léo Carros foi feita?") ───
  // Acha o cliente + a demanda/card mais relacionados e reporta o estágio REAL. Determinístico.
  if (!demandaDaSugestao && isInternalCmdGroup(msg.groupJid) && ehPerguntaStatus(msg.text)) {
    const alvoSt = await resolveClientePorNome(msg.text);
    // Sem cliente resolvido: se for VISÃO GERAL ("as demandas de hoje", "de todos"), NÃO pergunta
    // "de qual cliente?" — deixa cair no conversacional abaixo, que dá o panorama (snapshot). Só
    // pede o nome quando é status de UM cliente com o nome faltando ("lone, a arte já saiu?").
    if (!alvoSt && !ehVisaoGeralDemandas(msg.text)) {
      await csSendGroupText(msg.groupJid, "De qual cliente? Me diz o nome que eu já te digo o status. 😉");
      conversaAtiva.set(chaveConversa(msg.groupJid, msg.authorJid), Date.now()); // pro "do Contele" seguir
      return NextResponse.json({ ok: true, status_cmd: "sem_cliente" });
    }
    if (alvoSt) {
    const { data: dems } = await supabaseAdmin
      .from("cs_demandas").select("resumo, status, content_card_id, responsavel, created_at")
      .eq("client_id", alvoSt.id).order("created_at", { ascending: false }).limit(8);
    // Prefere a demanda que casa com o TEMA da pergunta; senão, a mais recente.
    const twSt = normNome(msg.text).split(/\s+/).filter((w) => w.length >= 4 && !STOP_NOME.has(w));
    const dem = (dems ?? []).find((d) => {
      const r = normNome((d.resumo as string) || "");
      return twSt.filter((w) => r.includes(w)).length >= 2;
    }) ?? (dems ?? [])[0];
    if (!dem) {
      await csSendGroupText(msg.groupJid, `Não achei nenhuma demanda registrada da *${alvoSt.nome}* por aqui. 🤔`);
      return NextResponse.json({ ok: true, status_cmd: "sem_demanda" });
    }
    let respostaSt: string;
    if (dem.status === "pendente") {
      respostaSt = `A *${dem.resumo}* da *${alvoSt.nome}* ainda tá pendente esperando um ok/não (aqui ou no painel do Agente Lone).`;
    } else if (dem.status === "descartada") {
      respostaSt = `A *${dem.resumo}* da *${alvoSt.nome}* foi descartada — não virou card.`;
    } else if (dem.content_card_id) {
      const { data: cardSt } = await supabaseAdmin
        .from("content_cards")
        .select("title, status, designer_delivered_at, client_approved_at, due_date")
        .eq("id", dem.content_card_id as string).maybeSingle();
      if (cardSt) {
        const etapa = cardSt.client_approved_at
          ? "APROVADA pelo cliente 🎉 (falta agendar)"
          : cardSt.designer_delivered_at
          ? "com a arte ENTREGUE pelo designer — aguardando revisão/agendamento"
          : `na coluna *${STATUS_CARD_LABEL[cardSt.status as string] ?? cardSt.status}*`;
        const prazo = cardSt.due_date ? ` · prazo ${new Date(`${cardSt.due_date}T12:00:00`).toLocaleDateString("pt-BR")}` : "";
        respostaSt = `Criei sim! O card *${cardSt.title}* da *${alvoSt.nome}* tá ${etapa}${dem.responsavel ? ` — responsável: ${dem.responsavel}` : ""}${prazo}.`;
      } else {
        respostaSt = `A *${dem.resumo}* foi confirmada, mas não achei mais o card (pode ter sido apagado) — vale conferir no board.`;
      }
    } else {
      respostaSt = `A *${dem.resumo}* consta confirmada, mas sem card vinculado — vale conferir no board.`;
    }
    await csSendGroupText(msg.groupJid, respostaSt);
    console.log(`[CS/inbound] status → ${alvoSt.nome}: ${dem.resumo} (${dem.status})`);
    return NextResponse.json({ ok: true, status_cmd: "ok", cliente: alvoSt.nome });
    } // fim do if (alvoSt) — se não resolveu cliente e é visão geral, cai no conversacional abaixo
  }

  // ─── Agente "Lone": equipe pede pra CRIAR uma demanda ("Lone, cria uma demanda na [cliente] sobre X").
  // SUGERE (mesmo formato da demanda de cliente) e espera "ok" pra criar o card. ───
  // Guarda: "Lone, cria umas ideias de post pro X" tem verbo de criação + "post", mas é pedido de
  // IDEIAS (handler abaixo), não de abrir uma demanda. Deixa passar pro handler de ideias.
  // ─── Conclusão de "aguardando_cliente": o time pediu "cria a demanda" mas eu não sabia de qual
  // cliente; guardei o pedido e perguntei o nome. A PRÓXIMA msg da mesma pessoa que resolver um
  // cliente completa a demanda usando o TEXTO ORIGINAL guardado (não a resposta do nome). ───
  // Guarda: só completa se a resposta for CURTA (o nome do cliente — ex.: "WT Shopping", "a da wt").
  // Sem isso, qualquer papo posterior que mencione um cliente por acaso completava a demanda errada.
  const respostaCurtaAg = msg.text.trim().split(/\s+/).length <= 6;
  if (isInternalCmdGroup(msg.groupJid) && !demandaDaSugestao && isOpenAIConfigured()
      && !ehPedidoCriarDemanda(msg.text) && !isTrivial(msg.text) && respostaCurtaAg) {
    const quemAg = msg.authorName || msg.authorJid;
    const desdeAg = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: ag } = await supabaseAdmin.from("cs_demandas").select("*")
      .eq("group_jid", msg.groupJid).eq("author", quemAg).eq("status", "aguardando_cliente")
      .gte("created_at", desdeAg).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (ag) {
      const alvoAg = await resolveClientePorNome(msg.text);
      if (alvoAg) {
        const { data: cAg } = await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("id", alvoAg.id).maybeSingle();
        if (cAg) {
          const r = await montarDemandaComando(cAg, (ag.message_text as string) || msg.text, quemAg, msg.messageId, msg.groupJid);
          if (r) await supabaseAdmin.from("cs_demandas").delete().eq("id", ag.id as string);
          return NextResponse.json({ ok: true, demanda_cmd: r ? "completada" : "erro", cliente: r?.cliente });
        }
      }
      // Ainda não deu pra saber o cliente pelo nome — não trava; deixa a msg seguir o fluxo normal.
    }
  }

  if (!demandaDaSugestao && isInternalCmdGroup(msg.groupJid) && ehPedidoCriarDemanda(msg.text) && !ehPedidoIdeias(msg.text)) {
    if (!isOpenAIConfigured()) {
      await csSendGroupText(msg.groupJid, "Tô sem acesso à IA agora pra montar a demanda 😕");
      return NextResponse.json({ ok: true, demanda_cmd: "sem_ia" });
    }
    // Dedup do reenvio do webhook (a sugestão demora alguns segundos).
    if (msg.messageId) {
      const { data: ja } = await supabaseAdmin.from("cs_demandas").select("id").eq("message_id", msg.messageId).limit(1).maybeSingle();
      if (ja) return NextResponse.json({ ok: true, demanda_cmd: "dedup" });
    }
    const quem = msg.authorName || msg.authorJid;
    const alvo = await resolveClientePorNome(msg.text);
    if (!alvo) {
      // Não sei o cliente ainda — GUARDA o pedido (texto original) como "aguardando_cliente" e
      // pergunta. A próxima msg da pessoa que resolver um cliente completa a demanda (bloco acima).
      // Só um "aguardando_cliente" por autor/grupo: limpa os anteriores (evita acúmulo e evita que
      // uma resposta de nome complete um rascunho velho que a pessoa já abandonou).
      await supabaseAdmin.from("cs_demandas").delete()
        .eq("group_jid", msg.groupJid).eq("author", quem).eq("status", "aguardando_cliente");
      await supabaseAdmin.from("cs_demandas").insert({
        codigo: randomBytes(2).toString("hex"), group_jid: msg.groupJid, author: quem,
        message_id: msg.messageId, message_text: msg.text, tipo: "arte_nova", urgencia: "media",
        confianca: 0, resumo: "(aguardando cliente)", status: "aguardando_cliente",
      });
      await csSendGroupText(msg.groupJid, "Pode deixar! 📝 De qual cliente é a demanda? Me diz o nome que eu monto.");
      return NextResponse.json({ ok: true, demanda_cmd: "aguardando_cliente" });
    }
    const { data: c } = await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("id", alvo.id).maybeSingle();
    if (!c) return NextResponse.json({ ok: true, demanda_cmd: "cliente_sumiu" });
    const clienteNome = nomeOf(c);
    // "cria a demanda que a X pediu" (REFERÊNCIA curta, sem conteúdo colado) → em vez de inventar um
    // genérico, uso o que EU JÁ PEGUEI do grupo da X (as demandas pendentes que classifiquei). Se veio
    // conteúdo colado (msg longa), monto a partir dele.
    // "REFERÊNCIA" (usar pedidos capturados do grupo) vs "CONTEÚDO COLADO" (montar do texto): não dá
    // pra decidir só por tamanho — "cria a demanda que o Complexo Vida pediu lá no grupo, obrigado"
    // é longo mas é referência. É referência se cita o cliente PEDINDO (pediu/mandou/solicitou/quer)
    // e NÃO traz um bloco colado (sem quebra de linha e curto). Senão, é conteúdo pra montar.
    const ehReferencia = /\b(pediu|pediram|mandou|mandaram|solicit\w*|falou|quer|queria|pedido)\b/i.test(msg.text)
      && !msg.text.includes("\n") && msg.text.trim().length < 200;
    const temConteudoColado = !ehReferencia && msg.text.trim().length >= 80;
    if (!temConteudoColado) {
      const d7 = new Date(Date.now() - 2 * 864e5).toISOString(); // 2 dias: pega o que a X pediu recente, sem confirmar pendente velho
      const { data: jaPend } = await supabaseAdmin.from("cs_demandas")
        .select("id, resumo, tipo, urgencia, briefing, message_text, responsavel, content_card_id")
        .eq("client_id", c.id as string).eq("status", "pendente")
        .gte("created_at", d7).order("created_at", { ascending: false }).limit(6);
      if (jaPend && jaPend.length > 0) {
        const criados: string[] = [];
        for (const d of jaPend) {
          let cardId: string | null = null;
          if (d.tipo === "pauta_semanal") {
            const itens = parsePautaItens((d.message_text as string) || "") ?? [];
            const ids = await criarCardsPauta({ clientId: c.id as string, clienteNome, responsavel: d.responsavel as string | null, itens });
            cardId = ids[0] ?? null;
          } else {
            cardId = await criarCardDemanda({
              clientId: c.id as string, clienteNome, responsavel: d.responsavel as string | null,
              titulo: (d.resumo as string) || (d.message_text as string), urgencia: d.urgencia as string,
              briefing: (d.briefing as string) || (d.message_text as string), tipo: d.tipo as string,
              ajusteCardId: (d.content_card_id as string) ?? null,
            });
          }
          await supabaseAdmin.from("cs_demandas").update({ status: "confirmada", content_card_id: cardId, decided_at: new Date().toISOString(), decided_by: quem }).eq("id", d.id as string);
          if (cardId) criados.push((d.resumo as string) || "card");
        }
        await csSendGroupText(msg.groupJid,
          `Boa! A *${clienteNome}* tinha ${criados.length} pedido(s) que peguei do grupo — criei ${criados.length === 1 ? "o card" : `os ${criados.length} cards`}:\n${criados.map((x) => `• ${x}`).join("\n")}\n\nSe algum não era pra criar, me fala que eu arquivo. 🚀`);
        console.log(`[CS/inbound] comando "que a X pediu" → criou ${criados.length} cards capturados de ${clienteNome}`);
        return NextResponse.json({ ok: true, demanda_cmd: "criou_capturadas", cliente: clienteNome, cards: criados.length });
      }
      await csSendGroupText(msg.groupJid, `Não achei nenhum pedido aberto da *${clienteNome}* que eu tenha pego do grupo. Me cola aqui o que ela pediu que eu monto certinho. 😉`);
      return NextResponse.json({ ok: true, demanda_cmd: "sem_pedido_capturado", cliente: clienteNome });
    }
    const r = await montarDemandaComando(c, msg.text, quem, msg.messageId, msg.groupJid);
    return NextResponse.json({ ok: true, demanda_cmd: r ? "sugerida" : "erro", cliente: r?.cliente, titulo: r?.titulo });
  }

  // ─── Agente "Lone": MOVER um card por comando ("Lone, marca a arte do X como pronta / manda pro
  // social / põe em produção"). Fecha o loop operacional no WhatsApp. Confirma QUAL card moveu e
  // convida a corrigir (reduz risco de mover o errado). Casa o tema da msg; senão, o card mais recente. ───
  const cmdMover = (!demandaDaSugestao && isInternalCmdGroup(msg.groupJid)) ? ehComandoMoverCard(msg.text) : null;
  if (cmdMover) {
    const alvoM = await resolveClientePorNome(msg.text);
    if (!alvoM) {
      await csSendGroupText(msg.groupJid, "De qual cliente é o card? Me diz o nome que eu movo. 😉");
      conversaAtiva.set(chaveConversa(msg.groupJid, msg.authorJid), Date.now());
      return NextResponse.json({ ok: true, mover_card: "sem_cliente" });
    }
    const { data: cardsM } = await supabaseAdmin.from("content_cards")
      .select("id, title, status, designer_delivered_at")
      .eq("client_id", alvoM.id).is("archived_at", null).neq("status", "published")
      .order("updated_at", { ascending: false }).limit(6);
    if (!cardsM || cardsM.length === 0) {
      await csSendGroupText(msg.groupJid, `Não achei card ativo da *${alvoM.nome}* pra mover 🤔 (pode já estar publicado/arquivado).`);
      return NextResponse.json({ ok: true, mover_card: "sem_card" });
    }
    const twM = normNome(msg.text).split(/\s+/).filter((w) => w.length >= 4 && !STOP_NOME.has(w));
    const cardM = cardsM.find((k) => {
      const tt = normNome((k.title as string) || "");
      return twM.filter((w) => tt.includes(w)).length >= 2;
    }) ?? cardsM[0];
    const upd: Record<string, unknown> = { status: cmdMover.status };
    if (cmdMover.delivered) upd.designer_delivered_at = new Date().toISOString();
    await supabaseAdmin.from("content_cards").update(upd).eq("id", cardM.id as string);
    const label = STATUS_CARD_LABEL[cmdMover.status] ?? cmdMover.status;
    await csSendGroupText(msg.groupJid, `✅ Movi *${cardM.title}* da *${alvoM.nome}* pra *${label}*${cmdMover.delivered ? " (arte marcada como entregue)" : ""}.\nSe não era esse card, me fala que eu volto. 👍`);
    console.log(`[CS/inbound] mover card ${cardM.id} → ${cmdMover.status} (${alvoM.nome})`);
    return NextResponse.json({ ok: true, mover_card: "ok", cliente: alvoM.nome, card: cardM.title as string, status: cmdMover.status });
  }

  // ─── Onboarding: equipe avisa "Lone, entrou um novo cliente X no grupo Y" → o Lone CONDUZ lá. ───
  if (isInternalCmdGroup(msg.groupJid) && ehOnboardingTrigger(msg.text)) {
    if (!isOpenAIConfigured()) {
      await csSendGroupText(msg.groupJid, "Tô sem IA agora pra conduzir o onboarding 😕");
      return NextResponse.json({ ok: true, onboarding: "sem_ia" });
    }
    const { cliente, grupo } = await parseOnboardingTrigger(msg.text);
    if (!grupo) {
      await csSendGroupText(msg.groupJid, `Pra eu conduzir, me diz o *nome do grupo* do cliente (e o nome do cliente). Ex.: _"Lone, entrou o cliente Padaria do João no grupo Padaria João x Lone"_. 😉`);
      return NextResponse.json({ ok: true, onboarding: "sem_grupo" });
    }
    const found = await csFindGroupByName(grupo);
    if (!found.jid) {
      await csSendGroupText(msg.groupJid, `Não achei o grupo "${grupo}" entre os que eu participo 🤔 me adiciona nesse grupo e confere o nome que aí eu começo.`);
      return NextResponse.json({ ok: true, onboarding: "grupo_nao_encontrado" });
    }
    const grupoJid = found.jid;
    const { data: jaSess } = await supabaseAdmin
      .from("cs_onboarding_sessions").select("id").eq("group_jid", grupoJid).eq("status", "coletando").maybeSingle();
    if (jaSess) {
      await csSendGroupText(msg.groupJid, `Já tem um onboarding rolando no grupo "${found.subject}". 😉`);
      return NextResponse.json({ ok: true, onboarding: "ja_ativo" });
    }
    const cli = await ensureClienteOnboarding(cliente || found.subject || "", grupoJid);
    const nomeCli = cli?.nome || cliente || "cliente";
    await supabaseAdmin.from("cs_onboarding_sessions").insert({
      client_id: cli?.id ?? null, cliente_nome: nomeCli, group_jid: grupoJid, status: "coletando",
      step: 0, answers: [], iniciado_por: msg.authorName || msg.authorJid,
    });
    await csSendGroupText(grupoJid, onboardingWelcome(nomeCli));
    await csSendGroupText(msg.groupJid, `🚪 Beleza! Comecei o onboarding da *${nomeCli}* no grupo "${found.subject}". Conduzo por lá e te aviso quando terminar. 🙌`);
    console.log(`[CS/inbound] onboarding iniciado → ${nomeCli} no grupo ${found.subject}`);
    return NextResponse.json({ ok: true, onboarding: "iniciado", cliente: nomeCli, grupo: found.subject });
  }

  // ─── Férias/ausência: "Lone, o Rodrigo está de férias até dia 15" / "Lone, o Carlos voltou" ───
  if (isInternalCmdGroup(msg.groupJid) && ehComandoAusencia(msg.text)) {
    if (!isOpenAIConfigured()) {
      await csSendGroupText(msg.groupJid, "Tô sem IA agora pra anotar isso 😕");
      return NextResponse.json({ ok: true, ausencia: "sem_ia" });
    }
    const hoje = spNow().toISOString().slice(0, 10);
    const { nome, disponivel, ate } = await parseAusencia(msg.text, hoje);
    if (!nome) {
      await csSendGroupText(msg.groupJid, "De quem? Me diz o nome — ex.: _\"Lone, o Rodrigo está de férias até dia 20\"_.");
      return NextResponse.json({ ok: true, ausencia: "sem_nome" });
    }
    const { data: membro } = await supabaseAdmin
      .from("team_members").select("id, name").ilike("name", `%${nome}%`).limit(1).maybeSingle();
    if (!membro) {
      await csSendGroupText(msg.groupJid, `Não achei "${nome}" na equipe 🤔 confere o nome?`);
      return NextResponse.json({ ok: true, ausencia: "membro_nao_encontrado" });
    }
    const novoAte = disponivel ? null : (ate ? new Date(`${ate}T23:59:59-03:00`).toISOString() : new Date(Date.now() + 30 * 864e5).toISOString());
    await supabaseAdmin.from("team_members").update({ unavailable_until: novoAte }).eq("id", membro.id);
    await csSendGroupText(msg.groupJid, disponivel
      ? `✅ Anotado: *${membro.name}* tá de volta! Volto a rotear demanda pra ele. 🙌`
      : `✅ Anotado: *${membro.name}* tá fora${ate ? ` até ${new Date(`${ate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}. Nas demandas dele eu aviso pra alguém cobrir. 👍`);
    console.log(`[CS/inbound] ausência → ${membro.name} ${disponivel ? "voltou" : `fora até ${novoAte}`}`);
    return NextResponse.json({ ok: true, ausencia: disponivel ? "voltou" : "fora", membro: membro.name });
  }

  // ─── Desambiguação: 2+ pedidos abertos + confirmação/seleção SEM reply → cria os escolhidos ou
  // LISTA por nome (fim do "responde na mensagem" seco). Só age com 2+ pendentes; o caso de 1
  // pendente e os replies citados seguem pelo fluxo robusto abaixo (evita card duplicado no retry). ─
  if (isInternalCmdGroup(msg.groupJid) && !demandaDaSugestao && (ehConfirmacaoLivre(msg.text) || pareceSelecao(msg.text))) {
    const desdeAmb = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { data: pend } = await supabaseAdmin.from("cs_demandas").select("*")
      .eq("status", "pendente").gte("created_at", desdeAmb)
      .order("created_at", { ascending: false }).limit(5);
    if (pend && pend.length >= 2) {
      const sel = selecionarDemandas(msg.text, pend);
      const escolhidas = sel === "todas" ? pend : (Array.isArray(sel) ? sel : []);
      if (escolhidas.length) {
        const decidedBy = msg.authorName || msg.authorJid;
        const criados: string[] = [];
        for (const d of escolhidas) {
          const clientId = (d.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
          if (!clientId) continue;
          let cardId: string | null = null;
          if (d.tipo === "pauta_semanal") {
            const itens = parsePautaItens((d.message_text as string) || "") ?? [];
            const ids = await criarCardsPauta({ clientId, clienteNome: (d.cliente_nome as string) || "Cliente", responsavel: d.responsavel as string | null, itens });
            cardId = ids[0] ?? null;
          } else {
            cardId = await criarCardDemanda({
              clientId, clienteNome: (d.cliente_nome as string) || "Cliente", responsavel: d.responsavel as string | null,
              titulo: (d.resumo as string) || (d.message_text as string), urgencia: d.urgencia as string,
              briefing: (d.briefing as string) || (d.message_text as string), tipo: d.tipo as string,
              ajusteCardId: (d.content_card_id as string) ?? null,
            });
          }
          await supabaseAdmin.from("cs_demandas").update({ status: "confirmada", content_card_id: cardId, decided_at: new Date().toISOString(), decided_by: decidedBy }).eq("id", d.id);
          if (cardId) criados.push((d.resumo as string) || "card");
        }
        await csSendGroupText(msg.groupJid, criados.length === 1
          ? ackCriado(criados[0], null)
          : criados.length
            ? `Fechou! Criei ${criados.length} cards: ${criados.map((r) => `*${r}*`).join(", ")}. 🚀`
            : `Eita, não consegui criar os cards — algum sem cliente vinculado? Confere aí 🤔`);
        console.log(`[CS/inbound] multi-confirm → ${criados.length} cards`);
        return NextResponse.json({ ok: true, decision: "multi_confirmada", cards: criados.length });
      }
      if (ehConfirmacaoLivre(msg.text)) {
        await csSendGroupText(msg.groupJid, listarPendentes(pend));
        return NextResponse.json({ ok: true, decision: "listou_pendentes" });
      }
    }
  }

  // ─── Decisão humana (grupo interno): RESPONDA a sugestão com "ok" (cria) ou "não" (descarta) ───
  const decision = parseDecision(msg.text);
  if (decision && isInternalCmdGroup(msg.groupJid)) {
    const alvoDec: AlvoDemanda = demandaDaSugestao
      ? (demandaDaSugestao.status === "pendente"
          ? { demanda: demandaDaSugestao }
          : { demanda: null, jaDecidida: demandaDaSugestao })
      : await acharDemanda(msg.quotedMsgId, decision.codigo);
    const d = alvoDec.demanda;
    if (!d) {
      // Reply numa sugestão JÁ decidida (retry do webhook / segundo "ok") → avisa, não re-age.
      if (alvoDec.jaDecidida) {
        const jd = alvoDec.jaDecidida;
        await csSendGroupText(msg.groupJid,
          jd.status === "confirmada"
            ? `Essa eu já tinha criado o card (*${jd.resumo}*) 😉`
            : `Essa eu já tinha descartado (*${jd.resumo}*) 😉`,
          (jd.msg_id_sugestao as string) || undefined);
        return NextResponse.json({ ok: true, decision: "ja_decidida" });
      }
      if ((alvoDec.ambiguas ?? 0) >= 2) {
        await csSendGroupText(msg.groupJid, `Tem mais de uma sugestão aberta — responde *na mensagem* da que você quer, que aí não tem erro. 😉`);
        return NextResponse.json({ ok: true, decision: "ambigua" });
      }
      // "ok"/"não" solto sem pendente recente = papo da equipe → silêncio (responder "não achei"
      // a todo "ok" viraria spam). Só ajuda se a pessoa citou um código explícito.
      if (decision.codigo) {
        await csSendGroupText(msg.groupJid, `❓ Não achei essa sugestão pendente — responde *na própria mensagem* do agente que aí eu sei qual é. 😉`);
      }
      return NextResponse.json({ ok: true, decision: "not_found" });
    }
    const decidedBy = msg.authorName || msg.authorJid;
    const sug = (d.msg_id_sugestao as string) || undefined; // threading: responde a sugestão
    if (decision.acao === "descartar") {
      await supabaseAdmin.from("cs_demandas").update({ status: "descartada", decided_at: new Date().toISOString(), decided_by: decidedBy }).eq("id", d.id);
      await csSendGroupText(msg.groupJid, ackDescartado(d.resumo as string), sug);
      return NextResponse.json({ ok: true, decision: "descartada" });
    }
    const clientId = (d.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
    if (!clientId) {
      await csSendGroupText(msg.groupJid, `⚠️ Sem cliente pra criar o card de *${d.resumo}*.`, sug);
      return NextResponse.json({ ok: true, decision: "sem_cliente" });
    }
    // PAUTA SEMANAL: o "ok" cria UM card POR ITEM (com a data), não um card único.
    if (d.tipo === "pauta_semanal") {
      const itens = parsePautaItens((d.message_text as string) || "") ?? [];
      if (!itens.length) {
        await csSendGroupText(msg.groupJid, `Eita, não consegui recuperar os itens da pauta 😕 monta direto no board?`, sug);
        return NextResponse.json({ ok: true, decision: "pauta_sem_itens" });
      }
      const nota = ((d.briefing as string) || "").split("---").slice(1).join(" ").replace(/✏️/g, "").trim() || null;
      const ids = await criarCardsPauta({
        clientId, clienteNome: (d.cliente_nome as string) || "Cliente",
        responsavel: d.responsavel as string | null, itens, notaExtra: nota,
      });
      await supabaseAdmin.from("cs_demandas").update({
        status: "confirmada", content_card_id: ids[0] ?? null, decided_at: new Date().toISOString(), decided_by: decidedBy,
      }).eq("id", d.id);
      await csSendGroupText(msg.groupJid, ids.length
        ? `Fechou! Criei os ${ids.length} cards da pauta da *${d.cliente_nome}* no board, já com as datas. 📅`
        : `Eita, deu ruim pra criar os cards da pauta — tenta de novo?`, sug);
      console.log(`[CS/inbound] pauta ${d.codigo} confirmada → ${ids.length} cards`);
      return NextResponse.json({ ok: true, decision: "pauta_confirmada", cards: ids.length });
    }
    const cardId = await criarCardDemanda({
      clientId, clienteNome: (d.cliente_nome as string) || "Cliente", responsavel: d.responsavel as string | null,
      titulo: (d.resumo as string) || (d.message_text as string), urgencia: d.urgencia as string,
      briefing: (d.briefing as string) || (d.message_text as string), tipo: d.tipo as string,
      ajusteCardId: (d.content_card_id as string) ?? null,
    });
    await supabaseAdmin.from("cs_demandas").update({
      status: "confirmada", content_card_id: cardId, decided_at: new Date().toISOString(), decided_by: decidedBy,
    }).eq("id", d.id);
    await csSendGroupText(msg.groupJid, cardId
      ? ackCriado(d.resumo as string, d.responsavel as string | null)
      : `Eita, deu ruim pra criar o card de *${d.resumo}* — pode tentar de novo?`, sug);
    console.log(`[CS/inbound] demanda ${d.codigo} confirmada → card ${cardId}`);
    return NextResponse.json({ ok: true, decision: "confirmada", cardId });
  }

  // ─── Ajuste humano: RESPONDA a sugestão com "ajustar <o que mudar>" → enriquece o briefing ───
  const ajuste = parseAjuste(msg.text);
  if (ajuste && isInternalCmdGroup(msg.groupJid)) {
    const alvoAj: AlvoDemanda = demandaDaSugestao
      ? (demandaDaSugestao.status === "pendente"
          ? { demanda: demandaDaSugestao }
          : { demanda: null, jaDecidida: demandaDaSugestao })
      : await acharDemanda(msg.quotedMsgId);
    const d = alvoAj.demanda;
    if (!d) {
      if (alvoAj.jaDecidida) {
        await csSendGroupText(msg.groupJid,
          `Essa já foi decidida (*${alvoAj.jaDecidida.resumo}*) — se precisar mudar algo, edita o card na plataforma. 😉`,
          (alvoAj.jaDecidida.msg_id_sugestao as string) || undefined);
        return NextResponse.json({ ok: true, ajuste: "ja_decidida" });
      }
      if ((alvoAj.ambiguas ?? 0) >= 2) {
        await csSendGroupText(msg.groupJid, `Tem mais de uma sugestão aberta — responde *na mensagem* da que você quer ajustar. 😉`);
        return NextResponse.json({ ok: true, ajuste: "ambigua" });
      }
      if (!msg.quotedMsgId) {
        await csSendGroupText(msg.groupJid, `❓ Não achei a sugestão pra ajustar — responde *na própria mensagem* do agente. 😉`);
      }
      return NextResponse.json({ ok: true, ajuste: "not_found" });
    }
    const quem = msg.authorName || msg.authorJid;
    const sugAj = (d.msg_id_sugestao as string) || undefined; // threading
    const novoBriefing = `${(d.briefing as string) || (d.message_text as string)}\n\n---\n✏️ Ajuste (${quem}): ${ajuste.instrucao}`;
    await supabaseAdmin.from("cs_demandas").update({ briefing: novoBriefing }).eq("id", d.id);
    const r = await csSendGroupText(msg.groupJid,
      `✏️ Anotei o ajuste em *${d.resumo}*:\n\n${novoBriefing}\n\nResponde *ok* aqui que eu crio o card já com o ajuste.`, sugAj);
    if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", d.id);
    console.log(`[CS/inbound] demanda ${d.codigo} ajustada por ${quem}`);
    return NextResponse.json({ ok: true, ajuste: "ok" });
  }

  // ─── Resposta NATURAL da equipe (não foi keyword): interpreta a intenção com IA ───
  // Ex.: "coloca que a entrega é 8h-17h, pode criar" → entende = confirmar + complemento, cria o
  // card e responde no tom da Lone. Só dispara se há demanda pendente RECENTE (ou um reply).
  // Só interpreta como resposta natural se for um REPLY à PRÓPRIA sugestão do agente (quotedMsgId
  // casa com msg_id_sugestao). Sem isso, coordenação da equipe no grupo virava "confirmação" à toa
  // (alucinada). O "ok/não/ajustar" explícito (parseDecision/parseAjuste) segue funcionando sem reply.
  // NÃO gateia por !isTrivial: uma confirmação trivial ("beleza", "show", "Ok!") respondendo (reply)
  // a uma sugestão DEVE ser interpretada — antes o isTrivial engolia e o card nunca era criado.
  if (isInternalCmdGroup(msg.groupJid) && isOpenAIConfigured() && (msg.quotedMsgId || ehConfirmacaoLivre(msg.text))) {
    let alvo = demandaDaSugestao?.status === "pendente" ? demandaDaSugestao : null;
    // Sem reply, mas a mensagem parece confirmação ("cria o card", "pode criar", "tá certo"):
    // interpreta se houver EXATAMENTE 1 demanda pendente recente (com 2+ o bloco de desambiguação
    // acima já cuidou; com 0 não há o que confirmar). O próprio interpretador filtra papo à toa
    // (devolve "ignorar"), então não vira confirmação alucinada.
    if (!alvo && !msg.quotedMsgId) {
      const desde1 = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const { data: p1 } = await supabaseAdmin.from("cs_demandas").select("*")
        .eq("status", "pendente").gte("created_at", desde1)
        .order("created_at", { ascending: false }).limit(2);
      if (p1 && p1.length === 1) alvo = p1[0];
    }
    if (alvo) {
      const interp = await interpretarResposta({
        clienteNome: (alvo.cliente_nome as string) || "Cliente",
        resumo: (alvo.resumo as string) || (alvo.message_text as string) || "",
        briefing: (alvo.briefing as string) || "",
        mensagemEquipe: msg.text,
        responsavel: (alvo.responsavel as string) || msg.authorName || "",
      });
      if (interp.ok && interp.data && interp.data.acao !== "ignorar") {
        const i = interp.data;
        const quem = msg.authorName || msg.authorJid;
        const sug = (alvo.msg_id_sugestao as string) || undefined; // threading: responde a sugestão
        let briefingFinal = (alvo.briefing as string) || (alvo.message_text as string) || "";
        if (i.complemento) {
          briefingFinal = `${briefingFinal}\n\n---\n✏️ ${quem}: ${i.complemento}`.trim();
          await supabaseAdmin.from("cs_demandas").update({ briefing: briefingFinal }).eq("id", alvo.id);
        }
        // Memória do cliente: fato durável → vira REGRA estruturada (do's & don'ts), não texto
        // solto no fixed_briefing (que o A3 ignora quando há campaign_briefing). Dedup pelo texto.
        if (i.aprendizado && alvo.client_id) {
          const textoRegra = i.aprendizado.trim().slice(0, 200);
          const { data: existentes } = await supabaseAdmin
            .from("cs_client_rules").select("id")
            .eq("client_id", alvo.client_id as string).eq("texto", textoRegra).eq("ativo", true).limit(1);
          if (!existentes || existentes.length === 0) {
            await supabaseAdmin.from("cs_client_rules").insert({
              client_id: alvo.client_id as string, texto: textoRegra, escopo: "sempre", origem: "aprendido",
              source_message: msg.text, author: quem,
              expires_at: ehFatoTemporario(textoRegra) ? new Date(Date.now() + 14 * 86400000).toISOString() : null,
            });
            console.log(`[CS/inbound] aprendi (regra) sobre ${alvo.cliente_nome}: ${textoRegra}`);
            await sincronizarBriefingAprendido(alvo.client_id as string); // enriquece o briefing visível
          }
        }
        if (i.acao === "descartar") {
          const MOTIVOS = ["nao_e_demanda", "equipe_resolve", "cliente_desistiu"];
          const motivo = MOTIVOS.includes(i.motivo_descarte as string) ? i.motivo_descarte : null;
          await supabaseAdmin.from("cs_demandas").update({ status: "descartada", decided_at: new Date().toISOString(), decided_by: quem, motivo_descarte: motivo }).eq("id", alvo.id);
          await csSendGroupText(msg.groupJid, i.resposta, sug);
          return NextResponse.json({ ok: true, interp: "descartada" });
        }
        if (i.acao === "confirmar") {
          const clientId = (alvo.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
          const tituloFinal = (i.titulo as string) || (alvo.resumo as string) || (alvo.message_text as string);
          let cardId: string | null = null;
          if (clientId && alvo.tipo === "pauta_semanal") {
            // Resposta natural confirmando uma PAUTA → cria um card por item.
            const itensPauta = parsePautaItens((alvo.message_text as string) || "") ?? [];
            const idsPauta = await criarCardsPauta({
              clientId, clienteNome: (alvo.cliente_nome as string) || "Cliente",
              responsavel: alvo.responsavel as string | null, itens: itensPauta,
              notaExtra: i.complemento || null,
            });
            cardId = idsPauta[0] ?? null;
          } else if (clientId) cardId = await criarCardDemanda({
            clientId, clienteNome: (alvo.cliente_nome as string) || "Cliente", responsavel: alvo.responsavel as string | null,
            titulo: tituloFinal, urgencia: alvo.urgencia as string,
            briefing: briefingFinal, tipo: alvo.tipo as string,
            ajusteCardId: (alvo.content_card_id as string) ?? null,
          });
          await supabaseAdmin.from("cs_demandas").update({ status: "confirmada", content_card_id: cardId, resumo: tituloFinal, decided_at: new Date().toISOString(), decided_by: quem }).eq("id", alvo.id);
          await csSendGroupText(msg.groupJid, i.resposta, sug);
          console.log(`[CS/inbound] interp ${alvo.codigo} → confirmada, card ${cardId}`);
          return NextResponse.json({ ok: true, interp: "confirmada", cardId });
        }
        // ajustar → segue pendente; manda o ack (a IA já frasou "anotei, e aí?")
        const r = await csSendGroupText(msg.groupJid, i.resposta, sug);
        if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", alvo.id);
        return NextResponse.json({ ok: true, interp: "ajustada" });
      }
    }
  }

  // ─── Agente "Lone": radar de DATAS ("Lone, que datas vêm aí?") — 30 dias × carteira. Determinístico. ───
  if (!demandaDaSugestao && isInternalCmdGroup(msg.groupJid) && ehPerguntaDatas(msg.text)) {
    const prox = proximasDatas(spNow(), 30);
    if (prox.length === 0) {
      await csSendGroupText(msg.groupJid, "Os próximos 30 dias tão sem data comemorativa relevante no meu radar. 😌");
      return NextResponse.json({ ok: true, datas: 0 });
    }
    const { data: cls } = await supabaseAdmin
      .from("clients").select("name, nome_fantasia, nicho, industry, assigned_social")
      .or("active.is.null,active.eq.true").not("assigned_social", "is", null).not("name", "ilike", "%(teste)%");
    const carteira = (cls ?? []).map((c) => ({
      nome: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      tags: tagsDoNicho((c.nicho as string) || (c.industry as string)),
    }));
    const linhas = prox.slice(0, 10).map((d) => {
      const enc = carteira.filter((c) => dataEncaixa(d, c.tags));
      const quem = d.tags.includes("geral")
        ? "todo mundo"
        : `${enc.slice(0, 3).map((c) => c.nome).join(", ")}${enc.length > 3 ? ` +${enc.length - 3}` : ""}`;
      return `• ${formatDataCurta(d)}${enc.length ? ` · encaixa: ${quem}` : ""}`;
    });
    await csSendGroupText(msg.groupJid, [`📅 *Próximas datas (30 dias):*`, ``, ...linhas, ``, `Quer ideias pra alguma? "Lone, ideias de post pro [cliente]" 😉`].join("\n"));
    console.log(`[CS/inbound] datas → ${prox.length} datas listadas`);
    return NextResponse.json({ ok: true, datas: prox.length });
  }

  // ─── Agente "Lone": IDEIAS de post ("Lone, me dá ideias de post pro Contele") ───
  // Banco de ideias na hora: briefing + histórico (não repete) + datas chegando. Reusa o motor da pauta.
  if (!demandaDaSugestao && isInternalCmdGroup(msg.groupJid) && ehPedidoIdeias(msg.text) && isOpenAIConfigured()) {
    const alvo = await resolveClientePorNome(msg.text);
    if (!alvo) {
      await csSendGroupText(msg.groupJid, "Pra qual cliente? Me fala o nome que eu mando as ideias. 😉");
      conversaAtiva.set(chaveConversa(msg.groupJid, msg.authorJid), Date.now());
      return NextResponse.json({ ok: true, ideias: "sem_cliente" });
    }
    const [{ data: cliRow }, { data: hist }] = await Promise.all([
      supabaseAdmin.from("clients").select("fixed_briefing, campaign_briefing").eq("id", alvo.id).maybeSingle(),
      supabaseAdmin.from("content_cards").select("title").eq("client_id", alvo.id).is("archived_at", null).order("created_at", { ascending: false }).limit(10),
    ]);
    const briefingCli = await loadBriefingCombinado(alvo.id, (cliRow?.fixed_briefing as string) || (cliRow?.campaign_briefing as string));
    const regrasCli = (await fetchClientCsRules(alvo.id)).filter((rr) => rr.escopo !== "roteiro").map((rr) => rr.texto);
    const datasOferecidas = datasProximaSemana(spNow()).datas;
    const rIde = await gerarPautaSemanal({
      clienteNome: alvo.nome, clienteNicho: alvo.nicho,
      briefing: briefingCli, regras: regrasCli,
      historicoTitulos: (hist ?? []).map((h) => (h.title as string) || "").filter(Boolean),
      datas: datasOferecidas,
    });
    // Guarda igual à cs-pauta: o modelo não pode inventar dia fora dos oferecidos.
    const itensIde = (rIde.ok && rIde.data ? rIde.data.itens : []).filter((i) => datasOferecidas.includes(i.dia));
    if (!rIde.ok || itensIde.length === 0) {
      await csSendGroupText(msg.groupJid, `Não consegui montar ideias pro *${alvo.nome}* agora${briefingCli ? "" : " — ele tá sem briefing; preenche na plataforma que melhora MUITO"}. 😕`);
      return NextResponse.json({ ok: true, ideias: "falhou", erro: rIde.error });
    }
    const datasCli = proximasDatas(spNow(), 21).filter((d) => dataEncaixa(d, tagsDoNicho(alvo.nicho)));
    const extra = datasCli.length ? `\n\n📅 E vem aí: ${datasCli.slice(0, 2).map((d) => formatDataCurta(d)).join(" · ")} — boa deixa!` : "";
    await csSendGroupText(msg.groupJid, `💡 *Ideias de post — ${alvo.nome}:*\n\n${formatPauta(itensIde)}${extra}\n\nCurtiu alguma? "Lone, cria uma demanda na ${alvo.nome} sobre [ideia]" que eu já abro o card. 😉`);
    console.log(`[CS/inbound] ideias → ${alvo.nome} (${itensIde.length})`);
    return NextResponse.json({ ok: true, ideias: itensIde.length, cliente: alvo.nome });
  }

  // ─── Enriquecimento no grupo INTERNO: o time mandou um comando/áudio que JÁ virou demanda (ex.:
  // "Lone, cria a arte que o Mercadão pediu") e LOGO DEPOIS mandou o CONTEÚDO (produtos, texto, o
  // pedido completo). Esse follow-up deve COMPLETAR a demanda pendente — antes caía no "grupo sem
  // cliente" e se perdia, então a demanda ficava só com o áudio. Gate apertado: grupo interno,
  // conteúdo real, 1 pendente recente do MESMO autor, e não é pergunta/papo com a Lone nem comando. ───
  if (isInternalCmdGroup(msg.groupJid) && !demandaDaSugestao && isOpenAIConfigured()
      && !isTrivial(msg.text) && msg.text.trim().length >= 15
      && !ehPedidoCriarDemanda(msg.text) && !ehFalaComAgente(msg.text) && !ehPerguntaProLone(msg.text)) {
    const quemEnr = msg.authorName || msg.authorJid;
    const desdeEnr = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: pendEnr } = await supabaseAdmin.from("cs_demandas").select("*")
      .eq("group_jid", msg.groupJid).eq("author", quemEnr).eq("status", "pendente")
      .gte("created_at", desdeEnr).order("created_at", { ascending: false }).limit(2);
    if (pendEnr && pendEnr.length === 1) {
      const d = pendEnr[0];
      const combinado = `${(d.message_text as string) || ""}\n${msg.text}`.trim();
      let briefingNovo = `${(d.briefing as string) || ""}\n\n---\n✏️ ${quemEnr} complementou: ${msg.text}`.trim();
      let resumoNovo = (d.resumo as string) || msg.text.slice(0, 60);
      const { data: cEnr } = d.client_id
        ? await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("id", d.client_id as string).maybeSingle()
        : { data: null };
      if (cEnr) {
        const clienteBriefing = await loadBriefingCombinado(cEnr.id as string, briefingCompleto(cEnr));
        const csRules = await fetchClientCsRules(cEnr.id as string);
        const regras = csRules.filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
        const a3 = await gerarBriefing({
          clienteNome: nomeOf(cEnr), clienteNicho: cEnr.nicho as string, clienteBriefing, regras,
          tipo: (d.tipo as CsDemandType) || "arte_nova", urgencia: (d.urgencia as string) || "media",
          resumo: (d.resumo as string) || msg.text.slice(0, 80), mensagemOriginal: combinado,
        });
        if (a3.ok && a3.data) { briefingNovo = formatBriefing(a3.data); resumoNovo = a3.data.titulo; }
      }
      const mudou = resumoNovo.trim().toLowerCase() !== ((d.resumo as string) || "").trim().toLowerCase();
      await supabaseAdmin.from("cs_demandas").update({ message_text: combinado, briefing: briefingNovo, resumo: resumoNovo }).eq("id", d.id);
      if (mudou || briefingNovo.length > ((d.briefing as string) || "").length + 20) {
        const r = await csSendGroupText(msg.groupJid,
          `🔁 *COMPLEMENTO — ${d.cliente_nome}*\n\n📩 Completei o pedido com o que você mandou agora:\n*${resumoNovo}*\n\n👉 Vale o mesmo: *ok* · *não* · *ajustar*`,
          (d.msg_id_sugestao as string) || undefined);
        if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", d.id);
      }
      console.log(`[CS/inbound] enriqueci demanda interna ${d.codigo} com follow-up ("${msg.text.slice(0, 40)}")`);
      return NextResponse.json({ ok: true, enriquecida: d.codigo as string });
    }
  }

  // ─── A Lone CONVERSA com a equipe (fallback, DEPOIS de todos os comandos). Gatilho ABERTO: além de
  // "Lone…" e das perguntas operacionais, dispara em QUALQUER pergunta no grupo interno — e o próprio
  // MODELO decide se era pra ele (campo "ignorar") pra não virar tagarela. Chamado direto → sempre responde. ───
  const chamadoDireto = ehFalaComAgente(msg.text) || emConversa(msg.groupJid, msg.authorJid);
  const noGrupoEquipe = isTeamGroup(msg.groupJid);
  const querPapo = (isInternalCmdGroup(msg.groupJid) || noGrupoEquipe) && !isTrivial(msg.text) && isOpenAIConfigured();
  // MENOS TAGARELA (pedido do Roberto): o CS NÃO responde qualquer mensagem do grupo. Só dispara quando
  // (a) foi CHAMADO — "Lone…" ou conversa ativa recente — ou (b) fizeram uma PERGUNTA OPERACIONAL dele
  // (pendências/atrasos/entrega/demanda…). Recado solto, tag pra outra pessoa, "somente o panfleto",
  // "a arte foi entregue" → fica QUIETO. Antes qualquer msg no grupo Equipe (noGrupoEquipe) ou com "?"
  // disparava → virava conversa à toa.
  const dispara = querPapo && (chamadoDireto || ehPerguntaProLone(msg.text));
  if (dispara) {
    // ANTI-FRAGMENTAÇÃO: acumula os balões picados do mesmo autor e só responde quando ele para de
    // digitar (evita responder 2x a "raio x da me" + "Mr"). A resposta usa a MEMÓRIA curta do grupo.
    const chave = chaveConversa(msg.groupJid, msg.authorJid);
    const prev = pendPapo.get(chave);
    if (prev) { clearTimeout(prev.timer); prev.partes.push(msg.text); }
    const partes = prev ? prev.partes : [msg.text];
    const alvoPapo = {
      groupJid: msg.groupJid, authorJid: msg.authorJid, authorName: msg.authorName,
      quotedMsgId: msg.quotedMsgId, chamadoDireto, descontraido: noGrupoEquipe,
    };
    const timer = setTimeout(() => {
      pendPapo.delete(chave);
      void responderPapo({ ...alvoPapo, texto: partes.join(". ").slice(0, 800) });
    }, PAPO_DEBOUNCE_MS);
    pendPapo.set(chave, { timer, partes });
    return NextResponse.json({ ok: true, conversa: "debounce" });
  }

  // ─── Mensagem de cliente: A0 → A1 → A3 → sugere ───
  // SANDBOX de teste: no grupo de teste, a msg da equipe É tratada como pedido (pra testar o fluxo).
  const sandbox = ehSandbox(msg.groupJid);
  if (!sandbox && (isLoneTeam(msg.authorJid, teamJids()) || ehNomeEquipeLone(msg.authorName))) {
    // O time postou algo no grupo do cliente. Se for IMAGEM, é provável que seja a ARTE sendo
    // enviada/postada pro cliente (fora do botão). Tenta avançar o card do cliente automaticamente
    // (pedido do Roberto) — conservador: só age se houver UM card candidato claro.
    if (msg.isImage) void autoAvancarPorArteNoGrupo(msg.groupJid, msg.authorName);
    return NextResponse.json({ ok: true, skip: "autor = equipe Lone" });
  }
  // O grupo INTERNO é coordenação da equipe — nada aqui é demanda de cliente (já passou pelos
  // handlers internos: decisão/roteiro/comando/onboarding/interpretação). Evita "alucinada".
  // Exceção: grupo sandbox classifica mesmo sendo o interno (é o modo de teste do fluxo completo).
  if (isNaoClassifica(msg.groupJid) && !sandbox) return NextResponse.json({ ok: true, skip: "grupo interno/equipe — não classifica demanda" });

  // ─── Imagem: DESCREVE (visão gpt-4o-mini, detail low) e enriquece o texto → segue pro A1 como
  // qualquer demanda. Chega aqui foto de cliente (ou de qualquer um, no grupo sandbox), então a
  // visão só roda no que vai mesmo ser classificado. Foto irrelevante (meme/pessoal) sem legenda →
  // descrição null → cai no isTrivial abaixo e é descartada. ───
  if (msg.isImage && isOpenAIConfigured()) {
    const media = await csFetchMediaBase64(payload.data ?? {});
    if (media.base64 && media.base64.length <= 8_000_000) {
      const v = await describeImage(media.base64, media.mimetype);
      if (v.descricao) {
        msg.text = msg.text
          ? `${msg.text}\n[Imagem que o cliente enviou: ${v.descricao}]`
          : `[Imagem que o cliente enviou: ${v.descricao}]`;
        console.log(`[CS/inbound] 🖼️ imagem descrita (${msg.authorName || "?"}): "${v.descricao.slice(0, 80)}"`);
      } else if (!msg.text) {
        // Visão não leu a foto. Se o cliente JÁ tem demanda pendente recente (rajada de fotos), não
        // deixa cair: entra como mais um item do card. Fora de rajada, segue trivial (é descartada).
        const desdeRaj = new Date(Date.now() - COALESCE_WINDOW_S * 1000).toISOString();
        const { data: pRaj } = await supabaseAdmin.from("cs_demandas").select("id")
          .eq("group_jid", msg.groupJid).eq("author", msg.authorName || msg.authorJid).eq("status", "pendente")
          .gte("created_at", desdeRaj).limit(1);
        if (pRaj && pRaj.length > 0) {
          msg.text = "[Imagem que o cliente enviou: mais um produto — conferir os detalhes na própria foto]";
          console.log(`[CS/inbound] 🖼️ imagem sem leitura, mas em rajada → anexa ao card do ${msg.authorName || "?"}`);
        }
      }
    } else if (media.base64) {
      console.warn("[CS/inbound] imagem muito grande — skip visão");
    }
  }

  if (isTrivial(msg.text)) return NextResponse.json({ ok: true, skip: "trivial" });

  // Dedup: a Evolution reenvia `messages.upsert`. Se este message_id já gerou demanda, ignora.
  if (msg.messageId) {
    const { data: jaProcessada } = await supabaseAdmin
      .from("cs_demandas").select("id").eq("message_id", msg.messageId).limit(1).maybeSingle();
    if (jaProcessada) return NextResponse.json({ ok: true, skip: "message_id já processado (dedup)" });
  }

  let { data: clients } = await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("whatsapp_group_jid", msg.groupJid);
  const isTestGroup = (!clients || clients.length === 0) && allow.includes(msg.groupJid);
  if (isTestGroup && process.env.CS_TEST_CLIENT_ID) {
    // Grupo de teste: usa o cliente de teste (com briefing/assigned cadastrados) como stand-in.
    const { data: t } = await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("id", process.env.CS_TEST_CLIENT_ID).maybeSingle();
    if (t) clients = [t];
  }
  if (!clients || clients.length === 0) {
    console.warn("[CS/inbound] grupo sem cliente mapeado:", msg.groupJid);
    return NextResponse.json({ ok: true, skip: "grupo sem cliente" });
  }

  // TERMÔMETRO DE SATISFAÇÃO: em paralelo, sem travar o webhook. Só cliente real (não sandbox/teste)
  // e só texto de verdade (pula descrição de imagem). Se detectar insatisfação, avisa o time.
  if (!sandbox && !isTestGroup && msg.text && !msg.text.startsWith("[Imagem")) {
    void checarSatisfacao(clients[0] as { id: string; name?: string | null; nome_fantasia?: string | null; assigned_social?: string | null }, msg.text);
  }

  const multiCliente = clients.length > 1;
  const c = clients[0];
  if (c.agente_ativo === false) return NextResponse.json({ ok: true, skip: "agente pausado p/ este cliente" }); // S8
  // Carimba a última atividade do CLIENTE no grupo → detector de "cliente esfriando" (churn precoce).
  // Best-effort, não bloqueia (só falha se a migration 063 não estiver aplicada).
  if (c.id && !sandbox) void supabaseAdmin.from("clients").update({ last_client_msg_at: new Date().toISOString() }).eq("id", c.id as string).then(() => {});
  const clienteNome = nomeOf(c);
  // Texto livre OU o briefing estruturado (client_briefings) — o texto livre está vazio na base real.
  const clienteBriefing = await loadBriefingCombinado(c.id as string, briefingCompleto(c));
  // Do's & don'ts estruturados do cliente → injetados no A3 (independem do texto livre).
  // Preferência de ROTEIRO fica de fora (é do Criativo; como "regra firme" distorcia briefing de arte).
  const csRules = await fetchClientCsRules(c.id as string);
  const regrasFmt = csRules.filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);

  // ─── S3: o cliente APROVOU uma arte entregue? Marca o card e avisa o time (não publica sozinho).
  // NÃO retorna cedo: "Aprovadíssimo! Ah, e faz um story pro sábado" SEGUE pro A1 — o story vira
  // demanda em vez de morrer engolido pela aprovação. Cool-down de 15 min: rajada de aprovação
  // genérica ("ficou top" + "pode postar") não pode marcar o PRÓXIMO card que o cliente nem viu.
  // Update atômico (.is null): retry/corrida não re-aprova nem re-avisa. ───
  let aprovacaoDetectada: string | null = null;
  if (isOpenAIConfigured()) {
    const desde15 = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: aprovouRecem } = await supabaseAdmin
      .from("content_cards").select("id")
      .eq("client_id", c.id as string).gte("client_approved_at", desde15).limit(1);
    if (!aprovouRecem || aprovouRecem.length === 0) {
      const { data: cardAprov } = await supabaseAdmin
        .from("content_cards")
        .select("id, title")
        .eq("client_id", c.id as string)
        .is("client_approved_at", null)
        .not("designer_delivered_at", "is", null)
        .neq("status", "published")
        .order("designer_delivered_at", { ascending: false })
        .limit(1).maybeSingle();
      if (cardAprov) {
        const ap = await detectarAprovacao(msg.text, (cardAprov.title as string) || clienteNome);
        if (ap.ok && ap.data?.aprovou) {
          const nowIso = new Date().toISOString();
          // Aprovou → marca client_approved_at E AVANÇA pra Agendado (pedido do Roberto): sai da fila
          // de produção/aprovação e vira "pronto pra publicar". Atômico (.is null) contra corrida/retry.
          const { data: marcado } = await supabaseAdmin.from("content_cards")
            .update({ client_approved_at: nowIso, status: "scheduled", status_changed_at: nowIso })
            .eq("id", cardAprov.id).is("client_approved_at", null).select("id");
          if (marcado && marcado.length > 0) {
            aprovacaoDetectada = cardAprov.id as string;
            await supabaseAdmin.from("card_comments").insert({
              card_id: cardAprov.id as string, author: "🤖 CS", role: "system",
              text: `🎉 Cliente aprovou no grupo → movi pra *Agendado*. Pode publicar! (Se não era essa arte, é só voltar o status.)`,
            }).then(() => {}, () => {});
            const jid = internalGroupJid();
            if (jid) await csSendGroupText(jid, `🎉 O cliente *${clienteNome}* aprovou a arte *${cardAprov.title}*! Já movi pra *Agendado* — é só publicar. 🚀`);
            console.log(`[CS/inbound] cliente aprovou card ${cardAprov.id} → Agendado`);
          }
        }
      }
    }
  }

  // ─── Coalescência INTELIGENTE: complemento do mesmo autor+grupo em ≤30 min enriquece a demanda
  // pendente — e não é só append: re-roda o A1 no bloco combinado (urgência/tipo/assunto podem
  // mudar: "pra amanhã!!", "na verdade é Y"), re-redige o briefing (A3) e posta a atualização como
  // REPLY da sugestão original, pra equipe decidir em cima de informação ATUAL. Se o A1 enxergar
  // DUAS demandas distintas no combinado, NÃO coalesce — a msg nova segue o fluxo e vira demanda
  // própria. Mensagem consumida como aprovação (S3) não coalesce. ───
  const autor = msg.authorName || msg.authorJid;
  let pendente: Record<string, unknown> | null = null;
  if (!aprovacaoDetectada) {
    const desde = new Date(Date.now() - COALESCE_WINDOW_S * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("cs_demandas").select("id, codigo, message_text, briefing, tipo, urgencia, resumo, confianca, msg_id_sugestao")
      .eq("group_jid", msg.groupJid).eq("author", autor).eq("status", "pendente")
      .gte("created_at", desde)
      .order("created_at", { ascending: false }).limit(2);
    // Só coalesce quando há EXATAMENTE 1 pendente do autor (alvo inequívoco). Com 2+, não dá pra
    // saber a qual o complemento pertence — mesclar no mais recente colava no card ERRADO. Deixa
    // virar demanda própria (a equipe decide) em vez de contaminar outro pedido.
    // EXCEÇÃO — rajada de IMAGENS: cliente mandando foto atrás de foto (vários produtos p/ arte) é
    // UM card só; mesmo com 2+ pendentes, anexa à mais recente (não deixa cair nem cria card novo).
    pendente = data && data.length === 1 ? data[0] : (msg.isImage && data && data.length >= 1 ? data[0] : null);
  }
  if (pendente) {
    const textoAntigo = (pendente.message_text as string) || "";
    const combinado = `${textoAntigo}\n${msg.text}`.trim();
    let ehDemandaSeparada = false;
    let reclassificou = false;
    let updates: Record<string, unknown> = {
      message_text: combinado,
      briefing: `${(pendente.briefing as string) || ""}\n\n+ (cliente complementou): ${msg.text}`.trim(),
    };
    // RAJADA DE IMAGENS: 2+ fotos de produto em sequência do mesmo cliente = UM card só, listando
    // cada produto no briefing (o designer faz o conjunto). NÃO fragmenta em vários cards nem deixa
    // cair nenhuma — mesmo que o A1 veja "produtos distintos". (Regra do Roberto — Império dos Pisos.)
    const nImagens = (combinado.match(/\[Imagem que o cliente enviou:/g) || []).length;
    const rajadaImagem = msg.isImage && nImagens >= 2;
    if (isOpenAIConfigured()) {
      const re = await classifyBlock(
        [{ author: autor, text: textoAntigo }, { author: autor, text: msg.text }],
        {
          clienteNome, clienteNicho: (c.nicho as string) || undefined, briefing: clienteBriefing,
          nomesEquipeLone: teamJids(), clientesDoGrupo: clients.map(nomeOf),
        },
      );
      const itens = re.ok && re.data ? re.data.itens.filter((i) => i.is_demanda && i.confianca >= 0.6) : [];
      if (itens.length >= 2 && !rajadaImagem) {
        ehDemandaSeparada = true; // assunto novo (texto) no meio da rajada → não mistura no mesmo card
      } else if (itens.length >= 1 || rajadaImagem) {
        const it = itens[0] ?? {
          tipo: pendente.tipo as string, urgencia: pendente.urgencia as string,
          resumo: (pendente.resumo as string) || "", confianca: (pendente.confianca as number) ?? 0.7,
        };
        const urgOrd: Record<string, number> = { baixa: 0, media: 1, alta: 2 };
        const urg = (urgOrd[it.urgencia] ?? 0) >= (urgOrd[pendente.urgencia as string] ?? 0)
          ? it.urgencia : (pendente.urgencia as string);
        const a3 = await gerarBriefing({
          clienteNome, clienteNicho: c.nicho as string, clienteBriefing, regras: regrasFmt,
          tipo: it.tipo, urgencia: urg, resumo: it.resumo,
          mensagemOriginal: rajadaImagem
            ? `${combinado}\n\n(OBS: o cliente enviou ${nImagens} imagens de produtos em sequência — é UM card só; contemple e LISTE todos os produtos no briefing.)`
            : combinado,
        });
        const baseTitulo = a3.ok && a3.data ? a3.data.titulo : (it.resumo || (pendente.resumo as string) || "Artes promocionais");
        const resumoFinal = rajadaImagem
          ? `${baseTitulo.replace(/\s*\(\d+ itens\)\s*$/, "")} (${nImagens} itens)`
          : baseTitulo;
        updates = {
          message_text: combinado, tipo: it.tipo, urgencia: urg, confianca: it.confianca,
          resumo: resumoFinal,
          briefing: a3.ok && a3.data ? formatBriefing(a3.data) : (updates.briefing as string),
        };
        reclassificou = true;
      }
      // 0 itens (ex.: complemento retratou tudo) → mantém o append simples; humano decide.
    }
    if (!ehDemandaSeparada) {
      await supabaseAdmin.from("cs_demandas").update(updates).eq("id", pendente.id);
      const jidInt = internalGroupJid();
      // Só reposta o COMPLEMENTO se o pedido MUDOU de verdade (resumo diferente ou urgência subiu) —
      // reescrita cosmética do A3 vira update SILENCIOSO, sem empilhar vários COMPLEMENTOs no grupo.
      const resumoAntigo = ((pendente.resumo as string) || "").trim().toLowerCase();
      const resumoNovo = ((updates.resumo as string) || "").trim().toLowerCase();
      const urgenciaSubiu = updates.urgencia === "alta" && pendente.urgencia !== "alta";
      const mudouMaterial = (!!resumoNovo && resumoNovo !== resumoAntigo) || urgenciaSubiu;
      if (reclassificou && jidInt && mudouMaterial) {
        const r = await csSendGroupText(jidInt,
          `🔁 *COMPLEMENTO — ${clienteNome}*\n\n📩 O cliente completou o pedido — agora é:\n*${updates.resumo as string}*${updates.urgencia === "alta" ? " · ⚡ urgência alta" : ""}\n\n👉 Vale o mesmo: *ok* · *não* · *ajustar*`,
          (pendente.msg_id_sugestao as string) || undefined);
        if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", pendente.id);
      }
      console.log(`[CS/inbound] coalesce${reclassificou ? "+reclass" : ""} → demanda ${pendente.codigo} (+"${msg.text.slice(0, 40)}")`);
      return NextResponse.json({ ok: true, coalesced: pendente.codigo as string, reclassificada: reclassificou });
    }
    console.log(`[CS/inbound] rajada com assunto novo → não coalesce, segue como demanda própria`);
  }

  if (!isOpenAIConfigured()) {
    return NextResponse.json({ ok: true, classified: false, reason: "A1 desligado (sem key)", cliente: clienteNome });
  }

  // Autoaprendizado (Nível 2): recusas (falso-positivos a evitar) E confirmadas (padrão do que É
  // demanda real DESTE cliente — pedido recorrente ganha confiança e poupa chamadas do A2 gpt-4o).
  const d30iso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: recusadas }, { data: confirmadas }] = await Promise.all([
    // Só descartes "nao_e_demanda" ensinam o A1 — "não (você cuida)" descarta demanda REAL e
    // contaminava o aprendizado (o A1 aprendia a silenciar pedidos legítimos parecidos).
    supabaseAdmin.from("cs_demandas").select("message_text, resumo")
      .eq("client_id", c.id as string).eq("status", "descartada").eq("motivo_descarte", "nao_e_demanda")
      .gte("created_at", d30iso).order("created_at", { ascending: false }).limit(5),
    supabaseAdmin.from("cs_demandas").select("message_text, tipo")
      .eq("client_id", c.id as string).eq("status", "confirmada")
      .gte("created_at", d30iso).order("created_at", { ascending: false }).limit(5),
  ]);
  const recusasRecentes = (recusadas ?? [])
    .map((r) => ((r.message_text as string) || (r.resumo as string) || "").trim().slice(0, 120))
    .filter(Boolean);
  const confirmadasRecentes = (confirmadas ?? [])
    .map((r) => {
      const t = ((r.message_text as string) || "").trim().slice(0, 120);
      // #4: rótulo explícito de edição — reforça que, pra ESTE cliente, mensagens assim são
      // EDIÇÃO de uma arte que já existe (não pedido novo). O A1 calibra o edição-vs-novo por cliente.
      const rot = r.tipo === "ajuste_arte" ? "ajuste_arte (edição de uma arte já existente)" : (r.tipo as string);
      return t ? `"${t}" → ${rot}` : "";
    })
    .filter(Boolean);

  // Data/hora de SP no contexto: urgência e data comemorativa dependem de saber que dia é hoje.
  const spAgora = spNow();
  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const dataHoraAtual = `${DIAS_SEMANA[spAgora.getDay()]}, ${String(spAgora.getDate()).padStart(2, "0")}/${String(spAgora.getMonth() + 1).padStart(2, "0")}/${spAgora.getFullYear()} ${String(spAgora.getHours()).padStart(2, "0")}:${String(spAgora.getMinutes()).padStart(2, "0")} (horário de Brasília)`;

  // ─── DATA/EVENTO FUTURO: o cliente citou uma data (promoção dia 12, evento, lançamento) → agenda um
  // lembrete no calendário do social responsável. O cron cs-eventos avisa faltando 5 e 2 dias. Não
  // atrapalha a classificação de demanda (roda em paralelo, best-effort). Pré-filtro barato antes da IA.
  if (c.id && !sandbox && pareceTerData(msg.text) && isOpenAIConfigured()) {
    const hojeISO = spAgora.toISOString().slice(0, 10);
    const ev = await detectarEventoFuturo(msg.text, hojeISO, DIAS_SEMANA[spAgora.getDay()]);
    const d = ev.ok ? ev.data : null;
    if (d?.is_evento && d.data && /^\d{4}-\d{2}-\d{2}$/.test(d.data) && d.data > hojeISO) {
      const tituloEv = d.titulo.slice(0, 80);
      // Dedup: mesma data + título parecido já anotado pro cliente → não duplica.
      const { data: jaEv } = await supabaseAdmin.from("cs_client_events")
        .select("id").eq("client_id", c.id as string).eq("event_date", d.data).eq("status", "ativo")
        .ilike("titulo", `${tituloEv.slice(0, 15)}%`).limit(1).maybeSingle();
      if (!jaEv) {
        const assignedSocial = (c.assigned_social as string) || null;
        await supabaseAdmin.from("cs_client_events").insert({
          client_id: c.id as string, group_jid: msg.groupJid, titulo: tituloEv,
          descricao: (d.descricao || "").slice(0, 300), event_date: d.data,
          assigned_social: assignedSocial, source_message: msg.text.slice(0, 500),
        });
        const dataBR = new Date(`${d.data}T12:00:00`).toLocaleDateString("pt-BR");
        // Notificação no sistema pro social responsável (por cliente).
        await supabaseAdmin.from("notifications").insert({
          type: "content", title: `📅 Data do ${clienteNome}: ${tituloEv}`,
          body: `${clienteNome} avisou: ${d.descricao} — dia ${dataBR}. Vale preparar conteúdo. Lembro faltando 5 e 2 dias.`,
          client_id: c.id as string,
        }).then(() => {}, () => {});
        // Confirma no grupo interno (tom do time; não fala com o cliente).
        const jidEv = internalGroupJid();
        if (jidEv) await csSendGroupText(jidEv, `📅 *Anotei uma data — ${clienteNome}*\n*${tituloEv}* em ${dataBR}${assignedSocial ? ` · ${assignedSocial}` : ""}\n_${d.descricao}_\n\nTá no calendário — lembro o time faltando 5 e 2 dias. 📌`);
        console.log(`[CS/inbound] 📅 evento futuro → ${clienteNome}: ${tituloEv} (${d.data})`);
      }
    }
  }

  const ctx: ClassifierContext = {
    clienteNome,
    clienteNicho: (c.nicho as string) || undefined,
    briefing: clienteBriefing,
    nomesEquipeLone: teamJids(),
    clientesDoGrupo: clients.map(nomeOf),
    recusasRecentes,
    confirmadasRecentes,
    dataHoraAtual,
  };

  const res = await classifyBlock([{ author: msg.authorName || "Cliente", text: msg.text }], ctx);
  if (!res.ok || !res.data) {
    console.error("[CS/inbound] A1 falhou:", res.error);
    return NextResponse.json({ ok: true, classified: false, reason: res.error });
  }

  const internalJid = internalGroupJid();
  const sugeridas: string[] = [];

  // Férias/ausência: quem está fora agora (pra avisar na sugestão se a demanda for roteada pra ele).
  const { data: foraData } = await supabaseAdmin
    .from("team_members").select("name")
    .not("unavailable_until", "is", null).gt("unavailable_until", new Date().toISOString());
  const ausentes = (foraData ?? []).map((m) => (m.name as string).toLowerCase());
  const estaAusente = (resp: string): boolean => {
    const f = resp.trim().toLowerCase().split(/\s+/)[0];
    return !!f && ausentes.some((a) => a.includes(f) || a.split(/\s+/)[0] === f);
  };

  // info_operacional (KB): o cliente INFORMOU um fato durável (horário, contato, quem aprova…) →
  // vira MEMÓRIA do cliente (cs_client_rules), NÃO card. Guard-rails anti-envenenamento: cap de
  // texto (200), cap de 5 regras aprendidas/cliente/dia, e TTL de 14 dias quando o fato é
  // claramente temporário ("semana que vem", "até dia 15") — senão viraria regra eterna.
  for (const it of res.data.itens.filter((i) => i.tipo === "info_operacional")) {
    const texto = it.resumo?.trim().slice(0, 200);
    if (!texto || !c.id) continue;
    const [{ data: jaTem }, { count: aprendidas24h }] = await Promise.all([
      supabaseAdmin.from("cs_client_rules")
        .select("id").eq("client_id", c.id as string).eq("texto", texto).eq("ativo", true).limit(1),
      supabaseAdmin.from("cs_client_rules").select("id", { count: "exact", head: true })
        .eq("client_id", c.id as string).eq("origem", "aprendido")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    ]);
    if (jaTem && jaTem.length) continue;
    if ((aprendidas24h ?? 0) >= 5) {
      console.warn(`[CS/inbound] cap de aprendizado/dia atingido (${clienteNome}) — pulando: ${texto}`);
      continue;
    }
    const temporario = ehFatoTemporario(texto);
    await supabaseAdmin.from("cs_client_rules").insert({
      client_id: c.id as string, texto, escopo: "sempre", origem: "aprendido",
      source_message: msg.text, author: msg.authorName || msg.authorJid,
      expires_at: temporario ? new Date(Date.now() + 14 * 86400000).toISOString() : null,
    });
    if (!temporario) await sincronizarBriefingAprendido(c.id as string); // fato durável → enriquece o briefing
    if (internalJid) await csSendGroupText(internalJid, `🧠 Anotei do *${clienteNome}*: _${texto}_ — vou lembrar disso.${temporario ? " (por 2 semanas — parece coisa temporária)" : ""}`);
    console.log(`[CS/inbound] info_operacional → memória (${clienteNome}): ${texto}`);
  }

  for (const it of res.data.itens.filter((i) => i.is_demanda && i.confianca >= 0.6)) {
    // A2 — verificador cético só nos AMBÍGUOS (confiança < A2_TRUST_FROM). Refuta falso-positivo
    // antes de incomodar a equipe. Fail-open: erro de API no A2 não bloqueia o pipeline.
    if (it.confianca < A2_TRUST_FROM) {
      const a2 = await verificarDemanda({
        clienteNome, briefing: clienteBriefing, tipo: it.tipo as CsDemandType,
        resumo: it.resumo, trechoOrigem: it.trecho_origem, mensagemOriginal: msg.text,
      });
      if (a2.ok && a2.data && !a2.data.is_demanda_real) {
        console.log(`[CS/inbound] A2 refutou "${it.resumo}" (A1=${it.confianca}): ${a2.data.motivo}`);
        continue;
      }
    }
    const ehReclamacao = it.tipo === "reclamacao";
    const area = tipoToArea(it.tipo as CsDemandType);
    // Roteamento por grupo: anúncio/estratégia (área tráfego) → grupo do Julio; resto → grupo de artes.
    const destJid = area === "trafego" ? trafficGroupJid() : internalGroupJid();

    // Grupo com JID compartilhado por 2+ clientes (ex.: Bazar Ribeiro Maricá vs Saquarema): atribui
    // ao cliente que o A1 identificou (it.cliente), não sempre a clients[0]. Sem isso a demanda de
    // uma filial virava card da outra. Se o A1 não distinguir, mantém clients[0].
    let cItem = c;
    if (multiCliente && it.cliente) {
      const alvoN = normNome(it.cliente);
      const match = (clients ?? []).find((cl) => {
        const n = normNome(nomeOf(cl));
        return n === alvoN || (n.length >= 4 && alvoN.length >= 4 && (n.includes(alvoN) || alvoN.includes(n)));
      });
      if (match) cItem = match;
    }
    const clienteNomeItem = nomeOf(cItem);

    // COBRANÇA/STATUS: o cliente pode estar perguntando por algo JÁ em andamento. Antes de cobrar,
    // checa os cards do cliente. Se achar o tema, REPORTA o status (entregue? com quem?) em vez de
    // cobrar do zero — e pula o A3 (economiza tokens).
    let statusBriefing: string | null = null, statusTitulo: string | null = null, statusResp: string | null = null;
    if (it.tipo === "cobranca_prazo") {
      const card = await acharCardRelacionado(cItem.id as string, `${it.resumo} ${it.trecho_origem}`);
      if (card) {
        const entregue = !!card.designer_delivered_at;
        statusResp = card.social_media;
        statusTitulo = `Status: ${card.title}`;
        const quando = card.designer_delivered_at ? ` (entregue ${new Date(card.designer_delivered_at).toLocaleDateString("pt-BR")})` : "";
        statusBriefing = entregue
          ? `O cliente perguntou pela arte *${card.title}* — ela JÁ está em *${card.status}*${quando}. Provavelmente perguntou antes de ver. Confirma com ele que já saiu! 👍`
          : `O cliente perguntou pela arte *${card.title}* — está em *${card.status}*${statusResp ? ` com ${statusResp}` : ""}. Dá um retorno pro cliente sobre o andamento.`;
      }
    }

    // KB: reclamação ESCALA pra gestão; status → o dono do card; senão a área da demanda.
    const responsavel = ehReclamacao
      ? (process.env.CS_ESCALATION_NAMES || "Julio e Roberto")
      : statusResp || resolveResponsavel(area, {
          assigned_social: cItem.assigned_social as string, assigned_designer: cItem.assigned_designer as string, assigned_traffic: cItem.assigned_traffic as string,
        });

    // A3 só quando NÃO é status conhecido (redige o briefing; não inventa, pede o que falta).
    const a3 = statusBriefing ? null : await gerarBriefing({
      clienteNome: clienteNomeItem, clienteNicho: cItem.nicho as string, clienteBriefing, regras: regrasFmt,
      tipo: it.tipo, urgencia: it.urgencia, resumo: it.resumo, mensagemOriginal: msg.text,
    });
    const briefingTxt = statusBriefing ?? (a3?.ok && a3.data ? formatBriefing(a3.data) : `${it.resumo}\nMensagem: "${msg.text}"`);
    const titulo = statusTitulo ?? (a3?.ok && a3.data ? a3.data.titulo : it.resumo);
    const precisaConfirmar = !statusBriefing && !!(a3?.ok && a3.data?.observacao); // A3 achou o pedido vago

    // DEBOUNCE / coalescência da rajada: em vez de empilhar NOVO PEDIDO + vários COMPLEMENTOs numa
    // rajada de mensagens, funde tudo na MESMA demanda pendente e reposta o "🔁 juntei" no máximo
    // 1x/90s. Match: (1) MESMO resumo em 30 min (mesma peça) OU (2) RAJADA — mesmo cliente + tipo de
    // arte em 3 min (o resumo pode diferir a cada mensagem, mas é a mesma peça evoluindo, tipo Contele).
    if (cItem.id) {
      const COLS = "id, codigo, briefing, message_text, resumo, created_at, updated_at, msg_id_sugestao";
      const desdeExato = new Date(Date.now() - COALESCE_WINDOW_S * 1000).toISOString();
      const { data: exato } = await supabaseAdmin
        .from("cs_demandas").select(COLS)
        .eq("group_jid", msg.groupJid).eq("client_id", cItem.id as string).eq("status", "pendente")
        .eq("resumo", titulo).gte("created_at", desdeExato)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      let jaPend = exato;
      if (!jaPend && (it.tipo === "arte_nova" || it.tipo === "ajuste_arte")) {
        const desdeRajada = new Date(Date.now() - 180 * 1000).toISOString(); // 3 min
        const { data: rajada } = await supabaseAdmin
          .from("cs_demandas").select(COLS)
          .eq("group_jid", msg.groupJid).eq("client_id", cItem.id as string).eq("status", "pendente")
          .eq("tipo", it.tipo).gte("created_at", desdeRajada)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        jaPend = rajada;
      }
      if (jaPend) {
        // O resumo mais COMPLETO (mais longo) prevalece — "Post — promoção de kits (2 itens)" > "kits solares".
        const resumoFinal = titulo.length > ((jaPend.resumo as string) || "").length ? titulo : (jaPend.resumo as string);
        // Debounce: só reposta se o último aviso (updated_at, ou a criação) foi há > 90s. Senão, funde SILENCIOSO.
        const refIso = (jaPend.updated_at as string) || (jaPend.created_at as string);
        const reposta = destJid && (jaPend.msg_id_sugestao as string) && (!refIso || Date.now() - new Date(refIso).getTime() > 90_000);
        await supabaseAdmin.from("cs_demandas").update({
          message_text: `${(jaPend.message_text as string) || ""}\n${msg.text}`.trim(),
          briefing: `${(jaPend.briefing as string) || ""}\n\n+ (cliente complementou): ${msg.text}`.trim(),
          resumo: resumoFinal,
          ...(reposta ? { updated_at: new Date().toISOString() } : {}), // marca o repost p/ o próximo debounce
        }).eq("id", jaPend.id);
        if (reposta) {
          await csSendGroupText(destJid!, `🔁 A *${clienteNomeItem}* mandou mais coisas — juntei tudo no pedido de *${resumoFinal}*. Vale o mesmo: *ok* · *não* · *ajustar*.`, jaPend.msg_id_sugestao as string);
        }
        console.log(`[CS/inbound] rajada → fundiu na ${jaPend.codigo} (repost=${!!reposta})`);
        sugeridas.push(`dedup[${jaPend.codigo}]`);
        continue; // NÃO cria sugestão nova
      }
    }

    // AJUSTE DE ARTE EXISTENTE: se o cliente corrige uma arte já produzida, tenta casar com o card dela
    // (por tema do título). 1 card claro → vira EDIÇÃO daquele card (não abre novo). Ambíguo/sem match →
    // segue como pedido, mas PERGUNTA qual arte (nunca chuta o card errado — pergunta > roteamento errado).
    let ajusteCard: Awaited<ReturnType<typeof acharCardRelacionado>> = null;
    if (it.tipo === "ajuste_arte" && cItem.id) {
      ajusteCard = await acharCardRelacionado(cItem.id as string, `${it.resumo} ${it.trecho_origem}`);
    }
    const ajusteLinkado = ajusteCard && !ajusteCard.ambiguo ? ajusteCard : null;

    const codigo = randomBytes(2).toString("hex"); // mantido só p/ auditoria — NÃO aparece na mensagem
    const { data: novaDem, error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
      codigo, group_jid: msg.groupJid, client_id: (cItem.id as string) ?? null, cliente_nome: clienteNomeItem,
      author: msg.authorName || msg.authorJid, message_id: msg.messageId, message_text: msg.text,
      tipo: it.tipo, urgencia: it.urgencia, confianca: it.confianca, resumo: titulo,
      briefing: briefingTxt, responsavel, status: "pendente",
      content_card_id: ajusteLinkado ? ajusteLinkado.id : null, // edição roteada pra este card no "ok"
    }).select("id").single();
    if (insErr || !novaDem) { console.error("[CS/inbound] gravar demanda:", insErr?.message); continue; }
    sugeridas.push(`${it.tipo}/${it.urgencia}[${codigo}→${responsavel}]`);

    if (destJid) {
      // Mensagem CURTA e humana, SEM código — a equipe RESPONDE (reply) nesta mensagem.
      const a3d = a3?.ok ? a3.data : null;
      const acao = `👉 Responde aqui: *ok* (crio o card) · *não* (você cuida) · *ajustar*`;
      // Férias/ausência: se o responsável está fora, avisa pra alguém cobrir.
      const aviso = !ehReclamacao && estaAusente(responsavel) ? `⚠️ _${responsavel} tá fora (férias/ausência) — alguém cobre?_\n\n` : "";
      // 💬 Rascunho de resposta pro CLIENTE (só onde ele espera resposta): social copia e envia.
      let respostaSugerida = "";
      if (["duvida", "cobranca_prazo", "reclamacao"].includes(it.tipo) && isOpenAIConfigured()) {
        const rs = await sugerirResposta({
          clienteNome: clienteNomeItem, clientId: cItem.id as string, mensagemCliente: msg.text, tipo: it.tipo,
          briefing: clienteBriefing, statusInfo: statusBriefing,
        });
        if (rs.ok && rs.data?.resposta) respostaSugerida = `\n\n━━━━━━━\n💬 *Resposta pro cliente* (copie e envie, ou ajuste):\n_${rs.data.resposta}_`;
      }
      // Nota do #3 (pergunta > roteamento errado): é ajuste mas não achei a arte com certeza.
      const notaAjuste = (it.tipo === "ajuste_arte" && !ajusteLinkado)
        ? (ajusteCard?.ambiguo
            ? `\n\n❓ _Achei mais de uma arte parecida — me diz QUAL é pra eu aplicar o ajuste na certa (ou "ok" abre uma nova)._`
            : `\n\n❓ _Não localizei a arte anterior — se for ajuste de uma que já existe, me diz qual; senão o "ok" abre uma nova._`)
        : "";
      // Gramática visual fixa: cabeçalho (tipo — cliente) · 👤 responsável · 📩 fala do cliente · 👉 ação.
      const txt = aviso + (statusBriefing
        ? `👀 *ACOMPANHAMENTO — ${clienteNomeItem}*\n👤 ${responsavel}\n\n${statusBriefing}\n\n_Não é pedido novo._\n👉 *não* se já tratou · *ok* pra abrir um follow-up`
        : ehReclamacao
        ? `🔴 *RECLAMAÇÃO — ${clienteNomeItem}*\n👤 ${responsavel}, atenção.\n\n📩 O cliente disse:\n_"${a3d ? a3d.briefing.trim() : msg.text}"_\n\n👉 Responde aqui: *ok* (registro como demanda) · *não* (vocês tratam direto)`
        : precisaConfirmar
        ? `✏️ *PEDIDO PRA CONFIRMAR — ${clienteNomeItem}*\n👤 ${responsavel}\n\n📩 O cliente pediu:\n*${it.resumo}*\n\n❓ Tá meio vago — confirma com ele antes de produzir:\n${a3d?.observacao ?? ""}\n\n${acao}`
        : ajusteLinkado
        ? `✏️ *AJUSTE NA ARTE — ${clienteNomeItem}*\n👤 ${responsavel}\n📌 Arte: *${ajusteLinkado.title}*\n\n📩 O cliente pediu:\n*${it.resumo}*\n\n${a3d ? `📋 ${a3d.briefing.trim()}` : `📋 _"${msg.text}"_`}\n\n👉 *ok* (aplico o ajuste nessa arte — volta pra produção) · *não* · *ajustar*`
        : `🆕 *NOVO PEDIDO — ${clienteNomeItem}*\n👤 ${responsavel}\n\n📩 O cliente pediu:\n*${it.resumo}*\n\n${a3d ? `📋 ${a3d.briefing.trim()}\n_${a3d.formato_sugerido} · prazo ${a3d.prazo_sugerido}_` : `📋 _"${msg.text}"_`}${notaAjuste}\n\n${acao}`) + respostaSugerida;
      const r = await csSendGroupText(destJid, txt);
      // Guarda o id da msg postada → o "reply" da equipe casa com esta demanda (sem código).
      if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", novaDem.id);
      else if (!r.ok) console.error("[CS/inbound] post sugestão falhou:", r.error);
    }
  }

  console.log(`[CS/inbound] ${clienteNome} "${msg.text.slice(0, 60)}" → ${sugeridas.join(", ") || "nenhuma demanda"}${aprovacaoDetectada ? " (+aprovação)" : ""}`);
  return NextResponse.json({ ok: true, classified: true, cliente: clienteNome, sugeridas, multiCliente, aprovacao: aprovacaoDetectada });
  } catch (e) {
    // Falha no meio do processamento (ex.: IA 500, DB): LIBERA o claim pra o retry do Evolution poder
    // reprocessar. Sem isso, a mensagem ficava "processada" e a demanda se perdia pra sempre.
    if (msg.messageId) { try { await supabaseAdmin.from("cs_processed_messages").delete().eq("message_id", msg.messageId); } catch { /* ignore */ } }
    console.error("[CS/inbound] erro no processamento — claim liberado p/ retry:", e);
    return NextResponse.json({ ok: false, error: "erro interno no CS" }, { status: 500 });
  }
}
