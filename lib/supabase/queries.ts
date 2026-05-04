import { supabase } from "./client";
import type {
  Client, Task, ContentCard, DesignRequest, AppNotification,
  TimelineEntry, ChatMessage, GlobalChatMessage, OnboardingItem,
  MoodEntry, MoodType, CreativeAsset, SocialProofEntry, CrisisNote,
  Notice, QuinzReport, ClientAccess, TrafficMonthlyReport,
  TrafficRoutineCheck, SocialMonthlyReport, ContentApproval,
  Role,
} from "@/lib/types";

// SENHAS DE PLATAFORMA (facebookPassword, instagramPassword, googleAdsPassword)
// NÃO viajam mais pelo estado do Client. São lidas server-side via /api/client-vault/reveal
// quando admin clica em "mostrar senha". Isso previne:
//   - Senha ficar em memória do browser sem necessidade
//   - Supabase RLS leak hipotético (se RLS relaxar algum dia)
//   - Chance de vazamento via React DevTools / state inspection
// snakeToClient continua recebendo a coluna do banco mas DESCARTA o valor da senha.

// ═══════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════

function snakeToClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    name: row.name as string,
    logo: (row.logo as string) ?? undefined,
    industry: (row.industry as string) ?? "Outro",
    monthlyBudget: Number(row.monthly_budget ?? 0),
    status: (row.status as Client["status"]) ?? "onboarding",
    attentionLevel: (row.attention_level as Client["attentionLevel"]) ?? "medium",
    tags: (row.tags as string[]) ?? [],
    assignedTraffic: (row.assigned_traffic as string) ?? "",
    assignedSocial: (row.assigned_social as string) ?? "",
    assignedDesigner: (row.assigned_designer as string) ?? "",
    lastPostDate: (row.last_post_date as string) ?? undefined,
    joinDate: (row.join_date as string) ?? new Date().toISOString().slice(0, 10),
    paymentMethod: (row.payment_method as Client["paymentMethod"]) ?? "pix",
    notes: (row.notes as string) ?? undefined,
    contractEnd: (row.contract_end as string) ?? undefined,
    toneOfVoice: (row.tone_of_voice as Client["toneOfVoice"]) ?? undefined,
    driveLink: (row.drive_link as string) ?? undefined,
    instagramUser: (row.instagram_user as string) ?? undefined,
    postsThisMonth: (row.posts_this_month as number) ?? 0,
    postsGoal: (row.posts_goal as number) ?? 12,
    serviceType: (row.service_type as Client["serviceType"]) ?? "lone_growth",
    draftStatus: (row.draft_status as Client["draftStatus"]) ?? null,
    contactName: (row.contact_name as string) ?? undefined,
    contactRole: (row.contact_role as string) ?? undefined,
    idade: (row.idade as string) ?? undefined,
    nicho: (row.nicho as string) ?? undefined,
    razaoSocial: (row.razao_social as string) ?? undefined,
    nomeFantasia: (row.nome_fantasia as string) ?? undefined,
    cnpj: (row.cnpj as string) ?? undefined,
    endereco: (row.endereco as string) ?? undefined,
    enderecoRua: (row.endereco_rua as string) ?? undefined,
    enderecoNumero: (row.endereco_numero as string) ?? undefined,
    enderecoBairro: (row.endereco_bairro as string) ?? undefined,
    enderecoCidade: (row.endereco_cidade as string) ?? undefined,
    enderecoEstado: (row.endereco_estado as string) ?? undefined,
    enderecoCep: (row.endereco_cep as string) ?? undefined,
    emailCorporativo: (row.email_corporativo as string) ?? undefined,
    docContratoSocial: (row.doc_contrato_social as string) ?? undefined,
    docIdentidade: (row.doc_identidade as string) ?? undefined,
    docLogo: (row.doc_logo as string) ?? undefined,
    lastKanbanActivity: (row.last_kanban_activity as string) ?? undefined,
    campaignBriefing: (row.campaign_briefing as string) ?? undefined,
    fixedBriefing: (row.fixed_briefing as string) ?? undefined,
    metaAdAccountId: (row.meta_ad_account_id as string) ?? undefined,
    metaAdAccountName: (row.meta_ad_account_name as string) ?? undefined,
    cpfCnpj: (row.cpf_cnpj as string) ?? undefined,
    birthDate: (row.birth_date as string) ?? undefined,
    phone: (row.phone as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    leadSource: (row.lead_source as Client["leadSource"]) ?? undefined,
    facebookLogin: (row.facebook_login as string) ?? undefined,
    // Senhas NÃO saem do banco pelo caminho do estado. Admin chama /api/client-vault/reveal quando precisar.
    facebookPassword: undefined,
    googleAdsLogin: (row.google_ads_login as string) ?? undefined,
    googleAdsPassword: undefined,
    instagramLogin: (row.instagram_login as string) ?? undefined,
    instagramPassword: undefined,
    budgetAlertPct: (row.budget_alert_pct as number) ?? undefined,
    npsScore: (row.nps_score as number) ?? undefined,
    firstValueDeliveredAt: (row.first_value_delivered_at as string) ?? undefined,
    activatedAt: (row.activated_at as string) ?? undefined,
    ttvDays: (row.ttv_days as number) ?? undefined,
  };
}

