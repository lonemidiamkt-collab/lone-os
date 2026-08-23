export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { sincronizarBriefingAprendido } from "@/lib/cs/briefing-sync";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { DEFINICAO_DE_REGRA, SCHEMA_REGRAS, filtrarRegras, ESCOPO_POR_TIPO } from "@/lib/cs/regras";

// POST /api/system/cs-briefing-update — a IA "percebe" as conversas dos grupos e ENRIQUECE o briefing
// dos clientes: extrai FATOS de negócio/produto novos (lançou produto X, faz entrega em Y, promoção
// até Z) e grava como regra APRENDIDA (escopo negócio) → briefing-sync joga na seção "🧠 Aprendido".
// Lê o corpus cs_message_corpus (mensagens do CLIENTE, is_team=false). ?dry=1 não grava.
// Cron sugerido: 1x/dia. ?clientId=… roda só um cliente.

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const onlyClient = req.nextUrl.searchParams.get("clientId");
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia, whatsapp_group_jid").not("whatsapp_group_jid", "is", null).or("active.is.null,active.eq.true");
  if (onlyClient) q = supabaseAdmin.from("clients").select("id, name, nome_fantasia, whatsapp_group_jid").eq("id", onlyClient);
  const { data: clients } = await q;

  const seteDias = new Date(Date.now() - 7 * 86400000).toISOString();
  const resultados: { cliente: string; novos: number }[] = [];

  for (const c of clients ?? []) {
    const jid = c.whatsapp_group_jid as string;
    if (!jid) continue;
    // Mensagens do CLIENTE (não do time) nos últimos 7 dias.
    const { data: msgs } = await supabaseAdmin
      .from("cs_message_corpus").select("text")
      .eq("group_jid", jid).eq("is_team", false)
      .gte("created_at", seteDias).order("created_at", { ascending: false }).limit(60);
    if (!msgs || msgs.length < 8) continue; // pouco material → pula (sem IA)

    const conversa = msgs.map((m) => `- ${(m.text as string).slice(0, 300)}`).join("\n").slice(0, 6000);
    // O prompt ANTIGO pedia "fatos CONCRETOS e verificáveis" e mandava ignorar "pedido de arte ou
    // opinião". Preço é concreto e verificável, correção de arte é "pedido de arte" — resultado:
    // 96 preços guardados como regra eterna e a correção do cliente jogada fora. Agora a pergunta
    // é outra: isso muda o que a gente faz na PRÓXIMA peça deste cliente?
    const r = await chatJson<{ regras: { texto: string; tipo: string }[] }>({
      model: "gpt-4o-mini",
      system: `Você lê mensagens do GRUPO de WhatsApp de um cliente de uma agência de marketing e extrai as REGRAS duráveis daquele cliente.\n\n${DEFINICAO_DE_REGRA}\n\nMáximo 5 regras. O normal é voltar pouca coisa ou nada — só devolva o que passar no teste.`,
      user: conversa,
      schema: SCHEMA_REGRAS, schemaName: "briefing_regras", maxTokens: 600,
    });
    if (!r.ok || !r.data) continue;

    const existentes = (await fetchClientCsRules(c.id as string)).map((x) => x.texto.toLowerCase().trim());
    // filtrarRegras aplica o portão determinístico (catálogo/promoção/efêmero/narrativa) por cima
    // do que a IA devolveu — cinto e suspensório, porque é ela que erra pro lado de guardar demais.
    const novos = filtrarRegras(r.data.regras)
      .filter((g) => !existentes.some((e) => e.includes(g.texto.toLowerCase()) || g.texto.toLowerCase().includes(e)))
      .slice(0, 5);

    if (novos.length && !dry) {
      await supabaseAdmin.from("cs_client_rules").insert(
        novos.map((g) => ({
          client_id: c.id, texto: g.texto,
          escopo: ESCOPO_POR_TIPO[g.tipo],   // cada regra no escopo certo — antes ia tudo em "sempre"
          origem: "aprendido", author: "IA (conversas)",
        }))
      );
      await sincronizarBriefingAprendido(c.id as string);
    }
    if (novos.length) resultados.push({ cliente: (c.nome_fantasia as string) || (c.name as string), novos: novos.length });
  }

  return NextResponse.json({ ok: true, dry, clientes_atualizados: resultados.length, detalhe: resultados });
}
