// lib/cs/requests.ts — a pergunta do cliente como ESTADO, não como mensagem que passou.
//
// PRA QUE (25/08/2026): o sistema lia a mensagem e seguia. Não havia nada que respondesse
// "o que está aberto agora e há quanto tempo?" — era preciso varrer o histórico e inferir.
//
// Medido antes de escrever: 201 perguntas de cliente em 30 dias no expediente, mediana de resposta
// de 3 minutos, 30% passando de 30 min. O time é rápido; o alvo é o rabo da distribuição.

import { supabaseAdmin } from "@/lib/supabase/server";

/** 45 min, não 30. Com mediana de 3 minutos, 30 geraria alarme em cima de gente que ia responder
 *  de qualquer jeito — e alarme que toca à toa é o primeiro a ser ignorado. */
export const SLA_MINUTOS = 45;

export type TopicoRequest = "anuncio" | "arte" | "prazo" | "financeiro" | "outro";

/** Só abre request no expediente: pergunta das 22h não "vence" às 22h45. */
export function dentroDoExpediente(agora = new Date()): boolean {
  const brt = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dia = brt.getDay(), hora = brt.getHours();
  return dia >= 1 && dia <= 5 && hora >= 9 && hora < 18;
}

/** Pergunta de verdade — não é saudação nem "ok". Determinístico de propósito: roda em toda
 *  mensagem de cliente e não pode custar uma chamada de IA cada. */
export function pareceParaResponder(texto: string): boolean {
  const t = (texto || "").trim();
  if (t.length < 10) return false;
  // Saudação e confirmação não abrem pendência.
  if (/^\s*(bom dia|boa tarde|boa noite|oi|ol[áa]|opa|blz|beleza|ok|obrigad|valeu|show|top|perfeito|👍|🙏|❤️)\W*$/i.test(t)) return false;
  if (t.includes("?")) return true;
  // Fim de padrão com LOOKAHEAD, não \b: em JS o \b é ASCII, então "cadê\b" nunca casa — a borda
  // depois de "ê" não existe pro motor. Já custou um teste vermelho antes; aqui custaria a pergunta
  // não ser vista.
  return /\b(como (est[áa]|anda|ficou|foi)|quando|qual|quais|tem previs|d[áa] pra|consegue|poderia|pode ser|j[áa] (foi|est[áa]|saiu)|cad[êe]|novidade)(?=\s|[,.!?]|$)/i.test(t);
}

/** De que assunto é — decide qual fonte de fato consultar e quem sabe responder. */
export function classificarTopico(texto: string): TopicoRequest {
  const t = (texto || "").toLowerCase();
  // `s?` no plural e lookahead no fim: "os anúncios estão rodando bem aí?" — a frase real que
  // motivou tudo isto — não casava com "an[úu]ncio\b", porque o "s" do plural come a borda.
  if (/\ban[úu]ncios?|\bcampanhas?|\bimpulsion|\bmeta ads|\bfacebook ads|\bpatrocinad|\bverba|\binvestiment|\bleads?(?=\s|[,.!?]|$)/.test(t)) return "anuncio";
  if (/\b(artes?|posts?|criativos?|layout|banner|stor(y|ies)|feed|legendas?|design)(?=\s|[,.!?]|$)/.test(t)) return "arte";
  if (/\b(prazo|quando fica|previs[ãa]o|entregas?|atras)/.test(t)) return "prazo";
  if (/\b(boleto|nota fiscal|pagamento|fatura|mensalidade|cobran[çc]a)/.test(t)) return "financeiro";
  return "outro";
}

/**
 * Abre a pendência. Idempotente pelo id da mensagem — o webhook reenvia o mesmo evento.
 * Nunca lança: registrar a pergunta é observação, não pode derrubar o processamento dela.
 */
