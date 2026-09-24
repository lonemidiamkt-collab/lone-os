// lib/inicio/regras.ts — AS REGRAS DO FEED DE ATENÇÃO. Uma função pura por problema.
//
// Nenhuma regra nova foi inventada aqui: cada uma aponta de onde veio o corte. Quando a fonte
// original já exporta a função (lacunas, risco-semanal, dono do design, motor de saldo), ela é
// importada, não copiada. Onde a fonte só tinha a constante dentro de um módulo com I/O
// (lib/cs/snapshot.ts), o número está repetido aqui com o nome da origem ao lado.
//
// Cada regra devolve no máximo UM item por cliente (ou por lead/pessoa); `feed.ts` ainda
// deduplica o que duas regras disserem sobre o mesmo (cliente, problema).

import type { Papel } from "@/lib/api/require-role";
import { nivelDaSaude, type NivelSaude } from "@/lib/scores/health";
import { entraNaSemana, esfriou, motivosDoCliente, type ClienteSemana } from "@/lib/cs/risco-semanal";
import { DIAS_PRA_ESCALAR } from "@/lib/cs/cobranca-nominal";
import { clientesSemPostNaSemana, semanaAlvo } from "@/lib/cs/lacunas";
import { donoDaDemanda } from "@/lib/design/dono";
import { emSetupInicial, onboardingDesatualizado } from "@/lib/clients/operacao";
import { temSocial, temTrafego } from "@/lib/clients/servico";
import { evaluateAccount } from "@/lib/budgets/alert-engine";
import { metaAccountStatus } from "@/lib/budgets/account-status";
import type { Client } from "@/lib/types";
import type { ItemInterno, Problema, Severidade, Area, Acao } from "./tipos";
import {
  type ClienteRow, type CardRow, type ContaRow, type Contexto, type Dados,
  ddmm, diasDesde, diasEntre, nomeDoCliente, plural,
} from "./dados";

// ── Cortes (com a origem) ───────────────────────────────────────────────────

/** lib/cs/snapshot.ts COMPROMETIDO: só atrasa o que já é trabalho prometido (não "ideas"). */
export const COMPROMETIDO = ["script", "in_production", "approval", "client_approval"];
/** lib/cs/snapshot.ts ATRASO_MAX: vencido há mais que isso é encalhado (higiene), não atraso do dia. */
export const ATRASO_MAX = 30;
/** lib/priority/fontes/producao.ts: até 7 dias ainda dá para salvar a semana → agir hoje. */
export const ATRASO_URGENTE = 7;
/** getDashboardData/SmartAlerts: card parado na coluna há 48h+ viola o SLA de fila. */
export const HORAS_PARADO = 48;
/** SmartAlerts: contrato vencendo em até 30 dias; até 15 é crítico. */
export const CONTRATO_AVISO = 30;
export const CONTRATO_CRITICO = 15;
/** lib/cs/snapshot.ts eventosClientes: datas marcadas pelo cliente nos próximos 14 dias. */
export const DIAS_EVENTO = 14;
/** app/api/system/crm-followups: etapas abertas do CRM. */
export const ETAPAS_ABERTAS = ["lead", "orcamento", "proposta", "reuniao"];
/** app/api/system/alerta-queda: pior sintoma primeiro. */
const SINTOMA: Record<string, { ordem: number; texto: (p: number) => string }> = {
  spend:       { ordem: 0, texto: () => "Parou de gastar" },
  impressions: { ordem: 1, texto: (p) => `Entrega caiu ${Math.abs(Math.round(p))}%` },
  cpl:         { ordem: 2, texto: (p) => `Custo por conversa subiu ${Math.round(p)}%` },
  ctr:         { ordem: 3, texto: (p) => `Cliques caíram ${Math.abs(Math.round(p))}%` },
};

const NIVEIS: NivelSaude[] = ["saudavel", "atencao", "risco", "sem_dado"];
const dias = (n: number) => plural(n, "dia", "dias");
const aspas = (s: string | null | undefined, max = 60) => `"${(s || "sem título").trim().slice(0, max)}"`;
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const uniq = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null && x !== ""))];

interface Base {
  problema: Problema; area: Area; severidade: Severidade; cliente: ClienteRow | null; sujeito?: string; chave?: string;
  titulo: string; motivo: string; acao: Acao; donos: (string | null)[]; papeis: Papel[]; doPapel?: boolean; peso: number;
}

function item(ctx: Contexto, b: Base): ItemInterno {
  const chave = b.chave ?? (b.cliente ? `cliente:${b.cliente.id}` : `sujeito:${b.sujeito ?? "?"}`);
  return {
    id: `${b.problema}:${chave}`,
    severidade: b.severidade,
    area: b.area,
    cliente: b.cliente ? ctx.ref(b.cliente) : null,
    sujeito: b.cliente ? nomeDoCliente(b.cliente) : (b.sujeito ?? ""),
    titulo: b.titulo,
    motivo: b.motivo,
    acao: b.acao,
    problema: b.problema,
    chave,
    donos: uniq(b.donos.map((n) => ctx.canon(n))),
    papeis: b.papeis,
    doPapel: b.doPapel,
    peso: b.peso,
  };
}

