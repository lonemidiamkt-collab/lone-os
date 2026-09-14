// lib/ai/openai.ts — helper de chat JSON da OpenAI (raw fetch, server-only).
// Reusa a OPENAI_API_KEY já configurada na plataforma (mesma das rotas app/api/ai/*).
// Structured outputs via response_format json_schema (strict) → JSON garantido.
// Prompt caching é AUTOMÁTICO na OpenAI (prefixo estável primeiro → cacheia sozinho;
// não há cache_control). Usado pelo Agente CS (A1 = gpt-4o-mini).

import { registrarChamadaLlm } from "@/lib/obs/llm";

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
  /** Quem está chamando ("cs:classificar"). Vai para llm_calls; sem isso, a origem da execução. */
  origem?: string;
}

/** Modelos que usam o contrato novo de parâmetros (max_completion_tokens, sem temperature livre). */
function ehGpt5(modelo: string): boolean {
  return /^(gpt-5|o[34])/.test(modelo);
}

// IMAGEM INLINE: o buscador da OpenAI leva 403 no CDN da Meta (fbcdn) — a URL assinada é servida
// só a quem ela "conhece". Baixamos aqui (o servidor consegue) e mandamos como data URL. Falha
// de download não derruba a chamada: a URL original segue, e o modelo diz que não conseguiu.
const INLINE_MAX = 6 * 1024 * 1024;
export async function imagemInline(url: string): Promise<string> {
  if (!/^https?:\/\//.test(url)) return url;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LoneOS/1.0)" } });
    if (!r.ok) return url;
    const tipo = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!tipo.startsWith("image/")) return url;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > INLINE_MAX) return url;
    return `data:${tipo};base64,${buf.toString("base64")}`;
  } catch {
    return url;
  }
}

export async function chatJson<T = unknown>(p: ChatJsonParams): Promise<OpenAiResult<T>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: "OPENAI_API_KEY não configurada" };

  const t0 = Date.now();
  const recibo = (r: OpenAiResult<T>): OpenAiResult<T> => {
    registrarChamadaLlm({ modelo: p.model, usage: r.usage, ms: Date.now() - t0, ok: r.ok, erro: r.ok ? null : r.error, origem: p.origem, tipo: p.imagens?.length ? "vision" : "chat" });
    return r;
  };

  const imagens = p.imagens?.length ? await Promise.all(p.imagens.map(imagemInline)) : [];
  let res: Response;
  try {
    res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: "system", content: p.system },
          imagens.length
            ? {
                role: "user",
                content: [
                  { type: "text", text: p.user },
                  ...imagens.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } })),
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
    return recibo({ ok: false, error: err instanceof Error ? err.message : "erro de conexão" });
  }

  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* corpo não-JSON */ }
    console.error("[OpenAI]", res.status, msg);
    return recibo({ ok: false, error: String(msg), status: res.status });
  }

  let json: { choices?: Array<{ message?: { content?: string; refusal?: string } }>; usage?: OpenAiUsage };
  try { json = JSON.parse(text); } catch { return recibo({ ok: false, error: "resposta não-JSON", raw: text, status: res.status }); }

  const choice = json.choices?.[0]?.message;
  if (choice?.refusal) return recibo({ ok: false, error: `refusal: ${choice.refusal}`, status: res.status, usage: json.usage });

  const content = choice?.content ?? "";
  try {
    return recibo({ ok: true, data: JSON.parse(content) as T, raw: content, usage: json.usage, status: res.status });
  } catch {
    return recibo({ ok: false, error: "JSON inválido na resposta estruturada", raw: content, status: res.status, usage: json.usage });
  }
}
