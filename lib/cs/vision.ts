// lib/cs/vision.ts — descrição de IMAGEM do Agente CS (reconhecimento de foto/print).
// Cliente manda foto ("faz parecido com isso", print de concorrente, foto de produto, tabela de
// preços) → aqui a imagem vira TEXTO, que segue pro A1/A3 como qualquer demanda. Provider: OpenAI
// gpt-4o-mini com detail "low" (imagem ~85 tokens fixos → barato). Nunca lança.

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const VISION_SYSTEM =
  "Você lê uma IMAGEM enviada num grupo de WhatsApp de um cliente de agência de marketing e a " +
  "descreve pra quem vai CRIAR a arte/post. Seja PRECISO e ÚTIL pro designer — extraia nesta ordem:\n" +
  "1. O QUE É: panfleto/anúncio, print de concorrente, foto de produto, referência de estilo, tabela " +
  "de preços, print de conversa, logo, ou foto pessoal/meme sem relação.\n" +
  "2. TEXTO E DADOS (o mais importante): transcreva LITERALMENTE o que estiver legível e importa — " +
  "nome exato do produto, PREÇO (com centavos), condição de pagamento, desconto/oferta, telefone, " +
  "data, chamada/headline. NÃO arredonde, não resuma número, não invente o que está borrado.\n" +
  "3. VISUAL (se for referência de estilo): cores predominantes, clima/estética e elementos que o " +
  "cliente parece querer reproduzir.\n" +
  "4. INTENÇÃO provável: arte NOVA desse produto/oferta? reproduzir algo parecido? só informação?\n" +
  "Responda em 2-4 frases objetivas com os DADOS explícitos (produto/preço/oferta em destaque). Não " +
  "invente o que não dá pra ver. Se for claramente foto pessoal/meme/figurinha sem valor pra um " +
  "pedido, responda APENAS: IRRELEVANTE.";

export interface VisionResult {
  ok: boolean;
  /** Descrição textual (ou null se irrelevante / falhou). */
  descricao: string | null;
  error?: string;
}

/** Descreve uma imagem (base64) pra virar contexto textual. detail "low" = custo mínimo. */
export async function describeImage(base64: string, mimetype?: string): Promise<VisionResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, descricao: null, error: "OPENAI_API_KEY não configurada" };
  const mime = mimetype || "image/jpeg";
  const dataUri = base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
  try {
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 420,
        temperature: 0,
        messages: [
          { role: "system", content: VISION_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Leia esta imagem para um pedido de arte/marketing. Transcreva preço, produto e oferta com precisão:" },
              // detail "high" = lê texto fino (preço/produto/tabela) com precisão — a leitura da arte
              // é um valor central do agente; o custo extra compensa o acerto no briefing do designer.
              { type: "image_url", image_url: { url: dataUri, detail: "high" } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(body)?.error?.message ?? msg; } catch { /* corpo não-JSON */ }
      console.error("[CS/vision]", res.status, msg);
      return { ok: false, descricao: null, error: String(msg) };
    }
    const j = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
    const desc = (j.choices?.[0]?.message?.content ?? "").trim();
    if (!desc || /^irrelevante\b/i.test(desc)) return { ok: true, descricao: null };
    return { ok: true, descricao: desc.slice(0, 500) };
  } catch (err) {
    return { ok: false, descricao: null, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}
