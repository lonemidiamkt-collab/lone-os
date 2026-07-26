// lib/cs/mensagem-cliente.ts — a mensagem de qua/sex no grupo do CLIENTE deixa de ser sorteio.
//
// Como era: `pick()` de 5 textos fixos (lib/traffic/support-message.ts), 3×/semana, 508 envios em
// 30 dias. O mesmo "tem alguma novidade?" ia pro cliente que aprovou 4 artes hoje e pro que sumiu
// há 20 dias. O sistema sabia tudo sobre os dois e não usava nada — é isso que soa robô.
//
// Como fica: junta os SINAIS REAIS do cliente e escreve a partir deles. Sem sinal nenhum, cai no
// texto neutro de antes — melhor genérico do que forçar assunto.
//
// GUARDA-CORPOS (o cliente é quem lê; erro aqui custa caro):
//   • número só sai se estiver nos sinais — a IA não calcula, não estima, não arredonda
//   • nunca promete data/hora ("amanhã fica pronto", "até sexta")
//   • nunca fala de dinheiro (preço, verba, investimento, resultado financeiro)
//   • nunca cobra o cliente nem sugere que ele está devendo algo
//   • falhou a IA? cai no texto neutro. Nunca deixa o cliente sem mensagem nem manda meia-frase.

import { chatJson } from "@/lib/ai/openai";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEstiloCliente } from "./estilo";

export interface SinaisCliente {
  /** Artes esperando o OK do cliente (ele precisa agir). */
  aguardandoAprovacao: number;
  /** Artes entregues nos últimos 7 dias (a gente produziu). */
  entreguesNaSemana: number;
  /** Dias desde a última mensagem do cliente no grupo. null = nunca falou / sem registro. */
  diasSemFalar: number | null;
  /** Recebeu a pergunta da promoção do mês e não respondeu depois disso. */
  promoDoMesSemResposta: boolean;
  /** Post do período com mais engajamento (só se houver número real no snapshot). */
  destaqueIg: { curtidas: number; comentarios: number } | null;
  /** Posts publicados no Instagram nos últimos 7 dias (do snapshot). */
  postsNaSemana: number | null;
}

const VAZIO: SinaisCliente = {
  aguardandoAprovacao: 0, entreguesNaSemana: 0, diasSemFalar: null,
  promoDoMesSemResposta: false, destaqueIg: null, postsNaSemana: null,
};

/** Junta os sinais de UM cliente. Nunca lança — sem sinal, a mensagem cai no texto neutro. */
export async function coletarSinais(clientId: string): Promise<SinaisCliente> {
  try {
    const seteDias = new Date(Date.now() - 7 * 86400000).toISOString();
    const [cards, cli, igRow, calendario] = await Promise.all([
      supabaseAdmin.from("content_cards")
        .select("status, designer_delivered_at")
        .eq("client_id", clientId).is("archived_at", null),
      supabaseAdmin.from("clients").select("last_client_msg_at").eq("id", clientId).maybeSingle(),
      supabaseAdmin.from("client_ig_snapshots").select("data").eq("client_id", clientId).eq("period_kind", "7d").maybeSingle(),
      supabaseAdmin.from("client_group_message_log")
        .select("sent_at").eq("client_id", clientId).eq("kind", "calendar").eq("status", "sent")
        .order("sent_at", { ascending: false }).limit(1),
    ]);

    const linhas = (cards.data ?? []) as { status: string; designer_delivered_at: string | null }[];
    const aguardandoAprovacao = linhas.filter((c) => c.status === "client_approval").length;
    const entreguesNaSemana = linhas.filter((c) => c.designer_delivered_at && c.designer_delivered_at >= seteDias).length;

    const ultimaMsg = (cli.data?.last_client_msg_at as string | null) ?? null;
    const diasSemFalar = ultimaMsg ? Math.floor((Date.now() - new Date(ultimaMsg).getTime()) / 86400000) : null;

    // Promoção do mês: mandamos o calendário e o cliente não falou NADA depois disso.
    const enviadoEm = (calendario.data?.[0]?.sent_at as string | undefined) ?? null;
    const promoDoMesSemResposta = !!enviadoEm && (!ultimaMsg || ultimaMsg < enviadoEm);

    // Instagram: só entra se o número existir de verdade no snapshot.
    const ig = igRow.data?.data as {
      resumo?: { postsNoPeriodo?: number | null };
      posts?: { curtidas: number | null; comentarios: number | null }[];
    } | undefined;
    const topo = ig?.posts?.[0]; // o snapshot já vem ordenado por engajamento
    const destaqueIg = topo && (topo.curtidas ?? 0) > 0
      ? { curtidas: topo.curtidas ?? 0, comentarios: topo.comentarios ?? 0 }
      : null;

    return {
      aguardandoAprovacao, entreguesNaSemana, diasSemFalar, promoDoMesSemResposta, destaqueIg,
      postsNaSemana: ig?.resumo?.postsNoPeriodo ?? null,
    };
  } catch {
    return VAZIO;
  }
}

