import { supabase } from "./client";
import type {
  Client,
  Task,
  ContentCard,
  DesignRequest,
  Notice,
  TimelineEntry,
  ChatMessage,
  GlobalChatMessage,
  OnboardingItem,
  MoodEntry,
  CreativeAsset,
  SocialProofEntry,
  CrisisNote,
  AppNotification,
  QuinzReport,
  CardComment,
  ClientAccess,
  TrafficMonthlyReport,
  TrafficRoutineCheck,
  SocialMonthlyReport,
  ContentApproval,
  Role,
} from "@/lib/types";

// ============================================
// Team Members / Auth
// ============================================

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string | null;
  role: Role;
  auth_id: string | null;
  avatar_url: string | null;
  active: boolean;
}

// Name → ID lookup cache (populated on first fetch)
let teamMembersByName: Record<string, string> = {};
let teamMembersById: Record<string, TeamMemberRow> = {};

export async function fetchTeamMembers(): Promise<TeamMemberRow[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  // Cache lookups
  teamMembersByName = {};
  teamMembersById = {};
  (data ?? []).forEach((m: TeamMemberRow) => {
    teamMembersByName[m.name] = m.id;
    teamMembersById[m.id] = m;
  });
  return data ?? [];
}

export function getTeamMemberIdByName(name: string): string | undefined {
  return teamMembersByName[name];
}

export function getTeamMemberById(id: string): TeamMemberRow | undefined {
  return teamMembersById[id];
}

export async function fetchCurrentProfile(authId: string): Promise<TeamMemberRow | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("auth_id", authId)
    .single();
  if (error) return null;
  return data;
}

// ============================================
// Clients
// ============================================

function dbClientToApp(row: Record<string, unknown>): Client {
  const trafficMember = row.assigned_traffic_id ? teamMembersById[row.assigned_traffic_id as string] : null;
  const socialMember = row.assigned_social_id ? teamMembersById[row.assigned_social_id as string] : null;
  const designerMember = row.assigned_designer_id ? teamMembersById[row.assigned_designer_id as string] : null;
  return {
    id: row.id as string,
    name: row.name as string,
    logo: (row.logo as string) || undefined,
    industry: row.industry as string,
    monthlyBudget: Number(row.monthly_budget),
    status: row.status as Client["status"],
    attentionLevel: row.attention_level as Client["attentionLevel"],
    tags: (row.tags as string[]) ?? [],
    assignedTraffic: trafficMember?.name ?? "",
    assignedSocial: socialMember?.name ?? "",
    assignedDesigner: designerMember?.name ?? "",
    lastPostDate: (row.last_post_date as string) || undefined,
    joinDate: row.join_date as string,
    paymentMethod: row.payment_method as Client["paymentMethod"],
    notes: (row.notes as string) || undefined,
    contractEnd: (row.contract_end as string) || undefined,
    toneOfVoice: (row.tone_of_voice as Client["toneOfVoice"]) || undefined,
    driveLink: (row.drive_link as string) || undefined,
    instagramUser: (row.instagram_user as string) || undefined,
    postsThisMonth: (row.posts_this_month as number) ?? 0,
    postsGoal: (row.posts_goal as number) ?? 12,
    lastKanbanActivity: (row.last_kanban_activity as string) || undefined,
    campaignBriefing: (row.campaign_briefing as string) || undefined,
    fixedBriefing: (row.fixed_briefing as string) || undefined,
    metaAdAccountId: (row.meta_ad_account_id as string) || undefined,
    metaAdAccountName: (row.meta_ad_account_name as string) || undefined,
  };
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []).map(dbClientToApp);
}

export async function insertClient(client: Omit<Client, "id">): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: client.name,
      industry: client.industry,
      monthly_budget: client.monthlyBudget,
      status: client.status ?? "onboarding",
      attention_level: client.attentionLevel ?? "medium",
      tags: client.tags ?? [],
      assigned_traffic_id: getTeamMemberIdByName(client.assignedTraffic) ?? null,
      assigned_social_id: getTeamMemberIdByName(client.assignedSocial) ?? null,
      assigned_designer_id: getTeamMemberIdByName(client.assignedDesigner) ?? null,
      payment_method: client.paymentMethod,
      notes: client.notes ?? null,
      join_date: client.joinDate ?? new Date().toISOString().split("T")[0],
    })
    .select()
    .single();
  if (error) throw error;
  return dbClientToApp(data);
}

