// Alarmes de tráfego na fila de prioridades (25/10/2026, etapa 1 do plano).
//
//   • Ritmo da verba: UM item por cliente por mês (o fingerprint carrega o mês), com o fato em número, a causa e
//     a diária que fecha o mês na verba. Estourando/estourada também interrompe pelo /api/system/alarmes-trafego;
//     acima/abaixo do ritmo só vem para cá — no grupo seriam 15 a 29 clientes por dia, os mesmos.
//   • Gastou sem conversa: o episódio aberto (avisos_trafego) fica no topo até entrarem 2 conversas.
// Regras: lib/traffic/alarmes. Só clientes COM tráfego contratado, não pausados, conta não oculta.

import { supabaseAdmin } from "@/lib/supabase/server";
import { lerTodasAsLinhas } from "@/lib/scores/ler-tudo";
import { podeReceber, hojeSP } from "@/lib/clients/pausa";
import { diasAntes } from "@/lib/traffic/alarmes/sem-conversa";
import { lerRitmoVerba, ritmoParaFila, fatoRitmo, acaoRitmo, type LeituraRitmoVerba } from "@/lib/traffic/alarmes/ritmo-verba";
import type { ItemBruto } from "../tipos";
import type { ClienteRef } from "./index";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/ /g, " ");

/** Tamanho e pressa pelo nível. Estourando/estourada é dinheiro do cliente saindo além do combinado. */
export function pesoDoRitmo(l: LeituraRitmoVerba): { severidade: number; urgencia: number; reversivel: boolean; exposicaoRs: number | null } {
  const diaria = l.diariaNecessaria ?? 0;
  if (l.nivel === "estourou") return { severidade: 85, urgencia: 85, reversivel: false, exposicaoRs: l.ritmoRodando };
  if (l.nivel === "estoura_em_breve") return { severidade: 75, urgencia: 80, reversivel: false, exposicaoRs: l.ritmoRodando };
  if (l.nivel === "acima") return { severidade: 55, urgencia: 50, reversivel: true, exposicaoRs: Math.max(0, (l.ritmo7d ?? 0) - diaria) || null };
  // Abaixo: quanto mais longe da verba, maior. Verba parada é resultado que o cliente pagou e não teve.
  const falta = l.verba && l.projecao != null ? Math.max(0, 1 - l.projecao / l.verba) : 0;
  return { severidade: Math.round(40 + Math.min(1, falta) * 35), urgencia: 45, reversivel: true, exposicaoRs: Math.max(0, diaria - (l.ritmo7d ?? 0)) || null };
}

