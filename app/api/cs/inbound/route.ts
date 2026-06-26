export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { parseUpsert, isTrivial, isLoneTeam, type EvolutionUpsert } from "@/lib/cs/ingest";
import { classifyBlock, type ClassifierContext } from "@/lib/cs/classifier";

// Webhook INBOUND do Agente CS — recebe `messages.upsert` da Evolution (número monitor[IA]).
// Rota PÚBLICA (Evolution não manda cookie/JWT) MAS autenticada por segredo compartilhado
// (CS_INBOUND_SECRET) — não basta presença de header, valida o valor. Idempotência/debounce
// e criação de card ficam nas próximas fatias; aqui é A0 (filtro) + A1 (classificar) em modo
// OBSERVAÇÃO (loga a sugestão; ainda não cria nada — suggest-only de verdade).

function authorized(req: NextRequest): boolean {
  const secret = process.env.CS_INBOUND_SECRET;
  if (!secret) return false; // sem segredo configurado → rota desligada (fail-closed)
  const got = req.headers.get("x-cs-secret") || req.nextUrl.searchParams.get("secret");
  return got === secret;
}

function teamJids(): string[] {
  return (process.env.CS_LONE_TEAM_JIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Allowlist de grupos do PILOTO (LGPD): se CS_PILOT_GROUP_JIDS estiver setada, só processa
// esses grupos (ex.: 1 grupo de teste sem dado real) — o resto é ignorado, mesmo o webhook
// recebendo todos os grupos da instância. Vazia = processa todos os clientes mapeados (produção).
function pilotGroupAllowlist(): string[] {
  return (process.env.CS_PILOT_GROUP_JIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as EvolutionUpsert | null;
  if (!payload) return NextResponse.json({ ok: true, skip: "corpo inválido" });

  const msg = parseUpsert(payload);
  if (!msg) return NextResponse.json({ ok: true, skip: "não é mensagem de grupo com texto" });
  if (msg.fromMe) return NextResponse.json({ ok: true, skip: "própria mensagem" });

  const allow = pilotGroupAllowlist();
  if (allow.length > 0 && !allow.includes(msg.groupJid)) {
    return NextResponse.json({ ok: true, skip: "fora da allowlist do piloto" });
  }
  if (isLoneTeam(msg.authorJid, teamJids())) return NextResponse.json({ ok: true, skip: "autor = equipe Lone" });
  if (isTrivial(msg.text)) return NextResponse.json({ ok: true, skip: "trivial" });

  // Resolve cliente pelo JID do grupo.
  const { data: clients } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, nicho, campaign_briefing, fixed_briefing")
    .eq("whatsapp_group_jid", msg.groupJid);

  // Grupo de teste = está na allowlist do piloto mas NÃO mapeia cliente (ex.: grupo Automação).
  // Usa um "Cliente Teste" sintético pra exercitar o A1 sem dado real — você manda como se fosse o cliente.
  const isTestGroup = (!clients || clients.length === 0) && allow.includes(msg.groupJid);
  if ((!clients || clients.length === 0) && !isTestGroup) {
    console.warn("[CS/inbound] grupo sem cliente mapeado:", msg.groupJid);
    return NextResponse.json({ ok: true, skip: "grupo sem cliente" });
  }

  const multiCliente = (clients?.length ?? 0) > 1; // blueprint 11.3 — ambiguidade vira confiança baixa
  const c = clients?.[0];
  const clienteNome = isTestGroup
    ? "Cliente Teste"
    : (c?.nome_fantasia as string) || (c?.name as string) || "Cliente";

  if (!isOpenAIConfigured()) {
    console.log(`[CS/inbound] A1 desligado (sem OPENAI_API_KEY). Bloco de "${clienteNome}": ${msg.text.slice(0, 80)}`);
    return NextResponse.json({ ok: true, classified: false, reason: "A1 desligado (sem key)", cliente: clienteNome });
  }

  const ctx: ClassifierContext = {
    clienteNome,
    clienteNicho: isTestGroup ? undefined : (c?.nicho as string) || undefined,
    briefing: isTestGroup ? undefined : (c?.campaign_briefing as string) || (c?.fixed_briefing as string) || undefined,
    nomesEquipeLone: teamJids(),
    clientesDoGrupo: isTestGroup ? [clienteNome] : (clients ?? []).map((x) => (x.nome_fantasia as string) || (x.name as string)),
  };

  const res = await classifyBlock([{ author: msg.authorName || "Cliente", text: msg.text }], ctx);
  if (!res.ok || !res.data) {
    console.error("[CS/inbound] A1 falhou:", res.error);
    return NextResponse.json({ ok: true, classified: false, reason: res.error });
  }

  // Suggest-only em modo OBSERVAÇÃO: por enquanto só loga (entrada → classificação, p/ calibração).
  // Próxima fatia: surfaçar no grupo interno (Confirmar/Ajustar/Descartar) e criar o ContentCard.
  const det = res.data.itens
    .map((i) => (i.is_demanda ? `${i.tipo}/${i.urgencia}(${i.confianca}): ${i.resumo}` : `não-demanda(${i.tipo})`))
    .join(" | ");
  console.log(
    `[CS/inbound] ${clienteNome}${multiCliente ? " (multi-cliente!)" : ""} ` +
      `"${msg.text.slice(0, 70)}" → ${det}`,
  );

  return NextResponse.json({
    ok: true,
    classified: true,
    cliente: clienteNome,
    itens: res.data.itens,
    multiCliente,
    cacheRead: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  });
}
