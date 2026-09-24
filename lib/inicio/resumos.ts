// lib/inicio/resumos.ts — o bloco de cima do Início, um por papel. PURO.
// Números de trabalho (quantos clientes, cards, pedidos, leads) — nenhum valor em R$.

import { GESTAO } from "@/lib/api/require-role";
import { nivelDaSaude, type NivelSaude } from "@/lib/scores/health";
import { emSetupInicial, onboardingDesatualizado } from "@/lib/clients/operacao";
import { temTrafego } from "@/lib/clients/servico";
import { donoDaDemanda } from "@/lib/design/dono";
import { spDateStr } from "@/lib/utils";
import { ETAPAS_DE_APROVACAO, ETAPAS_FINAIS, statusNaEtapa, type Etapa } from "@/lib/conteudo/etapas";
import type {
  ItemInterno, PedidoArte, Resumo, ResumoCarteira, ResumoComercial, ResumoDesigner, ResumoSocial, ResumoTrafego, Viewer,
} from "./tipos";
import { type CardRow, type Contexto, type Dados, diasEntre, mesmaPessoa, nomeDoCliente } from "./dados";
import { cardsComAlteracao, comoClient, ETAPAS_ABERTAS, HORAS_PARADO, prazoDoPedido } from "./regras";

const NIVEIS: NivelSaude[] = ["saudavel", "atencao", "risco", "sem_dado"];

/** Publicado no mês corrente de SP (mesma regra do dashboard antigo: verificação, senão mudança de status). */
export function publicadoNoMes(k: CardRow, hoje: string): boolean {
  if (!statusNaEtapa(k.status, "no_ar")) return false;
  const quando = k.publish_verified_at ?? k.status_changed_at;
  return !!quando && spDateStr(quando).slice(0, 7) === hoje.slice(0, 7);
}

export function resumoCarteira(d: Dados, ctx: Contexto): ResumoCarteira {
  const ids = new Set(ctx.vivos.map((c) => c.id));
  const saude = { saudavel: 0, atencao: 0, risco: 0, semDado: 0 };
  for (const c of ctx.vivos) {
    const score = c.current_health_score != null ? Number(c.current_health_score) : null;
    const nivel: NivelSaude = c.current_health_level && (NIVEIS as string[]).includes(c.current_health_level)
      ? (c.current_health_level as NivelSaude) : nivelDaSaude(score);
    if (nivel === "saudavel") saude.saudavel++;
    else if (nivel === "atencao") saude.atencao++;
    else if (nivel === "risco") saude.risco++;
    else saude.semDado++;
  }
  const emSetup = ctx.vivos.filter((c) => emSetupInicial(comoClient(c)));
  const cards = d.cards.filter((k) => k.client_id && ids.has(k.client_id));
  const conta = (...e: Etapa[]) => cards.filter((k) => statusNaEtapa(k.status, ...e)).length;
  const pedidos = d.pedidosArte.filter((p) => p.status !== "done" && p.client_id && ids.has(p.client_id));
  return {
    clientes: ctx.vivos.length,
    saude,
    onboarding: {
      emSetup: emSetup.length,
      nomes: emSetup.map(nomeDoCliente).slice(0, 4),
      desatualizados: ctx.vivos.filter((c) => onboardingDesatualizado(comoClient(c))).length,
    },
    conteudo: {
      pauta: conta("pauta"),
      comDesigner: conta("com_designer"),
      revisao: conta("revisao"),
      comCliente: conta("com_cliente"),
      agendados: conta("agendado"),
      publicadosMes: cards.filter((k) => publicadoNoMes(k, ctx.hoje)).length,
    },
    design: {
      fila: pedidos.filter((p) => p.status === "queued").length,
      producao: pedidos.filter((p) => p.status === "in_progress").length,
    },
  };
}

/** Dono do card: quem está no card; sem ninguém, o social da carteira. */
const donoDoCard = (k: CardRow, ctx: Contexto) =>
  ctx.canon(k.social_media) ?? (k.client_id ? ctx.canon(ctx.porId.get(k.client_id)?.assigned_social) : null);

export function resumoSocial(d: Dados, ctx: Contexto, v: Viewer): ResumoSocial {
  const ativos = new Set(ctx.ativos.map((c) => c.id));
  const meus = d.cards.filter((k) => k.client_id && ativos.has(k.client_id) && mesmaPessoa(donoDoCard(k, ctx), v.nome));
  const aberto = (k: CardRow) => !statusNaEtapa(k.status, "pauta", ...ETAPAS_FINAIS);
  const horas = (k: CardRow) => {
    const desde = k.column_entered_at?.[k.status ?? ""] ?? k.status_changed_at;
    return desde ? (ctx.agoraMs - new Date(desde).getTime()) / 3_600_000 : 0;
  };
  const deHoje = meus.filter((k) => k.due_date?.slice(0, 10) === ctx.hoje && !statusNaEtapa(k.status, "no_ar"));
  return {
    aprovar: meus.filter((k) => statusNaEtapa(k.status, ...ETAPAS_DE_APROVACAO) && !k.client_approved_at).length,
    hoje: deHoje.length,
    postarHoje: deHoje
      .slice(0, 6)
      .map((k) => ({ id: k.id, titulo: (k.title || "sem título").slice(0, 70), cliente: nomeDoCliente(ctx.porId.get(k.client_id!)!), status: k.status ?? "" })),
    prontas: meus.filter((k) => !!k.designer_delivered_at && !k.social_confirmed_at && aberto(k)).length,
    parados: meus.filter((k) => aberto(k) && horas(k) >= HORAS_PARADO).length,
    clientes: ctx.ativos.filter((c) => mesmaPessoa(ctx.canon(c.assigned_social), v.nome)).length,
  };
}

