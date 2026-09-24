// Colunas de content_cards que a UI pode editar pelo /api/content-cards/update.
// Lista FECHADA: antes qualquer chave snake_case ia direto pro banco e camelCase desconhecida sumia
// calada com resposta de sucesso — a tela dizia "salvo" e nada tinha sido gravado.

export const CAMPOS_EDITAVEIS: Record<string, string> = {
  title: "title", briefing: "briefing", format: "format", status: "status", priority: "priority",
  imageUrl: "image_url", statusChangedAt: "status_changed_at", columnEnteredAt: "column_entered_at",
  designRequestId: "design_request_id", designerDeliveredAt: "designer_delivered_at",
  designerDeliveredBy: "designer_delivered_by", socialConfirmedAt: "social_confirmed_at",
  socialConfirmedBy: "social_confirmed_by", clientApprovedAt: "client_approved_at",
  caption: "caption", hashtags: "hashtags", observations: "observations", platform: "platform",
  dueDate: "due_date", dueTime: "due_time",
  nonDeliveryReason: "non_delivery_reason", nonDeliveryReportedBy: "non_delivery_reported_by",
  nonDeliveryReportedAt: "non_delivery_reported_at", workStartedAt: "work_started_at",
  totalTimeSpentMs: "total_time_spent_ms", publishVerifiedAt: "publish_verified_at",
  publishVerifiedBy: "publish_verified_by", blockedReason: "blocked_reason",
  blockedBy: "blocked_by", blockedAt: "blocked_at", scheduledAt: "scheduled_at",
  requestedByTraffic: "requested_by_traffic", trafficSuggestion: "traffic_suggestion",
  lastKanbanActivity: "last_kanban_activity", archivedAt: "archived_at",
  socialMedia: "social_media", clientId: "client_id", clientName: "client_name",
};

const COLUNAS = new Set(Object.values(CAMPOS_EDITAVEIS));
const SO_GESTAO = new Set(["social_media", "client_id", "client_name"]);

export interface Permissoes {
  /** admin/manager */
  gestao: boolean;
  /** quem pode arquivar/desarquivar (gestão + social — o mesmo portão do /delete) */
  podeArquivar: boolean;
}

export type ResultadoUpdate =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; status: 400 | 403; erro: string };

/** Traduz o corpo do update em colunas, recusando chave desconhecida e campo sem permissão. */
export function montarUpdate(updates: Record<string, unknown>, p: Permissoes): ResultadoUpdate {
  const row: Record<string, unknown> = {};
  const desconhecidas: string[] = [];
  for (const [chave, valor] of Object.entries(updates)) {
    if (valor === undefined) continue;
    const col = CAMPOS_EDITAVEIS[chave] ?? (COLUNAS.has(chave) ? chave : undefined);
    if (!col) { desconhecidas.push(chave); continue; }
    row[col] = valor;
  }
  if (desconhecidas.length) {
    return { ok: false, status: 400, erro: `Campo(s) não editável(is): ${desconhecidas.join(", ")}` };
  }
  const barradas = Object.keys(row).filter((c) => SO_GESTAO.has(c) && !p.gestao);
  if (barradas.length) {
    return { ok: false, status: 403, erro: "Só a gestão pode trocar o cliente ou o responsável do card." };
  }
  if ("archived_at" in row && !p.podeArquivar) {
    return { ok: false, status: 403, erro: "Sem permissão para arquivar ou desarquivar cards." };
  }
  return { ok: true, row };
}