/** Agrupa por cliente vivo e não pausado; descarta o que não é da carteira ativa. */
function porCliente<T>(ctx: Contexto, linhas: T[], idDe: (t: T) => string | null | undefined): Map<ClienteRow, T[]> {
  const ativos = new Set(ctx.ativos.map((c) => c.id));
  const out = new Map<ClienteRow, T[]>();
  for (const l of linhas) {
    const id = idDe(l);
    if (!id || !ativos.has(id)) continue;
    const c = ctx.porId.get(id)!;
    (out.get(c) ?? out.set(c, []).get(c)!).push(l);
  }
  return out;
}

const acaoCards = (c: ClienteRow, cards: { id: string }[], rotuloUm = "Abrir card"): Acao =>
  cards.length === 1 ? { label: rotuloUm, href: `/social?card=${cards[0].id}` } : { label: "Ver no quadro", href: `/social?client=${c.id}` };

// ── 1. Relacionamento: saúde em risco/atenção + cliente calado ─────────────
// Fonte: lib/cs/risco-semanal.ts (Leva 2) — nível do modelo único de saúde (clients.current_health_*),
// porquê do breakdown gravado, esfriando = 7+ dias sem falar no grupo com o agente ligado. Mesmo
// cliente em risco E calado é UM problema (a conversa), não dois.
export function regraRelacionamento(d: Dados, ctx: Contexto): ItemInterno[] {
  const out: ItemInterno[] = [];
  for (const c of ctx.ativos) {
    const score = c.current_health_score != null && Number.isFinite(Number(c.current_health_score)) ? Number(c.current_health_score) : null;
    const nivel: NivelSaude = c.current_health_level && (NIVEIS as string[]).includes(c.current_health_level)
      ? (c.current_health_level as NivelSaude) : nivelDaSaude(score);
    const diasQuieto = c.last_client_msg_at && c.agente_ativo !== false ? diasDesde(c.last_client_msg_at, ctx.agoraMs) : null;
    const cs: ClienteSemana = { cliente: nomeDoCliente(c), dono: null, nivel, score, motivos: d.motivosSaude[c.id] ?? [], diasQuieto };
    if (!entraNaSemana(cs)) continue;
    const nota = score !== null ? ` (${Math.round(score)}/100)` : "";
    const soCalado = nivel !== "risco" && nivel !== "atencao";
    const porque = motivosDoCliente(cs);
    out.push(item(ctx, {
      problema: "relacionamento", area: "relacionamento", cliente: c,
      severidade: nivel === "risco" ? "critical" : "warning",
      titulo: nivel === "risco" ? `Saúde em risco${nota}` : nivel === "atencao" ? `Saúde em atenção${nota}` : `Sem falar no grupo há ${dias(diasQuieto ?? 0)}`,
      motivo: soCalado
        ? "Mandar algo concreto (resultado, próxima peça, pergunta) — não um \"tudo bem?\""
        : maiuscula(porque.join(" · ")) || "Nota abaixo da faixa saudável no modelo de saúde",
      acao: soCalado || (esfriou(cs) && nivel !== "risco")
        ? { label: "Abrir conversa", href: `/clients/${c.id}?tab=chat` }
        : { label: "Abrir ficha", href: `/clients/${c.id}` },
      donos: [c.assigned_social, c.assigned_traffic], papeis: ["social", "traffic"],
      peso: nivel === "risco" || nivel === "atencao" ? 100 - (score ?? 50) : (diasQuieto ?? 0),
    }));
  }
  return out;
}

// ── 2. Posts atrasados ─────────────────────────────────────────────────────
// Fonte: lib/cs/snapshot.ts (atrasados) — prazo vencido em card COMPROMETIDO, até ATRASO_MAX dias.
// Sem arte entregue, o designer também é dono (lib/cs/cobranca-nominal: "sem arte é fila do designer").
export function cardsAtrasados(d: Dados, ctx: Contexto): CardRow[] {
  return d.cards.filter((k) => {
    if (!k.due_date || !COMPROMETIDO.includes(k.status ?? "")) return false;
    const n = diasEntre(k.due_date, ctx.hoje);
    return n > 0 && n <= ATRASO_MAX;
  });
}

