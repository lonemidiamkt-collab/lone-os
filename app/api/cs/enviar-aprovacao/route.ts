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

// O TÍTULO DO CARD NÃO VAI PRO CLIENTE (pedido do Roberto, 03/08).
//
// A mensagem citava o produto extraído do título — e o título é campo livre do board, escrito pra
// uso INTERNO. Foi assim que o grupo do Madeirão Móveis recebeu "as 2 artes do produto *03 SEG -
// Mesa Londrina com 4 cadeiras*": "03 SEG" é a notação de agendamento do social, não nome de
// produto. Dava pra ir limpando prefixo por prefixo, mas seria correr atrás de cada convenção que
// alguém inventar — campo livre sempre vence. Texto padrão resolve de vez.
//
// A arte já mostra o produto: ela vai anexada, com o nome escrito nela. Repetir no texto nunca foi
// necessário — só arriscado.
function mensagemAprovacao(nArtes: number): string {
  const alvo = nArtes > 1 ? `as ${nArtes} artes` : "a arte";
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
    .from("content_cards").select("id, title, image_url, client_id, client_name, designer_delivered_at, status, social_confirmed_at").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, whatsapp_group_jid, whatsapp_group_name").eq("id", card.client_id as string).maybeSingle();
  const clienteNome = (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente";
  const jid = (cli?.whatsapp_group_jid as string) || "";
  if (!jid) {
    return NextResponse.json({ error: `${clienteNome} não tem grupo de WhatsApp mapeado. Vincule em Configurações → Grupos.` }, { status: 400 });
  }

  // REFERÊNCIA NÃO VAI PRO CLIENTE. O social anexa print de inspiração pro designer no mesmo card
  // em que a arte final é entregue. Isto aqui mandava tudo junto — o cliente recebia, pra aprovar,
  // o print que copiamos de outra marca. Constrangedor, e a pessoa nem entende o que está vendo.
  const { data: atts } = await supabaseAdmin
    .from("card_attachments").select("url, position, tipo").eq("card_id", cardId).order("position", { ascending: true });

  const todos = atts ?? [];
  const entregas = todos.filter((a) => a.tipo === "entrega");
  const referencias = todos.filter((a) => a.tipo === "referencia");
  const semTipo = todos.filter((a) => !a.tipo);

  // Com entrega marcada, é só ela. Sem NENHUMA marcada, manda o que não é referência: 782 anexos
  // são anteriores a essa separação, e recusar todos travaria a equipe hoje pra resolver ontem.
  // O que nunca acontece, em nenhum caso, é referência sair.
  const escolhidos = entregas.length ? entregas : semTipo;
  let urls = escolhidos.map((a) => a.url as string).filter(isImageUrl);
  if (urls.length === 0 && isImageUrl((card.image_url as string) || "")) urls = [card.image_url as string];
  urls = urls.slice(0, MAX_ARTES);
  if (urls.length === 0 && referencias.length) {
    return NextResponse.json({
      error: `este card só tem referência (${referencias.length}) — o designer ainda não entregou a arte.`,
    }, { status: 400 });
  }
  if (urls.length === 0) {
    return NextResponse.json({ error: "não há arte com imagem direta pra enviar (pode estar como link do Drive)." }, { status: 400 });
  }

  // Envio MISTO (texto + mídia juntos): a mensagem de aprovação vai como LEGENDA da 1ª arte, e as
  // demais artes seguem na sequência. Assim o cliente recebe uma mensagem única e coesa (texto colado
  // na 1ª imagem) em vez de um balão de texto solto + várias imagens avulsas.
  const texto = mensagemAprovacao(urls.length);
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
    text: `📤 Enviei ${enviadas}/${urls.length} arte(s) pro grupo de *${clienteNome}* aprovar (por ${nomeQuem}).`
      + (referencias.length ? ` ${referencias.length} referência(s) ficaram de fora, como deve ser.` : "")
      + (!entregas.length && semTipo.length ? ` ⚠️ As artes deste card não estão marcadas como "entrega" — confere se não foi referência junto.` : "")
      + (falhas.length ? ` Falhas: ${falhas.join("; ")}` : ""),
  }).then(() => {}, () => {});

  // AVANÇA o card automaticamente: mandar as artes pro cliente = arte confirmada pelo social e agora
  // com o CLIENTE pra aprovar. Isso tira o card do limbo "in_production" (que virava falso atraso) e
  // reflete a realidade sem o social ter que atualizar o status na mão. Só avança pra frente.
  const st = card.status as string;
  if (enviadas > 0 && ["ideas", "script", "in_production", "approval"].includes(st)) {
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("content_cards").update({
      status: "client_approval",
      social_confirmed_at: (card.social_confirmed_at as string) || nowIso,
      social_confirmed_by: nomeQuem,
      status_changed_at: nowIso,
    }).eq("id", cardId).then(() => {}, () => {});
    await supabaseAdmin.from("card_comments").insert({
      card_id: cardId, author: "🤖 CS", role: "system",
      text: "➡️ Card movido pra *Aprovação Cliente* automaticamente (artes enviadas pro cliente).",
    }).then(() => {}, () => {});
  }

  return NextResponse.json({ ok: enviadas > 0, enviadas, total: urls.length, falhas, grupo: (cli?.whatsapp_group_name as string) || jid });
}
