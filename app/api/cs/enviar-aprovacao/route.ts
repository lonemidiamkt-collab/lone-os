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

// Deriva o "tema" da arte a partir do título do card (ex.: "Pisos" → "de pisos") pra IDENTIFICAR
// o que está sendo enviado. Ignora títulos genéricos/vazios (aí manda sem tema).
function temaDaArte(titulo?: string): string {
  const t = (titulo || "").trim();
  if (!t || t.length < 2) return "";
  // remove sufixos internos comuns que não ajudam o cliente (ex.: "(Post triplo)")
  const limpo = t.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  return `de ${limpo.toLowerCase()}`;
}

// 5 variações da mensagem de aprovação, estilo direto "pessoal, tô enviando as artes de X".
// Inclui o TEMA (o que é a arte) e concorda em número. Escolhe uma aleatória.
function mensagemAprovacao(nArtes: number, tema: string): string {
  const base = nArtes > 1 ? `as ${nArtes} artes` : "a arte";
  const artes = tema ? `${base} ${tema}` : base; // "as 3 artes de pisos"
  const solicitadas = nArtes > 1 ? "que foram solicitadas" : "que foi solicitada";
  const variacoes = [
    `Pessoal, tô enviando ${artes} ${solicitadas}! Deem uma olhada e me falem se pode publicar ou se querem ajustar algo. 🎨`,
    `Oi, pessoal! Seguem ${artes} pra aprovação de vocês. Se tiver tudo certo, é só dar o ok! Qualquer ajuste, manda aqui. ✨`,
    `Prontinho! Tô mandando ${artes} ${solicitadas}. Confere pra mim e me diz se libero pra publicação ou se ajusto alguma coisa. 🙌`,
    `Pessoal, chegaram ${artes}! Deem uma conferida e me retornem: pode publicar ou querem mudar algo?`,
    `Oi! Enviando ${artes} pra vocês avaliarem. Me deem o ok ou apontem o que quiserem ajustar que eu resolvo. 🎨`,
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

  // 1) mensagem de aprovação (varia). 2) cada arte como imagem.
  const texto = mensagemAprovacao(urls.length, temaDaArte(card.title as string));
  const rTxt = await csSendGroupText(jid, texto);
  if (!rTxt.ok) {
    return NextResponse.json({ error: `Falha ao enviar no grupo: ${rTxt.error || "erro"}` }, { status: 502 });
  }
  let enviadas = 0;
  const falhas: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const cap = urls.length > 1 ? `Arte ${i + 1}/${urls.length}` : undefined;
    const r = await csSendGroupImage(jid, urls[i], cap);
    if (r.ok) enviadas++;
    else falhas.push(`arte ${i + 1}: ${r.error || "erro"}`);
    await new Promise((res) => setTimeout(res, 700)); // respira entre imagens (evita rate/ordem trocada)
  }

  // Registra no card (rastro de que já foi mandado pro cliente) e loga o envio.
  const nomeQuem = (user.email as string)?.split("@")[0] || "equipe";
  await supabaseAdmin.from("card_comments").insert({
    card_id: cardId, author: "🤖 CS", role: "system",
    text: `📤 Enviei ${enviadas}/${urls.length} arte(s) pro grupo de *${clienteNome}* aprovar (por ${nomeQuem}).${falhas.length ? ` Falhas: ${falhas.join("; ")}` : ""}`,
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: enviadas > 0, enviadas, total: urls.length, falhas, grupo: (cli?.whatsapp_group_name as string) || jid });
}