export function regraAtrasados(d: Dados, ctx: Contexto): ItemInterno[] {
  const out: ItemInterno[] = [];
  const designers = ctx.vivos.map((c) => ({ id: c.id, assignedDesigner: c.assigned_designer }));
  for (const [c, cards] of porCliente(ctx, cardsAtrasados(d, ctx), (k) => k.client_id)) {
    const ds = cards.map((k) => diasEntre(k.due_date!, ctx.hoje));
    const min = Math.min(...ds), max = Math.max(...ds);
    const semArte = cards.filter((k) => !k.designer_delivered_at);
    const um = cards.length === 1;
    out.push(item(ctx, {
      problema: "atrasado", area: "producao", cliente: c,
      severidade: min <= ATRASO_URGENTE ? "critical" : "warning",
      titulo: um ? `Post atrasado há ${dias(min)}` : `${cards.length} posts atrasados (${min === max ? dias(min) : `${min}–${max} dias`})`,
      motivo: um
        ? `${aspas(cards[0].title)} — ${semArte.length ? "o designer ainda não entregou a arte" : "arte pronta, falta postar"}`
        : [semArte.length && `${semArte.length} sem arte do designer`, cards.length - semArte.length && `${cards.length - semArte.length} com arte pronta`].filter(Boolean).join(" · "),
      acao: acaoCards(c, cards),
      donos: [...cards.map((k) => k.social_media), c.assigned_social, ...(semArte.length ? [donoDaDemanda({ clientId: c.id }, designers)] : [])],
      papeis: semArte.length ? ["social", "designer"] : ["social"],
      peso: 100 - min + cards.length,
    }));
  }
  return out;
}

// ── 3. Pronto para postar ──────────────────────────────────────────────────
// Fontes: lib/cs/snapshot.ts (prontasPraPostar: designer entregou, social não confirmou, fora de
// ideas/scheduled/published) + /api/dashboard/insights (aprovadas pelo cliente e não publicadas).
// É a mesma ação — postar — então vira um item. Card já atrasado fica só no item de atraso.
export function regraPostar(d: Dados, ctx: Contexto, excluir: Set<string>): ItemInterno[] {
  const out: ItemInterno[] = [];
  const pronto = (k: CardRow) => !!k.designer_delivered_at && !k.social_confirmed_at && !["published", "scheduled", "ideas"].includes(k.status ?? "");
  const aprovado = (k: CardRow) => !!k.client_approved_at && !["published", "scheduled"].includes(k.status ?? "");
  const lista = d.cards.filter((k) => !excluir.has(k.id) && (pronto(k) || aprovado(k)));
  for (const [c, cards] of porCliente(ctx, lista, (k) => k.client_id)) {
    const parado = (k: CardRow) => diasDesde(aprovado(k) ? k.client_approved_at : k.designer_delivered_at, ctx.agoraMs);
    const max = Math.max(...cards.map(parado));
    const aprovadas = cards.filter(aprovado).length;
    const um = cards.length === 1;
    out.push(item(ctx, {
      problema: "postar", area: "producao", cliente: c, severidade: "warning",
      titulo: um
        ? (aprovadas ? "Aprovado pelo cliente, falta postar" : `Arte pronta há ${dias(max)}, falta postar`)
        : `${cards.length} peças prontas para postar`,
      motivo: um
        ? `${aspas(cards[0].title)} — ${aprovadas ? "o cliente já aprovou" : "o designer entregou e o card não andou"}`
        : [aprovadas && `${aprovadas} aprovada${aprovadas === 1 ? "" : "s"} pelo cliente`, `a mais antiga está parada há ${dias(max)}`].filter(Boolean).join(" · "),
      acao: acaoCards(c, cards),
      donos: [...cards.map((k) => k.social_media), c.assigned_social], papeis: ["social"],
      peso: max + cards.length,
    }));
  }
  return out;
}

// ── 4. Parado em aprovação ─────────────────────────────────────────────────
// Fonte: SmartAlerts (aprovação há 48h+) + getDashboardData (aprovado pelo cliente não é pendente).
export function regraAprovacao(d: Dados, ctx: Contexto, excluir: Set<string>): ItemInterno[] {
  const out: ItemInterno[] = [];
  const horas = (k: CardRow) => {
    const desde = k.column_entered_at?.[k.status ?? ""] ?? k.status_changed_at;
    return desde ? (ctx.agoraMs - new Date(desde).getTime()) / 3_600_000 : 0;
  };
  const lista = d.cards.filter((k) => !excluir.has(k.id) && ["approval", "client_approval"].includes(k.status ?? "")
    && !k.client_approved_at && horas(k) >= HORAS_PARADO);
  for (const [c, cards] of porCliente(ctx, lista, (k) => k.client_id)) {
    const max = Math.max(...cards.map((k) => Math.floor(horas(k) / 24)));
    const noCliente = cards.filter((k) => k.status === "client_approval").length;
    const um = cards.length === 1;
    out.push(item(ctx, {
      problema: "aprovacao", area: "producao", cliente: c, severidade: "warning",
      titulo: um ? `Parado em aprovação há ${dias(max)}` : `${cards.length} cards parados em aprovação`,
      motivo: um
        ? `${aspas(cards[0].title)} — ${noCliente ? "esperando o cliente" : "esperando a aprovação interna"}`
        : `${noCliente} com o cliente · ${cards.length - noCliente} internos · o mais antigo há ${dias(max)}`,
      acao: acaoCards(c, cards),
      donos: [...cards.map((k) => k.social_media), c.assigned_social], papeis: ["social"],
      peso: max + cards.length,
    }));
  }
  return out;
}

