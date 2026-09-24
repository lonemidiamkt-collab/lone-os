// lib/inicio/tipos.ts — o que a tela Início recebe. UM feed de atenção para todo o painel.
//
// Antes (Leva 3, 24/09/2026): o dashboard repetia "urgentes" 3×, "em risco" 4× e "onboarding" 3×,
// por quatro caminhos diferentes (getDashboardData no navegador, /api/dashboard/insights,
// SmartAlerts, ClientHealthRadar), e dois deles discordavam sobre o mesmo card. Aqui existe um
// item por (cliente, problema), calculado no servidor, com UMA ação.
//
// Regra do CEO: nada de dinheiro da agência no payload (sem MRR, fee, valor de contrato, orçamento
// de proposta). O teste `inicio-sem-financeiro` confere o JSON inteiro.

import type { Papel } from "@/lib/api/require-role";

export type Severidade = "critical" | "warning" | "info";

/** Área do problema — vira o rótulo curto do item na tela. */
export type Area = "relacionamento" | "producao" | "design" | "trafego" | "cadastro" | "tarefas" | "comercial" | "sistema";

/** O problema, sem o cliente. (cliente, problema) é a chave de deduplicação. */
export type Problema =
  | "relacionamento"   // saúde em risco/atenção e/ou cliente calado no grupo
  | "atrasado"         // post com prazo vencido
  | "postar"           // arte pronta / aprovada pelo cliente, falta postar
  | "aprovacao"        // parado em aprovação há 48h+
  | "semana"           // nenhum post planejado na semana-alvo
  | "pedido"           // pedido do grupo esperando ok/não
  | "cadastro"         // onboarding em setup ou status parado no tempo
  | "tarefas"          // tarefas vencidas (por pessoa)
  | "arte_atrasada"    // pedido de arte com prazo vencido
  | "alteracao"        // social pediu alteração e a arte não voltou
  | "conta"            // conta de anúncio com problema (status/cobrança/leitura)
  | "saldo"            // saldo baixo/zerado
  | "entrega"          // parou de gastar ou resultado caiu (anomalia)
  | "contrato"         // contrato vencendo
  | "followup"         // lead com próximo contato vencido
  | "integracao"       // token da Meta expirando
  | "data";            // data/promoção marcada pelo cliente chegando

export interface ClienteRefItem { id: string; nome: string; logo: string | null }

export interface Acao { label: string; href: string }

/** O que vai para a tela. Sem dono, sem papel, sem número de dinheiro. */
export interface ItemAtencao {
  id: string;
  severidade: Severidade;
  area: Area;
  cliente: ClienteRefItem | null;
  /** Nome de quem/que é o item quando não há cliente (pessoa, lead, integração). */
  sujeito: string;
  titulo: string;
  /** Uma linha: por que isto está aqui. */
  motivo: string;
  acao: Acao;
}

/** O item com o roteamento interno (quem vê). Nunca sai do servidor assim. */
export interface ItemInterno extends ItemAtencao {
  problema: Problema;
  /** Chave de deduplicação: cliente, lead ou pessoa. */
  chave: string;
  /** Nomes já canonizados contra o time. Vazio = só a gestão vê (ou o papel, se `doPapel`). */
  donos: string[];
  /** Papéis a quem o problema diz respeito. Gestão vê tudo. */
  papeis: Papel[];
  /** Sem dono nomeado, qualquer pessoa destes papéis vê (lead sem responsável, token da Meta). */
  doPapel?: boolean;
  /** Desempate dentro da severidade: maior = mais para cima (dias, quantidade). */
  peso: number;
}

export interface Viewer { nome: string | null; papel: Papel }

// ── Resumos por papel ─────────────────────────────────────────────────────

export interface ResumoCarteira {
  clientes: number;
  saude: { saudavel: number; atencao: number; risco: number; semDado: number };
  onboarding: { emSetup: number; nomes: string[]; desatualizados: number };
  conteudo: { ideias: number; roteiro: number; producao: number; aprovacao: number; agendados: number; publicadosMes: number };
  design: { fila: number; producao: number };
}

export interface CardHoje { id: string; titulo: string; cliente: string; status: string }

export interface ResumoSocial {
  aprovar: number;
  /** Quantos vencem hoje; a lista abaixo mostra no máximo 6. */
  hoje: number;
  postarHoje: CardHoje[];
  prontas: number;
  parados: number;
  clientes: number;
}

export interface PedidoArte {
  id: string;
  titulo: string;
  cliente: string;
  status: "queued" | "in_progress";
  prazo: string | null;
  situacao: "atrasado" | "hoje" | "no_prazo" | "sem_prazo";
}

export interface ResumoDesigner {
  atrasados: number;
  hoje: number;
  fila: number;
  producao: number;
  alteracoes: number;
  pedidos: PedidoArte[];
}

export interface ResumoTrafego {
  clientes: number;
  contas: number;
  clientesComAlerta: number;
}

export interface ResumoComercial {
  etapas: { lead: number; orcamento: number; proposta: number; reuniao: number };
  ganhosMes: number;
  followupsHoje: number;
  followupsVencidos: number;
  reunioes: { id: string; nome: string; data: string }[];
}

export type Resumo =
  | { tipo: "gestao"; carteira: ResumoCarteira }
  | { tipo: "traffic"; trafego: ResumoTrafego }
  | { tipo: "social"; social: ResumoSocial }
  | { tipo: "designer"; designer: ResumoDesigner }
  | { tipo: "comercial"; comercial: ResumoComercial };

export interface RespostaInicio {
  papel: Papel;
  nome: string | null;
  geradoEm: string;
  itens: ItemAtencao[];
  resumo: Resumo;
  /** Fontes que não carregaram — a tela avisa em vez de mostrar zero. */
  falhas: string[];
}
