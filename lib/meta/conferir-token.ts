// lib/meta/conferir-token.ts — a conferência diária do token da Meta (24/10/2026, auditoria 5.14).
//
// Antes a rotina só olhava a DATA de validade gravada: token vencido, revogado ou sem data respondia `ok: true`
// ("Token OK", "Token sem data de expiração registrada"), e a Central mostrava verde com a sincronização parada.
// Agora ela pergunta à própria Graph API se o token funciona e decide aqui (puro, testado): `ok` só com o token
// funcionando; vencido, recusado pela Meta ou não conferido = `ok: false` com o motivo.

const GRAPH = "https://graph.facebook.com/v21.0";

export type RespostaGraph =
  | { tipo: "valido" }
  | { tipo: "invalido"; motivo: string }      // a Meta recusou o token (código 190 e afins)
  | { tipo: "sem_resposta"; motivo: string }; // rede, timeout, Meta fora: não deu para conferir

/** Uma chamada real e barata à Graph: GET /me com o token. */
export async function perguntarAGraph(token: string, fetcher: typeof fetch = fetch): Promise<RespostaGraph> {
  try {
    const res = await fetcher(`${GRAPH}/me?fields=id&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) });
    const corpo = await res.json().catch(() => null) as { id?: string; error?: { message?: string; code?: number; error_subcode?: number } } | null;
    if (res.ok && corpo?.id) return { tipo: "valido" };
    const e = corpo?.error;
    // 190 = token inválido/vencido/revogado; 102 = sessão; 10/200 = permissão retirada. Outros 4xx/5xx = não conferi.
    const codigo = e?.code ?? 0;
    if (e && (codigo === 190 || codigo === 102 || codigo === 10 || (codigo >= 200 && codigo < 300))) {
      return { tipo: "invalido", motivo: `${e.message ?? "token recusado"} (código ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` };
    }
    return { tipo: "sem_resposta", motivo: e?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { tipo: "sem_resposta", motivo: err instanceof Error ? err.message : "sem conexão" };
  }
}

export interface AvaliacaoToken {
  ok: boolean;
  /** Dias até vencer pela data gravada (null = sem data). Negativo = venceu. */
  dias: number | null;
  /** Grava meta_token_critical=true (o banner vermelho do painel). */
  critico: boolean;
  /** Avisar no sino/e-mail hoje. */
  avisar: boolean;
  prioridade: "high" | "urgent" | null;
  /** Título do aviso (sino/e-mail) e o motivo da resposta. */
  titulo: string;
  motivo: string;
}

/** A decisão, sem banco e sem rede. `expiraEmMs` = meta_token_expires_at gravado (ms) ou null. */
export function avaliarToken(p: { temToken: boolean; expiraEmMs: number | null; graph: RespostaGraph | null; agoraMs: number }): AvaliacaoToken {
  if (!p.temToken) {
    return { ok: false, dias: null, critico: true, avisar: true, prioridade: "urgent", titulo: "Token Meta não configurado", motivo: "Token Meta não configurado" };
  }
  const dias = p.expiraEmMs != null && Number.isFinite(p.expiraEmMs) ? Math.floor((p.expiraEmMs - p.agoraMs) / 86_400_000) : null;
  if (p.graph?.tipo === "invalido") {
    return { ok: false, dias, critico: true, avisar: true, prioridade: "urgent", titulo: "Token Meta recusado pela Meta", motivo: `A Meta recusou o token: ${p.graph.motivo}` };
  }
  if (dias != null && dias < 0) {
    return { ok: false, dias, critico: true, avisar: true, prioridade: "urgent", titulo: "Token Meta expirado", motivo: `O token venceu há ${-dias} dia${dias === -1 ? "" : "s"}.` };
  }
  if (!p.graph || p.graph.tipo === "sem_resposta") {
    // Não conferiu ≠ funciona. Não liga o banner vermelho (o token pode estar bom), mas a rotina falha e diz por quê.
    const venceLogo = dias != null && dias <= 14;
    return {
      ok: false, dias, critico: dias != null && dias <= 1, avisar: venceLogo, prioridade: venceLogo ? (dias! <= 7 ? "urgent" : "high") : null,
      titulo: dias != null && venceLogo ? `Token Meta ${rotuloDias(dias)}` : "Token Meta não conferido",
      motivo: `Não consegui conferir o token com a Meta (${p.graph?.motivo ?? "sem resposta"}).`,
    };
  }
  // A Meta aceitou o token.
  if (dias == null || dias > 14) {
    return { ok: true, dias, critico: false, avisar: false, prioridade: null, titulo: "Token Meta OK", motivo: dias == null ? "A Meta aceitou o token (sem data de validade registrada)." : "A Meta aceitou o token." };
  }
  return {
    ok: true, dias, critico: dias <= 1, avisar: true, prioridade: dias <= 7 ? "urgent" : "high",
    titulo: `Token Meta ${rotuloDias(dias)}`, motivo: `A Meta aceitou o token, mas ele ${rotuloDias(dias)}.`,
  };
}

function rotuloDias(dias: number): string {
  if (dias < 0) return "expirado";
  if (dias === 0) return "expira hoje";
  return `expira em ${dias} dia${dias === 1 ? "" : "s"}`;
}