export async function abrirRequest(p: {
  clientId: string; groupJid: string; messageId?: string; texto: string; autor?: string;
}): Promise<string | null> {
  try {
    if (!dentroDoExpediente() || !pareceParaResponder(p.texto)) return null;

    // Uma pendência aberta por cliente já basta: o cliente que manda quatro perguntas seguidas tem
    // UM assunto em aberto, não quatro. Sem isto o alerta viraria enxurrada no primeiro dia.
    const { data: jaAberta } = await supabaseAdmin
      .from("customer_requests").select("id")
      .eq("client_id", p.clientId).eq("status", "aberta").limit(1);
    if (jaAberta?.length) return null;

    const vence = new Date(Date.now() + SLA_MINUTOS * 60_000).toISOString();
    const { data, error } = await supabaseAdmin.from("customer_requests").insert({
      client_id: p.clientId, group_jid: p.groupJid,
      origin_message_id: p.messageId ?? null,
      origin_text: p.texto.slice(0, 2000),
      author_name: p.autor ?? null,
      tipo: "pergunta",
      topico: classificarTopico(p.texto),
      vence_em: vence,
    }).select("id").maybeSingle();

    if (error) {
      if (error.code !== "23505") console.error("[CS/requests] abrir falhou:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (err) {
    console.error("[CS/requests] abrir falhou:", String(err));
    return null;
  }
}

/**
 * O time falou no grupo — isso fecha a pendência?
 *
 * "Bom dia, Vanessa!" NÃO responde "os anúncios estão rodando?". Medi: só 1,5% das primeiras
 * respostas são saudação pura, então o impacto prático é pequeno — mas o modelo não deve concluir
 * "respondido" só porque alguém falou depois. É barato checar e evita fechar pendência viva.
 */
export function respostaDeVerdade(texto: string): boolean {
  const t = (texto || "").trim();
  if (t.length < 8) return false;
  return !/^\s*(bom dia|boa tarde|boa noite|oi|ol[áa]|opa|e a[íi]|fala|blz|beleza|👍|🙏|❤️)\W*$/i.test(t);
}

/** Fecha as pendências abertas do cliente quando o time responde de verdade. */
export async function fecharPorResposta(p: {
  clientId: string; texto: string; messageId?: string; autor?: string;
}): Promise<number> {
  try {
    if (!respostaDeVerdade(p.texto)) return 0;
    const agora = new Date().toISOString();
    const { data } = await supabaseAdmin.from("customer_requests")
      .update({
        status: "respondida", respondida_em: agora, fechada_por: "time",
        resposta_message_id: p.messageId ?? null, respondida_por: p.autor ?? null,
        updated_at: agora,
      })
      .eq("client_id", p.clientId).eq("status", "aberta")
      .select("id");
    return data?.length ?? 0;
  } catch (err) {
    console.error("[CS/requests] fechar falhou:", String(err));
    return 0;
  }
}

export interface RequestVencida {
  id: string; clientId: string; cliente: string; groupJid: string;
  texto: string; autor: string | null; topico: TopicoRequest; minutos: number;
}

/** Pendências que passaram do SLA e ninguém assumiu. */
export async function vencidas(): Promise<RequestVencida[]> {
  const { data } = await supabaseAdmin
    .from("customer_requests")
    .select("id, client_id, group_jid, origin_text, author_name, topico, aberta_em, clients(name, nome_fantasia)")
    .eq("status", "aberta").lte("vence_em", new Date().toISOString())
    .order("aberta_em", { ascending: true });

  return (data ?? []).map((r) => {
    const cl = r.clients as unknown as { name?: string; nome_fantasia?: string } | null;
    return {
      id: r.id as string,
      clientId: r.client_id as string,
      cliente: cl?.nome_fantasia || cl?.name || "cliente",
      groupJid: r.group_jid as string,
      texto: r.origin_text as string,
      autor: (r.author_name as string) ?? null,
      topico: (r.topico as TopicoRequest) ?? "outro",
      minutos: Math.round((Date.now() - new Date(r.aberta_em as string).getTime()) / 60_000),
    };
  });
}

/** Marca como expirada depois de avisar — o alerta sai UMA vez por pendência. */
export async function marcarExpirada(id: string): Promise<void> {
  const agora = new Date().toISOString();
  await supabaseAdmin.from("customer_requests")
    .update({ status: "expirada", fechada_por: "tempo", updated_at: agora }).eq("id", id);
}
