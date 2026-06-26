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

// Gabarito (blueprint §5 + misses reais do piloto que estamos calibrando).
const CASES: Array<{ msg: string; author: string; esperado: string }> = [
  { author: "Cliente", msg: "preciso de uma arte de promoção pro dia das mães, pra amanhã", esperado: "arte_nova" },
  { author: "Cliente", msg: "cadê a arte que pedi semana passada?", esperado: "cobranca_prazo" },
  { author: "Cliente", msg: "tem que mudar a cor daquele post!", esperado: "ajuste_arte" },
  { author: "Cliente", msg: "semana que vem vou precisar de uns stories", esperado: "agendamento" },
  { author: "Cliente", msg: "esquece a pauta de quarta, mudei de ideia", esperado: "retracao" },
  { author: "Cliente", msg: "o cara do meu site sumiu, que raiva", esperado: "conversa" },
  { author: "Cliente", msg: "valeu, ficou top!", esperado: "elogio" },
  { author: "Cliente", msg: "kkk depois a gente vê isso", esperado: "conversa" },
];

async function main() {
  if (!isOpenAIConfigured()) {
    console.log("OPENAI_API_KEY não definida. Rode:\n  OPENAI_API_KEY=sk-... npx tsx scripts/cs-classify.ts");
    return;
  }

  let acertos = 0;
  let cacheReads = 0;
  for (const c of CASES) {
    const res = await classifyBlock([{ author: c.author, text: c.msg }], CTX);
    if (!res.ok || !res.data) {
      console.log(`❌ ERRO  "${c.msg.slice(0, 40)}..."  → ${res.error}`);
      continue;
    }
    const itens = res.data.itens ?? [];
    const got = itens.length === 0 ? "(sem item)" : `${itens[0].tipo} (conf ${itens[0].confianca})`;
    const ok = c.esperado.startsWith("(sem") ? itens.length === 0 : itens[0]?.tipo === c.esperado;
    if (ok) acertos++;
    cacheReads += res.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    console.log(`${ok ? "✅" : "⚠️ "} esperado=${c.esperado.padEnd(22)} got=${got.padEnd(28)} "${c.msg.slice(0, 40)}"`);
  }
  console.log(`\n${acertos}/${CASES.length} corretos · cache_read_tokens acumulado: ${cacheReads} (deve subir após a 1ª chamada)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