// ── 5. Semana sem post planejado ───────────────────────────────────────────
// Fonte: lib/cs/lacunas.ts (clientesSemPostNaSemana + semanaAlvo), elegível = cliente com social.
export function regraSemana(d: Dados, ctx: Contexto): ItemInterno[] {
  const sp = new Date(ctx.agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const semana = semanaAlvo(sp);
  const elegiveis = ctx.ativos.filter((c) => c.assigned_social)
    .map((c) => ({ id: c.id, nome: nomeDoCliente(c), social: c.assigned_social }));
  const faltando = clientesSemPostNaSemana(elegiveis, d.cards.map((k) => ({ clientId: k.client_id, dueDate: k.due_date })), semana.segunda);
  return faltando.map((f) => {
    const c = ctx.porId.get(f.id)!;
    return item(ctx, {
      problema: "semana", area: "producao", cliente: c,
      severidade: semana.proxima ? "info" : "warning",
      titulo: `Nenhum post planejado para ${semana.label}`,
      motivo: `Nenhum card com data de postagem de segunda a domingo ${semana.proxima ? "da semana que vem" : "desta semana"}`,
      acao: { label: "Planejar no quadro", href: `/social?client=${c.id}` },
      donos: [c.assigned_social], papeis: ["social"], peso: 0,
    });
  });
}

// ── 6. Pedido do grupo esperando ok/não ────────────────────────────────────
// Fonte: lib/cs/snapshot.ts (pendentes) + lib/cs/cobranca-nominal.ts (DIAS_PRA_ESCALAR vira crítico).
export function regraPedidos(d: Dados, ctx: Contexto): ItemInterno[] {
  const out: ItemInterno[] = [];
  for (const [c, dem] of porCliente(ctx, d.demandas, (x) => x.client_id)) {
    const max = Math.max(...dem.map((x) => diasDesde(x.created_at, ctx.agoraMs)));
    const um = dem.length === 1;
    out.push(item(ctx, {
      problema: "pedido", area: "relacionamento", cliente: c,
      severidade: max >= DIAS_PRA_ESCALAR ? "critical" : "warning",
      titulo: um ? `Pedido esperando ok/não há ${dias(max)}` : `${dem.length} pedidos esperando ok/não`,
      motivo: um
        ? `${aspas(dem[0].resumo, 70)} (${dem[0].codigo ?? "sem código"}) — responder ok ou não no grupo interno`
        : `${dem.map((x) => x.codigo).filter(Boolean).slice(0, 4).join(", ")} · o mais antigo há ${dias(max)}`,
      acao: { label: "Abrir conversa", href: `/clients/${c.id}?tab=chat` },
      donos: [...dem.map((x) => x.responsavel), ...(dem.some((x) => !x.responsavel) ? [c.assigned_social] : [])],
      papeis: ["social"], peso: max + dem.length,
    }));
  }
  return out;
}

// ── 7. Cadastro: onboarding de verdade e status parado no tempo ─────────────
// Fonte: lib/clients/operacao.ts (emSetupInicial / onboardingDesatualizado). Só gestão.
/** A regra de operação (lib/clients/operacao) recebe um Client; aqui só os campos que ela lê. */
export const comoClient = (c: ClienteRow) => ({
  status: c.status ?? undefined, createdAt: c.created_at ?? undefined, metaAdAccountId: c.meta_ad_account_id ?? undefined,
  publicReportEnabled: !!c.public_report_enabled, instagramUser: c.instagram_user ?? undefined, lastPostDate: c.last_post_date ?? undefined,
}) as unknown as Client;

export function regraCadastro(_d: Dados, ctx: Contexto): ItemInterno[] {
  const out: ItemInterno[] = [];
  for (const c of ctx.ativos) {
    const cl = comoClient(c);
    if (emSetupInicial(cl)) {
      out.push(item(ctx, {
        problema: "cadastro", area: "cadastro", cliente: c, severidade: "info",
        titulo: "Em setup inicial",
        motivo: `Entrou há ${dias(diasDesde(c.created_at, ctx.agoraMs))} e ainda não tem anúncio, portal ou Instagram ligado`,
        acao: { label: "Abrir onboarding", href: `/clients/${c.id}?tab=onboarding` },
        donos: [], papeis: [], peso: 0,
      }));
    } else if (onboardingDesatualizado(cl)) {
      out.push(item(ctx, {
        problema: "cadastro", area: "cadastro", cliente: c, severidade: "info",
        titulo: "Status parado em onboarding",
        motivo: "Já opera (anúncio, portal ou posts) ou passou da primeira semana — promover o cadastro",
        acao: { label: "Atualizar cadastro", href: `/clients/${c.id}?tab=dados` },
        donos: [], papeis: [], peso: 0,
      }));
    }
  }
  return out;
}

// ── 8. Tarefas vencidas (por pessoa) ────────────────────────────────────────
// Fonte: lib/priority/fontes/tarefas.ts + SmartAlerts; crítico = prioridade "critical" (getDashboardData).
const PAPEIS: Papel[] = ["admin", "manager", "traffic", "social", "designer", "comercial"];
const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "gestão", manager: "gestão", traffic: "tráfego", social: "social", designer: "design", comercial: "comercial",
};

