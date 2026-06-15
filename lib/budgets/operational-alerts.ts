// lib/budgets/operational-alerts.ts — detecção de alertas operacionais por cliente.
// PURO/testável. Lê uma config por cliente (client_alert_config) e o snapshot da
// conta (vindo do sync) e devolve a lista de alertas disparados.

export type OpAlertType =
  | "verba_zerada" | "verba_baixa" | "erro_conta" | "sem_gasto" | "campanha_parada" | "meta_erro";

export interface ClientAlertConfig {
  verbaMinima: number | null;          // R$ absoluto; null = usa % global
  destino: "interno" | "cliente";
  alertVerbaBaixa: boolean;
  alertVerbaZerada: boolean;
  alertErroConta: boolean;
  alertSemGasto: boolean;
  alertCampanhaParada: boolean;
  alertMetaErro: boolean;
  semGastoDias: number;
}

export const DEFAULT_CLIENT_ALERT_CONFIG: ClientAlertConfig = {
  verbaMinima: null,
  destino: "interno",
  alertVerbaBaixa: true,
  alertVerbaZerada: true,
  alertErroConta: true,
  alertSemGasto: true,
  alertCampanhaParada: false,
  alertMetaErro: true,
  semGastoDias: 3,
};

export interface OpAlertHit {
  type: OpAlertType;
  severity: "critical" | "warning";
  reason: string;
}

export interface AccountAlertSnapshot {
  available: number | null;
  monthlyBudget: number | null;
  avgDailySpend: number | null;
  accountStatus: number;            // 1=Ativa 2=Desativada 3=Em revisão 7=Pendente 9=Grace
  syncError?: string | null;
  campaignsActive?: number | null;  // p/ campanha parada (fase 1b)
  campaignsTotal?: number | null;
}

function statusLabel(status: number): string {
  switch (status) {
    case 2: return "desativada"; case 3: return "em revisão";
    case 7: return "pendente";  case 9: return "em grace period (risco de pausa)";
    default: return `status ${status}`;
  }
}

/**
 * Detecta os alertas disparados para uma conta/cliente. Determinístico.
 * `globalWarnPct` = traffic_alert_warning_pct (fallback quando não há verba mínima).
 */
export function detectClientAlerts(
  snap: AccountAlertSnapshot,
  cfg: ClientAlertConfig,
  globalWarnPct: number,
): OpAlertHit[] {
  const hits: OpAlertHit[] = [];

  // 1) Erro de integração Meta — sync falhou, dados não confiáveis: só esse alerta.
  if (snap.syncError) {
    if (cfg.alertMetaErro) hits.push({ type: "meta_erro", severity: "warning", reason: `Falha de sync com a Meta: ${snap.syncError}` });
    return hits;
  }

  // 2) Erro de conta (cartão/cobrança/status) — conta não ativa.
  if (snap.accountStatus !== 1) {
    if (cfg.alertErroConta) {
      hits.push({
        type: "erro_conta",
        severity: snap.accountStatus === 9 ? "critical" : "warning",
        reason: `Conta ${statusLabel(snap.accountStatus)} (possível erro de cartão/cobrança)`,
      });
    }
    return hits; // conta pausada: não avalia saldo/gasto
  }

  // 3) Verba zerada / baixa (conta ativa)
  if (snap.available !== null) {
    if (cfg.alertVerbaZerada && snap.available <= 0) {
      hits.push({ type: "verba_zerada", severity: "critical", reason: "Saldo zerado" });
    } else if (cfg.alertVerbaBaixa) {
      const limite = cfg.verbaMinima ?? (snap.monthlyBudget ? (snap.monthlyBudget * globalWarnPct) / 100 : null);
      if (limite !== null && snap.available > 0 && snap.available <= limite) {
        hits.push({
          type: "verba_baixa",
          severity: "warning",
          reason: cfg.verbaMinima != null ? `Saldo ≤ R$ ${cfg.verbaMinima.toFixed(2)}` : `Saldo ≤ ${globalWarnPct}% da verba`,
        });
      }
    }
  }

  // 4) Conta sem gasto (ativa mas sem gastar)
  if (cfg.alertSemGasto && (snap.avgDailySpend === null || snap.avgDailySpend <= 0)) {
    hits.push({ type: "sem_gasto", severity: "warning", reason: `Sem gasto nos últimos ${cfg.semGastoDias} dias` });
  }

  // 5) Campanha parada (fase 1b — só se temos a contagem de campanhas)
  if (cfg.alertCampanhaParada && snap.campaignsTotal != null && snap.campaignsActive != null) {
    if (snap.campaignsTotal > 0 && snap.campaignsActive === 0) {
      hits.push({ type: "campanha_parada", severity: "warning", reason: "Nenhuma campanha ativa" });
    }
  }

  return hits;
}

const OP_LABEL: Record<OpAlertType, string> = {
  verba_zerada: "Verba zerada",
  verba_baixa: "Verba baixa",
  erro_conta: "Erro na conta (cartão/cobrança)",
  sem_gasto: "Conta sem gasto",
  campanha_parada: "Campanha parada",
  meta_erro: "Erro de integração Meta",
};

export function opAlertLabel(t: OpAlertType): string { return OP_LABEL[t]; }
