// lib/traffic/renderPdf.ts — converte HTML → PDF via container browserless
// (headless chrome isolado na rede interna do compose). Sem chromium na imagem do app.

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || "http://chromium:3000";

export interface PdfResult {
  ok: boolean;
  buffer?: Buffer;
  error?: string;
}

/** Renderiza uma string HTML em PDF A4. Nunca lança — retorna { ok, error }. */
export async function htmlToPdf(html: string): Promise<PdfResult> {
  const token = process.env.BROWSERLESS_TOKEN ?? "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${BROWSERLESS_URL}/pdf?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        // espera imagens (logo) e fontes carregarem antes de imprimir
        gotoOptions: { waitUntil: "networkidle2", timeout: 30_000 },
        options: {
          format: "A4",
          printBackground: true,
          margin: { top: "0", bottom: "0", left: "0", right: "0" },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `browserless HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) {
      return { ok: false, error: `PDF suspeito (${buffer.length} bytes)` };
    }
    return { ok: true, buffer };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error
      ? (err.name === "AbortError" ? "timeout (60s) no browserless" : err.message)
      : String(err);
    return { ok: false, error: msg };
  }
}

/** Health-check simples do browserless. */
export async function checkBrowserless(): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${BROWSERLESS_URL}/`, { signal: controller.signal });
    clearTimeout(t);
    return res.ok || res.status === 404 ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
