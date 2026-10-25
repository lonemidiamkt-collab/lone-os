// lib/traffic/alarmes/ritmo-verba.ts — RITMO DA VERBA DO MÊS. Regras puras (o I/O mora em ./servidor e
// lib/priority/fontes/alarmes.ts).
//
// Roberto (25/10/2026): "se o cliente é 4 mil de verba e a diária de 31 dias está acima ou abaixo, deve ser
// avisado". A tela Contas & Verba já desenhava o ritmo, mas nada saía dela. Medido no banco em 24/10: 20 de 43
// clientes iam fechar outubro mais de 15% abaixo da verba (~R$ 10 mil parados) e 2 iam estourar.
//
// Volume antes de ligar: um alarme ingênuo marcaria 15 a 29 clientes POR DIA como "abaixo", quase sempre os
// mesmos. Por isso duas saídas:
//   • INTERROMPE (grupo de tráfego + voz) só quando a verba vai acabar em até 3 dias antes do fim do mês ou
//     já acabou — em outubro foram 2 clientes, nos últimos dias do mês.
//   • O resto (fora por mais de 15% a partir do dia 5) vira UM item do mês na fila de prioridades, com a causa
//     e a diária que fecha o mês na verba.
//
// A causa muda a ação: sem saldo → cobrar recarga; tem saldo e gasta pouco → subir a diária; gasta demais →
// baixar a diária. "Abaixo do ritmo" sozinho não diz o que fazer.
//
// Testado em tests/alarmes-ritmo-verba.test.ts.

export const DIA_MINIMO_FORA_DO_RITMO = 5;
export const FAIXA_ABAIXO = 0.85;
export const FAIXA_ACIMA = 1.10;
/** "Vai estourar logo": a verba acaba em até tantos dias, e pelo menos 1 dia antes do fim do mês. */
export const DIAS_PARA_ESTOURO = 3;

export type NivelRitmo = "estourou" | "estoura_em_breve" | "acima" | "abaixo" | "no_ritmo" | "sem_verba" | "sem_dados";
export type CausaRitmo = "sem_saldo" | "conta_parada" | "diaria_baixa" | "diaria_alta" | null;

export interface EntradaRitmo {
  /** Verba do mês (ad_accounts.monthly_budget, com o cadastro do cliente como reserva). */
  verba: number | null;
  /** Gasto do mês até agora, hoje incluído (ad_accounts.current_month_spend). */
  gastoMes: number | null;
  /** Gasto de hoje até agora, quando se sabe — tira o dia parcial da conta da diária. */
  gastoHoje?: number | null;
  /** "YYYY-MM-DD" de São Paulo. */
  hoje: string;
  /** Gasto dos últimos 7 dias FECHADOS, o mais antigo primeiro, com 0 nos dias parados. */
  serie7d: number[];
  isPrepaid: boolean;
  /** Saldo disponível da conta pré-paga (null = não se sabe). */
  saldo: number | null;
  /** ad_accounts.account_status === 1. */
  contaAtiva: boolean;
}

export interface LeituraRitmoVerba {
  nivel: NivelRitmo;
  causa: CausaRitmo;
  verba: number | null;
  gasto: number | null;
  dia: number;
  diasNoMes: number;
  /** Dias que faltam, contando hoje. */
  diasRestantes: number;
  /** (verba − gasto até ontem) ÷ dias que faltam: a diária que fecha o mês exatamente na verba. */
  diariaNecessaria: number | null;
  /** Média dos 7 dias fechados, contando os dias parados — o ritmo de verdade. */
  ritmo7d: number | null;
  /** Média só dos dias que gastaram — quanto a conta gasta quando roda (é o que estoura a verba). */
  ritmoRodando: number | null;
  /** Gasto até ontem + ritmo7d × dias que faltam. */
  projecao: number | null;
  pctProjecao: number | null;
  /** Dia do mês em que a verba acaba no ritmo de quando roda (null = não acaba no mês). */
  diaEstouro: number | null;
  /** Dias fechados seguidos sem gasto, até ontem. */
  diasParada: number;
}

