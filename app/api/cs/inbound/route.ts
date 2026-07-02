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
import {
  ehOnboardingTrigger, parseOnboardingTrigger, onboardingWelcome, onboardingQuestion,
  onboardingDone, estruturarBriefing, ONBOARDING_TOTAL, type BriefingEstruturado,
} from "@/lib/cs/onboarding";
import { tipoToArea, resolveResponsavel } from "@/lib/cs/routing";
import { gerarBriefing, formatBriefing } from "@/lib/cs/briefing";
import { verificarDemanda, A2_TRUST_FROM } from "@/lib/cs/verifier";
import { interpretarResposta } from "@/lib/cs/interpreter";
import { detectarAprovacao } from "@/lib/cs/aprovacao";
import { gerarRoteiros, formatRoteiro, extrairPreferenciaRoteiro } from "@/lib/cs/criativo";
import { roteirosPdfHtml, loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { spNow } from "@/lib/cs/vigilancia";
import { loadBriefingForClient, loadRoteiroPrefs } from "@/lib/cs/load-briefing";
import { ehComandoAusencia, parseAusencia } from "@/lib/cs/ausencia";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { criarCardDemanda, criarCardsPauta } from "@/lib/cs/card";
import { parsePautaItens } from "@/lib/cs/pauta";
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
const internalGroupJid = () => process.env.CS_INTERNAL_GROUP_JID || null;

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
  const m = text.trim().match(/^(ok|sim|confirmar|confirma|nao|não|descartar|descarta)(?:\s+([a-z0-9]{3,8}))?$/i);
  if (!m) return null;
  const acao = /^(ok|sim|confirm)/i.test(m[1]) ? "confirmar" : "descartar";
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
  approval: "Aprovação interna", client_approval: "Aprovação do cliente", scheduled: "Agendado", published: "Publicado",
};

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

