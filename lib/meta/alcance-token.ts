// lib/meta/alcance-token.ts — lê na Meta o que um token alcança (perfil, permissões, contas). Só servidor.
// Usado pela troca de token (app/api/meta/reconectar) ANTES de gravar — auditoria 9.5, 25/10/2026.
// (A conferência diária do token mora em lib/meta/conferir-token.ts.)

const GRAPH = "https://graph.facebook.com/v21.0";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

async function getJson(url: string): Promise<Resultado<Record<string, unknown>>> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
    if (!res.ok || j.error) return { ok: false, erro: j.error?.message ? `${j.error.message} (código ${j.error.code ?? res.status})` : `HTTP ${res.status}` };
    return { ok: true, valor: j };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Nome do perfil do Facebook dono do token. */
export async function perfilDoToken(token: string): Promise<Resultado<string>> {
  const r = await getJson(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) return r;
  return { ok: true, valor: String(r.valor.name ?? r.valor.id ?? "") };
}

/** Permissões concedidas (status "granted"). */
export async function escoposConcedidos(token: string): Promise<Resultado<string[]>> {
  const r = await getJson(`${GRAPH}/me/permissions?limit=100&access_token=${encodeURIComponent(token)}`);
  if (!r.ok) return r;
  const lista = (r.valor.data as { permission?: string; status?: string }[] | undefined) ?? [];
  return { ok: true, valor: lista.filter((p) => p.status === "granted" && p.permission).map((p) => p.permission as string) };
}

/** Lê as páginas de uma listagem `data` (até `max`). Falha na primeira = erro; depois, devolve o que leu. */
async function ids(url: string, max = 10): Promise<Resultado<string[]>> {
  const out: string[] = [];
  let proxima: string | null = url;
  for (let i = 0; proxima && i < max; i++) {
    const r: Resultado<Record<string, unknown>> = await getJson(proxima);
    if (!r.ok) return i === 0 ? r : { ok: true, valor: out };
    for (const d of (r.valor.data as { id?: string }[] | undefined) ?? []) if (d.id) out.push(d.id);
    proxima = ((r.valor.paging as { next?: string } | undefined)?.next) ?? null;
  }
  return { ok: true, valor: out };
}

/** As contas de anúncio que o token alcança: as do perfil e as dos Business Managers dele. */
export async function contasDoToken(token: string): Promise<Resultado<Set<string>>> {
  const t = encodeURIComponent(token);
  const pessoais = await ids(`${GRAPH}/me/adaccounts?fields=id&limit=200&access_token=${t}`);
  if (!pessoais.ok) return pessoais;
  const todas = new Set(pessoais.valor);
  const bms = await ids(`${GRAPH}/me/businesses?fields=id&limit=100&access_token=${t}`, 3);
  if (bms.ok) {
    for (const bm of bms.valor) {
      for (const borda of ["owned_ad_accounts", "client_ad_accounts"]) {
        const r = await ids(`${GRAPH}/${bm}/${borda}?fields=id&limit=200&access_token=${t}`, 5);
        if (r.ok) r.valor.forEach((id) => todas.add(id));
      }
    }
  }
  return { ok: true, valor: todas };
}
