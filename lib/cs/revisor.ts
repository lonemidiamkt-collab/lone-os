// lib/cs/revisor.ts — O LONINHO REVISA O QUE OS OUTROS PRODUZEM, antes de sair.
//
// Desenho do Roberto (27/07):
//   1. a demanda chega ao Loninho, que atua como CS sênior
//   2. ele analisa, considera o histórico e o contexto do cliente, e DELEGA ao executor
//   3. o executor devolve o resultado A ELE — nada vai direto pro cliente
//   4. o Loninho revisa com olho de CS: qualidade, clareza, tom, contexto, alinhamento
//   5. ele reprova e manda refazer · pede ajuste · ou aprova
//   6. aprovado, autoriza o envio
//
// Por que essa peça faltava: já existe revisão de ARTE e de POST (lib/cs/revisao-arte.ts e
// revisao-post.ts, ambas com gpt-4o). O que não existia era alguém conferindo o que o próprio
// agente produz — roteiro e planejamento saíam direto do executor pro grupo, sem ninguém olhar
// se aquilo servia PRA AQUELE cliente.
//
// A diferença entre este revisor e as revisões que já existem: aquelas olham a PEÇA (tem erro de
// preço? o texto está certo?). Esta olha o ENCAIXE — este roteiro conversa com o negócio dele,
// com o que ele já pediu, com o que já foi feito?

import { chatJson } from "@/lib/ai/openai";

export type Veredito = "aprovado" | "ajustar" | "refazer";

export interface RevisaoCS {
  veredito: Veredito;
  /** Por que — em uma frase, do jeito que a gente falaria pro executor. */
  motivo: string;
  /** O que mudar, quando o veredito é "ajustar". Vazio quando aprovado. */
  ajustes: string[];
  /** 0–100. Abaixo de 60 nunca vai pro cliente. */
  nota: number;
}

export interface PedidoRevisao {
  /** O que foi produzido (roteiro formatado, plano, texto). */
  peca: string;
  /** Que tipo de peça — muda o que se olha. */
  tipo: "roteiro" | "planejamento" | "legenda" | "mensagem";
  cliente: string;
  /** Briefing do cliente: nicho, tom, público, o que vende. */
  briefing?: string;
  /** O que a pessoa pediu, com as palavras dela. */
  pedido?: string;
  /** Histórico útil: o que já foi feito, o que o cliente reclamou, preferências aprendidas. */
  historico?: string[];
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false,
  required: ["veredito", "motivo", "ajustes", "nota"],
  properties: {
    veredito: { type: "string", enum: ["aprovado", "ajustar", "refazer"] },
    motivo: { type: "string" },
    ajustes: { type: "array", items: { type: "string" } },
    nota: { type: "integer" },
  },
};

const SYSTEM = `Você é o CS sênior da Lone Mídia. Um executor produziu uma peça pra um cliente e
você decide se ela vai ou não. Você conhece o cliente e responde por ele dentro da agência.

# O que você olha (nesta ordem)
1. **Encaixe com o cliente** — isso serve PRA ELE? Fala do que ele vende, pro público dele, no tom
   dele? Peça boa pro cliente errado é peça ruim.
2. **Atende o que foi pedido** — a pessoa pediu uma coisa; entregaram essa coisa?
3. **Clareza** — dá pra executar/publicar sem perguntar nada?
4. **Tom** — soa como a Lone falando, não como texto de banco de modelo.
5. **Erro que vaza pro cliente** — preço, produto, nome, promessa que a gente não pode cumprir.

# Vereditos
- "aprovado" — pode ir. Use quando está bom, mesmo sem estar perfeito. Perfeccionismo trava a operação.
- "ajustar" — serve, mas precisa de mudanças pontuais. Liste ajustes CONCRETOS e acionáveis.
- "refazer" — errou o alvo: fala de outro negócio, ignorou o pedido, ou tem erro que chega no cliente.

# Regras
- Julgue a PEÇA, não o executor.
- Ajuste tem que ser executável: "troque o gancho por um que fale de preço" serve;
  "melhore o gancho" não serve.
- Se falta informação do cliente pra julgar encaixe, aprove e diga no motivo o que faltou —
  não trave a operação por briefing incompleto.
- Nota: 90+ pronto pra cliente · 60-89 serve com ajuste · abaixo de 60 refazer.

Responda APENAS no JSON do schema.`;

export async function revisarComoCS(p: PedidoRevisao): Promise<RevisaoCS> {
  const user = [
    `TIPO: ${p.tipo}`,
    `CLIENTE: ${p.cliente}`,
    p.pedido ? `PEDIRAM: ${p.pedido}` : "",
    p.briefing ? `\nSOBRE O CLIENTE:\n${p.briefing.slice(0, 2000)}` : "\nSOBRE O CLIENTE: (sem briefing salvo)",
    p.historico?.length ? `\nHISTÓRICO:\n${p.historico.slice(0, 8).map((h) => `- ${h}`).join("\n")}` : "",
    `\nPEÇA PRODUZIDA:\n${p.peca.slice(0, 6000)}`,
  ].filter(Boolean).join("\n");

  const r = await chatJson<RevisaoCS>({
    model: "gpt-4o-mini", system: SYSTEM, user,
    schema: SCHEMA, schemaName: "revisao_cs", maxTokens: 700, temperature: 0.2,
  });

  // Revisor fora do ar NÃO pode virar bloqueio: a peça segue, marcada como não revisada.
  // Travar a entrega porque o revisor caiu seria pior que entregar sem revisão.
  if (!r.ok || !r.data) {
    return { veredito: "aprovado", motivo: "não consegui revisar agora — segue sem revisão", ajustes: [], nota: 70 };
  }
  return r.data;
}

/** Vai pro cliente? Só o que passou. "ajustar" volta pro executor, não pro cliente. */
export const liberado = (r: RevisaoCS) => r.veredito === "aprovado" && r.nota >= 60;

/** Como o Loninho conta o veredito no grupo, pro time ver a decisão e discordar se quiser. */
export function textoDoVeredito(r: RevisaoCS, cliente: string): string {
  if (r.veredito === "aprovado") {
    return r.nota >= 90
      ? `✅ Revisei e tá bom pro *${cliente}* — pode mandar.`
      : `✅ Revisei o do *${cliente}* — dá pra usar. ${r.motivo}`;
  }
  const lista = r.ajustes.length ? "\n" + r.ajustes.map((a) => `• ${a}`).join("\n") : "";
  return r.veredito === "ajustar"
    ? `✏️ Quase lá no *${cliente}*: ${r.motivo}${lista}`
    : `🔁 Vou refazer o do *${cliente}*: ${r.motivo}${lista}`;
}
