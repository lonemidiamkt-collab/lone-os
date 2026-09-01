// lib/cs/notify.ts — envia texto a um grupo PELO número do agente (monitor[IA],
// EVOLUTION_*_NEW). Separado do lib/whatsapp/evolution.ts, que usa o número do gestor.
// NUNCA lança — um WhatsApp fora do ar não pode derrubar o webhook.

/** De onde saiu a mensagem — vira `origem` no cs_outbound. Opcional pra não quebrar quem já chama. */
export interface CsSendMeta {
  origem?: string;
  destino?: "interno" | "cliente" | "setor";
  clientId?: string | null;
  /** O que esta mensagem AFIRMA (chaves de lib/cs/porta-voz.ts). Declarar liga o "já falei isso
   *  hoje": o bom-dia cita os esfriando e o cron de esfriando repetia os mesmos clientes 1h30
   *  depois. Sem fato declarado a mensagem sai normal — o portão nunca cala no escuro. */
  fatos?: string[];
}

export async function csSendGroupText(
  jid: string,
  text: string,
  quotedMsgId?: string, // se vier: a msg é um REPLY àquela mensagem (threading por demanda)
  meta?: CsSendMeta,
  /**
   * JIDs a MENCIONAR de verdade (ex: "5522999999999@s.whatsapp.net").
   *
   * Sem isto, escrever "@Fulano" no texto é só texto: o WhatsApp não notifica ninguém, e a pessoa
   * só vê se estiver lendo o grupo — que é justamente o que a menção existiria para evitar.
   */
  mencionados?: string[],
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return { ok: false, error: "Evolution (monitor[IA]) não configurada" };

  // PORTÃO: repetir o que já foi dito hoje é pior que não falar — o time aprende a ignorar o
  // grupo e perde junto o aviso que importava. Só avalia mensagem interna COM fatos declarados.
  if (meta?.fatos?.length) {
    const { avaliarFala } = await import("./porta-voz");
    const v = await avaliarFala(meta.fatos, meta.destino ?? "interno");
    if (!v.pode) {
      console.log(`[porta-voz] calei ${meta.origem ?? "?"}: ${v.motivo}`);
      await registrarSaida(jid, text, false, `porta-voz: ${v.motivo}`, meta);
      return { ok: true, error: v.motivo };
    }
  }

  try {
    const payload: Record<string, unknown> = { number: jid, text };
    if (quotedMsgId) payload.quoted = { key: { id: quotedMsgId } };
    if (mencionados?.length) payload.mentioned = mencionados;
    const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      const erro = `HTTP ${res.status}: ${body.slice(0, 120)}`;
      await registrarSaida(jid, text, false, erro, meta);
      return { ok: false, error: erro };
    }
    // Devolve o id da msg enviada (pra casar o "reply" da equipe com a sugestão). Formato: { key: { id } }.
    let id: string | undefined;
    try { id = (JSON.parse(body) as { key?: { id?: string } })?.key?.id; } catch { /* resposta sem JSON */ }
    await registrarSaida(jid, text, true, null, meta);
    return { ok: true, id };
  } catch (err) {
    const erro = err instanceof Error ? err.message : "erro de conexão";
    await registrarSaida(jid, text, false, erro, meta);
    return { ok: false, error: erro };
  }
}

/** Assinatura estável do conteúdo: ignora emoji, pontuação, número e caixa — o que sobra é o
 *  ASSUNTO. Serve pra "isso eu já falei hoje" sem depender do texto sair igualzinho. */