export async function itensDosAlarmes(clientes: { porId: Map<string, ClienteRef> }, agora: Date = new Date()): Promise<ItemBruto[]> {
  const hoje = hojeSP(agora);
  const mes = hoje.slice(0, 7);
  const primeiroDoMes = `${mes}-01`;
  const sete = diasAntes(hoje, 7);
  const desde = primeiroDoMes < sete[0] ? primeiroDoMes : sete[0];
  const ontem = sete[sete.length - 1];

  // metric_snapshots passa de 1000 linhas no fim do mês (46 clientes × 31 dias): lido página a página, senão o
  // teto do PostgREST cortaria clientes em silêncio. Erro numa página lança (a fonte falha à vista).
  const [{ data: ajustes }, { data: contas, error: eC }, { data: cadastro, error: eCad }, snaps, { data: abertos, error: eA }] = await Promise.all([
    supabaseAdmin.from("agency_settings").select("value").eq("key", "hidden_ad_accounts").maybeSingle(),
    supabaseAdmin.from("ad_accounts").select("client_id, meta_account_id, monthly_budget, current_month_spend, is_prepaid, last_balance, account_status"),
    supabaseAdmin.from("clients").select("id, monthly_budget, active, churned_at, paused_at, paused_until"),
    lerTodasAsLinhas<{ client_id: string; metric_date: string; spend: number | string | null }>((de, ate, contar) =>
      supabaseAdmin.from("metric_snapshots").select("client_id, metric_date, spend", contar ? { count: "exact" } : undefined)
        .gte("metric_date", desde).lte("metric_date", ontem).order("metric_date").order("client_id").range(de, ate)),
    supabaseAdmin.from("avisos_trafego").select("id, client_id, meta_account_id, dia, detalhe")
      .eq("tipo", "sem_conversa").is("resolvido_em", null).gte("dia", diasAntes(hoje, 14)[0]),
  ]);
  // Leitura que falha não vira "nada a recomendar": a fonte falha e o motor mostra o erro.
  const erro = eC ?? eCad ?? eA;
  if (erro) throw new Error(`alarmes: ${erro.message}`);

  let ocultas: string[] = [];
  try { const v = JSON.parse((ajustes?.value as string) ?? "[]"); ocultas = Array.isArray(v) ? v.map(String) : []; } catch { ocultas = []; }
  const cad = new Map((cadastro ?? []).map((c) => [c.id as string, c]));
  const gastoDia = new Map<string, Map<string, number>>();
  for (const s of snaps) {
    const m = gastoDia.get(s.client_id as string) ?? new Map<string, number>();
    m.set(s.metric_date as string, (m.get(s.metric_date as string) ?? 0) + Number(s.spend ?? 0));
    gastoDia.set(s.client_id as string, m);
  }

  const out: ItemBruto[] = [];
  for (const a of contas ?? []) {
    const c = clientes.porId.get(a.client_id as string);
    const k = cad.get(a.client_id as string);
    if (!c || !c.temTrafego || !k || !podeReceber(k as never, agora)) continue;
    if (ocultas.includes(a.meta_account_id as string)) continue;
    if (a.current_month_spend == null) continue; // sem leitura do mês, não julga
    const dias = gastoDia.get(c.id) ?? new Map<string, number>();
    const ateOntem = [...dias.entries()].filter(([d]) => d >= primeiroDoMes).reduce((s, [, v]) => s + v, 0);
    const gastoMes = Number(a.current_month_spend);
    const vConta = Number(a.monthly_budget ?? 0);
    const vCliente = Number(k.monthly_budget ?? 0);
    const isPrepaid = a.is_prepaid !== false;
    const saldo = isPrepaid && a.last_balance != null ? Number(a.last_balance) : null;
    const l = lerRitmoVerba({
      verba: vConta > 0 ? vConta : vCliente > 0 ? vCliente : null,
      gastoMes, gastoHoje: Math.max(0, gastoMes - ateOntem), hoje,
      serie7d: sete.map((d) => dias.get(d) ?? 0),
      isPrepaid, saldo, contaAtiva: a.account_status === 1,
    });
    if (!ritmoParaFila(l)) continue;
    const peso = pesoDoRitmo(l);
    const titulo = l.nivel === "estourou" ? "a verba do mês acabou"
      : l.nivel === "estoura_em_breve" ? `a verba do mês acaba no dia ${l.diaEstouro}`
      : l.nivel === "acima" ? "verba acima do ritmo do mês"
      : l.causa === "sem_saldo" ? "verba parada: falta saldo na conta"
      : l.causa === "conta_parada" ? "verba parada: a conta não está gastando"
      : "verba abaixo do ritmo do mês";
    out.push({
      fonte: "trafego", clientId: c.id, cliente: c.nome, entityRef: mes, motivo: "ritmo_verba",
      titulo: `${c.nome}: ${titulo}`,
      fato: [fatoRitmo(l)],
      recomendacao: acaoRitmo(l, saldo),
      acaoProposta: { tipo: "ver_verba", clientId: c.id, diariaNecessaria: l.diariaNecessaria },
      severidade: peso.severidade, urgencia: peso.urgencia, confianca: 0.85,
      exposicaoRs: peso.exposicaoRs, reversivel: peso.reversivel,
      ownerRole: "traffic", owner: c.assignedTraffic, nivelPolicy: "B",
    });
  }

  for (const e of abertos ?? []) {
    const c = clientes.porId.get(e.client_id as string);
    if (!c || !c.temTrafego) continue;
    const det = (e.detalhe ?? {}) as { gasto_sem_conversa?: number; desde?: string; esperadas?: number };
    const desdeEp = det.desde ?? (e.dia as string);
    const gasto = det.gasto_sem_conversa ?? null;
    out.push({
      fonte: "trafego", clientId: c.id, cliente: c.nome, entityRef: `${e.meta_account_id}|${desdeEp}`, motivo: "sem_conversa",
      titulo: `${c.nome}: gastando sem receber conversa`,
      fato: [`${gasto != null ? `${brl0(gasto)} gastos` : "Gasto seguindo"} desde ${desdeEp.slice(8, 10)}/${desdeEp.slice(5, 7)} sem nenhuma conversa${det.esperadas ? ` (o normal seria ~${Math.round(det.esperadas)})` : ""}.`],
      recomendacao: "Conferir o WhatsApp do anúncio (número, WhatsApp Business ligado à página). Se o problema for do cliente, pausar as campanhas de mensagem até resolver.",
      acaoProposta: { tipo: "ver_trafego", clientId: c.id, funcao: "sem_conversa" },
      severidade: 90, urgencia: 90, confianca: 0.9, exposicaoRs: gasto, reversivel: false,
      ownerRole: "traffic", owner: c.assignedTraffic, nivelPolicy: "B",
    });
  }
  return out;
}
