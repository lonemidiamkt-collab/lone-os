import { NextRequest, NextResponse } from "next/server";

// Critical alerts are rule-based (no AI needed = 0 tokens)
// Only escalates to AI when context is ambiguous

interface Alert {
  id: string;
  severity: "critico" | "alerta";
  client: string;
  title: string;
  detail: string;
  action: string;
  metric: string;
  value: number;
  threshold: number;
}

export async function POST(req: NextRequest) {
  try {
    const { clients } = await req.json();
    if (!clients || !Array.isArray(clients)) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
    }

    const alerts: Alert[] = [];
    const now = new Date();
    const dayOfMonth = now.getDate();

    for (const client of clients) {
      const name = client.name as string;
      const campaigns = (client.campaigns ?? []) as Record<string, unknown>[];
      const totalSpend = Number(client.totalSpend ?? 0);
      const totalBudget = Number(client.totalBudget ?? 0);

      for (const camp of campaigns) {
        const campName = camp.name as string;
        const ctr = Number(camp.ctr ?? 0);
        const cpc = Number(camp.cpc ?? 0);
        const spend = Number(camp.spend ?? 0);
        const budget = Number(camp.totalBudget ?? 0);
        const status = camp.status as string;
        const frequency = Number(camp.frequency ?? 0);
        const leads = Number(camp.leads ?? 0);
        const messages = Number(camp.messages ?? 0);
        const conversions = Number(camp.conversions ?? 0);
        const results = leads + messages + conversions;

        // Rule 1: Campaign error
        if (status === "error") {
          alerts.push({
            id: `err-${camp.id}`,
            severity: "critico",
            client: name,
            title: `Campanha com ERRO`,
            detail: `"${campName}" esta com status de erro. Verificar imediatamente.`,
            action: "Acessar Meta Ads Manager e corrigir a campanha",
            metric: "status",
            value: 0,
            threshold: 0,
          });
        }

        // Rule 2: CTR < 0.8% (creative fatigue)
        if (status === "active" && ctr > 0 && ctr < 0.8) {
          alerts.push({
            id: `ctr-${camp.id}`,
            severity: "alerta",
            client: name,
            title: `CTR muito baixo (${ctr.toFixed(2)}%)`,
            detail: `"${campName}" — criativo possivelmente fraco ou publico saturado.`,
            action: "Trocar criativo ou testar novo publico",
            metric: "ctr",
            value: ctr,
            threshold: 0.8,
          });
        }

        // Rule 3: CPC > R$8 (expensive clicks)
        if (status === "active" && cpc > 8) {
          alerts.push({
            id: `cpc-${camp.id}`,
            severity: "alerta",
            client: name,
            title: `CPC alto (R$${cpc.toFixed(2)})`,
            detail: `"${campName}" — cliques caros, ROI pode ser negativo.`,
            action: "Revisar segmentacao e testar publicos mais quentes",
            metric: "cpc",
            value: cpc,
            threshold: 8,
          });
        }

        // Rule 4: Frequency > 3.5 (audience saturation)
        if (status === "active" && frequency > 3.5) {
          alerts.push({
            id: `freq-${camp.id}`,
            severity: "alerta",
            client: name,
            title: `Publico saturado (freq ${frequency.toFixed(1)})`,
            detail: `"${campName}" — mesmas pessoas vendo o anuncio ${frequency.toFixed(1)}x.`,
            action: "Expandir publico ou criar lookalike novo",
            metric: "frequency",
            value: frequency,
            threshold: 3.5,
          });
        }

        // Rule 5: High spend, zero results
        if (status === "active" && spend > 50 && results === 0) {
          alerts.push({
            id: `zero-${camp.id}`,
            severity: "critico",
            client: name,
            title: `R$${spend.toFixed(0)} gastos, 0 resultados`,
            detail: `"${campName}" — gastando sem converter. Dinheiro queimando.`,
            action: "Pausar AGORA e revisar funil (landing page, oferta, publico)",
            metric: "results",
            value: 0,
            threshold: 1,
          });
        }

        // Rule 6: Budget pacing (>90% spent before day 25)
        if (status === "active" && budget > 0 && dayOfMonth < 25) {
          const pct = (spend / budget) * 100;
          if (pct > 90) {
            alerts.push({
              id: `pace-${camp.id}`,
              severity: "critico",
              client: name,
              title: `Budget ${pct.toFixed(0)}% consumido (dia ${dayOfMonth})`,
              detail: `"${campName}" — verba acaba antes do fim do mes.`,
              action: "Reduzir budget diario ou solicitar aporte ao cliente",
              metric: "pacing",
              value: pct,
              threshold: 90,
            });
          }
        }
      }

      // Rule 7: Client-level — zero spend (campaigns might be paused)
      if (totalBudget > 0 && totalSpend === 0 && campaigns.length > 0) {
        alerts.push({
          id: `nospend-${client.id}`,
          severity: "alerta",
          client: name,
          title: `Cliente sem investimento ativo`,
          detail: `${campaigns.length} campanha(s) configurada(s) mas R$0 de spend.`,
          action: "Verificar se campanhas estao ativas e metodo de pagamento OK",
          metric: "spend",
          value: 0,
          threshold: 1,
        });
      }
    }

    // Sort: critico first, then alerta
    alerts.sort((a, b) => {
      if (a.severity === "critico" && b.severity !== "critico") return -1;
      if (a.severity !== "critico" && b.severity === "critico") return 1;
      return 0;
    });

    return NextResponse.json({
      alerts: alerts.slice(0, 10),
      total: alerts.length,
      checkedAt: now.toISOString(),
      clientsChecked: clients.length,
    });
  } catch (err) {
    console.error("[Lone AI] Critical alerts error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