export async function updateClientDb(id: string, updates: Partial<Client>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.attentionLevel !== undefined) dbUpdates.attention_level = updates.attentionLevel;
  if (updates.monthlyBudget !== undefined) dbUpdates.monthly_budget = updates.monthlyBudget;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.lastPostDate !== undefined) dbUpdates.last_post_date = updates.lastPostDate;
  if (updates.contractEnd !== undefined) dbUpdates.contract_end = updates.contractEnd;
  if (updates.toneOfVoice !== undefined) dbUpdates.tone_of_voice = updates.toneOfVoice;
  if (updates.driveLink !== undefined) dbUpdates.drive_link = updates.driveLink;
  if (updates.instagramUser !== undefined) dbUpdates.instagram_user = updates.instagramUser;
  if (updates.postsThisMonth !== undefined) dbUpdates.posts_this_month = updates.postsThisMonth;
  if (updates.postsGoal !== undefined) dbUpdates.posts_goal = updates.postsGoal;
  if (updates.lastKanbanActivity !== undefined) dbUpdates.last_kanban_activity = updates.lastKanbanActivity;
  if (updates.campaignBriefing !== undefined) dbUpdates.campaign_briefing = updates.campaignBriefing;
  if (updates.fixedBriefing !== undefined) dbUpdates.fixed_briefing = updates.fixedBriefing;
  if (updates.assignedTraffic !== undefined) dbUpdates.assigned_traffic_id = getTeamMemberIdByName(updates.assignedTraffic) ?? null;
  if (updates.assignedSocial !== undefined) dbUpdates.assigned_social_id = getTeamMemberIdByName(updates.assignedSocial) ?? null;
  if (updates.assignedDesigner !== undefined) dbUpdates.assigned_designer_id = getTeamMemberIdByName(updates.assignedDesigner) ?? null;
  if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod;
  if (updates.logo !== undefined) dbUpdates.logo = updates.logo;

  if (Object.keys(dbUpdates).length === 0) return;
  const { error } = await supabase.from("clients").update(dbUpdates).eq("id", id);
  if (error) throw error;
}

// ============================================
// Tasks
// ============================================

function dbTaskToApp(row: Record<string, unknown>): Task {
  const assignee = row.assigned_to ? teamMembersById[row.assigned_to as string] : null;
  const client = row.client_id as string;
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: client,
    clientName: (row as Record<string, unknown>).client_name as string ?? "",
    assignedTo: assignee?.name ?? "",
    role: row.role as Role,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    dueDate: (row.due_date as string) || undefined,
    description: (row.description as string) || undefined,
    attachments: (row.attachments as string[]) ?? [],
  };
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const clientData = row.clients as Record<string, unknown> | null;
    return dbTaskToApp({ ...row, client_name: clientData?.name ?? "" });
  });
}

export async function insertTask(task: Omit<Task, "id">): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: task.title,
      client_id: task.clientId,
      assigned_to: getTeamMemberIdByName(task.assignedTo) ?? null,
      role: task.role,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate ?? null,
      description: task.description ?? null,
      attachments: task.attachments ?? [],
    })
    .select("*, clients(name)")
    .single();
  if (error) throw error;
  const clientData = (data as Record<string, unknown>).clients as Record<string, unknown> | null;
  return dbTaskToApp({ ...data, client_name: clientData?.name ?? "" });
}

export async function updateTaskDb(id: string, updates: Partial<Task>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.assignedTo !== undefined) dbUpdates.assigned_to = getTeamMemberIdByName(updates.assignedTo) ?? null;

  if (Object.keys(dbUpdates).length === 0) return;
  const { error } = await supabase.from("tasks").update(dbUpdates).eq("id", id);
  if (error) throw error;
}

// ============================================
// Content Cards
// ============================================

function dbContentCardToApp(row: Record<string, unknown>): ContentCard {
  const socialMember = row.social_media_id ? teamMembersById[row.social_media_id as string] : null;
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: row.client_id as string,
    clientName: (row as Record<string, unknown>).client_name as string ?? "",
    socialMedia: socialMember?.name ?? "",
    status: row.status as ContentCard["status"],
    priority: row.priority as ContentCard["priority"],
    dueDate: (row.due_date as string) || undefined,
    dueTime: (row.due_time as string) || undefined,
    format: (row.format as string) ?? "",
    platform: (row.platform as ContentCard["platform"]) || undefined,
    briefing: (row.briefing as string) || undefined,
    caption: (row.caption as string) || undefined,
    hashtags: (row.hashtags as string) || undefined,
    imageUrl: (row.image_url as string) || undefined,
    observations: (row.observations as string) || undefined,
    trafficSuggestion: (row.traffic_suggestion as string) || undefined,
    statusChangedAt: (row.status_changed_at as string) || undefined,
    designRequestId: (row.design_request_id as string) || undefined,
    designerDeliveredAt: (row.designer_delivered_at as string) || undefined,
    designerDeliveredBy: row.designer_delivered_by ? (teamMembersById[row.designer_delivered_by as string]?.name ?? undefined) : undefined,
    socialConfirmedAt: (row.social_confirmed_at as string) || undefined,
    socialConfirmedBy: row.social_confirmed_by ? (teamMembersById[row.social_confirmed_by as string]?.name ?? undefined) : undefined,
    nonDeliveryReason: (row.non_delivery_reason as string) || undefined,
    nonDeliveryReportedBy: row.non_delivery_reported_by ? (teamMembersById[row.non_delivery_reported_by as string]?.name ?? undefined) : undefined,
    nonDeliveryReportedAt: (row.non_delivery_reported_at as string) || undefined,
    comments: [],
  };
}

