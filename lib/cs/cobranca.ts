// lib/cs/cobranca.ts — cobrança de PENDÊNCIAS DO CLIENTE com IMPACTO. Não é cobrança seca: explica
// por que cada pendência trava a operação, sem culpar o cliente, com um próximo passo. Regras de
// comunicação da visão de CS da Lone. SEM financeiro (não cobra pagamento — só material/info/aprovação).

import { chatJson, type OpenAiResult } from "@/lib/ai/openai";

export interface PendCobranca { item: string; impacto?: string }

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["mensagem"],
  properties: { mensagem: { type: "string" } },
};

const SYSTEM = `Você é o CS (Customer Success) da Lone Mídia escrevendo pro CLIENTE pra destravar
pendências que dependem dele (material, informação, aprovação, acesso). Regras firmes:
- EXPLIQUE o impacto de cada pendência — por que aquilo trava/atrasa a operação. Sem impacto vira
  cobrança chata; com impacto o cliente entende a importância.
- NÃO culpe o cliente, não seja defensivo, não soe robótico/template.
- Tom próximo e profissional. Um pedido claro. Se forem 2-3 itens, liste leve; se for 1, foque nele.
- Termine com um PRÓXIMO PASSO que facilita ("me manda ainda hoje? ou prefere que a gente pegue
  numa call rápida de 5 min?").
- NÃO prometa resultado, não fale de dinheiro/pagamento, não invente prazo que não foi combinado.
- Curto: no máximo ~5 linhas. Português do Brasil, natural.
Responda só no JSON {mensagem}.`;

export async function gerarCobrancaPendencias(nome: string, nicho: string | undefined, pendencias: PendCobranca[]): Promise<OpenAiResult<{ mensagem: string }>> {
  const lista = pendencias.map((p) => `- ${p.item}${p.impacto ? ` (impacto: ${p.impacto})` : ""}`).join("\n");
  const user = `Cliente: ${nome}${nicho ? ` (${nicho})` : ""}\nPendências que dependem do cliente:\n${lista}\n\n` +
    `Escreva a mensagem pro cliente cobrando essas pendências com o impacto de cada uma. Se algum item não tem "impacto" descrito, você deduz o impacto real pra operação de marketing/campanha.`;
  return chatJson({ model: "gpt-4o", system: SYSTEM, user, schema: SCHEMA, schemaName: "cs_cobranca", maxTokens: 500, temperature: 0.5 });
}
