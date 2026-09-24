// lib/portal/materiais.ts — o histórico do que o cliente mandou por "Enviar material" (N37). PURO.
//
// O cliente manda foto, logo, tabela de preço — e depois não tinha como ver o que já mandou, nem
// saber se o time recebeu, nem onde aquilo foi parar. Aqui ele vê:
//   · o arquivo, a observação que ele mesmo escreveu, quem mandou e quando;
//   · se o time já abriu ("recebido") — sem dizer QUEM do time abriu (visto_por é interno);
//   · onde foi usado, quando o time ligou o material a um post (client_uploads.card_id, migration
//     20260926120000_gestao_portal.sql). Sem ligação, não inventa: fica "ainda não usado".
//
// O caminho no storage nunca sai daqui: o arquivo vai como link assinado de 1 hora, gerado na rota.

import { situacaoNaAgenda, diaNaAgenda, type LinhaCardAgenda, type SituacaoAgenda } from "./agenda";

export interface LinhaUpload {
  id: string;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  observacao?: string | null;
  enviado_por?: string | null;
  created_at: string;
  visto_em?: string | null;
  card_id?: string | null;
  /** Colunas internas que podem vir no select — nunca saem. */
  visto_por?: string | null;
  storage_path?: string | null;
}

export type TipoMaterial = "imagem" | "video" | "pdf" | "planilha" | "arquivo";

export interface UsoMaterial {
  titulo: string;
  dia: string | null;
  /** null = o post ainda está sendo produzido (não é compromisso com o cliente ainda). */
  situacao: SituacaoAgenda | null;
  link: string | null;
}

export interface MaterialPortal {
  id: string;
  nome: string;
  tipo: TipoMaterial;
  tamanhoKb: number | null;
  observacao: string | null;
  enviadoPor: string | null;
  enviadoEm: string;
  recebido: boolean;
  recebidoEm: string | null;
  /** Link assinado (1h) para abrir o próprio arquivo. */
  url: string | null;
  uso: UsoMaterial | null;
}

export function tipoDoArquivo(mime: string | null | undefined, nome?: string | null): TipoMaterial {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("video/")) return "video";
  if (m === "application/pdf") return "pdf";
  if (/sheet|excel|csv/.test(m) || /\.(xlsx?|csv)$/i.test(nome ?? "")) return "planilha";
  return "arquivo";
}

export function montarMateriais(args: {
  uploads: readonly LinhaUpload[];
  /** Cards ligados aos materiais (id → linha). */
  cards?: ReadonlyMap<string, LinhaCardAgenda & { title?: string | null }>;
  /** Link do Instagram por media_id. */
  links?: ReadonlyMap<string, string>;
  /** Link assinado por upload id. */
  urls?: ReadonlyMap<string, string>;
}): MaterialPortal[] {
  return args.uploads.map((u) => {
    const card = u.card_id ? args.cards?.get(u.card_id) : undefined;
    // Card arquivado sem ter ido ao ar = pedido que o time descartou: não mostra como "usado".
    const situacao = card ? situacaoNaAgenda(card) : null;
    const uso: UsoMaterial | null = card && !(card.archived_at && situacao !== "no_ar")
      ? {
          titulo: (card.title ?? "").trim() || "Post",
          dia: situacao ? diaNaAgenda(card) : null,
          situacao,
          link: situacao === "no_ar" && card.ig_media_id ? args.links?.get(card.ig_media_id) ?? null : null,
        }
      : null;
    return {
      id: u.id,
      nome: (u.file_name ?? "").trim() || "arquivo",
      tipo: tipoDoArquivo(u.mime_type, u.file_name),
      tamanhoKb: typeof u.size_bytes === "number" ? Math.max(1, Math.round(u.size_bytes / 1024)) : null,
      observacao: (u.observacao ?? "").trim() || null,
      enviadoPor: (u.enviado_por ?? "").trim() || null,
      enviadoEm: u.created_at,
      recebido: !!u.visto_em,
      recebidoEm: u.visto_em ?? null,
      url: args.urls?.get(u.id) ?? null,
      uso,
    };
  });
}
