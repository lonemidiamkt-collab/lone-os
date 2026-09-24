// lib/carga/por-pessoa.ts — CARGA REAL POR PESSOA (Leva 7C, N30). Módulo PURO.
//
// A aba "Carga" do painel da diretoria dividia tudo por um número fixo: CAPACITY_PER_WEEK = 8 itens,
// igual para social, designer e gestor de tráfego. Um social com 10 clientes tem 25 cards abertos
// num dia normal e aparecia "312% — sobrecarregado"; um gestor com 3 tarefas aparecia folgado.
// Além disso, o designer só era contado pelos pedidos de arte, e o card "com o designer" (o fluxo
// novo do quadro de Produção) não entrava na conta dele.
//
// Agora: ITENS ABERTOS de cada pessoa, contados pelo que é dela em cada papel, contra um LIMITE DO
// PAPEL. Os limites são o padrão abaixo (calibrar com o time); não existe mais "por semana" — é o que
// está aberto agora.

import { etapaDoStatus, type Etapa } from "@/lib/conteudo/etapas";

export type PapelCarga = "social" | "designer" | "traffic" | "manager" | "admin" | "comercial";

/** Itens abertos que cabem numa pessoa, por papel. */
export const LIMITE_POR_PAPEL: Record<PapelCarga, number> = {
  social: 24,    // ~8 clientes × 3 cards em produção
  designer: 15,  // artes na mesa ao mesmo tempo
  traffic: 12,   // tarefas abertas de conta
  manager: 15,
  admin: 15,
  comercial: 15,
};

export const ROTULO_PAPEL_CARGA: Record<PapelCarga, string> = {
  social: "Social", designer: "Designer", traffic: "Tráfego", manager: "Gestão", admin: "Diretoria", comercial: "Comercial",
};

/** Etapas em que o card ainda é trabalho do SOCIAL (pauta, revisão, aprovação, agendamento). */
const ETAPAS_DO_SOCIAL: readonly Etapa[] = ["pauta", "com_designer", "revisao", "com_cliente", "agendado"];

export interface PessoaCarga { nome: string; papel: string | null }
export interface TarefaCarga { assignedTo: string; status: string }
export interface CardCarga { socialMedia: string; status: string; clientId: string; archivedAt?: string | null; designRequestId?: string | null }
export interface PedidoArteCarga { clientId: string; status: string; assignedDesigner?: string | null }
export interface ClienteCarga { id: string; name: string; assignedSocial?: string | null; assignedTraffic?: string | null; assignedDesigner?: string | null }

export interface CargaDaPessoa {
  nome: string;
  papel: PapelCarga;
  limite: number;
  tarefas: number;
  cards: number;
  artes: number;
  total: number;
  /** total ÷ limite, em %. */
  uso: number;
  situacao: "folga" | "ok" | "cheio" | "acima";
  clientes: string[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function papelDeCarga(p: string | null | undefined): PapelCarga {
  return (p && p in LIMITE_POR_PAPEL ? p : "social") as PapelCarga;
}

export function situacaoDaCarga(uso: number): CargaDaPessoa["situacao"] {
  if (uso > 100) return "acima";
  if (uso >= 85) return "cheio";
  if (uso < 40) return "folga";
  return "ok";
}

export function cargaPorPessoa(d: {
  pessoas: PessoaCarga[];
  clientes: ClienteCarga[];
  tarefas: TarefaCarga[];
  cards: CardCarga[];
  pedidosArte: PedidoArteCarga[];
  limites?: Partial<Record<PapelCarga, number>>;
}): CargaDaPessoa[] {
  const limites = { ...LIMITE_POR_PAPEL, ...(d.limites ?? {}) };
  const designerDo = new Map(d.clientes.map((c) => [c.id, norm(c.assignedDesigner)]));

  // Quem aparece: o time ativo + quem está escalado em algum cliente (ex-membro com carteira ainda).
  const nomes = new Map<string, PessoaCarga>();
  for (const p of d.pessoas) if (p.nome?.trim()) nomes.set(norm(p.nome), p);
  for (const c of d.clientes) {
    for (const [nome, papel] of [[c.assignedSocial, "social"], [c.assignedTraffic, "traffic"], [c.assignedDesigner, "designer"]] as const) {
      if (nome?.trim() && !nomes.has(norm(nome))) nomes.set(norm(nome), { nome: nome.trim(), papel });
    }
  }

  const out: CargaDaPessoa[] = [];
  for (const [chave, p] of nomes) {
    const papel = papelDeCarga(p.papel);
    const tarefas = d.tarefas.filter((t) => norm(t.assignedTo) === chave && t.status !== "done").length;

    // Social: os cards dele que ainda estão na mão do time. Arquivado e "No ar" já saíram.
    const cards = papel === "designer" ? 0 : d.cards.filter((c) =>
      !c.archivedAt && norm(c.socialMedia) === chave && ETAPAS_DO_SOCIAL.includes(etapaDoStatus(c.status))).length;

    // Designer: pedidos de arte abertos (dono do pedido, senão o designer da carteira) + cards "com o
    // designer" sem pedido vinculado (o pedido já conta — não soma duas vezes).
    let artes = 0;
    if (papel === "designer") {
      artes += d.pedidosArte.filter((r) => r.status !== "done" && (norm(r.assignedDesigner) || designerDo.get(r.clientId)) === chave).length;
      artes += d.cards.filter((c) => !c.archivedAt && !c.designRequestId && etapaDoStatus(c.status) === "com_designer" && designerDo.get(c.clientId) === chave).length;
    }

    const total = tarefas + cards + artes;
    const limite = Math.max(1, limites[papel]);
    const uso = Math.round((total / limite) * 100);
    const clientes = d.clientes
      .filter((c) => [c.assignedSocial, c.assignedTraffic, c.assignedDesigner].some((n) => norm(n) === chave))
      .map((c) => c.name);
    // Diretoria e comercial sem nada aberto não entram: a tela é sobre quem produz.
    if (total === 0 && !clientes.length && (papel === "admin" || papel === "comercial" || papel === "manager")) continue;
    out.push({ nome: p.nome.trim(), papel, limite, tarefas, cards, artes, total, uso, situacao: situacaoDaCarga(uso), clientes });
  }
  return out.sort((a, b) => b.uso - a.uso || a.nome.localeCompare(b.nome));
}