const ORDEM_SITUACAO: Record<PedidoArte["situacao"], number> = { atrasado: 0, hoje: 1, no_prazo: 2, sem_prazo: 3 };

export function resumoDesigner(d: Dados, ctx: Contexto, v: Viewer): ResumoDesigner {
  const designers = ctx.vivos.map((c) => ({ id: c.id, assignedDesigner: c.assigned_designer }));
  const cardPorId = new Map(d.cards.map((k) => [k.id, k]));
  const meus: PedidoArte[] = d.pedidosArte
    .filter((p) => p.status !== "done" && p.client_id && ctx.porId.has(p.client_id)
      && mesmaPessoa(ctx.canon(donoDaDemanda({ clientId: p.client_id, assignedDesigner: p.assigned_designer }, designers)), v.nome))
    .map((p) => {
      const prazo = prazoDoPedido(p, cardPorId);
      const n = prazo ? diasEntre(prazo, ctx.hoje) : null;
      const situacao: PedidoArte["situacao"] = n === null ? "sem_prazo" : n > 0 ? "atrasado" : n === 0 ? "hoje" : "no_prazo";
      return {
        id: p.id, titulo: (p.title || "sem título").slice(0, 70), cliente: nomeDoCliente(ctx.porId.get(p.client_id!)!),
        status: p.status === "in_progress" ? "in_progress" as const : "queued" as const, prazo, situacao,
      };
    })
    .sort((a, b) => ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || (a.prazo ?? "").localeCompare(b.prazo ?? ""));
  const alteracoes = cardsComAlteracao(d).filter((k) => k.client_id && ctx.porId.has(k.client_id)
    && mesmaPessoa(ctx.canon(donoDaDemanda({ clientId: k.client_id }, designers)), v.nome)).length;
  return {
    atrasados: meus.filter((p) => p.situacao === "atrasado").length,
    hoje: meus.filter((p) => p.situacao === "hoje").length,
    fila: meus.filter((p) => p.status === "queued").length,
    producao: meus.filter((p) => p.status === "in_progress").length,
    alteracoes,
    pedidos: meus.slice(0, 8),
  };
}

export function resumoTrafego(d: Dados, ctx: Contexto, v: Viewer, meus: ItemInterno[]): ResumoTrafego {
  const clientes = ctx.ativos.filter((c) => temTrafego({ service_type: c.service_type }) && mesmaPessoa(ctx.canon(c.assigned_traffic), v.nome));
  const ids = new Set(clientes.map((c) => c.id));
  const comAlerta = new Set(meus.filter((i) => i.area === "trafego" && i.cliente && ids.has(i.cliente.id)).map((i) => i.cliente!.id));
  return {
    clientes: clientes.length,
    contas: d.contas.filter((a) => a.client_id && ids.has(a.client_id)).length,
    clientesComAlerta: comAlerta.size,
  };
}

/** Data do CRM pode vir como "YYYY-MM-DD" (dia do calendário) ou instante ISO — ambos viram o dia em SP. */
const diaSP = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : spDateStr(s));

export function resumoComercial(d: Dados, ctx: Contexto): ResumoComercial {
  const abertos = d.leads.filter((l) => ETAPAS_ABERTAS.includes(l.estagio ?? ""));
  const etapa = (e: string) => abertos.filter((l) => l.estagio === e).length;
  const fu = abertos.filter((l) => l.proximo_contato).map((l) => diasEntre(diaSP(l.proximo_contato!), ctx.hoje));
  const emAte7 = (s: string) => { const n = diasEntre(ctx.hoje, diaSP(s)); return n >= 0 && n <= 7; };
  return {
    etapas: { lead: etapa("lead"), orcamento: etapa("orcamento"), proposta: etapa("proposta"), reuniao: etapa("reuniao") },
    ganhosMes: d.leads.filter((l) => l.estagio === "ganho" && l.fechado_em && diaSP(l.fechado_em).slice(0, 7) === ctx.hoje.slice(0, 7)).length,
    followupsHoje: fu.filter((n) => n === 0).length,
    followupsVencidos: fu.filter((n) => n > 0).length,
    reunioes: abertos
      .filter((l) => l.reuniao_data && emAte7(l.reuniao_data))
      .map((l) => ({ id: l.id, nome: (l.empresa || l.contato_nome || "Lead").trim(), data: diaSP(l.reuniao_data!) }))
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 5),
  };
}

export function montarResumo(d: Dados, ctx: Contexto, v: Viewer, meus: ItemInterno[]): Resumo {
  if (GESTAO.includes(v.papel)) return { tipo: "gestao", carteira: resumoCarteira(d, ctx) };
  if (v.papel === "traffic") return { tipo: "traffic", trafego: resumoTrafego(d, ctx, v, meus) };
  if (v.papel === "social") return { tipo: "social", social: resumoSocial(d, ctx, v) };
  if (v.papel === "designer") return { tipo: "designer", designer: resumoDesigner(d, ctx, v) };
  return { tipo: "comercial", comercial: resumoComercial(d, ctx) };
}