function clientToSnake(c: Partial<Client>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.logo !== undefined) row.logo = c.logo;
  if (c.industry !== undefined) row.industry = c.industry;
  if (c.monthlyBudget !== undefined) row.monthly_budget = c.monthlyBudget;
  if (c.status !== undefined) row.status = c.status;
  if (c.attentionLevel !== undefined) row.attention_level = c.attentionLevel;
  if (c.tags !== undefined) row.tags = c.tags;
  if (c.paymentMethod !== undefined) row.payment_method = c.paymentMethod;
  if (c.joinDate !== undefined) row.join_date = c.joinDate;
  if (c.contractEnd !== undefined) row.contract_end = c.contractEnd;
  if (c.lastPostDate !== undefined) row.last_post_date = c.lastPostDate;
  if (c.notes !== undefined) row.notes = c.notes;
  if (c.assignedTraffic !== undefined) row.assigned_traffic = c.assignedTraffic;
  if (c.assignedSocial !== undefined) row.assigned_social = c.assignedSocial;
  if (c.assignedDesigner !== undefined) row.assigned_designer = c.assignedDesigner;
  if (c.toneOfVoice !== undefined) row.tone_of_voice = c.toneOfVoice;
  if (c.driveLink !== undefined) row.drive_link = c.driveLink;
  if (c.instagramUser !== undefined) row.instagram_user = c.instagramUser;
  if (c.postsThisMonth !== undefined) row.posts_this_month = c.postsThisMonth;
  if (c.postsGoal !== undefined) row.posts_goal = c.postsGoal;
  if (c.serviceType !== undefined) row.service_type = c.serviceType;
  if (c.draftStatus !== undefined) row.draft_status = c.draftStatus;
  if (c.contactName !== undefined) row.contact_name = c.contactName;
  if (c.contactRole !== undefined) row.contact_role = c.contactRole;
  if (c.idade !== undefined) row.idade = c.idade;
  if (c.nicho !== undefined) row.nicho = c.nicho;
  if (c.razaoSocial !== undefined) row.razao_social = c.razaoSocial;
  if (c.nomeFantasia !== undefined) row.nome_fantasia = c.nomeFantasia;
  if (c.cnpj !== undefined) row.cnpj = c.cnpj;
  if (c.endereco !== undefined) row.endereco = c.endereco;
  if (c.enderecoRua !== undefined) row.endereco_rua = c.enderecoRua;
  if (c.enderecoNumero !== undefined) row.endereco_numero = c.enderecoNumero;
  if (c.enderecoBairro !== undefined) row.endereco_bairro = c.enderecoBairro;
  if (c.enderecoCidade !== undefined) row.endereco_cidade = c.enderecoCidade;
  if (c.enderecoEstado !== undefined) row.endereco_estado = c.enderecoEstado;
  if (c.enderecoCep !== undefined) row.endereco_cep = c.enderecoCep;
  if (c.emailCorporativo !== undefined) row.email_corporativo = c.emailCorporativo;
  if (c.docContratoSocial !== undefined) row.doc_contrato_social = c.docContratoSocial;
  if (c.docIdentidade !== undefined) row.doc_identidade = c.docIdentidade;
  if (c.docLogo !== undefined) row.doc_logo = c.docLogo;
  if (c.lastKanbanActivity !== undefined) row.last_kanban_activity = c.lastKanbanActivity;
  if (c.campaignBriefing !== undefined) row.campaign_briefing = c.campaignBriefing;
  if (c.fixedBriefing !== undefined) row.fixed_briefing = c.fixedBriefing;
  if (c.metaAdAccountId !== undefined) row.meta_ad_account_id = c.metaAdAccountId;
  if (c.metaAdAccountName !== undefined) row.meta_ad_account_name = c.metaAdAccountName;
  if (c.cpfCnpj !== undefined) row.cpf_cnpj = c.cpfCnpj;
  if (c.birthDate !== undefined) row.birth_date = c.birthDate;
  if (c.phone !== undefined) row.phone = c.phone;
  if (c.email !== undefined) row.email = c.email;
  if (c.leadSource !== undefined) row.lead_source = c.leadSource;
  if (c.facebookLogin !== undefined) row.facebook_login = c.facebookLogin;
  // Senhas NÃO são escritas via updateClientDb (que roda no browser sem o VAULT_KEY).
  // Admin edita via /api/client-vault/update que faz encrypt server-side antes de persistir.
  // Se alguém tentar burlar passando facebookPassword, é ignorado (defense in depth).
  if (c.googleAdsLogin !== undefined) row.google_ads_login = c.googleAdsLogin;
  // google_ads_password: via /api/client-vault/update
  if (c.instagramLogin !== undefined) row.instagram_login = c.instagramLogin;
  // instagram_password: via /api/client-vault/update
  return row;
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select("*").is("draft_status", null).order("name");
  if (error) { console.error("[DB] fetchClients:", error); return []; }
  return (data ?? []).map(snakeToClient);
}

export async function fetchDraftClients(): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select("*").not("draft_status", "is", null).order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchDraftClients:", error); return []; }
  return (data ?? []).map(snakeToClient);
}

export async function insertClient(client: Omit<Client, "id"> & { id?: string }): Promise<{ id: string }> {
  const row = clientToSnake(client as Partial<Client>);
  row.join_date = client.joinDate ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from("clients").insert(row).select("id").single();
  if (error) { console.error("[DB] insertClient:", error); throw error; }
  return { id: data.id as string };
}

