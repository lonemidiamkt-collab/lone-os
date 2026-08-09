// lib/meta/igPublicar.ts — publicar uma arte no Instagram do cliente.
//
// PUBLICAR NÃO TEM DESFAZER. Sai no perfil do cliente, com a marca dele, e apagar depois já foi
// visto por quem viu. Por isso aqui: nada roda sozinho, o disparo vem sempre de um pedido humano,
// e qualquer dúvida (proporção estranha, legenda vazia, conta errada) vira recusa em vez de post.
//
// A API da Meta publica em dois tempos:
//   1. cria um "container" apontando pra URL da imagem;
//   2. publica o container.
// Carrossel tem um passo a mais: cada imagem vira um container filho, e um container pai amarra
// todos. O limite de 10 é da Meta.

import { supabaseAdmin } from "@/lib/supabase/server";

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_CARROSSEL = 10;
/** Limites de proporção do feed do Instagram: retrato 4:5 até paisagem 1.91:1. */
const RAZAO_MIN = 0.8;
const RAZAO_MAX = 1.91;

export interface ResultadoPost {
  ok: boolean;
  postId?: string;
  permalink?: string;
  erro?: string;
}

async function token(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("agency_settings").select("key, value")
    .in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const t = map.get("meta_token");
  const exp = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!t || (exp && exp < Date.now())) return null;
  return t;
}

/** URL da nossa arte já convertida em JPEG — é o que a Meta consegue baixar. */
export function urlJpeg(base: string, urlDaArte: string): string {
  return `${base.replace(/\/+$/, "")}/api/meta/instagram/jpeg?src=${encodeURIComponent(urlDaArte)}`;
}

async function graph(url: string, body: Record<string, string>): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => { throw new Error(`rede: ${e?.message ?? e}`); });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || j?.error) return { ok: false, erro: j?.error?.message ?? `HTTP ${resp.status}` };
  return { ok: true, id: j.id as string };
}

/** Confere proporção antes de mandar. Recorte silencioso na arte do cliente não é opção. */
export async function conferirProporcao(jpegUrl: string): Promise<{ ok: boolean; razao?: number; erro?: string }> {
  const r = await fetch(jpegUrl, { signal: AbortSignal.timeout(45_000) }).catch(() => null);
  if (!r?.ok) return { ok: false, erro: `não consegui baixar a arte convertida (${r?.status ?? "sem resposta"})` };
  const buf = Buffer.from(await r.arrayBuffer());
  const sharp = (await import("sharp")).default;
  const { width, height } = await sharp(buf).metadata();
  if (!width || !height) return { ok: false, erro: "não li as dimensões da arte" };
  const razao = width / height;
  if (razao < RAZAO_MIN || razao > RAZAO_MAX) {
    return { ok: false, razao, erro: `proporção ${width}x${height} (${razao.toFixed(2)}) fora do que o feed aceita (0.80 a 1.91)` };
  }
  return { ok: true, razao };
}

/**
 * Publica no Instagram do cliente.
 *
 * @param igUserId  ig_business_account_id do cliente
 * @param jpegUrls  URLs JPEG públicas, na ordem. Uma = post simples; duas ou mais = carrossel.
 * @param legenda   texto do post
 */
export async function publicarNoInstagram(
  igUserId: string,
  jpegUrls: string[],
  legenda: string,
): Promise<ResultadoPost> {
  const t = await token();
  if (!t) return { ok: false, erro: "token da Meta ausente ou vencido" };
  if (!jpegUrls.length) return { ok: false, erro: "nenhuma arte" };
  if (jpegUrls.length > MAX_CARROSSEL) {
    return { ok: false, erro: `carrossel aceita no máximo ${MAX_CARROSSEL} imagens (vieram ${jpegUrls.length})` };
  }

  let containerId: string;

  if (jpegUrls.length === 1) {
    const c = await graph(`${GRAPH}/${igUserId}/media`, {
      image_url: jpegUrls[0], caption: legenda, access_token: t,
    });
    if (!c.ok || !c.id) return { ok: false, erro: `container: ${c.erro}` };
    containerId = c.id;
  } else {
    const filhos: string[] = [];
    for (const u of jpegUrls) {
      const f = await graph(`${GRAPH}/${igUserId}/media`, {
        image_url: u, is_carousel_item: "true", access_token: t,
      });
      if (!f.ok || !f.id) return { ok: false, erro: `imagem do carrossel: ${f.erro}` };
      filhos.push(f.id);
    }
    const pai = await graph(`${GRAPH}/${igUserId}/media`, {
      media_type: "CAROUSEL", children: filhos.join(","), caption: legenda, access_token: t,
    });
    if (!pai.ok || !pai.id) return { ok: false, erro: `carrossel: ${pai.erro}` };
    containerId = pai.id;
  }

  // A Meta processa o container em background. Publicar cedo demais devolve erro de "não pronto".
  await esperarPronto(containerId, t);

  const pub = await graph(`${GRAPH}/${igUserId}/media_publish`, {
    creation_id: containerId, access_token: t,
  });
  if (!pub.ok || !pub.id) return { ok: false, erro: `publicação: ${pub.erro}` };

  const permalink = await fetch(`${GRAPH}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(t)}`)
    .then((r) => r.json()).then((j) => j?.permalink as string | undefined).catch(() => undefined);

  return { ok: true, postId: pub.id, permalink };
}

/** Espera o container ficar FINISHED. Até ~40s; depois disso segue e deixa a publicação falhar com erro claro. */
async function esperarPronto(containerId: string, t: string) {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const j = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(t)}`)
      .then((r) => r.json()).catch(() => null);
    if (j?.status_code === "FINISHED") return;
    if (j?.status_code === "ERROR") return;
  }
}
