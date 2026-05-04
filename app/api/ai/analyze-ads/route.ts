export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { aiCache } from "@/lib/ai/cache";

// Server-side only — API key never exposed to frontend
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `Voce e o "Lone Ads Specialist", consultor de performance de trafego pago da agencia Lone Midia.

PERFIL:
- Consultoria de Growth de alto padrao
- Tom direto, tecnico, focado em resultados
- Analisa dados de Meta Ads e Google Ads

FORMATO DE RESPOSTA (JSON estrito):
{
  "score": 0-100 (saude geral da conta),
  "status": "otimo" | "bom" | "atencao" | "critico",
  "insights": [
    {
      "type": "positivo" | "alerta" | "critico" | "sugestao",
      "title": "Titulo curto (max 60 chars)",
      "body": "Explicacao direta (max 150 chars)",
      "action": "Acao recomendada (opcional, max 100 chars)"
    }
  ],
  "summary": "Resumo executivo em 1-2 frases (max 200 chars)"
}

REGRAS:
- Maximo 4 insights
- Se CTR < 1%, alerte sobre criativo fraco
- Se CPC > media do nicho, sugira otimizacao de publico
- Se ROAS < 2, alerte sobre rentabilidade
- Se houver campanhas com status "error", marque como critico
- Se spend esta acima de 90% do budget, alerte sobre pacing
- Sempre sugira UMA acao concreta e especifica
- NUNCA invente dados que nao foram fornecidos
- Responda APENAS o JSON, sem markdown`;

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "API key nao configurada. Adicione OPENAI_API_KEY ao .env.local" },
      { status: 500 }
    );
  }

  try {
    const { clientName, clientId, campaigns, period, triggeredBy } = await req.json();

    if (!campaigns || !Array.isArray(campaigns)) {
      return NextResponse.json({ error: "Dados de campanha invalidos" }, { status: 400 });
    }

    // Build compact data payload (minimize tokens)
    const compactData = campaigns.map((c: Record<string, unknown>) => ({
      name: c.name,
      objective: c.objective,
      status: c.status,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      cpc: c.cpc,
      cpm: c.cpm,
      conversions: c.conversions,
      leads: c.leads,
      messages: c.messages,
      costPerResult: c.costPerResult,
      roas: c.roas,
      budget: c.totalBudget,
    }));

    const userMessage = `Analise as campanhas do cliente "${clientName}" (periodo: ${period || "ultimos 30 dias"}).

Dados:
${JSON.stringify(compactData, null, 0)}

Total de campanhas: ${compactData.length}
Spend total: R$ ${compactData.reduce((s: number, c: Record<string, unknown>) => s + (Number(c.spend) || 0), 0).toFixed(2)}
Campanhas ativas: ${compactData.filter((c: Record<string, unknown>) => c.status === "active").length}
Campanhas com erro: ${compactData.filter((c: Record<string, unknown>) => c.status === "error").length}`;

    // Cache: key by (clientId + compactData + period + day). Análise muda raramente no mesmo dia.
    // Miss → chama OpenAI. Hit → devolve direto (zero tokens).
    const cacheResult = await aiCache.getOrFetch<{
      parsed: { score?: number; status?: string; insights?: unknown; summary?: string };
      model: string;
      tokens: number;
    }>({
      category: "analyze-ads",
      model: "gpt-4o-mini",
      payload: { clientId, compactData, period },
      ttlMinutes: 60 * 24, // 24h
      bucketGranularity: "day",
      fetcher: async () => {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 600,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error("[Lone AI] OpenAI error:", response.status, errorBody);
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) throw new Error("Resposta vazia da IA");

        let parsed: { score?: number; status?: string; insights?: unknown; summary?: string };
        try {
          parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
        } catch {
          parsed = {
            score: 50,
            status: "atencao",
            insights: [{ type: "sugestao", title: "Analise disponivel", body: content.slice(0, 200) }],
            summary: content.slice(0, 200),
          };
        }

        return {
          response: { parsed, model: data.model, tokens: data.usage?.total_tokens ?? 0 },
          tokensPrompt: data.usage?.prompt_tokens,
          tokensCompletion: data.usage?.completion_tokens,
        };
      },
    }).catch((err) => {
      console.error("[Lone AI] fetcher error:", err);
      return null;
    });

    if (!cacheResult) {
      return NextResponse.json({ error: "Erro ao gerar análise" }, { status: 502 });
    }

    const { parsed, model, tokens } = cacheResult.response;

    // Persist audit apenas em cache miss (quando realmente houve análise nova).
    // Cache hit não gera novo audit — o audit original já registrou a análise.
    if (clientId && !cacheResult.hit) {
      supabaseAdmin.from("ai_audits").insert({
        client_id: clientId,
        type: "campaign_analysis",
        score: parsed.score ?? null,
        status: parsed.status ?? null,
        summary: parsed.summary ?? null,
        insights: parsed.insights ?? null,
        raw_response: { model, tokens, ...parsed },
        triggered_by: triggeredBy ?? null,
        visible_to_client: true,
      }).then(({ error }) => {
        if (error) console.error("[AI Audit] Failed to persist:", error.message);
      });
    }

    return NextResponse.json({
      ...parsed,
      model,
      tokens,
      cached: cacheResult.hit,
    });
  } catch (err) {
    console.error("[Lone AI] Error:", err);
    return NextResponse.json(
      { error: "Erro interno ao processar analise" },
      { status: 500 }
    );
  }
}