export async function fetchContentCards(): Promise<ContentCard[]> {
  const { data, error } = await supabase
    .from("content_cards")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const cards = (data ?? []).map((row: Record<string, unknown>) => {
    const clientData = row.clients as Record<string, unknown> | null;
    return dbContentCardToApp({ ...row, client_name: clientData?.name ?? "" });
  });

  // Fetch all comments
  const { data: comments, error: commErr } = await supabase
    .from("card_comments")
    .select("*, team_members(name, role)")
    .order("created_at");
  if (!commErr && comments) {
    const commentsByCard: Record<string, CardComment[]> = {};
    comments.forEach((c: Record<string, unknown>) => {
      const cardId = c.card_id as string;
      const member = c.team_members as Record<string, unknown> | null;
      if (!commentsByCard[cardId]) commentsByCard[cardId] = [];
      commentsByCard[cardId].push({
        id: c.id as string,
        author: member?.name as string ?? "",
        role: member?.role as Role ?? "social",
        text: c.text as string,
        createdAt: c.created_at as string,
      });
    });
    cards.forEach((card) => {
      card.comments = commentsByCard[card.id] ?? [];
    });
  }

  return cards;
}

export async function insertContentCard(card: Omit<ContentCard, "id">): Promise<ContentCard> {
  const { data, error } = await supabase
    .from("content_cards")
    .insert({
      title: card.title,
      client_id: card.clientId,
      social_media_id: getTeamMemberIdByName(card.socialMedia) ?? null,
      status: card.status ?? "ideas",
      priority: card.priority,
      due_date: card.dueDate ?? null,
      due_time: card.dueTime ?? null,
      format: card.format,
      platform: card.platform ?? null,
      briefing: card.briefing ?? null,
      caption: card.caption ?? null,
      hashtags: card.hashtags ?? null,
      image_url: card.imageUrl ?? null,
      observations: card.observations ?? null,
      traffic_suggestion: card.trafficSuggestion ?? null,
      status_changed_at: new Date().toISOString(),
      design_request_id: card.designRequestId ?? null,
    })
    .select("*, clients(name)")
    .single();
  if (error) throw error;
  const clientData = (data as Record<string, unknown>).clients as Record<string, unknown> | null;
  return dbContentCardToApp({ ...data, client_name: clientData?.name ?? "" });
}

export async function updateContentCardDb(id: string, updates: Partial<ContentCard>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.status !== undefined) { dbUpdates.status = updates.status; dbUpdates.status_changed_at = new Date().toISOString(); }
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.dueTime !== undefined) dbUpdates.due_time = updates.dueTime;
  if (updates.format !== undefined) dbUpdates.format = updates.format;
  if (updates.platform !== undefined) dbUpdates.platform = updates.platform;
  if (updates.briefing !== undefined) dbUpdates.briefing = updates.briefing;
  if (updates.caption !== undefined) dbUpdates.caption = updates.caption;
  if (updates.hashtags !== undefined) dbUpdates.hashtags = updates.hashtags;
  if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
  if (updates.observations !== undefined) dbUpdates.observations = updates.observations;
  if (updates.trafficSuggestion !== undefined) dbUpdates.traffic_suggestion = updates.trafficSuggestion;
  if (updates.designRequestId !== undefined) dbUpdates.design_request_id = updates.designRequestId;
  if (updates.designerDeliveredAt !== undefined) dbUpdates.designer_delivered_at = updates.designerDeliveredAt;
  if (updates.designerDeliveredBy !== undefined) dbUpdates.designer_delivered_by = getTeamMemberIdByName(updates.designerDeliveredBy) ?? null;
  if (updates.socialConfirmedAt !== undefined) dbUpdates.social_confirmed_at = updates.socialConfirmedAt;
  if (updates.socialConfirmedBy !== undefined) dbUpdates.social_confirmed_by = getTeamMemberIdByName(updates.socialConfirmedBy) ?? null;
  if (updates.nonDeliveryReason !== undefined) dbUpdates.non_delivery_reason = updates.nonDeliveryReason;
  if (updates.nonDeliveryReportedBy !== undefined) dbUpdates.non_delivery_reported_by = getTeamMemberIdByName(updates.nonDeliveryReportedBy) ?? null;
  if (updates.nonDeliveryReportedAt !== undefined) dbUpdates.non_delivery_reported_at = updates.nonDeliveryReportedAt;
  if (updates.socialMedia !== undefined) dbUpdates.social_media_id = getTeamMemberIdByName(updates.socialMedia) ?? null;

  if (Object.keys(dbUpdates).length === 0) return;
  const { error } = await supabase.from("content_cards").update(dbUpdates).eq("id", id);
  if (error) throw error;
}

export async function insertCardComment(cardId: string, authorName: string, text: string): Promise<CardComment> {
  const authorId = getTeamMemberIdByName(authorName);
  const { data, error } = await supabase
    .from("card_comments")
    .insert({ card_id: cardId, author_id: authorId!, text })
    .select("*, team_members(name, role)")
    .single();
  if (error) throw error;
  const member = (data as Record<string, unknown>).team_members as Record<string, unknown> | null;
  return {
    id: data.id,
    author: member?.name as string ?? authorName,
    role: member?.role as Role ?? "social",
    text: data.text,
    createdAt: data.created_at,
  };
}

// ============================================
// Design Requests
// ============================================

function dbDesignRequestToApp(row: Record<string, unknown>): DesignRequest {
  const requester = row.requested_by ? teamMembersById[row.requested_by as string] : null;
  return {
    id: row.id as string,
    title: row.title as string,
    clientId: row.client_id as string,
    clientName: (row as Record<string, unknown>).client_name as string ?? "",
    requestedBy: requester?.name ?? "",
    priority: row.priority as DesignRequest["priority"],
    status: row.status as DesignRequest["status"],
    format: (row.format as string) ?? "",
    briefing: (row.briefing as string) ?? "",
    attachments: (row.attachments as string[]) ?? [],
    deadline: (row.deadline as string) || undefined,
  };
}

