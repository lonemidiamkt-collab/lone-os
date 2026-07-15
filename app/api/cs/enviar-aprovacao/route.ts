export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { sendText, sendMediaImage } from "@/lib/whatsapp/evolution";

// POST /api/cs/enviar-aprovacao { cardId } — o social/gestor CLICA e o CS manda as artes ENTREGUES
// pro GRUPO DO CLIENTE, com uma mensagem padronizada (variada, pra não ficar robótico) pedindo
// aprovação. Disparo 100% no clique humano (nunca automático). Sai pelo número do gestor (que está
// nos grupos dos clientes), não pelo monitor[IA]. As artes ficam no bucket público `arts` → a
// Evolution baixa a URL direto.
const isImageUrl = (u: string) => /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
const MAX_ARTES = 20;

// 5 variações da mensagem de aprovação (o {n} vira "a arte"/"as N artes"). Escolhe uma aleatória.
function mensagemAprovacao(clienteNome: string, nArtes: number): string {
  const artesTxt = nArtes > 1 ? `as ${nArtes} artes` : "a arte";
  const variacoes = [
    `Oi! 😊 Chegou ${artesTxt} novinha aqui pra vocês. Deem uma olhada e me digam se está tudo certo pra publicar ou se querem ajustar algo. 🎨`,
    `Prontinho! ✨ Segue ${artesTxt} pra aprovação de vocês. Se estiver do jeito que imaginaram, é só dar o ok que a gente agenda. Qualquer ajuste, manda aqui!`,
    `Olá! Acabou de sair ${artesTxt} do forno 🔥 Confere pra mim e me fala se libero pra publicação ou se ajusto alguma coisa. 🙌`,
    `Oi, pessoal! 👋 Trouxe ${artesTxt} pra vocês avaliarem. Ficou massa! Me deem o ok ou apontem o que quiserem mudar que eu já resolvo.`,
    `E aí! 🎯 ${nArtes > 1 ? `Aqui estão as ${nArtes} artes` : "Aqui está a arte"} pra aprovação. Deem uma conferida e me retornem: pode publicar ou querem algum ajuste?`,
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
  const texto = mensagemAprovacao(clienteNome, urls.length);
  const rTxt = await sendText(jid, texto);
  if (!rTxt.ok) {
    return NextResponse.json({ error: `Falha ao enviar no grupo: ${rTxt.error || "erro"}` }, { status: 502 });
  }
  let enviadas = 0;
  const falhas: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const cap = urls.length > 1 ? `Arte ${i + 1}/${urls.length}` : undefined;
    const r = await sendMediaImage(jid, urls[i], cap);
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
