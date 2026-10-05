// lib/loninho/pedidos/atencao.ts — "Loninho, me manda os clientes que precisam da minha atenção hoje".
// O TEXTO do relatório (puro, testado). Os dados vêm de ./atencao-dados.ts; o PDF é o aviso padrão da
// casa (lib/reports/avisoPdf.ts), que diagrama texto no formato do WhatsApp sem perder linha.
//
// Três fontes, cada uma com o porquê e o que fazer:
//   1. Pra resolver hoje — as prioridades abertas no nome da pessoa (lib/priority, o mesmo /agente);
//   2. Clientes pedindo atenção na carteira dela — a Saúde da carteira (lib/saude), com motivo e
//      próxima ação;
//   3. Tráfego agora — conta parada e saldo zerado de hoje que ninguém resolveu (lib/avisos).
// Fonte que falhou aparece escrita no fim: seção vazia por erro não pode parecer "está tudo bem".

export interface Prioridade { cliente: string; titulo: string; fato: string | null; faca: string; exposicaoRs: number | null }
export interface ClienteAtencao { cliente: string; critico: boolean; motivos: string[]; proximaAcao: string | null; responsavel: string | null; prazo: string | null }
export interface TrafegoAgora { cliente: string; tipo: "conta_parada" | "saldo_zerado"; desde: string }

export interface DadosAtencao {
  prioridades: Prioridade[];
  clientes: ClienteAtencao[];
  trafego: TrafegoAgora[];
  /** Prioridades que existem além das listadas. */
  maisPrioridades: number;
  falhas: string[];
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/ /g, " ");
const dataBr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

export function vazio(d: DadosAtencao): boolean {
  return !d.prioridades.length && !d.clientes.length && !d.trafego.length;
}

export function textoAtencao(d: DadosAtencao, o: { nome: string; equipe: boolean; quando: string }): string {
  const primeiro = o.nome.split(" ")[0];
  const de = o.equipe ? "da equipe" : `de ${primeiro}`;
  const partes: string[] = [`*Atenção de hoje — ${o.equipe ? "equipe" : primeiro}*`, `_${o.quando}_`];

  partes.push("─────", `*🔥 Pra resolver hoje (${d.prioridades.length}${d.maisPrioridades ? ` de ${d.prioridades.length + d.maisPrioridades}` : ""})*`);
  if (d.prioridades.length) {
    for (const p of d.prioridades) {
      partes.push(`• *${p.cliente}* — ${p.titulo}${p.exposicaoRs ? ` (${brl(p.exposicaoRs)}/dia em jogo)` : ""}`);
      if (p.fato) partes.push(`Fato: ${p.fato}`);
      partes.push(`Faça: ${p.faca}`);
    }
    if (d.maisPrioridades) partes.push(`_E mais ${d.maisPrioridades} no /agente._`);
  } else partes.push(`Nenhuma prioridade aberta ${o.equipe ? "na equipe" : "no seu nome"} agora.`);

  partes.push("─────", `*⚠️ Clientes pedindo atenção ${o.equipe ? "na carteira" : "na sua carteira"} (${d.clientes.length})*`);
  if (d.clientes.length) {
    for (const c of d.clientes) {
      partes.push(`• *${c.cliente}*${c.critico ? " — em risco" : ""}: ${c.motivos.slice(0, 2).join("; ") || "pedindo atenção"}`);
      if (c.proximaAcao) partes.push(`Próxima ação: ${c.proximaAcao}${c.responsavel ? ` · ${c.responsavel}` : ""}${c.prazo ? ` · até ${dataBr(c.prazo)}` : ""}`);
    }
  } else partes.push("Nenhum cliente pedindo atenção agora.");

  if (d.trafego.length) {
    partes.push("─────", `*📉 Tráfego agora (${d.trafego.length})*`);
    for (const t of d.trafego) {
      partes.push(`• *${t.cliente}* — ${t.tipo === "conta_parada" ? "conta parada hoje" : "saldo zerado"} (desde ${t.desde})`);
    }
  }

  if (d.falhas.length) partes.push("─────", `_Não consegui ler: ${d.falhas.join(", ")}. Essas seções podem estar incompletas._`);
  partes.push("─────", `_Relatório ${de} pedido ao Loninho. Detalhes e decisões em /agente e /saude._`);
  return partes.join("\n");
}
