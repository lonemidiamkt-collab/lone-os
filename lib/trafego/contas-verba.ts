// lib/trafego/contas-verba.ts — regras puras da tela Tráfego › Contas & Verba (Leva 4).
//
// Saldo, limite e RITMO DO MÊS na mesma linha. O ritmo vivia na aba "Investimento" (que saiu), com a
// verba lida do localStorage de quem abria a tela; agora vem de ad_accounts.monthly_budget (a mesma
// verba que o alerta do servidor usa) e do gasto do mês sincronizado (current_month_spend).
//
// Testado em tests/trafego-contas-verba.test.ts.

import { statusPacing, diasEntre, type StatusPacing } from "@/components/traffic/investimento";

export interface RitmoMes {
  /** "sem_verba" = conta sem verba mensal definida (não dá pra medir ritmo). */
  status: StatusPacing | "sem_verba";
  verba: number | null;
  gasto: number | null;
  /** Gasto / verba, 0–100 (para a barra). null sem verba ou sem gasto conhecido. */
  pctGasto: number | null;
  /** Onde "hoje" cai no mês, 0–100 (o marcador da barra). */
  pctMes: number;
  dia: number;
  diasNoMes: number;
  /** Quanto já devia ter saído no ritmo linear. */
  esperado: number | null;
  /** Média diária real no mês. */
  mediaDia: number | null;
  /** Verba ÷ dias do mês. */
  diaIdeal: number | null;
  /** Dia em que a verba acaba no ritmo atual (pode passar do fim do mês). */
  fimProjetado: number | null;
}

/** Dia e tamanho do mês de uma data de calendário "YYYY-MM-DD" (São Paulo — quem chama passa todaySP()). */
export function diaDoMes(hoje: string): { dia: number; diasNoMes: number } {
  const [y, m, d] = hoje.split("-").map(Number);
  return { dia: d, diasNoMes: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

export function ritmoDoMes(p: { verba: number | null | undefined; gasto: number | null | undefined; hoje: string }): RitmoMes {
  const { dia, diasNoMes } = diaDoMes(p.hoje);
  const pctMes = Math.min(100, (dia / diasNoMes) * 100);
  const verba = p.verba != null && p.verba > 0 ? p.verba : null;
  const gasto = p.gasto ?? null;
  if (verba === null) {
    return { status: "sem_verba", verba: null, gasto, pctGasto: null, pctMes, dia, diasNoMes, esperado: null, mediaDia: gasto != null && dia > 0 ? gasto / dia : null, diaIdeal: null, fimProjetado: null };
  }
  const status = statusPacing({ verba, gasto, dia, diasNoMes });
  const mediaDia = gasto != null && dia > 0 ? gasto / dia : null;
  const restante = gasto != null ? Math.max(0, verba - gasto) : null;
  return {
    status,
    verba,
    gasto,
    pctGasto: gasto != null ? Math.min(100, (gasto / verba) * 100) : null,
    pctMes,
    dia,
    diasNoMes,
    esperado: verba * (dia / diasNoMes),
    mediaDia,
    diaIdeal: verba / diasNoMes,
    fimProjetado: mediaDia && mediaDia > 0 && restante != null ? dia + Math.floor(restante / mediaDia) : null,
  };
}

export type AvisoAporte = { tipo: "vencido" | "hoje" | "proximo" | "boleto_80"; texto: string } | null;

/** Aviso de pagamento da conta: aporte vencido/próximo (Pix/Boleto) ou boleto com 80% da verba usada. */
export function avisoAporte(p: { forma: string | null | undefined; proximo: string | null | undefined; hoje: string; pctGasto: number | null }): AvisoAporte {
  const precisaAporte = p.forma === "pix" || p.forma === "boleto";
  if (precisaAporte && p.proximo) {
    const d = diasEntre(p.hoje, p.proximo);
    if (d !== null && d < 0) return { tipo: "vencido", texto: `Aporte vencido há ${-d} dia${d === -1 ? "" : "s"}` };
    if (d === 0) return { tipo: "hoje", texto: "Aporte hoje" };
    if (d !== null && d <= 3) return { tipo: "proximo", texto: `Aporte em ${d} dia${d === 1 ? "" : "s"}` };
  }
  if (p.forma === "boleto" && p.pctGasto != null && p.pctGasto >= 80) {
    return { tipo: "boleto_80", texto: "Gerar novo boleto — 80% da verba usada" };
  }
  return null;
}

// ─── Sync atrasado ──────────────────────────────────────────────────────────
// O sync-saldos roda de 2 em 2 horas das 8h às 20h de São Paulo (ops/crontab-producao.txt:
// `0 11-23/2 * * *` em UTC). De dia, leitura com mais de 3h é sinal de que parou; de noite, a
// última esperada é a das 20h — cobrar "3h" às 7h da manhã acenderia o aviso todo dia.

function horaSP(ms: number): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms));
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return h + m / 60;
}

export function syncAtrasado(ultimoIso: string | null | undefined, agora: number): boolean {
  if (!ultimoIso) return false;
  const t = Date.parse(ultimoIso);
  if (Number.isNaN(t)) return false;
  const idadeH = (agora - t) / 3_600_000;
  const h = horaSP(agora);
  // Das 9h às 22h: janela de 2h + 1h de folga. Fora disso (inclui a 1ª hora, enquanto a leitura das
  // 8h roda): horas desde a última das 20h + 1h de folga.
  const permitido = h >= 9 && h < 22 ? 3 : (h >= 22 ? h - 20 : h + 4) + 1;
  return idadeH > Math.max(3, permitido);
}

// ─── Migração do que ficou no navegador ─────────────────────────────────────
// O antigo Controle de Investimento guardava a "Data do próximo aporte" SÓ no localStorage
// (chave lone_investmentData, por cliente). Quem abre Contas & Verba com essa chave empurra para o
// servidor as datas que ainda valem e que o servidor não tem.

export const CHAVE_LOCAL_INVESTIMENTO = "lone_investmentData";

export interface ContaParaMigrar {
  id: string;          // ad_accounts.id
  clientId: string;
  proximoAporte: string | null; // o que o servidor já tem
}

export function aportesParaMigrar(
  bruto: string | null,
  contas: ContaParaMigrar[],
  hoje: string,
): { adAccountId: string; clientId: string; data: string }[] {
  if (!bruto) return [];
  let local: unknown;
  try { local = JSON.parse(bruto); } catch { return []; }
  if (!local || typeof local !== "object") return [];
  const out: { adAccountId: string; clientId: string; data: string }[] = [];
  const vistos = new Set<string>();
  for (const conta of contas) {
    if (vistos.has(conta.clientId) || conta.proximoAporte) continue;
    const reg = (local as Record<string, { nextPaymentDate?: unknown }>)[conta.clientId];
    const data = typeof reg?.nextPaymentDate === "string" ? reg.nextPaymentDate : null;
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || data < hoje) continue;
    vistos.add(conta.clientId);
    out.push({ adAccountId: conta.id, clientId: conta.clientId, data });
  }
  return out;
}
