// lib/traffic/imagem-variacao.ts — NÚCLEO da geração de variação de imagem com elementos travados.
// Usado pelo designer (na demanda) e pelo gestor de tráfego (prévia na hipótese, antes de mandar).
// gpt-image-1 (images/edits): a referência entra como imagem; o prompt trava o que não muda.

import { registrarChamadaLlm } from "@/lib/obs/llm";

export interface PedidoImagem { referencia: Buffer; mantem: string; muda: string; n?: number; origem: string }

export function promptTravado(mantem: string, muda: string): string {
  return [
    `Crie uma VARIAÇÃO deste anúncio de loja local para teste A/B.`,
    `MANTER EXATAMENTE (elementos travados): ${mantem || "todos os textos, preço, produto, logo, hierarquia e chamada para ação"}.`,
    `ALTERAR APENAS: ${muda || "o cenário/fundo"}.`,
    `Não invente textos novos, não mude preços, não remova a logo, não troque o produto. Mesmo formato vertical de anúncio, mesma legibilidade. Estilo de peça publicitária brasileira de comércio local.`,
  ].join("\n");
}

export async function gerarVariacoesImagem(p: PedidoImagem): Promise<{ ok: true; imagens: Buffer[]; prompt: string } | { ok: false; erro: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, erro: "OPENAI_API_KEY ausente" };
  const prompt = promptTravado(p.mantem, p.muda);
  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("image", new Blob([new Uint8Array(p.referencia)], { type: "image/png" }), "referencia.png");
  fd.append("prompt", prompt);
  fd.append("n", String(Math.min(3, Math.max(1, p.n ?? 2))));
  fd.append("size", "1024x1536");
  fd.append("quality", "medium");
  const t0 = Date.now();
  try {
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(170_000) });
    const json = await r.json().catch(() => null) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null;
    registrarChamadaLlm({ modelo: "gpt-image-1", ms: Date.now() - t0, ok: r.ok, erro: r.ok ? null : json?.error?.message ?? `HTTP ${r.status}`, origem: p.origem, tipo: "image" });
    if (!r.ok || !json?.data?.length) return { ok: false, erro: `OpenAI: ${json?.error?.message ?? `HTTP ${r.status}`}` };
    return { ok: true, imagens: json.data.filter((d) => d.b64_json).map((d) => Buffer.from(d.b64_json as string, "base64")), prompt };
  } catch (err) {
    registrarChamadaLlm({ modelo: "gpt-image-1", ms: Date.now() - t0, ok: false, erro: err instanceof Error ? err.message : "erro", origem: p.origem, tipo: "image" });
    return { ok: false, erro: err instanceof Error ? err.message : "erro de conexão" };
  }
}

export async function flagImagemLigada(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "ia_imagem").maybeSingle();
  return data?.value === "on";
}