export function regraTarefas(d: Dados, ctx: Contexto): ItemInterno[] {
  const grupos = new Map<string, typeof d.tarefas>();
  for (const t of d.tarefas) {
    if (t.status === "done" || !t.due_date || diasEntre(t.due_date, ctx.hoje) <= 0) continue;
    const bruto = (t.assigned_to ?? "").trim();
    const ehPapel = (PAPEIS as string[]).includes(bruto.toLowerCase());
    const chave = ehPapel || !bruto ? `papel:${(ehPapel ? bruto.toLowerCase() : t.role) ?? "social"}` : `pessoa:${ctx.canon(bruto)}`;
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(t);
  }
  const out: ItemInterno[] = [];
  for (const [chave, ts] of grupos) {
    const pessoa = chave.startsWith("pessoa:") ? chave.slice(7) : null;
    const papelBruto = pessoa ? (ctx.papelDe(pessoa) ?? ts[0].role) : chave.slice(6);
    const papel: Papel = (PAPEIS as string[]).includes(papelBruto ?? "") ? (papelBruto as Papel) : "social";
    const max = Math.max(...ts.map((t) => diasEntre(t.due_date!, ctx.hoje)));
    const clientes = uniq(ts.map((t) => t.client_id));
    const cliente = clientes.length === 1 ? ctx.porId.get(clientes[0]) ?? null : null;
    const um = ts.length === 1;
    out.push(item(ctx, {
      problema: "tarefas", area: "tarefas", cliente: null, chave, sujeito: pessoa ?? `Time de ${ROTULO_PAPEL[papel]}`,
      severidade: ts.some((t) => t.priority === "critical") ? "critical" : "warning",
      titulo: um ? `Tarefa vencida há ${dias(max)}` : `${ts.length} tarefas vencidas`,
      motivo: um
        ? `${aspas(ts[0].title)}${cliente ? ` — ${nomeDoCliente(cliente)}` : ts[0].client_name ? ` — ${ts[0].client_name}` : ""}`
        : `${ts.slice(0, 2).map((t) => aspas(t.title, 40)).join(", ")}${ts.length > 2 ? ` e mais ${ts.length - 2}` : ""} · a mais antiga há ${dias(max)}`,
      acao: { label: "Abrir tarefas", href: "/tarefas" },
      donos: pessoa ? [pessoa] : [], papeis: [papel],
      doPapel: !pessoa, peso: max + ts.length,
    }));
  }
  return out;
}

// ── 9. Arte atrasada e 10. alteração pendente (designer) ────────────────────
// Fontes: app/design (prazo = deadline do pedido ou, sem ele, a data do card) + lib/design/dono
// (atribuição explícita vence a carteira) + lib/cs/snapshot.ts (alteração = rejeição mais nova que
// a última entrega).
export function prazoDoPedido(p: { deadline: string | null; content_card_id: string | null }, cardPorId: Map<string, CardRow>): string | null {
  const bruto = p.deadline || (p.content_card_id ? cardPorId.get(p.content_card_id)?.due_date : null) || null;
  return bruto ? bruto.slice(0, 10) : null;
}

export function regraArteAtrasada(d: Dados, ctx: Contexto): ItemInterno[] {
  const cardPorId = new Map(d.cards.map((k) => [k.id, k]));
  const designers = ctx.vivos.map((c) => ({ id: c.id, assignedDesigner: c.assigned_designer }));
  const atrasados = d.pedidosArte.filter((p) => {
    if (p.status === "done") return false;
    const prazo = prazoDoPedido(p, cardPorId);
    return !!prazo && diasEntre(prazo, ctx.hoje) > 0;
  });
  const out: ItemInterno[] = [];
  for (const [c, ps] of porCliente(ctx, atrasados, (p) => p.client_id)) {
    const max = Math.max(...ps.map((p) => diasEntre(prazoDoPedido(p, cardPorId)!, ctx.hoje)));
    const um = ps.length === 1;
    out.push(item(ctx, {
      problema: "arte_atrasada", area: "design", cliente: c, severidade: "warning",
      titulo: um ? `Arte atrasada há ${dias(max)}` : `${ps.length} artes atrasadas`,
      motivo: um ? `${aspas(ps[0].title)} — prazo era ${ddmm(prazoDoPedido(ps[0], cardPorId)!)}` : `a mais antiga venceu há ${dias(max)}`,
      acao: { label: "Abrir fila de design", href: "/design" },
      donos: ps.map((p) => donoDaDemanda({ clientId: c.id, assignedDesigner: p.assigned_designer }, designers)),
      papeis: ["designer"], peso: max + ps.length,
    }));
  }
  return out;
}

