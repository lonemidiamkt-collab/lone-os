// lib/traffic/alarmes/rodada.ts — o que uma rodada decide, conta por conta. Puro: recebe o que ./servidor leu
// (contas, leitura da Meta, avisos já gravados) e devolve o que avisar, relembrar e fechar.
// Separado do I/O para o ensaio com dado real rodar exatamente esta função (tests/alarmes-rodada.test.ts).

import { podeReceber } from "@/lib/clients/pausa";
import { temTrafego } from "@/lib/clients/servico";
import { lerSemConversa, decidirSemConversa, diasAntes, type DiaCampanha, type LeituraSemConversa } from "./sem-conversa";
import { lerRitmoVerba, ritmoUrgente, type LeituraRitmoVerba } from "./ritmo-verba";

export interface ContaAlarme {
  clientId: string;
  nome: string;
  gestor: string | null;
  metaAccountId: string;
  verba: number | null;
  isPrepaid: boolean;
  saldo: number | null;
  contaAtiva: boolean;
  cplMeta: number | null;
}

type Linha = Record<string, unknown>;

/**
 * As contas que a rodada julga: cliente ativo, não pausado, com tráfego contratado (o contrato decide, não a conta
 * Meta), conta não oculta. Verba = a da conta de anúncio (a que o modal "Verba e alertas" grava); o cadastro do
 * cliente é a reserva.
 */
export function montarContas(p: { contas: Linha[]; clientes: Linha[]; politicas: Linha[]; ocultasJson: string | null; agora: Date }): ContaAlarme[] {
  let ocultas: string[] = [];
  try { const v = JSON.parse(p.ocultasJson ?? "[]"); ocultas = Array.isArray(v) ? v.map(String) : []; } catch { ocultas = []; }
  const porId = new Map(p.clientes.map((c) => [c.id as string, c]));
  const cpl = new Map(p.politicas.map((x) => [x.client_id as string, x.cpl_meta != null ? Number(x.cpl_meta) : null]));
  const out: ContaAlarme[] = [];
  for (const a of p.contas) {
    const c = porId.get(a.client_id as string);
    if (!c || !podeReceber(c as never, p.agora) || !temTrafego(c as never)) continue;
    if (ocultas.includes(a.meta_account_id as string)) continue;
    const vConta = Number(a.monthly_budget ?? 0);
    const vCliente = Number(c.monthly_budget ?? 0);
    out.push({
      clientId: c.id as string,
      nome: ((c.nome_fantasia as string) || (c.name as string) || "(sem nome)").trim(),
      gestor: ((c.assigned_traffic as string) ?? "").trim() || null,
      metaAccountId: a.meta_account_id as string,
      verba: vConta > 0 ? vConta : vCliente > 0 ? vCliente : null,
      isPrepaid: a.is_prepaid !== false,
      saldo: a.last_balance != null ? Number(a.last_balance) : null,
      contaAtiva: a.account_status === 1,
      cplMeta: cpl.get(c.id as string) ?? null,
    });
  }
  return out;
}

/** Evento de avisos_trafego já gravado (o que importa dele para decidir). */
export interface EventoGravado { id: string; meta_account_id: string; tipo: string; resolvido_em?: string | null }

export interface DecisoesDaRodada {
  lidas: number;
  falhasLeitura: string[];
  semConversa: { conta: ContaAlarme; leitura: LeituraSemConversa; decisao: "novo" | "lembrete" }[];
  fechar: { conta: ContaAlarme; ids: string[] }[];
  ritmoAvisar: { conta: ContaAlarme; leitura: LeituraRitmoVerba; tipo: "verba_estourando" | "verba_estourou" }[];
  ritmoResolver: { conta: ContaAlarme; ids: string[] }[];
}

const somar = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Gasto por dia (todas as campanhas) nos dias pedidos, 0 nos dias sem linha. */
export function gastoPorDia(linhas: DiaCampanha[], dias: string[]): number[] {
  const m = new Map<string, number>();
  for (const l of linhas) m.set(l.data, (m.get(l.data) ?? 0) + l.gasto);
  return dias.map((d) => Math.round((m.get(d) ?? 0) * 100) / 100);
}