export async function updateClientDb(id: string, updates: Partial<Client>): Promise<void> {
  const row = clientToSnake(updates);
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("clients").update(row).eq("id", id);
  if (error) console.error("[DB] updateClient:", error);
}

// ═══════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════

function snakeToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    assignedTo: row.assigned_to as string,
    role: row.role as Task["role"],
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    startDate: (row.start_date as string) ?? undefined,
    dueDate: (row.due_date as string) ?? undefined,
    description: (row.description as string) ?? undefined,
    workStartedAt: (row.work_started_at as string) ?? undefined,
    totalTimeSpentMs: (row.total_time_spent_ms as number) ?? 0,
  };
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchTasks:", error); return []; }
  return (data ?? []).map(snakeToTask);
}

export async function insertTask(task: Omit<Task, "id">): Promise<{ id: string }> {
  const { data, error } = await supabase.from("tasks").insert({
    title: task.title,
    client_id: task.clientId,
    client_name: task.clientName,
    assigned_to: task.assignedTo,
    role: task.role,
    status: task.status ?? "pending",
    priority: task.priority ?? "medium",
    start_date: task.startDate,
    due_date: task.dueDate,
    description: task.description,
  }).select("id").single();
  if (error) { console.error("[DB] insertTask:", error); throw error; }
  return { id: data.id as string };
}

export async function updateTaskDb(id: string, updates: Partial<Task>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (updates.assignedTo !== undefined) row.assigned_to = updates.assignedTo;
  if (updates.dueDate !== undefined) row.due_date = updates.dueDate;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.workStartedAt !== undefined) row.work_started_at = updates.workStartedAt;
  if (updates.totalTimeSpentMs !== undefined) row.total_time_spent_ms = updates.totalTimeSpentMs;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("tasks").update(row).eq("id", id);
  if (error) console.error("[DB] updateTask:", error);
}

// ═══════════════════════════════════════════════════════════
// CONTENT CARDS
// ═══════════════════════════════════════════════════════════

export function snakeToContentCard(row: Record<string, unknown>): ContentCard {
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    socialMedia: (row.social_media as string) ?? "",
    status: (row.status as ContentCard["status"]) ?? "ideas",
    priority: (row.priority as ContentCard["priority"]) ?? "medium",
    format: (row.format as string) ?? "",
    platform: (row.platform as ContentCard["platform"]) ?? undefined,
    dueDate: (row.due_date as string) ?? undefined,
    dueTime: (row.due_time as string) ?? undefined,
    briefing: (row.briefing as string) ?? undefined,
    caption: (row.caption as string) ?? undefined,
    hashtags: (row.hashtags as string) ?? undefined,
    imageUrl: (row.image_url as string) ?? undefined,
    observations: (row.observations as string) ?? undefined,
    statusChangedAt: (row.status_changed_at as string) ?? undefined,
    columnEnteredAt: (row.column_entered_at as Record<string, string>) ?? undefined,
    designRequestId: (row.design_request_id as string) ?? undefined,
    designerDeliveredAt: (row.designer_delivered_at as string) ?? undefined,
    designerDeliveredBy: (row.designer_delivered_by as string) ?? undefined,
    socialConfirmedAt: (row.social_confirmed_at as string) ?? undefined,
    socialConfirmedBy: (row.social_confirmed_by as string) ?? undefined,
    nonDeliveryReason: (row.non_delivery_reason as string) ?? undefined,
    nonDeliveryReportedBy: (row.non_delivery_reported_by as string) ?? undefined,
    nonDeliveryReportedAt: (row.non_delivery_reported_at as string) ?? undefined,
    workStartedAt: (row.work_started_at as string) ?? undefined,
    totalTimeSpentMs: (row.total_time_spent_ms as number) ?? 0,
    publishVerifiedAt: (row.publish_verified_at as string) ?? undefined,
    publishVerifiedBy: (row.publish_verified_by as string) ?? undefined,
    requestedByTraffic: (row.requested_by_traffic as string) ?? undefined,
    trafficSuggestion: (row.traffic_suggestion as string) ?? undefined,
  };
}

export async function fetchContentCards(): Promise<ContentCard[]> {
  const { data, error } = await supabase.from("content_cards").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchContentCards:", error); return []; }
  // Also load comments for each card
  const cards = (data ?? []).map(snakeToContentCard);
  if (cards.length > 0) {
    const { data: comments } = await supabase.from("card_comments").select("*").order("created_at");
    if (comments) {
      const commentMap = new Map<string, Array<{ id: string; author: string; role: Role; text: string; createdAt: string }>>();
      for (const c of comments) {
        const cardId = c.card_id as string;
        if (!commentMap.has(cardId)) commentMap.set(cardId, []);
        commentMap.get(cardId)!.push({
          id: c.id as string,
          author: c.author as string,
          role: (c.role as Role) ?? "social",
          text: c.text as string,
          createdAt: c.created_at as string,
        });
      }
      for (const card of cards) {
        if (commentMap.has(card.id)) {
          card.comments = commentMap.get(card.id);
        }
      }
    }
  }
  return cards;
}