export function cardsComAlteracao(d: Dados): CardRow[] {
  const ultima = new Map<string, string>();
  for (const r of d.rejeicoes) {
    const atual = ultima.get(r.card_id);
    if (r.reviewed_at && (!atual || r.reviewed_at > atual)) ultima.set(r.card_id, r.reviewed_at);
  }
  return d.cards.filter((k) => {
    const rej = ultima.get(k.id);
    if (!rej || k.status === "published") return false;
    return !(k.designer_delivered_at && rej <= k.designer_delivered_at); // entregou depois = já refez
  });
}

export function regraAlteracao(d: Dados, ctx: Contexto): ItemInterno[] {
  const designers = ctx.vivos.map((c) => ({ id: c.id, assignedDesigner: c.assigned_designer }));
  const out: ItemInterno[] = [];
  for (const [c, cards] of porCliente(ctx, cardsComAlteracao(d), (k) => k.client_id)) {
    const um = cards.length === 1;
    out.push(item(ctx, {
      problema: "alteracao", area: "design", cliente: c, severidade: "warning",
      titulo: um ? "Alteração pedida, arte não voltou" : `${cards.length} alterações pendentes`,
      motivo: um ? `${aspas(cards[0].title)} — o social pediu ajuste` : cards.slice(0, 2).map((k) => aspas(k.title, 40)).join(", "),
      acao: { label: "Abrir fila de design", href: "/design" },
      donos: [donoDaDemanda({ clientId: c.id }, designers)], papeis: ["designer"], peso: cards.length,
    }));
  }
  return out;
}

// ── 11–13. Tráfego: conta, saldo, entrega ───────────────────────────────────
// Fontes: lib/budgets/account-status.ts (o que cada status da Meta significa), lib/budgets/alert-engine
// evaluateAccount (saldo — o mesmo motor do sync e do digest), lib/budgets/operational-alerts
// (sem gasto com a conta ativa; falha de leitura), app/api/system/alerta-queda (anomalias
// critical/high, um sintoma por cliente). Só clientes com tráfego CONTRATADO (lib/clients/servico).
// Nenhum valor em R$ sai daqui — o motivo é sempre "% da verba", "dias", "status".

/** Saldo efetivo — a mesma regra do sync (lib/traffic/sync-core): pós-pago com verba usa verba − gasto do mês. */
export function saldoEfetivo(a: ContaRow): number | null {
  if (a.is_prepaid === false && a.monthly_budget != null) {
    return a.current_month_spend != null ? Math.max(0, Number(a.monthly_budget) - Number(a.current_month_spend)) : null;
  }
  return a.last_balance != null ? Number(a.last_balance) : null;
}

function contasDoTrafego(d: Dados, ctx: Contexto): Map<ClienteRow, ContaRow[]> {
  const ocultas = new Set(d.ajustes.contasOcultas);
  const lista = d.contas.filter((a) => !ocultas.has(a.id) && !(a.meta_account_id && ocultas.has(a.meta_account_id)));
  const out = porCliente(ctx, lista, (a) => a.client_id);
  for (const c of [...out.keys()]) if (!temTrafego({ service_type: c.service_type })) out.delete(c);
  return out;
}