export async function fetchDesignRequests(): Promise<DesignRequest[]> {
  const { data, error } = await supabase
    .from("design_requests")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const clientData = row.clients as Record<string, unknown> | null;
    return dbDesignRequestToApp({ ...row, client_name: clientData?.name ?? "" });
  });
}

export async function insertDesignRequest(req: Omit<DesignRequest, "id">): Promise<DesignRequest> {
  const { data, error } = await supabase
    .from("design_requests")
    .insert({
      title: req.title,
      client_id: req.clientId,
      requested_by: getTeamMemberIdByName(req.requestedBy) ?? null!,
      priority: req.priority,
      status: req.status ?? "queued",
      format: req.format,
      briefing: req.briefing,
      attachments: req.attachments ?? [],
      deadline: req.deadline ?? null,
    })
    .select("*, clients(name)")
    .single();
  if (error) throw error;
  const clientData = (data as Record<string, unknown>).clients as Record<string, unknown> | null;
  return dbDesignRequestToApp({ ...data, client_name: clientData?.name ?? "" });
}

export async function updateDesignRequestDb(id: string, updates: Partial<DesignRequest>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.format !== undefined) dbUpdates.format = updates.format;
  if (updates.briefing !== undefined) dbUpdates.briefing = updates.briefing;
  if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline;

  if (Object.keys(dbUpdates).length === 0) return;
  const { error } = await supabase.from("design_requests").update(dbUpdates).eq("id", id);
  if (error) throw error;
}

// ============================================
// Notices
// ============================================

function dbNoticeToApp(row: Record<string, unknown>): Notice {
  const creator = row.created_by ? teamMembersById[row.created_by as string] : null;
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    createdBy: creator?.name ?? "",
    createdAt: row.created_at as string,
    urgent: row.urgent as boolean,
    scheduledAt: (row.scheduled_at as string) || undefined,
    category: (row.category as Notice["category"]) || undefined,
  };
}

export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase
    .from("notices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(dbNoticeToApp);
}

export async function insertNotice(notice: { title: string; body: string; urgent: boolean; createdBy: string; scheduledAt?: string; category?: Notice["category"] }): Promise<Notice> {
  const { data, error } = await supabase
    .from("notices")
    .insert({
      title: notice.title,
      body: notice.body,
      urgent: notice.urgent,
      created_by: getTeamMemberIdByName(notice.createdBy) ?? null!,
      scheduled_at: notice.scheduledAt ?? null,
      category: notice.category ?? "general",
    })
    .select()
    .single();
  if (error) throw error;
  return dbNoticeToApp(data);
}

export async function deleteNoticeDb(id: string): Promise<void> {
  const { error } = await supabase.from("notices").delete().eq("id", id);
  if (error) throw error;
}

// ============================================
// Timeline Entries
// ============================================

function dbTimelineToApp(row: Record<string, unknown>): TimelineEntry {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    type: row.type as TimelineEntry["type"],
    actor: row.actor_name as string,
    description: row.description as string,
    timestamp: row.created_at as string,
  };
}

export async function fetchTimeline(): Promise<Record<string, TimelineEntry[]>> {
  const { data, error } = await supabase
    .from("timeline_entries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const result: Record<string, TimelineEntry[]> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const entry = dbTimelineToApp(row);
    if (!result[entry.clientId]) result[entry.clientId] = [];
    result[entry.clientId].push(entry);
  });
  return result;
}

export async function insertTimelineEntry(entry: Omit<TimelineEntry, "id">): Promise<TimelineEntry> {
  const { data, error } = await supabase
    .from("timeline_entries")
    .insert({
      client_id: entry.clientId,
      type: entry.type,
      actor_id: getTeamMemberIdByName(entry.actor) ?? null,
      actor_name: entry.actor,
      description: entry.description,
    })
    .select()
    .single();
  if (error) throw error;
  return dbTimelineToApp(data);
}

// ============================================
// Client Chat Messages
// ============================================

export async function fetchClientChats(): Promise<Record<string, ChatMessage[]>> {
  const { data, error } = await supabase
    .from("client_chat_messages")
    .select("*")
    .order("created_at");
  if (error) throw error;
  const result: Record<string, ChatMessage[]> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    result[clientId].push({
      id: row.id as string,
      user: row.user_name as string,
      text: row.text as string,
      timestamp: row.created_at as string,
    });
  });
  return result;
}

export async function insertClientChatMessage(clientId: string, userName: string, text: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("client_chat_messages")
    .insert({
      client_id: clientId,
      user_id: getTeamMemberIdByName(userName) ?? null,
      user_name: userName,
      text,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    user: data.user_name,
    text: data.text,
    timestamp: data.created_at,
  };
}

// ============================================
// Global Chat Messages
// ============================================

export async function fetchGlobalChat(): Promise<GlobalChatMessage[]> {
  const { data, error } = await supabase
    .from("global_chat_messages")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    user: row.user_name as string,
    role: row.user_role as Role,
    text: row.text as string,
    timestamp: row.created_at as string,
  }));
}

