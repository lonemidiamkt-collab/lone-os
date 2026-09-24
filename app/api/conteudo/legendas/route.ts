export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/conteudo/legendas { clientId, semana: "YYYY-MM-DD", cardIds? } — Legendas em lote (Leva 7B, N12).
//
// Escreve a legenda de cada card do cliente naquela semana (seg–dom) e DEVOLVE os rascunhos. A tela
// pede um card por vez (cardIds com um id): cada legenda leva ~10 s e a semana inteira numa requisição
// só passaria do tempo do proxy — além de a pessoa ver o progresso. Não grava
// nada: o social lê, edita e salva nos cards pela tela (o mesmo /api/content-cards/update de sempre).
// A IA é a de lib/cs/legenda.ts (tom e briefing do cliente, arte descrita por visão quando existe);
// o bloco de contato é conferido e acrescentado no fim quando a IA não fechou com ele.
// O uso de modelo fica registrado em llm_calls / agent_runs (lib/obs) com a origem desta rota.

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { comExecucao } from "@/lib/obs/correlacao";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { gerarLegenda } from "@/lib/cs/legenda";
import { fichaDoCliente } from "@/lib/cs/guia-legendas";
import { describeImage } from "@/lib/cs/vision";
import { blocoDeContato, fecharComContato, limitesDaSemana, MAX_CARDS_POR_LOTE, type RascunhoLegenda } from "@/lib/conteudo/legendas-lote";

/** O que aparece na arte (visão), para a legenda falar do que está nela. Nunca lança. */
async function descreverArte(url: string | null | undefined): Promise<string | undefined> {
  if (!url || !/^https?:\/\//.test(url) || /drive\.google\.com/.test(url)) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const mime = res.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return undefined;
    const v = await describeImage(Buffer.from(await res.arrayBuffer()).toString("base64"), mime);
    return v.ok && v.descricao && v.descricao !== "IRRELEVANTE" ? v.descricao : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...GESTAO, "social"]);
  if (gate instanceof NextResponse) return gate;
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "A IA não está configurada no servidor." }, { status: 503 });

  const body = await req.json().catch(() => null) as { clientId?: string; semana?: string; cardIds?: unknown } | null;
  const clientId = (body?.clientId ?? "").trim();
  const semana = (body?.semana ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(clientId) || !/^\d{4}-\d{2}-\d{2}$/.test(semana)) {
    return NextResponse.json({ error: "Escolha o cliente e a semana." }, { status: 400 });
  }
  const { segunda, domingo } = limitesDaSemana(semana);

  return comExecucao({ origem: "conteudo:legendas-em-lote", ator: gate.user.email ?? null, papel: gate.papel, extra: { clientId, segunda } }, async () => {
    const [{ data: cli }, { data: cards, error }] = await Promise.all([
      supabaseAdmin.from("clients").select("name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing, endereco, phone").eq("id", clientId).maybeSingle(),
      supabaseAdmin.from("content_cards")
        .select("id, title, briefing, format, due_date, due_time, caption, hashtags, image_url, platform")
        .eq("client_id", clientId).is("archived_at", null).gte("due_date", segunda).lte("due_date", domingo)
        .order("due_date", { ascending: true }).order("due_time", { ascending: true, nullsFirst: false }),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!cli) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    const lista: unknown = body?.cardIds;
    const pedidos = Array.isArray(lista) ? new Set(lista.filter((x): x is string => typeof x === "string")) : null;
    const doFeed = (cards ?? []).filter((c) => !/stor(y|ies)/i.test((c.format as string) ?? "") && (!pedidos || pedidos.has(c.id as string)));
    if (!doFeed.length) return NextResponse.json({ segunda, domingo, contato: null, rascunhos: [] });
    if (doFeed.length > MAX_CARDS_POR_LOTE) {
      return NextResponse.json({ error: `A semana tem ${doFeed.length} cards — o lote vai até ${MAX_CARDS_POR_LOTE}.` }, { status: 400 });
    }

    const cliente = (cli.nome_fantasia as string) || (cli.name as string) || "Cliente";
    const [briefing, regras, { data: brief }, { data: anexos }] = await Promise.all([
      loadBriefingCombinado(clientId, (cli.fixed_briefing as string) || (cli.campaign_briefing as string)),
      fetchClientCsRules(clientId),
      supabaseAdmin.from("client_briefings").select("contato").eq("client_id", clientId).eq("is_current", true).maybeSingle(),
      supabaseAdmin.from("card_attachments").select("card_id, url, position, tipo").in("card_id", doFeed.map((c) => c.id as string)).order("position", { ascending: true }),
    ]);
    const contato = blocoDeContato({
      ficha: fichaDoCliente(cliente),
      briefingContato: typeof brief?.contato === "string" ? brief.contato : null,
      endereco: cli.endereco as string | null,
      telefone: cli.phone as string | null,
    });
    const regrasTexto = regras.filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
    // A arte que vale é a ENTREGA (referência do social não é o assunto do post).
    const arteDoCard = new Map<string, string>();
    for (const a of anexos ?? []) {
      if (a.tipo === "referencia" || arteDoCard.has(a.card_id as string)) continue;
      arteDoCard.set(a.card_id as string, a.url as string);
    }

    const rascunhos: RascunhoLegenda[] = [];
    // Um por vez: 12 chamadas em paralelo estouram o limite de taxa da OpenAI e a semana volta pela metade.
    for (const c of doFeed) {
      const base = {
        cardId: c.id as string, titulo: (c.title as string) ?? "", data: (c.due_date as string) ?? null,
        formato: (c.format as string) || "Post", legendaAtual: ((c.caption as string) ?? "").trim() || null,
      };
      const arteDescricao = await descreverArte(arteDoCard.get(c.id as string) ?? (c.image_url as string | null));
      const r = await gerarLegenda({
        clienteNome: cliente,
        clienteNicho: (cli.nicho as string) || (cli.industry as string) || undefined,
        briefing, regras: regrasTexto,
        titulo: base.titulo || "post",
        briefingCard: (c.briefing as string) || undefined,
        formato: base.formato,
        arteDescricao,
      });
      if (!r.ok || !r.data?.legenda) {
        rascunhos.push({ ...base, legenda: "", hashtags: ((c.hashtags as string) ?? "").trim(), contatoAcrescentado: false, erro: r.error || "A IA não devolveu legenda." });
        continue;
      }
      const fechada = fecharComContato(r.data.legenda, contato);
      rascunhos.push({ ...base, legenda: fechada.texto, hashtags: (r.data.hashtags ?? "").trim(), contatoAcrescentado: fechada.acrescentado });
    }

    return NextResponse.json({ segunda, domingo, contato, rascunhos });
  });
}
