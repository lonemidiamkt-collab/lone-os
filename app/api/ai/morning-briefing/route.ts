import { NextRequest, NextResponse } from "next/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `Voce e o "Lone Ads Specialist", analista de performance da agencia Lone Midia.

MISSAO: Gerar o briefing matinal do Gestor de Trafego. Em 30 segundos de leitura ele deve saber:
- Onde esta o FOGO (problemas urgentes)
- Onde esta o OURO (oportunidades de escalar)
- O que esta OK (pode ignorar hoje)

FORMATO DE RESPOSTA (JSON estrito):
{
  "greeting": "Bom dia, Julio. X pontos pra hoje:",
  "urgent": [
    {
      "client": "Nome do Cliente",
      "severity": "critico" | "atencao",
      "title": "Resumo em 1 frase (max 80 chars)",
      "detail": "O que aconteceu e por que (max 120 chars)",
      "action": "O que fazer AGORA (max 100 chars)"
    }
  ],
  "opportunities": [
    {
      "client": "Nome",
      "metric": "ROAS 6.8" ou "CTR 3.2%",
      "suggestion": "Acao para capitalizar (max 100 chars)"
    }
  ],
  "stable": ["Cliente A (ok)", "Cliente B (ok)"],
  "summary": "Resumo geral em 1 frase (max 150 chars)"
}

REGRAS:
- Maximo 3 itens urgentes, 2 oportunidades
- Clientes sem problemas vao para "stable" (so o nome)
- Seja DIRETO e ACIONAVEL — nada de "considere analisar"
- Use numeros reais dos dados fornecidos
- Se spend > 90% do budget no dia 20, alerte pacing
- Se CTR < 0.8%, alerte criativo fraco
- Se ROAS < 2, alerte rentabilidade
- Se frequencia > 3.5, alerte saturacao de publico
- Responda APENAS o JSON`;

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY nao configurada" }, { status: 500 });
  }

  try {
    const { clients } = await req.json();

    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: "Nenhum dado de cliente fornecido" }, { status: 400 });
    }

    // Build compact multi-client summary (minimize tokens)
    const compactClients = clients.map((c: Record<string, unknown>) => ({
      name: c.name,
      campaigns: (c.campaigns as Record<string, unknown>[])?.map((camp: Record<string, unknown>) => ({
        name: camp.name,
        objective: camp.objective,
        status: camp.status,
        spend: camp.spend,
        budget: camp.totalBudget,
        ctr: camp.ctr,
        cpc: camp.cpc,
        roas: camp.roas ?? (Number(camp.conversions) > 0 && Number(camp.spend) > 0 ? (Number(camp.conversions) / Number(camp.spend)).toFixed(2) : null),
        leads: camp.leads,
        messages: camp.messages,
        costPerResult: camp.costPerResult,
        frequency: camp.frequency,
      })) ?? [],
      totalSpend: c.totalSpend,
      totalBudget: c.totalBudget,
    }));

    const userMessage = `Briefing matinal — ${new Date().toLocaleDateString("pt-BR")}

${compactClients.length} clientes ativos:
${JSON.stringify(compactClients, null, 0)}`;

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
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Lone AI] Morning briefing error:", response.status, err);
      return NextResponse.json({ error: `OpenAI error: ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    try {
      const parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      return NextResponse.json({ ...parsed, tokens: data.usage?.total_tokens });
    } catch {
      return NextResponse.json({
        greeting: "Briefing disponivel",
        urgent: [],
        opportunities: [],
        stable: [],
        summary: content?.slice(0, 200) ?? "Erro ao processar",
        tokens: data.usage?.total_tokens,
      });
    }
  } catch (err) {
    console.error("[Lone AI] Morning briefing error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