export async function insertGlobalChatMessage(userName: string, role: Role, text: string): Promise<GlobalChatMessage> {
  const { data, error } = await supabase
    .from("global_chat_messages")
    .insert({
      user_id: getTeamMemberIdByName(userName) ?? null,
      user_name: userName,
      user_role: role,
      text,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    user: data.user_name,
    role: data.user_role as Role,
    text: data.text,
    timestamp: data.created_at,
  };
}

// ============================================
// Onboarding Items
// ============================================

export async function fetchOnboardingItems(): Promise<Record<string, OnboardingItem[]>> {
  const { data, error } = await supabase
    .from("onboarding_items")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  const result: Record<string, OnboardingItem[]> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    const completedMember = row.completed_by ? teamMembersById[row.completed_by as string] : null;
    result[clientId].push({
      id: row.id as string,
      label: row.label as string,
      completed: row.completed as boolean,
      completedBy: completedMember?.name,
      completedAt: (row.completed_at as string) || undefined,
    });
  });
  return result;
}

export async function insertOnboardingItems(clientId: string, items: { label: string; sortOrder: number }[]): Promise<OnboardingItem[]> {
  const rows = items.map((item) => ({
    client_id: clientId,
    label: item.label,
    completed: false,
    sort_order: item.sortOrder,
  }));
  const { data, error } = await supabase
    .from("onboarding_items")
    .insert(rows)
    .select();
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    label: row.label as string,
    completed: false,
  }));
}

export async function updateOnboardingItemDb(id: string, completed: boolean, actorName: string): Promise<void> {
  const { error } = await supabase
    .from("onboarding_items")
    .update({
      completed,
      completed_by: completed ? (getTeamMemberIdByName(actorName) ?? null) : null,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw error;
}

// ============================================
// Mood Entries
// ============================================

export async function fetchMoodEntries(): Promise<Record<string, MoodEntry[]>> {
  const { data, error } = await supabase
    .from("mood_entries")
    .select("*")
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  const result: Record<string, MoodEntry[]> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    const recorder = row.recorded_by ? teamMembersById[row.recorded_by as string] : null;
    result[clientId].push({
      id: row.id as string,
      mood: row.mood as MoodEntry["mood"],
      note: (row.note as string) || undefined,
      recordedBy: recorder?.name ?? "",
      date: (row.recorded_at as string).split("T")[0],
    });
  });
  return result;
}

export async function insertMoodEntry(clientId: string, mood: MoodEntry["mood"], note: string, actorName: string): Promise<MoodEntry> {
  const { data, error } = await supabase
    .from("mood_entries")
    .insert({
      client_id: clientId,
      mood,
      note: note || null,
      recorded_by: getTeamMemberIdByName(actorName) ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    mood: data.mood,
    note: data.note || undefined,
    recordedBy: actorName,
    date: data.recorded_at.split("T")[0],
  };
}

// ============================================
// Creative Assets
// ============================================

export async function fetchCreativeAssets(): Promise<Record<string, CreativeAsset[]>> {
  const { data, error } = await supabase
    .from("creative_assets")
    .select("*")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  const result: Record<string, CreativeAsset[]> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    const uploader = row.uploaded_by ? teamMembersById[row.uploaded_by as string] : null;
    result[clientId].push({
      id: row.id as string,
      clientId,
      type: row.type as CreativeAsset["type"],
      url: row.url as string,
      label: (row.label as string) || undefined,
      uploadedBy: uploader?.name ?? "",
      uploadedAt: row.uploaded_at as string,
    });
  });
  return result;
}

export async function insertCreativeAsset(asset: Omit<CreativeAsset, "id">): Promise<CreativeAsset> {
  const { data, error } = await supabase
    .from("creative_assets")
    .insert({
      client_id: asset.clientId,
      type: asset.type,
      url: asset.url,
      label: asset.label ?? null,
      uploaded_by: getTeamMemberIdByName(asset.uploadedBy) ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    clientId: data.client_id,
    type: data.type,
    url: data.url,
    label: data.label || undefined,
    uploadedBy: asset.uploadedBy,
    uploadedAt: data.uploaded_at,
  };
}

// ============================================
// Social Proof Entries
// ============================================

export async function fetchSocialProofs(): Promise<Record<string, SocialProofEntry[]>> {
  const { data, error } = await supabase
    .from("social_proof_entries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const result: Record<string, SocialProofEntry[]> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    const creator = row.created_by ? teamMembersById[row.created_by as string] : null;
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
      createdBy: creator?.name ?? "",
      createdAt: row.created_at as string,
    });
  });
  return result;
}

