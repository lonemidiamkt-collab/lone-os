// lib/traffic/replicar.ts — REPLICAR VENCEDOR: a tarefa que chega ao designer já vem travada.
//
// Brief do Roberto (14/09): "o designer não deveria receber 'faz uma arte para Óticas Rhodrigo'.
// Ele receberia: objetivo, criativo pai, resultado, variável a testar, manter, alterar, formato,
// prazo — e a referência original ao lado." Uma variável por filho, senão o teste não ensina.
// Função pura: monta título, briefing e fingerprint; a rota grava.

export interface PedidoReplicacao {
  cliente: string;
  adId: string;
  adName?: string | null;
  thumbUrl?: string | null;
  resultado: { cpl: number | null; cplMeta: number | null; conversas: number; gasto: number; dias: number };
  variacao: { nome: string; muda: string; mantem: string; testa: string };
  formato: string;
  prazo: string; // YYYY-MM-DD
  roteiro?: { angulo: string; etapas: { tempo: string; nome: string; texto: string }[] } | null;
  elementos?: { tipo: string; descricao: string }[];
  /** linha do estilo visual lido dos prints (lib/traffic/estilo-visual) — entra no briefing quando existe */
  estiloVisual?: string | null;
  pedidoPor: string;
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

/** Slug curto e estável da variável: "tira o preço da imagem" → "preco". Entra no fingerprint. */
export function variavelDe(v: { nome: string; muda: string }): string {
  const s = `${v.nome}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s.slice(0, 40) || "variacao";
}

export function fingerprintReplicacao(adId: string, variavel: string): string {
  return `replica|${adId}|${variavel}`;
}

export function montarDemanda(p: PedidoReplicacao): { titulo: string; briefing: string; attachments: string[] } {
  const r = p.resultado;
  const linhasResultado = [
    r.cpl != null ? `${brl(r.cpl)} por conversa` : `${r.conversas} conversas`,
    r.cplMeta ? `meta do cliente ${brl(r.cplMeta)}${r.cpl != null ? ` (${Math.round((1 - r.cpl / r.cplMeta) * 100)}% abaixo)` : ""}` : "",
    `${r.conversas} conversas com ${brl(r.gasto)} em 7 dias`, `rodando há ${r.dias} dias`,
  ].filter(Boolean).join(" · ");
  const titulo = `Variação do vencedor — ${p.variacao.nome}`.slice(0, 80);
  const briefing = [
    `## Objetivo: replicar o anúncio vencedor testando UMA variável`,
    ``,
    `**Criativo pai:** ${p.adName ?? p.adId} (Meta ad ${p.adId})`,
    `**Resultado do pai:** ${linhasResultado}`,
    ``,
    `**Variável a testar:** ${p.variacao.nome}`,
    `**Alterar:** ${p.variacao.muda}`,
    `**Manter (NÃO mexer):** ${p.variacao.mantem}`,
    `**O que este teste responde:** ${p.variacao.testa}`,
    ``,
    `**Formato:** ${p.formato}`,
    p.estiloVisual ? `\n**Estilo visual da marca (lido das artes entregues/prints):** ${p.estiloVisual}` : "",
    p.elementos?.length ? `\n**O que o pai tem (fato):**\n${p.elementos.map((e) => `- ${e.tipo}: ${e.descricao}`).join("\n")}` : "",
    p.roteiro ? `\n**Roteiro sugerido (Método Lone · ${p.roteiro.angulo}):**\n${p.roteiro.etapas.map((e) => `- ${e.tempo} ${e.nome}: ${e.texto}`).join("\n")}` : "",
    ``,
    `_A referência (miniatura do pai) está anexada. Pedido por ${p.pedidoPor} via Saúde dos Criativos._`,
  ].filter((l) => l !== "").join("\n");
  return { titulo, briefing, attachments: p.thumbUrl ? [p.thumbUrl] : [] };
}

/** Prazo padrão: próximo dia útil (Playbook: mínimo 1 dia útil de antecedência). */
export function prazoPadrao(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