export function diaDoMesSP(hoje: string): { dia: number; diasNoMes: number } {
  const [y, m, d] = hoje.split("-").map(Number);
  return { dia: d, diasNoMes: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lerRitmoVerba(e: EntradaRitmo): LeituraRitmoVerba {
  const { dia, diasNoMes } = diaDoMesSP(e.hoje);
  const diasRestantes = diasNoMes - dia + 1;
  const serie = e.serie7d.filter((v) => Number.isFinite(v)).map((v) => Math.max(0, v));
  const rodando = serie.filter((v) => v > 0);
  const ritmo7d = serie.length ? serie.reduce((a, b) => a + b, 0) / serie.length : null;
  const ritmoRodando = rodando.length ? rodando.reduce((a, b) => a + b, 0) / rodando.length : null;
  let diasParada = 0;
  for (let i = serie.length - 1; i >= 0 && serie[i] === 0; i--) diasParada++;

  const base: LeituraRitmoVerba = {
    nivel: "sem_dados", causa: null, verba: e.verba != null && e.verba > 0 ? e.verba : null, gasto: e.gastoMes,
    dia, diasNoMes, diasRestantes, diariaNecessaria: null,
    ritmo7d: ritmo7d != null ? r2(ritmo7d) : null, ritmoRodando: ritmoRodando != null ? r2(ritmoRodando) : null,
    projecao: null, pctProjecao: null, diaEstouro: null, diasParada,
  };
  if (base.verba === null) return { ...base, nivel: "sem_verba" };
  if (e.gastoMes == null || !Number.isFinite(e.gastoMes) || ritmo7d === null) return base;

  const verba = base.verba;
  const gasto = e.gastoMes;
  const hojeParcial = e.gastoHoje != null && Number.isFinite(e.gastoHoje) ? Math.min(Math.max(0, e.gastoHoje), gasto) : 0;
  const ateOntem = gasto - hojeParcial;
  const diariaNecessaria = Math.max(0, (verba - ateOntem) / diasRestantes);
  const projecao = ateOntem + ritmo7d * diasRestantes;
  const pctProjecao = (projecao / verba) * 100;

  let diaEstouro: number | null = null;
  if (gasto >= verba) diaEstouro = dia;
  else if (ritmoRodando && ritmoRodando > 0) {
    const d = dia + Math.floor((verba - gasto) / ritmoRodando);
    diaEstouro = d <= diasNoMes ? d : null;
  }

  const leitura = { ...base, diariaNecessaria: r2(diariaNecessaria), projecao: r2(projecao), pctProjecao: Math.round(pctProjecao), diaEstouro };

  // Causa de quem gasta pouco: o saldo vem antes da diária (subir diária de conta sem saldo não adianta).
  const semSaldo = e.isPrepaid && e.saldo !== null && e.saldo <= Math.max(0, (ritmoRodando ?? 0) * 0.5);
  const causaDeBaixo: CausaRitmo = !e.contaAtiva ? "conta_parada" : semSaldo ? "sem_saldo" : diasParada >= 3 ? "conta_parada" : "diaria_baixa";

  if (gasto >= verba) return { ...leitura, nivel: "estourou", causa: "diaria_alta" };
  if (e.contaAtiva && ritmoRodando && ritmoRodando > 0) {
    const diasAteAcabar = (verba - gasto) / ritmoRodando;
    if (diasAteAcabar <= DIAS_PARA_ESTOURO && diasAteAcabar < diasRestantes - 1) {
      return { ...leitura, nivel: "estoura_em_breve", causa: "diaria_alta" };
    }
  }
  if (dia < DIA_MINIMO_FORA_DO_RITMO) return { ...leitura, nivel: "no_ritmo" };
  if (projecao > verba * FAIXA_ACIMA) return { ...leitura, nivel: "acima", causa: "diaria_alta" };
  if (projecao < verba * FAIXA_ABAIXO) return { ...leitura, nivel: "abaixo", causa: causaDeBaixo };
  return { ...leitura, nivel: "no_ritmo" };
}

/** Interrompe alguém (grupo de tráfego + voz)? Só o que custa dinheiro do cliente em horas ou dias. */
export function ritmoUrgente(l: LeituraRitmoVerba): boolean {
  return l.nivel === "estourou" || l.nivel === "estoura_em_breve";
}

/** Falta mínima, em reais, para "abaixo do ritmo" valer um item (15% de R$ 200 não paga a atenção). */
export const FALTA_MINIMA_RS = 100;

/**
 * Fica para a fila de prioridades (um item por cliente por mês). "Abaixo" por falta de saldo ou conta parada NÃO
 * entra: o aviso de saldo, a conta parada e o diagnóstico já cobram a mesma ação (ensaio de 25/10/2026: 11 dos 24
 * itens repetiam o que já existia). Fica o que só este alarme vê: a diária errada para fechar o mês na verba.
 */
export function ritmoParaFila(l: LeituraRitmoVerba): boolean {
  if (l.nivel === "estourou" || l.nivel === "estoura_em_breve" || l.nivel === "acima") return true;
  if (l.nivel !== "abaixo" || l.causa !== "diaria_baixa") return false;
  return l.verba != null && l.projecao != null && l.verba - l.projecao >= FALTA_MINIMA_RS;
}

// ── Textos ────────────────────────────────────────────────────────────────────

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");

/** O fato, com número: o que já saiu e para onde o mês vai. */
export function fatoRitmo(l: LeituraRitmoVerba): string {
  if (l.verba == null || l.gasto == null) return "";
  const base = `${brl0(l.gasto)} gastos de ${brl0(l.verba)} até o dia ${l.dia} de ${l.diasNoMes}`;
  if (l.nivel === "estourou") return `${base}: a verba do mês acabou.`;
  if (l.nivel === "estoura_em_breve" && l.diaEstouro) return `${base}. No ritmo de ${brl0(l.ritmoRodando ?? 0)}/dia, a verba acaba no dia ${l.diaEstouro}.`;
  return `${base}. No ritmo da última semana (${brl0(l.ritmo7d ?? 0)}/dia) o mês fecha em ~${brl0(l.projecao ?? 0)} (${l.pctProjecao}% da verba).`;
}

/** A ação, pela causa. */
export function acaoRitmo(l: LeituraRitmoVerba, saldo: number | null): string {
  const precisa = brl0(l.diariaNecessaria ?? 0);
  if (l.nivel === "estourou") return "Pausar até o dia 1º ou combinar verba extra com o cliente.";
  if (l.nivel === "estoura_em_breve") return `Baixar a diária para ~${precisa}/dia ou combinar verba extra com o cliente.`;
  if (l.causa === "diaria_alta") return `Baixar a diária de ~${brl0(l.ritmoRodando ?? l.ritmo7d ?? 0)} para ~${precisa}/dia.`;
  if (l.causa === "sem_saldo") return `Cobrar recarga do cliente: o saldo está em ${brl0(Math.max(0, saldo ?? 0))} e faltam ${brl0(Math.max(0, (l.verba ?? 0) - (l.gasto ?? 0)))} da verba.`;
  if (l.causa === "conta_parada") return l.diasParada > 0
    ? `A conta não gasta há ${l.diasParada} dia${l.diasParada === 1 ? "" : "s"}. Conferir pagamento, reprovação ou campanha pausada.`
    : "A conta não está ativa na Meta. Conferir pagamento ou bloqueio.";
  return `Subir a diária de ~${brl0(l.ritmo7d ?? 0)} para ~${precisa}/dia para fechar o mês na verba.`;
}

export interface ContaRitmoUrgente {
  nome: string;
  leitura: LeituraRitmoVerba;
  saldo: number | null;
  gestorTrecho: string;
}

/** A mensagem do grupo de tráfego para verba estourando. */
export function textoRitmoUrgente(contas: ContaRitmoUrgente[], hora: string): string {
  const linhas = [...contas]
    .sort((a, b) => (b.leitura.nivel === "estourou" ? 1 : 0) - (a.leitura.nivel === "estourou" ? 1 : 0))
    .map((c) => `• *${c.nome}* — ${fatoRitmo(c.leitura)} ${acaoRitmo(c.leitura, c.saldo)}${c.gestorTrecho ? ` · ${c.gestorTrecho}` : ""}`);
  const titulo = contas.length === 1 ? "*Verba do mês acabando*" : `*${contas.length} contas com a verba do mês acabando*`;
  return [`${titulo} (leitura das ${hora})`, "", ...linhas].join("\n");
}

export function falaRitmoUrgente(nome: string, l: LeituraRitmoVerba): { titulo: string; corpo: string } {
  if (l.nivel === "estourou") return { titulo: `A verba do mês do ${nome} acabou`, corpo: "Vale pausar ou combinar verba extra com o cliente." };
  return { titulo: `A verba do mês do ${nome} acaba no dia ${l.diaEstouro}`, corpo: "Vale baixar a diária hoje." };
}