export async function insertSocialProof(entry: Omit<SocialProofEntry, "id" | "createdAt">): Promise<SocialProofEntry> {
  const { data, error } = await supabase
    .from("social_proof_entries")
    .insert({
      client_id: entry.clientId,
      metric1_label: entry.metric1Label,
      metric1_value: entry.metric1Value,
      metric2_label: entry.metric2Label,
      metric2_value: entry.metric2Value,
      metric3_label: entry.metric3Label,
      metric3_value: entry.metric3Value,
      period: entry.period,
      created_by: getTeamMemberIdByName(entry.createdBy) ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    clientId: data.client_id,
    metric1Label: data.metric1_label,
    metric1Value: data.metric1_value,
    metric2Label: data.metric2_label,
    metric2Value: data.metric2_value,
    metric3Label: data.metric3_label,
    metric3Value: data.metric3_value,
    period: data.period,
    createdBy: entry.createdBy,
    createdAt: data.created_at,
  };
}

// ============================================
// Crisis Notes
// ============================================

export async function fetchCrisisNotes(): Promise<Record<string, CrisisNote[]>> {
  const { data, error } = await supabase
    .from("crisis_notes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const result: Record<string, CrisisNote[]> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const clientId = row.client_id as string;
    if (!result[clientId]) result[clientId] = [];
    const creator = row.created_by ? teamMembersById[row.created_by as string] : null;
    result[clientId].push({
      id: row.id as string,
      clientId,
      note: row.note as string,
      createdBy: creator?.name ?? "",
      createdAt: row.created_at as string,
    });
  });
  return result;
}

export async function insertCrisisNote(clientId: string, note: string, actorName: string): Promise<CrisisNote> {
  const { data, error } = await supabase
    .from("crisis_notes")
    .insert({
      client_id: clientId,
      note,
      created_by: getTeamMemberIdByName(actorName) ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    clientId: data.client_id,
    note: data.note,
    createdBy: actorName,
    createdAt: data.created_at,
  };
}

// ============================================
// Notifications
// ============================================

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: row.type as AppNotification["type"],
    title: row.title as string,
    body: row.body as string,
    clientId: (row.client_id as string) || undefined,
    read: row.read as boolean,
    createdAt: row.created_at as string,
  }));
}

export async function insertNotification(notif: { type: AppNotification["type"]; title: string; body: string; clientId?: string }): Promise<AppNotification> {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      type: notif.type,
      title: notif.title,
      body: notif.body,
      client_id: notif.clientId ?? null,
      user_id: null, // broadcast to all
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    type: data.type,
    title: data.title,
    body: data.body,
    clientId: data.client_id || undefined,
    read: false,
    createdAt: data.created_at,
  };
}

export async function markNotificationReadDb(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsReadDb(): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("read", false);
  if (error) throw error;
}

// ============================================
// Quinz Reports
// ============================================

export async function fetchQuinzReports(): Promise<QuinzReport[]> {
  const { data, error } = await supabase
    .from("quinz_reports")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const clientData = row.clients as Record<string, unknown> | null;
    const creator = row.created_by ? teamMembersById[row.created_by as string] : null;
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      clientName: clientData?.name as string ?? "",
      period: row.period as string,
      createdBy: creator?.name ?? "",
      createdAt: row.created_at as string,
      communicationHealth: row.communication_health as number,
      clientEngagement: row.client_engagement as number,
      highlights: row.highlights as string,
      challenges: row.challenges as string,
      nextSteps: row.next_steps as string,
    };
  });
}

export async function insertQuinzReport(report: Omit<QuinzReport, "id" | "createdAt">): Promise<QuinzReport> {
  const { data, error } = await supabase
    .from("quinz_reports")
    .insert({
      client_id: report.clientId,
      period: report.period,
      created_by: getTeamMemberIdByName(report.createdBy) ?? null!,
      communication_health: report.communicationHealth,
      client_engagement: report.clientEngagement,
      highlights: report.highlights,
      challenges: report.challenges,
      next_steps: report.nextSteps,
    })
    .select("*, clients(name)")
    .single();
  if (error) throw error;
  const clientData = (data as Record<string, unknown>).clients as Record<string, unknown> | null;
  return {
    id: data.id,
    clientId: data.client_id,
    clientName: clientData?.name as string ?? "",
    period: data.period,
    createdBy: report.createdBy,
    createdAt: data.created_at,
    communicationHealth: data.communication_health,
    clientEngagement: data.client_engagement,
    highlights: data.highlights,
    challenges: data.challenges,
    nextSteps: data.next_steps,
  };
}

// ============================================
// Client Access (Credentials)
// ============================================

export async function fetchClientAccess(): Promise<Record<string, ClientAccess>> {
  const { data, error } = await supabase.from("client_access").select("*");
  if (error) throw error;
  const result: Record<string, ClientAccess> = {};
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const clientId = row.client_id as string;
    const updater = row.updated_by ? teamMembersById[row.updated_by as string] : null;
    result[clientId] = {
      clientId,
      instagramLogin: (row.instagram_login as string) || undefined,
      instagramPassword: (row.instagram_password as string) || undefined,
      facebookLogin: (row.facebook_login as string) || undefined,
      facebookPassword: (row.facebook_password as string) || undefined,
      tiktokLogin: (row.tiktok_login as string) || undefined,
      tiktokPassword: (row.tiktok_password as string) || undefined,
      linkedinLogin: (row.linkedin_login as string) || undefined,
      linkedinPassword: (row.linkedin_password as string) || undefined,
      youtubeLogin: (row.youtube_login as string) || undefined,
      youtubePassword: (row.youtube_password as string) || undefined,
      mlabsLogin: (row.mlabs_login as string) || undefined,
      mlabsPassword: (row.mlabs_password as string) || undefined,
      canvaLink: (row.canva_link as string) || undefined,
      driveLink: (row.drive_link as string) || undefined,
      otherNotes: (row.other_notes as string) || undefined,
      updatedBy: updater?.name,
      updatedAt: (row.updated_at as string) || undefined,
    };
  });
  return result;
}

