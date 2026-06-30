// lib/cs/autoavaliacao.ts — Cap 7 do treinamento: o agente mede a PRÓPRIA acurácia.
// A partir do histórico de cs_demandas (sugeriu → equipe confirmou/recusou), calcula taxa de
// aprovação, falso positivo e os erros que se REPETEM. Funções puras (testáveis).

export interface DemandaAval { tipo: string; status: string; cliente_nome?: string | null; }

export interface AutoavalStats {
  total: number;
  aprovadas: number;          // status confirmada
  recusadas: number;          // status descartada (falso positivo provável)
  pendentes: number;
  taxaAprovacao: number | null;    // % das DECIDIDAS (meta > 75)
  taxaFalsoPositivo: number | null; // % das DECIDIDAS (meta < 10)
  recorrentesTipo: { tipo: string; recusas: number }[];     // tipos recusados (>=2)
  recorrentesCliente: { cliente: string; recusas: number }[]; // clientes c/ recusas (>=2)
}

export function computeAutoavaliacao(demandas: DemandaAval[]): AutoavalStats {
  const aprovadas = demandas.filter((d) => d.status === "confirmada").length;
  const recusadas = demandas.filter((d) => d.status === "descartada").length;
  const pendentes = demandas.filter((d) => d.status === "pendente").length;
  const decididas = aprovadas + recusadas;

  const porTipo: Record<string, number> = {};
  const porCliente: Record<string, number> = {};
  for (const d of demandas) {
    if (d.status !== "descartada") continue;
    porTipo[d.tipo] = (porTipo[d.tipo] ?? 0) + 1;
    const c = (d.cliente_nome || "").trim();
    if (c) porCliente[c] = (porCliente[c] ?? 0) + 1;
  }
  const recorrentesTipo = Object.entries(porTipo)
    .filter(([, n]) => n >= 2).map(([tipo, recusas]) => ({ tipo, recusas }))
    .sort((a, b) => b.recusas - a.recusas);
  const recorrentesCliente = Object.entries(porCliente)
    .filter(([, n]) => n >= 2).map(([cliente, recusas]) => ({ cliente, recusas }))
    .sort((a, b) => b.recusas - a.recusas);

  return {
    total: demandas.length, aprovadas, recusadas, pendentes,
    taxaAprovacao: decididas ? Math.round((aprovadas / decididas) * 100) : null,
    taxaFalsoPositivo: decididas ? Math.round((recusadas / decididas) * 100) : null,
    recorrentesTipo, recorrentesCliente,
  };
}

const status = (taxa: number | null, meta: number, maior: boolean): string => {
  if (taxa == null) return "—";
  const ok = maior ? taxa >= meta : taxa <= meta;
  return ok ? "✅" : "⚠️";
};

export function formatAutoavaliacao(s: AutoavalStats, periodoLabel: string): string {
  if (s.total === 0) {
    return `📊 *Autoavaliação do Lone* — ${periodoLabel}\n\nNenhuma sugestão na semana. Sem dados pra avaliar ainda. 🤖`;
  }
  const linhas = [
    `📊 *Autoavaliação do Lone* — ${periodoLabel}`,
    ``,
    `Sugeri *${s.total}* demanda${s.total === 1 ? "" : "s"}:`,
    `✅ Aprovadas: ${s.aprovadas}`,
    `❌ Recusadas: ${s.recusadas}`,
    `⏳ Pendentes: ${s.pendentes}`,
    ``,
    `${status(s.taxaAprovacao, 75, true)} Taxa de acerto: *${s.taxaAprovacao ?? "—"}%* (meta >75%)`,
    `${status(s.taxaFalsoPositivo, 10, false)} Falso positivo: *${s.taxaFalsoPositivo ?? "—"}%* (meta <10%)`,
  ];
  if (s.recorrentesTipo.length || s.recorrentesCliente.length) {
    linhas.push(``, `⚠️ *Erros que se repetiram* (pra eu calibrar):`);
    s.recorrentesTipo.forEach((r) => linhas.push(`• tipo _${r.tipo}_: ${r.recusas} recusas`));
    s.recorrentesCliente.forEach((r) => linhas.push(`• cliente *${r.cliente}*: ${r.recusas} recusas`));
  } else if (s.recusadas === 0) {
    linhas.push(``, `🎯 Zero recusas — tô no caminho certo!`);
  }
  linhas.push(``, `_Me corrige sempre que eu errar (responde "não") — é assim que eu melhoro._`);
  return linhas.join("\n");
}
