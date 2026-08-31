export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { DEFINICAO_DE_REGRA, SCHEMA_REGRAS, filtrarRegras, gravarRegras } from "@/lib/cs/regras";
import { fetchClientCsRules } from "@/lib/supabase/queries";

// POST /api/system/cs-releitura — a leitura semanal do ciclo inteiro de cada cliente.
//
// PRA QUE (Roberto, 30/08): "ver tudo que foi feito na plataforma — o que o social criou sobre
// aquele cliente, o que o designer entregou sobre o que o social pediu, as mensagens, o que os
// clientes aprovaram e o que eles não gostaram".
//
// Os outros jobs de aprendizado olham UMA fonte cada: as conversas do grupo, os cards, a correção
// avulsa. Aqui a leitura é do CICLO: pedido → entrega → correção → aprovação. É a única que
// enxerga a peça que voltou quatro vezes antes de ser aprovada, e o que mudou entre a terceira e
// a quarta versão.
//
// O caso que motivou, real: "TER 18 - PISO BOLD" (Imperio) voltou SETE vezes —
//   tirar o bold → fundo atrás da letra → padrão novo → tirar emojis →
//   usar a cor dourada da referência → usar a cor dourada da referência → a cor ainda está errada
// A mesma correção pedida três vezes na mesma peça, e nada virou regra. O próximo card do mesmo
// cliente começava do zero.
//
// SUBSTITUI o antigo cs-aprender-cards, que lia as mesmas duas fontes (cards e comentários) sem
// as correções. Manter os dois faria os jobs disputarem a cota diária de aprendizado do cliente e
// gerarem regra duplicada — o mais completo ficou, o outro saiu.
//
// As três fontes de aprendizado agora são distintas, de propósito:
//   cs-briefing-update  → o que o CLIENTE fala no grupo
//   cs-releitura        → o ciclo de PRODUÇÃO (pedido, entrega, correção, aprovação)
//   inbound (tempo real)→ a CORREÇÃO que o cliente pede na hora
//
// ?dry=1 não grava · ?dias=90 · ?clientId= roda um só · Cron: domingo.

