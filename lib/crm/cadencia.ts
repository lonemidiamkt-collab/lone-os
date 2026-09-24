// lib/crm/cadencia.ts — CADÊNCIA DE FOLLOW-UP DO LEAD (Leva 7C, N28). Módulo PURO.
//
// Lead que não ouve de volta em 2 dias esfria; o comercial lembrava de voltar "quando dava". A regra
// agora é fixa e visível no card: depois do primeiro contato (o dia zero), um toque no DIA 2, outro no
// DIA 5 e o último no DIA 12. Toque = ligação, WhatsApp, e-mail ou reunião registrados no histórico
// do lead (abrir o WhatsApp pelo card já registra). Três toques feitos, a cadência acaba — daí em
// diante vale o "próximo contato" que a pessoa marcar à mão.

export const CADENCIA = [2, 5, 12] as const;
/**
 * A cadência é um sprint de três semanas: passou uma semana do último toque previsto (dia 12 + 7),
 * ela acabou. Lead antigo sem histórico não vira "toque do dia 2 atrasado 90 dias" — ele é lead
 * parado, e isso o "Leads parados" já mostra.
 */
export const FIM_DA_CADENCIA = CADENCIA[CADENCIA.length - 1] + 7;
export const TIPOS_TOQUE = new Set(["ligacao", "whatsapp", "email", "reuniao"]);
const ABERTOS = new Set(["lead", "orcamento", "proposta", "reuniao"]);

export interface ProximoToque {
  /** Dia da cadência (2, 5 ou 12). */
  dia: number;
  /** YYYY-MM-DD. */
  data: string;
  /** Quantos dos três toques já foram feitos. */
  feitos: number;
  situacao: "futuro" | "hoje" | "atrasado";
  diasAtraso: number;
}

const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const somaDias = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * O próximo toque do lead, ou null (fechado, ou cadência concluída).
 * @param inicio dia zero (cadencia_inicio ou a data de criação — ISO ou YYYY-MM-DD)
 * @param toques datas (ISO) das atividades de contato do lead
 */
export function proximoToque(p: { estagio: string; inicio: string; toques: string[]; hoje: string }): ProximoToque | null {
  if (!ABERTOS.has(p.estagio)) return null;
  const dia0 = /^\d{4}-\d{2}-\d{2}$/.test(p.inicio) ? p.inicio : diaSP(p.inicio);
  if (diff(dia0, p.hoje) > FIM_DA_CADENCIA) return null;
  // Um toque por dia conta uma vez; o do próprio dia zero é o primeiro contato, não follow-up.
  const dias = new Set(p.toques.filter((t) => Number.isFinite(new Date(t).getTime())).map(diaSP).filter((d) => d > dia0));
  const feitos = Math.min(dias.size, CADENCIA.length);
  if (feitos >= CADENCIA.length) return null;
  const dia = CADENCIA[feitos];
  const data = somaDias(dia0, dia);
  const atraso = diff(data, p.hoje);
  return { dia, data, feitos, situacao: atraso > 0 ? "atrasado" : atraso === 0 ? "hoje" : "futuro", diasAtraso: Math.max(0, atraso) };
}

/** Rótulo curto para o card: "Toque do dia 5 · 26/09", "Toque do dia 2 hoje", "Toque do dia 2 atrasado 3d". */
export function rotuloToque(t: ProximoToque): string {
  const ddmm = `${t.data.slice(8, 10)}/${t.data.slice(5, 7)}`;
  if (t.situacao === "hoje") return `Toque do dia ${t.dia} hoje`;
  if (t.situacao === "atrasado") return `Toque do dia ${t.dia} atrasado ${t.diasAtraso}d`;
  return `Toque do dia ${t.dia} · ${ddmm}`;
}