export async function insertContentCard(card: Omit<ContentCard, "id">): Promise<{ id: string }> {
  const { data, error } = await supabase.from("content_cards").insert({
    title: card.title,
    client_id: card.clientId,
    client_name: card.clientName,
    social_media: card.socialMedia,
    status: card.status ?? "ideas",
    priority: card.priority ?? "medium",
    format: card.format,
    platform: card.platform,
    due_date: card.dueDate,
    due_time: card.dueTime,
    briefing: card.briefing,
    caption: card.caption,
    requested_by_traffic: card.requestedByTraffic,
    status_changed_at: new Date().toISOString(),
    column_entered_at: { [card.status ?? "ideas"]: new Date().toISOString() },
  }).select("id").single();
  if (error) { console.error("[DB] insertContentCard:", error); throw error; }
  return { id: data.id as string };
}

export async function updateContentCardDb(id: string, updates: Record<string, unknown>): Promise<{ error: Error | null }> {
  const row: Record<string, unknown> = {};
  const keyMap: Record<string, string> = {
    status: "status", priority: "priority", imageUrl: "image_url",
    statusChangedAt: "status_changed_at", columnEnteredAt: "column_entered_at",
    designRequestId: "design_request_id", designerDeliveredAt: "designer_delivered_at",
    designerDeliveredBy: "designer_delivered_by", socialConfirmedAt: "social_confirmed_at",
    socialConfirmedBy: "social_confirmed_by", caption: "caption", hashtags: "hashtags",
    observations: "observations", platform: "platform", dueDate: "due_date",
    nonDeliveryReason: "non_delivery_reason", nonDeliveryReportedBy: "non_delivery_reported_by",
    nonDeliveryReportedAt: "non_delivery_reported_at", workStartedAt: "work_started_at",
    totalTimeSpentMs: "total_time_spent_ms", publishVerifiedAt: "publish_verified_at",
    publishVerifiedBy: "publish_verified_by",
    blockedReason: "blocked_reason", blockedBy: "blocked_by", blockedAt: "blocked_at",
    scheduledAt: "scheduled_at", requestedByTraffic: "requested_by_traffic",
    trafficSuggestion: "traffic_suggestion", lastKanbanActivity: "last_kanban_activity",
  };
  for (const [key, val] of Object.entries(updates)) {
    const dbKey = keyMap[key] ?? key;
    row[dbKey] = val;
  }
  if (Object.keys(row).length === 0) return { error: null };
  const { error } = await supabase.from("content_cards").update(row).eq("id", id);
  if (error) console.error("[DB] updateContentCard:", error);
  return { error: error ? new Error(error.message) : null };
}

// ═══════════════════════════════════════════════════════════
// DESIGN REQUESTS
// ═══════════════════════════════════════════════════════════

export async function fetchDesignRequests(): Promise<DesignRequest[]> {
  const { data, error } = await supabase.from("design_requests").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchDesignRequests:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    requestedBy: row.requested_by as string,
    priority: (row.priority as DesignRequest["priority"]) ?? "medium",
    status: (row.status as DesignRequest["status"]) ?? "queued",
    format: (row.format as string) ?? "",
    briefing: (row.briefing as string) ?? "",
    deadline: (row.deadline as string) ?? undefined,
  }));
}

export async function insertDesignRequest(req: Omit<DesignRequest, "id">): Promise<{ id: string }> {
  const { data, error } = await supabase.from("design_requests").insert({
    title: req.title,
    client_id: req.clientId,
    client_name: req.clientName,
    requested_by: req.requestedBy,
    priority: req.priority,
    status: req.status ?? "queued",
    format: req.format,
    briefing: req.briefing,
    deadline: req.deadline,
  }).select("id").single();
  if (error) { console.error("[DB] insertDesignRequest:", error); throw error; }
  return { id: data.id as string };
}

export async function updateDesignRequestDb(id: string, updates: Partial<DesignRequest>): Promise<{ error: Error | null }> {
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.priority !== undefined) row.priority = updates.priority;
  if (Object.keys(row).length === 0) return { error: null };
  const { error } = await supabase.from("design_requests").update(row).eq("id", id);
  if (error) console.error("[DB] updateDesignRequest:", error);
  return { error: error ? new Error(error.message) : null };
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) { console.error("[DB] fetchNotifications:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: (row.type as AppNotification["type"]) ?? "system",
    title: row.title as string,
    body: (row.body as string) ?? "",
    clientId: (row.client_id as string) ?? undefined,
    read: (row.read as boolean) ?? false,
    createdAt: row.created_at as string,
  }));
}

export async function insertNotification(n: { type: string; title: string; body?: string; clientId?: string; read?: boolean }): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    type: n.type, title: n.title, body: n.body,
    client_id: n.clientId, read: false,
  });
  if (error) console.error("[DB] insertNotification:", error);
}

export async function markNotificationReadDb(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) console.error("[DB] markNotificationRead:", error);
}

export async function markAllNotificationsReadDb(): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
  if (error) console.error("[DB] markAllNotificationsRead:", error);
}

// ═══════════════════════════════════════════════════════════
// TIMELINE ENTRIES
// ═══════════════════════════════════════════════════════════

export async function fetchTimeline(): Promise<Record<string, TimelineEntry[]>> {
  const { data, error } = await supabase.from("timeline_entries").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { console.error("[DB] fetchTimeline:", error); return {}; }
  const result: Record<string, TimelineEntry[]> = {};
  for (const row of data ?? []) {
    const entry: TimelineEntry = {
      id: row.id as string,
      clientId: row.client_id as string,
      type: row.type as TimelineEntry["type"],
      actor: row.actor as string,
      description: row.description as string,
      timestamp: row.timestamp as string,
    };
    if (!result[entry.clientId]) result[entry.clientId] = [];
    result[entry.clientId].push(entry);
  }
  return result;
}

