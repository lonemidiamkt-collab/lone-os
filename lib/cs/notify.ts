// lib/cs/notify.ts — envia texto a um grupo PELO número do agente (monitor[IA],
// EVOLUTION_*_NEW). Separado do lib/whatsapp/evolution.ts, que usa o número do gestor.
// NUNCA lança — um WhatsApp fora do ar não pode derrubar o webhook.

export async function csSendGroupText(jid: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return { ok: false, error: "Evolution (monitor[IA]) não configurada" };
  try {
    const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: jid, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}