export async function upsertClientAccess(clientId: string, access: Partial<ClientAccess>, actorName: string): Promise<void> {
  const dbData: Record<string, unknown> = { client_id: clientId, updated_by: getTeamMemberIdByName(actorName) ?? null };
  if (access.instagramLogin !== undefined) dbData.instagram_login = access.instagramLogin;
  if (access.instagramPassword !== undefined) dbData.instagram_password = access.instagramPassword;
  if (access.facebookLogin !== undefined) dbData.facebook_login = access.facebookLogin;
  if (access.facebookPassword !== undefined) dbData.facebook_password = access.facebookPassword;
  if (access.tiktokLogin !== undefined) dbData.tiktok_login = access.tiktokLogin;
  if (access.tiktokPassword !== undefined) dbData.tiktok_password = access.tiktokPassword;
  if (access.linkedinLogin !== undefined) dbData.linkedin_login = access.linkedinLogin;
  if (access.linkedinPassword !== undefined) dbData.linkedin_password = access.linkedinPassword;
  if (access.youtubeLogin !== undefined) dbData.youtube_login = access.youtubeLogin;
  if (access.youtubePassword !== undefined) dbData.youtube_password = access.youtubePassword;
  if (access.mlabsLogin !== undefined) dbData.mlabs_login = access.mlabsLogin;
  if (access.mlabsPassword !== undefined) dbData.mlabs_password = access.mlabsPassword;
  if (access.canvaLink !== undefined) dbData.canva_link = access.canvaLink;
  if (access.driveLink !== undefined) dbData.drive_link = access.driveLink;
  if (access.otherNotes !== undefined) dbData.other_notes = access.otherNotes;

  const { error } = await supabase
    .from("client_access")
    .upsert(dbData, { onConflict: "client_id" });
  if (error) throw error;
}

// ============================================
// Traffic Monthly Reports
// ============================================

export async function fetchTrafficReports(): Promise<TrafficMonthlyReport[]> {
  const { data, error } = await supabase
    .from("traffic_monthly_reports")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const clientData = row.clients as Record<string, unknown> | null;
    const creator = row.created_by ? teamMembersById[row.created_by as string] : null;
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      clientName: clientData?.name as string ?? "",
      month: row.month as string,
      createdBy: creator?.name ?? "",
      createdAt: row.created_at as string,
      messages: row.messages as number,
      messageCost: Number(row.message_cost),
      impressions: row.impressions as number,
      observations: (row.observations as string) || undefined,
    };
  });
}

export async function insertTrafficReport(report: Omit<TrafficMonthlyReport, "id" | "createdAt">): Promise<TrafficMonthlyReport> {
  const { data, error } = await supabase
    .from("traffic_monthly_reports")
    .insert({
      client_id: report.clientId,
      month: report.month,
      created_by: getTeamMemberIdByName(report.createdBy) ?? null,
      messages: report.messages,
      message_cost: report.messageCost,
      impressions: report.impressions,
      observations: report.observations ?? null,
    })
    .select("*, clients(name)")
    .single();
  if (error) throw error;
  const clientData = (data as Record<string, unknown>).clients as Record<string, unknown> | null;
  return {
    id: data.id,
    clientId: data.client_id,
    clientName: clientData?.name as string ?? "",
    month: data.month,
    createdBy: report.createdBy,
    createdAt: data.created_at,
    messages: data.messages,
    messageCost: Number(data.message_cost),
    impressions: data.impressions,
    observations: data.observations || undefined,
  };
}

export async function updateTrafficReportDb(id: string, updates: Partial<TrafficMonthlyReport>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.messages !== undefined) dbUpdates.messages = updates.messages;
  if (updates.messageCost !== undefined) dbUpdates.message_cost = updates.messageCost;
  if (updates.impressions !== undefined) dbUpdates.impressions = updates.impressions;
  if (updates.observations !== undefined) dbUpdates.observations = updates.observations;

  if (Object.keys(dbUpdates).length === 0) return;
  const { error } = await supabase.from("traffic_monthly_reports").update(dbUpdates).eq("id", id);
  if (error) throw error;
}

// ============================================
// Traffic Routine Checks
// ============================================

export async function fetchTrafficRoutineChecks(): Promise<TrafficRoutineCheck[]> {
  const { data, error } = await supabase
    .from("traffic_routine_checks")
    .select("*, clients(name)")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const clientData = row.clients as Record<string, unknown> | null;
    const completer = row.completed_by ? teamMembersById[row.completed_by as string] : null;
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      clientName: clientData?.name as string ?? "",
      date: row.date as string,
      type: row.type as TrafficRoutineCheck["type"],
      completedBy: completer?.name ?? "",
      completedAt: row.completed_at as string,
      note: (row.note as string) || undefined,
    };
  });
}

export async function insertTrafficRoutineCheck(check: Omit<TrafficRoutineCheck, "id" | "completedAt">): Promise<TrafficRoutineCheck> {
  const { data, error } = await supabase
    .from("traffic_routine_checks")
    .insert({
      client_id: check.clientId,
      date: check.date,
      type: check.type,
      completed_by: getTeamMemberIdByName(check.completedBy) ?? null,
      note: check.note ?? null,
    })
    .select("*, clients(name)")
    .single();
  if (error) throw error;
  const clientData = (data as Record<string, unknown>).clients as Record<string, unknown> | null;
  return {
    id: data.id,
    clientId: data.client_id,
    clientName: clientData?.name as string ?? "",
    date: data.date,
    type: data.type,
    completedBy: check.completedBy,
    completedAt: data.completed_at,
    note: data.note || undefined,
  };
}