export async function insertTimelineEntry(entry: Omit<TimelineEntry, "id">): Promise<void> {
  const { error } = await supabase.from("timeline_entries").insert({
    client_id: entry.clientId,
    type: entry.type,
    actor: entry.actor,
    description: entry.description,
    timestamp: entry.timestamp,
  });
  if (error) console.error("[DB] insertTimelineEntry:", error);
}

// ═══════════════════════════════════════════════════════════
// CLIENT CHATS
// ═══════════════════════════════════════════════════════════

export async function fetchClientChats(): Promise<Record<string, ChatMessage[]>> {
  const { data, error } = await supabase.from("client_chats").select("*").order("created_at");
  if (error) { console.error("[DB] fetchClientChats:", error); return {}; }
  const result: Record<string, ChatMessage[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      user: row.user as string,
      text: row.text as string,
      timestamp: row.timestamp as string,
    });
  }
  return result;
}

export async function insertClientChatMessage(clientId: string, user: string, text: string): Promise<void> {
  const timestamp = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const { error } = await supabase.from("client_chats").insert({
    client_id: clientId, user, text, timestamp,
  });
  if (error) console.error("[DB] insertClientChat:", error);
}

// ═══════════════════════════════════════════════════════════
// GLOBAL CHAT
// ═══════════════════════════════════════════════════════════

export async function fetchGlobalChat(): Promise<GlobalChatMessage[]> {
  const { data, error } = await supabase.from("global_chat").select("*").order("created_at");
  if (error) { console.error("[DB] fetchGlobalChat:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user: row.user as string,
    role: row.role as Role,
    text: row.text as string,
    timestamp: row.timestamp as string,
  }));
}

export async function insertGlobalChatMessage(user: string, role: Role, text: string): Promise<void> {
  const timestamp = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const { error } = await supabase.from("global_chat").insert({
    user, role, text, timestamp,
  });
  if (error) console.error("[DB] insertGlobalChat:", error);
}

// ═══════════════════════════════════════════════════════════
// ONBOARDING ITEMS
// ═══════════════════════════════════════════════════════════

export async function fetchOnboardingItems(): Promise<Record<string, OnboardingItem[]>> {
  const { data, error } = await supabase.from("onboarding_items").select("*").order("sort_order");
  if (error) { console.error("[DB] fetchOnboardingItems:", error); return {}; }
  const result: Record<string, OnboardingItem[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      label: row.label as string,
      completed: (row.completed as boolean) ?? false,
      completedBy: (row.completed_by as string) ?? undefined,
      completedAt: (row.completed_at as string) ?? undefined,
      department: (row.department as OnboardingItem["department"]) ?? undefined,
    });
  }
  return result;
}

export async function insertOnboardingItems(clientId: string, items: Array<{ label: string; sortOrder: number; department?: string }>): Promise<void> {
  const rows = items.map((item) => ({
    client_id: clientId,
    label: item.label,
    sort_order: item.sortOrder,
    department: item.department,
  }));
  const { error } = await supabase.from("onboarding_items").insert(rows);
  if (error) console.error("[DB] insertOnboardingItems:", error);
}

export async function updateOnboardingItemDb(itemId: string, completed: boolean, actor: string): Promise<void> {
  const { error } = await supabase.from("onboarding_items").update({
    completed,
    completed_by: completed ? actor : null,
    completed_at: completed ? new Date().toISOString() : null,
  }).eq("id", itemId);
  if (error) console.error("[DB] updateOnboardingItem:", error);
}

// ═══════════════════════════════════════════════════════════
// MOOD ENTRIES
// ═══════════════════════════════════════════════════════════

export async function fetchMoodEntries(): Promise<Record<string, MoodEntry[]>> {
  const { data, error } = await supabase.from("mood_entries").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchMoodEntries:", error); return {}; }
  const result: Record<string, MoodEntry[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      mood: row.mood as MoodType,
      note: (row.note as string) ?? undefined,
      recordedBy: row.recorded_by as string,
      date: row.date as string,
    });
  }
  return result;
}

export async function insertMoodEntry(clientId: string, mood: MoodType, note: string, actor: string): Promise<void> {
  const { error } = await supabase.from("mood_entries").insert({
    client_id: clientId,
    mood,
    note: note || null,
    recorded_by: actor,
    date: new Date().toISOString().split("T")[0],
  });
  if (error) console.error("[DB] insertMoodEntry:", error);
}

// ═══════════════════════════════════════════════════════════
// CREATIVE ASSETS
// ═══════════════════════════════════════════════════════════

export async function fetchCreativeAssets(): Promise<Record<string, CreativeAsset[]>> {
  const { data, error } = await supabase.from("creative_assets").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchCreativeAssets:", error); return {}; }
  const result: Record<string, CreativeAsset[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      clientId,
      type: row.type as CreativeAsset["type"],
      url: row.url as string,
      label: (row.label as string) ?? undefined,
      uploadedBy: row.uploaded_by as string,
      uploadedAt: row.uploaded_at as string,
    });
  }
  return result;
}