const MIN_MATERIAL = 3;   // menos que isso não dá pra ver padrão nenhum
const MIN_CICLO = 2;      // peça que voltou 2+ vezes é onde mora a lição

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const only = req.nextUrl.searchParams.get("clientId");
  const dias = Math.min(180, parseInt(req.nextUrl.searchParams.get("dias") ?? "90", 10));
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const desde = new Date(Date.now() - dias * 86400000).toISOString();

  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia")
    .or("active.is.null,active.eq.true").is("draft_status", null);
  if (only) q = supabaseAdmin.from("clients").select("id, name, nome_fantasia").eq("id", only);
  const { data: clientes } = await q;

  const resultados: { cliente: string; material: string; novas: number; regras: string[] }[] = [];
  const semMaterial: string[] = [];

  for (const c of clientes ?? []) {
    const clientId = c.id as string;
    const nome = (c.nome_fantasia as string) || (c.name as string);
    if (/\(teste\)/i.test(nome)) continue;

    // ── As quatro fontes do ciclo ────────────────────────────────────────────
    const [cardsRes, reworkRes, comentRes] = await Promise.all([
      supabaseAdmin.from("content_cards")
        .select("id, title, briefing, designer_delivered_at, client_approved_at, created_at")
        .eq("client_id", clientId).gte("created_at", desde).is("archived_at", null)
        .order("created_at", { ascending: false }).limit(40),
      supabaseAdmin.from("cs_rework_events")
        .select("card_id, reason, created_at").eq("client_id", clientId)
        .gte("created_at", desde).not("reason", "is", null).order("created_at", { ascending: true }),
      supabaseAdmin.from("card_comments").select("card_id, body, created_at")
        .gte("created_at", desde).order("created_at", { ascending: false }).limit(200),
    ]);

    const cards = cardsRes.data ?? [];
    const idsDoCliente = new Set(cards.map((k) => k.id as string));
    const comentarios = (comentRes.data ?? []).filter((m) => idsDoCliente.has(m.card_id as string));
    const reworks = reworkRes.data ?? [];
    if (cards.length < MIN_MATERIAL) { semMaterial.push(nome); continue; }

    // Ciclos: quantas vezes cada peça voltou, na ordem.
    const ciclos = new Map<string, string[]>();
    for (const r of reworks) {
      const id = r.card_id as string;
      ciclos.set(id, [...(ciclos.get(id) ?? []), String(r.reason).trim()]);
    }

    const titulo = (id: string) => (cards.find((k) => k.id === id)?.title as string) || "peça";

    // O QUE VOLTOU — e quantas vezes. É a fonte mais rica de regra.
    const queVoltou = [...ciclos.entries()]
      .filter(([, m]) => m.length >= MIN_CICLO)
      .map(([id, m]) => `"${titulo(id)}" voltou ${m.length}x:\n${m.map((x, i) => `   ${i + 1}. ${x}`).join("\n")}`);

    // O QUE PASSOU DE PRIMEIRA — o acerto também ensina, e ninguém olhava pra isso.
    const passouDireto = cards
      .filter((k) => k.designer_delivered_at && !ciclos.has(k.id as string))
      .slice(0, 10).map((k) => `- ${k.title as string}`);

    // O QUE O CLIENTE APROVOU — o fim do ciclo.
    const aprovadas = cards.filter((k) => k.client_approved_at).slice(0, 10).map((k) => `- ${k.title as string}`);

    // O QUE O SOCIAL PEDIU — o começo dele.
    const pedidos = cards.filter((k) => (k.briefing as string)?.trim())
      .slice(0, 12).map((k) => `- ${k.title as string}: ${String(k.briefing).slice(0, 180)}`);

    const conversas = comentarios.slice(0, 25).map((m) => `- ${String(m.body).slice(0, 160)}`);

    // Sem nada que voltou e sem conversa, não há ciclo pra ler — o job semanal das conversas e o
    // dos cards já cobrem esse cliente.
    if (!queVoltou.length && conversas.length < 3) { semMaterial.push(nome); continue; }

    const material = [
      pedidos.length ? `O QUE O SOCIAL PEDIU:\n${pedidos.join("\n")}` : "",
      queVoltou.length ? `\nO QUE VOLTOU PRA REFAZER (e quantas vezes):\n${queVoltou.join("\n\n")}` : "",
      passouDireto.length ? `\nO QUE PASSOU DE PRIMEIRA:\n${passouDireto.join("\n")}` : "",
      aprovadas.length ? `\nO QUE O CLIENTE APROVOU:\n${aprovadas.join("\n")}` : "",
      conversas.length ? `\nCONVERSA DA EQUIPE NOS CARDS:\n${conversas.join("\n")}` : "",
    ].filter(Boolean).join("\n").slice(0, 14000);

    const regrasAtuais = (await fetchClientCsRules(clientId)).map((r) => r.texto);

    const r = await chatJson<{ regras: { texto: string; tipo: string }[] }>({
      model: "gpt-4o-mini",
      schemaName: "releitura_cliente",
      schema: SCHEMA_REGRAS,
      maxTokens: 800,
      temperature: 0,
      system:
        `Você relê o ciclo de produção de UM cliente de agência — o que o social pediu, o que o ` +
        `designer entregou, o que voltou pra refazer, o que passou de primeira e o que o cliente ` +
        `aprovou — e extrai as REGRAS daquele cliente.\n\n${DEFINICAO_DE_REGRA}\n\n` +
        `ONDE ESTÁ A LIÇÃO:\n` +
        `1. O QUE VOLTOU é a fonte mais forte. A regra é o CONTRÁRIO da correção, escrita como ` +
        `instrução: "tirar o bold" vira "não usar negrito no texto das artes".\n` +
        `2. O que foi pedido MAIS DE UMA VEZ na mesma peça é o que a equipe mais erra — priorize.\n` +
        `3. O que se repete em PEÇAS DIFERENTES é padrão do cliente, não acaso.\n` +
        `4. O que passou de primeira e foi aprovado também ensina: se um formato nunca volta, ` +
        `vale registrar como o que funciona com este cliente.\n\n` +
        `NÃO CONFUNDA correção daquela peça ("trocar a foto do piso X", "o preço é outro") com ` +
        `regra do cliente ("seguir a identidade visual", "sem emoji nas artes"). Só a segunda vale.\n` +
        `Máximo 5 regras, as mais recorrentes. Vazio é resposta legítima.`,
      user: `Cliente: ${nome}\n\n${regrasAtuais.length ? `Já registradas (não repita):\n${regrasAtuais.slice(0, 40).map((x) => `- ${x}`).join("\n")}\n\n` : ""}${material}`,
    });
    if (!r.ok || !r.data) continue;

    const candidatas = filtrarRegras(r.data.regras).slice(0, 5);
    if (!candidatas.length) continue;

    const resumo = `${cards.length} peças · ${queVoltou.length} voltaram 2x+ · ${aprovadas.length} aprovadas`;
    if (dry) {
      resultados.push({ cliente: nome, material: resumo, novas: candidatas.length, regras: candidatas.map((x) => x.texto) });
      continue;
    }

    const { gravadas } = await gravarRegras(clientId, candidatas, {
      author: "IA (releitura do ciclo)", capPorDia: 5,
    });
    if (gravadas.length) {
      resultados.push({ cliente: nome, material: resumo, novas: gravadas.length, regras: gravadas.map((x) => x.texto) });
    }
  }

  return NextResponse.json({
    ok: true, dry, janela_dias: dias,
    clientes_com_regra_nova: resultados.length,
    clientes_sem_material: semMaterial.length,
    detalhe: resultados,
  });
}
