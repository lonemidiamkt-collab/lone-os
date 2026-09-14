// lib/traffic/vencedor.ts — VENCEDOR → ELEMENTOS → HIPÓTESES → VARIAÇÕES → ROTEIRO. Fase 2.
//
// Roberto (13/09): "viu que deu muito bom, falar pra refazer já um novo com um novo teste, e às
// vezes poderia até verificar o criativo e mandar já um roteiro pronto daquele criativo".
//
// A separação que o revisor exigiu: FATO (o que o criativo contém — lido da miniatura, do texto e
// da métrica) ≠ HIPÓTESE (por que pode ter funcionado). A IA nunca afirma causa: "oferta explícita
// nos primeiros segundos; hipótese: contribuiu". Cada variação testa UMA hipótese, mantendo o
// resto — senão o teste não ensina nada. O roteiro sai pelo gerador da casa (Método Lone), com o
// vencedor como contexto factual.

import { chatJson } from "@/lib/ai/openai";
import { gerarRoteiros, type BriefingCliente, type Roteiro } from "@/lib/cs/criativo";

export interface CriativoVencedor {
  adId: string;
  adName?: string | null;
  tipo?: string | null;
  thumbUrl?: string | null;
  body?: string | null;
  title?: string | null;
  cta?: string | null;
}

export interface ResultadoVencedor {
  cpl: number | null; cplMeta: number | null; conversas: number; gasto: number; ctr: number | null; ctrConta: number | null; dias: number;
}

export interface AnaliseVencedor {
  elementos: { tipo: string; descricao: string }[];       // FATO: o que a peça tem
  hipoteses: { hipotese: string; elemento: string; confianca: "alta" | "media" | "baixa" }[];
  variacoes: { nome: string; muda: string; mantem: string; testa: string }[];  // 2
  resumo_para_o_time: string;                              // 2 frases, sem "causou"
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["elementos", "hipoteses", "variacoes", "resumo_para_o_time"],
  properties: {
    elementos: { type: "array", items: { type: "object", additionalProperties: false, required: ["tipo", "descricao"], properties: { tipo: { type: "string" }, descricao: { type: "string" } } } },
    hipoteses: { type: "array", items: { type: "object", additionalProperties: false, required: ["hipotese", "elemento", "confianca"], properties: { hipotese: { type: "string" }, elemento: { type: "string" }, confianca: { type: "string", enum: ["alta", "media", "baixa"] } } } },
    variacoes: { type: "array", items: { type: "object", additionalProperties: false, required: ["nome", "muda", "mantem", "testa"], properties: { nome: { type: "string" }, muda: { type: "string" }, mantem: { type: "string" }, testa: { type: "string" } } } },
    resumo_para_o_time: { type: "string" },
  },
};

const SYSTEM = `Você analisa o ANÚNCIO VENCEDOR de uma loja/comércio local (Região dos Lagos, RJ) para a equipe de tráfego de uma agência.
Você recebe a miniatura, o texto do anúncio e o resultado contra a meta do cliente.

REGRA CENTRAL — FATO ≠ HIPÓTESE:
- ELEMENTOS são fatos: o que a peça contém (formato, texto na imagem, oferta, preço, produto, pessoa, cor, CTA, gancho do texto). Só liste o que você VÊ ou LÊ. Nada de "provavelmente tem".
- HIPÓTESES são o que PODE ter contribuído para o resultado. Cada hipótese aponta para UM elemento. Escreva SEMPRE como hipótese ("hipótese: o preço explícito reduziu a fricção"), NUNCA como causa ("o preço fez vender"). Você não tem teste A/B; correlação não é causa.
- Confiança: alta só quando o elemento é raro e o resultado é muito acima da meta; média por padrão; baixa quando é chute educado.

VARIAÇÕES (exatamente 2): cada uma muda UMA coisa e mantém o resto — para o teste ensinar algo. "muda" = o que troca; "mantem" = os elementos que ficam iguais (os das hipóteses de maior confiança); "testa" = a hipótese que essa variação põe à prova.

resumo_para_o_time: 2 frases, direto, em português de agência. Sem "causou", sem elogio vazio.`;

export async function analisarVencedor(p: { criativo: CriativoVencedor; resultado: ResultadoVencedor; cliente: string; nicho?: string | null }) {
  const r = p.resultado;
  const user = [
    `Cliente: ${p.cliente}${p.nicho ? ` (${p.nicho})` : ""}`,
    `Anúncio: ${p.criativo.adName ?? p.criativo.adId} · formato: ${p.criativo.tipo ?? "?"} · CTA: ${p.criativo.cta ?? "?"}`,
    `Texto do anúncio: """${(p.criativo.body ?? "").slice(0, 1200)}"""`,
    p.criativo.title ? `Título: ${p.criativo.title}` : "",
    `Resultado (7 dias): ${r.conversas} conversas com R$ ${r.gasto.toFixed(2)}${r.cpl != null ? ` — R$ ${r.cpl.toFixed(2)} por conversa` : ""}${r.cplMeta ? ` (meta do cliente: R$ ${r.cplMeta.toFixed(2)})` : ""}${r.ctr != null ? ` · CTR ${r.ctr.toFixed(2)}%${r.ctrConta ? ` (mediana da conta ${r.ctrConta.toFixed(2)}%)` : ""}` : ""} · rodando há ${r.dias} dias`,
    p.criativo.thumbUrl ? "A miniatura do anúncio está anexada." : "Sem miniatura disponível — analise só pelo texto e diga isso nos elementos.",
  ].filter(Boolean).join("\n");
  return chatJson<AnaliseVencedor>({
    model: "gpt-4o", schemaName: "vencedor_analise", schema: SCHEMA, maxTokens: 1400, temperature: 0.3,
    system: SYSTEM, user, imagens: p.criativo.thumbUrl ? [p.criativo.thumbUrl] : undefined, origem: "trafego:vencedor",
  });
}

/** Roteiro de UMA variação, pelo gerador da casa (Método Lone), com o vencedor como base factual. */
export async function roteiroDaVariacao(p: { briefing: BriefingCliente; preferencias: string[]; criativo: CriativoVencedor; analise: AnaliseVencedor; variacao: AnaliseVencedor["variacoes"][number] }): Promise<Roteiro | null> {
  const mantem = p.analise.hipoteses.filter((h) => h.confianca !== "baixa").map((h) => `${h.elemento} (hipótese: ${h.hipotese})`).join("; ");
  const contexto = [
    `ANÚNCIO VENCEDOR ATUAL (base factual — o novo roteiro é uma VARIAÇÃO dele, não uma peça nova):`,
    `Texto do vencedor: """${(p.criativo.body ?? "").slice(0, 1000)}"""`,
    `Elementos do vencedor: ${p.analise.elementos.map((e) => `${e.tipo}: ${e.descricao}`).join(" · ")}`,
    `MANTER (elementos que as hipóteses apontam): ${mantem || "(nenhum com confiança)"}`,
    `MUDAR nesta variação: ${p.variacao.muda}`,
    `O que este teste põe à prova: ${p.variacao.testa}`,
  ].join("\n");
  const res = await gerarRoteiros({
    briefing: p.briefing, preferencias: p.preferencias, estagioFunil: "meio",
    pedido: `Variação "${p.variacao.nome}" do anúncio vencedor — muda só: ${p.variacao.muda}. Mantém: ${p.variacao.mantem}.`,
    contexto,
  });
  if (!res.ok || !res.data || res.data.precisa_briefing || !res.data.roteiros.length) return null;
  return [...res.data.roteiros].sort((a, b) => b.scorecard - a.scorecard)[0];
}