export async function insertCreativeAsset(asset: Omit<CreativeAsset, "id">): Promise<void> {
  const { error } = await supabase.from("creative_assets").insert({
    client_id: asset.clientId,
    type: asset.type,
    url: asset.url,
    label: asset.label,
    uploaded_by: asset.uploadedBy,
    uploaded_at: asset.uploadedAt,
  });
  if (error) console.error("[DB] insertCreativeAsset:", error);
}

// ═══════════════════════════════════════════════════════════
// SOCIAL PROOFS
// ═══════════════════════════════════════════════════════════

export async function fetchSocialProofs(): Promise<Record<string, SocialProofEntry[]>> {
  const { data, error } = await supabase.from("social_proofs").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchSocialProofs:", error); return {}; }
  const result: Record<string, SocialProofEntry[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      clientId,
      metric1Label: row.metric1_label as string,
      metric1Value: row.metric1_value as string,
      metric2Label: row.metric2_label as string,
      metric2Value: row.metric2_value as string,
      metric3Label: row.metric3_label as string,
      metric3Value: row.metric3_value as string,
      period: row.period as string,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
    });
  }
  return result;
}

export async function insertSocialProof(entry: Omit<SocialProofEntry, "id" | "createdAt">): Promise<void> {
  const { error } = await supabase.from("social_proofs").insert({
    client_id: entry.clientId,
    metric1_label: entry.metric1Label,
    metric1_value: entry.metric1Value,
    metric2_label: entry.metric2Label,
    metric2_value: entry.metric2Value,
    metric3_label: entry.metric3Label,
    metric3_value: entry.metric3Value,
    period: entry.period,
    created_by: entry.createdBy,
  });
  if (error) console.error("[DB] insertSocialProof:", error);
}

// ═══════════════════════════════════════════════════════════
// CRISIS NOTES
// ═══════════════════════════════════════════════════════════

export async function fetchCrisisNotes(): Promise<Record<string, CrisisNote[]>> {
  const { data, error } = await supabase.from("crisis_notes").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchCrisisNotes:", error); return {}; }
  const result: Record<string, CrisisNote[]> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      clientId,
      note: row.note as string,
      createdBy: row.created_by as string,
      createdAt: row.created_at as string,
    });
  }
  return result;
}

export async function insertCrisisNote(clientId: string, note: string, actor: string): Promise<void> {
  const { error } = await supabase.from("crisis_notes").insert({
    client_id: clientId, note, created_by: actor,
  });
  if (error) console.error("[DB] insertCrisisNote:", error);
}

// ═══════════════════════════════════════════════════════════
// NOTICES
// ═══════════════════════════════════════════════════════════

export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase.from("notices").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchNotices:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    urgent: (row.urgent as boolean) ?? false,
    scheduledAt: (row.scheduled_at as string) ?? undefined,
    category: (row.category as Notice["category"]) ?? "general",
  }));
}

export async function insertNotice(data: { title: string; body: string; urgent: boolean; createdBy: string; scheduledAt?: string; category?: string }): Promise<void> {
  const { error } = await supabase.from("notices").insert({
    title: data.title,
    body: data.body,
    created_by: data.createdBy,
    urgent: data.urgent,
    scheduled_at: data.scheduledAt,
    category: data.category ?? "general",
  });
  if (error) console.error("[DB] insertNotice:", error);
}

export async function deleteNoticeDb(id: string): Promise<void> {
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) console.error("[DB] deleteNotice:", error);
}

// ═══════════════════════════════════════════════════════════
// QUINZENNIAL REPORTS
// ═══════════════════════════════════════════════════════════

export async function fetchQuinzReports(): Promise<QuinzReport[]> {
  const { data, error } = await supabase.from("quinz_reports").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchQuinzReports:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    period: row.period as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    communicationHealth: (row.communication_health as number) ?? 3,
    clientEngagement: (row.client_engagement as number) ?? 3,
    highlights: (row.highlights as string) ?? "",
    challenges: (row.challenges as string) ?? "",
    nextSteps: (row.next_steps as string) ?? "",
  }));
}

export async function insertQuinzReport(report: Omit<QuinzReport, "id" | "createdAt">): Promise<void> {
  const { error } = await supabase.from("quinz_reports").insert({
    client_id: report.clientId,
    client_name: report.clientName,
    period: report.period,
    created_by: report.createdBy,
    communication_health: report.communicationHealth,
    client_engagement: report.clientEngagement,
    highlights: report.highlights,
    challenges: report.challenges,
    next_steps: report.nextSteps,
  });
  if (error) console.error("[DB] insertQuinzReport:", error);
}

// ═══════════════════════════════════════════════════════════
// CLIENT ACCESS (Credentials Vault)
// ═══════════════════════════════════════════════════════════

export async function fetchClientAccess(): Promise<Record<string, ClientAccess>> {
  const { data, error } = await supabase.from("client_access").select("*");
  if (error) { console.error("[DB] fetchClientAccess:", error); return {}; }
  const result: Record<string, ClientAccess> = {};
  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    result[clientId] = {
      clientId,
      instagramLogin: (row.instagram_login as string) ?? undefined,
      instagramPassword: (row.instagram_password as string) ?? undefined,
      facebookLogin: (row.facebook_login as string) ?? undefined,
      facebookPassword: (row.facebook_password as string) ?? undefined,
      tiktokLogin: (row.tiktok_login as string) ?? undefined,
      tiktokPassword: (row.tiktok_password as string) ?? undefined,
      linkedinLogin: (row.linkedin_login as string) ?? undefined,
      linkedinPassword: (row.linkedin_password as string) ?? undefined,
      youtubeLogin: (row.youtube_login as string) ?? undefined,
      youtubePassword: (row.youtube_password as string) ?? undefined,
      mlabsLogin: (row.mlabs_login as string) ?? undefined,
      mlabsPassword: (row.mlabs_password as string) ?? undefined,
      canvaLink: (row.canva_link as string) ?? undefined,
      driveLink: (row.drive_link as string) ?? undefined,
      otherNotes: (row.other_notes as string) ?? undefined,
      updatedBy: (row.updated_by as string) ?? undefined,
      updatedAt: (row.updated_at as string) ?? undefined,
    };
  }
  return result;
}

