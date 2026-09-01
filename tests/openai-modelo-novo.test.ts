import { describe, it, expect, vi, afterEach } from "vitest";
import { chatJson } from "@/lib/ai/openai";

// O Radar chamou gpt-5.4-nano e TODA análise falhou com "Unsupported parameter: 'max_tokens' is not
// supported with this model. Use 'max_completion_tokens' instead". O helper mandava sempre o nome
// antigo — então qualquer troca de modelo quebrava, e quebrava só em produção, na primeira execução.

const corpoOk = {
  choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

function capturarCorpo() {
  const capturado: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    capturado.body = JSON.parse(String(init.body));
    return new Response(JSON.stringify(corpoOk), { status: 200 });
  }));
  return capturado;
}

describe("chatJson escolhe o parâmetro certo por modelo", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("modelo GPT-5 recebe max_completion_tokens", async () => {
    process.env.OPENAI_API_KEY ||= "teste";
    const cap = capturarCorpo();
    await chatJson({ model: "gpt-5.4-nano", schemaName: "t", schema: {}, system: "s", user: "u", maxTokens: 300 });
    expect(cap.body).toHaveProperty("max_completion_tokens", 300);
    expect(cap.body).not.toHaveProperty("max_tokens");
  });

  it("modelo antigo continua com max_tokens e temperature", async () => {
    process.env.OPENAI_API_KEY ||= "teste";
    const cap = capturarCorpo();
    await chatJson({ model: "gpt-4o-mini", schemaName: "t", schema: {}, system: "s", user: "u", maxTokens: 300, temperature: 0.5 });
    expect(cap.body).toHaveProperty("max_tokens", 300);
    expect(cap.body).toHaveProperty("temperature", 0.5);
  });

  it("o3 e o4 também usam o contrato novo", async () => {
    process.env.OPENAI_API_KEY ||= "teste";
    const cap = capturarCorpo();
    await chatJson({ model: "o4-mini", schemaName: "t", schema: {}, system: "s", user: "u" });
    expect(cap.body).toHaveProperty("max_completion_tokens");
  });
});

// O Radar analisava conteúdo visual lendo só a legenda — julgar um antes/depois pelo texto. A Meta
// entrega o arquivo de post/carrossel de terceiros e a miniatura de vídeo; o helper precisa saber
// mandar isso junto.
describe("chatJson aceita imagem", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("monta content multimodal quando há imagens", async () => {
    process.env.OPENAI_API_KEY ||= "teste";
    const cap = capturarCorpo();
    await chatJson({
      model: "gpt-5.4-nano", schemaName: "t", schema: {}, system: "s", user: "u",
      imagens: ["data:image/jpeg;base64,AAA"],
    });
    const msgs = (cap.body as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    const userMsg = msgs.find((m) => m.role === "user")!;
    expect(Array.isArray(userMsg.content)).toBe(true);
    const partes = userMsg.content as Array<Record<string, unknown>>;
    expect(partes.some((p) => p.type === "text")).toBe(true);
    expect(partes.some((p) => p.type === "image_url")).toBe(true);
  });

  it("sem imagem, o content continua string simples", async () => {
    process.env.OPENAI_API_KEY ||= "teste";
    const cap = capturarCorpo();
    await chatJson({ model: "gpt-4o-mini", schemaName: "t", schema: {}, system: "s", user: "u" });
    const msgs = (cap.body as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    expect(typeof msgs.find((m) => m.role === "user")!.content).toBe("string");
  });
});
