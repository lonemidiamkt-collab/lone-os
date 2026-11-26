// lib/storage/link-da-previa.ts — link para abrir um PDF de prévia guardado no bucket `reports`.
//
// POR QUE (Fase 0, leva 0C, 25/11/2026). As prévias do relatório semanal, do relatório do time e do
// calendário mensal devolviam `getPublicUrl`. O bucket `reports` é privado (migration 073; conferido em
// produção em 25/11: public = false) — então o link devolvido dava HTTP 400 e a prévia nunca abria. E se
// alguém tornasse o bucket público "para consertar", o PDF de cada cliente ficaria baixável por um
// endereço adivinhável (preview/<cliente>-<data>.pdf). Agora: link assinado, que vence.
//
// Leitura confere `.error`: sem link, a rota diz que não conseguiu, em vez de devolver url nula com ok.
// Testado em tests/link-da-previa.test.ts.

/** 7 dias: dá para mandar a prévia a quem revisa e abrir na semana. Depois disso, gere de novo. */
export const VALIDADE_DA_PREVIA_S = 60 * 60 * 24 * 7;

interface StorageComLink {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, segundos: number): PromiseLike<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
}

export type LinkDaPrevia = { ok: true; url: string; venceEm: string } | { ok: false; erro: string };

export async function linkDaPrevia(sb: StorageComLink, bucket: string, path: string, agora = new Date()): Promise<LinkDaPrevia> {
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, VALIDADE_DA_PREVIA_S);
    if (error || !data?.signedUrl) return { ok: false, erro: `Storage (link da prévia): ${error?.message ?? "sem link"}` };
    return { ok: true, url: data.signedUrl, venceEm: new Date(agora.getTime() + VALIDADE_DA_PREVIA_S * 1000).toISOString() };
  } catch (e) {
    return { ok: false, erro: `Storage (link da prévia): ${(e as Error).message}` };
  }
}
