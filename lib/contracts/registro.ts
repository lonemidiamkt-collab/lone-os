// lib/contracts/registro.ts — o que a rota de contrato aceita gravar. Módulo PURO.
//
// O PROBLEMA (auditoria de erro recuperável, 21/10/2026, item 3.6): a aba Contratos gravava direto
// no banco pelo navegador e ignorava o erro — a tela fechava como salvo com o contrato não gravado.
// A versão era "quantos contratos a lista mostrou + 1": quando a lista falhava ao carregar, aparecia
// "nenhum contrato" e o próximo saía como V1 de novo. E o adendo apagava o texto digitado mesmo
// quando não tinha sido gravado.
//
// Agora a gravação mora em /api/contracts/gerar e /api/contracts/adendo; a versão sai do banco
// (maior versão + 1), nunca da lista da tela. Aqui fica a validação, sem banco, para dar para testar.

export const SERVICOS_CONTRATO = ["assessoria_trafego", "assessoria_social", "lone_growth", "trafego_social_site"] as const;
export type ServicoContrato = (typeof SERVICOS_CONTRATO)[number];

export const TIPOS_ADENDO = ["valor", "servico", "prazo", "outro"] as const;
export type TipoAdendo = (typeof TIPOS_ADENDO)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Data final = início + N meses, em UTC (o mesmo cálculo de /api/contracts/upload-legacy).
 * A tela usa ESTA função no PDF e na prévia, e a rota usa ela no registro — antes a tela somava no
 * fuso do navegador e o servidor podia gravar um dia diferente do que estava no PDF.
 */
export function somarMesesIso(isoDate: string, meses: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/** Próxima versão a partir da MAIOR já gravada (null = nenhum contrato ainda). */
export function proximaVersao(maiorVersao: number | null | undefined): number {
  const n = Number(maiorVersao);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) + 1 : 1;
}

export interface NovoContrato {
  clientId: string;
  serviceType: ServicoContrato;
  monthlyValue: number;
  startDate: string;
  endDate: string;
  durationMonths: number;
  paymentDay: number;
  previousContractId: string | null;
  hasRenewal: boolean;
  renewalValue: number | null;
}

export type Validado<T> = { ok: true; dados: T } | { ok: false; erro: string };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const numero = (v: unknown) => {
  const s = texto(v);
  if (!s) return NaN;
  return Number(s);
};
const booleano = (v: unknown) => v === true || v === "true" || v === "1" || v === "on";

/** Campos do formulário (FormData ou JSON) → contrato pronto para gravar, ou a frase do que falta. */
export function validarNovoContrato(entrada: Record<string, unknown>): Validado<NovoContrato> {
  const clientId = texto(entrada.clientId);
  if (!UUID.test(clientId)) return { ok: false, erro: "Cliente inválido." };

  const serviceType = texto(entrada.serviceType) as ServicoContrato;
  if (!SERVICOS_CONTRATO.includes(serviceType)) return { ok: false, erro: "Escolha o serviço do contrato." };

  const monthlyValue = numero(entrada.monthlyValue);
  if (!Number.isFinite(monthlyValue) || monthlyValue <= 0) return { ok: false, erro: "Informe o valor mensal (maior que zero)." };

  const startDate = texto(entrada.startDate);
  if (!DATA.test(startDate) || Number.isNaN(new Date(`${startDate}T00:00:00Z`).getTime())) {
    return { ok: false, erro: "Data de início inválida." };
  }

  const durationMonths = numero(entrada.durationMonths);
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 36) {
    return { ok: false, erro: "A duração precisa ser de 1 a 36 meses." };
  }

  const paymentDay = numero(entrada.paymentDay);
  if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
    return { ok: false, erro: "O dia de pagamento precisa ser de 1 a 31." };
  }

  const anterior = texto(entrada.previousContractId);
  if (anterior && !UUID.test(anterior)) return { ok: false, erro: "Contrato renovado inválido." };

  const hasRenewal = booleano(entrada.hasRenewal);
  let renewalValue: number | null = null;
  if (hasRenewal) {
    const r = numero(entrada.renewalValue);
    if (!Number.isFinite(r) || r <= 0) return { ok: false, erro: "Informe o novo valor do reajuste ou desmarque o reajuste." };
    renewalValue = r;
  }

  return {
    ok: true,
    dados: {
      clientId, serviceType, monthlyValue, startDate,
      endDate: somarMesesIso(startDate, durationMonths),
      durationMonths, paymentDay,
      previousContractId: anterior || null,
      hasRenewal, renewalValue,
    },
  };
}

export interface NovoAdendo {
  contractId: string;
  changeType: TipoAdendo;
  description: string;
  oldValue: string;
  newValue: string;
  effectiveDate: string;
}

export function validarAdendo(entrada: Record<string, unknown>): Validado<NovoAdendo> {
  const contractId = texto(entrada.contractId);
  if (!UUID.test(contractId)) return { ok: false, erro: "Contrato inválido." };
  const changeType = texto(entrada.changeType) as TipoAdendo;
  if (!TIPOS_ADENDO.includes(changeType)) return { ok: false, erro: "Escolha o tipo do adendo." };
  const description = texto(entrada.description).slice(0, 4000);
  if (!description) return { ok: false, erro: "Descreva a alteração do adendo." };
  const effectiveDate = texto(entrada.effectiveDate);
  if (!DATA.test(effectiveDate)) return { ok: false, erro: "Data de vigência do adendo inválida." };
  return {
    ok: true,
    dados: {
      contractId, changeType, description,
      oldValue: texto(entrada.oldValue).slice(0, 500),
      newValue: texto(entrada.newValue).slice(0, 500),
      effectiveDate,
    },
  };
}