export function regraTrafego(d: Dados, ctx: Contexto): ItemInterno[] {
  const out: ItemInterno[] = [];
  const cfgDe = new Map(d.configAlerta.map((x) => [x.client_id, x]));
  const trafego = (c: ClienteRow) => ({ donos: [c.assigned_traffic], papeis: ["traffic"] as Papel[] });
  const abrirTrafego: Acao = { label: "Abrir Tráfego", href: "/traffic" };

  for (const [c, contas] of contasDoTrafego(d, ctx)) {
    const cfg = cfgDe.get(c.id);
    const lidas = contas.filter((a) => a.account_status != null); // conta recém-vinculada, nunca sincronizada: sem dado
    const temAtiva = lidas.some((a) => a.account_status === 1 && !a.sync_error);
    for (const a of lidas) {
      if (a.sync_error) {
        out.push(item(ctx, { problema: "conta", area: "trafego", cliente: c, severidade: "warning",
          titulo: "Leitura da Meta falhou", motivo: "Saldo e gasto desta conta estão desatualizados até a próxima sincronização",
          acao: abrirTrafego, ...trafego(c), peso: 1 }));
        continue;
      }
      if (a.account_status !== 1) {
        if (cfg?.alert_erro_conta === false) continue;
        const st = metaAccountStatus(a.account_status);
        if (st.gravidade === "paused" && temAtiva) continue; // conta antiga encerrada ao lado de uma ativa não é problema
        out.push(item(ctx, { problema: "conta", area: "trafego", cliente: c,
          severidade: st.gravidade === "critical" ? "critical" : "warning",
          titulo: st.gravidade === "paused" ? "Nenhuma conta de anúncio ativa" : `Conta de anúncio: ${st.label.toLowerCase()}`,
          motivo: `Conta ${st.frase} — os anúncios ${st.gravidade === "critical" ? "podem parar" : "não estão rodando"}`,
          acao: abrirTrafego, ...trafego(c), peso: st.gravidade === "critical" ? 3 : 2 }));
        continue;
      }
      // Conta ativa e lida: saldo e gasto.
      const disponivel = saldoEfetivo(a);
      const media = a.last_3d_avg_spend != null ? Number(a.last_3d_avg_spend) : null;
      const diasRestantes = disponivel !== null && disponivel > 0 && media && media > 0 ? disponivel / media : null;
      const alertaSaldo = cfg?.alert_verba_baixa !== false || cfg?.alert_verba_zerada !== false;
      const r = evaluateAccount({
        available: disponivel, monthlyBudget: a.monthly_budget != null ? Number(a.monthly_budget) : null,
        daysRemaining: diasRestantes, accountStatus: 1,
        warningThreshold: cfg?.alert_verba_baixa !== false ? (cfg?.verba_minima ?? null) : null,
        isPrepaid: a.is_prepaid ?? undefined,
      }, { warningPct: d.ajustes.warningPct, criticalPct: d.ajustes.criticalPct });
      if (alertaSaldo && (r.severity === "critical" || r.severity === "warning")) {
        const cartao = a.is_prepaid === false;
        const dura = diasRestantes !== null ? ` · dura ~${dias(Math.max(0, Math.round(diasRestantes)))} no ritmo atual` : "";
        out.push(item(ctx, { problema: "saldo", area: "trafego", cliente: c, severidade: r.severity,
          titulo: cartao ? "Verba do mês estourada" : r.severity === "critical" ? "Saldo acabando" : "Saldo baixo",
          motivo: `${r.reason}${dura}`,
          acao: { label: "Ver saldo no Tráfego", href: "/traffic" }, ...trafego(c),
          peso: r.pctRemaining != null ? 100 - r.pctRemaining : 50 }));
      }
      // Sem gasto com a conta ativa (0 lido de verdade — null é "não sei", não "zero").
      if (cfg?.alert_sem_gasto !== false && media === 0 && !(disponivel !== null && disponivel <= 0)) {
        out.push(item(ctx, { problema: "entrega", area: "trafego", cliente: c, severidade: "warning",
          titulo: "Conta sem gasto", motivo: "Nenhum gasto nos últimos 3 dias com a conta ativa",
          acao: abrirTrafego, ...trafego(c), peso: 1 }));
      }
    }
  }

  // Anomalias (queda de resultado) — pior sintoma por cliente.
  for (const [c, as] of porCliente(ctx, d.anomalias.filter((a) => ["critical", "high"].includes(a.severity ?? "")), (a) => a.client_id)) {
    if (!temTrafego({ service_type: c.service_type })) continue;
    const conhecidas = as.filter((a) => a.metric && SINTOMA[a.metric]);
    if (!conhecidas.length) continue;
    conhecidas.sort((x, y) => SINTOMA[x.metric!].ordem - SINTOMA[y.metric!].ordem || (x.severity === "critical" ? -1 : 1));
    const pior = conhecidas[0];
    const outros = new Set(conhecidas.map((a) => a.metric)).size - 1;
    out.push(item(ctx, { problema: "entrega", area: "trafego", cliente: c,
      severidade: conhecidas.some((a) => a.severity === "critical") ? "critical" : "warning",
      titulo: SINTOMA[pior.metric!].texto(Number(pior.percent_change ?? 0)),
      motivo: `Comparado com a média dos últimos 7 dias${outros > 0 ? ` · mais ${plural(outros, "sinal", "sinais")} caindo` : ""}`,
      acao: { label: "Ver resultados", href: `/clients/${c.id}?tab=resultados` }, ...trafego(c), peso: 10 - SINTOMA[pior.metric!].ordem }));
  }
  return out;
}

// ── 14. Contrato vencendo (só gestão) ───────────────────────────────────────
// Fonte: SmartAlerts + o resumo de contratos do dashboard antigo. Só a DATA — nenhum valor.
export function regraContratos(d: Dados, ctx: Contexto): ItemInterno[] {
  const out: ItemInterno[] = [];
  for (const [c, cs] of porCliente(ctx, d.contratos, (x) => x.client_id)) {
    const faltam = cs.filter((x) => x.end_date).map((x) => diasEntre(ctx.hoje, x.end_date!)).filter((n) => n >= 0 && n <= CONTRATO_AVISO);
    if (!faltam.length) continue;
    const n = Math.min(...faltam);
    const fim = cs.find((x) => x.end_date && diasEntre(ctx.hoje, x.end_date) === n)!.end_date!;
    out.push(item(ctx, { problema: "contrato", area: "cadastro", cliente: c,
      severidade: n <= CONTRATO_CRITICO ? "critical" : "warning",
      titulo: n === 0 ? "Contrato vence hoje" : `Contrato vence em ${dias(n)}`,
      motivo: `Vencimento em ${ddmm(fim)} — conversar sobre a renovação`,
      acao: { label: "Ver contrato", href: `/clients/${c.id}?tab=contratos` }, donos: [], papeis: [], peso: CONTRATO_AVISO - n }));
  }
  return out;
}

