export type Role = "admin" | "manager" | "traffic" | "social" | "designer" | "comercial";

// ── CRM comercial (SDR) ──────────────────────────────────────────────
// Funil: Lead → Orçamento → Proposta → Reunião → Ganho/Perdido.
export type CrmEstagio = "lead" | "orcamento" | "proposta" | "reuniao" | "ganho" | "perdido";
export const CRM_ESTAGIOS: CrmEstagio[] = ["lead", "orcamento", "proposta", "reuniao", "ganho", "perdido"];

export interface CrmLead {
  id: string;
  contatoNome: string;
  empresa: string | null;
  telefone: string | null;
  email: string | null;
  valorOrcamento: number | null;    // valor do orçamento em aberto (R$)
  estagio: CrmEstagio;
  origem: string | null;            // indicação, tráfego, prospecção…
  responsavel: string | null;       // o SDR dono do lead
  reuniaoData: string | null;       // YYYY-MM-DD (dia da reunião marcada)
  propostaEnviadaEm: string | null; // YYYY-MM-DD
  proximoContato: string | null;    // YYYY-MM-DD (follow-up do SDR)
  fechadoEm: string | null;         // ISO — quando foi ganho/perdido (base do relatório mensal)
  motivoPerda: string | null;       // quando estagio = perdido
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Atividade/histórico de um lead (timeline do SDR): ligação, mensagem, nota, e-mail, reunião,
// ou mudança de etapa (auto-registrada). Ver migration 066_crm_lead_activities.
export type CrmAtividadeTipo = "nota" | "ligacao" | "whatsapp" | "email" | "reuniao" | "etapa";
export interface CrmLeadActivity {
  id: string;
  leadId: string;
  tipo: CrmAtividadeTipo;
  texto: string;
  autor: string | null;
  createdAt: string;
}

// Meta mensal do comercial (SDR) — norte + progresso no dashboard. Ver migration 067.
export interface CrmMeta {
  mes: string;              // YYYY-MM
  metaValor: number | null; // meta de vendas (R$)
  metaLeads: number | null; // meta de leads novos
  updatedAt: string;
}

export type ClientStatus = "onboarding" | "good" | "average" | "at_risk";
export type AttentionLevel = "low" | "medium" | "high" | "critical";
export type Priority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "pending" | "in_progress" | "review" | "done";

export type TimelineEntryType =
  | "chat"
  | "task"
  | "status"
  | "content"
  | "design"
  | "report"
  | "manual"
  | "onboarding"
  | "meeting";

export type ToneOfVoice = "formal" | "funny" | "authoritative" | "casual";
export type MoodType = "happy" | "neutral" | "angry";

export type LeadSource = "indicacao" | "trafego" | "organico" | "outros";

export type ServiceType = "lone_growth" | "assessoria_trafego" | "assessoria_social" | "assessoria_design" | "trafego_social_site";
// Perfil de conteúdo (Playbook Social §4): video/completo = faz vídeo (quarta = Reels).
export type ContentProfile = "so_arte" | "video" | "completo";
export type DraftStatus = "pending_invite" | "awaiting_approval" | null;

export interface Client {
  id: string;
  name: string;
  logo?: string;
  industry: string;
  monthlyBudget: number;
  dailyBudget?: number;
  status: ClientStatus;
  /** Ciclo de vida: false = ex-cliente (churned). Distinto de `status` (saúde). */
  active?: boolean;
  /** Quando virou ex-cliente (ISO). Base das métricas de churn. */
  churnedAt?: string;
  /** Motivo do churn (opcional). */
  churnReason?: string;
  attentionLevel: AttentionLevel;
  /** Por que o status é o que é ("CPL R$ 25,60 acima do crítico"). Vem da rotina de sexta ou do arraste. */
  statusMotivo?: string | null;
  statusOrigem?: "auto" | "manual" | null;
  tags: string[];
  serviceType?: ServiceType;
  perfilConteudo?: ContentProfile; // só arte / vídeo / completo (Playbook §4)
  draftStatus?: DraftStatus;
  contactName?: string;
  contactRole?: string;
  idade?: string;
  nicho?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  endereco?: string;
  /** Telefone fixo da empresa. Diferente de `phone`, que é o WhatsApp do responsável. */
  companyPhone?: string;
  /** Telefone do responsável, quando não é o mesmo do WhatsApp. */
  contactPhone?: string;
  enderecoRua?: string;
  enderecoNumero?: string;
  enderecoBairro?: string;
  enderecoCidade?: string;
  enderecoEstado?: string;
  enderecoCep?: string;
  emailCorporativo?: string;
  docContratoSocial?: string;
  docIdentidade?: string;
  docLogo?: string;
  assignedTraffic: string;
  assignedSocial: string;
  assignedDesigner: string;
  lastPostDate?: string;
  joinDate: string;
  createdAt?: string; // ISO (created_at) — entrada real do cliente, p/ métrica "novos clientes/mês"
  paymentMethod: "pix" | "boleto" | "cartao" | "transferencia";
  notes?: string;
  contractEnd?: string;
  // Social Media dossier
  toneOfVoice?: ToneOfVoice;
  driveLink?: string;
  instagramUser?: string;
  postsThisMonth?: number;
  postsGoal?: number;
  lastKanbanActivity?: string;
  campaignBriefing?: string;
  fixedBriefing?: string;
  /** Agente CS ligado pra este cliente? false = pausa total (captação + vigilância). */
  agenteAtivo?: boolean;
  // Meta Ads
  metaAdAccountId?: string;
  metaAdAccountName?: string;
  // ─── Dados Pessoais (RBAC: admin only) ─────────────────
  cpfCnpj?: string;
  birthDate?: string;
  phone?: string;           // WhatsApp
  email?: string;            // Gmail de contato
  leadSource?: LeadSource;
  // ─── Cofre de Acessos (RBAC: admin + staff) ────────────
  facebookLogin?: string;
  facebookPassword?: string;
  googleAdsLogin?: string;
  googleAdsPassword?: string;
  instagramLogin?: string;
  instagramPassword?: string;
  budgetAlertPct?: number;
  firstValueDeliveredAt?: string;
  activatedAt?: string;
  ttvDays?: number;
  // ─── Portal Público de Resultados ──────────────────────
  /** Pausa temporária: não recebe nada, mas continua na carteira do time (23/09). */
  pausedAt?: string | null;
  pausedReason?: string | null;
  pausedUntil?: string | null;
  /** Saúde unificada (100 = saudável), gravada só por /api/scores. null = sem dado suficiente. */
  currentHealthScore?: number | null;
  currentHealthLevel?: "saudavel" | "atencao" | "risco" | "sem_dado" | null;
  pausedBy?: string | null;
  publicReportToken?: string;
  publicReportTokenCreatedAt?: string;
  publicReportTokenRevokedAt?: string;
  publicReportEnabled?: boolean;
  whatsappTeamPhone?: string;
  portalWelcomeMessage?: string;
  // ─── Ficha Viva (link do cliente: crescimento + diagnóstico) ──────────
  fichaVivaToken?: string;
  fichaVivaRaioxToken?: string;
  fichaVivaTokenCreatedAt?: string;
  fichaVivaTokenRevokedAt?: string;
  fichaVivaEnabled?: boolean;
}

export interface MoodEntry {
  id: string;
  mood: MoodType;
  note?: string;
  recordedBy: string;
  date: string;
}

export interface CreativeAsset {
  id: string;
  clientId: string;
  type: "reference" | "palette" | "typography" | "logo";
  url: string;
  label?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Task {
  id: string;
  title: string;
  clientId: string;           // "" = tarefa geral (sem cliente)
  clientName: string;         // "" = sem cliente
  assignedTo: string;         // NOME do colaborador (bate com currentUser / assigned_social)
  role: Role;
  status: TaskStatus;
  priority: Priority;
  startDate?: string;
  dueDate?: string;
  description?: string;
  createdBy?: string;         // quem criou a tarefa
  attachments?: string[];
  // Timesheet Invisível
  workStartedAt?: string;          // ISO — when work started (in_progress)
  totalTimeSpentMs?: number;       // accumulated milliseconds of active work
}

export interface Reminder {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  description?: string;
  createdBy: string;
  clientId?: string;
  clientName?: string;
  done: boolean;
}

export type SocialPlatform = "instagram" | "tiktok" | "linkedin" | "youtube" | "facebook";

export interface ContentCard {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  socialMedia: string;
  status: "ideas" | "script" | "in_production" | "blocked" | "approval" | "client_approval" | "scheduled" | "published";
  blockedReason?: string;
  blockedBy?: string;
  blockedAt?: string;
  priority: Priority;
  dueDate?: string;
  dueTime?: string;       // "HH:mm" — posting time
  format: string;
  platform?: SocialPlatform;
  briefing?: string;
  caption?: string;
  hashtags?: string;
  imageUrl?: string;                  // capa do card — arte legada única OU 1ª arte dos anexos (preenchida no fetch)
  cardAttachments?: CardAttachment[]; // multi-arte — carregado em lote por fetchContentCards
  observations?: string;
  trafficSuggestion?: string;
  archivedAt?: string;      // ISO — soft-delete ("arquivar"); some das visões ativas mas fica no banco
  statusChangedAt?: string; // ISO datetime — tracks SLA per column
  columnEnteredAt?: Record<string, string>; // maps status → ISO timestamp of when card entered that column
  comments?: CardComment[];
  designRequestId?: string; // links to DesignRequest for designer tracking
  // Handoff tracking
  designerDeliveredAt?: string; // ISO — when designer uploaded the art
  designerDeliveredBy?: string; // designer name
  socialConfirmedAt?: string;   // ISO — when social media confirmed receipt
  socialConfirmedBy?: string;   // social media name
  clientApprovedAt?: string;    // ISO — when the CLIENT approved (via portal ou WhatsApp) → pode postar
  // Non-delivery tracking
  nonDeliveryReason?: string;   // reason when card wasn't delivered on time
  nonDeliveryReportedBy?: string;
  nonDeliveryReportedAt?: string;
  // Traffic request — when traffic manager requests content
  requestedByTraffic?: string;     // traffic manager name
  trafficRequestNote?: string;     // briefing/reason from traffic
  trafficRequestAt?: string;       // ISO datetime
  // Post verification — confirms scheduled post actually went live
  scheduledAt?: string;            // ISO — when card moved to "scheduled"
  publishVerifiedAt?: string;      // ISO — when social confirmed post is live
  publishVerifiedBy?: string;      // who verified
  publishVerifyChecks?: {          // checklist items
    postLive: boolean;             // post está no ar
    copyCorrect: boolean;          // copy/legenda correta
  };
  // "No ar" automático (Leva 5a): o post do Instagram que fechou o card. Vazio antes da migration
  // 20260924190000 ou quando alguém fechou à mão.
  igMediaId?: string;
  igPermalink?: string;
  // Etapa de design (Leva 5b): alteração pedida e ainda não reentregue. Grava "pedir alteração"
  // (social, cliente no portal ou no WhatsApp); a entrega zera.
  alteracaoPendenteEm?: string;
  alteracaoMotivo?: string;
  // Timesheet Invisível
  workStartedAt?: string;          // ISO — when work started (in_production)
  totalTimeSpentMs?: number;       // accumulated milliseconds of active work
}

// Espelha as linhas de card_attachments como vêm da API (snake_case cru do banco).
export interface CardAttachment {
  id: string;
  card_id: string;
  url: string;
  path: string;
  position: number;
  created_at: string; // ISO
  /**
   * O que este anexo É. Antes referência e entrega ficavam iguais no banco, e a publicação
   * automática mandava a referência pro Instagram do cliente achando que era a arte final.
   * `null` = legado, anexado antes desta separação — a publicação recusa e pede classificação.
   */
  tipo?: "referencia" | "entrega" | null;
}

// Do's & don'ts estruturados do Agente CS (tabela cs_client_rules).
export type CsRuleEscopo = "sempre" | "promocao" | "arte" | "social" | "trafego" | "roteiro";
export interface CsClientRule {
  id: string;
  clientId: string;
  texto: string;
  escopo: CsRuleEscopo;
  origem: "manual" | "aprendido";
  ativo: boolean;
  createdAt: string; // ISO
}

export interface CardComment {
  id: string;
  author: string;
  role: Role;
  text: string;
  createdAt: string; // ISO
}

export interface DesignRequest {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  requestedBy: string;
  priority: Priority;
  status: "queued" | "in_progress" | "done";
  format: string;
  briefing: string;
  attachments?: string[];
  contentCardId?: string;
  deadline?: string;
  createdAt?: string;
  designerNote?: string; // comentário/pedido do designer (ex.: "briefing incompleto") — o social vê
  /** Designer dono desta demanda. Vazio = herda de clients.assignedDesigner (a carteira).
   *  Preenchido só quando alguém assume uma demanda que não é da sua carteira. */
  assignedDesigner?: string;
  /** Briefing enriquecido por IA: regras visuais do cliente + o que já foi reprovado antes.
   *  Gerado sozinho na criação do pedido; fica AO LADO do briefing do social, não no lugar. */
  briefingIa?: string;
  /** "humano" | "ia_replicacao" — de onde a demanda veio (Creative Intelligence). */
  origem?: string;
  /** Anúncio pai (Meta ad id) quando é variação replicada de um vencedor. */
  parentAdId?: string | null;
  variavel?: string | null;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: string;
  urgent: boolean;
  scheduledAt?: string; // ISO — for alerts like "meeting at 14:00"
  category?: "general" | "meeting" | "deadline" | "reminder";
}

export interface QuinzReport {
  id: string;
  clientId: string;
  clientName: string;
  period: string;
  createdBy: string;
  createdAt: string;
  communicationHealth: number; // 1-5
  clientEngagement: number; // 1-5
  highlights: string;
  challenges: string;
  nextSteps: string;
}

// --- New types for v2 features ---

export interface TimelineEntry {
  id: string;
  clientId: string;
  type: TimelineEntryType;
  actor: string;
  description: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: string;
}

export interface OnboardingItem {
  id: string;
  label: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  department?: "traffic" | "design" | "social";
}

// --- Client Access / Credentials (non-financial) ---

export interface ClientAccess {
  clientId: string;
  instagramLogin?: string;
  /** @deprecated Use external vault. Stored as masked hint only (e.g. "****56") */
  instagramPassword?: string;
  facebookLogin?: string;
  /** @deprecated Use external vault. */
  facebookPassword?: string;
  tiktokLogin?: string;
  /** @deprecated Use external vault. */
  tiktokPassword?: string;
  linkedinLogin?: string;
  /** @deprecated Use external vault. */
  linkedinPassword?: string;
  youtubeLogin?: string;
  /** @deprecated Use external vault. */
  youtubePassword?: string;
  mlabsLogin?: string;
  /** @deprecated Use external vault. */
  mlabsPassword?: string;
  canvaLink?: string;
  driveLink?: string;
  otherNotes?: string;
  updatedBy?: string;
  updatedAt?: string;
}

// --- Social team auth ---

export interface SocialTeamMember {
  id: string;
  name: string;
  password: string;
}

// --- Fase 3: New strategic features ---

export interface SocialProofEntry {
  id: string;
  clientId: string;
  metric1Label: string;
  metric1Value: string;
  metric2Label: string;
  metric2Value: string;
  metric3Label: string;
  metric3Value: string;
  period: string;
  createdBy: string;
  createdAt: string;
}

// --- Traffic Routine Checks ---

export interface TrafficRoutineCheck {
  id: string;
  clientId: string;
  clientName: string;
  date: string;            // "2026-03-21"
  type: "support" | "report" | "feedback" | "analysis";
  completedBy: string;
  completedAt: string;
  note?: string;
}

// --- Content Approval ---

export interface ContentApproval {
  id: string;
  cardId: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  reason?: string;
}

// --- Social Media Performance Score ---

export type PerformanceLevel = "excellent" | "good" | "warning" | "critical";

export interface SocialPerformanceScore {
  socialMedia: string;
  totalClients: number;
  totalPostsGoal: number;
  totalPostsDelivered: number;
  overallRate: number;       // % across all clients
  level: PerformanceLevel;   // excellent >=95, good >=80, warning >=70, critical <70
  clientBreakdown: {
    clientId: string;
    clientName: string;
    goal: number;
    delivered: number;
    rate: number;
  }[];
}

// --- Notifications ---

export type NotificationType = "sla" | "status" | "content" | "checkin" | "system";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  clientId?: string;
  cardId?: string; // se a notificação é sobre um card, o clique abre /social?card=<cardId>
  read: boolean;
  createdAt: string; // ISO
}

// --- Ad Analytics (Meta Ads mock — Phase 1) ---

export type AdObjective = "messages" | "traffic" | "conversions" | "reach" | "engagement" | "leads";
export type AdStatus = "active" | "paused" | "completed" | "error";

export interface AdAccount {
  id: string;
  clientId: string;
  clientName: string;
  platform: "meta" | "google";
  accountId: string;
  accountName: string;
  currency: "BRL";
}

export interface AdCampaign {
  id: string;
  accountId: string;
  clientId: string;
  clientName: string;
  name: string;
  objective: AdObjective;
  status: AdStatus;
  dailyBudget: number;
  totalBudget: number;
  startDate: string;
  endDate?: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  costPerConversion: number;
  messages?: number;
  costPerMessage?: number;
  cheapestAdSetCostPerMessage?: number;
  cheapestAdSetName?: string;
  leads?: number;
  costPerLead?: number;
  // "result" = the primary KPI for this campaign's objective
  results?: number;
  costPerResult?: number;
  frequency?: number;
  dailyMetrics: AdDailyMetric[];
  // Data quality flags
  hasData?: boolean;          // false if API returned no insights
  insightsFailed?: boolean;   // a leitura da Meta falhou: mostrar "sem dados", nunca R$0
  lastSyncAt?: string;        // ISO timestamp of when data was fetched
}

export interface AdDailyMetric {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  messages?: number;
  leads?: number;
}

// ─── OKRs ──────────────────────────────────────────────────────
export type OKRStatus = "on_track" | "at_risk" | "off_track";

export interface OKR {
  id: string;
  title: string;
  team: string;
  target: number;
  current: number;
  unit: string;
  quarter: string;
  status: OKRStatus;
}

// ─── Delivery Log (BI/Performance tracking) ────────────────
export interface DeliveryLog {
  id: string;
  userId: string;
  clientId: string;
  clientName: string;
  cardId: string;
  cardTitle: string;
  taskType: "design" | "content" | "traffic" | "task";
  action: "delivered" | "published" | "approved" | "completed";
  leadTimeMs: number;    // time from card creation to this action
  timestamp: string;
}
