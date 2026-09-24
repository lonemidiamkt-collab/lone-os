// lib/defense/vigia-entrega.ts — VIGIA DE ENTREGA DA CONTA (Leva 7A, N1). Regras puras.
//
// O que já existia: o defense-scan (a cada 15 min) grava "gasto zero" em anomaly_alerts a partir das
// 11h (conta ativa sem linha de hoje na Meta) e o Hoje mostra. Três buracos:
//   1. o aviso no WhatsApp (alerta-queda) só sai às 9h30 do DIA SEGUINTE — a conta fica parada o dia todo;
//   2. o scan só alarma conta com média ≥ R$ 50/dia e 3+ dias de histórico — conta pequena parada nunca avisava;
//   3. o sino avisava todo mundo, sem chamar o gestor da conta.
// O vigia roda às 11h05: conta ATIVA na Meta, que vinha gastando (média de 3 dias > 0) e que não
// gastou nada hoje → UMA mensagem no grupo de tráfego, marcando (@ de verdade) o gestor de cada uma.
// Grava/reusa a linha de anomaly_alerts do dia (o Hoje e a Defesa mostram) e marca notified_at, então
// o alerta-queda da manhã seguinte não repete. Nasce DESLIGADO na Central de Automações.
//
// Testado em tests/vigia-entrega.test.ts.

export interface ContaParaVigiar {
  clientId: string;
  nome: string;
  gestor: string | null;
  metaAccountId: string;
  /** ad_accounts.account_status (1 = ativa). */
  status: number | null;
  /** Média dos últimos 3 dias (sync-saldos). */
  media3d: number | null;
  oculta: boolean;
  /** Alguém marcou "visto" na entrega deste cliente no Hoje (vale 24h). */
  visto: boolean;
}

/** Hora a partir da qual "sem gasto hoje" deixa de ser atraso da Meta (mesma régua do defense-scan). */
export const HORA_VIGIA_SP = 11;

/** Quem vale a leitura de hoje: ativa, visível, sem "visto", e que vinha gastando. */
export function quemVigiar(contas: ContaParaVigiar[]): ContaParaVigiar[] {
  return contas.filter((c) => c.status === 1 && !c.oculta && !c.visto && (c.media3d ?? 0) > 0);
}

/** Gasto de hoje lido na Meta: sem linha = zero (a Meta não devolve linha de dia sem entrega). */
export function gastouHoje(linha: { spend?: string | number | null } | null): number {
  if (!linha) return 0;
  const n = typeof linha.spend === "number" ? linha.spend : parseFloat(String(linha.spend ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export interface Parada {
  clientId: string;
  nome: string;
  media3d: number;
  /** "@5522999999999" quando o gestor tem número (menção de verdade), senão o primeiro nome. */
  gestorTrecho: string;
}

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** A mensagem do grupo de tráfego. Uma linha por conta, a que gastava mais primeiro. */
export function textoVigia(paradas: Parada[], hora: string): string {
  const linhas = [...paradas]
    .sort((a, b) => b.media3d - a.media3d)
    .map((p) => `• *${p.nome}* — gastava ${brl0(p.media3d)}/dia${p.gestorTrecho ? ` · ${p.gestorTrecho}` : ""}`);
  const titulo = paradas.length === 1 ? "*1 conta ativa sem gasto hoje*" : `*${paradas.length} contas ativas sem gasto hoje*`;
  return [
    `${titulo} (leitura das ${hora})`,
    "",
    ...linhas,
    "",
    "Confira no Gerenciador: pagamento, anúncio reprovado ou campanha pausada. Marque \"visto\" no Tráfego › Hoje quando for de propósito.",
  ].join("\n");
}
