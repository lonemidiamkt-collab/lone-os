export type Role = "admin" | "manager" | "traffic" | "social" | "designer";

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

export interface Client {
  id: string;
  name: string;
  logo?: string;
  industry: string;
  monthlyBudget: number;
  status: ClientStatus;
  attentionLevel: AttentionLevel;
  tags: string[];
  assignedTraffic: string;
  assignedSocial: string;
  assignedDesigner: string;
  lastPostDate?: string;
  joinDate: string;
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
  clientId: string;
  clientName: string;
  assignedTo: string;
  role: Role;
  status: TaskStatus;
  priority: Priority;
  startDate?: string;
  dueDate?: string;
  description?: string;
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
  imageUrl?: string;
  observations?: string;
  trafficSuggestion?: string;
  statusChangedAt?: string; // ISO datetime — tracks SLA per column
  columnEnteredAt?: Record<string, string>; // maps status → ISO timestamp of when card entered that column
  comments?: CardComment[];
  designRequestId?: string; // links to DesignRequest for designer tracking
  // Handoff tracking
  designerDeliveredAt?: string; // ISO — when designer uploaded the art
  designerDeliveredBy?: string; // designer name
  socialConfirmedAt?: string;   // ISO — when social media confirmed receipt
  socialConfirmedBy?: string;   // social media name
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
  // Timesheet Invisível
  workStartedAt?: string;          // ISO — when work started (in_production)
  totalTimeSpentMs?: number;       // accumulated milliseconds of active work
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
  deadline?: string;
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

export interface GlobalChatMessage {
  id: string;
  user: string;
  role: Role;
  text: string;
  timestamp: string;
}

export interface OnboardingItem {
  id: string;
  label: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
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

export interface CrisisNote {
  id: string;
  clientId: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

// --- Traffic Monthly Reports ---

export interface TrafficMonthlyReport {
  id: string;
  clientId: string;
  clientName: string;
  month: string; // "2026-01", "2026-02", etc.
  createdBy: string;
  createdAt: string;
  // Core metrics
  messages: number;        // mensagens / leads
  messageCost: number;     // custo por mensagem/lead
  impressions: number;     // visualizações/impressões
  observations?: string;   // notas do gestor
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

// --- Social Monthly Reports ---

export interface SocialMonthlyReport {
  id: string;
  clientId: string;
  clientName: string;
  month: string;
  createdBy: string;
  createdAt: string;
  postsPublished: number;
  postsGoal: number;
  reelsCount: number;
  storiesCount: number;
  reach: number;
  impressions: number;
  engagement: number;       // total interactions
  engagementRate: number;   // %
  followersGained: number;
  followersLost: number;
  topPost?: string;
  observations?: string;
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

// --- Social Media Monthly Delivery Report (auto-generated) ---

export interface MonthlyDeliveryReport {
  id: string;
  clientId: string;
  clientName: string;
  socialMedia: string;       // who was responsible
  month: string;             // "2026-01", "2026-02"
  postsGoal: number;         // expected deliveries
  postsDelivered: number;    // actual published count
  completionRate: number;    // % (delivered/goal * 100)
  cardsByStatus: {
    published: number;
    scheduled: number;
    inProduction: number;
    ideas: number;
  };
  formats: { format: string; count: number }[];  // breakdown by format
  generatedAt: string;       // ISO when report was auto-generated
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
  read: boolean;
  createdAt: string; // ISO
}

// --- Client Investment Control ---

export type InvestmentPaymentMethod = "pix" | "boleto" | "cartao";

export interface ClientInvestmentData {
  clientId: string;
  monthlyBudget: number;       // Investimento mensal total (R$)
  dailyBudget: number;         // Valor diário calculado (R$)
  paymentMethod: InvestmentPaymentMethod;
  nextPaymentDate?: string;    // "YYYY-MM-DD" — relevante para PIX/Boleto
  updatedBy?: string;
  updatedAt?: string;
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
  leads?: number;
  costPerLead?: number;
  // "result" = the primary KPI for this campaign's objective
  results?: number;
  costPerResult?: number;
  frequency?: number;
  dailyMetrics: AdDailyMetric[];
  // Data quality flags
  hasData?: boolean;          // false if API returned no insights
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

// ─── Automations ───────────────────────────────────────────────
export type AutomationTrigger =
  | "client_status_change"
  | "task_overdue"
  | "content_approval_pending"
  | "budget_threshold"
  | "onboarding_stalled";

export type AutomationAction =
  | "send_notification"
  | "assign_task"
  | "change_status"
  | "send_chat_message";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  triggerConfig: Record<string, string>;
  action: AutomationAction;
  actionConfig: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  triggerCount: number;
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
