// lib/cs/notify.ts — envia texto a um grupo PELO número do agente (monitor[IA],
// EVOLUTION_*_NEW). Separado do lib/whatsapp/evolution.ts, que usa o número do gestor.
// NUNCA lança — um WhatsApp fora do ar não pode derrubar o webhook.

export async function csSendGroupText(
  jid: string,
  text: string,
  quotedMsgId?: string, // se vier: a msg é um REPLY àquela mensagem (threading por demanda)
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return { ok: false, error: "Evolution (monitor[IA]) não configurada" };
  try {
    const payload: Record<string, unknown> = { number: jid, text };
    if (quotedMsgId) payload.quoted = { key: { id: quotedMsgId } };
    const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 120)}` };
    // Devolve o id da msg enviada (pra casar o "reply" da equipe com a sugestão). Formato: { key: { id } }.
    let id: string | undefined;
    try { id = (JSON.parse(body) as { key?: { id?: string } })?.key?.id; } catch { /* resposta sem JSON */ }
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}