/** Tem alguma coisa concreta pra dizer? Se não, nem chama a IA. */
export function temAssunto(s: SinaisCliente): boolean {
  return s.aguardandoAprovacao > 0
    || s.entreguesNaSemana > 0
    || s.promoDoMesSemResposta
    || !!s.destaqueIg
    || (s.diasSemFalar !== null && s.diasSemFalar >= 10);
}

/** Vira as linhas de contexto que a IA pode usar. SÓ o que está aqui pode virar número na mensagem. */
export function descreverSinais(s: SinaisCliente): string[] {
  const l: string[] = [];
  if (s.aguardandoAprovacao > 0) l.push(`${s.aguardandoAprovacao} arte(s) esperando o OK dele pra poder publicar`);
  if (s.entreguesNaSemana > 0) l.push(`${s.entreguesNaSemana} arte(s) que a gente entregou nos últimos 7 dias`);
  if (s.postsNaSemana != null && s.postsNaSemana > 0) l.push(`${s.postsNaSemana} post(s) publicados no Instagram dele nos últimos 7 dias`);
  if (s.destaqueIg) l.push(`o post que mais engajou na semana teve ${s.destaqueIg.curtidas} curtidas e ${s.destaqueIg.comentarios} comentários`);
  if (s.promoDoMesSemResposta) l.push("a gente perguntou a promoção do mês e ele ainda não respondeu");
  if (s.diasSemFalar !== null && s.diasSemFalar >= 10) l.push(`ele não fala no grupo há ${s.diasSemFalar} dias`);
  return l;
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["mensagem"],
  properties: { mensagem: { type: "string" } },
};

const SYSTEM = `Você é o social media da Lone Mídia mandando a mensagem do dia no grupo de WhatsApp
de um CLIENTE (uma loja/comércio do interior do Rio). Escreve como gente: caloroso, próximo, tom
brasileiro de agência. Curto: 2 a 4 frases, no máximo 2 emojis.

# O que fazer
Puxe assunto a partir dos FATOS que te derem, e termine com uma pergunta ou um convite leve.
- Tem arte esperando o OK dele → lembre com leveza, sem cobrar.
- A gente entregou artes essa semana → reconheça o movimento e ofereça o próximo.
- Post foi bem → comemore com o número que te deram.
- Ele não fala há muitos dias → puxe conversa com carinho, sem cobrança nem culpa.
- Promoção do mês sem resposta → retome a pergunta com jeito, uma vez só.

# PROIBIDO (o cliente lê isso; errar aqui custa a relação)
- Inventar QUALQUER número. Só use os números que te derem, exatamente como vieram.
- Prometer data ou hora ("amanhã fica pronto", "até sexta", "em 2 dias").
- Falar de dinheiro: preço, orçamento, verba, investimento, faturamento, resultado em R$.
- Cobrar, culpar ou dar a entender que ele está devendo/atrasado com a gente.
- Dizer que "os resultados melhoraram/pioraram" sem número que comprove.
- Falar de assunto interno (designer, card, board, prazo da equipe, sistema).
- Escrever o nome cadastrado da loja — cumprimente com "Oi, pessoal!" ou parecido.

Responda APENAS no JSON do schema (campo "mensagem").`;

