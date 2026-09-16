// lib/prospeccao/tipos.ts — vocabulário do Piloto SDR Lone.
//
// As linhas do banco circulam em snake_case (como o resto do lib/cs): o painel lê o que o banco
// devolve, sem camada de tradução que só cria lugar para o campo novo ficar de fora.

/** Estados da máquina (lib/prospeccao/maquina.ts). Só ela muda `prospects.estagio`. */
export type Estagio =
  | "descoberto" | "enriquecido" | "icp_aprovado" | "fila_prospeccao"
  | "abordado" | "aguardando_resposta" | "followup"
  | "atendente" | "decisor_identificado" | "decisor_contatado"
  | "interesse" | "horario_proposto" | "aguardando_confirmacao"
  | "reuniao_agendada" | "handoff" | "reuniao_realizada" | "no_show" | "proposta" | "cliente"
  | "momento_ruim" | "nutricao_30d" | "nutricao_90d"
  | "sem_interesse" | "nao_perturbe" | "fora_icp" | "perdido";

export type Classe = "A" | "B" | "C" | "NP";
export type Owner = "SDR_AI" | "ROBERTO";
export type ModoAgente = "ativo" | "observacao" | "pausado";
export type Modalidade = "visita" | "online";

/** Intenções lidas da resposta do prospect (§16 + as que o agendamento e a governança exigem). */
export type Intent =
  | "DECISOR_INDISPONIVEL" | "DECISOR_IDENTIFICADO" | "SOU_O_DECISOR" | "PASSOU_CONTATO"
  | "QUER_SABER_MAIS" | "INTERESSADO" | "QUER_REUNIAO" | "QUER_VISITA"
  | "NAO_INTERESSADO" | "RETORNAR_DEPOIS" | "PEDIU_PRECO" | "JA_TEM_AGENCIA" | "SEM_ORCAMENTO"
  | "CLIENTE_NAO_E_ICP" | "OPT_OUT" | "E_ROBO"
  | "PROPOE_HORARIO" | "CONFIRMA_HORARIO" | "RECUSA_HORARIO"
  | "SAUDACAO" | "OUTRO";

export interface IntentLida {
  intent: Intent;
  confianca: number;
  /** Entidades que a resposta trouxe. Só o que foi DITO — nunca deduzido. */
  decisor_nome?: string | null;
  decisor_cargo?: string | null;
  telefone?: string | null;
  /** "mês que vem", "depois da reforma", "em 45 dias" — texto cru; quem converte em data é o código. */
  quando?: string | null;
  objecao?: string | null;
  contexto?: string | null;
  resumo?: string | null;
}

export interface FaturamentoSinal {
  faixa: "indeterminado" | "abaixo_100k" | "100k_300k" | "acima_300k";
  confianca: number;
  is_estimate: true;
  sinais: string[];
}

export interface Diagnostico {
  oportunidades: string[];
  por_que_prospectar: string;
  abordagem_recomendada: string;
  /** Um dado concreto e VERIFICADO para citar na conversa (ou null se não houver). */
  gancho?: string | null;
}

export interface PresencaDigital {
  instagram_followers?: number | null;
  instagram_posts?: number | null;
  posts_por_semana?: number | null;
  pct_reels?: number | null;
  engajamento_medio?: number | null;
  ultimo_post_em?: string | null;
  /** true/false quando verificado; null = não verificado (nunca "não anuncia" por falta de dado). */
  anuncia?: boolean | null;
  anuncia_fonte?: string | null;
  lido_em?: string | null;
}

export interface QualityGateResultado {
  passed: boolean;
  itens: { chave: string; ok: boolean; detalhe?: string }[];
  verificado_em: string;
}

export interface NextAction {
  type: string;
  at: string | null;
  owner: Owner;
  reason: string;
}