export function decidirRodada(p: {
  contas: ContaAlarme[];
  /** Conta ausente = leitura da Meta falhou (não é julgada). */
  leitura: Map<string, DiaCampanha[]>;
  /** Eventos "sem_conversa" ainda abertos (14 dias). */
  semConversaAbertos: EventoGravado[];
  /** Eventos de verba do mês corrente (abertos ou não). */
  verbaDoMes: EventoGravado[];
  hoje: string;
  horaSP: number;
}): DecisoesDaRodada {
  const primeiroDoMes = `${p.hoje.slice(0, 8)}01`;
  const sete = diasAntes(p.hoje, 7);
  const abertosPorConta = new Map<string, string[]>();
  for (const e of p.semConversaAbertos) abertosPorConta.set(e.meta_account_id, [...(abertosPorConta.get(e.meta_account_id) ?? []), e.id]);

  const out: DecisoesDaRodada = { lidas: 0, falhasLeitura: [], semConversa: [], fechar: [], ritmoAvisar: [], ritmoResolver: [] };
  for (const conta of p.contas) {
    const linhas = p.leitura.get(conta.metaAccountId);
    if (!linhas) { out.falhasLeitura.push(conta.nome); continue; }
    out.lidas++;

    // ── Gastou sem conversa
    const l = lerSemConversa({ linhas, hoje: p.hoje, cplMeta: conta.cplMeta });
    const idsAbertos = abertosPorConta.get(conta.metaAccountId) ?? [];
    const d = decidirSemConversa(l, idsAbertos.length > 0);
    if (d === "fechar") out.fechar.push({ conta, ids: idsAbertos });
    else if (d === "novo" || d === "lembrete") out.semConversa.push({ conta, leitura: l, decisao: d });

    // ── Ritmo da verba (o gasto do mês sai da mesma leitura: um retrato só, hoje incluído)
    const gastoHoje = somar(linhas.filter((x) => x.data === p.hoje).map((x) => x.gasto));
    const ritmo = lerRitmoVerba({
      verba: conta.verba,
      gastoMes: Math.round(somar(linhas.filter((x) => x.data >= primeiroDoMes).map((x) => x.gasto)) * 100) / 100,
      gastoHoje, hoje: p.hoje, serie7d: gastoPorDia(linhas, sete),
      isPrepaid: conta.isPrepaid, saldo: conta.isPrepaid ? conta.saldo : null, contaAtiva: conta.contaAtiva,
    });
    const doMes = p.verbaDoMes.filter((e) => e.meta_account_id === conta.metaAccountId);
    const jaEstourou = doMes.some((e) => e.tipo === "verba_estourou");
    const jaEstourando = doMes.some((e) => e.tipo === "verba_estourando");
    if (ritmo.nivel === "estourou" && !jaEstourou) out.ritmoAvisar.push({ conta, leitura: ritmo, tipo: "verba_estourou" });
    else if (ritmo.nivel === "estoura_em_breve" && !jaEstourando && !jaEstourou) out.ritmoAvisar.push({ conta, leitura: ritmo, tipo: "verba_estourando" });
    // Resolvido: "estourando" que voltou para o ritmo (a diária baixou); "estourou" com verba aumentada ou que
    // parou de gastar hoje (depois do meio-dia, para a madrugada sem entrega não contar como pausa).
    const resolvidos = doMes.filter((e) => !e.resolvido_em && (
      (e.tipo === "verba_estourando" && !ritmoUrgente(ritmo)) ||
      (e.tipo === "verba_estourou" && ritmo.gasto != null && ritmo.verba != null && (ritmo.gasto < ritmo.verba || (p.horaSP >= 12 && gastoHoje === 0)))
    ));
    if (resolvidos.length) out.ritmoResolver.push({ conta, ids: resolvidos.map((e) => e.id) });
  }
  return out;
}