// Sinais de que a IA escorregou num guarda-corpo. Se bater, joga fora e usa o texto neutro —
// mensagem errada pro cliente é pior que mensagem genérica.
const PROIBIDO = [
  /R\$\s*\d/i,
  // Sem \b no FIM: o \b do JS é ASCII e não enxerga "ã"/"á" como letra, então "amanhã." não
  // fechava fronteira e a promessa de prazo passava batido. A âncora fica só na abertura.
  /(\bamanh[ãa]|\bhoje ainda|\bat[ée] (segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)|\bem \d+ dias?\b)/i,
  /\b(or[çc]amento|verba|investimento|faturamento|fatura|pre[çc]o|valor do plano|mensalidade)\b/i,
  /\b(voc[êe]s? (est[ãa]o|t[áa]) devendo|cobran[çc]a|atrasad[oa])\b/i,
];

/** Números que a IA pode citar — qualquer outro é invenção. */
function numerosPermitidos(s: SinaisCliente): Set<string> {
  const ok = new Set<string>();
  const add = (n: number | null | undefined) => { if (n != null) ok.add(String(n)); };
  add(s.aguardandoAprovacao); add(s.entreguesNaSemana); add(s.postsNaSemana);
  add(s.destaqueIg?.curtidas); add(s.destaqueIg?.comentarios); add(s.diasSemFalar);
  ok.add("9"); ok.add("2"); // dia dos pais / datas do calendário corrente citadas no contexto
  return ok;
}

export interface RevisaoMensagem {
  ok: boolean;
  motivo?: string;
}

/** Passa a mensagem pelos guarda-corpos. Exportado pra ser testável sem chamar a IA. */
export function revisarMensagem(texto: string, s: SinaisCliente): RevisaoMensagem {
  const t = (texto || "").trim();
  if (t.length < 20) return { ok: false, motivo: "curta demais" };
  if (t.length > 700) return { ok: false, motivo: "longa demais" };
  for (const re of PROIBIDO) {
    const m = t.match(re);
    if (m) return { ok: false, motivo: `assunto proibido: "${m[0]}"` };
  }
  const permitidos = numerosPermitidos(s);
  for (const n of t.match(/\d+/g) ?? []) {
    if (!permitidos.has(n)) return { ok: false, motivo: `número sem fonte: ${n}` };
  }
  return { ok: true };
}

export interface MensagemCliente {
  texto: string;
  /** "ia" = escrita a partir dos sinais; "neutro" = caiu no texto padrão. */
  origem: "ia" | "neutro";
  motivoNeutro?: string;
  sinaisUsados: string[];
}

/**
 * Monta a mensagem do dia pro grupo do cliente.
 * `textoNeutro` é o fallback (o texto fixo de hoje) — usado quando não há assunto, a IA falha,
 * ou a mensagem não passa nos guarda-corpos.
 */
export async function montarMensagemCliente(
  clientId: string,
  textoNeutro: string,
  diaDaSemana: "quarta" | "sexta",
): Promise<MensagemCliente> {
  const sinais = await coletarSinais(clientId);
  const usados = descreverSinais(sinais);

  if (!temAssunto(sinais)) {
    return { texto: textoNeutro, origem: "neutro", motivoNeutro: "sem sinal nenhum", sinaisUsados: [] };
  }

  const estilo = await getEstiloCliente(clientId);
  const contexto = [
    `Dia: ${diaDaSemana}-feira.`,
    diaDaSemana === "quarta" ? "Meio de semana." : "Fechando a semana, fim de semana chegando.",
    "",
    "FATOS (só isto é verdade; qualquer número fora daqui é invenção):",
    ...usados.map((u) => `- ${u}`),
    estilo ? `\nComo o cliente costuma falar (use SÓ pra calibrar formalidade — não copie gírias): ${estilo.slice(0, 300)}` : "",
  ].filter(Boolean).join("\n");

  const r = await chatJson<{ mensagem: string }>({
    model: "gpt-4o-mini", system: SYSTEM, user: contexto,
    schema: SCHEMA, schemaName: "mensagem_cliente", maxTokens: 300,
  });
  if (!r.ok || !r.data?.mensagem) {
    return { texto: textoNeutro, origem: "neutro", motivoNeutro: r.ok ? "IA devolveu vazio" : `IA falhou: ${r.error}`, sinaisUsados: usados };
  }

  const rev = revisarMensagem(r.data.mensagem, sinais);
  if (!rev.ok) {
    return { texto: textoNeutro, origem: "neutro", motivoNeutro: rev.motivo, sinaisUsados: usados };
  }
  return { texto: r.data.mensagem.trim(), origem: "ia", sinaisUsados: usados };
}