/** Linha de `prospects` (colunas do banco). */
export interface ProspectRow {
  id: string;
  campanha_id: string | null;
  nome: string;
  razao_social: string | null;
  cnpj: string | null;
  cnae: string | null;
  cnae_descricao: string | null;
  segmento: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  distancia_km: number | null;
  modalidade_preferida: Modalidade | null;
  site: string | null;
  instagram: string | null;
  telefone: string | null;
  whatsapp_jid: string | null;
  whatsapp_lid: string | null;
  whatsapp_verificado: boolean | null;
  email: string | null;
  google_maps_url: string | null;
  google_nota: number | null;
  google_avaliacoes: number | null;
  unidades: number | null;
  porte: string | null;
  capital_social: number | null;
  abertura: string | null;
  fontes: Record<string, string>;
  dados_cnpj: Record<string, unknown> | null;
  presenca: PresencaDigital | null;
  faturamento_sinal: FaturamentoSinal | null;
  diagnostico: Diagnostico | null;
  score: number | null;
  score_detalhe: Record<string, { pontos: number; max: number; motivo: string }> | null;
  classe: Classe | null;
  decisor_nome: string | null;
  decisor_cargo: string | null;
  decisor_confianca: number | null;
  decisor_fontes: string[] | null;
  decisor_telefone: string | null;
  decisor_instagram: string | null;
  estagio: Estagio;
  etapa_pipeline: string | null;
  owner: Owner;
  modo_agente: ModoAgente;
  pausado_ate: string | null;
  precisa_humano: boolean;
  motivo_humano: string | null;
  next_action_type: string | null;
  next_action_at: string | null;
  next_action_owner: string | null;
  next_action_reason: string | null;
  ultima_interacao_em: string | null;
  ultima_msg_de: string | null;
  followups: number;
  cadencia_cancelada: boolean;
  contexto_comercial: { resumo?: string; objecao?: string; motivo_retorno?: string; proxima_abordagem?: string; retornar_em?: string; pos_automacao_em?: string };
  objecoes: string[];
  gift_reserved: boolean;
  gift_type: string | null;
  gift_status: string | null;
  reuniao_em: string | null;
  reuniao_tipo: Modalidade | null;
  meeting_id: string | null;
  google_event_id: string | null;
  meet_url: string | null;
  crm_lead_id: string | null;
  resultado_reuniao: string | null;
  motivo_perda: string | null;
  variante_abordagem: string | null;
  primeira_abordagem_em: string | null;
  ranking_dia: string | null;
  ranking_pos: number | null;
  quality_gate: QualityGateResultado | null;
  origem: string | null;
  origem_query: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectMessageRow {
  id: string;
  prospect_id: string;
  direcao: "in" | "out";
  autor: "prospect" | "agente" | "humano";
  texto: string;
  message_id: string | null;
  intent: IntentLida | null;
  estagio_antes: string | null;
  estagio_depois: string | null;
  enviado: boolean;
  erro: string | null;
  correlation_id: string | null;
  dia: string;
  eh_primeira_abordagem: boolean;
  created_at: string;
}

export interface ProspectEventRow {
  id: string;
  prospect_id: string;
  tipo: string;
  de: string | null;
  para: string | null;
  motivo: string | null;
  mensagem: string | null;
  responsavel: string | null;
  proxima_acao: string | null;
  detalhe: Record<string, unknown> | null;
  created_at: string;
}

export interface CampanhaRow {
  id: string;
  nome: string;
  status: "draft" | "running" | "paused" | "completed";
  iniciado_em: string | null;
  termina_em: string | null;
  duracao_dias: number;
  limite_dia: number;
  auto_stop: boolean;
  janela_abordagem: { ini: string; fim: string };
  janela_resposta: { ini: string; fim: string };
  finalizado_em: string | null;
  finalizado_motivo: string | null;
  reativado_em: string | null;
  reativado_por: string | null;
  relatorio_final: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Empresa achada por um provider de descoberta, antes de virar linha em `prospects`. */
export interface Candidato {
  nome: string;
  cidade?: string | null;
  uf?: string | null;
  segmento?: string | null;
  cnpj?: string | null;
  site?: string | null;
  instagram?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  google_maps_url?: string | null;
  google_nota?: number | null;
  google_avaliacoes?: number | null;
  sinais?: string[];
  /** De onde cada campo veio ("web_search", "driva", "csv") — vai para `fontes`. */
  fonte: string;
  query?: string | null;
}
