// lib/ai/openai.ts — helper de chat JSON da OpenAI (raw fetch, server-only).
// Reusa a OPENAI_API_KEY já configurada na plataforma (mesma das rotas app/api/ai/*).
// Structured outputs via response_format json_schema (strict) → JSON garantido.
// Prompt caching é AUTOMÁTICO na OpenAI (prefixo estável primeiro → cacheia sozinho;
// não há cache_control). Usado pelo Agente CS (A1 = gpt-4o-mini).

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface OpenAiResult<T = unknown> {
  ok: boolean;
  data?: T;
  raw?: string;
  error?: string;
  status?: number;
  usage?: OpenAiUsage;
}

export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export interface ChatJsonParams {
  model: string;
  system: string;
  user: string;
  /** JSON Schema. Em strict mode toda propriedade precisa estar em `required` (use ["tipo","null"] p/ opcional). */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Imagens (data: URI ou URL) que acompanham o `user`.
   *
   * O Radar analisava conteúdo visual lendo só a legenda — o que é o mesmo que julgar um post de
   * antes/depois pelo texto. A Meta entrega o arquivo de post e carrossel de terceiros, e a
   * miniatura de vídeo; usar isso é a diferença entre adivinhar e ver.
   */
  imagens?: string[];
}

/** Modelos que usam o contrato novo de parâmetros (max_completion_tokens, sem temperature livre). */
function ehGpt5(modelo: string): boolean {
  return /^(gpt-5|o[34])/.test(modelo);
}

export async function chatJson<T = unknown>(p: ChatJsonParams): Promise<OpenAiResult<T>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "OPENAI_API_KEY não configurada" };

  let res: Response;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: "system", content: p.system },
          p.imagens?.length
            ? {
                role: "user",
                content: [
                  { type: "text", text: p.user },
                  ...p.imagens.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } })),
                ],
              }
            : { role: "user", content: p.user },
        ],
        // A família GPT-5 trocou `max_tokens` por `max_completion_tokens` e recusa o nome antigo
        // ("Unsupported parameter"). Como o modelo vem por parâmetro, o helper precisa escolher o
        // nome certo — senão toda chamada a um modelo novo falha, e falha só em produção, na
        // primeira vez que alguém trocar o modelo.
        ...(ehGpt5(p.model)
          ? { max_completion_tokens: p.maxTokens ?? 2048 }
          : { max_tokens: p.maxTokens ?? 2048, temperature: p.temperature ?? 0 }),
        response_format: {
          type: "json_schema",
          json_schema: { name: p.schemaName, strict: true, schema: p.schema },
        },
      }),
      signal: AbortSignal.timeout(45_000), // não pendura o webhook/handler se a OpenAI travar
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }

  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* corpo não-JSON */ }
    console.error("[OpenAI]", res.status, msg);
    return { ok: false, error: String(msg), status: res.status };
  }

  let json: { choices?: Array<{ message?: { content?: string; refusal?: string } }>; usage?: OpenAiUsage };
  try { json = JSON.parse(text); } catch { return { ok: false, error: "resposta não-JSON", raw: text, status: res.status }; }

  const choice = json.choices?.[0]?.message;
  if (choice?.refusal) return { ok: false, error: `refusal: ${choice.refusal}`, status: res.status, usage: json.usage };

  const content = choice?.content ?? "";
  try {
    return { ok: true, data: JSON.parse(content) as T, raw: content, usage: json.usage, status: res.status };
  } catch {
    return { ok: false, error: "JSON inválido na resposta estruturada", raw: content, status: res.status };
  }
}