export function assinaturaMensagem(texto: string): string {
  return (texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter((w) => w.length > 3)
    .slice(0, 24).join(" ");
}

/** Grava o que saiu. Best-effort ABSOLUTO: registro nunca pode derrubar um envio que deu certo. */
async function registrarSaida(
  jid: string, texto: string, enviado: boolean, erro: string | null, meta?: CsSendMeta,
): Promise<void> {
  try {
    // import dinâmico: notify.ts é usado em caminhos que não querem carregar o client do Supabase.
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    await supabaseAdmin.from("cs_outbound").insert({
      origem: meta?.origem ?? "desconhecida",
      group_jid: jid,
      destino: meta?.destino ?? "interno",
      client_id: meta?.clientId ?? null,
      texto: texto.slice(0, 8000),
      assinatura: assinaturaMensagem(texto),
      fatos: meta?.fatos?.length ? meta.fatos : null,
      enviado, erro,
      dia: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
    });
  } catch { /* registro é secundário — some em silêncio, nunca atrapalha */ }
}

/** Baixa a mídia (ex: nota de voz) de uma mensagem via Evolution (monitor[IA]) → base64. */
export async function csFetchMediaBase64(
  rawData: { key?: unknown; message?: unknown },
): Promise<{ base64?: string; mimetype?: string; error?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return { error: "Evolution (monitor[IA]) não configurada" };
  try {
    const res = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      // Manda a mensagem completa (key+message) — forma mais compatível entre versões da Evolution.
      body: JSON.stringify({ message: { key: rawData.key, message: rawData.message }, convertToMp4: false }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { error: `HTTP ${res.status}: ${body.slice(0, 160)}` };
    const j = JSON.parse(body) as { base64?: string; mimetype?: string };
    return { base64: j.base64, mimetype: j.mimetype };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "erro de conexão" };
  }
}

/** Envia um documento (ex: PDF de roteiro) a um grupo pelo número do agente (monitor[IA]). */
export async function csSendGroupDocument(
  jid: string,
  base64: string,
  fileName: string,
  caption?: string,
  mimetype = "application/pdf",
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return { ok: false, error: "Evolution (monitor[IA]) não configurada" };
  if (!base64) return { ok: false, error: "documento vazio" };
  try {
    const res = await fetch(`${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        number: jid, mediatype: "document", mimetype, media: base64, fileName,
        ...(caption ? { caption } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 150)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}

/** Envia uma IMAGEM (arte) a um grupo pelo número do CS (monitor[IA]). `media` = URL pública
 *  (bucket `arts` é público → a Evolution baixa direto) ou base64. Pro envio de artes pro cliente. */
export async function csSendGroupImage(
  jid: string,
  media: string,
  caption?: string,
  fileName = "arte.png",
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return { ok: false, error: "Evolution (monitor[IA]) não configurada" };
  if (!media) return { ok: false, error: "imagem vazia" };
  try {
    const res = await fetch(`${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        number: jid, mediatype: "image", mimetype: "image/png", media, fileName,
        ...(caption ? { caption } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 150)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}

const normNm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Acha o JID de um grupo do monitor[IA] pelo NOME (melhor match). Pro onboarding. */
export async function csFindGroupByName(name: string): Promise<{ jid?: string; subject?: string; error?: string }> {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY_NEW;
  const instance = process.env.EVOLUTION_INSTANCE_NEW;
  if (!baseUrl || !apiKey || !instance) return { error: "Evolution (monitor[IA]) não configurada" };
  try {
    const res = await fetch(`${baseUrl}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`, {
      headers: { apikey: apiKey }, signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const groups = (await res.json()) as Array<{ id?: string; subject?: string }>;
    const t = normNm(name);
    if (!t) return {};
    let best: { jid: string; subject: string; score: number } | null = null;
    for (const g of groups) {
      if (!g.id) continue;
      const ns = normNm(g.subject || "");
      let score = 0;
      if (ns && (ns.includes(t) || t.includes(ns))) score = Math.min(ns.length, t.length) + 50;
      else { const words = t.split(/\s+/).filter((w) => w.length >= 3); score = words.filter((w) => ns.includes(w)).length; }
      if (score > 0 && (!best || score > best.score)) best = { jid: g.id, subject: g.subject || "", score };
    }
    return best ? { jid: best.jid, subject: best.subject } : {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "erro de conexão" };
  }
}
