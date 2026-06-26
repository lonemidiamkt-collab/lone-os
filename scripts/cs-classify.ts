// scripts/cs-classify.ts — calibração AO VIVO do A1 contra a API real.
// Roda os exemplos rotulados do blueprint pelo classificador e compara com o gabarito.
// Uso:  OPENAI_API_KEY=... npx tsx scripts/cs-classify.ts
// Sem a chave, apenas explica como rodar (não chama nada).

import { classifyBlock, type ClassifierContext } from "../lib/cs/classifier";
import { isOpenAIConfigured } from "../lib/ai/openai";

// Contexto SEM briefing — espelha o "Cliente Teste" sintético do modo de teste em prod.
const CTX: ClassifierContext = {
  clienteNome: "Cliente Teste",
  nomesEquipeLone: ["5522981712589", "5522988237830"],
  clientesDoGrupo: ["Cliente Teste"],
};

// Bateria de calibração (blueprint §5 + misses reais do piloto). esperado aceita
// alternativas "a|b" (casos legitimamente ambíguos). minDemandas testa múltiplas demandas.
const CASES: Array<{ msg: string; author?: string; esperado: string; minDemandas?: number }> = [
  // demandas — devem virar demanda do tipo certo
  { msg: "preciso de uma arte de promoção pro dia das mães, pra amanhã", esperado: "arte_nova" },
  { msg: "cadê a arte que pedi semana passada?", esperado: "cobranca_prazo" },
  { msg: "e aquele post, sai hoje?", esperado: "cobranca_prazo" },
  { msg: "tem que mudar a cor daquele post!", esperado: "ajuste_arte" },
  { msg: "troca o telefone na arte de ontem, mudou o número", esperado: "ajuste_arte" },
  { msg: "semana que vem vou precisar de uns stories", esperado: "agendamento" },
  { msg: "os anúncios não estão trazendo resultado, dá uma olhada?", esperado: "feedback_campanha|reclamacao|duvida" },
  { msg: "vocês postam quantas vezes por semana mesmo?", esperado: "duvida" },
  { msg: "tô muito insatisfeito, ninguém me responde aqui", esperado: "reclamacao" },
  { msg: "esquece a pauta de quarta, mudei de ideia", esperado: "retracao" },
  // não-demanda — papo / elogio / outro fornecedor / saudação
  { msg: "valeu, ficou top!", esperado: "elogio|conversa" },
  { msg: "bom dia pessoal", esperado: "conversa|elogio" },
  { msg: "o cara do meu site sumiu, que raiva", esperado: "conversa" },
  { msg: "kkk depois a gente vê isso", esperado: "conversa" },
  // ironia (difícil — A2 trataria; aceita não-demanda ou reclamacao)
  { msg: "nossa, que rápido o post saiu hein 🙄", esperado: "reclamacao|conversa|duvida" },
  // 2 demandas numa mensagem só → deve retornar >= 2 demandas
  { msg: "preciso de uma arte pro dia dos namorados e também muda o telefone do post de ontem", esperado: "arte_nova+ajuste_arte", minDemandas: 2 },
];

async function main() {
  if (!isOpenAIConfigured()) {
    console.log("OPENAI_API_KEY não definida. Rode:\n  OPENAI_API_KEY=sk-... npx tsx scripts/cs-classify.ts");
    return;
  }

  let acertos = 0;
  let cacheReads = 0;
  for (const c of CASES) {
    const res = await classifyBlock([{ author: c.author ?? "Cliente", text: c.msg }], CTX);
    if (!res.ok || !res.data) {
      console.log(`❌ ERRO  "${c.msg.slice(0, 42)}"  → ${res.error}`);
      continue;
    }
    const itens = res.data.itens ?? [];
    const demandas = itens.filter((i) => i.is_demanda);
    let ok: boolean;
    let got: string;
    if (c.minDemandas) {
      ok = demandas.length >= c.minDemandas;
      got = `${demandas.length} demanda(s): ${demandas.map((d) => d.tipo).join(",")}`;
    } else {
      const alt = c.esperado.split("|");
      ok = itens.length > 0 && alt.includes(itens[0].tipo);
      got = itens.length === 0 ? "(sem item)" : `${itens[0].tipo}(${itens[0].confianca})`;
    }
    if (ok) acertos++;
    cacheReads += res.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    console.log(`${ok ? "✅" : "⚠️ "} esperado=${c.esperado.padEnd(30)} got=${got.padEnd(32)} "${c.msg.slice(0, 42)}"`);
  }
  console.log(`\n${acertos}/${CASES.length} corretos · cache_read acumulado: ${cacheReads}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