// ============================================
// Social Monthly Reports
// ============================================

export async function fetchSocialReports(): Promise<SocialMonthlyReport[]> {
  const { data, error } = await supabase
    .from("social_monthly_reports")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const clientData = row.clients as Record<string, unknown> | null;
    const creator = row.created_by ? teamMembersById[row.created_by as string] : null;
    return {
      id: row.id as string,
      clientId: row.client_id as string,
      clientName: clientData?.name as string ?? "",
      month: row.month as string,
      createdBy: creator?.name ?? "",
      createdAt: row.created_at as string,
      postsPublished: row.posts_published as number,
      postsGoal: row.posts_goal as number,
      reelsCount: row.reels_count as number,
      storiesCount: row.stories_count as number,
      reach: row.reach as number,
      impressions: row.impressions as number,
      engagement: row.engagement as number,
      engagementRate: Number(row.engagement_rate),
      followersGained: row.followers_gained as number,
      followersLost: row.followers_lost as number,
      topPost: (row.top_post as string) || undefined,
      observations: (row.observations as string) || undefined,
    };
  });
}

export async function insertSocialReport(report: Omit<SocialMonthlyReport, "id" | "createdAt">): Promise<SocialMonthlyReport> {
  const { data, error } = await supabase
    .from("social_monthly_reports")
    .insert({
      client_id: report.clientId,
      month: report.month,
      created_by: getTeamMemberIdByName(report.createdBy) ?? null,
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
      top_post: report.topPost ?? null,
      observations: report.observations ?? null,
    })
    .select("*, clients(name)")
    .single();
  if (error) throw error;
  const clientData = (data as Record<string, unknown>).clients as Record<string, unknown> | null;
  return {
    id: data.id,
    clientId: data.client_id,
    clientName: clientData?.name as string ?? "",
    month: data.month,
    createdBy: report.createdBy,
    createdAt: data.created_at,
    postsPublished: data.posts_published,
    postsGoal: data.posts_goal,
    reelsCount: data.reels_count,
    storiesCount: data.stories_count,
    reach: data.reach,
    impressions: data.impressions,
    engagement: data.engagement,
    engagementRate: Number(data.engagement_rate),
    followersGained: data.followers_gained,
    followersLost: data.followers_lost,
    topPost: data.top_post || undefined,
    observations: data.observations || undefined,
  };
}

export async function updateSocialReportDb(id: string, updates: Partial<SocialMonthlyReport>): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.postsPublished !== undefined) dbUpdates.posts_published = updates.postsPublished;
  if (updates.postsGoal !== undefined) dbUpdates.posts_goal = updates.postsGoal;
  if (updates.reelsCount !== undefined) dbUpdates.reels_count = updates.reelsCount;
  if (updates.storiesCount !== undefined) dbUpdates.stories_count = updates.storiesCount;
  if (updates.reach !== undefined) dbUpdates.reach = updates.reach;
  if (updates.impressions !== undefined) dbUpdates.impressions = updates.impressions;
  if (updates.engagement !== undefined) dbUpdates.engagement = updates.engagement;
  if (updates.engagementRate !== undefined) dbUpdates.engagement_rate = updates.engagementRate;
  if (updates.followersGained !== undefined) dbUpdates.followers_gained = updates.followersGained;
  if (updates.followersLost !== undefined) dbUpdates.followers_lost = updates.followersLost;
  if (updates.topPost !== undefined) dbUpdates.top_post = updates.topPost;
  if (updates.observations !== undefined) dbUpdates.observations = updates.observations;

  if (Object.keys(dbUpdates).length === 0) return;
  const { error } = await supabase.from("social_monthly_reports").update(dbUpdates).eq("id", id);
  if (error) throw error;
}

// ============================================
// Content Approvals
// ============================================

export async function fetchContentApprovals(): Promise<ContentApproval[]> {
  const { data, error } = await supabase
    .from("content_approvals")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const reviewer = row.reviewed_by ? teamMembersById[row.reviewed_by as string] : null;
    return {
      id: row.id as string,
      cardId: row.card_id as string,
      status: row.status as ContentApproval["status"],
      reviewedBy: reviewer?.name,
      reviewedAt: (row.reviewed_at as string) || undefined,
      reason: (row.reason as string) || undefined,
    };
  });
}

export async function upsertContentApproval(approval: Omit<ContentApproval, "id">): Promise<ContentApproval> {
  const { data, error } = await supabase
    .from("content_approvals")
    .insert({
      card_id: approval.cardId,
      status: approval.status,
      reviewed_by: approval.reviewedBy ? (getTeamMemberIdByName(approval.reviewedBy) ?? null) : null,
      reviewed_at: approval.reviewedAt ?? null,
      reason: approval.reason ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    cardId: data.card_id,
    status: data.status,
    reviewedBy: approval.reviewedBy,
    reviewedAt: data.reviewed_at || undefined,
    reason: data.reason || undefined,
  };
}
