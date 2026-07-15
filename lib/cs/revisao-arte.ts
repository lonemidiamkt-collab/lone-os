// lib/cs/revisao-arte.ts — revisão de QUALIDADE da arte entregue, por IA (visão), ANTES de ir ao
// cliente. Confere a arte contra o briefing/regras: erro de texto, preço/telefone legível, logo,
// palavra proibida, aderência ao tema. Provider: OpenAI gpt-4o (visão + julgamento). Nunca lança.

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export interface RevisaoInput {
  imageUrl: string;         // arte entregue (URL pública)
  clienteNome: string;
  briefing?: string;        // briefing do cliente
  regras?: string[];        // do's & don'ts
  temaEsperado: string;     // título/briefing da arte (o que era pra ser)
}

export interface RevisaoOutput {
  ok: boolean;              // arte parece pronta pra ir ao cliente?
  problemas: string[];      // problemas concretos encontrados (vazio se ok)
  resumo: string;           // 1 frase de veredito
}

export interface RevisaoResult { ok: boolean; data: RevisaoOutput | null; error?: string; }

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["ok", "problemas", "resumo"],
  properties: {
    ok: { type: "boolean" },
    problemas: { type: "array", items: { type: "string" } },
    resumo: { type: "string" },
  },
};

const SYSTEM = `Você é revisor(a) de qualidade de arte de uma agência. Recebe UMA arte JÁ PRONTA e um
texto de briefing. Sua função é pegar ERROS CONCRETOS antes de a arte ir ao cliente — não avaliar gosto,
não elogiar, não "aprovar conceito".

REGRA DE OURO — você SÓ enxerga a imagem. Você NÃO tem acesso a links (Google Drive, Figma, sites),
nem sabe a "identidade visual" pretendida. NUNCA afirme que a arte "está de acordo com o briefing",
"segue a identidade", "está alinhada com o Figma" ou coisa parecida — você não tem como verificar isso.
Julgue APENAS o que dá pra ver na própria arte.

O QUE PODE VIRAR UM PROBLEMA (só reporte se estiver VISÍVEL e você tiver CERTEZA):
1. TEXTO: erro de ortografia/português, palavra cortada ou sobreposta, texto ilegível ou espremido.
2. DADO que CONTRADIZ o briefing: só quando o briefing traz um VALOR CONCRETO (um preço, telefone,
   endereço, nome de produto, data) E a arte mostra OUTRO diferente. Ex.: briefing "R$23,00" e a arte
   "R$32,00" → aponte. Placeholder esquecido ("R$00,00", "lorem ipsum", "inserir preço") → aponte.
3. LOGO/MARCA: só aponte "falta logo" se o briefing EXIGIR logo e ela claramente não aparecer.
4. REGRA explícita do briefing violada (ex.: "nunca usar vermelho" e a arte é vermelha).

NÃO FAÇA:
- NÃO invente divergência quando o briefing não tem o dado pra comparar (ex.: briefing só com link →
  não há preço/telefone pra conferir; então NÃO comente nada sobre "bater com o briefing").
- NÃO comente estética, layout, "poderia melhorar", cores bonitas, composição.
- NÃO afirme conformidade com o que você não vê.

RESULTADO:
- Sem erro concreto visível → ok=true, problemas=[], e um resumo HONESTO e específico do que você
  conferiu, ex.: "Sem erros de texto ou preço aparentes na arte." (NUNCA "está de acordo com o briefing").
- Com erro concreto → ok=false e cada item em "problemas" de forma acionável, ex.:
  "'promção' escrito errado (é 'promoção')", "preço R$32 na arte diverge do R$23 do briefing",
  "telefone ilegível no rodapé". Na dúvida entre apontar algo incerto ou não, NÃO aponte.
Responda APENAS no JSON do schema.`;

export async function revisarArte(inp: RevisaoInput): Promise<RevisaoResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, data: null, error: "OPENAI_API_KEY não configurada" };
  const regras = inp.regras?.length ? inp.regras.map((r) => `- ${r}`).join("\n") : "(nenhuma)";
  const contexto =
    `Cliente: ${inp.clienteNome}\n` +
    `Era pra ser: ${inp.temaEsperado}\n` +
    `Briefing: ${inp.briefing?.slice(0, 1400) || "(sem briefing)"}\n` +
    `Do's & don'ts:\n${regras}\n\nRevise a arte anexada.`;
  try {
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 500,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "cs_revisao_arte", strict: true, schema: SCHEMA } },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: [
            { type: "text", text: contexto },
            { type: "image_url", image_url: { url: inp.imageUrl, detail: "high" } },
          ] },
        ],
      }),
      signal: AbortSignal.timeout(40_000),
    });
    const body = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(body)?.error?.message ?? msg; } catch { /* corpo não-JSON */ }
      console.error("[CS/revisao-arte]", res.status, msg);
      return { ok: false, data: null, error: String(msg) };
    }
    const j = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    return { ok: true, data: JSON.parse(content) as RevisaoOutput };
  } catch (err) {
    return { ok: false, data: null, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}