export async function upsertClientAccess(clientId: string, access: Partial<ClientAccess>, actor: string): Promise<void> {
  const row: Record<string, unknown> = { client_id: clientId, updated_by: actor, updated_at: new Date().toISOString() };
  if (access.instagramLogin !== undefined) row.instagram_login = access.instagramLogin;
  if (access.instagramPassword !== undefined) row.instagram_password = access.instagramPassword;
  if (access.facebookLogin !== undefined) row.facebook_login = access.facebookLogin;
  if (access.facebookPassword !== undefined) row.facebook_password = access.facebookPassword;
  if (access.tiktokLogin !== undefined) row.tiktok_login = access.tiktokLogin;
  if (access.tiktokPassword !== undefined) row.tiktok_password = access.tiktokPassword;
  if (access.linkedinLogin !== undefined) row.linkedin_login = access.linkedinLogin;
  if (access.linkedinPassword !== undefined) row.linkedin_password = access.linkedinPassword;
  if (access.youtubeLogin !== undefined) row.youtube_login = access.youtubeLogin;
  if (access.youtubePassword !== undefined) row.youtube_password = access.youtubePassword;
  if (access.mlabsLogin !== undefined) row.mlabs_login = access.mlabsLogin;
  if (access.mlabsPassword !== undefined) row.mlabs_password = access.mlabsPassword;
  if (access.canvaLink !== undefined) row.canva_link = access.canvaLink;
  if (access.driveLink !== undefined) row.drive_link = access.driveLink;
  if (access.otherNotes !== undefined) row.other_notes = access.otherNotes;

  const { error } = await supabase.from("client_access").upsert(row, { onConflict: "client_id" });
  if (error) console.error("[DB] upsertClientAccess:", error);
}

// ═══════════════════════════════════════════════════════════
// CARD COMMENTS
// ═══════════════════════════════════════════════════════════

export async function insertCardComment(cardId: string, author: string, text: string): Promise<void> {
  const { error } = await supabase.from("card_comments").insert({
    card_id: cardId, author, text,
  });
  if (error) console.error("[DB] insertCardComment:", error);
}

// ═══════════════════════════════════════════════════════════
// TRAFFIC REPORTS
// ═══════════════════════════════════════════════════════════

export async function fetchTrafficReports(): Promise<TrafficMonthlyReport[]> {
  const { data, error } = await supabase.from("traffic_reports").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchTrafficReports:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    month: row.month as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    messages: (row.messages as number) ?? 0,
    messageCost: Number(row.message_cost ?? 0),
    impressions: (row.impressions as number) ?? 0,
    observations: (row.observations as string) ?? undefined,
  }));
}

export async function insertTrafficReport(report: Omit<TrafficMonthlyReport, "id" | "createdAt">): Promise<void> {
  const { error } = await supabase.from("traffic_reports").insert({
    client_id: report.clientId,
    client_name: report.clientName,
    month: report.month,
    created_by: report.createdBy,
    messages: report.messages,
    message_cost: report.messageCost,
    impressions: report.impressions,
    observations: report.observations,
  });
  if (error) console.error("[DB] insertTrafficReport:", error);
}

export async function updateTrafficReportDb(id: string, updates: Partial<TrafficMonthlyReport>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.messages !== undefined) row.messages = updates.messages;
  if (updates.messageCost !== undefined) row.message_cost = updates.messageCost;
  if (updates.impressions !== undefined) row.impressions = updates.impressions;
  if (updates.observations !== undefined) row.observations = updates.observations;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("traffic_reports").update(row).eq("id", id);
  if (error) console.error("[DB] updateTrafficReport:", error);
}

// ═══════════════════════════════════════════════════════════
// TRAFFIC ROUTINE CHECKS
// ═══════════════════════════════════════════════════════════

export async function fetchTrafficRoutineChecks(): Promise<TrafficRoutineCheck[]> {
  const { data, error } = await supabase.from("traffic_routine_checks").select("*").order("completed_at", { ascending: false });
  if (error) { console.error("[DB] fetchTrafficRoutineChecks:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    date: row.date as string,
    type: row.type as TrafficRoutineCheck["type"],
    completedBy: row.completed_by as string,
    completedAt: (row.completed_at as string) ?? "",
    note: (row.note as string) ?? undefined,
  }));
}

export async function insertTrafficRoutineCheck(check: Omit<TrafficRoutineCheck, "id" | "completedAt">): Promise<void> {
  const { error } = await supabase.from("traffic_routine_checks").insert({
    client_id: check.clientId,
    client_name: check.clientName,
    date: check.date,
    type: check.type,
    completed_by: check.completedBy,
    note: check.note,
  });
  if (error) console.error("[DB] insertTrafficRoutineCheck:", error);
}