// Acha o cliente citado na mensagem: pontua por quantas palavras distintivas do nome aparecem.
async function resolveClientePorNome(text: string): Promise<{ id: string; nome: string; nicho?: string } | null> {
  const { data: clients } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, nicho, industry").or("active.is.null,active.eq.true");
  const t = normNome(text);
  let best: { id: string; nome: string; nicho?: string; score: number; maxw: number } | null = null;
  for (const c of clients ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "";
    const words = normNome(nome).split(/\s+/).filter((w) => w.length >= 4 && !STOP_NOME.has(w));
    let score = 0, maxw = 0;
    for (const w of words) {
      // Tolerância singular/plural: "Léo Carros" tem que casar com "leo carro mercedes".
      const casa = t.includes(w) || (w.endsWith("s") && t.includes(w.slice(0, -1)));
      if (casa) { score++; maxw = Math.max(maxw, w.length); }
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && maxw > best.maxw))) {
      best = { id: c.id as string, nome, nicho: (c.nicho as string) || (c.industry as string) || undefined, score, maxw };
    }
  }
  return best ? { id: best.id, nome: best.nome, nicho: best.nicho } : null;
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
    .order("created_at", { ascending: false }).limit(2);
  if (pend && pend.length === 1) return { demanda: pend[0] };
  return { demanda: null, ambiguas: pend?.length ?? 0 };
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
    resumo_estrategico: est.resumo_estrategico, posicionamento: est.posicionamento,
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
): Promise<{ title: string; status: string; social_media: string | null; designer_delivered_at: string | null } | null> {
  const { data: cards } = await supabaseAdmin
    .from("content_cards").select("title, status, social_media, designer_delivered_at")
    .eq("client_id", clientId).is("archived_at", null)
    .order("created_at", { ascending: false }).limit(25);
  if (!cards || !cards.length) return null;
  const tw = normNome(topic).split(/\s+/).filter((w) => w.length >= 4);
  if (!tw.length) return null;
  let best: { c: (typeof cards)[number]; score: number } | null = null;
  for (const card of cards) {
    const ct = normNome((card.title as string) || "");
    const score = tw.filter((w) => ct.includes(w)).length;
    if (score >= 2 && (!best || score > best.score)) best = { c: card, score };
  }
  if (!best) return null;
  return {
    title: (best.c.title as string) || "arte",
    status: (best.c.status as string) || "—",
    social_media: (best.c.social_media as string) || null,
    designer_delivered_at: (best.c.designer_delivered_at as string) || null,
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
  if (msg.quotedMsgId && msg.groupJid === internalGroupJid()) {
    const { data } = await supabaseAdmin.from("cs_demandas").select("*")
      .eq("msg_id_sugestao", msg.quotedMsgId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    demandaDaSugestao = data ?? null;
  }

  // ─── Agente "Lone": pedido de ROTEIRO no grupo interno ("Lone, faz um roteiro pro [cliente]") ───
  // Reconhece o pedido, acha o cliente, lê o briefing e devolve os roteiros. Se faltar briefing, pede.
  // Cada pedido vira corpus (cs_roteiro_pedidos) p/ ir aprendendo o estilo de cada cliente.
  const pedeRot = !demandaDaSugestao && msg.groupJid === internalGroupJid() && ehPedidoRoteiro(msg.text);
  // "ajusta/muda/troca…" só é ajuste de ROTEIRO se EXISTE roteiro recente (30 min). Checar ANTES
  // de reivindicar a mensagem: sem contexto, o fluxo segue (antes: return silencioso que engolia
  // respostas de demanda e poluía o corpus cs_roteiro_pedidos).
  let roteiroRecente: { clientId: string; nome: string; pedido: string } | null = null;
  if (!demandaDaSugestao && !pedeRot && msg.groupJid === internalGroupJid() && ehAjusteRoteiro(msg.text)) {
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

  // ─── Agente "Lone": pergunta de STATUS ("Lone, a demanda do Léo Carros foi feita?") ───
  // Acha o cliente + a demanda/card mais relacionados e reporta o estágio REAL. Determinístico.
  if (!demandaDaSugestao && msg.groupJid === internalGroupJid() && ehPerguntaStatus(msg.text)) {
    const alvoSt = await resolveClientePorNome(msg.text);
    if (!alvoSt) {
      await csSendGroupText(msg.groupJid, "De qual cliente? Me diz o nome que eu já te digo o status. 😉");
      return NextResponse.json({ ok: true, status_cmd: "sem_cliente" });
    }
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
  }

  // ─── Agente "Lone": equipe pede pra CRIAR uma demanda ("Lone, cria uma demanda na [cliente] sobre X").
  // SUGERE (mesmo formato da demanda de cliente) e espera "ok" pra criar o card. ───
  if (!demandaDaSugestao && msg.groupJid === internalGroupJid() && ehPedidoCriarDemanda(msg.text)) {
    if (!isOpenAIConfigured()) {
      await csSendGroupText(msg.groupJid, "Tô sem acesso à IA agora pra montar a demanda 😕");
      return NextResponse.json({ ok: true, demanda_cmd: "sem_ia" });
    }
    // Dedup do reenvio do webhook (a sugestão demora alguns segundos).
    if (msg.messageId) {
      const { data: ja } = await supabaseAdmin.from("cs_demandas").select("id").eq("message_id", msg.messageId).limit(1).maybeSingle();
      if (ja) return NextResponse.json({ ok: true, demanda_cmd: "dedup" });
    }
    const alvo = await resolveClientePorNome(msg.text);
    if (!alvo) {
      await csSendGroupText(msg.groupJid, "Pode deixar! 📝 De qual cliente é a demanda? Me diz o nome que eu monto.");
      return NextResponse.json({ ok: true, demanda_cmd: "sem_cliente" });
    }
    const { data: c } = await supabaseAdmin.from("clients").select(CLIENT_COLS).eq("id", alvo.id).maybeSingle();
    if (!c) return NextResponse.json({ ok: true, demanda_cmd: "cliente_sumiu" });
    const clienteNome = nomeOf(c);
    const clienteBriefing = briefingCompleto(c);
    const csRules = await fetchClientCsRules(c.id as string);
    // Preferência de ROTEIRO não é regra de arte — vazava pro A3 como "regra firme" e distorcia o briefing.
    const regrasFmt = csRules.filter((rr) => rr.escopo !== "roteiro").map((rr) => `${rr.texto} (${rr.escopo})`);
    const assunto = extrairAssunto(msg.text);
    const tipo: CsDemandType = "arte_nova";
    const a3 = await gerarBriefing({
      clienteNome, clienteNicho: c.nicho as string, clienteBriefing, regras: regrasFmt,
      tipo, urgencia: "media", resumo: assunto, mensagemOriginal: msg.text,
    });
    const briefingTxt = a3.ok && a3.data ? formatBriefing(a3.data) : `${assunto}\nPedido da equipe: "${msg.text}"`;
    const titulo = a3.ok && a3.data ? a3.data.titulo : assunto;
    const area = tipoToArea(tipo);
    const responsavel = resolveResponsavel(area, {
      assigned_social: c.assigned_social as string, assigned_designer: c.assigned_designer as string, assigned_traffic: c.assigned_traffic as string,
    });
    const quem = msg.authorName || msg.authorJid;
    const codigo = randomBytes(2).toString("hex");
    const { data: novaDem, error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
      codigo, group_jid: msg.groupJid, client_id: c.id as string, cliente_nome: clienteNome,
      author: quem, message_id: msg.messageId, message_text: msg.text,
      tipo, urgencia: "media", confianca: 1, resumo: titulo, briefing: briefingTxt, responsavel, status: "pendente",
    }).select("id").single();
    if (insErr || !novaDem) {
      console.error("[CS/inbound] criar demanda (cmd):", insErr?.message);
      await csSendGroupText(msg.groupJid, `Eita, não consegui montar a demanda do *${clienteNome}* agora 😕 tenta de novo?`);
      return NextResponse.json({ ok: true, demanda_cmd: "erro" });
    }
    const a3d = a3.ok ? a3.data : null;
    const txt = `Oi ${responsavel}! 👋 ${quem} pediu pra criar uma demanda pra *${clienteNome}*: *${titulo}*.\n\n${a3d ? a3d.briefing.trim() : `Pedido: "${msg.text}"`}${a3d ? `\n_${a3d.formato_sugerido} · prazo ${a3d.prazo_sugerido}_` : ""}\n\nResponde *nesta mensagem*: *ok* (crio o card) · *não* (deixa pra lá) · ou *ajustar* e me diz o que mudar.`;
    const rsug = await csSendGroupText(msg.groupJid, txt);
    if (rsug.ok && rsug.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: rsug.id }).eq("id", novaDem.id);
    console.log(`[CS/inbound] demanda por comando → ${clienteNome}: ${titulo} (${codigo})`);
    return NextResponse.json({ ok: true, demanda_cmd: "sugerida", cliente: clienteNome, titulo });
  }

  // ─── Onboarding: equipe avisa "Lone, entrou um novo cliente X no grupo Y" → o Lone CONDUZ lá. ───
  if (msg.groupJid === internalGroupJid() && ehOnboardingTrigger(msg.text)) {
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
  if (msg.groupJid === internalGroupJid() && ehComandoAusencia(msg.text)) {
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

  // ─── Decisão humana (grupo interno): RESPONDA a sugestão com "ok" (cria) ou "não" (descarta) ───
  const decision = parseDecision(msg.text);
  if (decision && msg.groupJid === internalGroupJid()) {
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
  if (ajuste && msg.groupJid === internalGroupJid()) {
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
  if (msg.groupJid === internalGroupJid() && !isTrivial(msg.text) && isOpenAIConfigured() && msg.quotedMsgId) {
    const alvo = demandaDaSugestao?.status === "pendente" ? demandaDaSugestao : null;
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

  // ─── Mensagem de cliente: A0 → A1 → A3 → sugere ───
  if (isLoneTeam(msg.authorJid, teamJids()) || ehNomeEquipeLone(msg.authorName)) return NextResponse.json({ ok: true, skip: "autor = equipe Lone" });
  // O grupo INTERNO é coordenação da equipe — nada aqui é demanda de cliente. (Já passou pelos
  // handlers internos: decisão/roteiro/comando/onboarding/interpretação.) Evita "alucinada".
  if (msg.groupJid === internalGroupJid()) return NextResponse.json({ ok: true, skip: "grupo interno — não classifica demanda" });
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

  const multiCliente = clients.length > 1;
  const c = clients[0];
  if (c.agente_ativo === false) return NextResponse.json({ ok: true, skip: "agente pausado p/ este cliente" }); // S8
  const clienteNome = nomeOf(c);
  const clienteBriefing = briefingCompleto(c);
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
          const { data: marcado } = await supabaseAdmin.from("content_cards")
            .update({ client_approved_at: new Date().toISOString() })
            .eq("id", cardAprov.id).is("client_approved_at", null).select("id");
          if (marcado && marcado.length > 0) {
            aprovacaoDetectada = cardAprov.id as string;
            const jid = internalGroupJid();
            if (jid) await csSendGroupText(jid, `🎉 O cliente *${clienteNome}* aprovou a arte *${cardAprov.title}*! Já pode agendar.`);
            console.log(`[CS/inbound] cliente aprovou card ${cardAprov.id}`);
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
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    pendente = data ?? null;
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
    if (isOpenAIConfigured()) {
      const re = await classifyBlock(
        [{ author: autor, text: textoAntigo }, { author: autor, text: msg.text }],
        {
          clienteNome, clienteNicho: (c.nicho as string) || undefined, briefing: clienteBriefing,
          nomesEquipeLone: teamJids(), clientesDoGrupo: clients.map(nomeOf),
        },
      );
      const itens = re.ok && re.data ? re.data.itens.filter((i) => i.is_demanda && i.confianca >= 0.6) : [];
      if (itens.length >= 2) {
        ehDemandaSeparada = true; // assunto novo no meio da rajada → não mistura no mesmo card
      } else if (itens.length === 1) {
        const it = itens[0];
        const urgOrd: Record<string, number> = { baixa: 0, media: 1, alta: 2 };
        const urg = (urgOrd[it.urgencia] ?? 0) >= (urgOrd[pendente.urgencia as string] ?? 0)
          ? it.urgencia : (pendente.urgencia as string);
        const a3 = await gerarBriefing({
          clienteNome, clienteNicho: c.nicho as string, clienteBriefing, regras: regrasFmt,
          tipo: it.tipo, urgencia: urg, resumo: it.resumo, mensagemOriginal: combinado,
        });
        updates = {
          message_text: combinado, tipo: it.tipo, urgencia: urg, confianca: it.confianca,
          resumo: a3.ok && a3.data ? a3.data.titulo : it.resumo,
          briefing: a3.ok && a3.data ? formatBriefing(a3.data) : (updates.briefing as string),
        };
        reclassificou = true;
      }
      // 0 itens (ex.: complemento retratou tudo) → mantém o append simples; humano decide.
    }
    if (!ehDemandaSeparada) {
      await supabaseAdmin.from("cs_demandas").update(updates).eq("id", pendente.id);
      const jidInt = internalGroupJid();
      if (reclassificou && jidInt) {
        const r = await csSendGroupText(jidInt,
          `🔁 A *${clienteNome}* complementou o pedido — atualizei: *${updates.resumo as string}*${updates.urgencia === "alta" ? " (urgência alta)" : ""}. Vale o mesmo: *ok* · *não* · *ajustar*.`,
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
      return t ? `"${t}" → ${r.tipo as string}` : "";
    })
    .filter(Boolean);

  // Data/hora de SP no contexto: urgência e data comemorativa dependem de saber que dia é hoje.
  const spAgora = spNow();
  const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const dataHoraAtual = `${DIAS_SEMANA[spAgora.getDay()]}, ${String(spAgora.getDate()).padStart(2, "0")}/${String(spAgora.getMonth() + 1).padStart(2, "0")}/${spAgora.getFullYear()} ${String(spAgora.getHours()).padStart(2, "0")}:${String(spAgora.getMinutes()).padStart(2, "0")} (horário de Brasília)`;

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

    // COBRANÇA/STATUS: o cliente pode estar perguntando por algo JÁ em andamento. Antes de cobrar,
    // checa os cards do cliente. Se achar o tema, REPORTA o status (entregue? com quem?) em vez de
    // cobrar do zero — e pula o A3 (economiza tokens).
    let statusBriefing: string | null = null, statusTitulo: string | null = null, statusResp: string | null = null;
    if (it.tipo === "cobranca_prazo") {
      const card = await acharCardRelacionado(c.id as string, `${it.resumo} ${it.trecho_origem}`);
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
          assigned_social: c.assigned_social as string, assigned_designer: c.assigned_designer as string, assigned_traffic: c.assigned_traffic as string,
        });

    // A3 só quando NÃO é status conhecido (redige o briefing; não inventa, pede o que falta).
    const a3 = statusBriefing ? null : await gerarBriefing({
      clienteNome, clienteNicho: c.nicho as string, clienteBriefing, regras: regrasFmt,
      tipo: it.tipo, urgencia: it.urgencia, resumo: it.resumo, mensagemOriginal: msg.text,
    });
    const briefingTxt = statusBriefing ?? (a3?.ok && a3.data ? formatBriefing(a3.data) : `${it.resumo}\nMensagem: "${msg.text}"`);
    const titulo = statusTitulo ?? (a3?.ok && a3.data ? a3.data.titulo : it.resumo);
    const precisaConfirmar = !statusBriefing && !!(a3?.ok && a3.data?.observacao); // A3 achou o pedido vago

    const codigo = randomBytes(2).toString("hex"); // mantido só p/ auditoria — NÃO aparece na mensagem
    const { data: novaDem, error: insErr } = await supabaseAdmin.from("cs_demandas").insert({
      codigo, group_jid: msg.groupJid, client_id: (c.id as string) ?? null, cliente_nome: clienteNome,
      author: msg.authorName || msg.authorJid, message_id: msg.messageId, message_text: msg.text,
      tipo: it.tipo, urgencia: it.urgencia, confianca: it.confianca, resumo: titulo,
      briefing: briefingTxt, responsavel, status: "pendente",
    }).select("id").single();
    if (insErr || !novaDem) { console.error("[CS/inbound] gravar demanda:", insErr?.message); continue; }
    sugeridas.push(`${it.tipo}/${it.urgencia}[${codigo}→${responsavel}]`);

    if (internalJid) {
      // Mensagem CURTA e humana, SEM código — a equipe RESPONDE (reply) nesta mensagem.
      const a3d = a3?.ok ? a3.data : null;
      const acao = `É só responder *nesta mensagem*: *ok* (crio o card) · *não* (você cuida) · ou *ajustar* e me diz o que mudar.`;
      // Férias/ausência: se o responsável está fora, avisa pra alguém cobrir.
      const aviso = !ehReclamacao && estaAusente(responsavel) ? `⚠️ _Heads up: ${responsavel} tá fora (férias/ausência) — alguém cobre?_\n\n` : "";
      const txt = aviso + (statusBriefing
        ? `Oi ${responsavel}! 👋 ${statusBriefing}\n\n_(É acompanhamento, não pedido novo — responde *não* se já tratou, ou *ok* se quer um card de follow-up.)_`
        : ehReclamacao
        ? `🔴 *RECLAMAÇÃO* da *${clienteNome}* — ${responsavel}, atenção:\n\n${a3d ? a3d.briefing.trim() : `"${msg.text}"`}\n\nResponde *aqui*: *ok* (registro como demanda) · *não* (vocês tratam direto).`
        : precisaConfirmar
        ? `Oi ${responsavel}! 👋 A *${clienteNome}* pediu: *${it.resumo}* — mas o pedido tá meio vago. Antes de produzir, confirma com eles:\n${a3d?.observacao ?? ""}\n\n${acao}`
        : `Oi ${responsavel}! 👋 A *${clienteNome}* pediu: *${it.resumo}*.\n\n${a3d ? a3d.briefing.trim() : `Mensagem: "${msg.text}"`}${a3d ? `\n_${a3d.formato_sugerido} · prazo ${a3d.prazo_sugerido}_` : ""}\n\n${acao}`);
      const r = await csSendGroupText(internalJid, txt);
      // Guarda o id da msg postada → o "reply" da equipe casa com esta demanda (sem código).
      if (r.ok && r.id) await supabaseAdmin.from("cs_demandas").update({ msg_id_sugestao: r.id }).eq("id", novaDem.id);
      else if (!r.ok) console.error("[CS/inbound] post sugestão falhou:", r.error);
    }
  }

  console.log(`[CS/inbound] ${clienteNome} "${msg.text.slice(0, 60)}" → ${sugeridas.join(", ") || "nenhuma demanda"}${aprovacaoDetectada ? " (+aprovação)" : ""}`);
  return NextResponse.json({ ok: true, classified: true, cliente: clienteNome, sugeridas, multiCliente, aprovacao: aprovacaoDetectada });
}