// ── 15. Follow-up de lead (comercial) ───────────────────────────────────────
// Fonte: app/api/system/crm-followups (próximo contato ≤ hoje em etapa aberta).
const ROTULO_ETAPA: Record<string, string> = { lead: "Lead", orcamento: "Orçamento", proposta: "Proposta", reuniao: "Reunião" };

export function regraFollowups(d: Dados, ctx: Contexto): ItemInterno[] {
  return d.leads
    .filter((l) => l.proximo_contato && ETAPAS_ABERTAS.includes(l.estagio ?? "") && diasEntre(l.proximo_contato.slice(0, 10), ctx.hoje) >= 0)
    .map((l) => {
      const n = diasEntre(l.proximo_contato!, ctx.hoje);
      return item(ctx, {
        problema: "followup", area: "comercial", cliente: null, chave: `lead:${l.id}`,
        sujeito: (l.empresa || l.contato_nome || "Lead").trim(),
        severidade: n > 0 ? "warning" : "info",
        titulo: n > 0 ? `Follow-up atrasado há ${dias(n)}` : "Follow-up para hoje",
        motivo: `${ROTULO_ETAPA[l.estagio ?? ""] ?? "Lead"}${l.contato_nome ? ` · ${l.contato_nome}` : ""}`,
        acao: { label: "Abrir no Comercial", href: "/crm" },
        donos: [l.responsavel], papeis: ["comercial"], doPapel: !l.responsavel, peso: n,
      });
    });
}

// ── 16. Token da Meta (só gestão) ───────────────────────────────────────────
// Fonte: SystemAlertBanner (agency_settings.meta_token_critical) — agora dentro do feed.
export function regraIntegracao(d: Dados, ctx: Contexto): ItemInterno[] {
  if (!d.ajustes.tokenMetaCritico) return [];
  return [item(ctx, {
    problema: "integracao", area: "sistema", cliente: null, chave: "sistema:meta-token", sujeito: "Integração Meta",
    severidade: "critical", titulo: "Token da Meta expirando",
    motivo: "Sem renovar, a leitura de saldo e os relatórios de tráfego param",
    acao: { label: "Renovar token", href: "/conexao-meta" }, donos: [], papeis: [], peso: 100,
  })];
}

// ── 17. Datas que o cliente marcou ──────────────────────────────────────────
// Fonte: lib/cs/snapshot.ts eventosClientes (cs_client_events ativos, próximos 14 dias).
export function regraDatas(d: Dados, ctx: Contexto): ItemInterno[] {
  const out: ItemInterno[] = [];
  const noPrazo = d.eventos.filter((e) => e.event_date && diasEntre(ctx.hoje, e.event_date) >= 0 && diasEntre(ctx.hoje, e.event_date) <= DIAS_EVENTO);
  for (const [c, es] of porCliente(ctx, noPrazo, (e) => e.client_id)) {
    if (!temSocial({ service_type: c.service_type }) && !c.assigned_social) continue;
    es.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
    const prox = es[0];
    out.push(item(ctx, { problema: "data", area: "producao", cliente: c, severidade: "info",
      titulo: es.length === 1 ? `Data marcada para ${ddmm(prox.event_date!)}` : `${es.length} datas marcadas nos próximos ${DIAS_EVENTO} dias`,
      motivo: `${aspas(prox.titulo, 60)} em ${ddmm(prox.event_date!)} — planejar o conteúdo com antecedência`,
      acao: { label: "Planejar no quadro", href: `/social?client=${c.id}` },
      donos: [c.assigned_social], papeis: ["social"], peso: DIAS_EVENTO - diasEntre(ctx.hoje, prox.event_date!) }));
  }
  return out;
}

/** Todas as regras, na ordem. Card atrasado não reaparece como "pronto" nem como "em aprovação". */
export function gerarItens(d: Dados, ctx: Contexto): ItemInterno[] {
  const atrasados = new Set(cardsAtrasados(d, ctx).map((k) => k.id));
  const jaPostar = new Set(d.cards.filter((k) => !!k.client_approved_at).map((k) => k.id));
  return [
    ...regraIntegracao(d, ctx),
    ...regraRelacionamento(d, ctx),
    ...regraAtrasados(d, ctx),
    ...regraPostar(d, ctx, atrasados),
    ...regraAprovacao(d, ctx, new Set([...atrasados, ...jaPostar])),
    ...regraSemana(d, ctx),
    ...regraPedidos(d, ctx),
    ...regraArteAtrasada(d, ctx),
    ...regraAlteracao(d, ctx),
    ...regraTrafego(d, ctx),
    ...regraContratos(d, ctx),
    ...regraCadastro(d, ctx),
    ...regraTarefas(d, ctx),
    ...regraFollowups(d, ctx),
    ...regraDatas(d, ctx),
  ];
}
