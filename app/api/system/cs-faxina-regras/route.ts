export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { motivoParaNaoVirarRegra, DEFINICAO_DE_REGRA, TIPOS_REGRA, ESCOPO_POR_TIPO, type TipoRegra } from "@/lib/cs/regras";
import { sincronizarBriefingAprendido } from "@/lib/cs/briefing-sync";

// POST /api/system/cs-faxina-regras — limpa a memória dos clientes acumulada pelo extrator antigo.
//
// A auditoria de 22/08/2026 encontrou 378 regras e apenas ~10 acionáveis: 98 eram preço de produto,
// 26 promoção com prazo, 18 estado passageiro. Isso não é só sujeira parada — toda vez que alguém
// gera legenda, revisa post ou confere arte, essas linhas entram no prompt e disputam atenção com
// as regras que importam.
//
// NADA É APAGADO: as regras saem com ativo=false e continuam na tabela, reversíveis com um UPDATE.
//
// Dois passos: (1) portão determinístico, barato e sem alucinação; (2) para o que sobrou, a IA
// classifica nos 4 tipos — o que ela não conseguir classificar não era regra.
// ?dry=1 (padrão é DRY) · ?apply=1 executa · ?limitIa=N limita o passo 2.

interface Linha { id: string; cliente: string; texto: string; motivo: string }

const SCHEMA_TRIAGEM = {
  type: "object", additionalProperties: false, required: ["itens"],
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["i", "manter", "tipo"],
        properties: {
          i: { type: "integer", description: "índice da regra na lista enviada" },
          manter: { type: "boolean", description: "true se é REGRA durável do cliente" },
          tipo: { type: "string", enum: [...TIPOS_REGRA, "nenhum"] },
        },
      },
    },
  },
} as const;

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const apply = req.nextUrl.searchParams.get("apply") !== null;
  const limitIa = parseInt(req.nextUrl.searchParams.get("limitIa") ?? "400", 10);

  const { data: regras } = await supabaseAdmin
    .from("cs_client_rules")
    .select("id, texto, escopo, client_id, clients(name, nome_fantasia)")
    .eq("ativo", true).neq("escopo", "roteiro");

  const todas = (regras ?? []).map((r) => {
    const cl = r.clients as unknown as { name?: string; nome_fantasia?: string } | null;
    return { id: r.id as string, clientId: r.client_id as string,
             cliente: cl?.nome_fantasia || cl?.name || "?", texto: r.texto as string };
  });

  // ── Passo 1: portão determinístico ──
  const remover: Linha[] = [];
  const sobraram: typeof todas = [];
  for (const r of todas) {
    const m = motivoParaNaoVirarRegra(r.texto);
    if (m) remover.push({ id: r.id, cliente: r.cliente, texto: r.texto, motivo: m });
    else sobraram.push(r);
  }

  // ── Passo 2: IA classifica o que sobrou ──
  const reclassificar: { id: string; tipo: TipoRegra }[] = [];
  if (isOpenAIConfigured() && sobraram.length) {
    const lote = sobraram.slice(0, limitIa);
    for (let i = 0; i < lote.length; i += 40) {
      const chunk = lote.slice(i, i + 40);
      const r = await chatJson<{ itens: { i: number; manter: boolean; tipo: string }[] }>({
        model: "gpt-4o-mini", schemaName: "faxina_regras", schema: SCHEMA_TRIAGEM,
        maxTokens: 1500, temperature: 0,
        system:
          `Você faz a triagem da memória que uma agência guardou sobre seus clientes. Para cada ` +
          `item, decida se é uma REGRA durável ou se é lixo que entrou por engano.\n\n` +
          `${DEFINICAO_DE_REGRA}\n\n` +
          `manter=false para: catálogo/estoque, preço, promoção, estado passageiro, narrativa sobre ` +
          `o que o cliente "está fazendo"/"pretende", pedido de uma peça específica, conversa.\n` +
          `manter=true SÓ quando muda o que a equipe faz na próxima peça. Na dúvida, manter=true — ` +
          `barrar uma regra boa custa mais caro que deixar uma fraca.`,
        user: chunk.map((x, k) => `${k}. ${x.texto}`).join("\n"),
      });
      if (!r.ok || !r.data) continue;
      for (const it of r.data.itens ?? []) {
        const alvo = chunk[it.i];
        if (!alvo) continue;
        if (!it.manter) {
          remover.push({ id: alvo.id, cliente: alvo.cliente, texto: alvo.texto, motivo: "nao_e_regra" });
        } else if (TIPOS_REGRA.includes(it.tipo as TipoRegra)) {
          // Aproveita a passagem pra colocar a regra no escopo certo: 376 das 378 estavam em
          // "sempre", então nada conseguia filtrar regra de arte na hora de conferir a arte.
          reclassificar.push({ id: alvo.id, tipo: it.tipo as TipoRegra });
        }
      }
    }
  }

  const porMotivo = remover.reduce<Record<string, number>>((a, r) => ({ ...a, [r.motivo]: (a[r.motivo] ?? 0) + 1 }), {});
  const porCliente = remover.reduce<Record<string, number>>((a, r) => ({ ...a, [r.cliente]: (a[r.cliente] ?? 0) + 1 }), {});

  if (apply && remover.length) {
    const ids = remover.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 100) {
      await supabaseAdmin.from("cs_client_rules").update({ ativo: false }).in("id", ids.slice(i, i + 100));
    }
    for (const rc of reclassificar) {
      await supabaseAdmin.from("cs_client_rules").update({ escopo: ESCOPO_POR_TIPO[rc.tipo] }).eq("id", rc.id);
    }
    // O briefing visível é regenerado a partir das regras ATIVAS — sem isto o texto continuaria
    // mostrando os preços que acabamos de tirar.
    for (const clientId of [...new Set(todas.map((t) => t.clientId))]) {
      await sincronizarBriefingAprendido(clientId);
    }
  }

  return NextResponse.json({
    ok: true,
    modo: apply ? "APLICADO" : "simulação (use ?apply=1 pra executar)",
    total_ativas: todas.length,
    desativar: remover.length,
    manter: todas.length - remover.length,
    reclassificadas: reclassificar.length,
    por_motivo: porMotivo,
    por_cliente: Object.fromEntries(Object.entries(porCliente).sort((a, b) => b[1] - a[1])),
    amostra: remover.slice(0, 40).map((r) => `[${r.motivo}] ${r.cliente}: ${r.texto.slice(0, 90)}`),
  });
}