// ═══════════════════════════════════════════════════════════
// SOCIAL REPORTS
// ═══════════════════════════════════════════════════════════

export async function fetchSocialReports(): Promise<SocialMonthlyReport[]> {
  const { data, error } = await supabase.from("social_reports").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchSocialReports:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    month: row.month as string,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? "",
    postsPublished: (row.posts_published as number) ?? 0,
    postsGoal: (row.posts_goal as number) ?? 12,
    reelsCount: (row.reels_count as number) ?? 0,
    storiesCount: (row.stories_count as number) ?? 0,
    reach: (row.reach as number) ?? 0,
    impressions: (row.impressions as number) ?? 0,
    engagement: (row.engagement as number) ?? 0,
    engagementRate: Number(row.engagement_rate ?? 0),
    followersGained: (row.followers_gained as number) ?? 0,
    followersLost: (row.followers_lost as number) ?? 0,
    topPost: (row.top_post as string) ?? undefined,
    observations: (row.observations as string) ?? undefined,
  }));
}

export async function insertSocialReport(report: Omit<SocialMonthlyReport, "id" | "createdAt">): Promise<void> {
  const { error } = await supabase.from("social_reports").insert({
    client_id: report.clientId,
    client_name: report.clientName,
    month: report.month,
    created_by: report.createdBy,
    posts_published: report.postsPublished,
    posts_goal: report.postsGoal,
    reels_count: report.reelsCount,
    stories_count: report.storiesCount,
    reach: report.reach,
    impressions: report.impressions,
    engagement: report.engagement,
    engagement_rate: report.engagementRate,
    followers_gained: report.followersGained,
    followers_lost: report.followersLost,
    top_post: report.topPost,
    observations: report.observations,
  });
  if (error) console.error("[DB] insertSocialReport:", error);
}

export async function updateSocialReportDb(id: string, updates: Partial<SocialMonthlyReport>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (updates.postsPublished !== undefined) row.posts_published = updates.postsPublished;
  if (updates.postsGoal !== undefined) row.posts_goal = updates.postsGoal;
  if (updates.reelsCount !== undefined) row.reels_count = updates.reelsCount;
  if (updates.storiesCount !== undefined) row.stories_count = updates.storiesCount;
  if (updates.reach !== undefined) row.reach = updates.reach;
  if (updates.impressions !== undefined) row.impressions = updates.impressions;
  if (updates.engagement !== undefined) row.engagement = updates.engagement;
  if (updates.engagementRate !== undefined) row.engagement_rate = updates.engagementRate;
  if (updates.followersGained !== undefined) row.followers_gained = updates.followersGained;
  if (updates.followersLost !== undefined) row.followers_lost = updates.followersLost;
  if (updates.topPost !== undefined) row.top_post = updates.topPost;
  if (updates.observations !== undefined) row.observations = updates.observations;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("social_reports").update(row).eq("id", id);
  if (error) console.error("[DB] updateSocialReport:", error);
}

// ═══════════════════════════════════════════════════════════
// CONTENT APPROVALS
// ═══════════════════════════════════════════════════════════

export async function fetchContentApprovals(): Promise<ContentApproval[]> {
  const { data, error } = await supabase.from("content_approvals").select("*").order("created_at", { ascending: false });
  if (error) { console.error("[DB] fetchContentApprovals:", error); return []; }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    cardId: row.card_id as string,
    status: (row.status as ContentApproval["status"]) ?? "pending",
    reviewedBy: (row.reviewed_by as string) ?? undefined,
    reviewedAt: (row.reviewed_at as string) ?? undefined,
    reason: (row.reason as string) ?? undefined,
  }));
}

export async function upsertContentApproval(approval: Omit<ContentApproval, "id">): Promise<void> {
  const { error } = await supabase.from("content_approvals").insert({
    card_id: approval.cardId,
    status: approval.status,
    reviewed_by: approval.reviewedBy,
    reviewed_at: approval.reviewedAt,
    reason: approval.reason,
  });
  if (error) console.error("[DB] upsertContentApproval:", error);
}

// ═══════════════════════════════════════════════════════════
// TEAM MEMBERS
// ═══════════════════════════════════════════════════════════

export async function fetchTeamMembers() {
  const { data, error } = await supabase.from("team_members").select("*").eq("is_active", true).order("name");
  if (error) { console.error("[DB] fetchTeamMembers:", error); return []; }
  return data ?? [];
}

export async function insertTeamMember(member: { name: string; email: string; role: string; initials: string }) {
  const { error } = await supabase.from("team_members").insert(member);
  if (error) console.error("[DB] insertTeamMember:", error);
}

// ═══════════════════════════════════════════════════════════
// SNAPSHOTS
// ═══════════════════════════════════════════════════════════

export async function insertSnapshot(snapshot: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("snapshots").insert(snapshot);
  if (error) console.error("[DB] insertSnapshot:", error);
}

export async function fetchSnapshots() {
  const { data, error } = await supabase.from("snapshots").select("*").order("period", { ascending: false }).limit(24);
  if (error) { console.error("[DB] fetchSnapshots:", error); return []; }
  return data ?? [];
}

// ═══════════════════════════════════════════════════════════
// DB availability check
// ═══════════════════════════════════════════════════════════

export async function isDbAvailable(): Promise<boolean> {
  try {
    const { error } = await supabase.from("clients").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
