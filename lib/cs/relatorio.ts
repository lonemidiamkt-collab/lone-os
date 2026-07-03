// lib/cs/relatorio.ts — A5 (Relatório de entregas) do Agente CS.
// Lógica PURA: recebe os números da semana e monta a mensagem do grupo interno, na voz da
// Lone (calorosa, 1 emoji por linha no máx). Sem I/O — a rota busca os dados e chama isto.
// Backstage/suggest-only: o cliente NUNCA vê. É um resumo pro time, não cobrança.

export interface EntregaItem {
  /** Designer responsável (clients.assigned_designer); null se o cliente não tem designer fixo. */
  designer: string | null;
  /** Entregou até a data de postagem (designer_delivered_at <= due_date)? */
  onTime: boolean;
}

export interface DemandaSocial {
  autor: string;    // quem criou a demanda (social)
  criadas: number;  // demandas criadas na semana
  entregues: number; // dessas, quantas já foram entregues
}

export interface RelatorioInput {
  periodoLabel: string;   // ex.: "23/06 a 27/06"
  entregas: EntregaItem[]; // cards que o designer entregou na semana
  emProducao: number;     // cards em produção agora (snapshot)
  publicados: number;     // cards que foram ao ar na semana (best-effort: status published)
  demandasSocial?: DemandaSocial[]; // demandas CRIADAS pelo social na semana (crédito do social)
}

/** Monta o texto do relatório semanal de entregas pro grupo interno. */
export function buildDeliveryReport(inp: RelatorioInput): string {
  const { periodoLabel, entregas, emProducao, publicados } = inp;
  const linhas: string[] = [`📦 *Entregas da semana* (${periodoLabel})`, ""];

  if (entregas.length === 0) {
    linhas.push("Nenhuma entrega registrada no sistema essa semana.");
    linhas.push("Se teve produção, confirma que os cards estão sendo entregues/movidos no board 👀");
  } else {
    // Agrupa por designer, ordenado por quem mais entregou.
    const porDesigner = new Map<string, { total: number; noPrazo: number }>();
    for (const e of entregas) {
      const nome = e.designer || "Sem designer";
      const g = porDesigner.get(nome) ?? { total: 0, noPrazo: 0 };
      g.total++;
      if (e.onTime) g.noPrazo++;
      porDesigner.set(nome, g);
    }
    linhas.push("🎨 *Designers*");
    for (const [nome, g] of [...porDesigner.entries()].sort((a, b) => b[1].total - a[1].total)) {
      const atrasadas = g.total - g.noPrazo;
      const detalhe = atrasadas === 0
        ? `${g.noPrazo} no prazo ✅`
        : `${g.noPrazo} no prazo, ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""} ⏰`;
      linhas.push(`• ${nome} — ${g.total} entregue${g.total > 1 ? "s" : ""} (${detalhe})`);
    }
    const total = entregas.length;
    const noPrazo = entregas.filter((e) => e.onTime).length;
    linhas.push("", `*Total:* ${total} entregue${total > 1 ? "s" : ""} · ${noPrazo}/${total} no prazo`);
  }

  // Crédito do SOCIAL: demandas que cada um CRIOU na semana (não só a entrega do designer).
  const social = (inp.demandasSocial ?? []).filter((d) => d.criadas > 0);
  if (social.length > 0) {
    linhas.push("", "📋 *Demandas criadas (social)*");
    for (const d of social) {
      linhas.push(`• ${d.autor} — ${d.criadas} criada${d.criadas > 1 ? "s" : ""} (${d.entregues} já entregue${d.entregues !== 1 ? "s" : ""})`);
    }
  }

  if (publicados > 0) linhas.push("", `📢 *Publicados:* ${publicados} no ar`);
  if (emProducao > 0) linhas.push(`⏳ *Em produção agora:* ${emProducao}`);

  linhas.push("", entregas.length > 0 ? "Mandaram bem, time! Bora pra próxima 🚀" : "Bora movimentar o board essa semana! 💪");
  return linhas.join("\n");
}
