export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { csSendGroupText, csSendGroupImage } from "@/lib/cs/notify";

// POST /api/cs/enviar-aprovacao { cardId } — o social/gestor CLICA e o CS manda as artes do card
// pro GRUPO DO CLIENTE, com uma mensagem padronizada (variada, pra não ficar robótico) pedindo
// aprovação. Disparo 100% no clique humano (nunca automático). Sai pelo número do CS (monitor[IA],
// EVOLUTION_*_NEW) — a pedido do Roberto, é o Lone CS que fala com o cliente, não o número do Julio.
// (Requer que o monitor[IA] esteja no grupo do cliente.) As artes ficam no bucket público `arts`
// → a Evolution baixa a URL direto.
const isImageUrl = (u: string) => /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
const MAX_ARTES = 20;

// Extrai o NOME do produto/tema a partir do título do card (ex.: "Mesa Fontana e Cadeira Horizonte").
// Tira sufixos internos ("(Post triplo)") e prefixos redundantes ("Artes de", "Post de"). Mantém a
// grafia original (é nome de produto). Vazio = título genérico → manda sem nome.
function nomeProduto(titulo?: string): string {
  let t = (titulo || "").trim();
  if (!t) return "";
  t = t.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();          // remove "(Post triplo)"
  t = t.replace(/^(artes?|posts?|cards?|criativos?)\s+(d[eoa]s?\s+)?/i, "").trim(); // remove "Artes de"
  return t.length < 2 ? "" : t;
}

// 5 variações da mensagem de aprovação, tom EDUCADO falando COM o cliente e citando o produto.
// Pede pro cliente verificar. Concorda em número. Escolhe uma aleatória.
function mensagemAprovacao(nArtes: number, nome: string): string {
  const artes = nArtes > 1 ? `as ${nArtes} artes` : "a arte";
  const alvo = nome ? `${artes} do produto *${nome}*` : artes; // "as 8 artes do produto *Mesa Fontana*"
  const variacoes = [
    `Pessoal, estou enviando ${alvo}. Vocês poderiam verificar se está tudo certinho, por favor? 🙌`,
    `Oi, pessoal! Seguem ${alvo}. Poderiam conferir pra mim se está tudo ok pra publicar? 😊`,
    `Pessoal, tudo bem? Estou mandando ${alvo}. Dá uma olhadinha e me diz se pode liberar ou se ajusto algo, por favor. 🎨`,
    `Olá! Enviando ${alvo} pra vocês. Poderiam verificar se ficou certinho antes de eu publicar? 🙏`,
    `Pessoal, aqui ${nArtes > 1 ? "estão" : "está"} ${alvo}. Vocês poderiam conferir se está tudo certo, por favor? ✨`,
    `Oi, pessoal! Tudo certo? Deixei ${alvo} aqui pra vocês. Poderiam dar uma conferida e me dizer se ficou certinho? 🙌`,
    `Pessoal, ${nArtes > 1 ? "chegaram" : "chegou"} ${alvo}! Vocês poderiam verificar pra mim se está tudo ok antes de publicar, por favor? 😊`,
    `Olá, pessoal! ${nArtes > 1 ? "Seguem" : "Segue"} ${alvo} pra aprovação de vocês. Se puderem conferir e me retornar se pode ir ao ar, agradeço demais! 🙏`,
    `Oi! Estou passando ${alvo} pra vocês darem uma olhada. Está tudo certinho ou querem que eu ajuste alguma coisa? 🎨`,
  ];
  const i = Math.floor(Math.random() * variacoes.length);
  return variacoes[i];
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, image_url, client_id, client_name, designer_delivered_at").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, whatsapp_group_jid, whatsapp_group_name").eq("id", card.client_id as string).maybeSingle();
  const clienteNome = (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente";
  const jid = (cli?.whatsapp_group_jid as string) || "";
  if (!jid) {
    return NextResponse.json({ error: `${clienteNome} não tem grupo de WhatsApp mapeado. Vincule em Configurações → Grupos.` }, { status: 400 });
  }

  // Artes a enviar: anexos na ordem (carrossel), fallback pra capa.
  const { data: atts } = await supabaseAdmin
    .from("card_attachments").select("url, position").eq("card_id", cardId).order("position", { ascending: true });
  let urls = (atts ?? []).map((a) => a.url as string).filter(isImageUrl);
  if (urls.length === 0 && isImageUrl((card.image_url as string) || "")) urls = [card.image_url as string];
  urls = urls.slice(0, MAX_ARTES);
  if (urls.length === 0) {
    return NextResponse.json({ error: "não há arte com imagem direta pra enviar (pode estar como link do Drive)." }, { status: 400 });
  }

  // Envio MISTO (texto + mídia juntos): a mensagem de aprovação vai como LEGENDA da 1ª arte, e as
  // demais artes seguem na sequência. Assim o cliente recebe uma mensagem única e coesa (texto colado
  // na 1ª imagem) em vez de um balão de texto solto + várias imagens avulsas.
  const texto = mensagemAprovacao(urls.length, nomeProduto(card.title as string));
  let enviadas = 0;
  const falhas: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const cap = i === 0 ? texto : undefined; // texto só na 1ª (mistura texto+imagem); demais soltas
    const r = await csSendGroupImage(jid, urls[i], cap);
    if (r.ok) enviadas++;
    else falhas.push(`arte ${i + 1}: ${r.error || "erro"}`);
    await new Promise((res) => setTimeout(res, 700)); // respira entre imagens (evita rate/ordem trocada)
  }
  // Rede de segurança: se a 1ª arte (que carrega o texto) falhou mas outras foram, manda o texto
  // solto pra mensagem de aprovação não se perder.
  if (falhas.some((f) => f.startsWith("arte 1:")) && enviadas > 0) {
    await csSendGroupText(jid, texto).catch(() => {});
  }
  // Se NADA foi enviado, tenta ao menos o texto (pra sinalizar) e reporta erro.
  if (enviadas === 0) {
    const rTxt = await csSendGroupText(jid, texto);
    if (!rTxt.ok) {
      return NextResponse.json({ error: `Falha ao enviar no grupo: ${falhas[0] || rTxt.error || "erro"}` }, { status: 502 });
    }
  }

  // Registra no card (rastro de que já foi mandado pro cliente) e loga o envio.
  const nomeQuem = (user.email as string)?.split("@")[0] || "equipe";
  await supabaseAdmin.from("card_comments").insert({
    card_id: cardId, author: "🤖 CS", role: "system",
    text: `📤 Enviei ${enviadas}/${urls.length} arte(s) pro grupo de *${clienteNome}* aprovar (por ${nomeQuem}).${falhas.length ? ` Falhas: ${falhas.join("; ")}` : ""}`,
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: enviadas > 0, enviadas, total: urls.length, falhas, grupo: (cli?.whatsapp_group_name as string) || jid });
}
